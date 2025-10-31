"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import XHSdownload, { type XHSDownloadResult } from "./components/XHSdownload";
import XHSdownloadCaptured from "./components/XHSdownloadCaptured";
import XHSdownloadDirect from "./components/XHSdownloadDirect";

type Platform = "instagram" | "x";

export interface Destination {
  id: string;
  platform: Platform;
  handle: string;
  displayName?: string;
  avatarUrl?: string;
}

export default function Page(): JSX.Element {
  const [media, setMedia] = useState<XHSDownloadResult | null>(null);
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [title, setTitle] = useState<string>("");
  const [caption, setCaption] = useState<string>("");
  const [loadingDest, setLoadingDest] = useState<boolean>(false);
  const [publishing, setPublishing] = useState<boolean>(false);
  const [destError, setDestError] = useState<string>("");

  const mediaUrls = useMemo<string[]>(() => {
    if (!media?.success) return [];
    // Prefer videos when available; otherwise fall back to images
    if (media.videoLinks?.length) return media.videoLinks;
    return media.imageLinks ?? [];
  }, [media]);

  const fetchDestinations = useCallback(async (): Promise<void> => {
    setLoadingDest(true);
    const id = toast.loading("Loading destinations…");
    try {
      const res = await fetch("/api/post-bridge/destinations");
      if (!res.ok) {
        const text = await res.text();
        setDestError(text || "Failed to load destinations");
        toast.error("Failed to load destinations", { id });
        return;
      }
      const data = (await res.json()) as {
        platforms: { instagram: Destination[]; x: Destination[] };
        defaults: string[];
        error?: string;
      };
      const list = [...data.platforms.instagram, ...data.platforms.x];
      setDestinations(list);
      // Choose sane defaults from actual, owned destinations only (no pseudo tokens)
      const igList = data.platforms.instagram;
      const xList = data.platforms.x;
      // Prefer IG handle 'costights' if exists, else 'cosplay_tights', else first IG
      const igPref =
        igList.find((d) => d.handle.toLowerCase() === "costights") ||
        igList.find((d) => d.handle.toLowerCase() === "cosplay_tights") ||
        igList[0];
      // Prefer X handle 'costights', else first X
      const xPref = xList.find((d) => d.handle.toLowerCase() === "costights") || xList[0];
      const selectedIds = [igPref?.id, xPref?.id].filter(Boolean) as string[];
      // If API suggested defaults include other valid ids, include them too without duplicates
      for (const id of data.defaults || []) if (id && !selectedIds.includes(id)) selectedIds.push(id);
      setSelected(selectedIds);
      setDestError(data.error || "");
      toast.success("Destinations loaded", { id });
    } catch (e: any) {
      const msg = e?.message || "Failed to load destinations";
      setDestError(msg);
      toast.error("Failed to load destinations", { id });
    } finally {
      setLoadingDest(false);
    }
  }, []);

  useEffect(() => {
    void fetchDestinations();
  }, [fetchDestinations]);

  const toggle = (id: string): void => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const publish = useCallback(async (): Promise<void> => {
    if (mediaUrls.length === 0) {
      toast.error("No media to post");
      return;
    }
    if (selected.length === 0) {
      toast.error("Select at least one destination");
      return;
    }
    setPublishing(true);
    const tId = toast.loading("Posting via Post-Bridge…");
    try {
      const res = await fetch("/api/post-bridge/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, caption, mediaUrls, destinations: selected }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Publish failed");
      }
      const result = await res.json();
      // Show per-destination messages if provided
      const msgs: string[] = Array.isArray(result?.results)
        ? result.results.map((r: any) => `${r.platform || ""} ${r.status || "ok"}`)
        : ["Submitted to Post-Bridge"];
      toast.success(msgs.join(" · "), { id: tId });
    } catch (e: any) {
      toast.error(e?.message || "Publish failed", { id: tId });
    } finally {
      setPublishing(false);
    }
  }, [caption, mediaUrls, selected]);

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-semibold mb-4">XHS → Post-Bridge</h1>
      <div className="space-y-6">
        <section className="bg-white rounded-lg shadow p-5 border-2 border-red-500">
          <div className="flex items-center gap-2 mb-3">
            <h2 className="font-medium">1) Extract from Xiaohongshu (Direct Method)</h2>
            <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full font-semibold">Recommended</span>
          </div>
          <p className="text-sm text-gray-600 mb-3">
            Follows shortened link and extracts video URLs directly from XHS page, then tests with curl-like headers to verify accessibility.
          </p>
          <XHSdownloadDirect
            className=""
            onComplete={(r): void => {
              setMedia(r);
              if (r.success) {
                toast.success(`Extracted ${r.videoLinks.length} video(s), ${r.imageLinks.length} image(s)`);
              } else {
                toast.error(r.error || "Failed to extract");
              }
            }}
            placeholder="Paste XHS shortened link (e.g., http://xhslink.com/o/7YhgVFfH3N5)"
            autoFocus={true}
          />
        </section>

        <details className="bg-white rounded-lg shadow p-5">
          <summary className="font-medium mb-3 cursor-pointer text-gray-600 hover:text-gray-900">
            Alternative Methods (Click to expand)
          </summary>
          <div className="space-y-6 mt-4">
            <section>
              <h3 className="font-medium mb-3 text-sm">1a) Standard extractor (via kukutool)</h3>
              <XHSdownload
                className=""
                onComplete={(r): void => {
                  setMedia(r);
                  if (r.success) toast.success("Extracted media");
                  else toast.error(r.error || "Failed to extract");
                }}
              />
            </section>

            <section>
              <h3 className="font-medium mb-3 text-sm">1b) Captured-only extractor (debug)</h3>
              <p className="text-xs text-gray-600 mb-3">Uses only the headers/body from <code>api_call</code> to hit kukutool directly.</p>
              <XHSdownloadCaptured
                className=""
                onComplete={(r): void => {
                  setMedia(r);
                  if (r.success) toast.success("Extracted (captured)");
                  else toast.error(r.error || "Failed (captured)");
                }}
              />
            </section>
          </div>
        </details>

        <section className="bg-white rounded-lg shadow p-5">
          <h2 className="font-medium mb-3">2) Choose destinations</h2>
          <div className="flex flex-wrap gap-3">
            {destinations.map((d) => (
              <button
                key={d.id}
                onClick={(): void => toggle(d.id)}
                className={`px-3 py-2 rounded-full border transition-colors ${
                  selected.includes(d.id)
                    ? "bg-gray-900 text-white border-gray-900"
                    : "bg-white text-gray-800 border-gray-300 hover:border-gray-400"
                }`}
                disabled={loadingDest}
                aria-pressed={selected.includes(d.id)}
              >
                {d.platform === "instagram" ? "IG" : "X"} · {d.handle}
              </button>
            ))}
            {destinations.length === 0 && (
              <div className="text-sm text-gray-500">
                {loadingDest ? "Loading…" : destError ? destError : "No accounts available"}
              </div>
            )}
          </div>
        </section>

        <section className="bg-white rounded-lg shadow p-5">
          <h2 className="font-medium mb-3">3) Title & Caption</h2>
          <input
            type="text"
            value={title}
            onChange={(e): void => setTitle(e.target.value)}
            className="w-full mb-3 px-3 py-2 border rounded-lg"
            placeholder="Enter a title (optional)"
          />
          <textarea
            value={caption}
            onChange={(e): void => setCaption(e.target.value)}
            className="w-full min-h-24 resize-y px-3 py-2 border rounded-lg"
            placeholder="Write an optional caption…"
          />
          <div className="mt-4">
            <button
              onClick={(): void => void publish()}
              disabled={publishing}
              className="px-5 py-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:bg-gray-400"
            >
              {publishing ? "Posting…" : "Post via Post-Bridge"}
            </button>
          </div>
        </section>

        {mediaUrls.length > 0 && (
          <section className="bg-white rounded-lg shadow p-5">
            <h2 className="font-medium mb-3">Preview media URLs</h2>
            <ul className="list-disc list-inside text-sm break-all space-y-1">
              {mediaUrls.map((u, i) => (
                <li key={i}>{u}</li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}

