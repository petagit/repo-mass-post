import { NextRequest } from "next/server";

// Always run dynamically; images are fetched on demand
export const dynamic = "force-dynamic";

// Small whitelist to reduce abuse. Extend if needed.
const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

// Some common XHS/CDN hosts; not strictly required, but useful for safety.
const ALLOWED_HOST_PATTERNS: RegExp[] = [
  /xhscdn\.com$/i,
  /xhsimg\.com$/i,
  /xiaohongshu\.com$/i,
  /ci\.xiaohongshu\.com$/i,
  /sns-.*\.xhscdn\.com$/i,
  /.*/, // fallback: allow any host. Remove this if you want strict whitelisting
];

function isHostAllowed(hostname: string): boolean {
  return ALLOWED_HOST_PATTERNS.some((re) => re.test(hostname));
}

export async function GET(req: NextRequest): Promise<Response> {
  const url = new URL(req.url);
  const target = url.searchParams.get("url");

  if (!target) {
    return new Response("Missing url parameter", { status: 400 });
  }

  let targetUrl: URL;
  try {
    targetUrl = new URL(target);
  } catch {
    return new Response("Invalid url", { status: 400 });
  }

  if (!ALLOWED_PROTOCOLS.has(targetUrl.protocol)) {
    return new Response("Protocol not allowed", { status: 400 });
  }

  if (!isHostAllowed(targetUrl.hostname)) {
    return new Response("Host not allowed", { status: 400 });
  }

  try {
    const upstream = await fetch(targetUrl.toString(), {
      // Pass headers that typical CDNs expect to allow hotlinking
      headers: {
        Referer: "https://www.xiaohongshu.com/",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "image/avif,image/webp,image/*;q=0.8,*/*;q=0.5",
        "Accept-Language": "zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7",
      },
      redirect: "follow",
    });

    if (!upstream.ok || !upstream.body) {
      return new Response(`Upstream error: ${upstream.status}`, { status: upstream.status || 502 });
    }

    // Only pass through necessary headers
    const contentType = upstream.headers.get("content-type") || "application/octet-stream";
    const headers = new Headers();
    headers.set("Content-Type", contentType);
    // Cache for a short time to avoid hammering the source while still staying fresh
    headers.set("Cache-Control", "public, max-age=86400");
    // Same-origin for client, so no CORS needed; expose for completeness
    headers.set("Access-Control-Allow-Origin", "*");

    return new Response(upstream.body, {
      status: 200,
      headers,
    });
  } catch (e: any) {
    return new Response(`Failed to fetch image: ${e?.message || "Unknown error"}`, { status: 500 });
  }
}

