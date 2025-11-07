import { NextResponse } from "next/server";

export async function POST(req: Request): Promise<NextResponse> {
  const baseUrl = process.env.POSTBRIDGE_BASE_URL ?? "https://api.post-bridge.com";
  const apiKey = process.env.POSTBRIDGE_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "POSTBRIDGE_API_KEY missing" }, { status: 500 });
  }

  try {
    const body = (await req.json()) as {
      mediaUrls: string[];
      mediaIds?: string[];
      destinations: string[];
      caption?: string;
      captions?: string[]; // Optional array of captions, one per video
      startDate: string; // ISO date string (YYYY-MM-DD)
      startTime: string; // HH:mm format
      videosPerDay: number; // 1-24
      title?: string;
    };

    const hasMediaUrls = Array.isArray(body.mediaUrls) && body.mediaUrls.length > 0;
    const hasMediaIds = Array.isArray(body.mediaIds) && body.mediaIds.length > 0;
    if (!hasMediaUrls && !hasMediaIds) {
      return NextResponse.json({ error: "No media provided (URLs or IDs)" }, { status: 400 });
    }
    if (!Array.isArray(body.destinations) || body.destinations.length === 0) {
      return NextResponse.json({ error: "No destinations provided" }, { status: 400 });
    }
    if (!body.startDate || !body.startTime) {
      return NextResponse.json({ error: "Start date and time are required" }, { status: 400 });
    }
    if (!body.videosPerDay || body.videosPerDay < 1 || body.videosPerDay > 24) {
      return NextResponse.json({ error: "Videos per day must be between 1 and 24" }, { status: 400 });
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

    // Convert destination ids to numeric array when possible (preferred by API)
    const numericDestinations = destinations
      .map((d) => Number(d))
      .filter((n) => Number.isFinite(n)) as number[];

    // Parse start date and time
    const [year, month, day] = body.startDate.split("-").map(Number);
    const [hours, minutes] = body.startTime.split(":").map(Number);
    const startDateTime = new Date(Date.UTC(year, month - 1, day, hours, minutes, 0));

    // Calculate schedule: distribute videos across days based on videosPerDay
    const sourceList = (Array.isArray(body.mediaIds) && body.mediaIds.length > 0)
      ? body.mediaIds
      : (Array.isArray(body.mediaUrls) ? body.mediaUrls : []);
    const totalVideos = sourceList.length;
    const totalDays = Math.ceil(totalVideos / body.videosPerDay);
    const results: any[] = [];

    // Process files in batches to avoid request entity too large errors
    // Process 10 files at a time to keep request size manageable
    const BATCH_SIZE = 10;
    const batches = Math.ceil(sourceList.length / BATCH_SIZE);

    for (let batchIndex = 0; batchIndex < batches; batchIndex++) {
      const startIndex = batchIndex * BATCH_SIZE;
      const endIndex = Math.min(startIndex + BATCH_SIZE, sourceList.length);
      
      // Process files in this batch
      for (let i = startIndex; i < endIndex; i++) {
        const dayIndex = Math.floor(i / body.videosPerDay);
        const videoIndexInDay = i % body.videosPerDay;
        
        // Calculate scheduled time: start time + (day offset) + (time offset within day)
        const scheduledDate = new Date(startDateTime);
        scheduledDate.setUTCDate(scheduledDate.getUTCDate() + dayIndex);
        
        // Distribute videos throughout the day (evenly spaced)
        // Calculate time interval: if videosPerDay is 3, space them every 8 hours (24/3)
        // Example: start at 9:00, videos at 9:00, 17:00, 01:00 (next day)
        // But we want to keep within the same day, so we'll distribute evenly from start time
        const hoursPerDay = 24;
        const timeIntervalHours = hoursPerDay / body.videosPerDay;
        const scheduledHours = hours + (videoIndexInDay * timeIntervalHours);
        
        // If scheduled hours exceed 24, wrap to next day but keep within reasonable bounds
        let scheduledHour = Math.floor(scheduledHours) % 24;
        const scheduledMinute = Math.floor((scheduledHours % 1) * 60);
        
        // If we wrapped past midnight, we're on the next day
        if (scheduledHours >= 24) {
          scheduledDate.setUTCDate(scheduledDate.getUTCDate() + 1);
        }
        
        scheduledDate.setUTCHours(scheduledHour, scheduledMinute, 0, 0);

        const scheduledAt = scheduledDate.toISOString();

        // Determine media source and type
        const mediaItem = sourceList[i];
        const isVideo = /\.(mp4|mov|m3u8|mpd)(\?|$)/i.test(mediaItem);
        const isImage = /\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(mediaItem);
        
        // Check if mediaItem is a UUID (from uploads) - matching working sample pattern
        const isMediaId = (id: string): boolean => {
          return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
        };
        
        // Use individual caption if available, otherwise fall back to bulk caption
        const videoCaption = (body.captions && body.captions[i] !== undefined) 
          ? body.captions[i] 
          : (body.caption ?? "");
        
        // Build platform-specific configuration (only when we can detect media type)
        const platform_configurations: any = isVideo ? { instagram: { placement: "reel" } } : undefined;

        // Limit caption length to prevent request entity too large errors
        // Most platforms have limits (e.g., Instagram ~2200 chars, Twitter ~280 chars)
        const maxCaptionLength = 2200;
        const truncatedCaption = videoCaption.length > maxCaptionLength 
          ? videoCaption.substring(0, maxCaptionLength) 
          : videoCaption;

        // Build payload according to Post Bridge API specification
        // Reference: https://api.post-bridge.com/reference#tag/posts/post/v1/posts
        // According to working sample: use 'media' array for UUID media IDs, 'media_urls' for URLs
        const payload: Record<string, any> = {
          scheduled_at: scheduledAt,
          processing_enabled: true,
        };

        // Check if mediaItem is a UUID (from uploads) or a regular URL
        // If we're scheduling by IDs and it's a UUID, use 'media' array; otherwise use 'media_urls'
        const isId = !/^https?:\/\//i.test(mediaItem) && !isImage && !isVideo;
        if (Array.isArray(body.mediaIds) && body.mediaIds.length > 0 && (isId || sourceList === body.mediaIds)) {
          // Check if it's a UUID format (from uploads)
          if (isMediaId(mediaItem)) {
            payload.media = [mediaItem];
          } else {
            payload.media_ids = [mediaItem];
          }
        } else {
          payload.media_urls = [mediaItem];
        }

        // Add caption if provided
        if (truncatedCaption && truncatedCaption.trim()) {
          payload.caption = truncatedCaption.trim();
        }

        // Add optional fields only if they have values
        if (body.title && body.title.trim()) {
          payload.title = body.title.trim();
        }
        if (platform_configurations) {
          payload.platform_configurations = platform_configurations;
        }
        // Add social accounts (REQUIRED field)
        // The API requires at least one social account to be specified
        if (numericDestinations.length > 0) {
          payload.social_accounts = numericDestinations;
        } else {
          // Skip this post if no valid destinations found
          results.push({
            mediaUrl: mediaItem,
            scheduledAt,
            success: false,
            error: "No valid social account destinations found",
          });
          continue;
        }

        try {
          const res = await fetch(`${baseUrl}/v1/posts`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify(payload),
          });
          const text = await res.text();
          let json: any;
          try { json = JSON.parse(text); } catch { /* keep text */ }
          
          if (!res.ok) {
            console.error(`Post-Bridge API error for media ${i}:`, {
              status: res.status,
              statusText: res.statusText,
              response: json ?? text,
              payload: {
                ...payload,
                media: Array.isArray((payload as any).media) ? (payload as any).media : undefined,
                media_urls: Array.isArray(payload.media_urls)
                  ? payload.media_urls.map((u: string) => `${u.substring(0,50)}...`)
                  : undefined,
                media_ids: Array.isArray((payload as any).media_ids) ? (payload as any).media_ids : undefined,
              }, // Truncate for logging
            });
          }
          
          results.push({
            mediaUrl: mediaItem,
            scheduledAt,
            success: res.ok,
            response: json ?? { error: text || "Failed to schedule" },
            error: res.ok ? undefined : (json?.error || json?.message || text || `HTTP ${res.status}`),
          });
        } catch (e: any) {
          console.error(`Exception scheduling media ${i}:`, e);
          results.push({
            mediaUrl: mediaItem,
            scheduledAt,
            success: false,
            error: e?.message || "Request failed",
          });
        }
      }
      
      // Add a small delay between batches to avoid rate limiting
      if (batchIndex < batches - 1) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const errors = results.filter((r) => !r.success).map((r) => r.error || r.response?.error || "Unknown error");
    
    return NextResponse.json({
      success: successCount > 0,
      total: results.length,
      scheduled: successCount,
      results,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unexpected error" }, { status: 500 });
  }
}
