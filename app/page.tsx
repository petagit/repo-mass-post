"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
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

export default function Page() {
  const [media, setMedia] = useState<XHSDownloadResult | null>(null);
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [title, setTitle] = useState<string>("");
  const [caption, setCaption] = useState<string>("");
  const [loadingDest, setLoadingDest] = useState<boolean>(false);
  const [publishing, setPublishing] = useState<boolean>(false);
  const [destError, setDestError] = useState<string>("");
  
  // Bulk schedule settings (default to true)
  const [useBulkSchedule, setUseBulkSchedule] = useState<boolean>(true);
  const [bulkCaption, setBulkCaption] = useState<string>("");
  const [startDate, setStartDate] = useState<string>(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split("T")[0];
  });
  const [startTime, setStartTime] = useState<string>("09:00");
  const [videosPerDay, setVideosPerDay] = useState<number>(1);
  const [scheduling, setScheduling] = useState<boolean>(false);

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
  }, [caption, mediaUrls, selected, title]);

  const bulkSchedule = useCallback(async (): Promise<void> => {
    if (mediaUrls.length === 0) {
      toast.error("No media to schedule");
      return;
    }
    if (selected.length === 0) {
      toast.error("Select at least one destination");
      return;
    }
    if (!startDate || !startTime) {
      toast.error("Start date and time are required");
      return;
    }
    if (videosPerDay < 1 || videosPerDay > 24) {
      toast.error("Videos per day must be between 1 and 24");
      return;
    }
    
    setScheduling(true);
    const tId = toast.loading(`Scheduling ${mediaUrls.length} videos via Post-Bridge…`);
    try {
      const res = await fetch("/api/post-bridge/bulk-schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mediaUrls,
          destinations: selected,
          caption: bulkCaption || caption,
          title,
          startDate,
          startTime,
          videosPerDay,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Bulk schedule failed");
      }
      const result = await res.json();
      const successCount = result.scheduled || 0;
      const totalCount = result.total || mediaUrls.length;
      toast.success(
        `Successfully scheduled ${successCount}/${totalCount} videos`,
        { id: tId }
      );
    } catch (e: any) {
      toast.error(e?.message || "Bulk schedule failed", { id: tId });
    } finally {
      setScheduling(false);
    }
  }, [mediaUrls, selected, bulkCaption, caption, title, startDate, startTime, videosPerDay]);

  // Calculate schedule preview
  const schedulePreview: Array<{ date: string; time: string; caption: string; mediaUrl: string; index: number }> = useMemo(() => {
    if (!useBulkSchedule || mediaUrls.length === 0 || !startDate || !startTime) {
      return [];
    }

    const [year, month, day] = startDate.split("-").map(Number);
    const [hours, minutes] = startTime.split(":").map(Number);
    const startDateTime = new Date(Date.UTC(year, month - 1, day, hours, minutes, 0));

    const preview: Array<{ date: string; time: string; caption: string; mediaUrl: string; index: number }> = [];

    for (let i = 0; i < mediaUrls.length; i++) {
      const dayIndex = Math.floor(i / videosPerDay);
      const videoIndexInDay = i % videosPerDay;
      
      const scheduledDate = new Date(startDateTime);
      scheduledDate.setUTCDate(scheduledDate.getUTCDate() + dayIndex);
      
      const hoursPerDay = 24;
      const timeIntervalHours = hoursPerDay / videosPerDay;
      const scheduledHours = hours + (videoIndexInDay * timeIntervalHours);
      
      let scheduledHour = Math.floor(scheduledHours) % 24;
      const scheduledMinute = Math.floor((scheduledHours % 1) * 60);
      
      if (scheduledHours >= 24) {
        scheduledDate.setUTCDate(scheduledDate.getUTCDate() + 1);
      }
      
      scheduledDate.setUTCHours(scheduledHour, scheduledMinute, 0, 0);

      const dateStr = scheduledDate.toISOString().split("T")[0];
      const timeStr = `${String(scheduledHour).padStart(2, "0")}:${String(scheduledMinute).padStart(2, "0")}`;
      
      preview.push({
        date: dateStr,
        time: timeStr,
        caption: bulkCaption || caption,
        mediaUrl: mediaUrls[i],
        index: i + 1,
      });
    }

    return preview;
  }, [useBulkSchedule, mediaUrls, startDate, startTime, videosPerDay, bulkCaption, caption]);

  return (
    <div className="flex flex-col lg:flex-row gap-6 p-6 min-h-screen">
      {/* Main content */}
      <main className="flex-1 max-w-3xl w-full">
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
            placeholder="Paste XHS shortened links (one per line or multiple links in text)..."
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
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-medium">3) Schedule Settings</h2>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={!useBulkSchedule}
                onChange={(e): void => setUseBulkSchedule(!e.target.checked)}
                className="w-4 h-4"
              />
              <span className="text-sm">Immediate Post</span>
            </label>
          </div>

          {useBulkSchedule ? (
            <>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Bulk Caption</label>
                  <textarea
                    value={bulkCaption}
                    onChange={(e): void => setBulkCaption(e.target.value)}
                    className="w-full min-h-24 resize-y px-3 py-2 border rounded-lg"
                    placeholder="Enter a caption to apply to all videos..."
                    maxLength={2200}
                  />
                  <div className="text-xs text-gray-500 mt-1 text-right">
                    {bulkCaption.length}/2200
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Start Date</label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e): void => setStartDate(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg"
                      min={new Date().toISOString().split("T")[0]}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Start Time</label>
                    <input
                      type="time"
                      value={startTime}
                      onChange={(e): void => setStartTime(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">
                    Videos per day (1-24)
                  </label>
                  <select
                    value={videosPerDay}
                    onChange={(e): void => setVideosPerDay(Number(e.target.value))}
                    className="w-full px-3 py-2 border rounded-lg"
                  >
                    {Array.from({ length: 24 }, (_, i) => i + 1).map((num) => (
                      <option key={num} value={num}>
                        {num}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    {mediaUrls.length > 0 && (
                      <>
                        {mediaUrls.length} video{mediaUrls.length !== 1 ? "s" : ""} will be scheduled over{" "}
                        {Math.ceil(mediaUrls.length / videosPerDay)} day
                        {Math.ceil(mediaUrls.length / videosPerDay) !== 1 ? "s" : ""}
                      </>
                    )}
                  </p>
                </div>

                <div className="mt-4">
                  <button
                    onClick={(): void => void bulkSchedule()}
                    disabled={scheduling || mediaUrls.length === 0}
                    className="px-5 py-3 rounded-lg bg-green-600 hover:bg-green-700 text-white disabled:bg-gray-400"
                  >
                    {scheduling
                      ? `Scheduling ${mediaUrls.length} videos…`
                      : `Schedule ${mediaUrls.length} video${mediaUrls.length !== 1 ? "s" : ""} via Post-Bridge`}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <>
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
            </>
          )}
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

      {/* Sidebar - Schedule Preview */}
      {useBulkSchedule && mediaUrls.length > 0 && (
        <aside className="w-full lg:w-80 flex-shrink-0">
          <div className="bg-white rounded-lg shadow p-5 sticky top-6 max-h-[calc(100vh-3rem)] overflow-y-auto">
            <h2 className="font-semibold text-lg mb-4">Schedule Preview</h2>
            <div className="space-y-3">
              {schedulePreview.map((item, idx) => (
                <div
                  key={idx}
                  className="border rounded-lg p-3 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-start justify-between mb-2">
                    <span className="text-xs font-medium text-gray-500">
                      #{item.index}
                    </span>
                    <div className="text-right">
                      <div className="text-sm font-semibold">{item.date}</div>
                      <div className="text-xs text-gray-500">{item.time}</div>
                    </div>
                  </div>
                  {item.caption && (
                    <p className="text-xs text-gray-700 line-clamp-2 mt-2">
                      {item.caption}
                    </p>
                  )}
                  <div className="mt-2 text-xs text-gray-400 truncate">
                    {item.mediaUrl.split("/").pop() || item.mediaUrl.slice(0, 30) + "..."}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t">
              <div className="text-sm text-gray-600">
                <div className="flex justify-between mb-1">
                  <span>Total:</span>
                  <span className="font-semibold">{mediaUrls.length} video{mediaUrls.length !== 1 ? "s" : ""}</span>
                </div>
                <div className="flex justify-between mb-1">
                  <span>Days:</span>
                  <span className="font-semibold">{Math.ceil(mediaUrls.length / videosPerDay)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Per day:</span>
                  <span className="font-semibold">{videosPerDay}</span>
                </div>
              </div>
            </div>
          </div>
        </aside>
      )}
    </div>
  );
}

