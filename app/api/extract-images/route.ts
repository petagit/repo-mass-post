import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export interface ImageExtractionResult {
  success: boolean;
  posts: Array<{
    url: string;
    resolvedUrl: string;
    images: string[];
    title?: string;
    error?: string;
  }>;
  error?: string;
}

async function extractImagesFromUrl(targetUrl: string): Promise<{
  images: string[];
  resolvedUrl: string;
  title?: string;
  error?: string;
}> {
  let resolvedUrl = targetUrl;

  // Step 1: Resolve xhslink.com short URL to final XHS page URL
  if (/^https?:\/\/(?:www\.)?xhslink\.com\//i.test(targetUrl)) {
    try {
      const headResponse = await fetch(targetUrl, {
        method: "HEAD",
        redirect: "follow",
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7",
        },
      });
      resolvedUrl = headResponse.url || targetUrl;
      if (resolvedUrl === targetUrl || /xhslink\.com/i.test(resolvedUrl)) {
        const getResponse = await fetch(targetUrl, {
          method: "GET",
          headers: {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7",
            "Range": "bytes=0-8192",
          },
          redirect: "follow",
        });
        resolvedUrl = getResponse.url || targetUrl;
      }
    } catch (err: any) {
      return {
        images: [],
        resolvedUrl: targetUrl,
        error: `Failed to resolve short URL: ${err?.message || "Unknown error"}`,
      };
    }
  }

  // Step 2: Fetch the page HTML
  let html = "";
  try {
    const pageResponse = await fetch(resolvedUrl, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7",
        "Referer": "https://www.xiaohongshu.com/",
        "sec-ch-ua": '"Google Chrome";v="141", "Not?A_Brand";v="8", "Chromium";v="141"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"macOS"',
      },
      redirect: "follow",
    });

    if (!pageResponse.ok) {
      return {
        images: [],
        resolvedUrl,
        error: `Failed to fetch page: HTTP ${pageResponse.status}`,
      };
    }

    html = await pageResponse.text();
  } catch (err: any) {
    return {
      images: [],
      resolvedUrl,
      error: `Failed to fetch page: ${err?.message || "Unknown error"}`,
    };
  }

  // Step 3: Extract images from HTML
  const imageLinks = new Set<string>();

  // Extract title if available
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : undefined;

  // Helper function to decode Unicode escape sequences
  const decodeUnicode = (str: string): string => {
    return str.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  };

  // Helper function to check if URL is an image URL (more lenient for XHS)
  const isImageUrl = (url: string): boolean => {
    const lowerUrl = url.toLowerCase();
    // Standard image extensions
    if (/\.(jpg|jpeg|png|webp|gif|bmp|svg)/i.test(url)) {
      return true;
    }
    // XHS-specific patterns: xhscdn.com URLs with image indicators
    if (/xhscdn\./i.test(url)) {
      // Check for webp, image indicators, or typical XHS image patterns
      if (/(webp|pic|image|img|photo|_dft_|_wlteh_)/i.test(url)) {
        return true;
      }
      // If it's from xhscdn and doesn't look like a video, treat as image
      if (!/\.(mp4|mov|m3u8|mpd|video)/i.test(url)) {
        return true;
      }
    }
    return false;
  };

  // Look for images in script tags (common for XHS and other platforms)
  const scriptMatches = html.matchAll(/<script[^>]*>(.*?)<\/script>/gis);
  for (const match of scriptMatches) {
    const scriptContent = match[1];
    
    // Look for JSON objects containing image URLs
    try {
      // First, decode any Unicode escape sequences
      const decodedContent = decodeUnicode(scriptContent);
      
      const jsonMatches = decodedContent.matchAll(/"url"\s*:\s*"([^"]+)"/gi);
      for (const jsonMatch of jsonMatches) {
        let url = jsonMatch[1]
          .replace(/\\\//g, "/")  // Replace escaped slashes
          .replace(/\\u0021/g, "!")  // Replace \u0021 with !
          .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16))); // Decode other Unicode escapes
        // Try to decode URI component if it looks encoded, but preserve if it fails
        try {
          url = decodeURIComponent(url);
        } catch {
          // URL might not be encoded, keep as is
        }
        if (isImageUrl(url) && !url.includes("logo") && !url.includes("icon") && !url.includes("avatar")) {
          imageLinks.add(url);
        }
      }
      
      // Look for image URLs in various JSON patterns
      const imagePatterns = [
        /"image"\s*:\s*"([^"]+)"/gi,
        /"imageUrl"\s*:\s*"([^"]+)"/gi,
        /"picUrl"\s*:\s*"([^"]+)"/gi,
        /"pic"\s*:\s*"([^"]+)"/gi,
        /"src"\s*:\s*"([^"]+)"/gi,
        /"cover"\s*:\s*"([^"]+)"/gi,
        /"thumbnail"\s*:\s*"([^"]+)"/gi,
      ];
      
      for (const pattern of imagePatterns) {
        const matches = decodedContent.matchAll(pattern);
        for (const m of matches) {
          let url = m[1]
            .replace(/\\\//g, "/")  // Replace escaped slashes
            .replace(/\\u0021/g, "!")  // Replace \u0021 with !
            .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16))); // Decode other Unicode escapes
          // Try to decode URI component if it looks encoded
          try {
            url = decodeURIComponent(url);
          } catch {
            // URL might not be encoded, keep as is
          }
          if (url.startsWith("http") && isImageUrl(url)) {
            imageLinks.add(url);
          }
        }
      }

      // Look for xhscdn.com URLs directly (common pattern for XHS images)
      const xhsImagePattern = /https?:\/\/[^"'\s<>]*xhscdn[^"'\s<>]+(?:\/|!)[^"'\s<>]*/gi;
      const xhsMatches = decodedContent.matchAll(xhsImagePattern);
      for (const xhsMatch of xhsMatches) {
        let url = xhsMatch[0]
          .replace(/\\\//g, "/")  // Replace escaped slashes
          .replace(/\\u0021/g, "!")  // Replace \u0021 with !
          .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16))); // Decode other Unicode escapes
        // Try to decode URI component if it looks encoded
        try {
          url = decodeURIComponent(url);
        } catch {
          // URL might not be encoded, keep as is
        }
        // Exclude video files
        if (!/\.(mp4|mov|m3u8|mpd|video)/i.test(url) && !url.includes("logo") && !url.includes("icon") && !url.includes("avatar")) {
          imageLinks.add(url);
        }
      }
    } catch {
      // Ignore JSON parse errors
    }
  }

  // Look for <img> tags
  const imgMatches = html.matchAll(/<img[^>]+src=["'](https?:\/\/[^"'\s<>]+)["']/gi);
  for (const match of imgMatches) {
    let url = match[1]
      .replace(/\\\//g, "/")
      .replace(/&amp;/g, "&")
      .replace(/\\u0021/g, "!")
      .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
    try {
      url = decodeURIComponent(url);
    } catch {
      // Keep as is if decode fails
    }
    if (isImageUrl(url) && !url.includes("logo") && !url.includes("icon") && !url.includes("avatar")) {
      imageLinks.add(url);
    }
  }

  // Look for data attributes
  const dataAttrMatches = html.matchAll(/(?:data-src|data-url|data-image|data-original|data-lazy-src)=["'](https?:\/\/[^"'\s<>]+)["']/gi);
  for (const match of dataAttrMatches) {
    let url = match[1]
      .replace(/\\\//g, "/")
      .replace(/&amp;/g, "&")
      .replace(/\\u0021/g, "!")
      .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
    try {
      url = decodeURIComponent(url);
    } catch {
      // Keep as is if decode fails
    }
    if (isImageUrl(url) && !url.includes("logo") && !url.includes("icon") && !url.includes("avatar")) {
      imageLinks.add(url);
    }
  }

  // Generic URL sweep - look for xhscdn URLs specifically (they often don't have extensions)
  const xhsCdnMatches = html.matchAll(/https?:\/\/[^"'\s<>]*xhscdn[^"'\s<>]+(?:\/|!)[^"'\s<>]*/gi);
  for (const match of xhsCdnMatches) {
    let url = match[0]
      .replace(/\\\//g, "/")
      .replace(/&amp;/g, "&")
      .replace(/\\u0021/g, "!")
      .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
    try {
      url = decodeURIComponent(url);
    } catch {
      // Keep as is if decode fails
    }
    // Exclude videos and common non-image patterns
    if (!/\.(mp4|mov|m3u8|mpd|video)/i.test(url) && !url.includes("logo") && !url.includes("icon") && !url.includes("avatar")) {
      imageLinks.add(url);
    }
  }

  // Generic URL sweep for image URLs with extensions
  const allUrlMatches = html.match(/https?:\/\/[^\s"'<>]+\.(jpg|jpeg|png|webp|gif|bmp)[^\s"'<>]*/gi) || [];
  for (const urlMatch of allUrlMatches) {
    let cleanUrl = urlMatch
      .replace(/\\\//g, "/")
      .replace(/&amp;/g, "&")
      .replace(/\\u0021/g, "!")
      .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
    try {
      cleanUrl = decodeURIComponent(cleanUrl);
    } catch {
      // Keep as is if decode fails
    }
    if (!cleanUrl.includes("logo") && !cleanUrl.includes("icon") && !cleanUrl.includes("avatar")) {
      imageLinks.add(cleanUrl);
    }
  }

  // Filter out small or invalid images (common placeholder sizes) and validate URLs
  const filteredImages = Array.from(imageLinks).filter((url) => {
    // Remove common placeholder patterns
    if (url.match(/\/(?:placeholder|logo|icon|avatar|thumb|1x1|spacer)/i)) {
      return false;
    }
    // Validate URL format
    try {
      const urlObj = new URL(url);
      // Ensure it's http or https
      if (!["http:", "https:"].includes(urlObj.protocol)) {
        return false;
      }
      // For xhscdn URLs, be more lenient (they often don't have extensions)
      const isXhsCdn = /xhscdn\./i.test(urlObj.hostname);
      if (isXhsCdn) {
        // Check for image indicators or exclude video patterns
        if (/\.(mp4|mov|m3u8|mpd|video)/i.test(urlObj.pathname)) {
          return false; // Exclude videos
        }
        // XHS images often have patterns like webp, pic, image, or special characters
        if (/(webp|pic|image|img|photo|_dft_|_wlteh_|!)/i.test(urlObj.pathname) || urlObj.pathname.length > 20) {
          return true; // Likely an image
        }
        // If it's from xhscdn and doesn't look like a video, include it
        return true;
      }
      // For other URLs, ensure it looks like an image URL
      if (isImageUrl(urlObj.pathname)) {
        return true;
      }
      return false;
    } catch {
      // Invalid URL format
      return false;
    }
  });

  return {
    images: filteredImages,
    resolvedUrl,
    title,
  };
}

export async function POST(req: Request): Promise<NextResponse<ImageExtractionResult>> {
  try {
    const body = (await req.json()) as { url?: string; urls?: string[] };
    
    let urls: string[] = [];
    if (body.urls && Array.isArray(body.urls)) {
      urls = body.urls;
    } else if (body.url) {
      // Extract URLs from single url string (may contain multiple URLs)
      const urlMatches = body.url.matchAll(/https?:\/\/[^\s]+/gi);
      urls = Array.from(urlMatches).map((match) => match[0]);
    }
    
    if (urls.length === 0) {
      return NextResponse.json(
        { success: false, posts: [], error: "No valid URLs found in input" },
        { status: 400 }
      );
    }

    // Process all URLs in parallel
    const results = await Promise.allSettled(urls.map((url) => extractImagesFromUrl(url)));

    const posts: ImageExtractionResult["posts"] = [];
    const errors: string[] = [];

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const originalUrl = urls[i];
      
      if (result.status === "fulfilled") {
        posts.push({
          url: originalUrl,
          resolvedUrl: result.value.resolvedUrl,
          images: result.value.images,
          title: result.value.title,
          error: result.value.error,
        });
        if (result.value.error) {
          errors.push(`URL ${i + 1}: ${result.value.error}`);
        }
      } else {
        posts.push({
          url: originalUrl,
          resolvedUrl: originalUrl,
          images: [],
          error: result.reason?.message || "Unknown error processing URL",
        });
        errors.push(`URL ${i + 1}: ${result.reason?.message || "Unknown error"}`);
      }
    }

    const hasImages = posts.some((post) => post.images.length > 0);

    return NextResponse.json({
      success: hasImages,
      posts,
      error: errors.length > 0 ? errors.join("; ") : undefined,
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        success: false,
        posts: [],
        error: e?.message || "Failed to extract images",
      },
      { status: 500 }
    );
  }
}
