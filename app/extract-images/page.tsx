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

            const imgResponse = await fetch(imageUrl, {
              headers: {
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
                "Referer": "https://www.xiaohongshu.com/",
              },
            });

            if (imgResponse.ok) {
              const blob = await imgResponse.blob();
              // Validate blob is not empty
              if (blob.size === 0) {
                console.error(`Empty blob for image: ${imageUrl}`);
                continue;
              }

              try {
                const urlObj = new URL(imageUrl);
                const pathParts = urlObj.pathname.split("/").filter((p) => p);
                const fileName = pathParts[pathParts.length - 1] || `image-${imgIndex + 1}.jpg`;
                // Ensure unique filename if duplicates exist and sanitize filename
                const sanitizedFileName = fileName.replace(/[<>:"/\\|?*]/g, "_");
                const finalFileName = `${String(imgIndex + 1).padStart(3, "0")}-${sanitizedFileName}`;
                
                postFolder.file(finalFileName, blob);
              } catch (urlError: any) {
                console.error(`Failed to parse URL ${imageUrl}:`, urlError);
                // Fallback filename
                const finalFileName = `${String(imgIndex + 1).padStart(3, "0")}-image.jpg`;
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
      <h1 className="text-2xl font-semibold">Extract Images from Links</h1>
      
      <section className="bg-white rounded-lg shadow p-5">
        <h2 className="font-medium mb-3">Enter URLs</h2>
        <p className="text-sm text-gray-600 mb-3">
          Paste one or more URLs (one per line). Images will be extracted and grouped by post.
        </p>
        <textarea
          value={urls}
          onChange={(e): void => setUrls(e.target.value)}
          className="w-full min-h-32 resize-y px-3 py-2 border rounded-lg font-mono text-sm"
          placeholder="https://www.xiaohongshu.com/explore/...
https://xhslink.com/..."
          disabled={loading}
        />
        <button
          onClick={(): void => void extractImages()}
          disabled={loading || !urls.trim()}
          className="mt-3 px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          {loading ? "Extracting..." : "Extract Images"}
        </button>
      </section>

      {result && (
        <section className="bg-white rounded-lg shadow p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-medium">Preview</h2>
            {result.success && result.posts.some((post) => post.images.length > 0) && (
              <button
                onClick={(): void => void downloadImages()}
                disabled={downloading}
                className="px-5 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {downloading ? "Downloading..." : "Download All as ZIP"}
              </button>
            )}
          </div>

          {result.error && (
            <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
              {result.error}
            </div>
          )}

          <div className="space-y-6">
            {result.posts.map((post, postIndex) => (
              <div key={postIndex} className="border rounded-lg p-4">
                <div className="mb-3">
                  <h3 className="font-medium text-sm text-gray-700 mb-1">
                    Post {postIndex + 1}
                    {post.title && (
                      <span className="text-gray-500 ml-2">({post.title})</span>
                    )}
                  </h3>
                  <a
                    href={post.resolvedUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:underline break-all"
                  >
                    {post.resolvedUrl}
                  </a>
                  {post.error && (
                    <div className="text-xs text-red-600 mt-1">{post.error}</div>
                  )}
                </div>

                {post.images.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                    {post.images.map((imageUrl, imgIndex) => (
                      <div key={imgIndex} className="relative group">
                        <img
                          src={imageUrl}
                          alt={`Image ${imgIndex + 1} from post ${postIndex + 1}`}
                          className="w-full h-32 object-cover rounded border cursor-pointer hover:opacity-80 transition-opacity"
                          loading="lazy"
                          onClick={(): void => {
                            window.open(imageUrl, "_blank", "noopener,noreferrer");
                          }}
                        />
                        <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-opacity flex items-center justify-center">
                          <svg
                            className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity"
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
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-gray-500">No images found</div>
                )}
                <div className="text-xs text-gray-500 mt-2">
                  {post.images.length} image{post.images.length !== 1 ? "s" : ""}
                </div>
              </div>
            ))}
          </div>

          {result.success && (
            <div className="mt-4 pt-4 border-t">
              <div className="text-sm text-gray-600">
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
    </div>
  );
}
