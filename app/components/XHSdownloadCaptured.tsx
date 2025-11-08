"use client";

import React, { useCallback, useMemo, useState } from "react";

export interface XHSDownloadResult {
  success: boolean;
  imageLinks: string[];
  videoLinks: string[];
  error?: string;
  debugUrls?: string[];
}

export interface XHSdownloadCapturedProps {
  apiPath?: string;
  className?: string;
  onComplete?: (result: XHSDownloadResult) => void;
  placeholder?: string;
  buttonText?: string;
  autoFocus?: boolean;
}

export default function XHSdownloadCaptured(props: XHSdownloadCapturedProps): JSX.Element {
  const {
    apiPath = "/api/scrape-xiaohongshu-captured",
    className,
    onComplete,
    placeholder = "Paste XHS link — Captured mode (api_call)",
    buttonText = "Extract (Captured)",
    autoFocus = false,
  } = props;

  const [url, setUrl] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [result, setResult] = useState<XHSDownloadResult | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const hasResults: boolean = useMemo(() => Boolean(result && (result.imageLinks.length > 0 || result.videoLinks.length > 0)), [result]);

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

    setLoading(true);
    setResult(null);
    try {
      const response: Response = await fetch(apiPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
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
      const fallback: XHSDownloadResult = {
        success: false,
        imageLinks: [],
        videoLinks: [],
        error: err instanceof Error ? err.message : "Failed to extract (captured)",
      };
      setResult(fallback);
      if (onComplete) onComplete(fallback);
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
        <input
          type="text"
          value={url}
          onChange={(e: React.ChangeEvent<HTMLInputElement>): void => setUrl(e.target.value)}
          placeholder={placeholder}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
          disabled={loading}
          autoFocus={autoFocus}
        />
        <button
          type="submit"
          disabled={loading || !url.trim()}
          className="w-full bg-red-500 hover:bg-red-600 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-medium py-3 px-6 rounded-lg transition-colors"
        >
          {loading ? "Processing…" : buttonText}
        </button>
      </form>

      {result && (
        <div className="mt-6 bg-white rounded-lg shadow p-5">
          {result.success ? (
            <div className="space-y-5">
              <div className="flex items-center justify-between pb-3 border-b gap-2 flex-wrap">
                <div className="text-theme-primary flex items-center gap-4">
                  <span className="font-medium">{result.imageLinks.length} Images</span>
                  <span className="font-medium">{result.videoLinks.length} Videos</span>
                </div>
                {hasResults && (
                  <div className="flex items-center gap-2">
                    <button onClick={copyAll} className="px-3 py-2 text-sm rounded bg-gray-100 hover:bg-gray-200">
                      {copiedKey === "all" ? "Copied!" : "Copy All Links"}
                    </button>
                  </div>
                )}
              </div>

              {result.imageLinks.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold">Images</h3>
                  {result.imageLinks.map((link: string, idx: number) => (
                    <div key={idx} className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                      <span className="text-xs text-theme-muted min-w-[28px]">#{idx + 1}</span>
                      <a
                        href={link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 text-sm text-blue-600 hover:text-blue-800 truncate"
                      >
                        {link}
                      </a>
                      <button
                        onClick={(): void => { void copyToClipboard(link, `img-${idx}`); }}
                        className="px-2 py-1 text-xs rounded bg-gray-100 hover:bg-gray-200"
                        title="Copy"
                      >
                        {copiedKey === `img-${idx}` ? "Copied" : "Copy"}
                      </button>
                      <button
                        onClick={(): void => downloadLink(link)}
                        className="px-2 py-1 text-xs rounded bg-gray-100 hover:bg-gray-200"
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
                  <h3 className="text-lg font-semibold">Videos</h3>
                  {result.videoLinks.map((link: string, idx: number) => (
                    <div key={idx} className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                      <span className="text-xs text-theme-muted min-w-[28px]">#{idx + 1}</span>
                      <a
                        href={link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 text-sm text-blue-600 hover:text-blue-800 truncate"
                      >
                        {link}
                      </a>
                      <button
                        onClick={(): void => { void copyToClipboard(link, `vid-${idx}`); }}
                        className="px-2 py-1 text-xs rounded bg-gray-100 hover:bg-gray-200"
                        title="Copy"
                      >
                        {copiedKey === `vid-${idx}` ? "Copied" : "Copy"}
                      </button>
                      <button
                        onClick={(): void => downloadLink(link)}
                        className="px-2 py-1 text-xs rounded bg-gray-100 hover:bg-gray-200"
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
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="text-red-500 font-semibold mb-2">Failed to Extract (Captured)</div>
              <div className="text-theme-primary/80 text-sm">{result.error || "Unknown error"}</div>
              {Array.isArray(result.debugUrls) && result.debugUrls.length > 0 && (
                <details className="mt-4 text-left inline-block max-w-full">
                  <summary className="cursor-pointer text-xs text-theme-muted">Debug candidates ({result.debugUrls.length})</summary>
                  <div className="mt-2 p-2 glass-input rounded border max-h-48 overflow-auto text-xs text-theme-primary space-y-1">
                    {result.debugUrls.slice(0, 20).map((u: string, i: number) => (
                      <div key={i} className="flex items-center gap-2">
                        <a className="flex-1 truncate text-blue-600 hover:text-blue-800" href={u} target="_blank" rel="noreferrer">
                          {u}
                        </a>
                        <button onClick={(): void => { void copyToClipboard(u, `dbg-${i}`); }} className="px-2 py-0.5 rounded bg-gray-100 hover:bg-gray-200">
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





