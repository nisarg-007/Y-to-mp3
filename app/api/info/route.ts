import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

// Helper to extract video ID from various YouTube URL formats
function getVideoId(url: string): string | null {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
}

// Helper to extract playlist ID from various YouTube URL formats
function getPlaylistId(url: string): string | null {
  const match = url.match(/[?&]list=([^#\&\?]+)/);
  return match ? match[1] : null;
}

// Helper to recursively find keys in deeply nested JSON structures (e.g. ytInitialData)
function findKeys(obj: any, keyToFind: string, results: any[] = []): any[] {
  if (!obj || typeof obj !== "object") return results;
  if (obj[keyToFind]) {
    results.push(obj[keyToFind]);
  }
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      findKeys(obj[key], keyToFind, results);
    }
  }
  return results;
}

// Fetch single video info via Oembed + Page Scraping
async function fetchVideoInfoNode(url: string) {
  const videoId = getVideoId(url);
  if (!videoId) {
    throw new Error("Invalid YouTube Video URL");
  }

  let title = "Unknown Video";
  let uploader = "Unknown Channel";
  let duration = 0;
  let thumbnail = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;

  try {
    // Try to scrape watch page HTML to get full details (including duration)
    const response = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    if (response.ok) {
      const html = await response.text();
      const match = html.match(/var ytInitialPlayerResponse\s*=\s*({.+?});/);
      if (match) {
        const playerResponse = JSON.parse(match[1]);
        const videoDetails = playerResponse.videoDetails;
        if (videoDetails) {
          title = videoDetails.title || title;
          uploader = videoDetails.author || uploader;
          duration = parseInt(videoDetails.lengthSeconds || "0");
          thumbnail = videoDetails.thumbnail?.thumbnails?.[0]?.url || thumbnail;
          return {
            type: "video" as const,
            id: videoId,
            title,
            uploader,
            duration,
            thumbnail,
            url,
          };
        }
      }
    }
  } catch (err) {
    console.error("HTML scrape failed, falling back to oEmbed:", err);
  }

  // Fallback to official YouTube oEmbed (guaranteed to work but doesn't have duration)
  try {
    const oembedRes = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
    if (oembedRes.ok) {
      const oembedData = await oembedRes.json();
      title = oembedData.title || title;
      uploader = oembedData.author_name || uploader;
      thumbnail = oembedData.thumbnail_url || thumbnail;
    }
  } catch (err) {
    console.error("oEmbed fallback failed:", err);
  }

  return {
    type: "video" as const,
    id: videoId,
    title,
    uploader,
    duration,
    thumbnail,
    url,
  };
}

// Fetch playlist info via Oembed + Page Scraping
async function fetchPlaylistInfoNode(url: string) {
  const playlistId = getPlaylistId(url);
  if (!playlistId) {
    throw new Error("Invalid YouTube Playlist URL");
  }

  let title = "Unknown Playlist";
  let uploader = "Unknown Creator";

  // Get playlist title and uploader via oEmbed
  try {
    const oembedRes = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/playlist?list=${playlistId}&format=json`);
    if (oembedRes.ok) {
      const oembedData = await oembedRes.json();
      title = oembedData.title || title;
      uploader = oembedData.author_name || uploader;
    }
  } catch (err) {
    console.error("Playlist oEmbed failed:", err);
  }

  // Fetch playlist HTML and extract ytInitialData for the video listing
  try {
    const response = await fetch(`https://www.youtube.com/playlist?list=${playlistId}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    if (response.ok) {
      const html = await response.text();
      const match = html.match(/var ytInitialData\s*=\s*({.+?});/);
      if (match) {
        const data = JSON.parse(match[1]);
        const videos = findKeys(data, "playlistVideoRenderer");
        const entries = videos.map((v: any) => {
          const id = v.videoId;
          const vTitle = v.title?.runs?.[0]?.text || v.title?.simpleText || "Unknown Video";
          const vDuration = parseInt(v.lengthSeconds || "0");
          return {
            id,
            title: vTitle,
            duration: vDuration,
            url: `https://www.youtube.com/watch?v=${id}`,
          };
        });

        return {
          type: "playlist" as const,
          title,
          uploader,
          count: entries.length,
          entries: entries.slice(0, 100),
        };
      }
    }
  } catch (err) {
    console.error("Playlist HTML scrape failed:", err);
  }

  return {
    type: "playlist" as const,
    title,
    uploader,
    count: 0,
    entries: [],
  };
}

export async function POST(req: NextRequest) {
  const { url } = await req.json();

  if (!url || (!url.includes("youtube.com") && !url.includes("youtu.be"))) {
    return NextResponse.json({ error: "Invalid YouTube URL" }, { status: 400 });
  }

  const isPlaylist = url.includes("list=") && !url.includes("watch?v=");

  // If running on Vercel, force pure Node fallback
  if (process.env.VERCEL === "1") {
    try {
      if (isPlaylist) {
        const info = await fetchPlaylistInfoNode(url);
        return NextResponse.json(info);
      } else {
        const info = await fetchVideoInfoNode(url);
        return NextResponse.json(info);
      }
    } catch (e: any) {
      console.error(e);
      return NextResponse.json({ error: e.message || "Failed to fetch info" }, { status: 500 });
    }
  }

  // Otherwise, try yt-dlp first (for local environment), with Node scraper fallback
  try {
    if (isPlaylist) {
      try {
        const { stdout } = await execAsync(
          `python -m yt_dlp --flat-playlist -J "${url}"`
        );
        const data = JSON.parse(stdout);
        return NextResponse.json({
          type: "playlist",
          title: data.title,
          uploader: data.uploader || data.channel,
          count: data.entries?.length || 0,
          entries: (data.entries || []).slice(0, 100).map((e: any) => ({
            id: e.id,
            title: e.title,
            duration: e.duration,
            url: `https://www.youtube.com/watch?v=${e.id}`,
          })),
        });
      } catch (cliErr) {
        console.warn("yt-dlp failed, falling back to Node scraper:", cliErr);
        const info = await fetchPlaylistInfoNode(url);
        return NextResponse.json(info);
      }
    } else {
      try {
        const { stdout } = await execAsync(
          `python -m yt_dlp -J "${url}"`
        );
        const data = JSON.parse(stdout);
        return NextResponse.json({
          type: "video",
          id: data.id,
          title: data.title,
          uploader: data.uploader || data.channel,
          duration: data.duration,
          thumbnail: data.thumbnail,
          url,
        });
      } catch (cliErr) {
        console.warn("yt-dlp failed, falling back to Node scraper:", cliErr);
        const info = await fetchVideoInfoNode(url);
        return NextResponse.json(info);
      }
    }
  } catch (e: any) {
    console.error(e);
    return NextResponse.json(
      { error: "Failed to fetch info. Make sure yt-dlp is installed or use Vercel mode." },
      { status: 500 }
    );
  }
}
