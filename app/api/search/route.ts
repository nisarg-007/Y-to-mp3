import { NextRequest, NextResponse } from "next/server";

function parseDuration(iso: string): string {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return "0:00";
  const h = parseInt(match[1] || "0");
  const m = parseInt(match[2] || "0");
  const s = parseInt(match[3] || "0");
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatViewCount(count: string): string {
  const n = parseInt(count);
  if (isNaN(n)) return "";
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1).replace(/\.0$/, "")}B views`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M views`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K views`;
  return `${n} views`;
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  if (years > 0) return `${years} year${years > 1 ? "s" : ""} ago`;
  if (months > 0) return `${months} month${months > 1 ? "s" : ""} ago`;
  if (days > 0) return `${days} day${days > 1 ? "s" : ""} ago`;
  if (hours > 0) return `${hours} hour${hours > 1 ? "s" : ""} ago`;
  if (minutes > 0) return `${minutes} minute${minutes > 1 ? "s" : ""} ago`;
  return "just now";
}

export async function POST(req: NextRequest) {
  try {
    const { query } = await req.json();
    if (!query || typeof query !== "string" || !query.trim()) {
      return NextResponse.json({ error: "Missing search query" }, { status: 400 });
    }

    const API_KEY = process.env.YOUTUBE_API_KEY;
    if (!API_KEY) {
      return NextResponse.json(
        { error: "YouTube API key not configured. Add YOUTUBE_API_KEY to .env.local" },
        { status: 500 }
      );
    }

    // Step 1: Search for videos
    const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
    searchUrl.searchParams.set("part", "snippet");
    searchUrl.searchParams.set("q", query.trim());
    searchUrl.searchParams.set("type", "video");
    searchUrl.searchParams.set("maxResults", "10");
    searchUrl.searchParams.set("key", API_KEY);

    const searchRes = await fetch(searchUrl.toString());
    const searchData = await searchRes.json();

    if (!searchRes.ok) {
      console.error("YouTube search API error:", searchData);
      return NextResponse.json(
        { error: searchData?.error?.message || "YouTube search failed" },
        { status: searchRes.status }
      );
    }

    const videoIds = searchData.items
      ?.map((item: any) => item.id?.videoId)
      .filter(Boolean)
      .join(",");

    if (!videoIds) {
      return NextResponse.json({ results: [] });
    }

    // Step 2: Get video details (duration, view count)
    const detailsUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
    detailsUrl.searchParams.set("part", "contentDetails,statistics");
    detailsUrl.searchParams.set("id", videoIds);
    detailsUrl.searchParams.set("key", API_KEY);

    const detailsRes = await fetch(detailsUrl.toString());
    const detailsData = await detailsRes.json();

    const detailsMap = new Map<string, { duration: string; viewCount: string }>();
    if (detailsData.items) {
      for (const item of detailsData.items) {
        detailsMap.set(item.id, {
          duration: item.contentDetails?.duration || "",
          viewCount: item.statistics?.viewCount || "",
        });
      }
    }

    // Step 3: Combine results
    const results = searchData.items?.map((item: any) => {
      const videoId = item.id?.videoId;
      const details = detailsMap.get(videoId);
      return {
        id: videoId,
        title: item.snippet?.title || "",
        channel: item.snippet?.channelTitle || "",
        duration: details?.duration ? parseDuration(details.duration) : "",
        thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        viewCount: details?.viewCount ? formatViewCount(details.viewCount) : "",
        publishedAt: item.snippet?.publishedAt ? timeAgo(item.snippet.publishedAt) : "",
        url: `https://www.youtube.com/watch?v=${videoId}`,
      };
    }) || [];

    return NextResponse.json({ results });
  } catch (err: any) {
    console.error("Search error:", err);
    return NextResponse.json(
      { error: err.message || "Search failed" },
      { status: 500 }
    );
  }
}
