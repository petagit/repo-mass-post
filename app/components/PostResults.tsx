"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";

export interface PostResultItem {
  id?: string;
  post_id?: string;
  success?: boolean;
  social_account_id?: number | string;
  error?: unknown;
  platform_data?: {
    id?: string;
    url?: string;
    username?: string;
  };
  [key: string]: unknown;
}

interface ApiResponse {
  data: PostResultItem[];
  offset?: number;
  limit?: number;
  total?: number;
  error?: string;
}

export default function PostResults(): JSX.Element {
  const [items, setItems] = useState<PostResultItem[]>([]);
  const [offset, setOffset] = useState<number>(0);
  const [limit, setLimit] = useState<number>(10);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  const hasNext: boolean = useMemo(() => items.length === limit, [items.length, limit]);
  const hasPrev: boolean = useMemo(() => offset > 0, [offset]);

  const fetchResults = useCallback(async (newOffset: number, newLimit: number): Promise<void> => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/post-bridge/post-results?offset=${newOffset}&limit=${newLimit}`);
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to fetch post results");
      }
      const data: ApiResponse = await res.json();
      setItems(Array.isArray(data.data) ? data.data : []);
      setOffset(data.offset ?? newOffset);
      setLimit(data.limit ?? newLimit);
    } catch (e: any) {
      setError(e?.message || "Failed to fetch post results");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchResults(offset, limit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const nextPage = useCallback((): void => {
    const newOffset: number = offset + limit;
    void fetchResults(newOffset, limit);
  }, [offset, limit, fetchResults]);

  const prevPage = useCallback((): void => {
    const newOffset: number = Math.max(0, offset - limit);
    void fetchResults(newOffset, limit);
  }, [offset, limit, fetchResults]);

  const refresh = useCallback((): void => {
    void fetchResults(offset, limit);
  }, [offset, limit, fetchResults]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="text-sm text-gray-600">Offset {offset} • Limit {limit}</div>
        <div className="flex items-center gap-2">
          <select
            value={limit}
            onChange={(e): void => void fetchResults(offset, Number(e.target.value))}
            className="px-2 py-1 border rounded"
            aria-label="Results per page"
          >
            <option value={5}>5</option>
            <option value={10}>10</option>
            <option value={20}>20</option>
          </select>
          <button onClick={refresh} className="px-3 py-2 text-sm rounded bg-gray-100 hover:bg-gray-200" disabled={loading}>
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
      </div>

      {error && <div className="text-sm text-red-600">{error}</div>}

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left border-b">
              <th className="py-2 pr-4">Post ID</th>
              <th className="py-2 pr-4">Username</th>
              <th className="py-2 pr-4">URL</th>
              <th className="py-2 pr-4">Success</th>
              <th className="py-2 pr-4">Account</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it: PostResultItem, idx: number) => {
              const url: string | undefined = it.platform_data?.url as string | undefined;
              const username: string | undefined = it.platform_data?.username as string | undefined;
              return (
                <tr key={`${it.id ?? idx}`} className="border-b last:border-b-0">
                  <td className="py-2 pr-4 whitespace-nowrap">{it.post_id ?? it.id ?? "—"}</td>
                  <td className="py-2 pr-4 whitespace-nowrap">{username ?? "—"}</td>
                  <td className="py-2 pr-4 max-w-[300px] truncate">
                    {url ? (
                      <a href={url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800">
                        {url}
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="py-2 pr-4 whitespace-nowrap">{it.success === true ? "Yes" : it.success === false ? "No" : "—"}</td>
                  <td className="py-2 pr-4 whitespace-nowrap">{it.social_account_id ?? "—"}</td>
                </tr>
              );
            })}
            {items.length === 0 && !loading && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-gray-500">No results.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between pt-2">
        <button
          onClick={prevPage}
          disabled={!hasPrev || loading}
          className="px-3 py-2 text-sm rounded bg-gray-100 hover:bg-gray-200 disabled:bg-gray-200 disabled:text-gray-400"
        >
          Prev
        </button>
        <button
          onClick={nextPage}
          disabled={!hasNext || loading}
          className="px-3 py-2 text-sm rounded bg-gray-100 hover:bg-gray-200 disabled:bg-gray-200 disabled:text-gray-400"
        >
          Next
        </button>
      </div>
    </div>
  );
}


