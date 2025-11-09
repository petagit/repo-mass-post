"use client";

import React, { useState, useCallback } from "react";
import toast from "react-hot-toast";
import JSZip from "jszip";

interface PostImages {
  url: string;
  resolvedUrl: string;
  images: string[];
  title?: string;
  error?: string;
}

interface ExtractionResult {
  success: boolean;
  posts: PostImages[];
  error?: string;
}

export default function ExtractImagesPage(): JSX.Element {
  const [urls, setUrls] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [result, setResult] = useState<ExtractionResult | null>(null);
  const [downloading, setDownloading] = useState<boolean>(false);
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Build a same-origin proxy URL for remote images to bypass CORS/hotlink blocks
  const toProxyUrl = useCallback((imageUrl: string): string => {
    try {
      if (!imageUrl || typeof imageUrl !== "string") return imageUrl;
      return `/api/proxy-image?url=${encodeURIComponent(imageUrl)}`;
    } catch {
      return imageUrl;
    }
  }, []);

  const extractImages = useCallback(async (): Promise<void> => {
    if (!urls.trim()) {
      toast.error("Please enter at least one URL");
      return;
    }

    setLoading(true);
    const toastId = toast.loading("Extracting images...");

    try {
      const response = await fetch("/api/extract-images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: urls }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Failed to extract images");
      }

      const data = (await response.json()) as ExtractionResult;
      setResult(data);
      setFailedImages(new Set()); // Reset failed images when extracting new ones

      const totalImages = data.posts.reduce((sum, post) => sum + post.images.length, 0);
      if (data.success && totalImages > 0) {
        toast.success(`Extracted ${totalImages} image(s) from ${data.posts.length} post(s)`, { id: toastId });
      } else {
        toast.error("No images found", { id: toastId });
      }
    } catch (e: any) {
      toast.error(e?.message || "Failed to extract images", { id: toastId });
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [urls]);

  const isImageLink = useCallback((url: string): boolean => {
    const urlLower = url.toLowerCase();
    
    // Check for video-related patterns
    if (
      /sns-video-/i.test(urlLower) ||
      /\.(mp4|mov|m3u8|mpd|webm|avi|mkv|flv|wmv)(\?|$)/i.test(urlLower) ||
      /\/video\//i.test(urlLower) ||
      /video/i.test(urlLower.split('/').pop() || '')
    ) {
      return false;
    }
    
    // Check for image-related patterns
    if (
      /\.(jpg|jpeg|png|webp|gif|bmp|svg)(\?|$)/i.test(urlLower) ||
      /xhscdn/i.test(urlLower) ||
      /image/i.test(urlLower)
    ) {
      return true;
    }
    
    // Default to true if no clear video indicators (to be safe)
    return true;
  }, []);

  const copyToClipboard = useCallback(async (text: string, key: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      toast.success("Link copied to clipboard!");
      setTimeout(() => setCopiedKey(null), 2000);
    } catch (err) {
      toast.error("Failed to copy link");
    }
  }, []);

  const copyAllLinks = useCallback(async (): Promise<void> => {
    if (!result || !result.success) {
      toast.error("No links to copy");
      return;
    }

    const allLinks: string[] = [];
    result.posts.forEach((post) => {
      post.images.forEach((imageUrl) => {
        // Only include actual image links, not video links
        if (isImageLink(imageUrl)) {
          allLinks.push(imageUrl);
        }
      });
    });

    if (allLinks.length === 0) {
      toast.error("No image links found");
      return;
    }

    try {
      await navigator.clipboard.writeText(allLinks.join("\n"));
      setCopiedKey("all");
      toast.success(`Copied ${allLinks.length} image link(s) to clipboard!`);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch (err) {
      toast.error("Failed to copy links");
    }
  }, [result, isImageLink]);

  const downloadImages = useCallback(async (): Promise<void> => {
    if (!result || !result.success) {
      toast.error("No images to download");
      return;
    }

    setDownloading(true);
    const toastId = toast.loading("Preparing zip file...");

    try {
      const zip = new JSZip();

      // Process each post
      for (let postIndex = 0; postIndex < result.posts.length; postIndex++) {
        const post = result.posts[postIndex];
        if (post.images.length === 0) continue;

        // Create a folder for each post
        const postTitle = post.title || `post-${postIndex + 1}`;
        // Sanitize folder name and ensure it's not empty
        let sanitizedTitle = postTitle.replace(/[<>:"/\\|?*]/g, "_").substring(0, 50).trim();
        if (!sanitizedTitle) {
          sanitizedTitle = `post-${postIndex + 1}`;
        }
        // Ensure unique folder names by appending index if needed (JSZip will return same folder for duplicate names)
        const folderName = `${String(postIndex + 1).padStart(3, "0")}-${sanitizedTitle}`;
        const postFolder = zip.folder(folderName);

        if (!postFolder) {
          console.error(`Failed to create folder: ${folderName}`);
          continue;
        }

        // Fetch and add each image to the zip
        for (let imgIndex = 0; imgIndex < post.images.length; imgIndex++) {
          const imageUrl = post.images[imgIndex];
          try {
            const totalPosts = result.posts.length;
            const totalImages = result.posts.reduce((sum, p) => sum + p.images.length, 0);
            const currentImageNumber = result.posts.slice(0, postIndex).reduce((sum, p) => sum + p.images.length, 0) + imgIndex + 1;
            toast.loading(`Downloading image ${currentImageNumber}/${totalImages} (Post ${postIndex + 1}/${totalPosts})...`, { id: toastId });
            
            // Validate URL before parsing
            if (!imageUrl || typeof imageUrl !== "string" || !imageUrl.startsWith("http")) {
              console.error(`Invalid image URL: ${imageUrl}`);
              continue;
            }

            // Fetch via our proxy endpoint (same-origin, no CORS)
            const imgResponse = await fetch(toProxyUrl(imageUrl));

            if (imgResponse.ok) {
              // Check Content-Type to ensure it's actually an image
              const contentType = imgResponse.headers.get("content-type") || "";
              const isImageContentType = /^image\/(jpeg|jpg|png|webp|gif|bmp|svg)/i.test(contentType);
              
              // Also check URL for image indicators
              const urlLower = imageUrl.toLowerCase();
              const isImageUrl = /\.(jpg|jpeg|png|webp|gif|bmp|svg)(\?|$)/i.test(imageUrl) || 
                                /xhscdn/i.test(urlLower) ||
                                isImageContentType;
              
              // Skip if it's clearly not an image (JS, CSS, ICO, etc.)
              if (!isImageContentType && !isImageUrl) {
                // Check for non-image file extensions
                if (/\.(js|css|ico|json|html|xml|txt|woff|woff2|ttf|eot|svg)(\?|$)/i.test(imageUrl)) {
                  console.warn(`Skipping non-image file: ${imageUrl} (Content-Type: ${contentType})`);
                  continue;
                }
              }
              
              const blob = await imgResponse.blob();
              // Validate blob is not empty
              if (blob.size === 0) {
                console.error(`Empty blob for image: ${imageUrl}`);
                continue;
              }
              
              // Double-check blob type
              if (!isImageContentType && blob.type && !blob.type.startsWith("image/")) {
                console.warn(`Skipping non-image blob: ${imageUrl} (Blob type: ${blob.type})`);
                continue;
              }

              try {
                const urlObj = new URL(imageUrl);
                const pathParts = urlObj.pathname.split("/").filter((p) => p);
                let fileName = pathParts[pathParts.length - 1] || `image-${imgIndex + 1}`;
                
                // Remove query parameters from filename
                fileName = fileName.split("?")[0];
                
                // Determine proper file extension based on Content-Type first
                let fileExtension = "";
                if (isImageContentType) {
                  // Use Content-Type to determine extension (most reliable)
                  if (contentType.includes("jpeg") || contentType.includes("jpg")) {
                    fileExtension = ".jpg";
                  } else if (contentType.includes("png")) {
                    fileExtension = ".png";
                  } else if (contentType.includes("webp")) {
                    fileExtension = ".webp";
                  } else if (contentType.includes("gif")) {
                    fileExtension = ".gif";
                  }
                }
                
                // If no extension from Content-Type, try to extract from filename
                if (!fileExtension) {
                  // Match image extensions, including cases like .webp_3, .webp_2, etc.
                  const extMatch = fileName.match(/\.(jpg|jpeg|png|webp|gif|bmp|svg)(?:_\d+)?(\?|$)/i);
                  if (extMatch) {
                    const baseExt = extMatch[1].toLowerCase();
                    // Always use standard extension without _3, _2, etc.
                    if (baseExt === "webp") {
                      fileExtension = ".webp";
                    } else if (baseExt === "jpeg") {
                      fileExtension = ".jpg";
                    } else {
                      fileExtension = `.${baseExt}`;
                    }
                    // Remove the extension (including _3 suffix) from filename
                    fileName = fileName.replace(/\.(jpg|jpeg|png|webp|gif|bmp|svg)(?:_\d+)?.*$/i, "");
                  } else if (/xhscdn/i.test(urlObj.hostname)) {
                    // XHS CDN images are typically webp
                    fileExtension = ".webp";
                  } else {
                    // Default to jpg if we can't determine
                    fileExtension = ".jpg";
                  }
                }
                
                // Strip any trailing _1, _2, _3, etc. from filename before adding extension
                fileName = fileName.replace(/_\d+$/, "");
                
                // Ensure filename has proper extension (without _3 suffix)
                const currentExt = fileName.match(/\.(jpg|jpeg|png|webp|gif|bmp|svg)(?:_\d+)?$/i);
                if (currentExt) {
                  // Remove existing extension and add correct one
                  fileName = fileName.replace(/\.(jpg|jpeg|png|webp|gif|bmp|svg)(?:_\d+)?$/i, "");
                }
                
                // Add the correct extension
                fileName = fileName + fileExtension;
                
                // Sanitize filename
                const sanitizedFileName = fileName.replace(/[<>:"/\\|?*]/g, "_");
                const finalFileName = `${String(imgIndex + 1).padStart(3, "0")}-${sanitizedFileName}`;
                
                postFolder.file(finalFileName, blob);
              } catch (urlError: any) {
                console.error(`Failed to parse URL ${imageUrl}:`, urlError);
                // Fallback filename with proper extension
                const ext = isImageContentType && contentType.includes("webp") ? ".webp" : 
                           isImageContentType && contentType.includes("png") ? ".png" : ".jpg";
                const finalFileName = `${String(imgIndex + 1).padStart(3, "0")}-image${ext}`;
                postFolder.file(finalFileName, blob);
              }
            } else {
              console.error(`Failed to fetch image: ${imageUrl} (Status: ${imgResponse.status})`);
            }
          } catch (imgError: any) {
            console.error(`Failed to download image ${imageUrl}:`, imgError);
            // Continue with other images
          }
        }
      }

      // Check if zip has any files before generating
      const zipFileCount = Object.keys(zip.files).length;
      if (zipFileCount === 0) {
        toast.error("No images were successfully downloaded", { id: toastId });
        return;
      }

      // Generate zip file
      toast.loading("Generating zip file...", { id: toastId });
      const zipBlob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });

      // Download the zip file
      const url = URL.createObjectURL(zipBlob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `extracted-images-${new Date().toISOString().split("T")[0]}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success(`Successfully downloaded ${zipFileCount} file(s) as ZIP!`, { id: toastId });
    } catch (e: any) {
      toast.error(e?.message || "Failed to download images", { id: toastId });
    } finally {
      setDownloading(false);
    }
  }, [result]);

  return (
    <div className="flex flex-col gap-6 p-6 max-w-7xl mx-auto min-h-screen">
      <h1 className="text-2xl font-semibold text-theme-primary drop-shadow-lg">Extract Images from Links</h1>
      
      <section className="glass-card rounded-lg shadow-xl p-5">
        <h2 className="font-medium mb-3 text-theme-primary drop-shadow-md">Enter URLs</h2>
        <p className="text-sm text-theme-primary/90 mb-3">
          Paste one or more URLs (one per line). Images will be extracted and grouped by post.
        </p>
        <textarea
          value={urls}
          onChange={(e): void => setUrls(e.target.value)}
          className="glass-input w-full min-h-32 resize-y px-3 py-2 rounded-lg font-mono text-sm text-theme-primary placeholder-theme-muted"
          placeholder="https://www.xiaohongshu.com/explore/...
https://xhslink.com/..."
          disabled={loading}
        />
        <button
          onClick={(): void => void extractImages()}
          disabled={loading || !urls.trim()}
          className="mt-3 px-5 py-2 rounded-lg bg-blue-500/80 hover:bg-blue-500 text-theme-primary border border-blue-400/50 disabled:bg-gray-500/50 disabled:cursor-not-allowed shadow-lg transition-all"
        >
          {loading ? "Extracting..." : "Extract Images"}
        </button>
      </section>

      {result && (
        <section className="glass-card rounded-lg shadow-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-medium text-theme-primary drop-shadow-md">Preview</h2>
            {result.success && result.posts.some((post) => post.images.length > 0) && (
              <button
                onClick={(): void => void downloadImages()}
                disabled={downloading}
                className="px-5 py-2 rounded-lg bg-green-500/80 hover:bg-green-500 text-theme-primary border border-green-400/50 disabled:bg-gray-500/50 disabled:cursor-not-allowed shadow-lg transition-all"
              >
                {downloading ? "Downloading..." : "Download All as ZIP"}
              </button>
            )}
          </div>

          {result.error && (
            <div className="mb-4 p-3 bg-yellow-500/20 border border-yellow-400/50 rounded-lg text-sm text-yellow-200">
              {result.error}
            </div>
          )}

          <div className="space-y-6">
            {result.posts.map((post, postIndex) => (
              <div key={postIndex} className="glass border border-white/20 rounded-lg p-4">
                <div className="mb-3">
                  <h3 className="font-medium text-sm text-theme-primary mb-1">
                    Post {postIndex + 1}
                    {post.title && (
                      <span className="text-theme-primary/70 ml-2">({post.title})</span>
                    )}
                  </h3>
                  <a
                    href={post.resolvedUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-200 hover:text-blue-100 hover:underline break-all"
                  >
                    {post.resolvedUrl}
                  </a>
                  {post.error && (
                    <div className="text-xs text-red-300 mt-1">{post.error}</div>
                  )}
                </div>

                {post.images.length > 0 ? (() => {
                  // Filter out failed images and video links
                  const visibleImages = post.images.filter((imageUrl, imgIndex) => {
                    // Skip video links
                    if (!isImageLink(imageUrl)) {
                      return false;
                    }
                    const imageKey = `${postIndex}-${imgIndex}-${imageUrl}`;
                    return !failedImages.has(imageKey);
                  });

                  return visibleImages.length > 0 ? (
                    <>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                        {post.images.map((imageUrl, imgIndex) => {
                          const imageKey = `${postIndex}-${imgIndex}-${imageUrl}`;
                          const hasFailed = failedImages.has(imageKey);
                          
                          // Skip rendering failed images and video links
                          if (hasFailed || !isImageLink(imageUrl)) {
                            return null;
                          }
                          
                          return (
                            <div 
                              key={imgIndex} 
                              className="relative group cursor-pointer aspect-[3/4]"
                              onClick={(): void => {
                                window.open(toProxyUrl(imageUrl), "_blank", "noopener,noreferrer");
                              }}
                              title="Click to open image in new tab"
                            >
                              <img
                                src={toProxyUrl(imageUrl)}
                                alt={`Image ${imgIndex + 1} from post ${postIndex + 1}`}
                                className="w-full h-full object-cover rounded border hover:opacity-80 transition-opacity"
                                loading="lazy"
                                onError={(): void => {
                                  setFailedImages((prev) => new Set(prev).add(imageKey));
                                }}
                              />
                              <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-opacity flex items-center justify-center rounded">
                                <svg
                                  className="w-6 h-6 text-theme-primary opacity-0 group-hover:opacity-100 transition-opacity"
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
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      {visibleImages.length < post.images.length && (
                        <div className="text-xs text-theme-primary/60 mt-2">
                          {visibleImages.length} of {post.images.length} images shown ({post.images.length - visibleImages.length} failed to load)
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-sm text-theme-primary/80">
                      All {post.images.length} image{post.images.length !== 1 ? "s" : ""} failed to load
                    </div>
                  );
                })() : (
                  <div className="text-sm text-theme-primary/80">No images found</div>
                )}
                <div className="text-xs text-theme-primary/70 mt-2">
                  {post.images.length} image{post.images.length !== 1 ? "s" : ""} total
                </div>
              </div>
            ))}
          </div>

          {result.success && (
            <div className="mt-4 pt-4 border-t border-white/20">
              <div className="text-sm text-theme-primary/90">
                <div className="flex justify-between">
                  <span>Total Posts:</span>
                  <span className="font-semibold">{result.posts.length}</span>
                </div>
                <div className="flex justify-between">
                  <span>Total Images:</span>
                  <span className="font-semibold">
                    {result.posts.reduce((sum, post) => sum + post.images.length, 0)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {result && result.success && result.posts.some((post) => post.images.length > 0) && (
        <section className="glass-card rounded-lg shadow-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-medium text-theme-primary drop-shadow-md">All Image Links</h2>
            <button
              onClick={(): void => void copyAllLinks()}
              className="px-4 py-2 rounded-lg bg-blue-500/80 hover:bg-blue-500 text-theme-primary border border-blue-400/50 text-sm disabled:bg-gray-500/50 disabled:cursor-not-allowed shadow-lg transition-all"
            >
              {copiedKey === "all" ? "Copied!" : "Copy All Links"}
            </button>
          </div>

          <div className="max-h-96 overflow-y-auto glass border border-white/20 rounded-lg">
            <div className="divide-y divide-white/10">
              {(() => {
                // Collect all image links with their metadata
                const allImageLinks: Array<{
                  url: string;
                  postIndex: number;
                  imgIndex: number;
                  postTitle?: string;
                }> = [];
                
                result.posts.forEach((post, postIndex) => {
                  post.images.forEach((imageUrl, imgIndex) => {
                    if (isImageLink(imageUrl)) {
                      allImageLinks.push({
                        url: imageUrl,
                        postIndex,
                        imgIndex,
                        postTitle: post.title,
                      });
                    }
                  });
                });

                return allImageLinks.map((item, index) => {
                  const linkKey = `post-${item.postIndex}-img-${item.imgIndex}`;
                  const isCopied = copiedKey === linkKey;

                  return (
                    <div
                      key={linkKey}
                      className="p-3 hover:bg-white/10 transition-all flex items-start gap-3"
                    >
                      <div className="flex-shrink-0 w-8 h-8 rounded bg-white/20 flex items-center justify-center text-xs text-theme-primary font-medium border border-white/30">
                        {index + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-theme-primary/70 mb-1">
                          Post {item.postIndex + 1}, Image {item.imgIndex + 1}
                          {item.postTitle && (
                            <span className="ml-2">({item.postTitle})</span>
                          )}
                        </div>
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-blue-200 hover:text-blue-100 hover:underline break-all"
                          onClick={(e): void => {
                            e.stopPropagation();
                          }}
                        >
                          {item.url}
                        </a>
                      </div>
                      <button
                        onClick={(e): void => {
                          e.stopPropagation();
                          void copyToClipboard(item.url, linkKey);
                        }}
                        className="flex-shrink-0 px-3 py-1.5 text-sm rounded bg-white/20 hover:bg-white/30 text-theme-primary border border-white/30 transition-all"
                        title="Copy link"
                      >
                        {isCopied ? (
                          <span className="flex items-center gap-1">
                            <svg
                              className="w-4 h-4 text-green-300"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M5 13l4 4L19 7"
                              />
                            </svg>
                            Copied
                          </span>
                        ) : (
                          <span className="flex items-center gap-1">
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
                                d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                              />
                            </svg>
                            Copy
                          </span>
                        )}
                      </button>
                    </div>
                  );
                });
              })()}
            </div>
          </div>

          <div className="mt-3 text-xs text-theme-primary/70 text-center">
            {result.posts.reduce((sum, post) => {
              const imageCount = post.images.filter((url) => isImageLink(url)).length;
              return sum + imageCount;
            }, 0)}{" "}
            image
            {result.posts.reduce((sum, post) => {
              const imageCount = post.images.filter((url) => isImageLink(url)).length;
              return sum + imageCount;
            }, 0) !== 1
              ? "s"
              : ""}{" "}
            listed
          </div>
        </section>
      )}
    </div>
  );
}
