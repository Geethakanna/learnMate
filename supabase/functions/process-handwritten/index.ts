import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

function detectFileType(fileName: string): "image" | "pdf" | "doc" {
  const ext = fileName.toLowerCase().split(".").pop() || "";
  if (["png", "jpg", "jpeg", "webp", "gif", "heic"].includes(ext)) return "image";
  if (ext === "pdf") return "pdf";
  if (["doc", "docx"].includes(ext)) return "doc";
  return "image"; // fallback
}

function getMimeType(fileName: string): string {
  const ext = fileName.toLowerCase().split(".").pop() || "png";
  const mimeMap: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    gif: "image/gif",
    heic: "image/heic",
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  };
  return mimeMap[ext] || "application/octet-stream";
}

const ocrSystemPrompt = `You are a handwritten notes OCR and processing expert. You must:
1. Extract ALL text from the handwritten notes image accurately.
2. Clean the text: fix spelling errors, broken sentences, normalize grammar, remove noise/symbols, standardize formatting.
3. Detect structure: identify headings, topics, subtopics, key concepts.
4. Assess confidence: rate overall OCR quality.

Respond ONLY with valid JSON in this exact format:
{
  "raw_text": "the raw extracted text as-is from OCR",
  "clean_text": "the cleaned, corrected, properly formatted text with paragraphs",
  "confidence_score": <number 0-100>,
  "quality": "clear" | "moderate" | "poor",
  "uncertain_segments": ["list of words/phrases you are unsure about"],
  "topics": ["list of detected topics"],
  "key_concepts": ["list of key concepts found"],
  "structured_content": "the text organized with markdown headings and bullet points"
}

Rules:
- confidence_score: 90-100 = clear handwriting, 60-89 = moderate, below 60 = poor
- If text is completely illegible, set quality to "poor" and confidence_score below 30
- uncertain_segments: include any words where you had to guess
- Do NOT invent content that isn't in the image
- Preserve the meaning and intent of the original notes`;

const pdfDocSystemPrompt = `You are a document text extraction and structuring expert. You must:
1. Extract ALL text content from this document accurately.
2. Clean the text: fix any OCR artifacts, broken sentences, normalize grammar, standardize formatting.
3. Detect structure: identify headings, topics, subtopics, key concepts.
4. Assess quality of the content.

Respond ONLY with valid JSON in this exact format:
{
  "raw_text": "the raw extracted text",
  "clean_text": "the cleaned, corrected, properly formatted text with paragraphs",
  "confidence_score": <number 0-100>,
  "quality": "clear" | "moderate" | "poor",
  "uncertain_segments": ["list of words/phrases you are unsure about"],
  "topics": ["list of detected topics"],
  "key_concepts": ["list of key concepts found"],
  "structured_content": "the text organized with markdown headings and bullet points"
}

Rules:
- For typed/printed text, confidence_score should be 90-100
- For scanned handwritten PDFs, rate based on legibility
- uncertain_segments: include any words where extraction was unclear
- Do NOT invent content that isn't in the document
- Preserve the meaning and structure of the original document`;

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
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { filePath, fileName } = await req.json();

    if (!filePath) {
      return new Response(JSON.stringify({ error: "Missing filePath" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const fileType = detectFileType(fileName || filePath);
    const mimeType = getMimeType(fileName || filePath);

    console.log(`Processing file: ${fileName}, type: ${fileType}, mime: ${mimeType}`);

    // Download file from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from("documents")
      .download(filePath);

    if (downloadError || !fileData) {
      console.error("Download error:", downloadError);
      return new Response(JSON.stringify({ error: "Failed to download file" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const arrayBuffer = await fileData.arrayBuffer();

    if (arrayBuffer.byteLength > MAX_FILE_SIZE) {
      return new Response(JSON.stringify({ error: "File too large. Maximum size is 10MB." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const base64 = base64Encode(new Uint8Array(arrayBuffer));

    // Build AI request based on file type
    let systemPrompt: string;
    let userContent: any[];

    if (fileType === "image") {
      systemPrompt = ocrSystemPrompt;
      userContent = [
        { type: "text", text: "Extract, clean, and structure the handwritten notes from this image. Return ONLY valid JSON." },
        { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}` } },
      ];
    } else if (fileType === "pdf") {
      systemPrompt = pdfDocSystemPrompt;
      userContent = [
        { type: "text", text: "Extract ALL text from this PDF document, clean it, and structure it. Handle both typed and handwritten content. Return ONLY valid JSON." },
        { type: "image_url", image_url: { url: `data:application/pdf;base64,${base64}` } },
      ];
    } else {
      // DOC/DOCX - send as file for AI to parse
      systemPrompt = pdfDocSystemPrompt;
      userContent = [
        { type: "text", text: "Extract ALL text from this document, clean it, and structure it. Return ONLY valid JSON." },
        { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}` } },
      ];
    }

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("AI processing error:", errorText);
      return new Response(JSON.stringify({ error: "Failed to process file. The file may be corrupted or unsupported." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();
    let content = aiData.choices?.[0]?.message?.content || "";

    // Strip markdown code fences if present
    content = content.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();

    let result;
    try {
      result = JSON.parse(content);
    } catch {
      console.error("Failed to parse AI response as JSON:", content.substring(0, 500));
      return new Response(JSON.stringify({
        error: "AI returned invalid response format",
        raw_response: content.substring(0, 1000),
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate required fields
    const requiredFields = ["raw_text", "clean_text", "confidence_score", "quality"];
    for (const field of requiredFields) {
      if (!(field in result)) {
        return new Response(JSON.stringify({ error: `Missing field in response: ${field}` }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Ensure arrays and defaults
    result.uncertain_segments = result.uncertain_segments || [];
    result.topics = result.topics || [];
    result.key_concepts = result.key_concepts || [];
    result.structured_content = result.structured_content || result.clean_text;
    result.file_type = fileType;

    console.log(`Processed ${fileType} file: confidence=${result.confidence_score}, quality=${result.quality}, topics=${result.topics.length}`);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Processing error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
