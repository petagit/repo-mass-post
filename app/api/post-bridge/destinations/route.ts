import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

interface DestinationDto {
  id: string;
  platform: "instagram" | "x";
  handle: string;
  displayName?: string;
  avatarUrl?: string;
}

export async function GET(): Promise<NextResponse> {
  const baseUrl = process.env.POSTBRIDGE_BASE_URL ?? "https://api.post-bridge.com";
  const apiKey = process.env.POSTBRIDGE_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error: "POSTBRIDGE_API_KEY missing. Create .env.local with POSTBRIDGE_API_KEY and restart.",
        platforms: { instagram: [], x: [] },
        defaults: [],
      },
      { status: 500 }
    );
  }

  try {
    // Try multiple likely endpoints in case the reference path differs.
    const tryPaths = [
      `/v1/destinations`,
      `/destinations`,
      `/v1/accounts`,
      `/v1/social-accounts`,
      `/v1/channels`,
    ];

    let list: DestinationDto[] = [];
    let lastErrorText = "";
    for (const p of tryPaths) {
      const res = await fetch(`${baseUrl}${p}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        cache: "no-store",
      });
      if (!res.ok) {
        lastErrorText = (await res.text()) || `HTTP ${res.status}`;
        continue;
      }
      const json: any = await res.json();
      const arr: any[] = Array.isArray(json)
        ? json
        : (json.destinations ?? json.accounts ?? json.data ?? json.items ?? []);
      list = arr
        .map((raw: any): DestinationDto | null => {
          const id: string | undefined = raw.id || raw.account_id || raw.destination_id || raw._id;
          const platformRaw: string | undefined = raw.platform || raw.provider || raw.network || raw.type;
          const handleRaw: string | undefined = raw.handle || raw.username || raw.name || raw.screen_name;
          if (!id || !platformRaw || !handleRaw) return null;
          const plat = platformRaw.toLowerCase();
          const normalizedPlatform = plat.includes("insta") ? "instagram" : plat.includes("twitter") || plat === "x" ? "x" : undefined;
          if (!normalizedPlatform) return null;
          return {
            id: String(id),
            platform: normalizedPlatform,
            handle: String(handleRaw),
            displayName: raw.displayName || raw.title || raw.name,
            avatarUrl: raw.avatar || raw.avatarUrl || raw.picture,
          };
        })
        .filter(Boolean) as DestinationDto[];
      if (list.length > 0) break;
    }
    if (list.length === 0) {
      // Fallback: synthesize destinations from env handles so the UI remains usable
      const fallback: DestinationDto[] = [];
      const envIg = process.env.POSTBRIDGE_DEFAULT_IG || "costights";
      const envX = process.env.POSTBRIDGE_DEFAULT_X || "costights";
      if (envIg) fallback.push({ id: `instagram:${envIg}`, platform: "instagram", handle: envIg });
      if (envX) fallback.push({ id: `x:${envX}`, platform: "x", handle: envX });
      list = fallback;
      lastErrorText = lastErrorText || "Could not fetch destinations from API; using env defaults.";
    }

    const instagram = list.filter((d) => d.platform === "instagram");
    const x = list.filter((d) => d.platform === "x");

    // Defaults: prefer handles from env, fall back to the first available
    const defaultIg = process.env.POSTBRIDGE_DEFAULT_IG || "costights";
    const defaultX = process.env.POSTBRIDGE_DEFAULT_X || "costights";

    const defaults: string[] = [];
    const igDefault = instagram.find((d) => d.handle.toLowerCase() === defaultIg.toLowerCase());
    if (igDefault) defaults.push(igDefault.id);
    const xDefault = x.find((d) => d.handle.toLowerCase() === defaultX.toLowerCase());
    if (xDefault) defaults.push(xDefault.id);

    return NextResponse.json({ platforms: { instagram, x }, defaults, error: instagram.length + x.length > 0 ? undefined : lastErrorText });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unexpected error" }, { status: 500 });
  }
}



