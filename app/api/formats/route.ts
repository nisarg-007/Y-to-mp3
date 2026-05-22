import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

const standardFormats = [
  { label: "MP3 (audio only)", value: "mp3", ext: "mp3" },
  { label: "M4A (audio only)", value: "m4a", ext: "m4a" },
  { label: "1080p MP4", value: "1080p-mp4", ext: "mp4" },
  { label: "720p MP4", value: "720p-mp4", ext: "mp4" },
  { label: "480p MP4", value: "480p-mp4", ext: "mp4" },
  { label: "360p MP4", value: "360p-mp4", ext: "mp4" },
];

export async function POST(req: NextRequest) {
  const { url } = await req.json();

  if (!url) {
    return NextResponse.json({ error: "Missing URL" }, { status: 400 });
  }

  // If on Vercel, directly return the standard formats list
  if (process.env.VERCEL === "1") {
    return NextResponse.json({ formats: standardFormats });
  }

  // Otherwise, try to use yt-dlp first, with standard fallback
  try {
    const { stdout } = await execAsync(
      `python -m yt_dlp -J "${url}" 2>/dev/null`
    );
    const data = JSON.parse(stdout);

    const seen = new Set<string>();
    const formats: { label: string; value: string; ext: string }[] = [];

    // Always offer MP3 and M4A first
    formats.push({ label: "MP3 (audio only)", value: "mp3", ext: "mp3" });
    formats.push({ label: "M4A (audio only)", value: "m4a", ext: "m4a" });

    const videoFormats = (data.formats || [])
      .filter((f: any) => f.vcodec && f.vcodec !== "none" && f.height)
      .sort((a: any, b: any) => (b.height || 0) - (a.height || 0));

    for (const f of videoFormats) {
      const key = `${f.height}p-${f.ext}`;
      if (seen.has(key)) continue;
      seen.add(key);
      formats.push({
        label: `${f.height}p ${f.ext.toUpperCase()}`,
        value: `${f.height}p-${f.ext}`,
        ext: f.ext,
      });
      if (formats.length > 10) break;
    }

    return NextResponse.json({ formats });
  } catch (e) {
    console.warn("Could not fetch formats with yt-dlp, using standard formats:", e);
    return NextResponse.json({ formats: standardFormats });
  }
}
