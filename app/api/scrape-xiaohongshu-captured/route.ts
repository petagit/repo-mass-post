import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export interface XHSDownloadResult {
  success: boolean;
  imageLinks: string[];
  videoLinks: string[];
  error?: string;
  debugUrls?: string[];
}

export async function POST(req: Request): Promise<NextResponse<XHSDownloadResult>> {
  try {
    const { url } = (await req.json()) as { url?: string };
    if (!url) return NextResponse.json({ success: false, imageLinks: [], videoLinks: [], error: "Missing url" }, { status: 400 });

    // Extract the first http(s) URL from arbitrary pasted text.
    const urlMatch = url.match(/https?:\/\/[^\s]+/i);
    if (!urlMatch) {
      return NextResponse.json(
        { success: false, imageLinks: [], videoLinks: [], error: "No valid URL found in input" },
        { status: 400 }
      );
    }
    let targetUrl = urlMatch[0];
    // Resolve xhslink short URL to final landing URL when possible
    if (/^https?:\/\/(?:www\.)?xhslink\.com\//i.test(targetUrl)) {
      try {
        const head = await fetch(targetUrl, { method: "HEAD", redirect: "follow" });
        const final = head.url || targetUrl;
        if (final) targetUrl = final;
      } catch {
        try {
          const get = await fetch(targetUrl, { method: "GET", headers: { Range: "bytes=0-1" }, redirect: "follow" });
          const final = get.url || targetUrl;
          if (final) targetUrl = final;
        } catch { /* ignore */ }
      }
    }

    // Read captured headers/body hints from local file `api_call` if present
    const commonHeaders = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      "Accept-Language": "zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7",
      Referer: "https://dy.kukutool.com/xiaohongshu",
    } as const;

    const { readFile } = await import("fs/promises");
    const raw: string = await readFile("/Users/fengzhiping/a/api_call", "utf8").catch(() => "");
    const lines: string[] = raw ? raw.split(/\r?\n/) : [];
    const getAfter = (key: string): string | undefined => {
      const idx = lines.findIndex((l) => l.trim().toLowerCase() === key.toLowerCase());
      if (idx >= 0) {
        for (let j = idx + 1; j < Math.min(lines.length, idx + 4); j++) {
          const v = lines[j]?.trim();
          if (v && !/:$/.test(v) && !/^[A-Za-z0-9_-]+:$/.test(v)) return v;
        }
      }
      return undefined;
    };

    const headerCandidates: Array<[string, string | undefined]> = [
      ["Accept", getAfter("accept")],
      ["Accept-Encoding", getAfter("accept-encoding")],
      ["Accept-Language", getAfter("accept-language")],
      ["Content-Type", getAfter("content-type") || "application/json"],
      ["Cookie", getAfter("cookie") || process.env.KUKUTOOL_COOKIES || ""],
      ["Origin", getAfter("origin") || "https://dy.kukutool.com"],
      ["Referer", getAfter("referer") || "https://dy.kukutool.com/xiaohongshu"],
      ["Sec-CH-UA", getAfter("sec-ch-ua")],
      ["Sec-CH-UA-Mobile", getAfter("sec-ch-ua-mobile")],
      ["Sec-CH-UA-Platform", getAfter("sec-ch-ua-platform")],
      ["Sec-Fetch-Dest", getAfter("sec-fetch-dest")],
      ["Sec-Fetch-Mode", getAfter("sec-fetch-mode")],
      ["Sec-Fetch-Site", getAfter("sec-fetch-site")],
      ["User-Agent", getAfter("user-agent")],
    ];
    const apiHeaders: Record<string, string> = {};
    for (const [k, v] of headerCandidates) if (v) apiHeaders[k] = v;
    if (!apiHeaders["User-Agent"]) apiHeaders["User-Agent"] = commonHeaders["User-Agent"];
    if (!apiHeaders["Accept-Language"]) apiHeaders["Accept-Language"] = commonHeaders["Accept-Language"];
    if (!apiHeaders["Origin"]) apiHeaders["Origin"] = "https://dy.kukutool.com";
    if (!apiHeaders["Referer"]) apiHeaders["Referer"] = "https://dy.kukutool.com/xiaohongshu";
    apiHeaders["Accept"] = apiHeaders["Accept"] || "application/json, text/plain, */*";

    const bodyFields: Record<string, string | number | undefined> = {
      captchaInput: getAfter("captchaInput"),
      captchaKey: getAfter("captchaKey"),
      requestURL: getAfter("requestURL") || targetUrl,
      salt: getAfter("salt"),
      sign: getAfter("sign"),
      ts: Number(getAfter("ts")) || Math.floor(Date.now() / 1000),
    };
    const body: Record<string, string | number> = {};
    for (const [k, v] of Object.entries(bodyFields)) if (v !== undefined && v !== "") body[k] = v as string | number;
    if (!body.requestURL) body.requestURL = targetUrl;

    // Send captured-style request
    const capturedRes = await fetch("https://dy.kukutool.com/api/parse", {
      method: "POST",
      headers: apiHeaders as any,
      body: JSON.stringify(body),
      redirect: "follow",
    });
    if (!capturedRes.ok) {
      const text = await capturedRes.text().catch(() => "");
      return NextResponse.json({ success: false, imageLinks: [], videoLinks: [], error: text || `HTTP ${capturedRes.status}` }, { status: 502 });
    }

    let collected = "";
    try {
      const j: any = await capturedRes.json();
      const urls: string[] = [];
      const walk = (v: any): void => {
        if (!v) return;
        if (typeof v === "string" && /https?:\/\//i.test(v)) urls.push(v);
        else if (Array.isArray(v)) for (const i of v) walk(i);
        else if (typeof v === "object") for (const k of Object.keys(v)) walk(v[k]);
      };
      walk(j);
      if (urls.length > 0) collected = urls.join("\n");
    } catch {
      const t = await capturedRes.text();
      collected = t;
    }

    const allUrls: string[] = (collected.match(/https?:\/\/[^\s"'<>]+/gi) || [])
      .map((u) => u.replace(/\\\//g, "/"))
      .map((u) => u.replace(/&amp;/gi, "&"));

    const imageLinks = new Set<string>();
    const videoLinks = new Set<string>();
    const debugUrls: string[] = Array.from(new Set(allUrls.filter((u) => /mp4|xhscdn|download|video|dl=|down=/.test(u)).slice(0, 20)));

    for (const u of allUrls) {
      try {
        const p = new URL(u);
        const path = p.pathname.toLowerCase();
        if (/(\.jpg|\.jpeg|\.png|\.webp)(\?|$)/i.test(path)) imageLinks.add(u);
        if (/(\.mp4|\.mov|\.m3u8|\.mpd)(\?|$)/i.test(path) || /xhscdn\./i.test(p.hostname) || u.toLowerCase().includes(".mp4")) videoLinks.add(u);
      } catch { /* ignore */ }
    }

    // Verify a few mp4s via HEAD/GET with browser-like headers
    const candidates = Array.from(videoLinks).filter((u) => /\.mp4(\?|$)/i.test(u)).slice(0, 4);
    if (candidates.length > 0) {
      const mediaHeaders: Record<string, string> = {};
      if (apiHeaders["User-Agent"]) mediaHeaders["User-Agent"] = apiHeaders["User-Agent"];
      if (apiHeaders["Referer"]) mediaHeaders["Referer"] = apiHeaders["Referer"];
      mediaHeaders["Accept-Encoding"] = "identity;q=1, *;q=0";
      mediaHeaders["Range"] = "bytes=0-";
      const verified: string[] = await Promise.all(
        candidates.map(async (u) => {
          try {
            const h = await fetch(u, { method: "HEAD", headers: mediaHeaders as any, redirect: "follow" });
            const final = h.url || u;
            const ct = h.headers.get("content-type") || "";
            if (ct.includes("video/mp4") || /\.mp4(\?|$)/i.test(final)) return final;
          } catch {}
          try {
            const g = await fetch(u, { method: "GET", headers: mediaHeaders as any, redirect: "follow" });
            const final = g.url || u;
            const ct = g.headers.get("content-type") || "";
            if (ct.includes("video/mp4") || /\.mp4(\?|$)/i.test(final)) return final;
          } catch {}
          return "";
        })
      ).then((arr) => arr.filter(Boolean));
      for (const v of verified) videoLinks.add(v);
    }

    return NextResponse.json({ success: videoLinks.size + imageLinks.size > 0, imageLinks: Array.from(imageLinks), videoLinks: Array.from(videoLinks), debugUrls });
  } catch (e: any) {
    return NextResponse.json({ success: false, imageLinks: [], videoLinks: [], error: e?.message || "Failed" }, { status: 500 });
  }
}



