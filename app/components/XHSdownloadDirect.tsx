"use client";

import React, { useCallback, useMemo, useState } from "react";

export interface XHSDownloadResult {
  success: boolean;
  imageLinks: string[];
  videoLinks: string[];
  error?: string;
  debugUrls?: string[];
  resolvedUrl?: string;
  testedVideoUrl?: string;
  testResult?: {
    status: number;
    contentType?: string;
    accessible: boolean;
    headers?: Record<string, string>;
  };
}

export interface XHSdownloadDirectProps {
  apiPath?: string;
  className?: string;
  onComplete?: (result: XHSDownloadResult) => void;
  placeholder?: string;
  buttonText?: string;
  autoFocus?: boolean;
}

export default function XHSdownloadDirect(props: XHSdownloadDirectProps): JSX.Element {
  const {
    apiPath = "/api/scrape-xiaohongshu-direct",
    className,
    onComplete,
    placeholder = "Paste XHS shortened link (xhslink.com) — Direct extraction",
    buttonText = "Extract Directly",
    autoFocus = false,
  } = props;

  const [url, setUrl] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [result, setResult] = useState<XHSDownloadResult | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const hasResults: boolean = useMemo(() => {
    return Boolean(result && (result.imageLinks.length > 0 || result.videoLinks.length > 0));
  }, [result]);

  const urlCount: number = useMemo(() => {
    return Array.from(url.matchAll(/https?:\/\/[^\s]+/gi)).length;
  }, [url]);

  const copyToClipboard = useCallback(async (text: string, key: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1800);
    } catch {
      // no-op
    }
  }, []);

  const downloadLink = useCallback((link: string): void => {
    const a: HTMLAnchorElement = document.createElement("a");
    a.href = link;
    a.download = link.split("/").pop() || "download";
    a.target = "_blank";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, []);

  const handleSubmit = useCallback(async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    if (!url.trim()) return;

    // Extract all URLs from multiline text
    const urlRegex = /https?:\/\/[^\s]+/gi;
    const urls: string[] = Array.from(url.matchAll(urlRegex)).map((match) => match[0]);

    if (urls.length === 0) {
      const fallback: XHSDownloadResult = {
        success: false,
        imageLinks: [],
        videoLinks: [],
        error: "No valid URLs found in input",
      };
      setResult(fallback);
      if (onComplete) onComplete(fallback);
      return;
    }

    setLoading(true);
    setResult(null);
    try {
      const response: Response = await fetch(apiPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls }),
      });
      const ct = response.headers.get("content-type") || "";
      if (!ct.includes("application/json")) {
        const text = await response.text();
        throw new Error(text.slice(0, 200));
      }
      const data: XHSDownloadResult = await response.json();
      setResult(data);
      if (onComplete) onComplete(data);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to extract content";
      const fallback: XHSDownloadResult = {
        success: false,
        imageLinks: [],
        videoLinks: [],
        error: errorMessage || "Unknown error occurred. Please check the console for details.",
      };
      setResult(fallback);
      if (onComplete) onComplete(fallback);
      console.error("Extraction error:", err);
    } finally {
      setLoading(false);
    }
  }, [apiPath, url, onComplete]);

  const copyAll = useCallback(async (): Promise<void> => {
    if (!result) return;
    const all: string = [...result.imageLinks, ...result.videoLinks].join("\n");
    await copyToClipboard(all, "all");
  }, [result, copyToClipboard]);

  return (
    <div className={className}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <textarea
          value={url}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>): void => setUrl(e.target.value)}
          placeholder={placeholder}
          className="glass-input w-full px-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50 resize-y min-h-[120px] text-theme-primary placeholder-theme-muted"
          disabled={loading}
          autoFocus={autoFocus}
          rows={8}
        />
        <button
          type="submit"
          disabled={loading || !url.trim()}
          className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-gray-500/50 disabled:cursor-not-allowed text-white font-medium py-3 px-6 rounded-xl transition-all border border-orange-400/50 shadow-lg shadow-orange-500/20"
        >
          {loading ? "Processing…" : `${buttonText}${urlCount > 0 ? ` (${urlCount} link${urlCount !== 1 ? "s" : ""} found)` : ""}`}
        </button>
      </form>

      {result && (
        <div className="mt-6 glass-card rounded-lg shadow-xl p-5">
          {result.success ? (
            <div className="space-y-5">
              {result.resolvedUrl && (
                <div className="pb-3 border-b border-white/20">
                  <div className="text-sm text-theme-primary/90 mb-1">Resolved URL:</div>
                  <div className="text-xs text-blue-200 break-all">{result.resolvedUrl}</div>
                </div>
              )}

              {result.testedVideoUrl && result.testResult && (
                <div className="pb-3 border-b border-white/20">
                  <div className="text-sm font-medium mb-2 text-theme-primary">Video URL Test Result:</div>
                  <div className="text-xs text-blue-200 break-all mb-2">{result.testedVideoUrl}</div>
                  <div className="text-xs space-y-1 text-theme-primary/90">
                    <div>
                      <span className="font-medium">Status:</span>{" "}
                      <span className={result.testResult.accessible ? "text-green-300" : "text-red-300"}>
                        {result.testResult.status} {result.testResult.accessible ? "✓ Accessible" : "✗ Failed"}
                      </span>
                    </div>
                    {result.testResult.contentType && (
                      <div>
                        <span className="font-medium">Content-Type:</span> {result.testResult.contentType}
                      </div>
                    )}
                    {result.testResult.headers && Object.keys(result.testResult.headers).length > 0 && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-theme-primary/70">Response Headers</summary>
                        <pre className="mt-1 p-2 glass-input rounded text-xs overflow-auto text-theme-primary/90">
                          {JSON.stringify(result.testResult.headers, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between pb-3 border-b border-white/20 gap-2 flex-wrap">
                <div className="text-theme-primary flex items-center gap-4">
                  <span className="font-medium">{result.imageLinks.length} Images</span>
                  <span className="font-medium">{result.videoLinks.length} Videos</span>
                </div>
                {hasResults && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={copyAll}
                      className="px-3 py-2 text-sm rounded bg-white/20 hover:bg-white/30 text-theme-primary border border-white/30 transition-all"
                    >
                      {copiedKey === "all" ? "Copied!" : "Copy All Links"}
                    </button>
                  </div>
                )}
              </div>

              {result.imageLinks.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold text-theme-primary">Images</h3>
                  {result.imageLinks.map((link: string, idx: number) => (
                    <div key={idx} className="flex items-center gap-2 p-2 glass-input rounded">
                      <span className="text-xs text-theme-primary/70 min-w-[28px]">#{idx + 1}</span>
                      <a
                        href={link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 text-sm text-blue-200 hover:text-blue-100 truncate"
                      >
                        {link}
                      </a>
                      <button
                        onClick={(): void => {
                          void copyToClipboard(link, `img-${idx}`);
                        }}
                        className="px-2 py-1 text-xs rounded bg-white/20 hover:bg-white/30 text-theme-primary border border-white/30 transition-all"
                        title="Copy"
                      >
                        {copiedKey === `img-${idx}` ? "Copied" : "Copy"}
                      </button>
                      <button
                        onClick={(): void => downloadLink(link)}
                        className="px-2 py-1 text-xs rounded bg-white/20 hover:bg-white/30 text-theme-primary border border-white/30 transition-all"
                        title="Download"
                      >
                        Download
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {result.videoLinks.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold text-theme-primary">Videos</h3>
                  {result.videoLinks.map((link: string, idx: number) => (
                    <div key={idx} className="flex items-center gap-2 p-2 glass-input rounded">
                      <span className="text-xs text-theme-primary/70 min-w-[28px]">#{idx + 1}</span>
                      <a
                        href={link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 text-sm text-blue-200 hover:text-blue-100 truncate"
                      >
                        {link}
                      </a>
                      <button
                        onClick={(): void => {
                          void copyToClipboard(link, `vid-${idx}`);
                        }}
                        className="px-2 py-1 text-xs rounded bg-white/20 hover:bg-white/30 text-theme-primary border border-white/30 transition-all"
                        title="Copy"
                      >
                        {copiedKey === `vid-${idx}` ? "Copied" : "Copy"}
                      </button>
                      <button
                        onClick={(): void => downloadLink(link)}
                        className="px-2 py-1 text-xs rounded bg-white/20 hover:bg-white/30 text-theme-primary border border-white/30 transition-all"
                        title="Download"
                      >
                        Download
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {result.imageLinks.length === 0 && result.videoLinks.length === 0 && (
                <div className="text-center text-theme-primary/80 py-8">No media found.</div>
              )}

              {Array.isArray(result.debugUrls) && result.debugUrls.length > 0 && (
                <details className="mt-4 text-left">
                  <summary className="cursor-pointer text-xs text-theme-primary/70">
                    Debug URLs ({result.debugUrls.length})
                  </summary>
                  <div className="mt-2 p-2 glass-input rounded border border-white/20 max-h-48 overflow-auto text-xs text-theme-primary/90 space-y-1">
                    {result.debugUrls.map((u: string, i: number) => (
                      <div key={i} className="flex items-center gap-2">
                        <a
                          className="flex-1 truncate text-blue-200 hover:text-blue-100"
                          href={u}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {u}
                        </a>
                        <button
                          onClick={(): void => {
                            void copyToClipboard(u, `dbg-${i}`);
                          }}
                          className="px-2 py-0.5 rounded bg-white/20 hover:bg-white/30 text-theme-primary border border-white/30 transition-all"
                        >
                          {copiedKey === `dbg-${i}` ? "Copied" : "Copy"}
                        </button>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="text-red-300 font-semibold mb-2">Failed to Extract Content</div>
              <div className="text-theme-primary/80 text-sm">{result.error || "Unknown error"}</div>
              {result.resolvedUrl && (
                <div className="mt-3 text-xs text-theme-primary/70">
                  Resolved URL: <span className="text-blue-200 break-all">{result.resolvedUrl}</span>
                </div>
              )}
              {Array.isArray(result.debugUrls) && result.debugUrls.length > 0 && (
                <details className="mt-4 text-left inline-block max-w-full">
                  <summary className="cursor-pointer text-xs text-white/70">
                    Debug candidates ({result.debugUrls.length})
                  </summary>
                  <div className="mt-2 p-2 glass-input rounded border border-white/20 max-h-48 overflow-auto text-xs text-theme-primary/90 space-y-1">
                    {result.debugUrls.slice(0, 20).map((u: string, i: number) => (
                      <div key={i} className="flex items-center gap-2">
                        <a
                          className="flex-1 truncate text-blue-200 hover:text-blue-100"
                          href={u}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {u}
                        </a>
                        <button
                          onClick={(): void => {
                            void copyToClipboard(u, `dbg-${i}`);
                          }}
                          className="px-2 py-0.5 rounded bg-white/20 hover:bg-white/30 text-theme-primary border border-white/30 transition-all"
                        >
                          {copiedKey === `dbg-${i}` ? "Copied" : "Copy"}
                        </button>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}


