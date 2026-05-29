import { NextRequest, NextResponse } from "next/server";
import { exec, spawn } from "child_process";
import { promisify } from "util";
import path from "path";
import os from "os";
import fs from "fs";

const execAsync = promisify(exec);

function sanitizeFilename(name: string): string {
  if (!name || !name.trim()) return "download";
  return name
    .replace(/[<>:"\/\\|?*\x00-\x1f]/g, "_")  // Remove filesystem-unsafe chars
    .replace(/\s+/g, " ")                        // Collapse whitespace
    .trim()
    .slice(0, 200)                                // Limit length
    || "download";
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

function buildCobaltAuthorization(): string | undefined {
  const override = process.env.COBALT_AUTHORIZATION?.trim();
  if (override) return override;

  const key = process.env.COBALT_API_KEY?.trim();
  if (!key) return undefined;

  const forced = (process.env.COBALT_AUTH_SCHEME || "").trim().toLowerCase();

  if (/^bearer\s+/i.test(key)) return key;
  if (/^(api-key|apikey|x-api-key)\s+/i.test(key)) return key;
  if (/^basic\s+/i.test(key)) return key;

  if (forced === "bearer") return `Bearer ${key}`;
  if (forced === "apikey" || forced === "api-key" || forced === "x-api-key") return `Api-Key ${key}`;
  if (forced === "basic") return `Basic ${key}`;

  const looksLikeJwt = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(key);
  return looksLikeJwt ? `Bearer ${key}` : `Api-Key ${key}`;
}

function isOfficialCobaltInstance(url: string): boolean {
  return new URL(url).hostname === "api.cobalt.tools";
}

function hasCobaltAuthConfigured(): boolean {
  return Boolean(buildCobaltAuthorization());
}

function extractCobaltErrorDetails(errorText: string): string {
  try {
    const json = JSON.parse(errorText);
    if (json?.error?.code) return `${json.error.code}: ${json.error.message || json.text || json.message || "Unknown Cobalt error"}`;
    return json.text || json.error || json.message || errorText;
  } catch {
    return errorText;
  }
}

const COBALT_FALLBACK_POOL = [
  "https://nuko-c.meowing.de",
  "https://apicobalt.mgytr.top",
  "https://cobalt.omega.wolfy.love",
  "https://cobalt.alpha.wolfy.love",
  "https://cobaltapi.kittycat.boo",
  "https://dog.kittycat.boo",
  "https://cobaltapi.squair.xyz",
  "https://melon.clxxped.lol",
  "https://lime.clxxped.lol",
  "https://api.qwkuns.me"
];

async function downloadWithCobalt(
  url: string,
  format: string,
  title: string,
  targetCobaltUrl?: string,
  useAuth: boolean = true
): Promise<NextResponse> {
  const cobaltUrl = targetCobaltUrl || process.env.COBALT_API || "https://api.cobalt.tools";
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };

  if (useAuth) {
    const authHeader = buildCobaltAuthorization();
    if (authHeader) {
      headers.Authorization = authHeader;
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
    const details = extractCobaltErrorDetails(errorText);
    throw new Error(`Cobalt API failed (${response.status}): ${details || "Unknown error"}`);
  }

  const resData = await response.json();

  if (resData.status === "error") {
    const details = extractCobaltErrorDetails(JSON.stringify(resData));
    throw new Error(details || "Cobalt download failed");
  }

  if (resData.url) {
    const fileRes = await fetch(resData.url);
    if (!fileRes.ok) {
      throw new Error(`Failed to fetch media file: ${fileRes.statusText}`);
    }

    const ext = format === "mp3" ? "mp3" : format === "m4a" ? "m4a" : format.split("-")[1] || "mp4";
    const safeTitle = sanitizeFilename(title);
    return new NextResponse(fileRes.body, {
      headers: {
        "Content-Type": fileRes.headers.get("content-type") || getMime(ext),
        "Content-Disposition": `attachment; filename="${safeTitle}.${ext}"`,
      },
    });
  } else {
    throw new Error("Cobalt API did not provide a download URL");
  }
}

async function downloadWithCobaltPool(url: string, format: string, title: string): Promise<NextResponse> {
  const primaryUrl = process.env.COBALT_API || "https://api.cobalt.tools";
  const errors: string[] = [];

  if (isOfficialCobaltInstance(primaryUrl) && !hasCobaltAuthConfigured()) {
    throw new Error(
      "The default Cobalt endpoint now requires authentication. Set COBALT_API to a working Cobalt instance or configure COBALT_API_KEY / COBALT_AUTHORIZATION before retrying."
    );
  }

  console.log(`Attempting download with primary Cobalt API: ${primaryUrl}`);
  try {
    return await downloadWithCobalt(url, format, title, primaryUrl, true);
  } catch (err: any) {
    const msg = err.message || err;
    console.error(`Primary Cobalt API failed: ${msg}`);
    errors.push(`Primary (${primaryUrl}): ${msg}`);
  }

  // Iterate over fallback instances
  for (const fallbackUrl of COBALT_FALLBACK_POOL) {
    if (fallbackUrl.replace(/\/+$/, "") === primaryUrl.replace(/\/+$/, "")) {
      continue;
    }

    console.log(`Attempting download with fallback Cobalt API: ${fallbackUrl}`);
    try {
      // Don't pass authorization headers to public community fallbacks
      return await downloadWithCobalt(url, format, title, fallbackUrl, false);
    } catch (err: any) {
      const msg = err.message || err;
      console.warn(`Fallback Cobalt API ${fallbackUrl} failed: ${msg}`);
      errors.push(`${fallbackUrl}: ${msg}`);
    }
  }

  throw new Error(`All Cobalt API instances in the pool failed. Details:\n${errors.join("\n")}`);
}

async function handleDownload(url: string, format: string, title: string) {
  if (!url) {
    return NextResponse.json({ error: "Missing URL" }, { status: 400 });
  }

  // If running on Vercel, force Cobalt API download
  if (process.env.VERCEL === "1") {
    try {
      return await downloadWithCobaltPool(url, format, title);
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
        const safeTitle = sanitizeFilename(title);
        return new NextResponse(data, {
          headers: {
            "Content-Type": getMime(actualExt),
            "Content-Disposition": `attachment; filename="${safeTitle}.${actualExt}"`,
          },
        });
      }

      const data = fs.readFileSync(outFile);
      fs.unlinkSync(outFile);

      const safeTitle = sanitizeFilename(title);
      return new NextResponse(data, {
        headers: {
          "Content-Type": getMime(ext),
          "Content-Disposition": `attachment; filename="${safeTitle}.${ext}"`,
        },
      });
    } catch (cliErr) {
      console.warn("yt-dlp download failed, trying Cobalt API fallback:", cliErr);
      return await downloadWithCobaltPool(url, format, title);
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
  const { url, format, title } = await req.json();
  return await handleDownload(url, format, title || "download");
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  const format = req.nextUrl.searchParams.get("format") || "mp3";
  const title = req.nextUrl.searchParams.get("title") || "download";
  return await handleDownload(url || "", format, title);
}
