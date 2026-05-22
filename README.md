# YTDL — YouTube Downloader

A Next.js app for downloading YouTube videos and playlists as MP3 or video.

## Features

- Paste a YouTube URL → auto-detects video or playlist
- **Single video**: choose format (MP3, M4A, or any available resolution)
- **Playlist**: browse tracks, select which to download, choose audio format
- Download queue with live status
- Deploys to Vercel

---

## Local Development

### 1. Install yt-dlp and ffmpeg

**macOS:**
```bash
brew install yt-dlp ffmpeg
```

**Ubuntu/Debian:**
```bash
sudo apt install ffmpeg
sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
sudo chmod a+rx /usr/local/bin/yt-dlp
```

**Windows:**
Download from https://github.com/yt-dlp/yt-dlp/releases and add to PATH.

### 2. Install & Run

```bash
npm install
npm run dev
```

Open http://localhost:3000

---

## Deploying to Vercel

### The Challenge
Vercel's serverless functions run in a Lambda environment. `yt-dlp` is a Python binary that needs to be available at runtime.

### Option A: Use a pre-built yt-dlp binary (Recommended)

1. Download the yt-dlp Linux binary:
```bash
mkdir -p bin
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux -o bin/yt-dlp
chmod +x bin/yt-dlp
```

2. Update `app/api/info/route.ts`, `app/api/formats/route.ts`, and `app/api/download/route.ts` to use the bundled binary:

```ts
import path from "path";

// Replace "yt-dlp" in execAsync/spawn calls with:
const ytdlpBin = process.env.NODE_ENV === "production"
  ? path.join(process.cwd(), "bin", "yt-dlp")
  : "yt-dlp";
```

3. Add `bin/yt-dlp` to your git repo (it's ~12MB).

4. Update `vercel.json` to include the binary:
```json
{
  "functions": {
    "app/api/**": { "maxDuration": 300 }
  },
  "outputFileTracingIncludes": {
    "app/api/**": ["./bin/yt-dlp"]
  }
}
```

### Option B: Use a self-hosted backend

Run a small VPS (e.g. Railway, Fly.io) with yt-dlp installed and proxy requests from Vercel to it.

### Deploy

```bash
vercel deploy --prod
```

---

## Notes

- Vercel free tier has a 300s function timeout max (Pro plan needed for long downloads)
- Large video files may exceed Vercel's 4.5MB response limit — for those, use Option B
- For personal use on Pro plan, MP3s and videos up to ~720p work well
- Keep `bin/yt-dlp` updated regularly: `yt-dlp -U`
