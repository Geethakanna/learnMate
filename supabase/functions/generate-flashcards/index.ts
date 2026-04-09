import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");

    if (!openaiApiKey) {
      console.error("OPENAI_API_KEY not configured");
      return new Response(JSON.stringify({ error: "AI service not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claimsData.claims.sub;
    const { documentId, count = 10, userLevel } = await req.json();

    if (!documentId) {
      return new Response(JSON.stringify({ error: "Missing documentId" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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

    console.log(`Generating ${count} flashcards at ${effectiveLevel} level for document ${documentId}`);

    // Fetch document chunks
    const { data: chunks, error: chunksError } = await supabase
      .from("document_chunks")
      .select("content, page_number")
      .eq("document_id", documentId)
      .eq("user_id", userId)
      .order("chunk_index");

    if (chunksError) {
      console.error("Chunks error:", chunksError);
      return new Response(JSON.stringify({ error: "Failed to fetch document" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!chunks || chunks.length === 0) {
      return new Response(JSON.stringify({ 
        error: "No content found in this document",
        flashcards: []
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Combine chunks for context
    const content = chunks.map(c => c.content).join("\n\n");
    const truncatedContent = content.substring(0, 15000); // Limit context size

    console.log(`Using ${truncatedContent.length} characters of content`);

    // Detect API type
    const isOpenRouter = openaiApiKey.startsWith("sk-or-");
    const apiUrl = isOpenRouter 
      ? "https://openrouter.ai/api/v1/chat/completions"
      : "https://api.openai.com/v1/chat/completions";
    const model = isOpenRouter ? "openai/gpt-4o-mini" : "gpt-4o-mini";

    // Generate flashcards using AI
    const aiResponse = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
        ...(isOpenRouter && { "HTTP-Referer": "https://learnmateio.lovable.app" }),
        ...(isOpenRouter && { "X-Title": "Learn Mate" }),
      },
      body: JSON.stringify({
        model: model,
        messages: [
          {
            role: "system",
            content: `You are an expert educator creating flashcards for effective studying. Generate exactly ${count} high-quality flashcards from the provided document content.

The student's level is: ${effectiveLevel}.

${effectiveLevel === "Beginner" ? `FOR BEGINNER:
- Focus on basic definitions, key terms, and fundamental concepts
- Use simple language on the front
- Provide detailed, explanatory answers on the back
- Mark most cards as "easy" or "medium" difficulty
- Include memory aids and mnemonics when helpful` : ""}
${effectiveLevel === "Intermediate" ? `FOR INTERMEDIATE:
- Focus on conceptual understanding and relationships between ideas
- Questions should require synthesis, not just recall
- Balanced mix of "medium" and "hard" difficulty` : ""}
${effectiveLevel === "Advanced" ? `FOR ADVANCED:
- Focus on edge cases, nuances, and deep implications
- Questions should challenge assumptions and require critical thinking
- Most cards should be "hard" difficulty
- Include application and analysis questions` : ""}

Each flashcard should:
1. Test a key concept, definition, or important fact
2. Have a clear, concise question on the front
3. Have a comprehensive but focused answer on the back
4. Have appropriate difficulty (easy, medium, hard)

Return your response as a valid JSON array with this exact structure:
[
  {
    "front": "Question or prompt",
    "back": "Answer or explanation",
    "difficulty": "easy" | "medium" | "hard"
  }
]

Only return the JSON array, no additional text or markdown formatting.`,
          },
          {
            role: "user",
            content: `Generate ${count} flashcards from this document content:\n\n${truncatedContent}`,
          },
        ],
        temperature: 0.7,
        max_tokens: 3000,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("AI API error:", aiResponse.status, errorText);
      return new Response(JSON.stringify({ error: "Failed to generate flashcards" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();
    const responseText = aiData.choices?.[0]?.message?.content || "[]";
    
    // Parse the JSON response
    let flashcards = [];
    try {
      // Clean up response if needed
      const cleanedResponse = responseText
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      flashcards = JSON.parse(cleanedResponse);
    } catch (parseError) {
      console.error("Failed to parse AI response:", parseError, responseText);
      return new Response(JSON.stringify({ error: "Failed to parse flashcard data" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Successfully generated ${flashcards.length} flashcards`);

    // Save flashcards to database
    const flashcardsToInsert = flashcards.map((fc: any) => ({
      user_id: userId,
      document_id: documentId,
      front: fc.front,
      back: fc.back,
      difficulty: fc.difficulty || 'medium',
    }));

    const { data: savedFlashcards, error: insertError } = await supabase
      .from("flashcards")
      .insert(flashcardsToInsert)
      .select();

    if (insertError) {
      console.error("Insert error:", insertError);
      return new Response(JSON.stringify({ error: "Failed to save flashcards" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ 
      flashcards: savedFlashcards,
      count: savedFlashcards.length
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Flashcard generation error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
