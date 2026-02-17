import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function isBlockedUrl(url: string): boolean {
  let urlObj: URL;
  try {
    urlObj = new URL(url);
  } catch {
    return true;
  }

  // Only allow http and https
  if (!["http:", "https:"].includes(urlObj.protocol)) {
    return true;
  }

  const hostname = urlObj.hostname.toLowerCase();

  // Block localhost and loopback
  const blockedHosts = ["localhost", "0.0.0.0", "[::]", "[::1]"];
  if (blockedHosts.includes(hostname)) return true;

  // Block IP-based access to private/reserved ranges
  const ipPatterns = [
    /^127\./,                          // loopback
    /^10\./,                           // RFC 1918
    /^172\.(1[6-9]|2\d|3[01])\./,      // RFC 1918
    /^192\.168\./,                     // RFC 1918
    /^169\.254\./,                     // link-local
    /^0\./,                            // current network
    /^100\.(6[4-9]|[7-9]\d|1[0-2]\d)\./, // CGNAT
    /^198\.18\./,                      // benchmarking
  ];
  if (ipPatterns.some((p) => p.test(hostname))) return true;

  // Block metadata endpoints
  if (hostname === "169.254.169.254") return true;

  return false;
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

    const { url } = await req.json();

    if (!url) {
      return new Response(JSON.stringify({ error: "Missing URL" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // SSRF protection: validate URL
    if (isBlockedUrl(url)) {
      return new Response(JSON.stringify({ error: "Invalid or blocked URL" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch the URL content with timeout and size limits
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; LearnMate/1.0)",
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return new Response(JSON.stringify({ error: "Failed to fetch URL" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const html = await response.text();

    // Size limit: 5MB
    if (html.length > 5_000_000) {
      return new Response(JSON.stringify({ error: "Content too large" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Extract title
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : new URL(url).hostname;

    // Simple HTML to text extraction
    let text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "")
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "")
      .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "")
      .replace(/<[^>]+>/g, "\n")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\n\s*\n/g, "\n\n")
      .trim();

    // Clean up excessive whitespace
    text = text.split("\n").map((line) => line.trim()).filter((line) => line.length > 0).join("\n\n");

    console.log(`Extracted ${text.length} characters from ${url}`);

    return new Response(JSON.stringify({ text, title }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("URL extraction error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
