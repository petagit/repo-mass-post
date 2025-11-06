"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";

type Platform = "instagram" | "x" | "pinterest";

export interface Destination {
  id: string;
  platform: Platform;
  handle: string;
  displayName?: string;
  avatarUrl?: string;
}

interface MediaFile {
  id: string;
  file: File;
  preview: string;
  type: "image" | "video";
}

export default function PostPage(): JSX.Element {
  const [title, setTitle] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [selectedDestinations, setSelectedDestinations] = useState<string[]>([]);
  const [loadingDest, setLoadingDest] = useState<boolean>(false);
  const [destError, setDestError] = useState<string>("");
  const [mediaFiles, setMediaFiles] = useState<MediaFile[]>([]);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [password, setPassword] = useState<string>("");
  const [isUnlocked, setIsUnlocked] = useState<boolean>(false);
  const [publishing, setPublishing] = useState<boolean>(false);
  
  // Scheduling state
  const [useSchedule, setUseSchedule] = useState<boolean>(false);
  const [scheduleDate, setScheduleDate] = useState<string>(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split("T")[0];
  });
  const [scheduleTime, setScheduleTime] = useState<string>("09:00");
  const [scheduling, setScheduling] = useState<boolean>(false);

  // Posts state
  const [scheduledPosts, setScheduledPosts] = useState<any[]>([]);
  const [postedPosts, setPostedPosts] = useState<any[]>([]);
  const [loadingPosts, setLoadingPosts] = useState<boolean>(false);
  const [showPosts, setShowPosts] = useState<boolean>(false);

  // Auto-load and select Instagram account "costights"
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
        platforms: { instagram: Destination[]; x: Destination[]; pinterest?: Destination[] };
        defaults: string[];
        error?: string;
      };
      const list = [
        ...data.platforms.instagram,
        ...data.platforms.x,
        ...(data.platforms.pinterest || []),
      ];
      setDestinations(list);
      
      // Auto-select Instagram account "aurawell.official" and Pinterest "infoauraspring"
      const selectedIds: string[] = [];
      
      const aurawellAccount = data.platforms.instagram.find(
        (d) => d.handle.toLowerCase() === "aurawell.official"
      );
      if (aurawellAccount) {
        selectedIds.push(aurawellAccount.id);
      }
      
      const pinterestAccounts = data.platforms.pinterest || [];
      const infoauraspringAccount = pinterestAccounts.find(
        (d) => d.handle.toLowerCase() === "infoauraspring"
      );
      if (infoauraspringAccount) {
        selectedIds.push(infoauraspringAccount.id);
      }
      
      if (selectedIds.length > 0) {
        setSelectedDestinations(selectedIds);
        const accountNames = selectedIds
          .map((id) => {
            const acc = list.find((d) => d.id === id);
            return acc ? `${acc.platform === "instagram" ? "IG" : acc.platform === "pinterest" ? "Pinterest" : "X"}: ${acc.handle}` : null;
          })
          .filter(Boolean)
          .join(", ");
        toast.success(`Selected: ${accountNames}`, { id });
      } else {
        toast.error("Could not find aurawell.official Instagram or infoauraspring Pinterest", { id });
      }
      setDestError(data.error || "");
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

  // Handle password unlock
  const handlePasswordSubmit = useCallback((e: React.FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    if (password === "1234") {
      setIsUnlocked(true);
      toast.success("Post button unlocked!");
      setPassword("");
    } else {
      toast.error("Incorrect password");
      setPassword("");
    }
  }, [password]);

  // Handle file drop
  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = Array.from(e.dataTransfer.files);
    const validFiles = files.filter((file) => {
      const isImage = file.type.startsWith("image/");
      const isVideo = file.type.startsWith("video/");
      return isImage || isVideo;
    });

    if (validFiles.length === 0) {
      toast.error("Please drop only image or video files");
      return;
    }

    const newMediaFiles: MediaFile[] = validFiles.map((file) => {
      const id = `${Date.now()}-${Math.random()}`;
      const preview = URL.createObjectURL(file);
      const type = file.type.startsWith("video/") ? "video" : "image";
      return { id, file, preview, type };
    });

    setMediaFiles((prev) => [...prev, ...newMediaFiles]);
    toast.success(`Added ${validFiles.length} file(s)`);
  }, []);

  // Handle file input
  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>): void => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const validFiles = files.filter((file) => {
      const isImage = file.type.startsWith("image/");
      const isVideo = file.type.startsWith("video/");
      return isImage || isVideo;
    });

    if (validFiles.length === 0) {
      toast.error("Please select only image or video files");
      return;
    }

    const newMediaFiles: MediaFile[] = validFiles.map((file) => {
      const id = `${Date.now()}-${Math.random()}`;
      const preview = URL.createObjectURL(file);
      const type = file.type.startsWith("video/") ? "video" : "image";
      return { id, file, preview, type };
    });

    setMediaFiles((prev) => [...prev, ...newMediaFiles]);
    toast.success(`Added ${validFiles.length} file(s)`);
  }, []);

  // Remove media file
  const removeMediaFile = useCallback((id: string): void => {
    setMediaFiles((prev) => {
      const fileToRemove = prev.find((f) => f.id === id);
      if (fileToRemove) {
        URL.revokeObjectURL(fileToRemove.preview);
      }
      return prev.filter((f) => f.id !== id);
    });
  }, []);

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      mediaFiles.forEach((mf) => {
        URL.revokeObjectURL(mf.preview);
      });
    };
  }, [mediaFiles]);

  // Convert files to data URLs (base64) - no storage needed, sent directly to Post-Bridge
  const convertFilesToDataUrls = useCallback(async (files: File[]): Promise<string[]> => {
    const dataUrls: string[] = await Promise.all(
      files.map((file) => {
        return new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            resolve(reader.result as string);
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      })
    );
    return dataUrls;
  }, []);

  // Publish immediately
  const publish = useCallback(async (): Promise<void> => {
    if (mediaFiles.length === 0) {
      toast.error("Please add at least one photo or video");
      return;
    }
    if (selectedDestinations.length === 0) {
      toast.error("Please select at least one destination");
      return;
    }
    if (!isUnlocked) {
      toast.error("Please unlock the post button with password");
      return;
    }

    setPublishing(true);
    const tId = toast.loading("Processing files and posting…");
    try {
      // Convert files to data URLs and send directly to Post-Bridge
      const fileUrls = await convertFilesToDataUrls(mediaFiles.map((mf) => mf.file));
      
      const res = await fetch("/api/post-bridge/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          caption: description,
          mediaUrls: fileUrls,
          destinations: selectedDestinations,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Publish failed");
      }

      const result = await res.json();
      toast.success("Post published successfully!", { id: tId });
      
      // Reset form
      setTitle("");
      setDescription("");
      setMediaFiles([]);
      setIsUnlocked(false);
    } catch (e: any) {
      toast.error(e?.message || "Publish failed", { id: tId });
    } finally {
      setPublishing(false);
    }
  }, [mediaFiles, selectedDestinations, isUnlocked, title, description, convertFilesToDataUrls]);

  // Schedule post
  const schedulePost = useCallback(async (): Promise<void> => {
    if (mediaFiles.length === 0) {
      toast.error("Please add at least one photo or video");
      return;
    }
    if (selectedDestinations.length === 0) {
      toast.error("Please select at least one destination");
      return;
    }
    if (!isUnlocked) {
      toast.error("Please unlock the post button with password");
      return;
    }
    if (!scheduleDate || !scheduleTime) {
      toast.error("Please select schedule date and time");
      return;
    }

    setScheduling(true);
    const tId = toast.loading("Processing files and scheduling post…");
    try {
      // Convert files to data URLs and send directly to Post-Bridge
      const fileUrls = await convertFilesToDataUrls(mediaFiles.map((mf) => mf.file));
      
      // For scheduling, we'll use the bulk-schedule endpoint with a single item
      const res = await fetch("/api/post-bridge/bulk-schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mediaUrls: fileUrls,
          destinations: selectedDestinations,
          caption: description,
          title,
          startDate: scheduleDate,
          startTime: scheduleTime,
          videosPerDay: 1,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Schedule failed");
      }

      const result = await res.json();
      toast.success("Post scheduled successfully!", { id: tId });
      
      // Reset form
      setTitle("");
      setDescription("");
      setMediaFiles([]);
      setIsUnlocked(false);
      setUseSchedule(false);
    } catch (e: any) {
      toast.error(e?.message || "Schedule failed", { id: tId });
    } finally {
      setScheduling(false);
    }
  }, [mediaFiles, selectedDestinations, isUnlocked, title, description, scheduleDate, scheduleTime, convertFilesToDataUrls]);

  const selectedAccounts = useMemo(() => {
    return destinations.filter((d) => selectedDestinations.includes(d.id));
  }, [destinations, selectedDestinations]);

  // Fetch posts from Post-Bridge for all selected accounts
  const fetchPosts = useCallback(async (): Promise<void> => {
    if (selectedDestinations.length === 0) {
      setScheduledPosts([]);
      setPostedPosts([]);
      setShowPosts(false);
      return;
    }

    setLoadingPosts(true);
    const tId = toast.loading("Fetching posts...");
    try {
      // Fetch posts for all selected accounts
      const allScheduledPosts: any[] = [];
      const allPostedPosts: any[] = [];

      for (const destinationId of selectedDestinations) {
        // Fetch scheduled posts
        const scheduledRes = await fetch(
          `/api/post-bridge/posts?destinationId=${destinationId}&status=scheduled`
        );
        if (scheduledRes.ok) {
          const scheduledData = (await scheduledRes.json()) as { posts: any[]; success: boolean };
          if (scheduledData.posts && scheduledData.posts.length > 0) {
            allScheduledPosts.push(...scheduledData.posts);
          }
        }

        // Fetch posted posts
        const postedRes = await fetch(
          `/api/post-bridge/posts?destinationId=${destinationId}&status=posted`
        );
        if (postedRes.ok) {
          const postedData = (await postedRes.json()) as { posts: any[]; success: boolean };
          if (postedData.posts && postedData.posts.length > 0) {
            allPostedPosts.push(...postedData.posts);
          }
        }
      }

      setScheduledPosts(allScheduledPosts);
      setPostedPosts(allPostedPosts);
      setShowPosts(true);

      const totalScheduled = allScheduledPosts.length;
      const totalPosted = allPostedPosts.length;
      toast.success(
        `Found ${totalScheduled} scheduled and ${totalPosted} posted posts`,
        { id: tId }
      );
    } catch (e: any) {
      toast.error(e?.message || "Failed to fetch posts", { id: tId });
    } finally {
      setLoadingPosts(false);
    }
  }, [selectedDestinations]);

  // Auto-fetch posts when selected destinations change
  useEffect(() => {
    if (selectedDestinations.length > 0 && destinations.length > 0) {
      void fetchPosts();
    }
  }, [selectedDestinations, destinations, fetchPosts]);

  return (
    <div className="flex flex-col gap-6 p-6 max-w-5xl mx-auto min-h-screen">
      <h1 className="text-2xl font-semibold">Post for me Tool</h1>

      {/* Password Protection */}
      {!isUnlocked && (
        <section className="bg-white rounded-lg shadow p-5 border-2 border-yellow-500">
          <h2 className="font-medium mb-3 text-yellow-800">🔒 Unlock Post Button</h2>
          <form onSubmit={handlePasswordSubmit} className="flex gap-3">
            <input
              type="password"
              value={password}
              onChange={(e): void => setPassword(e.target.value)}
              placeholder="Enter password to unlock"
              className="flex-1 px-3 py-2 border rounded-lg"
              autoFocus
            />
            <button
              type="submit"
              className="px-5 py-2 rounded-lg bg-yellow-600 hover:bg-yellow-700 text-white"
            >
              Unlock
            </button>
          </form>
        </section>
      )}

      {/* Title and Description */}
      <section className="bg-white rounded-lg shadow p-5">
        <h2 className="font-medium mb-3">Post Details</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e): void => setTitle(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
              placeholder="Enter post title (optional)"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Description</label>
            <textarea
              value={description}
              onChange={(e): void => setDescription(e.target.value)}
              className="w-full min-h-24 resize-y px-3 py-2 border rounded-lg"
              placeholder="Write a caption or description..."
              maxLength={2200}
            />
            <div className="text-xs text-gray-500 mt-1 text-right">
              {description.length}/2200
            </div>
          </div>
        </div>
      </section>

      {/* Account Selection */}
      <section className="bg-white rounded-lg shadow p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-medium">Selected Accounts</h2>
          {loadingPosts && (
            <span className="text-sm text-gray-500">Loading posts...</span>
          )}
        </div>
        {loadingDest ? (
          <div className="text-sm text-gray-500">Loading accounts...</div>
        ) : destError ? (
          <div className="text-sm text-red-600">{destError}</div>
        ) : selectedAccounts.length > 0 ? (
          <div className="flex flex-wrap items-center gap-3 p-3 bg-gray-50 rounded-lg">
            {selectedAccounts.map((account) => (
              <div
                key={account.id}
                className="px-3 py-2 rounded-full bg-gray-900 text-white text-sm font-medium"
              >
                {account.platform === "instagram"
                  ? "IG"
                  : account.platform === "pinterest"
                  ? "Pinterest"
                  : "X"}{" "}
                · {account.handle}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-gray-500">No accounts selected</div>
        )}
        {destinations.length > 0 && (
          <div className="mt-3 space-y-3">
            <div>
              <h3 className="text-xs font-medium text-gray-600 mb-2">Instagram</h3>
              <div className="flex flex-wrap gap-2">
                {destinations
                  .filter((d) => d.platform === "instagram")
                  .filter((d) => {
                    const handle = d.handle.toLowerCase();
                    return handle !== "costights" && handle !== "petazfeng" && handle !== "cosplay_tights";
                  })
                  .map((d) => (
                    <button
                      key={d.id}
                      onClick={(): void => {
                        setSelectedDestinations((prev) =>
                          prev.includes(d.id)
                            ? prev.filter((id) => id !== d.id)
                            : [...prev, d.id]
                        );
                      }}
                      className={`px-3 py-2 rounded-full border text-sm transition-colors ${
                        selectedDestinations.includes(d.id)
                          ? "bg-gray-900 text-white border-gray-900"
                          : "bg-white text-gray-800 border-gray-300 hover:border-gray-400"
                      }`}
                    >
                      {d.handle}
                    </button>
                  ))}
              </div>
            </div>
            {destinations.some((d) => d.platform === "pinterest") && (
              <div>
                <h3 className="text-xs font-medium text-gray-600 mb-2">Pinterest</h3>
                <div className="flex flex-wrap gap-2">
                  {destinations
                    .filter((d) => d.platform === "pinterest")
                    .map((d) => (
                      <button
                        key={d.id}
                        onClick={(): void => {
                          setSelectedDestinations((prev) =>
                            prev.includes(d.id)
                              ? prev.filter((id) => id !== d.id)
                              : [...prev, d.id]
                          );
                        }}
                        className={`px-3 py-2 rounded-full border text-sm transition-colors ${
                          selectedDestinations.includes(d.id)
                            ? "bg-gray-900 text-white border-gray-900"
                            : "bg-white text-gray-800 border-gray-300 hover:border-gray-400"
                        }`}
                      >
                        {d.handle}
                      </button>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Posts Display */}
      {showPosts && (
        <section className="bg-white rounded-lg shadow p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-medium">Posts History</h2>
            <button
              onClick={(): void => setShowPosts(false)}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Hide
            </button>
          </div>

          {/* Scheduled Posts */}
          {scheduledPosts.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-green-700 mb-3">
                Scheduled Posts ({scheduledPosts.length})
              </h3>
              <div className="space-y-3">
                {scheduledPosts.map((post: any, index: number) => {
                  const scheduledAt = post.scheduled_at || post.scheduledAt;
                  const mediaUrls = post.media_urls || post.mediaUrls || [];
                  const caption = post.caption || post.text || post.title || "";
                  
                  return (
                    <div
                      key={post.id || index}
                      className="border rounded-lg p-4 bg-green-50 border-green-200"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <div className="text-sm font-medium text-gray-900 mb-1">
                            {post.title || `Post #${index + 1}`}
                          </div>
                          {scheduledAt && (
                            <div className="text-xs text-gray-600">
                              Scheduled: {new Date(scheduledAt).toLocaleString()}
                            </div>
                          )}
                          {caption && (
                            <div className="text-sm text-gray-700 mt-2 line-clamp-2">
                              {caption}
                            </div>
                          )}
                        </div>
                        <span className="px-2 py-1 text-xs bg-green-200 text-green-800 rounded-full">
                          Scheduled
                        </span>
                      </div>
                      {mediaUrls.length > 0 && (
                        <div className="mt-3 flex gap-2 flex-wrap">
                          {mediaUrls.slice(0, 3).map((url: string, i: number) => {
                            const isVideo = /\.(mp4|mov|m3u8|mpd)(\?|$)/i.test(url) || url.startsWith("data:video");
                            const isImage = /\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(url) || url.startsWith("data:image");
                            
                            return (
                              <div
                                key={i}
                                className="w-20 h-20 rounded border overflow-hidden bg-gray-100"
                              >
                                {isVideo ? (
                                  <video
                                    src={url}
                                    className="w-full h-full object-cover"
                                    muted
                                    playsInline
                                  />
                                ) : isImage ? (
                                  <img
                                    src={url}
                                    alt={`Media ${i + 1}`}
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-xs text-gray-400">
                                    Media
                                  </div>
                                )}
                              </div>
                            );
                          })}
                          {mediaUrls.length > 3 && (
                            <div className="w-20 h-20 rounded border bg-gray-100 flex items-center justify-center text-xs text-gray-500">
                              +{mediaUrls.length - 3}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Posted Posts */}
          {postedPosts.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-blue-700 mb-3">
                Posted Posts ({postedPosts.length})
              </h3>
              <div className="space-y-3">
                {postedPosts.map((post: any, index: number) => {
                  const publishedAt = post.published_at || post.publishedAt || post.created_at || post.createdAt;
                  const mediaUrls = post.media_urls || post.mediaUrls || [];
                  const caption = post.caption || post.text || post.title || "";
                  
                  return (
                    <div
                      key={post.id || index}
                      className="border rounded-lg p-4 bg-blue-50 border-blue-200"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <div className="text-sm font-medium text-gray-900 mb-1">
                            {post.title || `Post #${index + 1}`}
                          </div>
                          {publishedAt && (
                            <div className="text-xs text-gray-600">
                              Posted: {new Date(publishedAt).toLocaleString()}
                            </div>
                          )}
                          {caption && (
                            <div className="text-sm text-gray-700 mt-2 line-clamp-2">
                              {caption}
                            </div>
                          )}
                        </div>
                        <span className="px-2 py-1 text-xs bg-blue-200 text-blue-800 rounded-full">
                          Posted
                        </span>
                      </div>
                      {mediaUrls.length > 0 && (
                        <div className="mt-3 flex gap-2 flex-wrap">
                          {mediaUrls.slice(0, 3).map((url: string, i: number) => {
                            const isVideo = /\.(mp4|mov|m3u8|mpd)(\?|$)/i.test(url) || url.startsWith("data:video");
                            const isImage = /\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(url) || url.startsWith("data:image");
                            
                            return (
                              <div
                                key={i}
                                className="w-20 h-20 rounded border overflow-hidden bg-gray-100"
                              >
                                {isVideo ? (
                                  <video
                                    src={url}
                                    className="w-full h-full object-cover"
                                    muted
                                    playsInline
                                  />
                                ) : isImage ? (
                                  <img
                                    src={url}
                                    alt={`Media ${i + 1}`}
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-xs text-gray-400">
                                    Media
                                  </div>
                                )}
                              </div>
                            );
                          })}
                          {mediaUrls.length > 3 && (
                            <div className="w-20 h-20 rounded border bg-gray-100 flex items-center justify-center text-xs text-gray-500">
                              +{mediaUrls.length - 3}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {scheduledPosts.length === 0 && postedPosts.length === 0 && (
            <div className="text-sm text-gray-500 text-center py-4">
              No posts found for this account
            </div>
          )}
        </section>
      )}

      {/* Drag and Drop Area */}
      <section className="bg-white rounded-lg shadow p-5">
        <h2 className="font-medium mb-3">Media Files</h2>
        <div
          onDrop={handleDrop}
          onDragOver={(e): void => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={(): void => setIsDragging(false)}
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
            isDragging
              ? "border-blue-500 bg-blue-50"
              : "border-gray-300 hover:border-gray-400"
          }`}
        >
          <input
            type="file"
            id="file-input"
            multiple
            accept="image/*,video/*"
            onChange={handleFileInput}
            className="hidden"
          />
          <label
            htmlFor="file-input"
            className="cursor-pointer flex flex-col items-center gap-3"
          >
            <svg
              className="w-12 h-12 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
            <div>
              <span className="text-blue-600 hover:text-blue-700 font-medium">
                Click to upload
              </span>
              <span className="text-gray-600"> or drag and drop</span>
            </div>
            <p className="text-sm text-gray-500">Photos and videos (PNG, JPG, MP4, etc.)</p>
          </label>
        </div>

        {/* Media Preview Grid */}
        {mediaFiles.length > 0 && (
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {mediaFiles.map((mediaFile) => (
              <div key={mediaFile.id} className="relative group">
                <div className="aspect-square rounded-lg overflow-hidden bg-gray-100 border">
                  {mediaFile.type === "video" ? (
                    <video
                      src={mediaFile.preview}
                      className="w-full h-full object-cover"
                      controls={false}
                      muted
                    />
                  ) : (
                    <img
                      src={mediaFile.preview}
                      alt="Preview"
                      className="w-full h-full object-cover"
                    />
                  )}
                </div>
                <button
                  onClick={(): void => removeMediaFile(mediaFile.id)}
                  className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                  aria-label="Remove file"
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
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
                <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-50 text-white text-xs p-1 truncate">
                  {mediaFile.file.name}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Scheduling Options */}
      <section className="bg-white rounded-lg shadow p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-medium">Schedule Settings</h2>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={useSchedule}
              onChange={(e): void => setUseSchedule(e.target.checked)}
              className="w-4 h-4"
            />
            <span className="text-sm">Schedule Post</span>
          </label>
        </div>

        {useSchedule && (
          <div className="grid grid-cols-2 gap-4 mt-4">
            <div>
              <label className="block text-sm font-medium mb-2">Schedule Date</label>
              <input
                type="date"
                value={scheduleDate}
                onChange={(e): void => setScheduleDate(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg"
                min={new Date().toISOString().split("T")[0]}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Schedule Time</label>
              <input
                type="time"
                value={scheduleTime}
                onChange={(e): void => setScheduleTime(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg"
              />
            </div>
          </div>
        )}
      </section>

      {/* Post Button */}
      <section className="bg-white rounded-lg shadow p-5">
        {useSchedule ? (
          <button
            onClick={(): void => void schedulePost()}
            disabled={!isUnlocked || scheduling || mediaFiles.length === 0}
            className="w-full px-5 py-3 rounded-lg bg-green-600 hover:bg-green-700 text-white disabled:bg-gray-400 disabled:cursor-not-allowed font-medium"
          >
            {scheduling
              ? "Scheduling..."
              : !isUnlocked
              ? "🔒 Enter password to unlock"
              : `Schedule Post${mediaFiles.length > 0 ? ` (${mediaFiles.length} file${mediaFiles.length !== 1 ? "s" : ""})` : ""}`}
          </button>
        ) : (
          <button
            onClick={(): void => void publish()}
            disabled={!isUnlocked || publishing || mediaFiles.length === 0}
            className="w-full px-5 py-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:bg-gray-400 disabled:cursor-not-allowed font-medium"
          >
            {publishing
              ? "Publishing..."
              : !isUnlocked
              ? "🔒 Enter password to unlock"
              : `Post Now${mediaFiles.length > 0 ? ` (${mediaFiles.length} file${mediaFiles.length !== 1 ? "s" : ""})` : ""}`}
          </button>
        )}
      </section>
    </div>
  );
}

