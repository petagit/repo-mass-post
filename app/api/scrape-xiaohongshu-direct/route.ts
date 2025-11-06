import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export interface XHSDownloadResult {
  success: boolean;
  imageLinks: string[];
  videoLinks: string[];
  error?: string;
  debugUrls?: string[];
  resolvedUrl?: string;
  testedVideoUrl?: string;
  testResult?: {
    status: number;
    contentType?: string;
    accessible: boolean;
    headers?: Record<string, string>;
  };
}

async function processSingleUrl(targetUrl: string): Promise<{
  videoLinks: string[];
  imageLinks: string[];
  debugUrls: string[];
  resolvedUrl: string;
  testedVideoUrl?: string;
  testResult?: XHSDownloadResult["testResult"];
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
      // If HEAD didn't redirect (some servers don't support HEAD), try GET
      if (resolvedUrl === targetUrl || /xhslink\.com/i.test(resolvedUrl)) {
        const getResponse = await fetch(targetUrl, {
          method: "GET",
          headers: {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7",
            "Range": "bytes=0-8192", // Small range to avoid downloading full page
          },
          redirect: "follow",
        });
        resolvedUrl = getResponse.url || targetUrl;
      }
    } catch (err: any) {
      return {
        videoLinks: [],
        imageLinks: [],
        debugUrls: [],
        resolvedUrl: targetUrl,
        error: `Failed to resolve short URL: ${err?.message || "Unknown error"}`,
      };
    }
  }

  // Step 2: Fetch the actual XHS page HTML
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
        videoLinks: [],
        imageLinks: [],
        debugUrls: [],
        resolvedUrl,
        error: `Failed to fetch XHS page: HTTP ${pageResponse.status}`,
      };
    }

    html = await pageResponse.text();
  } catch (err: any) {
    return {
      videoLinks: [],
      imageLinks: [],
      debugUrls: [],
      resolvedUrl,
      error: `Failed to fetch XHS page: ${err?.message || "Unknown error"}`,
    };
  }

  // Step 3: Extract video URLs from HTML
  // XHS typically embeds video URLs in script tags as JSON
  const videoLinks = new Set<string>();
  const imageLinks = new Set<string>();
  const debugUrls: string[] = [];

  // Look for video URLs in script tags (XHS often embeds JSON data here)
  const scriptMatches = html.matchAll(/<script[^>]*>(.*?)<\/script>/gis);
  for (const match of scriptMatches) {
    const scriptContent = match[1];
    // Look for xhscdn.com video URLs
    const xhsVideoMatches = scriptContent.matchAll(/https?:\/\/[^"'\s<>]+xhscdn[^"'\s<>]+\.mp4[^"'\s<>]*/gi);
    for (const vidMatch of xhsVideoMatches) {
      const cleanUrl = vidMatch[0].replace(/\\\//g, "/").replace(/&amp;/g, "&");
      videoLinks.add(cleanUrl);
      debugUrls.push(cleanUrl);
    }
    // Look for JSON objects that might contain video URLs
    try {
      const jsonMatches = scriptContent.matchAll(/"url"\s*:\s*"([^"]+)"/gi);
      for (const jsonMatch of jsonMatches) {
        const url = jsonMatch[1].replace(/\\\//g, "/");
        if (/xhscdn.*\.mp4/i.test(url)) {
          videoLinks.add(url);
          debugUrls.push(url);
        }
        if (/xhscdn.*\.(jpg|jpeg|png|webp)/i.test(url)) {
          imageLinks.add(url);
        }
      }
    } catch {
      // Ignore JSON parse errors
    }
  }

  // Look for video URLs in data attributes
  const dataAttrMatches = html.matchAll(/data-(?:video-)?url=["'](https?:\/\/[^"'\s<>]+\.mp4[^"'\s<>]*)["']/gi);
  for (const match of dataAttrMatches) {
    const cleanUrl = match[1].replace(/\\\//g, "/").replace(/&amp;/g, "&");
    videoLinks.add(cleanUrl);
    debugUrls.push(cleanUrl);
  }

  // Look for video source tags
  const videoSrcMatches = html.matchAll(/<video[^>]+src=["'](https?:\/\/[^"'\s<>]+)["']/gi);
  for (const match of videoSrcMatches) {
    const cleanUrl = match[1].replace(/\\\//g, "/").replace(/&amp;/g, "&");
    if (/\.mp4/i.test(cleanUrl)) {
      videoLinks.add(cleanUrl);
      debugUrls.push(cleanUrl);
    }
  }

  // Look for source tags inside video elements
  const sourceMatches = html.matchAll(/<source[^>]+src=["'](https?:\/\/[^"'\s<>]+\.mp4[^"'\s<>]*)["']/gi);
  for (const match of sourceMatches) {
    const cleanUrl = match[1].replace(/\\\//g, "/").replace(/&amp;/g, "&");
    videoLinks.add(cleanUrl);
    debugUrls.push(cleanUrl);
  }

  // Generic URL sweep for xhscdn.com
  const allUrlMatches = html.match(/https?:\/\/[^\s"'<>]+/gi) || [];
  for (const urlMatch of allUrlMatches) {
    const cleanUrl = urlMatch.replace(/\\\//g, "/").replace(/&amp;/g, "&");
    if (/xhscdn.*\.mp4/i.test(cleanUrl)) {
      videoLinks.add(cleanUrl);
      debugUrls.push(cleanUrl);
    }
    if (/xhscdn.*\.(jpg|jpeg|png|webp)/i.test(cleanUrl)) {
      imageLinks.add(cleanUrl);
    }
  }

  // Step 4: Test the first video URL with curl-like headers
  let testedVideoUrl: string | undefined;
  let testResult: XHSDownloadResult["testResult"] | undefined;

  const videoArray = Array.from(videoLinks);
  if (videoArray.length > 0) {
    testedVideoUrl = videoArray[0];
    try {
      // Use the exact headers from the curl command provided
      const testHeaders: Record<string, string> = {
        "sec-ch-ua-platform": '"macOS"',
        "Referer": "https://www.xiaohongshu.com/",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
        "sec-ch-ua": '"Google Chrome";v="141", "Not?A_Brand";v="8", "Chromium";v="141"',
        "Range": "bytes=10070-1120327",
        "sec-ch-ua-mobile": "?0",
      };

      const testResponse = await fetch(testedVideoUrl, {
        method: "GET",
        headers: testHeaders,
        redirect: "follow",
      });

      const contentType = testResponse.headers.get("content-type") || "";
      const responseHeaders: Record<string, string> = {};
      testResponse.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      testResult = {
        status: testResponse.status,
        contentType,
        accessible: testResponse.ok && (testResponse.status === 200 || testResponse.status === 206),
        headers: responseHeaders,
      };
    } catch (err: any) {
      testResult = {
        status: 0,
        accessible: false,
      };
    }
  }

  const finalVideoLinks = Array.from(videoLinks);
  const finalImageLinks = Array.from(imageLinks);

  return {
    videoLinks: finalVideoLinks,
    imageLinks: finalImageLinks,
    debugUrls: Array.from(new Set(debugUrls)).slice(0, 20),
    resolvedUrl,
    testedVideoUrl,
    testResult,
  };
}

export async function POST(req: Request): Promise<NextResponse<XHSDownloadResult>> {
  try {
    const body = (await req.json()) as { url?: string; urls?: string[] };
    
    // Support both single url (backward compatibility) and urls array
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
        { success: false, imageLinks: [], videoLinks: [], error: "No valid URLs found in input" },
        { status: 400 }
      );
    }

    // Process all URLs in parallel
    const results = await Promise.allSettled(urls.map((url) => processSingleUrl(url)));

    // Combine all results
    const allVideoLinks = new Set<string>();
    const allImageLinks = new Set<string>();
    const allDebugUrls: string[] = [];
    const errors: string[] = [];
    let firstResolvedUrl: string | undefined;
    let firstTestedVideoUrl: string | undefined;
    let firstTestResult: XHSDownloadResult["testResult"] | undefined;

    for (const result of results) {
      if (result.status === "fulfilled") {
        result.value.videoLinks.forEach((link) => allVideoLinks.add(link));
        result.value.imageLinks.forEach((link) => allImageLinks.add(link));
        allDebugUrls.push(...result.value.debugUrls);
        if (!firstResolvedUrl) firstResolvedUrl = result.value.resolvedUrl;
        if (!firstTestedVideoUrl && result.value.testedVideoUrl) {
          firstTestedVideoUrl = result.value.testedVideoUrl;
          firstTestResult = result.value.testResult;
        }
        if (result.value.error) {
          errors.push(result.value.error);
        }
      } else {
        errors.push(result.reason?.message || "Unknown error processing URL");
      }
    }

    const finalVideoLinks = Array.from(allVideoLinks);
    const finalImageLinks = Array.from(allImageLinks);

    const hasMedia = finalVideoLinks.length > 0 || finalImageLinks.length > 0;
    let errorMessage: string | undefined = undefined;
    
    if (!hasMedia) {
      if (errors.length > 0) {
        errorMessage = `No media found. Errors: ${errors.join("; ")}`;
      } else {
        errorMessage = "No images or videos found on this page. The page may require authentication, or the content may not be accessible.";
      }
    } else if (errors.length > 0) {
      errorMessage = `Some URLs failed: ${errors.join("; ")}`;
    }

    return NextResponse.json({
      success: hasMedia,
      imageLinks: finalImageLinks,
      videoLinks: finalVideoLinks,
      debugUrls: Array.from(new Set(allDebugUrls)).slice(0, 50), // Increase limit for multiple URLs
      resolvedUrl: firstResolvedUrl,
      testedVideoUrl: firstTestedVideoUrl,
      testResult: firstTestResult,
      error: errorMessage,
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        success: false,
        imageLinks: [],
        videoLinks: [],
        error: e?.message || "Failed to scrape",
      },
      { status: 500 }
    );
  }
}


