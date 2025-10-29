"use client";

import React, { useCallback, useMemo, useState } from "react";

export interface XHSDownloadResult {
  success: boolean;
  imageLinks: string[];
  videoLinks: string[];
  error?: string;
}

export interface XHSdownloadProps {
  apiPath?: string;
  className?: string;
  onComplete?: (result: XHSDownloadResult) => void;
  placeholder?: string;
  buttonText?: string;
  autoFocus?: boolean;
  allowDownloadAll?: boolean;
}

export default function XHSdownload(props: XHSdownloadProps): JSX.Element {
  const {
    apiPath = "/api/scrape-xiaohongshu",
    className,
    onComplete,
    placeholder = "Paste Xiaohongshu link (https://www.xiaohongshu.com/… or https://xhslink.com/…)",
    buttonText = "Extract Content",
    autoFocus = false,
    allowDownloadAll = true,
  } = props;

  const [url, setUrl] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [result, setResult] = useState<XHSDownloadResult | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [isDownloadingAll, setIsDownloadingAll] = useState<boolean>(false);

  const hasResults: boolean = useMemo(() => {
    return Boolean(result && (result.imageLinks.length > 0 || result.videoLinks.length > 0));
  }, [result]);

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

  const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

  const downloadAllImages = useCallback(async (): Promise<void> => {
    if (!result || result.imageLinks.length === 0) return;
    try {
      setIsDownloadingAll(true);
      for (let i = 0; i < result.imageLinks.length; i++) {
        const link: string = result.imageLinks[i];
        downloadLink(link);
        // eslint-disable-next-line no-await-in-loop
        await sleep(250);
      }
    } finally {
      setIsDownloadingAll(false);
    }
  }, [result, downloadLink]);

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
      const data: XHSDownloadResult = await response.json();
      setResult(data);
      if (onComplete) onComplete(data);
    } catch (err) {
      const fallback: XHSDownloadResult = {
        success: false,
        imageLinks: [],
        videoLinks: [],
        error: err instanceof Error ? err.message : "Failed to scrape content",
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
                <div className="text-gray-700 flex items-center gap-4">
                  <span className="font-medium">{result.imageLinks.length} Images</span>
                  <span className="font-medium">{result.videoLinks.length} Videos</span>
                </div>
                {hasResults && (
                  <div className="flex items-center gap-2">
                    {allowDownloadAll && (
                      <button
                        onClick={downloadAllImages}
                        disabled={isDownloadingAll || result.imageLinks.length === 0}
                        className="px-3 py-2 text-sm rounded bg-gray-100 hover:bg-gray-200 disabled:bg-gray-300"
                      >
                        {isDownloadingAll ? "Downloading…" : "Download All Images"}
                      </button>
                    )}
                    <button
                      onClick={copyAll}
                      className="px-3 py-2 text-sm rounded bg-gray-100 hover:bg-gray-200"
                    >
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
                      <span className="text-xs text-gray-500 min-w-[28px]">#{idx + 1}</span>
                      <a
                        href={link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 text-sm text-blue-600 hover:text-blue-800 truncate"
                      >
                        {link}
                      </a>
                      <button
                        onClick={(): void => copyToClipboard(link, `img-${idx}`)}
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
                      <span className="text-xs text-gray-500 min-w-[28px]">#{idx + 1}</span>
                      <a
                        href={link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 text-sm text-blue-600 hover:text-blue-800 truncate"
                      >
                        {link}
                      </a>
                      <button
                        onClick={(): void => copyToClipboard(link, `vid-${idx}`)}
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
                <div className="text-center text-gray-600 py-8">No media found.</div>
              )}
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="text-red-500 font-semibold mb-2">Failed to Extract Content</div>
              <div className="text-gray-600 text-sm">{result.error || "Unknown error"}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}


