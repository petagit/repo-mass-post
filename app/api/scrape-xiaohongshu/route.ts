import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export interface XHSDownloadResult {
  success: boolean;
  imageLinks: string[];
  videoLinks: string[];
  error?: string;
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
    // If user pasted a KuKuTool page with ?url=..., extract the embedded XHS share link
    try {
      const parsed0 = new URL(targetUrl);
      if (/^dy\.kukutool\.com$/i.test(parsed0.hostname)) {
        const embedded = parsed0.searchParams.get("url");
        if (embedded) targetUrl = embedded;
      }
    } catch {}

    // If we were given an xhslink.com short URL, try to resolve it first so the helper gets the canonical URL.
    if (/^https?:\/\/(?:www\.)?xhslink\.com\//i.test(targetUrl)) {
      try {
        // Prefer HEAD to avoid downloading content
        const head = await fetch(targetUrl, { method: "HEAD", redirect: "follow" });
        const final = head.url || targetUrl;
        if (final && /https?:\/\//i.test(final)) {
          const pf = new URL(final);
          if (!/xhslink\.com$/i.test(pf.hostname)) targetUrl = final;
        }
      } catch {
        try {
          // Some servers disallow HEAD; do a tiny ranged GET
          const get = await fetch(targetUrl, { method: "GET", headers: { Range: "bytes=0-1" }, redirect: "follow" });
          const final = get.url || targetUrl;
          if (final && /https?:\/\//i.test(final)) {
            const pf = new URL(final);
            if (!/xhslink\.com$/i.test(pf.hostname)) targetUrl = final;
          }
        } catch { /* ignore */ }
      }
    }

    // Use KuKuTool helper. They typically render results after a POST submit; try both GET and POST.
    const helperUrl = `https://dy.kukutool.com/xiaohongshu?url=${encodeURIComponent(targetUrl)}`;
    const commonHeaders = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      "Accept-Language": "zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7",
      Referer: "https://dy.kukutool.com/xiaohongshu",
    } as const;

    let html = "";
    // Try GET first
    try {
      const getRes = await fetch(helperUrl, { headers: commonHeaders, redirect: "follow" });
      if (getRes.ok) html = await getRes.text();
    } catch {
      // ignore
    }
    // If GET didn't yield links, try form POST
    if (!html || html.length < 512) {
      try {
        const postRes = await fetch("https://dy.kukutool.com/xiaohongshu", {
          method: "POST",
          headers: {
            ...commonHeaders,
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          },
          body: `url=${encodeURIComponent(targetUrl)}`,
          redirect: "follow",
        });
        if (postRes.ok) html = await postRes.text();
      } catch {
        // ignore
      }
    }
    // Use Playwright (if enabled) to drive the page and surface links reliably.
    // Even if static HTML exists, dynamic buttons (如“下载视频/下载”) often require interaction.
    if (process.env.USE_PLAYWRIGHT === "true") {
      try {
        const { chromium } = await import("playwright");
        const browser = await chromium.launch({ headless: true, args: ["--disable-blink-features=AutomationControlled"] });
        const context = await browser.newContext({
          userAgent:
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
          locale: "zh-CN",
          extraHTTPHeaders: { "Accept-Language": "zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7" },
          viewport: { width: 414, height: 896 },
          deviceScaleFactor: 3,
          isMobile: true,
          hasTouch: true,
        });
        // Light stealth: hide webdriver flag and set languages/platform
        await context.addInitScript(() => {
          Object.defineProperty(navigator, "webdriver", { get: () => false });
          // @ts-ignore
          window.chrome = window.chrome || { runtime: {} };
          Object.defineProperty(navigator, "languages", { get: () => ["zh-CN", "zh", "en-US", "en"] });
          Object.defineProperty(navigator, "platform", { get: () => "Win32" });
          // Hook clipboard writes to capture copied URLs set by the page scripts
          try {
            // @ts-ignore
            window.__copiedTexts = [];
            const origWriteText = navigator.clipboard?.writeText?.bind(navigator.clipboard);
            if (origWriteText) {
              // @ts-ignore
              navigator.clipboard.writeText = async (text) => {
                try {
                  // @ts-ignore
                  window.__copiedTexts.push(String(text || ""));
                } catch {}
                return origWriteText(text);
              };
            }
          } catch {}
        });
        // Optional cookie injection if provided (may bypass verification)
        try {
          const raw = process.env.KUKUTOOL_COOKIES || "";
          if (raw.trim()) {
            const pairs = raw.split(/;\s*/).filter(Boolean);
            const cookies = pairs.map((p) => {
              const idx = p.indexOf("=");
              const name = idx > 0 ? p.slice(0, idx) : p;
              const value = idx > 0 ? p.slice(idx + 1) : "";
              return { name, value, domain: ".kukutool.com", path: "/" } as { name: string; value: string; domain: string; path: string };
            });
            if (cookies.length > 0) await context.addCookies(cookies);
          }
        } catch { /* ignore */ }
        await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: "https://dy.kukutool.com" });
        const page = await context.newPage();
        // Aggregate any network responses (some sites build links via XHR)
        let networkDump = "";
        // Capture requests as well (some downloads are GETs that never surface as responses we can read)
        page.on("request", (req) => {
          try {
            const u = req.url();
            if (/\.mp4(\?|$)/i.test(u) || /xhscdn\./i.test(u) || /(download|down|video|dl|file)=/i.test(u)) {
              networkDump += "\n" + u;
            }
          } catch { /* no-op */ }
        });
        // Popups sometimes open the real file URL
        page.on("popup", async (p) => {
          try {
            await p.waitForLoadState("domcontentloaded", { timeout: 5000 }).catch(() => undefined);
            const u = p.url();
            if (u) networkDump += "\n" + u;
          } catch { /* no-op */ }
        });
        // Capture file downloads triggered by clicking "下载" and similar buttons
        page.on("download", (d) => {
          try {
            const u = (d as any).url?.() || (d as any)._url || "";
            if (u) networkDump += "\n" + String(u);
          } catch { /* no-op */ }
        });
        page.on("response", async (res) => {
          try {
            const ct = res.headers()["content-type"] || "";
            // Record text-y responses for URL sweeps
            if (ct.includes("application/json") || ct.includes("text/plain") || ct.includes("text/html")) {
              const text = await res.text();
              if (text && /https?:\/\//i.test(text)) networkDump += "\n" + text;
            }
            // Also record binary/video responses' URLs if they look like media
            const url = res.url();
            if (/\.mp4(\?|$)/i.test(url) || /xhscdn\./i.test(url) || /video\//i.test(ct) || /octet-stream/i.test(ct)) {
              networkDump += "\n" + url;
            }
          } catch {
            /* no-op */
          }
        });
        await page.goto("https://dy.kukutool.com/xiaohongshu", { waitUntil: "domcontentloaded" });
        page.setDefaultTimeout(20000);
        // Try to fill via common selectors
        const input = page.locator('input[name="url"], input#url, input[type="text"]');
        if (await input.first().isVisible()) {
          await input.first().fill(targetUrl);
        } else {
          await page.evaluate((u) => {
            const el = document.querySelector('input[name="url"], input#url, input[type="text"]') as HTMLInputElement | null;
            if (el) el.value = u;
          }, targetUrl);
        }
        // Click a parse/submit button
        const parseBtn = page.locator([
          'button:has-text("解析")',
          'button:has-text("开始解析")',
          'button:has-text("解析链接")',
          'button:has-text("開始解析")',
          'button:has-text("解析連結")',
          '.btn-primary',
          'a:has-text("解析")',
          'a:has-text("開始解析")',
        ].join(", "));
        if (await parseBtn.first().isVisible()) {
          await parseBtn.first().click();
        } else {
          await page.keyboard.press("Enter");
        }
        await page.waitForTimeout(500);
        // Wait for results area to appear; allow more time as sites can be slow
        await page.waitForLoadState("domcontentloaded");
        await page.waitForLoadState("networkidle");
        const ready = await Promise.race([
          page.waitForSelector('[data-clipboard-text*="http"]', { timeout: 15000 }).then(() => true).catch(() => false),
          page.waitForSelector('a[href*="xhscdn"], a[download][href], a:has-text("下载地址"), .download, video source[src], video[src], button:has-text("下载"), a:has-text("下载")', { timeout: 15000 }).then(() => true).catch(() => false),
        ]);
        if (!ready) {
          // try a small additional delay
          await page.waitForTimeout(2500);
        }
        // If there is a "下载视频" tab/button, click it to show downloadable video section
        try {
          const dlVideoTab = page.locator([
            'button:has-text("下载视频")', 'a:has-text("下载视频")', 'li:has-text("下载视频")', '.tab:has-text("下载视频")',
            'button:has-text("下載視頻")', 'a:has-text("下載視頻")', 'li:has-text("下載視頻")', '.tab:has-text("下載視頻")',
          ].join(", "));
          if (await dlVideoTab.first().isVisible()) {
            await dlVideoTab.first().click({ timeout: 1000 }).catch(() => undefined);
            await page.waitForTimeout(300);
          }
        } catch { /* no-op */ }
        // Try clicking the first available "下载" button (common pattern on kukutool)
        try {
          const dlBtnSel = [
            'a[download]','[download]','a:has-text("下载地址")','a:has-text("下載地址")',
            'button:has-text("下载")','a:has-text("下载")','button:has-text("下載")','a:has-text("下載")',
          ].join(", ");
          const dlBtns = page.locator(dlBtnSel);
          const total = Math.min(await dlBtns.count(), 6);
          for (let i = 0; i < total; i++) {
            const b = dlBtns.nth(i);
            if (!(await b.isVisible())) continue;
            // Try to read any href/data-* before click
            try {
              const href = await b.getAttribute('href');
              const durl = await b.getAttribute('data-url');
              const dhref = await b.getAttribute('data-href');
              const clip = await b.getAttribute('data-clipboard-text');
              for (const v of [href,durl,dhref,clip]) if (v && /^https?:\/\//.test(v)) networkDump += "\n" + v;
            } catch {}
            await b.click({ noWaitAfter: true }).catch(() => undefined);
            await page.waitForTimeout(700);
          }
        } catch { /* no-op */ }
        // prefer highest quality toggle if present
        const bestQual = page.locator([
          'button:has-text("超清")', 'button:has-text("超高清")', 'button:has-text("原画")', 'a:has-text("原画")',
          'button:has-text("高清")', 'a:has-text("高清")', 'button:has-text("正常")',
        ].join(", "));
        if (await bestQual.first().isVisible()) {
          await bestQual.first().click().catch(() => undefined);
          await page.waitForTimeout(300);
        }

        // Puppeteer-like pass: wait for generic images/links to exist and then extract inside page context
        try {
          await page.waitForFunction(
            () => {
              const images = document.querySelectorAll('img[src*="http"]');
              const links = document.querySelectorAll('a[href*="http"]');
              return images.length > 1 || links.length > 1;
            },
            { timeout: 15000 }
          );
          await page.waitForTimeout(2000);
        } catch { /* continue even if not visible */ }

        const simpleResult = await page.evaluate(() => {
          const imageLinks: string[] = [];
          const videoLinks: string[] = [];

          // From <img src="...">
          const images = document.querySelectorAll('img[src]');
          images.forEach((img) => {
            const src = (img as HTMLImageElement).src;
            if (src && src.startsWith('http') && !src.includes('logo') && !src.includes('icon')) {
              imageLinks.push(src);
            }
          });

          // From <a href> / <a download> (by file extension)
          const links = document.querySelectorAll('a[href], a[download]');
          links.forEach((link) => {
            const href = (link as HTMLAnchorElement).href;
            if (href && href.startsWith('http')) {
              if (href.match(/\.(jpg|jpeg|png|gif|webp)/i)) {
                imageLinks.push(href);
              } else if (href.match(/\.(mp4|mov|avi|webm)/i)) {
                videoLinks.push(href);
              }
            }
          });

          // From data attributes
          const elements = document.querySelectorAll('[data-src], [data-url], [data-image]');
          elements.forEach((el) => {
            const dataSrc = el.getAttribute('data-src') || 
                           el.getAttribute('data-url') || 
                           el.getAttribute('data-image');
            if (dataSrc && dataSrc.startsWith('http')) {
              imageLinks.push(dataSrc);
            }
          });

          return {
            imageLinks: [...new Set(imageLinks)],
            videoLinks: [...new Set(videoLinks)],
          } as { imageLinks: string[]; videoLinks: string[] };
        });

        // Scrape candidate URLs
        html = await page.content();

        // Try clicking copy-all / copy buttons to force generation of final links and read system clipboard
        const copiedFromClicks: string[] = [];
        try {
          const allBtn = page.locator([
            'button:has-text("复制全部视频链接")', 'button:has-text("复制全部链接")', 'button:has-text("复制全部")',
            'a:has-text("复制全部视频链接")', 'a:has-text("复制全部链接")', 'a:has-text("复制全部")',
            'button:has-text("複製全部視頻鏈接")', 'button:has-text("複製全部連結")', 'button:has-text("複製全部")',
            'a:has-text("複製全部視頻鏈接")', 'a:has-text("複製全部連結")', 'a:has-text("複製全部")',
          ].join(", "));
          if (await allBtn.first().isVisible()) {
            await allBtn.first().click();
            await page.waitForTimeout(250);
            const clip = await page.evaluate(async () => {
              try { return await navigator.clipboard.readText(); } catch { return ""; }
            });
            if (clip) copiedFromClicks.push(...clip.split(/[\n\r,\s]+/).filter(Boolean));
          }
          const singleBtns = page.locator('button:has-text("复制"), a:has-text("复制"), button:has-text("複製"), a:has-text("複製")');
          const n = Math.min(await singleBtns.count(), 5);
          for (let i = 0; i < n; i++) {
            await singleBtns.nth(i).click({ noWaitAfter: true }).catch(() => undefined);
            await page.waitForTimeout(180);
            const clip = await page.evaluate(async () => {
              try { return await navigator.clipboard.readText(); } catch { return ""; }
            });
            if (clip) copiedFromClicks.push(...clip.split(/[\n\r,\s]+/).filter(Boolean));
          }
          // Also read any values captured by our initScript hook
          const hooked = await page.evaluate(() => Array.isArray((window as any).__copiedTexts) ? (window as any).__copiedTexts : []);
          if (Array.isArray(hooked) && hooked.length > 0) copiedFromClicks.push(...hooked);
        } catch {}

        // Also read clipboard-text attributes directly from DOM for robustness
        const clipUrls = await page.evaluate(() =>
          Array.from(document.querySelectorAll('[data-clipboard-text]'))
            .map((el) => (el as HTMLElement).getAttribute('data-clipboard-text'))
            .filter((x): x is string => Boolean(x))
        );
        // Some pages have a button like “复制全部视频链接” that aggregates links; read its dataset
        const copyAllUrls = await page.evaluate(() => {
          const labels = ['复制全部视频链接','复制全部链接','复制全部'];
          const found: string[] = [];
          for (const label of labels) {
            const el = Array.from(document.querySelectorAll('button, a')).find((n) => n.textContent?.includes(label)) as HTMLElement | undefined;
            const v = el?.getAttribute('data-clipboard-text');
            if (v) found.push(v);
          }
          return found;
        });
        const anchorUrls = await page.evaluate(() => {
          const anchors = Array.from(document.querySelectorAll('a[href]')) as HTMLAnchorElement[];
          const all = anchors.map((a) => a.href).filter(Boolean);
          // Also look for anchors/buttons that display text like "下载" and grab any related data-* attributes
          const downloadish = Array.from(document.querySelectorAll('a,button')) as (HTMLAnchorElement | HTMLButtonElement)[];
          for (const el of downloadish) {
            const t = el.textContent || '';
            if (t.includes('下载')) {
              const attrs = ['href','data-url','data-href','data-clipboard-text'];
              for (const k of attrs) {
                const v = (el as any).getAttribute?.(k);
                if (v && /^https?:\/\//.test(v)) all.push(v);
              }
              // Some sites stash a URL in onclick like: window.open('https://...mp4')
              const oc = (el as any).getAttribute?.('onclick') || '';
              const m = oc.match(/https?:[^'"\s)]+/g);
              if (m) all.push(...m);
            }
          }
          return Array.from(new Set(all));
        });
        const mediaSrcs = await page.evaluate(() =>
          [
            ...Array.from(document.querySelectorAll('video[src]')).map((v) => (v as HTMLVideoElement).src),
            ...Array.from(document.querySelectorAll('video source[src]')).map((s) => (s as HTMLSourceElement).src),
            ...Array.from(document.querySelectorAll('img[src]')).map((i) => (i as HTMLImageElement).src),
          ].filter(Boolean)
        );
        const collected = [
          ...simpleResult.imageLinks,
          ...simpleResult.videoLinks,
          ...copiedFromClicks,
          ...clipUrls,
          ...copyAllUrls,
          ...anchorUrls,
          ...mediaSrcs,
        ];
        if (collected.length > 0) html += "\n" + collected.join("\n");
        if (networkDump) html += "\n" + networkDump;
        await browser.close();
      } catch (err) {
        // ignore playwright failures, we'll fall back to what we have
      }
    }
    if (!html) {
      return NextResponse.json({ success: false, imageLinks: [], videoLinks: [], error: "Failed to load helper page" }, { status: 502 });
    }

    const imageLinks = new Set<string>();
    const videoLinks = new Set<string>();

    // Extract all URLs first, then filter by extension to avoid complex regex escapes.
    // Look for direct attributes commonly used by the site
    const attrPatterns: RegExp[] = [
      /data-clipboard-text=\"(https?:[^\"\s<>]+)\"/gi,
      /data-url=\"(https?:[^\"\s<>]+)\"/gi,
      /data-src=\"(https?:[^\"\s<>]+)\"/gi,
      /data-href=\"(https?:[^\"\s<>]+)\"/gi,
      /href=\"(https?:[^\"\s<>]+)\"/gi,
      /src=\"(https?:[^\"\s<>]+)\"/gi,
      // single-quoted variants
      /data-clipboard-text='(https?:[^'\s<>]+)'/gi,
      /data-url='(https?:[^'\s<>]+)'/gi,
      /data-src='(https?:[^'\s<>]+)'/gi,
      /data-href='(https?:[^'\s<>]+)'/gi,
      /href='(https?:[^'\s<>]+)'/gi,
      /src='(https?:[^'\s<>]+)'/gi,
    ];
    const attrMatches: string[] = [];
    for (const re of attrPatterns) {
      for (const m of html.matchAll(re)) attrMatches.push(m[1]);
    }
    // Also parse common JSON blobs in script tags: "url":"https:\/\/..."
    for (const m of html.matchAll(/\"url\"\s*:\s*\"(https?:\\\/\\\/[^\"\s<>]+)\"/gi)) {
      attrMatches.push(m[1].replace(/\\\//g, "/"));
    }
    // Generic URL sweep
    const allUrlMatches = [...attrMatches, ...(html.match(/https?:\/\/[^\s"'<>]+/gi) || [])];
    let normalizedUrls = allUrlMatches
      .map((u) => u.replace(/\\\//g, "/"))
      .map((u) => u.replace(/&amp;/gi, "&")) // decode common HTML entity for ampersand
      .map((u) => u.replace(/\\+$/g, "")); // strip trailing backslashes seen in some buttons
    // Expand helper download endpoints by extracting embedded url query param if present
    const expanded: string[] = [];
    for (const raw of normalizedUrls) {
      try {
        const p = new URL(raw);
        const qkeys = ["url", "u", "target", "link", "down", "download", "dl", "file", "f", "media", "media_url", "src", "s"]; // broader param names
        for (const k of qkeys) {
          const v = p.searchParams.get(k);
          if (v && /^https?:\/\//i.test(v)) expanded.push(v);
        }
      } catch { /* ignore */ }
    }
    normalizedUrls = Array.from(new Set([...normalizedUrls, ...expanded]));
    const imageExt = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
    const videoExt = new Set([".mp4", ".mov", ".m3u8", ".mpd"]);

    for (const u of normalizedUrls) {
      try {
        const parsed = new URL(u);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") continue;
        const pathname = parsed.pathname.toLowerCase();
        const hasImage = Array.from(imageExt).some((ext) => pathname.endsWith(ext));
        // treat as video when it clearly looks like a playable resource
        const looksLikeHelperVideo = /kukutool/i.test(parsed.hostname) && /(down|download|video|dl|file)/i.test(parsed.pathname + parsed.search);
        const hasVideo =
          Array.from(videoExt).some((ext) => pathname.endsWith(ext)) ||
          /xhscdn\.[^/]+\/.*\.(mp4|m3u8)/i.test(u) ||
          u.toLowerCase().includes(".mp4"); // only treat clear video-like URLs as video
        // Prefer links that originate from kukutool (more reliable to fetch by Post-Bridge)
        const isFromHelper = parsed.hostname.includes("kukutool");
        // Exclude short-share pages like xhslink.com; we only want direct files
        const isShortShare = /(^|\.)xhslink\.com$/i.test(parsed.hostname);
        if (hasImage && !isShortShare) imageLinks.add(u);
        if (hasVideo && !isShortShare) {
          if (isFromHelper) videoLinks.add(u);
          else videoLinks.add(u);
        }
      } catch {
        // ignore invalid URLs
      }
    }

    if (imageLinks.size === 0 && videoLinks.size === 0) {
      // Provide helpful debug context count to assist troubleshooting
      return NextResponse.json({ success: true, imageLinks: [], videoLinks: [], error: `No media matched. Scanned ${normalizedUrls.length} URLs.` });
    }
    // Prefer returning only MP4 links when available. If none found, try resolving helper links to their final redirected URL
    let allVideos = Array.from(videoLinks);
    let mp4Videos = allVideos.filter((v) => v.toLowerCase().includes(".mp4"));
    if (mp4Videos.length === 0 && allVideos.length > 0) {
      const toTry = allVideos.slice(0, 5);
      const resolved = await Promise.all(
        toTry.map(async (u) => {
          try {
            const h = await fetch(u, { method: "HEAD", redirect: "follow" });
            const final = h.url || u;
            if (/\.mp4(\?|$)/i.test(final)) return final;
            // Fallback tiny ranged GET for servers that don't support HEAD
            const g = await fetch(u, { method: "GET", headers: { Range: "bytes=0-1" }, redirect: "follow" });
            return g.url || u;
          } catch {
            return u;
          }
        })
      );
      for (const r of resolved) if (/\.mp4(\?|$)/i.test(r)) videoLinks.add(r);
      allVideos = Array.from(videoLinks);
      mp4Videos = allVideos.filter((v) => v.toLowerCase().includes(".mp4"));
    }
    // Exclude obvious non-media helper landers
    allVideos = allVideos.filter((v) => !/downloadapp\.html/i.test(v));
    mp4Videos = allVideos.filter((v) => /\.mp4(\?|$)/i.test(v));
    let finalVideos = mp4Videos.length > 0 ? mp4Videos : allVideos;

    // As a last resort, some helper pages (e.g. downloadapp.html) are landing pages; try parsing them once
    if (finalVideos.length > 0 && finalVideos.every((v) => !/\.mp4(\?|$)/i.test(v))) {
      const helperPages = finalVideos.filter((v) => /kukutool/i.test(v));
      const discovered: string[] = [];
      await Promise.all(
        helperPages.slice(0, 3).map(async (u) => {
          try {
            const r = await fetch(u, { redirect: "follow" });
            const t = await r.text();
            const found = t.match(/https?:\/\/[^\s"'<>]+/gi) || [];
            discovered.push(...found);
          } catch { /* ignore */ }
        })
      );
      if (discovered.length > 0) {
        for (const u of discovered) {
          try {
            const p = new URL(u);
            if ((/xhscdn\./i.test(p.hostname) && p.pathname.toLowerCase().includes(".mp4")) || /\.mp4(\?|$)/i.test(u)) {
              videoLinks.add(u);
            }
          } catch { /* ignore */ }
        }
        finalVideos = Array.from(videoLinks);
      }
    }

    return NextResponse.json({ success: true, imageLinks: Array.from(imageLinks), videoLinks: finalVideos });
  } catch (e: any) {
    return NextResponse.json({ success: false, imageLinks: [], videoLinks: [], error: e?.message || "Failed to scrape" }, { status: 500 });
  }
}
