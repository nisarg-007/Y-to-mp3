import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export async function POST(req: NextRequest) {
  const { url } = await req.json();

  if (!url || !url.includes("youtube.com") && !url.includes("youtu.be")) {
    return NextResponse.json({ error: "Invalid YouTube URL" }, { status: 400 });
  }

  try {
    const isPlaylist =
      url.includes("list=") && !url.includes("watch?v=");

    if (isPlaylist) {
      const { stdout } = await execAsync(
        `python -m yt_dlp --flat-playlist -J "${url}" 2>/dev/null`
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
    } else {
      const { stdout } = await execAsync(
        `python -m yt_dlp -J "${url}" 2>/dev/null`
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
    }
  } catch (e: any) {
    console.error(e);
    return NextResponse.json(
      { error: "Failed to fetch info. Make sure yt-dlp is installed." },
      { status: 500 }
    );
  }
}
