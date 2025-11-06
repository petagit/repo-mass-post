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

  // Look for images in script tags (common for XHS and other platforms)
  const scriptMatches = html.matchAll(/<script[^>]*>(.*?)<\/script>/gis);
  for (const match of scriptMatches) {
    const scriptContent = match[1];
    
    // Look for xhscdn.com image URLs (XHS specific - may not have file extensions)
    // Pattern matches URLs like: https://sns-webpic-qc.xhscdn.com/.../.../..._webp_3
    // Exclude video URLs (.mp4) and common non-image patterns
    const xhsImageMatches = scriptContent.matchAll(/https?:\/\/[^"'\s<>]*xhscdn[^"'\s<>]*/gi);
    for (const xhsMatch of xhsImageMatches) {
      let cleanUrl = xhsMatch[0].replace(/\\\//g, "/").replace(/&amp;/g, "&");
      // Decode unicode escapes like \u0021 (!)
      cleanUrl = cleanUrl.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
      // Exclude videos and common non-image patterns
      const cleanUrlLower = cleanUrl.toLowerCase();
      if (!cleanUrl.includes(".mp4") && 
          !cleanUrlLower.includes("logo") && 
          !cleanUrlLower.includes("icon") && 
          !cleanUrlLower.includes("avatar") &&
          !cleanUrlLower.includes("xiaohongshu") &&
          !cleanUrlLower.includes("小红书") &&
          !cleanUrl.match(/\/video\//i) &&
          !cleanUrl.match(/\/(static|assets|common|components|widgets)\//i)) {
        imageLinks.add(cleanUrl);
      }
    }
    
    // Look for JSON objects containing image URLs
    try {
      const jsonMatches = scriptContent.matchAll(/"url"\s*:\s*"([^"]+)"/gi);
      for (const jsonMatch of jsonMatches) {
        let url = jsonMatch[1].replace(/\\\//g, "/");
        // Decode unicode escapes
        url = url.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
        // Check for xhscdn URLs (may not have extensions) or URLs with image extensions
        const urlLower = url.toLowerCase();
        const isXhsCdn = /xhscdn/i.test(url);
        const hasImageExt = /\.(jpg|jpeg|png|webp|gif)/i.test(url);
        const isExcluded = urlLower.includes("logo") || 
                          urlLower.includes("icon") || 
                          urlLower.includes("avatar") ||
                          urlLower.includes("xiaohongshu") ||
                          urlLower.includes("小红书") ||
                          /\/static\/|\/assets\/|\/common\/|\/components\/|\/widgets\//i.test(url);
        
        if ((isXhsCdn || hasImageExt) && !isExcluded) {
          imageLinks.add(url);
        }
      }
      
      // Look for image URLs in various JSON patterns
      const imagePatterns = [
        /"image"\s*:\s*"([^"]+)"/gi,
        /"imageUrl"\s*:\s*"([^"]+)"/gi,
        /"picUrl"\s*:\s*"([^"]+)"/gi,
        /"src"\s*:\s*"([^"]+)"/gi,
        /"cover"\s*:\s*"([^"]+)"/gi,
        /"thumbnail"\s*:\s*"([^"]+)"/gi,
      ];
      
      for (const pattern of imagePatterns) {
        const matches = scriptContent.matchAll(pattern);
        for (const m of matches) {
          let url = m[1].replace(/\\\//g, "/");
          // Decode unicode escapes
          url = url.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
          if (url.startsWith("http")) {
            // Accept xhscdn URLs or URLs with image extensions
            if (/xhscdn/i.test(url) || /\.(jpg|jpeg|png|webp|gif)/i.test(url)) {
              imageLinks.add(url);
            }
          }
        }
      }
    } catch {
      // Ignore JSON parse errors
    }
  }

  // Look for <img> tags
  const imgMatches = html.matchAll(/<img[^>]+src=["'](https?:\/\/[^"'\s<>]+)["']/gi);
  for (const match of imgMatches) {
    let url = match[1].replace(/\\\//g, "/").replace(/&amp;/g, "&");
    // Decode unicode escapes
    url = url.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
    // Accept xhscdn URLs (may not have extensions) or URLs with image extensions
    const urlLower = url.toLowerCase();
    const isXhsCdn = /xhscdn/i.test(url);
    const hasImageExt = /\.(jpg|jpeg|png|webp|gif)/i.test(url);
    const isExcluded = urlLower.includes("logo") || 
                      urlLower.includes("icon") || 
                      urlLower.includes("avatar") ||
                      urlLower.includes("xiaohongshu") ||
                      urlLower.includes("小红书") ||
                      /\/static\/|\/assets\/|\/common\/|\/components\/|\/widgets\//i.test(url);
    
    if ((isXhsCdn || hasImageExt) && !isExcluded) {
      imageLinks.add(url);
    }
  }

  // Look for data attributes
  const dataAttrMatches = html.matchAll(/(?:data-src|data-url|data-image|data-original)=["'](https?:\/\/[^"'\s<>]+(?:\.(jpg|jpeg|png|webp|gif)|xhscdn[^"'\s<>]*)[^"'\s<>]*)["']/gi);
  for (const match of dataAttrMatches) {
    let url = match[1].replace(/\\\//g, "/").replace(/&amp;/g, "&");
    // Decode unicode escapes
    url = url.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
    const urlLower = url.toLowerCase();
    const isExcluded = urlLower.includes("logo") || 
                      urlLower.includes("icon") || 
                      urlLower.includes("avatar") ||
                      urlLower.includes("xiaohongshu") ||
                      urlLower.includes("小红书") ||
                      /\/static\/|\/assets\/|\/common\/|\/components\/|\/widgets\//i.test(url);
    
    if (!isExcluded) {
      imageLinks.add(url);
    }
  }

  // Generic URL sweep for image URLs (including xhscdn URLs without extensions)
  const allUrlMatches = html.match(/https?:\/\/[^\s"'<>]+(?:xhscdn[^\s"'<>]*|\.(jpg|jpeg|png|webp|gif)[^\s"'<>]*)/gi) || [];
  for (const urlMatch of allUrlMatches) {
    let cleanUrl = urlMatch.replace(/\\\//g, "/").replace(/&amp;/g, "&");
    // Decode unicode escapes
    cleanUrl = cleanUrl.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
    const cleanUrlLower = cleanUrl.toLowerCase();
    
    // Exclude non-image file types
    if (/\.(js|css|ico|json|html|xml|txt|woff|woff2|ttf|eot|map)(\?|$)/i.test(cleanUrlLower)) {
      continue;
    }
    
    const isExcluded = cleanUrlLower.includes("logo") || 
                      cleanUrlLower.includes("icon") || 
                      cleanUrlLower.includes("avatar") ||
                      cleanUrlLower.includes("xiaohongshu") ||
                      cleanUrlLower.includes("小红书") ||
                      /\/static\/|\/assets\/|\/common\/|\/components\/|\/widgets\//i.test(cleanUrl);
    
    if (!isExcluded) {
      imageLinks.add(cleanUrl);
    }
  }

  // Filter out non-post images (logos, UI elements, placeholders) and validate URLs
  // Also filter out low-resolution thumbnails (prefer high-res images with w/720)
  const allFiltered = Array.from(imageLinks).filter((url) => {
    const urlLower = url.toLowerCase();
    
    // Filter out XHS low-res preview images (nd_prv_ = preview, nd_dft_ = default/high-res)
    // Pattern: .../1040g...!nd_prv_... = low res thumbnail
    // Pattern: .../1040g...!nd_dft_... = high res image
    if (/!nd_prv_/i.test(urlLower)) {
      return false; // Exclude preview/thumbnail versions
    }
    
    // Filter out low-resolution thumbnails (w/120, w/200, etc.) and prefer high-res (w/720, w/1080, etc.)
    // Check for imageView2 parameters or similar sizing parameters
    if (/imageview2|imageview|imagemogr2/i.test(urlLower)) {
      // Extract width parameter if present
      const widthMatch = urlLower.match(/[\/\?&]w\/(\d+)[\/\?&]/);
      if (widthMatch) {
        const width = parseInt(widthMatch[1], 10);
        // Exclude low-res thumbnails (w/120, w/200, w/300, w/400, w/500, w/600)
        if (width < 720) {
          return false;
        }
      } else {
        // No width parameter found, but has imageView2 - might be thumbnail
        // Only allow if it's clearly a high-res pattern or xhscdn (which we'll handle separately)
        if (!/xhscdn/i.test(urlLower)) {
          return false;
        }
      }
    }
    
    // Also check for common thumbnail patterns in URLs
    if (/thumbnail|thumb|small|mini|preview/i.test(urlLower) && !/w\/720|w\/1080|w\/1440|w\/1920/.test(urlLower)) {
      return false;
    }
    
    // Remove common non-post image patterns
    const excludePatterns = [
      /logo/i,
      /icon/i,
      /avatar/i,
      /placeholder/i,
      /thumb/i,
      /1x1/i,
      /spacer/i,
      /brand/i,
      /watermark/i,
      /badge/i,
      /button/i,
      /\/ui\//i, // UI folder paths
      /-ui-/i, // UI in path separators
      /_ui_/i, // UI in underscores
      /widget/i,
      /ad/i,
      /banner/i,
      /header/i,
      /footer/i,
      /nav/i,
      /menu/i,
      /sidebar/i,
      /decoration/i,
      /ornament/i,
      /frame/i,
      /border/i,
      /background/i,
      /pattern/i,
      /texture/i,
      /sprite/i,
      /emoji/i,
      /sticker/i,
      /xiaohongshu/i, // Platform name in URL often indicates branding
      /小红书/i, // Chinese name for Xiaohongshu
      /xhs-logo/i,
      /xhs_logo/i,
      /xhslogo/i,
      /app-icon/i,
      /app_icon/i,
      /appicon/i,
      /default-avatar/i,
      /default_avatar/i,
      /defaultavatar/i,
      /empty/i,
      /loading/i,
      /spinner/i,
      /error/i,
      /404/i,
      /no-image/i,
      /noimage/i,
    ];
    
    // Check if URL matches any exclusion pattern
    for (const pattern of excludePatterns) {
      if (pattern.test(urlLower)) {
        return false;
      }
    }
    
    // Exclude common XHS UI element paths
    const xhsUIPaths = [
      /\/static\//i,
      /\/assets\//i,
      /\/images\/logo/i,
      /\/images\/icon/i,
      /\/images\/ui/i,
      /\/img\/logo/i,
      /\/img\/icon/i,
      /\/img\/ui/i,
      /\/common\//i,
      /\/components\//i,
      /\/widgets\//i,
    ];
    
    for (const pathPattern of xhsUIPaths) {
      if (pathPattern.test(urlLower)) {
        return false;
      }
    }
    
    // Exclude very small image identifiers (likely thumbnails/icons)
    // XHS post images typically have longer identifiers
    // Check if URL has suspiciously short path segments that might indicate UI elements
    try {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split("/").filter((p) => p && p.length > 0);
      
      // Exclude URLs with very short final segments (likely icons/logos)
      if (pathParts.length > 0) {
        const lastPart = pathParts[pathParts.length - 1];
        // If last part is very short and doesn't look like a content image ID, exclude it
        if (lastPart.length < 10 && !/\.(jpg|jpeg|png|webp|gif)/i.test(lastPart)) {
          // But allow if it's clearly an xhscdn content image (they have specific patterns)
          if (!/xhscdn/i.test(urlObj.hostname) || !/\d{12}/.test(url)) {
            return false;
          }
        }
      }
      
      // Ensure it's http or https
      if (!["http:", "https:"].includes(urlObj.protocol)) {
        return false;
      }
      
      // For xhscdn URLs, accept them even without file extensions
      // But exclude if they match UI patterns
      if (/xhscdn/i.test(urlObj.hostname)) {
        // XHS CDN URLs are valid even without extensions
        // But exclude if they're clearly UI elements (check path patterns)
        const pathname = urlObj.pathname.toLowerCase();
        if (/\/logo|\/icon|\/ui|\/static|\/common/i.test(pathname)) {
          return false;
        }
        return true;
      }
      
      // Other URLs must have image extensions
      if (!/\.(jpg|jpeg|png|webp|gif)/i.test(urlObj.pathname)) {
        return false;
      }
      
      // Exclude non-image file types that might have been incorrectly matched
      const pathnameLower = urlObj.pathname.toLowerCase();
      if (/\.(js|css|ico|json|html|xml|txt|woff|woff2|ttf|eot|map|svg)(\?|$)/i.test(pathnameLower)) {
        // SVG might be an image, but often it's an icon/logo, so exclude it
        if (pathnameLower.includes("logo") || pathnameLower.includes("icon") || pathnameLower.includes("sprite")) {
          return false;
        }
        // Exclude all non-image extensions except potentially valid SVGs
        if (!pathnameLower.endsWith(".svg")) {
          return false;
        }
      }
      
      return true;
    } catch {
      // Invalid URL format
      return false;
    }
  });
  
  // Deduplicate: if we have both low-res and high-res versions of the same image, keep only high-res
  // Group images by base URL (without size parameters and variant identifiers)
  const imageGroups = new Map<string, string[]>();
  
  for (const url of allFiltered) {
    // Extract base URL without size parameters and variant identifiers
    let baseUrl = url;
    // Remove imageView2 parameters to get base URL
    baseUrl = baseUrl.replace(/[?&]imageview2\/[^&]*/gi, "");
    baseUrl = baseUrl.replace(/[?&]imageview\/[^&]*/gi, "");
    baseUrl = baseUrl.replace(/[?&]imagemogr2\/[^&]*/gi, "");
    // Remove variant identifiers (!nd_prv_, !nd_dft_) to group by base image
    baseUrl = baseUrl.replace(/!nd_[^!]*/gi, "");
    
    if (!imageGroups.has(baseUrl)) {
      imageGroups.set(baseUrl, []);
    }
    imageGroups.get(baseUrl)!.push(url);
  }
  
  // For each group, prefer high-res versions
  const finalImages: string[] = [];
  for (const [baseUrl, variants] of imageGroups.entries()) {
    if (variants.length === 1) {
      // Only one variant, use it (should already be high-res due to filtering)
      finalImages.push(variants[0]);
    } else {
      // Multiple variants, prefer high-res
      // Priority: 1) nd_dft_ (default/high-res), 2) w/720+, 3) others
      const highRes = variants.find((url) => {
        const urlLower = url.toLowerCase();
        // Prefer nd_dft_ over nd_prv_
        if (/!nd_dft_/i.test(urlLower)) {
          return true;
        }
        // Check width parameter
        const widthMatch = urlLower.match(/[\/\?&]w\/(\d+)[\/\?&]/);
        if (widthMatch) {
          const width = parseInt(widthMatch[1], 10);
          return width >= 720;
        }
        // If no width parameter, prefer URLs with w/720 or higher in the path
        return /w\/720|w\/1080|w\/1440|w\/1920/.test(urlLower);
      });
      
      if (highRes) {
        finalImages.push(highRes);
      } else {
        // No high-res found, use the first one (shouldn't happen due to filtering above)
        finalImages.push(variants[0]);
      }
    }
  }

  return {
    images: finalImages,
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
