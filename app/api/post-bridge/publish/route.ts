import { NextResponse } from "next/server";

export async function POST(req: Request): Promise<NextResponse> {
  const baseUrl = process.env.POSTBRIDGE_BASE_URL ?? "https://api.post-bridge.com";
  const apiKey = process.env.POSTBRIDGE_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "POSTBRIDGE_API_KEY missing" }, { status: 500 });
  }

  try {
    const body = (await req.json()) as {
      title?: string;
      caption?: string;
      mediaUrls: string[];
      destinations: string[];
      mediaIds?: string[];
    };

    const hasMediaUrls = Array.isArray(body.mediaUrls) && body.mediaUrls.length > 0;
    const hasMediaIds = Array.isArray(body.mediaIds) && body.mediaIds.length > 0;
    if (!hasMediaUrls && !hasMediaIds) {
      return NextResponse.json({ error: "No media provided (URLs or IDs)" }, { status: 400 });
    }
    if (!Array.isArray(body.destinations) || body.destinations.length === 0) {
      return NextResponse.json({ error: "No destinations provided" }, { status: 400 });
    }

    // Resolve any destination tokens to real destination IDs if possible
    const destinations: string[] = [];
    const tryDestPaths = [
      `/v1/destinations`,
      `/destinations`,
      `/v1/accounts`,
      `/v1/social-accounts`,
      `/v1/channels`,
    ];

    const fetchDestList = async (): Promise<any[]> => {
      for (const p of tryDestPaths) {
        try {
          const r = await fetch(`${baseUrl}${p}`, {
            headers: { Authorization: `Bearer ${apiKey}` },
            cache: "no-store",
          });
          if (!r.ok) continue;
          const j: any = await r.json();
          const arr: any[] = Array.isArray(j)
            ? j
            : (j.destinations ?? j.accounts ?? j.data ?? j.items ?? []);
          if (arr && arr.length) return arr;
        } catch {
          // try next path
        }
      }
      return [];
    };

    const needsResolution = body.destinations.some((d) => d.includes(":"));
    const destList = needsResolution ? await fetchDestList() : [];

    for (const token of body.destinations) {
      if (token.includes(":")) {
        const [plat, handle] = token.split(":");
        const found = destList.find((d: any) => {
          const p = (d.platform || d.provider || d.network || d.type || "").toLowerCase();
          const h = (d.handle || d.username || d.name || d.screen_name || "").toLowerCase();
          const norm = p.includes("insta") ? "instagram" : p.includes("twitter") || p === "x" ? "x" : p;
          return norm === plat && h === handle.toLowerCase();
        });
        if (found) {
          const rawId = found.account_id ?? found.social_account_id ?? found.destination_id ?? found.id ?? found._id;
          destinations.push(rawId !== undefined ? String(rawId) : token);
        } else {
          destinations.push(token);
        }
      } else {
        destinations.push(token);
      }
    }

    // Determine whether we have media IDs or URLs
    const inputUrls = Array.isArray(body.mediaUrls) ? body.mediaUrls : [];
    const inputIds = Array.isArray(body.mediaIds) ? body.mediaIds : [];
    const hasIds = inputIds.length > 0;
    const hasUrls = inputUrls.length > 0;

    const isVideo = (u: string): boolean => /\.(mp4|mov|m3u8|mpd)(\?|$)/i.test(u);
    const isImage = (u: string): boolean => /\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(u);

    // Verify media readiness if using media IDs
    // Post-Bridge media needs to be processed before it can be used in posts
    let useMediaIds = hasIds;
    if (hasIds) {
      const verifyMediaReady = async (mediaId: string): Promise<{ ready: boolean; url?: string }> => {
        try {
          const mediaRes = await fetch(`${baseUrl}/v1/media/${mediaId}`, {
            headers: { Authorization: `Bearer ${apiKey}` },
            cache: "no-store",
          });
          if (!mediaRes.ok) return { ready: false };
          const mediaData = (await mediaRes.json()) as {
            status?: string;
            state?: string;
            processed?: boolean;
            url?: string;
            media_url?: string;
          };
          // Media is ready if it has a status of 'ready', 'processed', or has a URL
          const status = (mediaData.status || mediaData.state || "").toLowerCase();
          const url = mediaData.url || mediaData.media_url;
          const isReady =
            status === "ready" ||
            status === "processed" ||
            status === "complete" ||
            mediaData.processed === true ||
            !!url;
          return { ready: isReady, url };
        } catch {
          return { ready: false };
        }
      };

      // Check if all media IDs are ready
      const mediaReadinessChecks = await Promise.all(inputIds.map(verifyMediaReady));
      const allReady = mediaReadinessChecks.every((check) => check.ready);

      // If not all media is ready and we don't have URLs, try to fetch URLs from media details
      if (!allReady && !hasUrls) {
        const fetchedUrls: string[] = [];
        for (let i = 0; i < mediaReadinessChecks.length; i++) {
          if (mediaReadinessChecks[i].url) {
            fetchedUrls.push(mediaReadinessChecks[i].url!);
          }
        }
        if (fetchedUrls.length === inputIds.length) {
          // We got URLs for all media, use URLs instead
          inputUrls.push(...fetchedUrls);
          useMediaIds = false;
          console.log("Media IDs not ready, using fetched media URLs instead");
        } else {
          console.warn("Some media IDs may not be ready, but proceeding with IDs");
        }
      } else if (!allReady && hasUrls) {
        // Prefer URLs if media isn't ready
        useMediaIds = false;
        console.log("Media IDs not ready, using provided media URLs instead");
      }
    }

    let platform_configurations: any | undefined;
    let payloadMedia: { kind: "urls" | "ids"; urls?: string[]; ids?: (string | number)[] };

    if (useMediaIds && hasIds) {
      // Use media IDs when available and ready
      payloadMedia = { kind: "ids", ids: inputIds };
    } else if (hasUrls) {
      // Use URLs path (more reliable for immediate publishing)
      const urlCandidates: string[] = inputUrls.slice();
      const videos = urlCandidates.filter(isVideo);
      const images = urlCandidates.filter(isImage);
      const chosenMedia = videos.length > 0 ? videos : images.length > 0 ? images : urlCandidates;
      platform_configurations = videos.length > 0 ? { instagram: { placement: "reel" } } : undefined;
      payloadMedia = { kind: "urls", urls: chosenMedia };
    } else if (hasIds) {
      // Only IDs available, use them (may fail if not ready)
      payloadMedia = { kind: "ids", ids: inputIds };
    } else {
      return NextResponse.json({ error: "No media provided (URLs or IDs)" }, { status: 400 });
    }

    // Convert destination ids to numeric array when possible (preferred by API)
    const numericDestinations = destinations
      .map((d) => Number(d))
      .filter((n) => Number.isFinite(n)) as number[];

    // Build payload according to Post Bridge API specification
    // Reference: https://api.post-bridge.com/reference#tag/posts/post/v1/posts
    // According to working sample: use 'media' array for UUID media IDs, 'media_urls' for URLs
    const payload: Record<string, any> = {};

    // Check if media IDs are UUIDs (from uploads) or regular URLs
    const isMediaId = (id: string): boolean => {
      return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    };

    if (payloadMedia.kind === "urls") {
      payload.media_urls = payloadMedia.urls;
      console.log(`Using media_urls (${payloadMedia.urls?.length || 0} URLs)`);
    } else if (payloadMedia.ids && payloadMedia.ids.length > 0) {
      // Check if IDs are UUIDs (from uploads) - use 'media' array
      // Otherwise treat as regular IDs and use 'media_ids'
      const firstId = String(payloadMedia.ids[0]);
      if (isMediaId(firstId)) {
        // All IDs should be UUIDs if first one is
        payload.media = payloadMedia.ids;
        console.log(`Using media array (${payloadMedia.ids.length} UUIDs)`);
      } else {
        payload.media_ids = payloadMedia.ids;
        console.log(`Using media_ids (${payloadMedia.ids.length} IDs)`);
      }
    }

    // Add caption if provided
    if (body.caption && body.caption.trim()) {
      payload.caption = body.caption.trim();
    }

    // Add title if provided
    if (body.title && body.title.trim()) {
      payload.title = body.title.trim();
    }

    // Add social accounts (REQUIRED field)
    // The API requires at least one social account to be specified
    if (numericDestinations.length > 0) {
      payload.social_accounts = numericDestinations;
    } else {
      // If no valid destinations found, return error
      return NextResponse.json(
        { error: "No valid numeric social account IDs resolved. Please select a valid account." },
        { status: 400 }
      );
    }

    // Add platform configurations if needed
    if (platform_configurations) {
      payload.platform_configurations = platform_configurations;
    }

    // Enable processing
    payload.processing_enabled = true;

    // Log the exact payload being sent to Post-Bridge API
    const payloadLog = {
      has_media: !!(payload as any).media,
      has_media_ids: !!(payload as any).media_ids,
      has_media_urls: !!(payload as any).media_urls,
      media: (payload as any).media,
      media_ids: (payload as any).media_ids,
      media_urls: (payload as any).media_urls ? ((payload as any).media_urls as string[]).map((url: string) => url.substring(0, 50) + "...") : undefined,
      social_accounts: payload.social_accounts,
      caption: payload.caption?.substring(0, 50),
      processing_enabled: payload.processing_enabled,
    };
    console.log("📤 Post-Bridge API Request Payload:", JSON.stringify(payloadLog, null, 2));
    console.log("📤 Full payload (media):", (payload as any).media);
    console.log("📤 Full payload (media_ids):", (payload as any).media_ids);
    console.log("📤 Full payload (media_urls):", (payload as any).media_urls);

    const res = await fetch(`${baseUrl}/v1/posts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": "PostBridge/1.0.0 (+https://api.post-bridge.com)",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    const text = await res.text();
    let json: any;
    try {
      json = JSON.parse(text);
    } catch {
      // Response is not JSON, keep as text
    }

    if (!res.ok) {
      // Log error details for debugging
      console.error("Post-Bridge API error:", {
        status: res.status,
        statusText: res.statusText,
        response: json ?? text,
        payload: {
          ...payload,
          media: Array.isArray((payload as any).media) ? (payload as any).media : undefined,
          media_urls: Array.isArray(payload.media_urls)
            ? payload.media_urls.map((url: string) => url.substring(0, 50) + "...")
            : undefined,
          media_ids: Array.isArray((payload as any).media_ids)
            ? (payload as any).media_ids
            : undefined,
          social_accounts: payload.social_accounts,
        },
      });

      // If using media/media_ids failed, suggest trying with URLs if available
      if (((payload as any).media || (payload as any).media_ids) && hasUrls) {
        console.warn("Publish failed with media/media_ids. Consider using media_urls instead.");
      }

      // Return structured error response
      const errorMessage = json?.message || json?.error || text || `HTTP ${res.status}: ${res.statusText}`;
      return NextResponse.json(
        {
          error: errorMessage,
          details: json,
          status: res.status,
        },
        { status: res.status }
      );
    }

    // Return success response with debug info
    const responseData = json ?? { success: true, ok: true };
    // Add debug info about what was sent (for testing)
    if (process.env.NODE_ENV !== "production") {
      (responseData as any).debug = {
        used_media: !!(payload as any).media,
        used_media_ids: !!(payload as any).media_ids,
        used_media_urls: !!(payload as any).media_urls,
        media_count: Array.isArray((payload as any).media) ? (payload as any).media.length : 0,
        media_ids_count: Array.isArray((payload as any).media_ids) ? (payload as any).media_ids.length : 0,
        media_urls_count: Array.isArray((payload as any).media_urls) ? (payload as any).media_urls.length : 0,
      };
    }
    return NextResponse.json(responseData);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unexpected error" }, { status: 500 });
  }
}
