"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import XHSdownload, { type XHSDownloadResult } from "./components/XHSdownload";
import XHSdownloadCaptured from "./components/XHSdownloadCaptured";
import XHSdownloadDirect from "./components/XHSdownloadDirect";
import ProgressBar from "./components/ProgressBar";

type Platform = "instagram" | "x" | "pinterest";

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
  const [caption, setCaption] = useState<string>("#etamecosplay #cosplay #cos");
  const [loadingDest, setLoadingDest] = useState<boolean>(false);
  const [publishing, setPublishing] = useState<boolean>(false);
  const [destError, setDestError] = useState<string>("");

  // Bulk schedule settings (default to true)
  const [useBulkSchedule, setUseBulkSchedule] = useState<boolean>(true);
  const [bulkCaption, setBulkCaption] = useState<string>("#etamecosplay #cosplay #cos");
  const [startDate, setStartDate] = useState<string>(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split("T")[0];
  });
  const [startTime, setStartTime] = useState<string>("09:00");
  const [videosPerDay, setVideosPerDay] = useState<number>(1);
  const [scheduling, setScheduling] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  // Individual captions for each video (indexed by video index)
  const [individualCaptions, setIndividualCaptions] = useState<Map<number, string>>(new Map());

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
      const list = [
        ...data.platforms.instagram,
        ...data.platforms.x,
        ...(data.platforms.pinterest || [])
      ];
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

  // Reset individual captions when media URLs change
  useEffect(() => {
    setIndividualCaptions(new Map());
  }, [mediaUrls]);

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

  // Calculate end date based on start date, videos per day, and total videos
  const calculateEndDate = useCallback((start: string, videosPerDay: number, totalVideos: number): string => {
    if (!start || totalVideos === 0) return start;
    const [year, month, day] = start.split("-").map(Number);
    const startDate = new Date(Date.UTC(year, month - 1, day));
    const totalDays = Math.ceil(totalVideos / videosPerDay);
    const endDate = new Date(startDate);
    endDate.setUTCDate(endDate.getUTCDate() + totalDays - 1);
    return endDate.toISOString().split("T")[0];
  }, []);

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
    setProgress(0);
    const tId = toast.loading(`Scheduling ${mediaUrls.length} videos via Post-Bridge…`);

    // Simulate progress updates
    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 90) return prev; // Don't go to 100% until API call completes
        return prev + 5;
      });
    }, 200);

    try {
      // Build array of captions, one per video
      const captionsArray: string[] = mediaUrls.map((_, i) => {
        const individualCaption = individualCaptions.get(i);
        return individualCaption !== undefined ? individualCaption : (bulkCaption || caption);
      });

      const res = await fetch("/api/post-bridge/bulk-schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mediaUrls,
          destinations: selected,
          caption: bulkCaption || caption, // Keep for backward compatibility
          captions: captionsArray, // Per-video captions
          title,
          startDate,
          startTime,
          videosPerDay,
        }),
      });

      setProgress(95);

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Bulk schedule failed");
      }
      const result = await res.json();
      const successCount = result.scheduled || 0;
      const totalCount = result.total || mediaUrls.length;

      setProgress(100);

      // Calculate end date for success message
      const endDate = calculateEndDate(startDate, videosPerDay, successCount);
      const startDateFormatted = new Date(startDate).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric"
      });
      const endDateFormatted = new Date(endDate).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric"
      });

      toast.success(
        `Successfully scheduled ${successCount} post${successCount !== 1 ? "s" : ""} from ${startDateFormatted} to ${endDateFormatted}`,
        { id: tId, duration: 5000 }
      );
    } catch (e: any) {
      toast.error(e?.message || "Bulk schedule failed", { id: tId });
    } finally {
      clearInterval(progressInterval);
      setScheduling(false);
      setTimeout(() => setProgress(0), 500); // Reset progress after a short delay
    }
  }, [mediaUrls, selected, bulkCaption, caption, title, startDate, startTime, videosPerDay, individualCaptions, calculateEndDate]);

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

      // Use individual caption if set, otherwise fall back to bulk caption or default caption
      const individualCaption = individualCaptions.get(i);
      preview.push({
        date: dateStr,
        time: timeStr,
        caption: individualCaption !== undefined ? individualCaption : (bulkCaption || caption),
        mediaUrl: mediaUrls[i],
        index: i + 1,
      });
    }

    return preview;
  }, [useBulkSchedule, mediaUrls, startDate, startTime, videosPerDay, bulkCaption, caption, individualCaptions]);

  return (
    <div className="flex flex-col lg:flex-row gap-6 p-6 min-h-screen">
      {/* Main content */}
      <main className="flex-1 max-w-3xl w-full">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-semibold text-theme-primary drop-shadow-lg">XHS → Post-Bridge</h1>
          <Link
            href="/extract-images"
            className="px-4 py-2 text-sm font-medium text-theme-primary bg-white/20 hover:bg-white/30 border border-white/30 rounded-lg transition-all shadow-lg"
          >
            Extract Images
          </Link>
        </div>
        <div className="space-y-6">
          <section className="glass-card rounded-lg shadow-xl p-5 border-2 border-red-400/50">
            <div className="flex items-center gap-2 mb-3">
              <h2 className="font-medium text-theme-primary drop-shadow-md">1) Extract from Xiaohongshu (Direct Method)</h2>
              <span className="px-2 py-1 text-xs bg-green-500/30 text-green-100 border border-green-400/50 rounded-full font-semibold">Recommended</span>
            </div>
            <p className="text-sm text-theme-primary/90 mb-3 drop-shadow-sm">
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

          <details className="glass-card rounded-lg shadow-xl p-5">
            <summary className="font-medium mb-3 cursor-pointer text-theme-primary/90 hover:text-theme-primary drop-shadow-sm">
              Alternative Methods (Click to expand)
            </summary>
            <div className="space-y-6 mt-4">
              <section>
                <h3 className="font-medium mb-3 text-sm text-theme-primary/90">1a) Standard extractor (via kukutool)</h3>
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
                <h3 className="font-medium mb-3 text-sm text-theme-primary/90">1b) Captured-only extractor (debug)</h3>
                <p className="text-xs text-theme-primary/80 mb-3">Uses only the headers/body from <code className="bg-white/20 px-1 rounded">api_call</code> to hit kukutool directly.</p>
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

          <section className="glass-card rounded-lg shadow-xl p-5">
            <h2 className="font-medium mb-3 text-theme-primary drop-shadow-md">2) Choose destinations</h2>
            <div className="space-y-4">
              {destinations.some(d => d.platform === "instagram") && (
                <div>
                  <h3 className="text-xs font-medium text-theme-primary/90 mb-2">Instagram</h3>
                  <div className="flex flex-wrap gap-2">
                    {destinations.filter(d => d.platform === "instagram").map((d) => (
                      <button
                        key={d.id}
                        onClick={(): void => toggle(d.id)}
                        className={`px-3 py-2 rounded-full border-2 transition-all ${selected.includes(d.id)
                            ? "bg-blue-600 text-white border-blue-500 shadow-lg shadow-blue-600/50 ring-2 ring-blue-500/50"
                            : "bg-white/20 text-theme-primary/90 border-white/30 hover:bg-white/30 hover:border-white/40"
                          }`}
                        disabled={loadingDest}
                      >
                        {d.handle}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {destinations.some(d => d.platform === "x") && (
                <div>
                  <h3 className="text-xs font-medium text-theme-primary/90 mb-2">X (Twitter)</h3>
                  <div className="flex flex-wrap gap-2">
                    {destinations.filter(d => d.platform === "x").map((d) => (
                      <button
                        key={d.id}
                        onClick={(): void => toggle(d.id)}
                        className={`px-3 py-2 rounded-full border-2 transition-all ${selected.includes(d.id)
                            ? "bg-blue-600 text-white border-blue-500 shadow-lg shadow-blue-600/50 ring-2 ring-blue-500/50"
                            : "bg-white/20 text-theme-primary/90 border-white/30 hover:bg-white/30 hover:border-white/40"
                          }`}
                        disabled={loadingDest}
                      >
                        {d.handle}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {destinations.some(d => d.platform === "pinterest") && (
                <div>
                  <h3 className="text-xs font-medium text-theme-primary/90 mb-2">Pinterest</h3>
                  <div className="flex flex-wrap gap-2">
                    {destinations.filter(d => d.platform === "pinterest").map((d) => (
                      <button
                        key={d.id}
                        onClick={(): void => toggle(d.id)}
                        className={`px-3 py-2 rounded-full border-2 transition-all ${selected.includes(d.id)
                            ? "bg-blue-600 text-white border-blue-500 shadow-lg shadow-blue-600/50 ring-2 ring-blue-500/50"
                            : "bg-white/20 text-theme-primary/90 border-white/30 hover:bg-white/30 hover:border-white/40"
                          }`}
                        disabled={loadingDest}
                      >
                        {d.handle}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {destinations.length === 0 && (
                <div className="text-sm text-theme-primary/80">
                  {loadingDest ? "Loading…" : destError ? destError : "No accounts available"}
                </div>
              )}
            </div>
          </section>

          <section className="glass-card rounded-lg shadow-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-medium text-theme-primary drop-shadow-md">3) Schedule Settings</h2>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!useBulkSchedule}
                  onChange={(e): void => setUseBulkSchedule(!e.target.checked)}
                  className="w-4 h-4 accent-white/50"
                />
                <span className="text-sm text-theme-primary/90">Immediate Post</span>
              </label>
            </div>

            {useBulkSchedule ? (
              <>
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-medium text-theme-primary/90">Bulk Caption</label>
                      <button
                        onClick={(): void => {
                          // Apply bulk caption to all videos
                          const newCaptions = new Map<number, string>();
                          for (let i = 0; i < mediaUrls.length; i++) {
                            newCaptions.set(i, bulkCaption);
                          }
                          setIndividualCaptions(newCaptions);
                          toast.success(`Applied caption to ${mediaUrls.length} video${mediaUrls.length !== 1 ? "s" : ""}`);
                        }}
                        disabled={mediaUrls.length === 0}
                        className="px-3 py-1 text-xs rounded bg-blue-500/80 hover:bg-blue-500 text-theme-primary border border-blue-400/50 disabled:bg-gray-500/50 disabled:cursor-not-allowed transition-all"
                      >
                        Apply
                      </button>
                    </div>
                    <textarea
                      value={bulkCaption}
                      onChange={(e): void => setBulkCaption(e.target.value)}
                      className="glass-input w-full min-h-24 resize-y px-3 py-2 rounded-lg text-theme-primary placeholder-theme-muted"
                      placeholder="Enter a caption to apply to all videos..."
                      maxLength={2200}
                    />
                    <div className="text-xs text-theme-primary/70 mt-1 text-right">
                      {bulkCaption.length}/2200
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-2 text-theme-primary/90">Start Date</label>
                      <input
                        type="date"
                        value={startDate}
                        onChange={(e): void => setStartDate(e.target.value)}
                        className="glass-input w-full px-3 py-2 rounded-lg text-theme-primary"
                        min={new Date().toISOString().split("T")[0]}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2 text-theme-primary/90">Start Time</label>
                      <input
                        type="time"
                        value={startTime}
                        onChange={(e): void => setStartTime(e.target.value)}
                        className="glass-input w-full px-3 py-2 rounded-lg text-theme-primary"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2 text-theme-primary/90">
                      Videos per day (1-24)
                    </label>
                    <select
                      value={videosPerDay}
                      onChange={(e): void => setVideosPerDay(Number(e.target.value))}
                      className="glass-input w-full px-3 py-2 rounded-lg text-white"
                    >
                      {Array.from({ length: 24 }, (_, i) => i + 1).map((num) => (
                        <option key={num} value={num} className="bg-gray-800">
                          {num}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-theme-primary/70 mt-1">
                      {mediaUrls.length > 0 && (
                        <>
                          {mediaUrls.length} video{mediaUrls.length !== 1 ? "s" : ""} will be scheduled over{" "}
                          {Math.ceil(mediaUrls.length / videosPerDay)} day
                          {Math.ceil(mediaUrls.length / videosPerDay) !== 1 ? "s" : ""}
                        </>
                      )}
                    </p>
                  </div>

                  <div className="mt-4 space-y-3">
                    {scheduling && (
                      <ProgressBar
                        progress={progress}
                        label="Scheduling..."
                        showPercentage={true}
                        barColor="bg-green-500"
                      />
                    )}
                    <button
                      onClick={(): void => void bulkSchedule()}
                      disabled={scheduling || mediaUrls.length === 0}
                      className="w-full px-5 py-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white border border-blue-500 disabled:bg-gray-500/50 disabled:cursor-not-allowed font-semibold shadow-xl shadow-blue-600/20 transition-all uppercase tracking-wide"
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
                  className="glass-input w-full mb-3 px-3 py-2 rounded-lg text-theme-primary placeholder-theme-muted"
                  placeholder="Enter a title (optional)"
                />
                <textarea
                  value={caption}
                  onChange={(e): void => setCaption(e.target.value)}
                  className="glass-input w-full min-h-24 resize-y px-3 py-2 rounded-lg text-white placeholder-white/60"
                  placeholder="Write an optional caption…"
                />
                <div className="mt-4">
                  <button
                    onClick={(): void => void publish()}
                    disabled={publishing}
                    className="px-5 py-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white border border-blue-500 disabled:bg-gray-500/50 disabled:cursor-not-allowed font-semibold shadow-xl shadow-blue-600/20 transition-all uppercase tracking-wide"
                  >
                    {publishing ? "Posting…" : "Post via Post-Bridge"}
                  </button>
                </div>
              </>
            )}
          </section>

          {mediaUrls.length > 0 && (
            <section className="glass-card rounded-lg shadow-xl p-5">
              <h2 className="font-medium mb-3 text-theme-primary drop-shadow-md">Preview media URLs</h2>
              <ul className="list-disc list-inside text-sm break-all space-y-1 text-theme-primary/90">
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
          <div className="glass-card rounded-lg shadow-xl p-5 sticky top-6 max-h-[calc(100vh-3rem)] overflow-y-auto">
            <h2 className="font-semibold text-lg mb-4 text-theme-primary drop-shadow-md">Schedule Preview</h2>
            <div className="space-y-3">
              {schedulePreview.map((item, idx) => {
                const isVideo = /\.(mp4|mov|m3u8|mpd)(\?|$)/i.test(item.mediaUrl);
                const isImage = /\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(item.mediaUrl);
                return (
                  <div
                    key={idx}
                    className="glass border border-white/20 rounded-lg p-3 hover:bg-white/10 transition-all"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <span className="text-xs font-medium text-theme-primary/80">
                        #{item.index}
                      </span>
                      <div className="text-right">
                        <div className="text-sm font-semibold text-theme-primary">{item.date}</div>
                        <div className="text-xs text-theme-primary/70">{item.time}</div>
                      </div>
                    </div>
                    {/* Thumbnail with Preview Icon */}
                    <div className="mt-2 mb-2 flex items-center gap-2">
                      <div className="rounded overflow-hidden bg-gray-100 w-20 h-12 flex-shrink-0 relative group">
                        {isVideo ? (
                          <video
                            src={item.mediaUrl}
                            className="w-full h-full object-cover"
                            preload="metadata"
                            muted
                            playsInline
                            onLoadedMetadata={(e): void => {
                              // Seek to first frame for thumbnail
                              const video = e.currentTarget;
                              video.currentTime = 0.1;
                            }}
                          />
                        ) : isImage ? (
                          <img
                            src={item.mediaUrl}
                            alt={`Preview ${item.index}`}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-xs text-theme-muted">
                            Preview unavailable
                          </div>
                        )}
                        {/* Play icon overlay for videos */}
                        {isVideo && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-30 opacity-0 group-hover:opacity-100 transition-opacity">
                            <svg
                              className="w-6 h-6 text-theme-primary"
                              fill="currentColor"
                              viewBox="0 0 20 20"
                            >
                              <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                            </svg>
                          </div>
                        )}
                      </div>
                      {/* Preview Icon Button */}
                      <button
                        onClick={(): void => {
                          window.open(item.mediaUrl, "_blank", "noopener,noreferrer");
                        }}
                        className="p-2 rounded-lg bg-blue-500/30 hover:bg-blue-500/40 text-theme-primary border border-blue-400/50 transition-all flex-shrink-0"
                        title="Open video/image in new tab"
                        aria-label="Preview media"
                      >
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                          />
                        </svg>
                      </button>
                    </div>
                    {/* Editable Caption */}
                    <div className="mt-2">
                      <label className="block text-xs font-medium text-theme-primary/80 mb-1">Caption</label>
                      <textarea
                        value={item.caption}
                        onChange={(e): void => {
                          const newCaptions = new Map(individualCaptions);
                          newCaptions.set(item.index - 1, e.target.value);
                          setIndividualCaptions(newCaptions);
                        }}
                        className="glass-input w-full min-h-16 resize-y px-2 py-1 text-xs rounded-lg text-theme-primary placeholder-theme-muted"
                        placeholder="Enter caption..."
                        maxLength={2200}
                      />
                      <div className="text-xs text-theme-primary/60 mt-1 text-right">
                        {item.caption.length}/2200
                      </div>
                    </div>
                    <div className="mt-2 text-xs text-theme-primary/60 truncate">
                      {item.mediaUrl.split("/").pop() || item.mediaUrl.slice(0, 30) + "..."}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 pt-4 border-t border-white/20">
              <div className="text-sm text-theme-primary/90">
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

