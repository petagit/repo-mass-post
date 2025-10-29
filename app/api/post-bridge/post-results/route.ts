import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export interface PostResultItem {
  id?: string;
  post_id?: string;
  success?: boolean;
  social_account_id?: number | string;
  error?: unknown;
  platform_data?: {
    id?: string;
    url?: string;
    username?: string;
  };
  // Allow passthrough of any additional vendor-specific fields
  [key: string]: unknown;
}

export async function GET(req: Request): Promise<NextResponse> {
  const baseUrl = process.env.POSTBRIDGE_BASE_URL ?? "https://api.post-bridge.com";
  const apiKey = process.env.POSTBRIDGE_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "POSTBRIDGE_API_KEY missing", data: [], offset: 0, limit: 10 },
      { status: 500 }
    );
  }

  const url = new URL(req.url);
  const src = url.searchParams;
  const offset = Number(src.get("offset") ?? "0");
  const limit = Number(src.get("limit") ?? "10");
  const postIds = src.getAll("post_id");
  const platforms = src.getAll("platform");

  const forward = new URL(`${baseUrl}/v1/post-results`);
  forward.searchParams.set("offset", String(isNaN(offset) ? 0 : offset));
  forward.searchParams.set("limit", String(isNaN(limit) ? 10 : limit));
  for (const v of postIds) if (v) forward.searchParams.append("post_id", v);
  for (const v of platforms) if (v) forward.searchParams.append("platform", v);

  try {
    const res = await fetch(forward.toString(), {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
    });
    const text = await res.text();
    let json: any;
    try { json = JSON.parse(text); } catch { /* response may be plain text */ }
    if (!res.ok) {
      return NextResponse.json(json ?? { error: text || "Failed to fetch post results" }, { status: res.status });
    }

    const normalized: PostResultItem[] = Array.isArray(json)
      ? json
      : (json?.data ?? json?.results ?? json?.items ?? []);

    const total: number | undefined = (json?.pagination?.total ?? json?.total) as number | undefined;
    return NextResponse.json({ data: normalized, offset, limit, total });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unexpected error", data: [], offset, limit }, { status: 500 });
  }
}


