# YTDL — YouTube Downloader

A Next.js app for downloading YouTube videos and playlists as MP3 or video.

## Features

- Paste a YouTube URL → auto-detects video or playlist
- **Single video**: choose format (MP3, M4A, or any available resolution)
- **Playlist**: browse tracks, select which to download, choose audio format
- Download queue with live status
- Responsive dark-themed UI

---

## 🚀 Vercel Deployment & Local Use Ready

This app supports **two modes of operation**:
1. **Local Development (CLI Mode)**: Uses `yt-dlp` and `ffmpeg` locally for unlimited, direct downloads.
2. **Vercel Serverless (API Mode)**: Automatically detects Vercel environments and falls back to a public or private **Cobalt API instance**, bypassing local system dependencies!

---

## Local Development

### 1. Install System Dependencies

**macOS:**
```bash
brew install yt-dlp ffmpeg
```

**Ubuntu/Debian:**
```bash
sudo apt install ffmpeg
pip install yt-dlp
```

**Windows:**
```bash
pip install yt-dlp
# Download ffmpeg from https://ffmpeg.org/download.html or use:
choco install ffmpeg  # if you have Chocolatey
```

### 2. Install & Run

```bash
npm install
npm run dev
```

Open http://localhost:3000

---

## Self-Hosting on Railway, Fly.io, or Similar

If you want to deploy this app online, use a platform that supports long-running processes and binary dependencies:

1. **Railway, Fly.io, Render, etc.** support yt-dlp and ffmpeg
2. Push this repo to GitHub
3. Connect your platform to the repo
4. Deploy!

Example for Railway:
```bash
railway init
railway up
```

---

## Build & Deploy Locally

Production build:
```bash
npm run build
npm run start
```

---

## Project Structure

```
app/
├── page.tsx          # Main UI component
├── page.module.css   # Styling
├── layout.tsx        # Root layout
└── api/
    ├── info/        # Fetch video/playlist metadata
    ├── formats/     # List available formats
    └── download/    # Handle downloads
```

---

## Environment Variables (for Vercel)

If you deploy this app to Vercel, you can customize the downloader backend:
- `COBALT_API`: Set your custom Cobalt instance URL (e.g., `https://api.cobalt.tools` or your self-hosted instance URL). Defaults to the public `https://api.cobalt.tools`.
- `COBALT_API_KEY`: If your Cobalt instance requires authorization, set your API key or JWT token here. The public `api.cobalt.tools` endpoint now requires a valid token, so this must be configured for Vercel deployments.
- `COBALT_AUTH_SCHEME`: Optional. Force the auth scheme used with `COBALT_API_KEY`. Valid values are `bearer`, `apikey`, or `api-key`.
- `COBALT_AUTHORIZATION`: Optional. If set, this value is sent directly as the `Authorization` header and takes precedence over `COBALT_AUTH_SCHEME`.

## Notes

- This app uses `python -m yt_dlp` locally to work in environments where yt-dlp is installed via pip.
- When running on Vercel, metadata is fetched via pure-Node YouTube Oembed / Page Scrapers, and downloading is streamed through Cobalt API.
- Downloads are streamed directly to your browser without storing files on the server.
