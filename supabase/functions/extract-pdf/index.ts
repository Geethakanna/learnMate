import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB - aligned with process-handwritten

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse(401, { error: "Unauthorized" });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");

    if (!lovableApiKey) {
      console.error("Missing LOVABLE_API_KEY");
      return jsonResponse(500, { error: "Server misconfigured: missing AI key" });
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return jsonResponse(401, { error: "Unauthorized" });
    }

    let body: { filePath?: string; fileName?: string };
    try {
      body = await req.json();
    } catch {
      return jsonResponse(400, { error: "Invalid JSON body" });
    }

    const { filePath, fileName } = body;
    if (!filePath) {
      return jsonResponse(400, { error: "Missing filePath" });
    }

    const { data: fileData, error: downloadError } = await supabase.storage
      .from("documents")
      .download(filePath);

    if (downloadError || !fileData) {
      console.error("Download error:", downloadError);
      return jsonResponse(500, { error: "Failed to download PDF from storage" });
    }

    if (fileData.size > MAX_FILE_SIZE) {
      return jsonResponse(400, {
        error: `PDF is too large (${(fileData.size / 1024 / 1024).toFixed(1)}MB). Maximum allowed is 20MB.`,
      });
    }

    const arrayBuffer = await fileData.arrayBuffer();
    if (arrayBuffer.byteLength === 0) {
      return jsonResponse(400, { error: "PDF file is empty" });
    }

    // Memory-safe base64 encoding
    const base64 = base64Encode(new Uint8Array(arrayBuffer));

    console.log(`Extracting PDF: ${fileName} (${(arrayBuffer.byteLength / 1024).toFixed(1)} KB)`);

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Extract ALL text content from this PDF document. Preserve the structure with paragraphs separated by blank lines. Include all text, headings, tables, and content. Return ONLY the extracted text, no commentary or markdown fences.",
              },
              {
                type: "image_url",
                image_url: { url: `data:application/pdf;base64,${base64}` },
              },
            ],
          },
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("AI extraction error:", aiResponse.status, errorText.slice(0, 500));

      if (aiResponse.status === 429) {
        return jsonResponse(429, { error: "AI rate limit reached. Please try again in a moment." });
      }
      if (aiResponse.status === 402) {
        return jsonResponse(402, { error: "AI credits exhausted. Please add credits to continue." });
      }
      if (aiResponse.status === 400 || aiResponse.status === 415) {
        return jsonResponse(400, { error: "PDF could not be processed. It may be corrupted, password-protected, or unsupported." });
      }
      return jsonResponse(502, { error: "AI service error. Please retry." });
    }

    const aiData = await aiResponse.json();
    const extractedText = (aiData.choices?.[0]?.message?.content || "").trim();

    if (!extractedText || extractedText.length < 10) {
      console.warn(`Extracted text too short (${extractedText.length} chars) from ${fileName}`);
      return jsonResponse(422, {
        error: "No readable text found in PDF. It may be a scanned/image-only document. Try uploading via the Notes tab for OCR.",
      });
    }

    console.log(`Extracted ${extractedText.length} characters from ${fileName}`);

    return jsonResponse(200, { text: extractedText });
  } catch (error) {
    console.error("PDF extraction exception:", error);
    return jsonResponse(500, { error: "Internal server error during PDF extraction" });
  }
});
