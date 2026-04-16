import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const OCR_SPACE_MAX_SIZE = 1024 * 1024; // 1MB free tier limit

type SupportedFileType = "image" | "pdf" | "doc";
type OcrErrorCode = "RATE_LIMIT" | "NO_TEXT" | "SERVICE_ERROR" | "UNSUPPORTED_OR_CORRUPTED";

type ProcessedResult = {
  raw_text: string;
  clean_text: string;
  confidence_score: number;
  quality: "clear" | "moderate" | "poor";
  uncertain_segments?: string[];
  topics?: string[];
  key_concepts?: string[];
  structured_content?: string;
  file_type?: SupportedFileType;
  ocr_engine?: string;
};

function detectFileType(fileName: string): SupportedFileType {
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

function normalizeOcrError(message: string): OcrErrorCode {
  const normalized = message.toLowerCase();

  if (
    normalized.includes("maximum number of monthly") ||
    normalized.includes("maximum number of requests") ||
    normalized.includes("daily limit") ||
    normalized.includes("too many requests") ||
    normalized.includes("rate limit")
  ) {
    return "RATE_LIMIT";
  }

  if (
    normalized.includes("file failed validation") ||
    normalized.includes("unsupported") ||
    normalized.includes("corrupted") ||
    normalized.includes("corrupt") ||
    normalized.includes("unable to detect")
  ) {
    return "UNSUPPORTED_OR_CORRUPTED";
  }

  if (normalized.includes("no text") || normalized.includes("could not parse") || normalized.includes("empty")) {
    return "NO_TEXT";
  }

  return "SERVICE_ERROR";
}

function createErrorResponse(error: OcrErrorCode) {
  if (error === "RATE_LIMIT") {
    return new Response(JSON.stringify({ error: "Daily OCR limit reached. Try again later." }), {
      status: 429,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (error === "NO_TEXT") {
    return new Response(JSON.stringify({ error: "Text extraction failed. Please upload clearer notes." }), {
      status: 422,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (error === "UNSUPPORTED_OR_CORRUPTED") {
    return new Response(JSON.stringify({ error: "Unsupported or corrupted file" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ error: "OCR service error. Please retry." }), {
    status: 502,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function extractTextWithOcrSpace(
  fileBlob: Blob,
  fileName: string,
  mimeType: string,
  apiKey: string,
): Promise<{ success: true; text: string } | { success: false; error: OcrErrorCode }> {
  try {
    const uploadBlob = fileBlob.type === mimeType ? fileBlob : fileBlob.slice(0, fileBlob.size, mimeType);
    const formData = new FormData();

    formData.append("file", uploadBlob, fileName);
    formData.append("language", "eng");
    formData.append("isOverlayRequired", "false");
    formData.append("detectOrientation", "true");
    formData.append("scale", "true");
    formData.append("OCREngine", "2");

    const response = await fetch("https://api.ocr.space/parse/image", {
      method: "POST",
      headers: { apikey: apiKey },
      body: formData,
    });

    const rawBody = await response.text();

    if (!response.ok) {
      console.error("OCR.space HTTP error:", response.status, rawBody.slice(0, 500));
      return { success: false, error: normalizeOcrError(rawBody || `HTTP ${response.status}`) };
    }

    const data = JSON.parse(rawBody);
    const errorMessages = [
      ...(Array.isArray(data.ErrorMessage) ? data.ErrorMessage : []),
      ...(Array.isArray(data.ErrorDetails) ? data.ErrorDetails : []),
    ]
      .filter(Boolean)
      .join(" ");

    if (data.IsErroredOnProcessing) {
      console.error("OCR.space processing error:", errorMessages || rawBody.slice(0, 500));
      return { success: false, error: normalizeOcrError(errorMessages || "service error") };
    }

    const fullText = (data.ParsedResults || [])
      .map((result: { ParsedText?: string }) => result.ParsedText || "")
      .join("\n\n")
      .trim();

    if (!fullText) {
      return { success: false, error: "NO_TEXT" };
    }

    return { success: true, text: fullText };
  } catch (error) {
    console.error("OCR.space exception:", error);
    return { success: false, error: "SERVICE_ERROR" };
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

async function cleanExtractedText(rawText: string, lovableApiKey: string): Promise<ProcessedResult> {
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
        {
          role: "user",
          content: `Clean, correct, and structure the following OCR-extracted text. Return ONLY valid JSON.\n\n---\n${rawText}\n---`,
        },
      ],
    }),
  });

  if (!aiResponse.ok) {
    const errorText = await aiResponse.text();
    console.error("AI cleaning error:", errorText);
    throw new Error("AI_CLEANING_FAILED");
  }

  const aiData = await aiResponse.json();
  let content = aiData.choices?.[0]?.message?.content || "";
  content = content.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();

  const result = JSON.parse(content) as ProcessedResult;
  result.raw_text = rawText;
  result.ocr_engine = "ocr.space";

  return result;
}

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
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY")!;
    const ocrSpaceApiKey = Deno.env.get("OCR_SPACE_API_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);

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

    const resolvedFileName = fileName || filePath;
    const fileType = detectFileType(resolvedFileName);
    const mimeType = getMimeType(resolvedFileName);

    console.log(`Processing file: ${resolvedFileName}, type: ${fileType}, mime: ${mimeType}`);

    const { data: fileData, error: downloadError } = await supabase.storage.from("documents").download(filePath);

    if (downloadError || !fileData) {
      console.error("Download error:", downloadError);
      return new Response(JSON.stringify({ error: "Failed to download file" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (fileData.size > MAX_FILE_SIZE) {
      return new Response(JSON.stringify({ error: "File too large. Maximum size is 20MB." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let result: ProcessedResult;

    if ((fileType === "image" || fileType === "pdf") && fileData.size <= OCR_SPACE_MAX_SIZE) {
      console.log(`Using OCR.space (file size: ${fileData.size} bytes)`);
      const ocrResult = await extractTextWithOcrSpace(fileData, resolvedFileName, mimeType, ocrSpaceApiKey);

      if (ocrResult.success) {
        result = await cleanExtractedText(ocrResult.text, lovableApiKey);
      } else if (ocrResult.error === "RATE_LIMIT") {
        return createErrorResponse(ocrResult.error);
      } else {
        // Fall through to AI vision
        console.log(`OCR.space failed (${ocrResult.error}), falling back to AI vision`);
        result = null as any;
      }
    }

    if (!result && (fileType === "image" || fileType === "pdf")) {
      console.log(`Using AI vision (file size: ${fileData.size} bytes)`);
      const arrayBuffer = await fileData.arrayBuffer();
      const base64 = base64Encode(new Uint8Array(arrayBuffer));

      const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: visionSystemPrompt },
            {
              role: "user",
              content: [
                { type: "text", text: "Extract, clean, and structure the text from this file. Return ONLY valid JSON." },
                { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}` } },
              ],
            },
          ],
        }),
      });

      if (!aiResponse.ok) {
        const errorText = await aiResponse.text();
        console.error("AI vision error:", errorText);
        return new Response(JSON.stringify({ error: "Failed to process file." }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const aiData = await aiResponse.json();
      let content = aiData.choices?.[0]?.message?.content || "";
      content = content.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();

      try {
        result = JSON.parse(content) as ProcessedResult;
        result.ocr_engine = "ai-vision";
      } catch {
        console.error("Failed to parse AI response:", content.substring(0, 500));
        return new Response(JSON.stringify({ error: "AI returned invalid response format" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else if (!result) {
      const arrayBuffer = await fileData.arrayBuffer();
      const base64 = base64Encode(new Uint8Array(arrayBuffer));

      const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: visionSystemPrompt },
            {
              role: "user",
              content: [
                { type: "text", text: "Extract, clean, and structure the text from this file. Return ONLY valid JSON." },
                { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}` } },
              ],
            },
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
        result = JSON.parse(content) as ProcessedResult;
        result.ocr_engine = "ai-vision";
      } catch {
        console.error("Failed to parse AI response as JSON:", content.substring(0, 500));
        return new Response(JSON.stringify({ error: "AI returned invalid response format" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const requiredFields: Array<keyof ProcessedResult> = ["raw_text", "clean_text", "confidence_score", "quality"];
    for (const field of requiredFields) {
      if (!(field in result)) {
        return new Response(JSON.stringify({ error: `Missing field in response: ${field}` }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    result.uncertain_segments = result.uncertain_segments || [];
    result.topics = result.topics || [];
    result.key_concepts = result.key_concepts || [];
    result.structured_content = result.structured_content || result.clean_text;
    result.file_type = fileType;

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