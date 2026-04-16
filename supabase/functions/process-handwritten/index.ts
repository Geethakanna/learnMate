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
  return "image";
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

// Call OCR.space API for text extraction
async function extractTextWithOcrSpace(
  base64Data: string,
  mimeType: string,
  fileName: string,
  apiKey: string
): Promise<{ text: string; success: boolean; error?: string }> {
  try {
    const formData = new FormData();
    // Send as base64 string with data URI prefix
    formData.append("base64Image", `data:${mimeType};base64,${base64Data}`);
    formData.append("language", "eng");
    formData.append("isOverlayRequired", "false");
    formData.append("detectOrientation", "true");
    formData.append("scale", "true");
    formData.append("OCREngine", "2"); // Engine 2 is better for handwriting

    // For PDFs, enable multi-page
    if (mimeType === "application/pdf") {
      formData.append("isTable", "true");
    }

    console.log(`Calling OCR.space API for file: ${fileName}`);

    const response = await fetch("https://api.ocr.space/parse/image", {
      method: "POST",
      headers: { apikey: apiKey },
      body: formData,
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("OCR.space HTTP error:", response.status, errText);
      if (response.status === 429 || errText.includes("limit")) {
        return { text: "", success: false, error: "RATE_LIMIT" };
      }
      return { text: "", success: false, error: "API_ERROR" };
    }

    const data = await response.json();

    if (data.IsErroredOnProcessing) {
      console.error("OCR.space processing error:", data.ErrorMessage);
      return { text: "", success: false, error: data.ErrorMessage?.[0] || "API_ERROR" };
    }

    const parsedResults = data.ParsedResults || [];
    if (parsedResults.length === 0) {
      return { text: "", success: false, error: "NO_RESULTS" };
    }

    // Combine text from all pages/results
    const fullText = parsedResults
      .map((r: any) => r.ParsedText || "")
      .join("\n\n")
      .trim();

    if (!fullText) {
      return { text: "", success: false, error: "NO_TEXT" };
    }

    console.log(`OCR.space extracted ${fullText.length} chars from ${parsedResults.length} result(s)`);
    return { text: fullText, success: true };
  } catch (err) {
    console.error("OCR.space exception:", err);
    return { text: "", success: false, error: "API_ERROR" };
  }
}

const cleaningSystemPrompt = `You are a text cleaning and structuring expert. You receive raw OCR-extracted text that may contain errors, broken formatting, or noise.

Your job:
1. Clean the text: fix spelling errors, broken sentences, normalize grammar, remove noise/symbols.
2. Detect structure: identify headings, topics, subtopics, key concepts.
3. Assess quality of the extracted text.

Respond ONLY with valid JSON in this exact format:
{
  "raw_text": "the original OCR text as provided to you",
  "clean_text": "the cleaned, corrected, properly formatted text with paragraphs",
  "confidence_score": <number 0-100>,
  "quality": "clear" | "moderate" | "poor",
  "uncertain_segments": ["list of words/phrases that seem incorrect or unclear"],
  "topics": ["list of detected topics"],
  "key_concepts": ["list of key concepts found"],
  "structured_content": "the text organized with markdown headings and bullet points"
}

Rules:
- confidence_score: 90-100 = clean readable text, 60-89 = moderate noise, below 60 = very noisy
- Do NOT invent content that isn't in the original text
- Preserve the meaning and intent of the original notes
- uncertain_segments: words that look like OCR errors`;

const visionSystemPrompt = `You are a handwritten notes OCR and processing expert. You must:
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
- Do NOT invent content that isn't in the image
- Preserve the meaning and intent of the original notes`;

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
    const ocrSpaceApiKey = Deno.env.get("OCR_SPACE_API_KEY");

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
      return new Response(JSON.stringify({ error: "File too large. Maximum size is 20MB." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const base64 = base64Encode(new Uint8Array(arrayBuffer));

    // Strategy: For images and PDFs, try OCR.space first, then use AI for cleaning.
    // For DOC/DOCX or if OCR.space fails, fall back to full AI vision pipeline.

    let result;

    if ((fileType === "image" || fileType === "pdf") && ocrSpaceApiKey) {
      // Step 1: Extract text with OCR.space
      const ocrResult = await extractTextWithOcrSpace(base64, mimeType, fileName, ocrSpaceApiKey);

      if (ocrResult.success && ocrResult.text.length > 10) {
        // Step 2: Clean and structure with AI
        console.log("OCR.space succeeded, sending to AI for cleaning...");

        const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${lovableApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              { role: "system", content: cleaningSystemPrompt },
              { role: "user", content: `Clean, correct, and structure the following OCR-extracted text. Return ONLY valid JSON.\n\n---\n${ocrResult.text}\n---` },
            ],
          }),
        });

        if (aiResponse.ok) {
          const aiData = await aiResponse.json();
          let content = aiData.choices?.[0]?.message?.content || "";
          content = content.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();

          try {
            result = JSON.parse(content);
            result.raw_text = ocrResult.text; // preserve original OCR output
            result.ocr_engine = "ocr.space";
          } catch {
            console.error("AI cleaning parse failed, using OCR text directly");
          }
        }
      } else {
        // OCR.space failed - check specific errors
        if (ocrResult.error === "RATE_LIMIT") {
          console.log("OCR.space rate limit, falling back to AI vision");
        } else if (ocrResult.error === "NO_TEXT") {
          console.log("OCR.space found no text, falling back to AI vision");
        } else {
          console.log(`OCR.space failed (${ocrResult.error}), falling back to AI vision`);
        }
      }
    }

    // Fallback: Use AI vision pipeline (for DOC/DOCX, or if OCR.space failed)
    if (!result) {
      console.log("Using AI vision pipeline for extraction...");

      const systemPrompt = fileType === "image" ? visionSystemPrompt : cleaningSystemPrompt;
      let userContent: any[];

      if (fileType === "doc") {
        // For DOC/DOCX, send as file
        userContent = [
          { type: "text", text: "Extract ALL text from this document, clean it, and structure it. Return ONLY valid JSON." },
          { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}` } },
        ];
      } else {
        // Image or PDF via vision
        userContent = [
          { type: "text", text: "Extract, clean, and structure the text from this file. Return ONLY valid JSON." },
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
      content = content.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();

      try {
        result = JSON.parse(content);
        result.ocr_engine = "ai-vision";
      } catch {
        console.error("Failed to parse AI response:", content.substring(0, 500));
        return new Response(JSON.stringify({
          error: "AI returned invalid response format",
          raw_response: content.substring(0, 1000),
        }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
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

    console.log(`Processed ${fileType} via ${result.ocr_engine}: confidence=${result.confidence_score}, quality=${result.quality}, topics=${result.topics.length}`);

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
