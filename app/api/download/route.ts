import { NextRequest, NextResponse } from "next/server";
import { exec, spawn } from "child_process";
import { promisify } from "util";
import path from "path";
import os from "os";
import fs from "fs";

const execAsync = promisify(exec);

export async function POST(req: NextRequest) {
  const { url, format } = await req.json();

  if (!url) {
    return NextResponse.json({ error: "Missing URL" }, { status: 400 });
  }

  const tmpDir = os.tmpdir();
  const tmpFile = path.join(tmpDir, `ytdl_${Date.now()}`);

  try {
    let ytdlArgs: string[];
    let ext: string;

    if (format === "mp3") {
      ext = "mp3";
      ytdlArgs = [
        "-x",
        "--audio-format", "mp3",
        "--audio-quality", "0",
        "-o", `${tmpFile}.%(ext)s`,
        "--no-playlist",
        url,
      ];
    } else if (format === "m4a") {
      ext = "m4a";
      ytdlArgs = [
        "-x",
        "--audio-format", "m4a",
        "--audio-quality", "0",
        "-o", `${tmpFile}.%(ext)s`,
        "--no-playlist",
        url,
      ];
    } else {
      // e.g. "1080p-mp4" or "720p-webm"
      const [resolution, vidExt] = format.split("-");
      ext = vidExt || "mp4";
      const height = parseInt(resolution);
      ytdlArgs = [
        "-f", `bestvideo[height<=${height}][ext=${ext}]+bestaudio/bestvideo[height<=${height}]+bestaudio/best[height<=${height}]`,
        "--merge-output-format", ext,
        "-o", `${tmpFile}.%(ext)s`,
        "--no-playlist",
        url,
      ];
    }

    await new Promise<void>((resolve, reject) => {
      const proc = spawn("python", ["-m", "yt_dlp", ...ytdlArgs]);
      proc.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`yt-dlp exited with code ${code}`));
      });
    });

    const outFile = `${tmpFile}.${ext}`;

    if (!fs.existsSync(outFile)) {
      // Try to find the actual output file
      const files = fs.readdirSync(tmpDir).filter(f => f.startsWith(path.basename(tmpFile)));
      if (files.length === 0) throw new Error("Output file not found");
      const actualFile = path.join(tmpDir, files[0]);
      const data = fs.readFileSync(actualFile);
      fs.unlinkSync(actualFile);
      const actualExt = path.extname(files[0]).slice(1);
      return new NextResponse(data, {
        headers: {
          "Content-Type": getMime(actualExt),
          "Content-Disposition": `attachment; filename="download.${actualExt}"`,
        },
      });
    }

    const data = fs.readFileSync(outFile);
    fs.unlinkSync(outFile);

    return new NextResponse(data, {
      headers: {
        "Content-Type": getMime(ext),
        "Content-Disposition": `attachment; filename="download.${ext}"`,
      },
    });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json(
      { error: e.message || "Download failed" },
      { status: 500 }
    );
  }
}

function getMime(ext: string): string {
  const map: Record<string, string> = {
    mp3: "audio/mpeg",
    m4a: "audio/mp4",
    mp4: "video/mp4",
    webm: "video/webm",
    mkv: "video/x-matroska",
    ogg: "audio/ogg",
  };
  return map[ext] || "application/octet-stream";
}
