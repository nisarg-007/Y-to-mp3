# YTDL — YouTube Downloader: Complete Architecture & Feature Reference

> **Purpose of this document:** This file is the single source of truth for any AI assistant or developer working on this project. It covers every feature, the reasoning behind each architectural decision, and exactly how every piece is implemented. Read this **before** making changes.

---

## Table of Contents

- [1. Project Overview](#1-project-overview)
- [2. Tech Stack & Dependencies](#2-tech-stack--dependencies)
- [3. Project Structure](#3-project-structure)
- [4. Dual-Mode Architecture (Local vs. Vercel)](#4-dual-mode-architecture-local-vs-vercel)
- [5. Environment Variables](#5-environment-variables)
- [6. API Routes — Deep Dive](#6-api-routes--deep-dive)
  - [6.1 `/api/search`](#61-apisearch)
  - [6.2 `/api/info`](#62-apiinfo)
  - [6.3 `/api/formats`](#63-apiformats)
  - [6.4 `/api/download`](#64-apidownload)
- [7. Frontend — Deep Dive](#7-frontend--deep-dive)
  - [7.1 Smart Search Bar](#71-smart-search-bar)
  - [7.2 Search Results Grid](#72-search-results-grid)
  - [7.3 Single Video Card (URL Paste Flow)](#73-single-video-card-url-paste-flow)
  - [7.4 Format Selection Modal](#74-format-selection-modal)
  - [7.5 Playlist Modal](#75-playlist-modal)
  - [7.6 Download Queue](#76-download-queue)
  - [7.7 Auto-Download via URL Parameters](#77-auto-download-via-url-parameters)
  - [7.8 iOS Shortcut Integration](#78-ios-shortcut-integration)
  - [7.9 Dynamic Island Status Pill](#79-dynamic-island-status-pill)
- [8. Theming System (Dark / Light)](#8-theming-system-dark--light)
- [9. Mobile Support & Platform Handling](#9-mobile-support--platform-handling)
- [10. CSS Architecture & Design Language](#10-css-architecture--design-language)
- [11. Deployment & Configuration](#11-deployment--configuration)
  - [11.1 Local Development](#111-local-development)
  - [11.2 Vercel Deployment](#112-vercel-deployment)
  - [11.3 Self-Hosting (Railway, Fly.io, etc.)](#113-self-hosting-railway-flyio-etc)
- [12. Cobalt API Fallback Pool](#12-cobalt-api-fallback-pool)
- [13. Key TypeScript Types](#13-key-typescript-types)
- [14. Keyboard Shortcuts](#14-keyboard-shortcuts)
- [15. Known Caveats & Gotchas](#15-known-caveats--gotchas)
- [16. Future Enhancement Ideas](#16-future-enhancement-ideas)

---

## 1. Project Overview

**YTDL (YouTubetoMP3)** is a full-stack Next.js 14 web application that lets users:

1. **Search** for YouTube videos by keyword, artist name, or song title.
2. **Paste** a YouTube video or playlist URL directly.
3. **Choose** a download format (MP3, M4A, or any available video resolution like 1080p MP4).
4. **Download** the media file directly to the browser — files are **never stored on the server**.

The app is designed to work in **two environments** with zero configuration changes:
- **Locally** with `yt-dlp` + `ffmpeg` for full power.
- **On Vercel** (serverless) using the Cobalt API as the download backend — because Vercel cannot run system binaries like `yt-dlp`.

---

## 2. Tech Stack & Dependencies

| Layer          | Technology                                           | Why                                                                                         |
| -------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Framework      | **Next.js 14** (App Router)                          | Server-side API routes + client-side React in one project. App Router gives modern layouts.  |
| Language       | **TypeScript** (strict mode)                         | Type safety across API routes and frontend. Catches bugs at compile time.                    |
| React          | **React 18**                                         | Concurrent features, Suspense for search params.                                            |
| Styling        | **CSS Modules** (`page.module.css`, `globals.css`)   | Scoped styles, no external CSS framework needed, zero runtime cost.                         |
| Fonts          | **Inter + Roboto** (Google Fonts)                    | Clean, modern typography loaded via `@import` in `globals.css`.                             |
| Local Backend  | **yt-dlp** (via `python -m yt_dlp`) + **ffmpeg**     | Most reliable YouTube data extraction and media conversion tool.                            |
| Cloud Backend  | **Cobalt API** (with fallback pool)                  | Serverless-compatible alternative; no system binaries required.                             |
| Search         | **YouTube Data API v3**                              | Official API for searching videos with metadata (duration, view count, etc.).               |
| Deployment     | **Vercel** (primary), Railway/Fly.io (alternative)   | Vercel for serverless; Railway/Fly.io for long-running processes with binary support.       |

### NPM Dependencies (production)

```json
{
  "next": "^14.2.0",
  "react": "^18.2.0",
  "react-dom": "^18.2.0"
}
```

> **Intentionally minimal.** There are **zero** third-party npm packages for downloading, API calls, or styling. Everything is built with Node.js built-in modules (`child_process`, `fs`, `os`, `path`, `util`) and the Fetch API.

### Dev Dependencies

```json
{
  "@types/node": "^20.10.0",
  "@types/react": "^18.2.0",
  "@types/react-dom": "^18.2.0",
  "typescript": "^5.3.0"
}
```

---

## 3. Project Structure

```
ytdl/
├── .env.local                    # Environment variables (API keys, Cobalt config) — git-ignored
├── .gitignore                    # Ignores node_modules, .next, .env files, etc.
├── next.config.js                # Next.js config: reactStrictMode, disabled outputFileTracing
├── vercel.json                   # Vercel config: sets maxDuration=60s for API routes
├── tsconfig.json                 # TypeScript: strict, ES2020 target, bundler module resolution
├── package.json                  # Minimal deps — only next, react, react-dom
│
├── app/
│   ├── layout.tsx                # Root layout: metadata, viewport, ThemeProvider wrapper
│   ├── globals.css               # CSS custom properties (design tokens), reset styles, scrollbar
│   ├── page.tsx                  # ★ MAIN FILE — entire UI + all client logic (~1277 lines)
│   ├── page.module.css           # ★ All component styles (~2369 lines of CSS Modules)
│   │
│   ├── components/
│   │   └── ThemeProvider.tsx      # React context for dark/light theme, localStorage persistence
│   │
│   └── api/
│       ├── search/
│       │   └── route.ts          # POST — YouTube Data API v3 search with enriched metadata
│       ├── info/
│       │   └── route.ts          # POST — Video/playlist metadata (yt-dlp → scraper → oEmbed fallback)
│       ├── formats/
│       │   └── route.ts          # POST — Available formats list (yt-dlp → standard fallback)
│       └── download/
│           └── route.ts          # POST & GET — Download engine (yt-dlp → Cobalt pool fallback)
```

### File Size Reference

| File                | Lines | Purpose                          |
| ------------------- | ----- | -------------------------------- |
| `page.tsx`          | 1277  | All UI, state management, logic  |
| `page.module.css`   | 2369  | All styling for every component  |
| `api/download/route.ts` | 283 | Download engine + Cobalt pool  |
| `api/info/route.ts` | 254   | Metadata extraction chain        |
| `api/search/route.ts` | 128  | YouTube Data API search         |
| `api/formats/route.ts` | 64   | Format listing                  |
| `ThemeProvider.tsx`  | 54    | Theme context                   |
| `layout.tsx`         | 40    | Root layout + metadata          |
| `globals.css`        | 108   | Design tokens + resets          |

> **Architecture decision:** The entire frontend is in a **single `page.tsx`** file. This is intentional — the app is a single-page tool, not a multi-route SPA. Keeping everything in one file makes it easy to understand the complete data flow without jumping between files.

---

## 4. Dual-Mode Architecture (Local vs. Vercel)

This is the most important architectural pattern in the project. Every API route checks `process.env.VERCEL === "1"` to determine which backend to use:

```
┌─────────────────────────────────────────────────────┐
│                   API Route                         │
│                                                     │
│   if (process.env.VERCEL === "1") {                 │
│       → Use Cobalt API / Node.js scraping           │
│       → No system binaries needed                   │
│   } else {                                          │
│       → Try yt-dlp (spawns python -m yt_dlp)        │
│       → On failure, fall back to Cobalt API         │
│   }                                                 │
└─────────────────────────────────────────────────────┘
```

### Why?

- **Vercel** is a serverless platform. It cannot install or run system binaries like `yt-dlp` or `ffmpeg`. So on Vercel, all metadata is fetched via HTTP scraping (YouTube page HTML + oEmbed) and all downloads go through the Cobalt API.
- **Locally**, `yt-dlp` provides the best quality metadata and highest reliability for downloads. If it fails (e.g. not installed), the app gracefully falls back to the same Cobalt API path.

### Fallback chain per route:

| Route      | Local Mode                              | Vercel Mode                            |
| ---------- | --------------------------------------- | -------------------------------------- |
| `/api/info`     | yt-dlp `-J` → HTML scraper → oEmbed  | HTML scraper → oEmbed                  |
| `/api/formats`  | yt-dlp `-J` → standard list          | Standard list only                     |
| `/api/download` | yt-dlp + ffmpeg → Cobalt pool        | Cobalt pool only                       |
| `/api/search`   | YouTube Data API v3 (same both modes) | YouTube Data API v3 (same both modes)  |

---

## 5. Environment Variables

Defined in `.env.local` (git-ignored):

| Variable               | Required | Description                                                                                       |
| ---------------------- | -------- | ------------------------------------------------------------------------------------------------- |
| `YOUTUBE_API_KEY`      | **Yes**  | Google YouTube Data API v3 key. Used by `/api/search` for video search.                          |
| `COBALT_API`           | No       | Custom Cobalt instance URL. Defaults to `https://api.cobalt.tools`.                              |
| `COBALT_API_KEY`       | No       | API key or JWT token for authenticated Cobalt instances.                                         |
| `COBALT_AUTH_SCHEME`   | No       | Force auth scheme: `bearer`, `apikey`, `api-key`, or `basic`.                                    |
| `COBALT_AUTHORIZATION` | No       | Direct override for the `Authorization` header. Takes precedence over `COBALT_AUTH_SCHEME`.       |
| `VERCEL`               | Auto     | Automatically set to `"1"` by Vercel. **Do not set manually.** Used for environment detection.   |

### Cobalt Authorization Logic

The `buildCobaltAuthorization()` function in `download/route.ts` implements smart auto-detection:

1. If `COBALT_AUTHORIZATION` is set → use it directly (full override).
2. If `COBALT_API_KEY` is set:
   - If it already starts with `Bearer`, `Api-Key`, `Basic` → use as-is.
   - If `COBALT_AUTH_SCHEME` forces a scheme → wrap the key with that scheme.
   - If the key looks like a JWT (three dot-separated base64 segments) → use `Bearer`.
   - Otherwise → use `Api-Key`.

---

## 6. API Routes — Deep Dive

### 6.1 `/api/search`

**File:** `app/api/search/route.ts`
**Method:** `POST`
**Body:** `{ query: string }`

**What it does:**
1. Takes a search query (song name, artist, keyword).
2. Calls **YouTube Data API v3** `search` endpoint to get top 10 video results.
3. Extracts the `videoId`s from search results.
4. Makes a **second API call** to the `videos` endpoint to enrich results with `contentDetails` (duration) and `statistics` (view count).
5. Returns combined results with human-readable metadata.

**Why two API calls?**
The YouTube `search` endpoint only returns snippet data (title, channel, thumbnail). To get **duration** and **view count**, a separate `videos` endpoint call with `contentDetails,statistics` parts is needed. This is a YouTube API limitation.

**Helper functions:**
- `parseDuration(iso)` — Converts ISO 8601 duration (e.g., `PT4M33S`) to human-readable format (`4:33`).
- `formatViewCount(count)` — Converts raw number to `1.2M views`, `3.5K views`, etc.
- `timeAgo(dateStr)` — Converts ISO date to relative time (`2 months ago`, `3 years ago`).

**Response shape:**
```typescript
{
  results: Array<{
    id: string;
    title: string;
    channel: string;
    duration: string;       // "4:33"
    thumbnail: string;      // High-quality thumbnail URL
    viewCount: string;      // "1.2M views"
    publishedAt: string;    // "2 months ago"
    url: string;            // Full YouTube watch URL
  }>
}
```

---

### 6.2 `/api/info`

**File:** `app/api/info/route.ts`
**Method:** `POST`
**Body:** `{ url: string }`

**What it does:**
Detects whether the URL is a **single video** or **playlist**, then extracts metadata.

**Detection logic:**
```typescript
const isPlaylist = url.includes("list=") && !url.includes("watch?v=");
```
- URLs with `list=` but NO `watch?v=` → treated as playlist.
- All other YouTube URLs → treated as single video.

**Single video extraction chain:**

1. **yt-dlp** (`python -m yt_dlp -J <url>`) — Returns full JSON metadata. Best quality, includes duration, thumbnail, all format info.
2. **HTML scraping** (fallback) — Fetches the YouTube watch page HTML, extracts `ytInitialPlayerResponse` JSON from the page source. Gets `videoDetails` including title, author, duration, thumbnail.
3. **oEmbed** (last resort) — Calls `https://www.youtube.com/oembed?url=...&format=json`. Always works but does **not** include duration.

**Playlist extraction chain:**

1. **yt-dlp** (`python -m yt_dlp --flat-playlist -J <url>`) — Returns flat listing of all videos (id, title, duration) without downloading each one.
2. **HTML scraping** (fallback) — Fetches playlist page HTML, extracts `ytInitialData` JSON, recursively finds all `playlistVideoRenderer` objects using the `findKeys()` helper.

**Key helper functions:**
- `getVideoId(url)` — Regex to extract 11-character video ID from all YouTube URL formats (watch, youtu.be, embed, etc.).
- `getPlaylistId(url)` — Regex to extract playlist ID from `list=` parameter.
- `findKeys(obj, key)` — Recursively traverses deeply nested JSON structures to find all instances of a given key. Essential because YouTube's `ytInitialData` has an extremely deep, unstable structure.

**Why scrape HTML instead of using YouTube API?**
The YouTube Data API requires an API key and has quota limits. HTML scraping requires no API key and has no quota, making it more reliable for high-traffic deployments. The scraping approach extracts `ytInitialPlayerResponse` and `ytInitialData` — the same JSON that YouTube's own frontend uses.

**Response shapes:**

```typescript
// Single video
{
  type: "video",
  id: string,
  title: string,
  uploader: string,
  duration: number,     // seconds
  thumbnail: string,
  url: string
}

// Playlist
{
  type: "playlist",
  title: string,
  uploader: string,
  count: number,
  entries: Array<{
    id: string,
    title: string,
    duration: number,   // seconds
    url: string
  }>  // capped at 100 entries
}
```

---

### 6.3 `/api/formats`

**File:** `app/api/formats/route.ts`
**Method:** `POST`
**Body:** `{ url: string }`

**What it does:**
Returns a list of available download formats for a given YouTube video.

**On Vercel:**
Returns a hardcoded standard list (since we can't probe formats without yt-dlp):
```
MP3, M4A, 1080p MP4, 720p MP4, 480p MP4, 360p MP4
```

**Locally:**
1. Runs `python -m yt_dlp -J <url>` to get full format metadata.
2. Always adds MP3 and M4A as the first options.
3. Filters video formats that have both `vcodec` and `height`.
4. Deduplicates by `{height}p-{ext}` key.
5. Sorts by resolution (highest first).
6. Caps at 10 total formats.
7. Falls back to the standard list if yt-dlp fails.

**Response shape:**
```typescript
{
  formats: Array<{
    label: string;   // "1080p MP4"
    value: string;   // "1080p-mp4"  (used as format ID in download requests)
    ext: string;     // "mp4"
  }>
}
```

**Format value encoding:**
The `value` field encodes resolution and extension as `{height}p-{ext}` (e.g., `1080p-mp4`). Audio formats use simple strings: `"mp3"` or `"m4a"`. The download route parses this to determine the download strategy.

---

### 6.4 `/api/download`

**File:** `app/api/download/route.ts`
**Methods:** `POST` and `GET`
**Body (POST):** `{ url: string, format: string }`
**Query (GET):** `?url=...&format=...`

> **Why both POST and GET?** POST is used by the web UI. GET is used for **mobile downloads** and **iOS Shortcut** integration — mobile browsers need a direct URL they can navigate to, since `fetch()` + blob download doesn't work reliably on iOS/Android.

**Download flow:**

```
Request → handleDownload(url, format)
    │
    ├── Vercel? → downloadWithCobaltPool(url, format)
    │                  │
    │                  ├── Try primary Cobalt API (with auth)
    │                  ├── Try fallback pool instances (without auth)
    │                  └── All fail → return 500 error
    │
    └── Local? → Try yt-dlp
                     │
                     ├── Success → Read file → Stream to browser → Delete temp file
                     └── Failure → downloadWithCobaltPool(url, format) [same as above]
```

**yt-dlp download commands:**

| Format  | Command                                                                                    |
| ------- | ------------------------------------------------------------------------------------------ |
| MP3     | `yt-dlp -x --audio-format mp3 --audio-quality 0 -o {tmpFile}.%(ext)s --no-playlist <url>`  |
| M4A     | `yt-dlp -x --audio-format m4a --audio-quality 0 -o {tmpFile}.%(ext)s --no-playlist <url>`  |
| Video   | `yt-dlp -f "bestvideo[height<=X][ext=Y]+bestaudio/..." --merge-output-format Y -o ...`     |

- `--audio-quality 0` = best quality.
- `--no-playlist` = prevent accidental playlist downloads.
- Output goes to a temp file in `os.tmpdir()`, read into memory, then deleted immediately.

**Cobalt API integration:**

The `downloadWithCobalt()` function:
1. Constructs a request body based on format type:
   - Audio: `{ downloadMode: "audio", audioFormat: "mp3", audioBitrate: "256" }`
   - Video: `{ downloadMode: "auto", videoQuality: "1080" }`
2. Sends POST to the Cobalt instance.
3. Parses the response — Cobalt returns a `{ url: "..." }` with a temporary download link.
4. Fetches the actual media file from that URL.
5. Streams it back to the browser with appropriate `Content-Type` and `Content-Disposition` headers.

**MIME type mapping (`getMime`):**
```
mp3 → audio/mpeg    |  m4a → audio/mp4     |  mp4 → video/mp4
webm → video/webm   |  mkv → video/x-matroska  |  ogg → audio/ogg
```

---

## 7. Frontend — Deep Dive

All frontend logic lives in `app/page.tsx` (marked `"use client"`). It's a single React component (`Home`) with multiple inner components and handlers.

### 7.1 Smart Search Bar

**What:** A unified input field that handles **both** keyword searches and direct YouTube URL pastes.

**How it works:**
```
User types/pastes → handleSubmit()
    │
    ├── isYouTubeUrl(input)? → fetchInfo(url)     [video/playlist flow]
    └── Not a URL?           → handleSearch(query) [YouTube search flow]
```

The `isYouTubeUrl()` function uses regex: `/(?:youtube\.com|youtu\.be)/i`

**Smart paste detection:**
The `handlePaste` handler intercepts clipboard events. If the pasted text is a YouTube URL, it immediately triggers `fetchInfo()` without waiting for the user to press Enter. This creates a seamless UX — paste a link and it auto-fetches.

**Keyboard shortcut:** `Ctrl+K` / `Cmd+K` focuses the search input (via `useEffect` event listener).

---

### 7.2 Search Results Grid

**When:** Displayed after a keyword search returns results.

**Layout:** 2-column responsive grid (`grid-template-columns: repeat(2, 1fr)`), collapses to 1 column on mobile (`max-width: 768px`).

**Each result card shows:**
- Thumbnail (16:9 aspect ratio, lazy loaded)
- Duration badge (bottom-right overlay)
- **Quick Download button** (⚡ MP3) — appears on hover, bottom-left overlay. Downloads as MP3 immediately without opening the format modal.
- Title (clamped to 2 lines)
- Channel name
- View count + relative publish date

**Animations:**
- Cards fade-slide-up on render with staggered delays (0ms, 40ms, 80ms, ... per card).
- Thumbnail zooms slightly on card hover (`transform: scale(1.03)`).
- Quick download button fades in + slides up on hover.

**Skeleton loading:**
While search is in progress, 10 skeleton cards are shown with the `shimmer` animation (gradient sliding horizontally). This matches YouTube's own loading pattern.

---

### 7.3 Single Video Card (URL Paste Flow)

**When:** User pastes a YouTube video URL and info is fetched successfully.

**Shows:**
- Large thumbnail (280px wide, 16:9)
- Duration badge
- Title + uploader name
- Format picker grid (loaded from `/api/formats`)
- Download button + Clear button

---

### 7.4 Format Selection Modal

**When:** User clicks a search result card.

**What it does:**
1. Opens a centered modal with backdrop blur.
2. Shows video preview (thumbnail, title, channel, duration, view count).
3. Loads available formats from `/api/formats`.
4. Lets user pick a format from a grid of format cards.
5. Download button triggers `startDownload()`.

**Fallback:** If `/api/formats` fails, the modal falls back to showing just MP3 and M4A options.

**Dismiss:** Click overlay, press Escape, or click Close button.

---

### 7.5 Playlist Modal

**When:** User pastes a playlist URL and info is fetched.

**Layout:** Split-pane modal:
- **Left sidebar:** Playlist icon, title, uploader, count, audio format pills (MP3/M4A), Download Selected + Close buttons.
- **Right pane:** Track list with checkboxes. Select All / Deselect All toggle. Shows track number, title, and duration.

**Track selection:**
- All tracks are selected by default on modal open.
- Individual tracks can be toggled on/off.
- `selectedTracks` is a `Set<string>` of video IDs.

**Download flow:**
On "Download Selected", iterates over selected entries and calls `startDownload()` for each, adding them all to the download queue.

---

### 7.6 Download Queue

**When:** One or more downloads are in progress or completed.

**Shows:** A list of download tasks, each with:
- Status icon (spinner for downloading, ✓ for done, ✗ for error)
- Title
- Format badge
- Progress bar:
  - **Downloading:** Indeterminate animated bar (slides left to right)
  - **Done:** Full green bar
  - **Error:** Full red bar + error message

**Download engine (`startDownload`):**

The function handles **two platform paths:**

1. **Mobile browsers** (detected via `navigator.userAgent` matching `/Mobi|Android|iPhone|iPad|iPod/i`):
   - Uses `window.location.assign()` to navigate to the GET endpoint: `/api/download?url=...&format=...`
   - This triggers the browser's native download dialog.
   - **Why?** Mobile Safari and Chrome block programmatic blob downloads. The `download` attribute on `<a>` elements is often ignored. Direct URL navigation is the only reliable method.

2. **Desktop browsers:**
   - Uses `fetch()` POST to `/api/download` to get the file as a blob.
   - Creates an invisible `<a>` element with `URL.createObjectURL(blob)` and triggers `a.click()`.
   - Immediately revokes the object URL to free memory.

**File naming:** Title is sanitized (non-alphanumeric chars replaced with `_`) and truncated to 60 chars, then the extension is appended.

---

### 7.7 Auto-Download via URL Parameters

**Component:** `AutoDownloadHandler` — wrapped in `<Suspense>` because it uses `useSearchParams()`.

**URL format:** `/?url=<youtube-url>&autoDownload=<format>`

**Flow:**
1. On page load, reads `url` and `autoDownload` from query params.
2. If both present, triggers an automatic download.
3. Cleans the URL bar via `window.history.replaceState({}, "", "/")` to prevent re-triggering on refresh.
4. Shows the Dynamic Island status pill while processing.

**Why does this exist?**
This powers the **iOS Shortcut integration** — the shortcut opens the app with the YouTube URL and desired format baked into the URL, so the download starts automatically.

**Guard:** Uses a `useRef(triggered)` flag to ensure the auto-download fires only once, even if the component re-renders.

---

### 7.8 iOS Shortcut Integration

**Modal:** Accessible via the "Download from iPhone" button in the footer.

**What it does:**
Provides step-by-step instructions for creating an iOS Shortcut that:
1. Accepts a shared YouTube URL from the Share Sheet.
2. Opens the YTDL web app with `?url=[Shortcut Input]&autoDownload=mp3`.
3. The app auto-downloads the video as MP3.

**Dynamic URL:** The modal shows the shortcut URL template using `window.location.origin` so it works regardless of where the app is deployed.

---

### 7.9 Dynamic Island Status Pill

**Inspired by:** Apple's Dynamic Island on iPhone 14 Pro+.

**States:**
- `idle` — hidden.
- `processing` — Expanded with equalizer animation, "Downloading" label, and music note icon. Includes an indeterminate progress bar at the bottom.
- `done` — Compact with checkmark and "Downloaded!" text. Auto-dismisses after 4 seconds.
- `error` — Compact with "!" icon and "Failed" text. Auto-dismisses after 4 seconds.

**When used:** Only during auto-downloads (from URL parameters / iOS Shortcut). Not shown for regular manual downloads (those use the queue).

---

## 8. Theming System (Dark / Light)

**File:** `app/components/ThemeProvider.tsx`

**Implementation:**
- React Context (`ThemeContext`) provides `{ theme, toggleTheme }` to the entire app.
- Theme is stored as `data-theme` attribute on `<html>` element.
- Persisted in `localStorage` under key `yt-theme`.
- On mount, reads saved preference; defaults to `dark`.
- Prevents flash of wrong theme by rendering children without context until mounted.

**CSS Variables:**
All colors are defined in `globals.css` using CSS custom properties:

```css
:root {                           /* Dark theme (default) */
  --yt-bg: #0f0f0f;
  --yt-surface: #1f1f1f;
  --yt-text-primary: #f1f1f1;
  ...
}

[data-theme="light"] {            /* Light theme override */
  --yt-bg: #f9f9f9;
  --yt-surface: #ffffff;
  --yt-text-primary: #0f0f0f;
  ...
}
```

**Toggle button:** Circular button in the header with animated Sun/Moon SVG icons. Rotates 30° on hover.

**Transition:** All themed properties animate with `transition: ... 0.35s ease` for smooth switching.

---

## 9. Mobile Support & Platform Handling

The app includes extensive mobile-specific handling:

1. **Viewport meta:** `width=device-width, initialScale=1, maximumScale=1, userScalable=false, viewportFit=cover` — prevents iOS Safari zoom issues and handles notch/home-indicator areas.

2. **Theme color meta:** Different `theme-color` for dark and light modes via `prefers-color-scheme` media queries.

3. **PWA-like capability:** `appleWebApp: { capable: true, statusBarStyle: "black-translucent" }` — when added to home screen, runs in standalone mode with translucent status bar.

4. **iOS-specific CSS resets:**
   - `-webkit-text-size-adjust: 100%` — prevents text size changes on rotation.
   - `-webkit-overflow-scrolling: touch` — smooth momentum scrolling.
   - `-webkit-tap-highlight-color: transparent` — removes tap highlight.
   - `overscroll-behavior-y: none` — prevents pull-to-refresh.
   - `-webkit-appearance: none` on inputs — removes native iOS input styling.

5. **Mobile download handling:** User-agent based detection routes mobile users to the GET download endpoint via `window.location.assign()` instead of fetch+blob.

---

## 10. CSS Architecture & Design Language

**File:** `app/page.module.css` (2369 lines)

**Design system:**
- YouTube-inspired color palette (dark grays, red accent `#ff0000`).
- Rounded corners: `border-radius` from 4px (badges) to 40px (search bar) to 16px (modals).
- Consistent spacing: 8px base grid.
- Card shadows: layered box-shadows that differ between dark and light themes.

**Key animations:**
| Animation           | Usage                              | Details                                |
| ------------------- | ---------------------------------- | -------------------------------------- |
| `fadeSlideUp`       | Search results, video card         | 16px translateY + opacity, 0.4s       |
| `shimmer`           | Skeleton loading cards             | Gradient background-position slide     |
| `spin`              | Loading spinners                   | 360° rotation, 0.75s linear           |
| `slideUp`           | Modals                             | cubic-bezier spring-like entrance      |
| `fadeIn`            | Modal overlays                     | Simple opacity, 0.2s                  |
| Staggered delays    | Search result cards                | 40ms increments per card               |

**Responsive breakpoints:**
- `768px` — Search grid switches from 2 columns to 1.
- `680px` — Video card switches from horizontal to vertical layout.
- `480px` — Format modal video preview stacks vertically.
- `900px` — Playlist modal sidebar collapses.

**Inline SVG icons:**
All icons (Search, Download, Sun, Moon, Error, Close, Bolt, Playlist, iPhone, Share) are inline SVGs defined as React components at the top of `page.tsx`. **Why?** Zero external dependencies, no icon font loading latency, fully styleable with CSS (`fill: currentColor`).

---

## 11. Deployment & Configuration

### 11.1 Local Development

**Prerequisites:**
- Node.js (18+)
- Python with `yt-dlp` (`pip install yt-dlp`)
- `ffmpeg` (for audio extraction and format conversion)

**Steps:**
```bash
npm install
# Create .env.local with YOUTUBE_API_KEY=your_key
npm run dev
# Open http://localhost:3000
```

### 11.2 Vercel Deployment

**Steps:**
1. Push to GitHub.
2. Import project in Vercel dashboard.
3. Set environment variables:
   - `YOUTUBE_API_KEY` (required)
   - `COBALT_API` (optional, defaults to public instance)
   - `COBALT_API_KEY` (optional, for authenticated instances)
4. Deploy.

**Key config:**
- `vercel.json` sets `maxDuration: 60` for all API routes (default is 10s, which is too short for downloads).
- `next.config.js` has `outputFileTracing: false` — prevents Next.js from trying to bundle Node.js binary dependencies.

### 11.3 Self-Hosting (Railway, Fly.io, etc.)

For platforms that support system binaries:
1. Install `yt-dlp` and `ffmpeg` in the Docker image / build environment.
2. Push the repo.
3. The app automatically uses yt-dlp when `VERCEL` env var is not set.

---

## 12. Cobalt API Fallback Pool

**File:** `app/api/download/route.ts`

When the primary Cobalt API fails, the app tries a pool of **10 community-hosted Cobalt instances**:

```typescript
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
```

**Important behaviors:**
- The **primary** instance (from `COBALT_API` env var) is tried **with** auth headers.
- **Fallback** instances are tried **without** auth headers (they are public community instances).
- Instances are tried **sequentially** (not in parallel) to avoid overwhelming them.
- The primary instance URL is skipped in the fallback pool to avoid duplicate attempts.
- All errors are collected and returned in the final error message if all instances fail.

**⚠️ Note for future AI assistants:** These community URLs may go offline or change. If downloads consistently fail on Vercel, check if these URLs are still active and update the pool. The [Cobalt instances list](https://instances.cobalt.best/) is a good source for current instances.

---

## 13. Key TypeScript Types

Defined at the top of `page.tsx`:

```typescript
type VideoInfo = {
  type: "video";
  id: string;
  title: string;
  uploader: string;
  duration: number;
  thumbnail: string;
  url: string;
};

type PlaylistInfo = {
  type: "playlist";
  title: string;
  uploader: string;
  count: number;
  entries: { id: string; title: string; duration: number; url: string }[];
};

type Format = { label: string; value: string; ext: string };

type DownloadTask = {
  id: string;          // Unique ID: `${videoId}-${Date.now()}`
  title: string;
  url: string;
  format: string;
  status: "pending" | "downloading" | "done" | "error";
  error?: string;
};

type SearchResult = {
  id: string;
  title: string;
  channel: string;
  duration: string;
  thumbnail: string;
  viewCount: string;
  publishedAt: string;
  url: string;
};
```

---

## 14. Keyboard Shortcuts

| Shortcut            | Action                    | Implementation                                   |
| ------------------- | ------------------------- | ------------------------------------------------ |
| `Ctrl+K` / `Cmd+K`  | Focus search input        | `useEffect` keydown listener, `inputRef.focus()` |
| `Escape`            | Close any open modal      | Checks and closes format/playlist/shortcut modals |
| `Enter`             | Submit search / fetch URL | `onKeyDown` on the input element                 |

---

## 15. Known Caveats & Gotchas

1. **YouTube HTML scraping is fragile.** YouTube frequently changes its page structure. The regex patterns for `ytInitialPlayerResponse` and `ytInitialData` may break. If metadata fetching stops working on Vercel, this is likely the cause.

2. **Cobalt API community instances are ephemeral.** They go online and offline regularly. The fallback pool should be updated periodically.

3. **YouTube Data API quotas.** The search endpoint has a daily quota (default 10,000 units/day for free tier). Each search costs ~100 units. Heavy usage may exhaust the quota.

4. **Large playlists are capped at 100 entries.** Both the yt-dlp and HTML scraping paths limit to `.slice(0, 100)`. This is intentional to prevent timeout issues.

5. **No progress tracking for downloads.** The progress bar is indeterminate because neither yt-dlp (spawned as a child process without pipe parsing) nor the Cobalt API provides real-time progress.

6. **yt-dlp is invoked as `python -m yt_dlp`** (not `yt-dlp` directly). This ensures compatibility with `pip install yt-dlp` installations where the binary may not be on PATH.

7. **File is read entirely into memory before streaming.** The local yt-dlp path reads the entire downloaded file into memory with `fs.readFileSync()`. For very large video files, this could cause memory issues. Cobalt downloads stream directly from the API response.

8. **Search input URLs with `list=` AND `watch?v=` are treated as videos, not playlists.** If a user pastes a video URL that happens to include a playlist reference (e.g., playing a video within a playlist), it's handled as a single video download.

---

## 16. Future Enhancement Ideas

- [ ] **Real-time download progress** — Parse yt-dlp stdout for percentage updates; use Cobalt's progress endpoint if available.
- [ ] **Audio preview player** — Embed an `<audio>` element for previewing before downloading.
- [ ] **Download history** — Persist completed downloads in `localStorage` with one-click re-download.
- [ ] **Batch URL input** — Paste multiple URLs separated by newlines for bulk downloads.
- [ ] **Custom audio quality settings** — Let users choose bitrate (128k, 192k, 256k, 320k).
- [ ] **Drag-and-drop URL support** — Accept dragged YouTube URLs.
- [ ] **Service Worker caching** — Cache the app shell for offline access (PWA).
- [ ] **Queue management** — Retry failed downloads, reorder queue, cancel in-progress downloads.
- [ ] **WebSocket progress** — Replace polling with real-time WebSocket updates for download progress.
- [ ] **Automated Cobalt pool health check** — Periodically ping instances and remove dead ones.

---

> **Last Updated:** May 2025
> **Maintainer:** nisarg-007
> **Repo:** [github.com/nisarg-007/Y-to-mp3](https://github.com/nisarg-007/Y-to-mp3)
