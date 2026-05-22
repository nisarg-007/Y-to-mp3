import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export async function POST(req: NextRequest) {
  const { url } = await req.json();

  try {
    const { stdout } = await execAsync(
      `python -m yt_dlp -J "${url}" 2>/dev/null`
    );
    const data = JSON.parse(stdout);

    // Build a clean list of distinct video formats
    const seen = new Set<string>();
    const formats: { label: string; value: string; ext: string }[] = [];

    // Always offer MP3 first
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
    return NextResponse.json(
      { error: "Could not fetch formats" },
      { status: 500 }
    );
  }
}
