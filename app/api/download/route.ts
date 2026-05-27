import { NextRequest, NextResponse } from "next/server";
import { exec, spawn } from "child_process";
import { promisify } from "util";
import path from "path";
import os from "os";
import fs from "fs";

const execAsync = promisify(exec);

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

async function downloadWithCobalt(url: string, format: string): Promise<NextResponse> {
  const cobaltUrl = process.env.COBALT_API || "https://api.cobalt.tools";
  const headers: Record<string, string> = {
    "Accept": "application/json",
    "Content-Type": "application/json",
  };

  const authHeaderOverride = process.env.COBALT_AUTHORIZATION?.trim();
  if (authHeaderOverride) {
    headers["Authorization"] = authHeaderOverride;
  } else if (process.env.COBALT_API_KEY) {
    const key = process.env.COBALT_API_KEY.trim();
    const forced = (process.env.COBALT_AUTH_SCHEME || "").trim().toLowerCase();

    if (forced === "bearer") {
      headers["Authorization"] = `Bearer ${key}`;
    } else if (forced === "apikey" || forced === "api-key") {
      headers["Authorization"] = `Api-Key ${key}`;
    } else {
      const isJwt = key.split(".").length === 3;
      headers["Authorization"] = isJwt ? `Bearer ${key}` : `Api-Key ${key}`;
    }
  }

  const isAudio = format === "mp3" || format === "m4a";
  const body: any = {
    url: url,
    filenameStyle: "basic",
  };

  if (isAudio) {
    body.downloadMode = "audio";
    body.audioFormat = "mp3";
    body.audioBitrate = "256";
  } else {
    body.downloadMode = "auto";
    const [resolution, vidExt] = format.split("-");
    if (resolution && !isNaN(parseInt(resolution))) {
      body.videoQuality = resolution;
    }
  }

  const response = await fetch(cobaltUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Cobalt API failed (${response.status}): ${errorText}`);
  }

  const resData = await response.json();

  if (resData.status === "error") {
    throw new Error(resData.text || "Cobalt download failed");
  }

  if (resData.url) {
    const fileRes = await fetch(resData.url);
    if (!fileRes.ok) {
      throw new Error(`Failed to fetch media file: ${fileRes.statusText}`);
    }

    const ext = format === "mp3" ? "mp3" : format === "m4a" ? "m4a" : format.split("-")[1] || "mp4";
    return new NextResponse(fileRes.body, {
      headers: {
        "Content-Type": fileRes.headers.get("content-type") || getMime(ext),
        "Content-Disposition": `attachment; filename="download.${ext}"`,
      },
    });
  } else {
    throw new Error("Cobalt API did not provide a download URL");
  }
}

async function handleDownload(url: string, format: string) {
  if (!url) {
    return NextResponse.json({ error: "Missing URL" }, { status: 400 });
  }

  // If running on Vercel, force Cobalt API download
  if (process.env.VERCEL === "1") {
    try {
      return await downloadWithCobalt(url, format);
    } catch (err: any) {
      console.error("Cobalt download failed:", err);
      return NextResponse.json(
        { error: err.message || "Download failed via Cobalt API" },
        { status: 500 }
      );
    }
  }

  // Otherwise (local environment), try yt-dlp first, with Cobalt fallback
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

    try {
      await new Promise<void>((resolve, reject) => {
        const proc = spawn("python", ["-m", "yt_dlp", ...ytdlArgs]);
        proc.on("close", (code) => {
          if (code === 0) resolve();
          else reject(new Error(`yt-dlp exited with code ${code}`));
        });
      });

      const outFile = `${tmpFile}.${ext}`;

      if (!fs.existsSync(outFile)) {
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
    } catch (cliErr) {
      console.warn("yt-dlp download failed, trying Cobalt API fallback:", cliErr);
      return await downloadWithCobalt(url, format);
    }
  } catch (e: any) {
    console.error(e);
    return NextResponse.json(
      { error: e.message || "Download failed" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const { url, format } = await req.json();
  return await handleDownload(url, format);
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  const format = req.nextUrl.searchParams.get("format") || "mp3";
  return await handleDownload(url || "", format);
}
