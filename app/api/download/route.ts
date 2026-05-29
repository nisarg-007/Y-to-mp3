import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";
import os from "os";
import fs from "fs";

/* ════════════════════════════════════════════════════════════
   HELPERS
   ════════════════════════════════════════════════════════════ */

function sanitizeFilename(name: string): string {
  if (!name || !name.trim()) return "download";
  return name
    .replace(/[<>:"\/\\|?*\x00-\x1f]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200)
    || "download";
}

function sanitizeForCobalt(str: string): string {
  return str
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[\u2026]/g, "...")
    .replace(/[^\x00-\x7F]/g, "");
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

/* ════════════════════════════════════════════════════════════
   COBALT AUTH (for user-configured private instances)
   ════════════════════════════════════════════════════════════ */

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
  try {
    return new URL(url).hostname === "api.cobalt.tools";
  } catch {
    return false;
  }
}

function hasCobaltAuthConfigured(): boolean {
  return Boolean(buildCobaltAuthorization());
}

/* ════════════════════════════════════════════════════════════
   COBALT FALLBACK POOL
   ────────────────────────────────────────────────────────────
   Sorted by cobalt.directory score (verified 2026-05-29).
   Only instances where YouTube is confirmed WORKING.
   Instances with `error.api.youtube.login` are excluded.
   ════════════════════════════════════════════════════════════ */

const COBALT_FALLBACK_POOL = [
  // 100% score — all 23/23 services working including YouTube
  "https://nuko-c.meowing.de",

  // 96% score — 22/23 services, YouTube confirmed working
  "https://cobalt.omega.wolfy.love",
  "https://lime.clxxped.lol",
  "https://apicobalt.mgytr.top",

  // 91% score — 21/23, YouTube working
  "https://cobalt.alpha.wolfy.love",

  // 87% score — 20/23, YouTube working
  "https://dog.kittycat.boo",
  "https://fox.kittycat.boo",
  "https://cobaltapi.squair.xyz",
  "https://cobaltapi.kittycat.boo",
  "https://api.qwkuns.me",

  // 74% — 17/23, YouTube working
  "https://api.cobalt.liubquanti.click",

  // 70% — 16/23, YouTube working
  "https://api.cobalt.blackcat.sweeux.org",

  // 61% — 14/23, YouTube working
  "https://cobaltapi.cjs.nz",
];

/* ════════════════════════════════════════════════════════════
   INSTANCE HEALTH CACHE
   ────────────────────────────────────────────────────────────
   Keeps track of recently-failed instances so we skip them
   quickly on subsequent requests within the same cold-start.
   ════════════════════════════════════════════════════════════ */

const instanceHealth: Map<string, { failedAt: number; errorCount: number }> = new Map();

const HEALTH_COOLDOWN_MS = 2 * 60 * 1000; // 2 minutes before retrying a failed instance

function isInstanceHealthy(url: string): boolean {
  const record = instanceHealth.get(url);
  if (!record) return true;
  if (Date.now() - record.failedAt > HEALTH_COOLDOWN_MS) {
    instanceHealth.delete(url);
    return true;
  }
  return false;
}

function markInstanceFailed(url: string): void {
  const existing = instanceHealth.get(url);
  instanceHealth.set(url, {
    failedAt: Date.now(),
    errorCount: (existing?.errorCount || 0) + 1,
  });
}

function markInstanceHealthy(url: string): void {
  instanceHealth.delete(url);
}

/* ════════════════════════════════════════════════════════════
   COBALT API INTERACTION
   ════════════════════════════════════════════════════════════ */

function extractCobaltErrorDetails(errorText: string): string {
  try {
    const json = JSON.parse(errorText);
    if (json?.error?.code) return `${json.error.code}: ${json.error.message || json.text || json.message || "Unknown Cobalt error"}`;
    return json.text || json.error || json.message || errorText;
  } catch {
    return errorText;
  }
}

async function downloadWithCobalt(
  url: string,
  format: string,
  title: string,
  targetCobaltUrl: string,
  useAuth: boolean = false
): Promise<NextResponse> {
  const cobaltUrl = targetCobaltUrl;

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
  const body: Record<string, any> = {
    url: sanitizeForCobalt(url),
    filenameStyle: "basic",
  };

  if (isAudio) {
    body.downloadMode = "audio";
    body.audioFormat = "mp3";
    body.audioBitrate = "256";
  } else {
    body.downloadMode = "auto";
    const [resolution] = format.split("-");
    if (resolution && !isNaN(parseInt(resolution))) {
      body.videoQuality = resolution;
    }
  }

  // ── Step 1: Ask Cobalt for the download URL ──
  console.log(`[Cobalt] Trying instance: ${cobaltUrl}`);

  const apiResponse = await fetch(cobaltUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000), // 20s for API call
  });

  if (!apiResponse.ok) {
    const errorText = await apiResponse.text();
    const details = extractCobaltErrorDetails(errorText);
    throw new Error(`Cobalt API error (${apiResponse.status}): ${details || errorText || "Unknown error"}`);
  }

  const resData = await apiResponse.json();

  // ── Step 2: Handle various Cobalt response types ──

  // Error response
  if (resData.status === "error") {
    const errMsg = resData.error?.code
      ? `${resData.error.code}: ${resData.error.message || ""}`
      : resData.text || resData.error || JSON.stringify(resData);
    throw new Error(errMsg);
  }

  // Get the download URL from the response.
  // Cobalt v11 can respond with different statuses:
  //   - "redirect" + url → direct CDN link
  //   - "tunnel" + url → proxied download through Cobalt
  //   - "stream" + url → streaming link
  //   - "picker" + picker[] → multiple options (audio/video tracks)
  //   - legacy: just { url: "..." } with no explicit status
  let downloadUrl: string | null = null;

  if (resData.status === "redirect" || resData.status === "tunnel" || resData.status === "stream") {
    downloadUrl = resData.url;
  } else if (resData.status === "picker" && Array.isArray(resData.picker) && resData.picker.length > 0) {
    // For picker responses, grab the first option (usually the best quality)
    // If there's an audio-specific option when user requested audio, prefer that
    if (isAudio) {
      const audioItem = resData.picker.find((p: any) => p.type === "audio") || resData.picker[0];
      downloadUrl = audioItem.url;
    } else {
      const videoItem = resData.picker.find((p: any) => p.type === "video") || resData.picker[0];
      downloadUrl = videoItem.url;
    }
  } else if (resData.url) {
    // Legacy/simple response
    downloadUrl = resData.url;
  }

  if (!downloadUrl) {
    throw new Error(
      `Cobalt API did not provide a download URL. Response: ${JSON.stringify(resData).slice(0, 200)}`
    );
  }

  // ── Step 3: Fetch the actual media file ──
  console.log(`[Cobalt] Got download URL from ${cobaltUrl}, fetching media...`);

  const fileRes = await fetch(downloadUrl, {
    signal: AbortSignal.timeout(55_000), // 55s for media download (leave 5s buffer for Vercel's 60s limit)
  });

  if (!fileRes.ok) {
    throw new Error(`Failed to fetch media file: ${fileRes.status} ${fileRes.statusText}`);
  }

  const ext = format === "mp3" ? "mp3" : format === "m4a" ? "m4a" : format.split("-")[1] || "mp4";
  const safeTitle = sanitizeFilename(title);

  // Stream the response body directly to avoid buffering large files in memory
  return new NextResponse(fileRes.body, {
    headers: {
      "Content-Type": fileRes.headers.get("content-type") || getMime(ext),
      "Content-Disposition": `attachment; filename="${safeTitle}.${ext}"`,
      "Content-Length": fileRes.headers.get("content-length") || "",
      "Cache-Control": "no-store",
    },
  });
}

/* ════════════════════════════════════════════════════════════
   SEQUENTIAL POOL DOWNLOAD
   ────────────────────────────────────────────────────────────
   Tries instances one-by-one from best to worst, skipping
   recently-failed ones. Much more reliable on Vercel than
   firing all instances in parallel via Promise.any().
   ════════════════════════════════════════════════════════════ */

async function downloadWithCobaltPool(
  url: string,
  format: string,
  title: string
): Promise<NextResponse> {
  const errors: string[] = [];

  // ── Try user-configured primary instance first ──
  const primaryUrl = process.env.COBALT_API?.trim();
  if (primaryUrl && !isOfficialCobaltInstance(primaryUrl)) {
    console.log(`[Cobalt] Trying user-configured primary: ${primaryUrl}`);
    try {
      const result = await downloadWithCobalt(url, format, title, primaryUrl, true);
      markInstanceHealthy(primaryUrl);
      return result;
    } catch (err: any) {
      const msg = err.message || String(err);
      console.error(`[Cobalt] Primary instance failed: ${msg}`);
      errors.push(`Primary (${primaryUrl}): ${msg}`);
      markInstanceFailed(primaryUrl);
    }
  } else if (primaryUrl && isOfficialCobaltInstance(primaryUrl) && hasCobaltAuthConfigured()) {
    // Official instance WITH auth configured — try it
    console.log(`[Cobalt] Trying official instance with auth: ${primaryUrl}`);
    try {
      const result = await downloadWithCobalt(url, format, title, primaryUrl, true);
      markInstanceHealthy(primaryUrl);
      return result;
    } catch (err: any) {
      const msg = err.message || String(err);
      console.error(`[Cobalt] Official instance failed: ${msg}`);
      errors.push(`Official (${primaryUrl}): ${msg}`);
      markInstanceFailed(primaryUrl);
    }
  }

  // ── Try community fallback pool sequentially ──
  const pool = COBALT_FALLBACK_POOL.filter((instanceUrl) => {
    // Skip if same as primary
    if (primaryUrl && instanceUrl.replace(/\/+$/, "") === primaryUrl.replace(/\/+$/, "")) {
      return false;
    }
    return true;
  });

  // Sort: healthy instances first, recently-failed ones last
  const sorted = [...pool].sort((a, b) => {
    const aHealthy = isInstanceHealthy(a) ? 0 : 1;
    const bHealthy = isInstanceHealthy(b) ? 0 : 1;
    return aHealthy - bHealthy;
  });

  for (const instanceUrl of sorted) {
    if (!isInstanceHealthy(instanceUrl)) {
      console.log(`[Cobalt] Skipping recently-failed instance: ${instanceUrl}`);
      continue;
    }

    try {
      const result = await downloadWithCobalt(url, format, title, instanceUrl, false);
      markInstanceHealthy(instanceUrl);
      console.log(`[Cobalt] ✅ Success with: ${instanceUrl}`);
      return result;
    } catch (err: any) {
      const msg = err.message || String(err);
      console.warn(`[Cobalt] ❌ Failed ${instanceUrl}: ${msg}`);
      errors.push(`${instanceUrl}: ${msg}`);
      markInstanceFailed(instanceUrl);

      // If the error is a YouTube-specific login/auth error,
      // don't bother with a delay — try next instance immediately
      if (msg.includes("youtube.login") || msg.includes("youtube.auth")) {
        continue;
      }

      // Brief cooldown before trying the next instance to be polite
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  // ── Last resort: try up to 3 recently-failed instances ──
  // They may have recovered since we marked them
  const failedInstances = sorted.filter((u) => !isInstanceHealthy(u)).slice(0, 3);
  for (const instanceUrl of failedInstances) {
    try {
      const result = await downloadWithCobalt(url, format, title, instanceUrl, false);
      markInstanceHealthy(instanceUrl);
      console.log(`[Cobalt] ✅ Recovered instance succeeded: ${instanceUrl}`);
      return result;
    } catch (err: any) {
      const msg = err.message || String(err);
      errors.push(`${instanceUrl} (retry): ${msg}`);
      markInstanceFailed(instanceUrl);
    }
  }

  // All failed
  const summary = errors.length <= 5
    ? errors.join(" | ")
    : errors.slice(0, 5).join(" | ") + ` ... and ${errors.length - 5} more`;

  throw new Error(
    `All Cobalt API instances failed. Tried ${errors.length} instances. Last errors: ${summary}`
  );
}

/* ════════════════════════════════════════════════════════════
   DOWNLOAD HANDLER
   ════════════════════════════════════════════════════════════ */

async function handleDownload(url: string, format: string, title: string) {
  if (!url) {
    return NextResponse.json({ error: "Missing URL" }, { status: 400 });
  }

  // If running on Vercel, force Cobalt API download
  if (process.env.VERCEL === "1") {
    try {
      return await downloadWithCobaltPool(url, format, title);
    } catch (err: any) {
      console.error("[Cobalt] All download attempts failed:", err);
      return NextResponse.json(
        {
          error: err.message || "Download failed via Cobalt API",
          hint: "All community Cobalt instances failed. This usually means YouTube is temporarily blocking downloads. Please try again in a few minutes.",
        },
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

/* ════════════════════════════════════════════════════════════
   ROUTE HANDLERS
   ════════════════════════════════════════════════════════════ */

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
