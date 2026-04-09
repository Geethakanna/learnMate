import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Validate auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');

    if (!openaiApiKey) {
      return new Response(
        JSON.stringify({ error: 'OpenAI API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use anon key with user JWT to enforce RLS
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Extract userId from JWT instead of trusting client
    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const userId = claimsData.claims.sub;

    const { documentId, questionCount = 10, userLevel } = await req.json();
    
    if (!documentId) {
      return new Response(
        JSON.stringify({ error: 'Document ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Resolve effective level
    let effectiveLevel = userLevel || "Beginner";
    try {
      const { data: levelData } = await supabase
        .from("document_user_levels")
        .select("actual_level")
        .eq("user_id", userId)
        .eq("document_id", documentId)
        .maybeSingle();
      if (levelData?.actual_level) effectiveLevel = levelData.actual_level;
    } catch {}

    console.log(`Generating quiz at ${effectiveLevel} level for document ${documentId}`);

    // Get document info — RLS enforced, user can only access own documents
    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('title, content')
      .eq('id', documentId)
      .single();

    if (docError || !document) {
      return new Response(
        JSON.stringify({ error: 'Document not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get document chunks for context — RLS enforced
    const { data: chunks, error: chunksError } = await supabase
      .from('document_chunks')
      .select('content')
      .eq('document_id', documentId)
      .order('chunk_index', { ascending: true })
      .limit(10);

    if (chunksError) {
      console.error('Error fetching chunks:', chunksError);
    }

    const content = chunks?.map(c => c.content).join('\n\n') || document.content || '';
    const truncatedContent = content.substring(0, 8000);
    
    console.log(`Using ${truncatedContent.length} characters of content`);

    // Auto-detect OpenRouter vs OpenAI
    const isOpenRouter = openaiApiKey.startsWith("sk-or-");
    const apiUrl = isOpenRouter 
      ? "https://openrouter.ai/api/v1/chat/completions" 
      : "https://api.openai.com/v1/chat/completions";
    const model = isOpenRouter ? "openai/gpt-4o-mini" : "gpt-4o-mini";

    console.log(`Using ${isOpenRouter ? 'OpenRouter' : 'OpenAI'} API with model: ${model}`);

    const levelInstructions = effectiveLevel === "Beginner"
      ? "Create EASY questions that test basic recall and definitions. Use simple, clear language. Include obvious distractors."
      : effectiveLevel === "Intermediate"
      ? "Create MODERATE questions that test understanding of concepts and their relationships. Include plausible distractors."
      : "Create HARD questions that test deep understanding, edge cases, and ability to apply concepts. Use subtle distractors that require careful reasoning.";

    const prompt = `Based on the following document content, generate exactly ${questionCount} multiple-choice quiz questions.

Difficulty level: ${effectiveLevel}
${levelInstructions}

For each question, provide:
1. A clear question
2. Exactly 4 answer options (A, B, C, D)
3. The index of the correct answer (0 for A, 1 for B, 2 for C, 3 for D)
4. A brief explanation of why the correct answer is right

Return ONLY a valid JSON array with this exact structure:
[
  {
    "question": "Question text here?",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correct_answer": 0,
    "explanation": "Brief explanation here"
  }
]

Document content:
${truncatedContent}`;

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
        ...(isOpenRouter && { 'HTTP-Referer': supabaseUrl }),
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: 'You are an expert educator creating quiz questions. Always respond with valid JSON only, no markdown formatting or code blocks.'
          },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 3000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI API error:', errorText);
      return new Response(
        JSON.stringify({ error: 'Failed to generate quiz questions' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const aiResponse = await response.json();
    let questionsText = aiResponse.choices[0]?.message?.content || '';
    
    // Clean up response
    questionsText = questionsText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    
    let questions;
    try {
      questions = JSON.parse(questionsText);
    } catch (parseError) {
      console.error('Failed to parse questions:', questionsText);
      return new Response(
        JSON.stringify({ error: 'Failed to parse quiz questions' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create quiz record with JWT-validated userId
    const { data: quiz, error: quizError } = await supabase
      .from('quizzes')
      .insert({
        user_id: userId,
        document_id: documentId,
        title: `Quiz: ${document.title}`,
      })
      .select()
      .single();

    if (quizError) {
      console.error('Error creating quiz:', quizError);
      return new Response(
        JSON.stringify({ error: 'Failed to create quiz' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Insert questions
    const questionsToInsert = questions.map((q: any) => ({
      quiz_id: quiz.id,
      question: q.question,
      options: q.options,
      correct_answer: q.correct_answer,
      explanation: q.explanation,
    }));

    const { error: insertError } = await supabase
      .from('quiz_questions')
      .insert(questionsToInsert);

    if (insertError) {
      console.error('Error inserting questions:', insertError);
      return new Response(
        JSON.stringify({ error: 'Failed to save quiz questions' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Successfully generated quiz with ${questions.length} questions`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        quiz_id: quiz.id,
        question_count: questions.length 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error in generate-quiz:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
