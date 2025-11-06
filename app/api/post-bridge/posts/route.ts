import { NextResponse } from "next/server";

export async function GET(req: Request): Promise<NextResponse> {
  const baseUrl = process.env.POSTBRIDGE_BASE_URL ?? "https://api.post-bridge.com";
  const apiKey = process.env.POSTBRIDGE_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "POSTBRIDGE_API_KEY missing" }, { status: 500 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const destinationId = searchParams.get("destinationId");
    const status = searchParams.get("status"); // "scheduled", "posted", or null for all

    // Try multiple likely endpoints for fetching posts
    const tryPaths = [
      `/v1/posts`,
      `/posts`,
      `/v1/content`,
      `/content`,
    ];

    let posts: any[] = [];
    let lastErrorText = "";

    for (const path of tryPaths) {
      // Build query parameters
      const queryParams = new URLSearchParams();
      if (destinationId) {
        queryParams.append("social_account_id", destinationId);
        queryParams.append("social_account_ids", destinationId);
        queryParams.append("destination_id", destinationId);
        queryParams.append("destination_ids", destinationId);
        queryParams.append("account_id", destinationId);
      }
      if (status) {
        queryParams.append("status", status);
      }
      // Add limit to get reasonable number of posts
      queryParams.append("limit", "50");

      const url = `${baseUrl}${path}${queryParams.toString() ? `?${queryParams.toString()}` : ""}`;
      
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${apiKey}` },
        cache: "no-store",
      });

      if (!res.ok) {
        lastErrorText = (await res.text()) || `HTTP ${res.status}`;
        continue;
      }

      const json: any = await res.json();
      const arr: any[] = Array.isArray(json)
        ? json
        : (json.posts ?? json.data ?? json.items ?? json.results ?? []);

      if (arr.length > 0) {
        posts = arr;
        break;
      }
    }

    // If no posts found, try filtering by status manually
    if (posts.length === 0 && !status) {
      // Try to get all posts and filter client-side
      for (const path of tryPaths) {
        const queryParams = new URLSearchParams();
        if (destinationId) {
          queryParams.append("social_account_id", destinationId);
        }
        queryParams.append("limit", "100");

        const url = `${baseUrl}${path}${queryParams.toString() ? `?${queryParams.toString()}` : ""}`;
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${apiKey}` },
          cache: "no-store",
        });

        if (res.ok) {
          const json: any = await res.json();
          const arr: any[] = Array.isArray(json)
            ? json
            : (json.posts ?? json.data ?? json.items ?? json.results ?? []);
          posts = arr;
          break;
        }
      }
    }

    // Filter posts by status if needed
    let filteredPosts = posts;
    if (status && posts.length > 0) {
      filteredPosts = posts.filter((post: any) => {
        const postStatus = (post.status || post.state || "").toLowerCase();
        if (status === "scheduled") {
          return postStatus === "scheduled" || postStatus === "pending" || post.scheduled_at || post.scheduledAt;
        }
        if (status === "posted") {
          return postStatus === "posted" || postStatus === "published" || postStatus === "completed" || post.published_at || post.publishedAt;
        }
        return true;
      });
    }

    return NextResponse.json({
      success: true,
      posts: filteredPosts,
      total: filteredPosts.length,
      error: posts.length === 0 ? lastErrorText || "No posts found" : undefined,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Unexpected error", success: false, posts: [] },
      { status: 500 }
    );
  }
}

