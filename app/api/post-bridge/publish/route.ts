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
    };

    if (!Array.isArray(body.mediaUrls) || body.mediaUrls.length === 0) {
      return NextResponse.json({ error: "No media URLs provided" }, { status: 400 });
    }
    if (!Array.isArray(body.destinations) || body.destinations.length === 0) {
      return NextResponse.json({ error: "No destinations provided" }, { status: 400 });
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

    // Prefer posting videos: filter the incoming list down to videos when present
    const isVideo = (u: string): boolean => /\.(mp4|mov|m3u8|mpd)(\?|$)/i.test(u);
    const isImage = (u: string): boolean => /\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(u);
    const videos = body.mediaUrls.filter(isVideo);
    const images = body.mediaUrls.filter(isImage);
    const chosenMedia = videos.length > 0 ? videos : images.length > 0 ? images : body.mediaUrls;

    // Build platform-specific configuration: for Instagram, prefer Reels when posting video
    const platform_configurations: any = videos.length > 0 ? { instagram: { placement: "reel" } } : undefined;

    // Convert destination ids to numeric array when possible (preferred by API)
    const numericDestinations = destinations
      .map((d) => Number(d))
      .filter((n) => Number.isFinite(n)) as number[];

    const payload = {
      title: body.title ?? "",
      caption: body.caption ?? "",
      text: body.caption ?? "", // compatibility with older schemas
      media_urls: chosenMedia,
      platform_configurations,
      // Preferred field:
      social_accounts: numericDestinations.length > 0 ? numericDestinations : undefined,
      // Compatibility fallbacks:
      destinations,
      social_account_ids: destinations,
      accounts: destinations,
      processing_enabled: true,
    } as const;

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
      return NextResponse.json(json ?? { error: text || "Failed to publish" }, { status: res.status });
    }
    return NextResponse.json(json ?? { ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unexpected error" }, { status: 500 });
  }
}

