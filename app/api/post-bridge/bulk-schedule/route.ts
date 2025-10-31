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
      destinations: string[];
      caption?: string;
      captions?: string[]; // Optional array of captions, one per video
      startDate: string; // ISO date string (YYYY-MM-DD)
      startTime: string; // HH:mm format
      videosPerDay: number; // 1-24
      title?: string;
    };

    if (!Array.isArray(body.mediaUrls) || body.mediaUrls.length === 0) {
      return NextResponse.json({ error: "No media URLs provided" }, { status: 400 });
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

    // Resolve any "platform:handle" pseudo-ids to real destination IDs if possible
    const destinations: string[] = [];
    const needsResolution = body.destinations.some((d) => d.includes(":"));
    if (needsResolution) {
      try {
        const res = await fetch(`${baseUrl}/v1/destinations`, {
          headers: { Authorization: `Bearer ${apiKey}` },
          cache: "no-store",
        });
        if (res.ok) {
          const json: any = await res.json();
          const arr: any[] = Array.isArray(json) ? json : (json.destinations ?? json.data ?? []);
          for (const token of body.destinations) {
            const [plat, handle] = token.split(":");
            const found = arr.find((d: any) => {
              const p = (d.platform || d.provider || d.network || d.type || "").toLowerCase();
              const h = (d.handle || d.username || d.name || "").toLowerCase();
              const norm = p.includes("insta") ? "instagram" : p.includes("twitter") || p === "x" ? "x" : p;
              return norm === plat && h === handle.toLowerCase();
            });
            if (found?.id) destinations.push(String(found.id)); else destinations.push(token);
          }
        } else {
          destinations.push(...body.destinations);
        }
      } catch {
        destinations.push(...body.destinations);
      }
    } else {
      destinations.push(...body.destinations);
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
    const totalVideos = body.mediaUrls.length;
    const totalDays = Math.ceil(totalVideos / body.videosPerDay);
    const results: any[] = [];

    // Create posts for each video with scheduled times
    for (let i = 0; i < body.mediaUrls.length; i++) {
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

      // Determine media type
      const mediaUrl = body.mediaUrls[i];
      const isVideo = /\.(mp4|mov|m3u8|mpd)(\?|$)/i.test(mediaUrl);
      const isImage = /\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(mediaUrl);
      
      // Use individual caption if available, otherwise fall back to bulk caption
      const videoCaption = (body.captions && body.captions[i] !== undefined) 
        ? body.captions[i] 
        : (body.caption ?? "");
      
      // Build platform-specific configuration
      const platform_configurations: any = isVideo ? { instagram: { placement: "reel" } } : undefined;

      const payload = {
        title: body.title ?? "",
        caption: videoCaption,
        text: videoCaption, // compatibility with older schemas
        media_urls: [mediaUrl],
        platform_configurations,
        social_accounts: numericDestinations.length > 0 ? numericDestinations : undefined,
        destinations: numericDestinations.length === 0 ? destinations : undefined,
        social_account_ids: numericDestinations.length === 0 ? destinations : undefined,
        accounts: numericDestinations.length === 0 ? destinations : undefined,
        scheduled_at: scheduledAt,
        processing_enabled: true,
      };

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
        
        results.push({
          mediaUrl,
          scheduledAt,
          success: res.ok,
          response: json ?? { error: text || "Failed to schedule" },
        });
      } catch (e: any) {
        results.push({
          mediaUrl,
          scheduledAt,
          success: false,
          error: e?.message || "Request failed",
        });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    return NextResponse.json({
      success: successCount > 0,
      total: results.length,
      scheduled: successCount,
      results,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unexpected error" }, { status: 500 });
  }
}

