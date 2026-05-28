"use client";

import { useState, useRef, useCallback, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import styles from "./page.module.css";
import { useTheme } from "./components/ThemeProvider";

/* ───────────────────────────────────
   Types
   ─────────────────────────────────── */
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
  id: string;
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

/* ───────────────────────────────────
   Helpers
   ─────────────────────────────────── */
function formatDuration(s: number) {
  if (!s) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function isYouTubeUrl(s: string) {
  return /(?:youtube\.com|youtu\.be)/i.test(s);
}

/* ───────────────────────────────────
   SVG Icons (inline for zero-dep)
   ─────────────────────────────────── */
const SearchIcon = () => (
  <svg className={styles.fetchIcon} viewBox="0 0 24 24">
    <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
  </svg>
);

const DownloadIcon = () => (
  <svg style={{ width: 18, height: 18, fill: "currentColor" }} viewBox="0 0 24 24">
    <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM17 13l-5 5-5-5h3V9h4v4h3z" />
  </svg>
);

const SunIcon = () => (
  <svg className={styles.themeIcon} viewBox="0 0 24 24">
    <path d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58a.996.996 0 00-1.41 0 .996.996 0 000 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37a.996.996 0 00-1.41 0 .996.996 0 000 1.41l1.06 1.06c.39.39 1.03.39 1.41 0a.996.996 0 000-1.41l-1.06-1.06zm1.06-10.96a.996.996 0 000-1.41.996.996 0 00-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06zM7.05 18.36a.996.996 0 000-1.41.996.996 0 00-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06z" />
  </svg>
);

const MoonIcon = () => (
  <svg className={styles.themeIcon} viewBox="0 0 24 24">
    <path d="M12 3a9 9 0 109 9c0-.46-.04-.92-.1-1.36a5.389 5.389 0 01-4.4 2.26 5.403 5.403 0 01-3.14-9.8c-.44-.06-.9-.1-1.36-.1z" />
  </svg>
);

const ErrorIcon = () => (
  <svg style={{ width: 16, height: 16, fill: "currentColor", marginRight: 6 }} viewBox="0 0 24 24">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
  </svg>
);

const CloseIcon = () => (
  <svg viewBox="0 0 24 24">
    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
  </svg>
);

const BoltIcon = () => (
  <svg viewBox="0 0 24 24">
    <path d="M11 21h-1l1-7H7.5c-.88 0-.33-.75-.31-.78C8.48 10.94 10.42 7.54 13.01 3h1l-1 7h3.51c.4 0 .62.19.4.66C12.97 17.55 11 21 11 21z" />
  </svg>
);

const PlaylistIcon = () => (
  <svg style={{ width: 44, height: 44, fill: "currentColor" }} viewBox="0 0 24 24">
    <path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0-2-.9-2-2V4c0-1.1-.9-2-2-2zm0 14H8V4h12v12z" />
  </svg>
);

const IPhoneIcon = () => (
  <svg style={{ width: 20, height: 20, fill: "currentColor" }} viewBox="0 0 24 24">
    <path d="M15.5 1h-8C6.12 1 5 2.12 5 3.5v17C5 21.88 6.12 23 7.5 23h8c1.38 0 2.5-1.12 2.5-2.5v-17C18 2.12 16.88 1 15.5 1zm-4 21c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm4.5-4H7V4h9v14z" />
  </svg>
);

const ShareIcon = () => (
  <svg style={{ width: 18, height: 18, fill: "currentColor" }} viewBox="0 0 24 24">
    <path d="M16 5l-1.42 1.42-1.59-1.59V16h-1.98V4.83L9.42 6.42 8 5l4-4 4 4zm4 5v11c0 1.1-.9 2-2 2H6c-1.1 0-2-.9-2-2V10c0-1.11.9-2 2-2h3v2H6v11h12V10h-3V8h3c1.1 0 2 .89 2 2z" />
  </svg>
);

/* ═══════════════════════════════════
   AUTO-DOWNLOAD HANDLER (reads URL params)
   ═══════════════════════════════════ */
function AutoDownloadHandler({
  onAutoDownload,
}: {
  onAutoDownload: (url: string, format: string) => void;
}) {
  const searchParams = useSearchParams();
  const triggered = useRef(false);

  useEffect(() => {
    if (triggered.current) return;
    const videoUrl = searchParams.get("url");
    const format = searchParams.get("autoDownload");
    if (videoUrl && format) {
      triggered.current = true;
      // Clean the URL bar so a refresh doesn't re-trigger
      window.history.replaceState({}, "", "/");
      onAutoDownload(videoUrl, format);
    }
  }, [searchParams, onAutoDownload]);

  return null;
}

/* ═══════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════ */
export default function Home() {
  const { theme, toggleTheme } = useTheme();

  // URL / general
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState<VideoInfo | PlaylistInfo | null>(null);
  const [error, setError] = useState("");

  // Search
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  // Format modal (from search result click)
  const [selectedResult, setSelectedResult] = useState<SearchResult | null>(null);
  const [showFormatModal, setShowFormatModal] = useState(false);
  const [modalFormats, setModalFormats] = useState<Format[]>([]);
  const [modalFormatsLoading, setModalFormatsLoading] = useState(false);
  const [modalSelectedFormat, setModalSelectedFormat] = useState("mp3");

  // Playlist modal
  const [showPlaylistModal, setShowPlaylistModal] = useState(false);
  const [selectedTracks, setSelectedTracks] = useState<Set<string>>(new Set());

  // iOS Shortcut modal
  const [showShortcutModal, setShowShortcutModal] = useState(false);

  // Auto-download banner
  const [autoDownloadStatus, setAutoDownloadStatus] = useState<
    "idle" | "processing" | "done" | "error"
  >("idle");
  const [autoDownloadTitle, setAutoDownloadTitle] = useState("");
  const [playlistFormat, setPlaylistFormat] = useState("mp3");

  // Format picker details (single video from URL)
  const [formats, setFormats] = useState<Format[]>([]);
  const [formatsLoading, setFormatsLoading] = useState(false);
  const [selectedFormat, setSelectedFormat] = useState("mp3");

  // Download queue
  const [queue, setQueue] = useState<DownloadTask[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);

  /* ─── Keyboard shortcuts ─── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ctrl+K / Cmd+K → focus search
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
      // Escape → close modals
      if (e.key === "Escape") {
        if (showFormatModal) setShowFormatModal(false);
        if (showPlaylistModal) setShowPlaylistModal(false);
        if (showShortcutModal) setShowShortcutModal(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [showFormatModal, showPlaylistModal, showShortcutModal]);

  /* ─── Auto-dismiss status pill ─── */
  useEffect(() => {
    if (autoDownloadStatus === "done" || autoDownloadStatus === "error") {
      const timer = setTimeout(() => {
        setAutoDownloadStatus("idle");
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [autoDownloadStatus]);

  /* ─── Search handler ─── */
  const handleSearch = useCallback(async (query: string) => {
    const trimmed = query.trim();
    if (!trimmed) return;
    setSearchLoading(true);
    setSearchResults([]);
    setError("");
    setInfo(null);

    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Search failed");
      setSearchResults(data.results || []);
    } catch (e: any) {
      setError(e.message || "Search failed");
    } finally {
      setSearchLoading(false);
    }
  }, []);

  /* ─── Fetch video info (existing URL flow) ─── */
  const fetchInfo = useCallback(async (inputUrl: string) => {
    const trimmed = inputUrl.trim();
    if (!trimmed) return;
    setLoading(true);
    setError("");
    setInfo(null);
    setSearchResults([]);

    try {
      const res = await fetch("/api/info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setInfo(data);

      if (data.type === "playlist") {
        const all = new Set<string>(data.entries.map((e: any) => e.id));
        setSelectedTracks(all);
        setShowPlaylistModal(true);
      } else {
        // single video — load formats
        setFormatsLoading(true);
        const fRes = await fetch("/api/formats", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: trimmed }),
        });
        const fData = await fRes.json();
        setFormats(fData.formats || []);
        setSelectedFormat("mp3");
        setFormatsLoading(false);
      }
    } catch (e: any) {
      setError(e.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, []);

  /* ─── Handle paste ─── */
  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData("text");
    if (isYouTubeUrl(pasted)) {
      e.preventDefault();
      setUrl(pasted);
      fetchInfo(pasted);
    }
  };

  /* ─── Smart submit ─── */
  const handleSubmit = () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    if (isYouTubeUrl(trimmed)) {
      fetchInfo(trimmed);
    } else {
      handleSearch(trimmed);
    }
  };

  /* ─── Click search result → open format modal ─── */
  const openFormatModal = async (result: SearchResult) => {
    setSelectedResult(result);
    setShowFormatModal(true);
    setModalFormatsLoading(true);
    setModalSelectedFormat("mp3");

    try {
      const res = await fetch("/api/formats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: result.url }),
      });
      const data = await res.json();
      setModalFormats(data.formats || []);
    } catch {
      setModalFormats([
        { label: "MP3 (audio)", value: "mp3", ext: "mp3" },
        { label: "M4A (audio)", value: "m4a", ext: "m4a" },
      ]);
    } finally {
      setModalFormatsLoading(false);
    }
  };

  /* ─── Quick download (MP3 shortcut) ─── */
  const quickDownload = (result: SearchResult, e: React.MouseEvent) => {
    e.stopPropagation();
    startDownload({
      id: `${result.id}-${Date.now()}`,
      title: result.title,
      url: result.url,
      format: "mp3",
    });
  };

  /* ─── Download engine ─── */
  const startDownload = async (task: Omit<DownloadTask, "status">) => {
    const newTask: DownloadTask = { ...task, status: "downloading" };
    setQueue((q) => [...q, newTask]);

    try {
      // On mobile browsers the `download` attribute and blob downloads
      // may be blocked or ignored. Open direct GET URL in a new tab so
      // the browser handles the download natively.
      const isMobile = typeof navigator !== "undefined" && /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      if (isMobile) {
        const downloadUrl = `/api/download?url=${encodeURIComponent(task.url)}&format=${encodeURIComponent(task.format)}`;
        window.location.assign(downloadUrl);
        setQueue((q) => q.map((t) => (t.id === task.id ? { ...t, status: "done" } : t)));
        return;
      }

      const res = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: task.url, format: task.format }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Download failed");
      }

      const blob = await res.blob();
      const ext =
        task.format === "mp3"
          ? "mp3"
          : task.format === "m4a"
          ? "m4a"
          : task.format.split("-")[1] || "mp4";
      const fileName = `${task.title.replace(/[^a-z0-9]/gi, "_").slice(0, 60)}.${ext}`;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(a.href);

      setQueue((q) =>
        q.map((t) => (t.id === task.id ? { ...t, status: "done" } : t))
      );
    } catch (e: any) {
      setQueue((q) =>
        q.map((t) =>
          t.id === task.id ? { ...t, status: "error", error: e.message } : t
        )
      );
    }
  };

  /* ─── Confirm downloads ─── */
  const confirmVideoDownload = () => {
    if (!info || info.type !== "video") return;
    startDownload({
      id: `${info.id}-${Date.now()}`,
      title: info.title,
      url: info.url,
      format: selectedFormat,
    });
  };

  const confirmModalDownload = () => {
    if (!selectedResult) return;
    setShowFormatModal(false);
    startDownload({
      id: `${selectedResult.id}-${Date.now()}`,
      title: selectedResult.title,
      url: selectedResult.url,
      format: modalSelectedFormat,
    });
  };

  const confirmPlaylistDownload = () => {
    if (!info || info.type !== "playlist") return;
    setShowPlaylistModal(false);
    const toDownload = info.entries.filter((e) => selectedTracks.has(e.id));
    for (const entry of toDownload) {
      startDownload({
        id: `${entry.id}-${Date.now()}-${Math.random()}`,
        title: entry.title,
        url: entry.url,
        format: playlistFormat,
      });
    }
  };

  /* ─── Playlist helpers ─── */
  const toggleTrack = (id: string) => {
    setSelectedTracks((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (!info || info.type !== "playlist") return;
    if (selectedTracks.size === info.entries.length) setSelectedTracks(new Set());
    else setSelectedTracks(new Set(info.entries.map((e) => e.id)));
  };

  /* ─── Reset to home ─── */
  const resetAll = () => {
    setUrl("");
    setInfo(null);
    setError("");
    setSearchResults([]);
  };

  /* ─── Auto-download handler (called by AutoDownloadHandler) ─── */
  const handleAutoDownload = useCallback(
    async (videoUrl: string, format: string) => {
      setAutoDownloadStatus("processing");
      try {
        // Fetch video info to get the title
        const infoRes = await fetch("/api/info", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: videoUrl }),
        });
        const infoData = await infoRes.json();
        if (!infoRes.ok) throw new Error(infoData.error || "Failed to get video info");

        const title =
          infoData.type === "video" ? infoData.title : "YouTube Video";
        setAutoDownloadTitle(title);

        // Start the download
        const taskId = `auto-${Date.now()}`;
        const newTask: DownloadTask = {
          id: taskId,
          title,
          url: videoUrl,
          format,
          status: "downloading",
        };
        setQueue((q) => [...q, newTask]);

        // On mobile, open direct download URL so the browser handles saving.
        const isMobile = typeof navigator !== "undefined" && /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
        if (isMobile) {
          const downloadUrl = `/api/download?url=${encodeURIComponent(videoUrl)}&format=${encodeURIComponent(format)}`;
          window.location.assign(downloadUrl);
        } else {
          const dlRes = await fetch("/api/download", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: videoUrl, format }),
          });

          if (!dlRes.ok) {
            const err = await dlRes.json();
            throw new Error(err.error || "Download failed");
          }

          const blob = await dlRes.blob();
          const ext =
            format === "mp3" ? "mp3" : format === "m4a" ? "m4a" : format.split("-")[1] || "mp4";
          const fileName = `${title.replace(/[^a-z0-9]/gi, "_").slice(0, 60)}.${ext}`;
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = fileName;
          a.click();
          URL.revokeObjectURL(a.href);
        }

        setQueue((q) =>
          q.map((t) => (t.id === taskId ? { ...t, status: "done" } : t))
        );
        setAutoDownloadStatus("done");
      } catch (e: any) {
        setAutoDownloadStatus("error");
        setError(e.message || "Auto-download failed");
      }
    },
    []
  );

  /* ─── Get the app's base URL for the Shortcut ─── */
  const getAppUrl = () => {
    if (typeof window !== "undefined") {
      return window.location.origin;
    }
    return "https://your-app-url.vercel.app";
  };

  /* ═══════════════════════════════════
     RENDER
     ═══════════════════════════════════ */
  return (
    <main className={styles.main}>
      {/* ── AUTO-DOWNLOAD HANDLER (reads search params via Suspense) ── */}
      <Suspense fallback={null}>
        <AutoDownloadHandler onAutoDownload={handleAutoDownload} />
      </Suspense>

      {/* ── DYNAMIC ISLAND-STYLE STATUS PILL ── */}
      {autoDownloadStatus !== "idle" && (
        <div
          className={`${styles.dynamicIsland} ${
            autoDownloadStatus === "processing"
              ? styles.dynamicIslandExpanded
              : autoDownloadStatus === "done"
              ? styles.dynamicIslandDone
              : styles.dynamicIslandError
          }`}
        >
          <div className={styles.dynamicIslandContent}>
            {autoDownloadStatus === "processing" && (
              <>
                <div className={styles.dynamicIslandEqualizer}>
                  <span /><span /><span /><span />
                </div>
                <div className={styles.dynamicIslandText}>
                  <span className={styles.dynamicIslandLabel}>Downloading</span>
                  <span className={styles.dynamicIslandTitle}>
                    {autoDownloadTitle || "video"}
                  </span>
                </div>
                <div className={styles.dynamicIslandWave}>
                  <svg viewBox="0 0 24 24">
                    <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
                  </svg>
                </div>
              </>
            )}
            {autoDownloadStatus === "done" && (
              <>
                <div className={styles.dynamicIslandCheck}>
                  <svg viewBox="0 0 24 24">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                  </svg>
                </div>
                <span className={styles.dynamicIslandDoneText}>
                  Downloaded!
                </span>
              </>
            )}
            {autoDownloadStatus === "error" && (
              <>
                <div className={styles.dynamicIslandErrorIcon}>!</div>
                <span className={styles.dynamicIslandDoneText}>
                  Failed
                </span>
              </>
            )}
          </div>
          {autoDownloadStatus === "processing" && (
            <div className={styles.dynamicIslandProgress} />
          )}
        </div>
      )}

      {/* ── AMBIENT GLOW (casts light from top like Dynamic Island) ── */}
      <div className={styles.ambientGlow} />

      {/* ── HEADER ── */}
      <header className={styles.header}>
        <div className={styles.headerRow}>
          <div className={styles.logo} onClick={resetAll}>
            <div className={styles.logoMark} />
            <span className={styles.logoText}>
              YouTube<span className={styles.logoTextSub}>toMP3</span>
            </span>
          </div>

          <button
            className={styles.themeToggle}
            onClick={toggleTheme}
            aria-label="Toggle theme"
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            {theme === "dark" ? <SunIcon /> : <MoonIcon />}
          </button>
        </div>
        <p className={styles.tagline}>
          Search for videos, paste a link, and download in any format.
        </p>
      </header>

      {/* ── SMART SEARCH BAR ── */}
      <section className={styles.inputSection}>
        <div className={styles.inputContainer}>
          <input
            ref={inputRef}
            className={styles.urlInput}
            type="text"
            placeholder="Search videos, artists, or paste a YouTube URL..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onPaste={handlePaste}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            spellCheck={false}
            id="search-input"
          />
          <button
            className={styles.fetchBtn}
            onClick={handleSubmit}
            disabled={loading || searchLoading || !url.trim()}
            id="search-button"
          >
            {loading || searchLoading ? (
              <span className={styles.spinner} />
            ) : (
              <SearchIcon />
            )}
          </button>
        </div>
        {error && (
          <p className={styles.errorMsg}>
            <ErrorIcon />
            {error}
          </p>
        )}
        <p className={styles.hint}>
          Search by song name, artist, or keyword · Auto-detects YouTube URLs &amp; playlists
          <span className={styles.kbdHint}>
            <kbd className={styles.kbd}>Ctrl</kbd>
            <kbd className={styles.kbd}>K</kbd>
          </span>
        </p>
      </section>

      {/* ── SKELETON LOADING ── */}
      {searchLoading && (
        <div className={styles.skeletonGrid}>
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className={styles.skeletonCard}>
              <div className={styles.skeletonThumb} />
              <div className={styles.skeletonBody}>
                <div className={styles.skeletonLine} />
                <div className={styles.skeletonLineShort} />
                <div className={styles.skeletonLineTiny} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── SEARCH RESULTS ── */}
      {searchResults.length > 0 && !searchLoading && (
        <div className={styles.searchResults}>
          {searchResults.map((result) => (
            <div
              key={result.id}
              className={styles.resultCard}
              onClick={() => openFormatModal(result)}
              id={`result-${result.id}`}
            >
              <div className={styles.resultThumbnailWrapper}>
                <img
                  src={result.thumbnail}
                  alt={result.title}
                  className={styles.resultThumbnail}
                  loading="lazy"
                />
                {result.duration && (
                  <span className={styles.resultDuration}>{result.duration}</span>
                )}
                <button
                  className={styles.quickDownload}
                  onClick={(e) => quickDownload(result, e)}
                  title="Quick download as MP3"
                >
                  <BoltIcon />
                  MP3
                </button>
              </div>
              <div className={styles.resultInfo}>
                <h3 className={styles.resultTitle}>{result.title}</h3>
                <p className={styles.resultChannel}>{result.channel}</p>
                <p className={styles.resultMeta}>
                  {result.viewCount && (
                    <>
                      <span>{result.viewCount}</span>
                      <span className={styles.resultMetaDot}>•</span>
                    </>
                  )}
                  <span>{result.publishedAt}</span>
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── NO RESULTS ── */}
      {!searchLoading &&
        searchResults.length === 0 &&
        url.trim() &&
        !isYouTubeUrl(url) &&
        !loading &&
        !info &&
        !error && null}

      {/* ── SINGLE VIDEO CARD (from URL) ── */}
      {info && info.type === "video" && (
        <div className={styles.videoCard}>
          <div className={styles.thumbnailWrapper}>
            {info.thumbnail && (
              <img
                src={info.thumbnail}
                alt=""
                className={styles.videoThumbnail}
              />
            )}
            <span className={styles.durationBadge}>
              {formatDuration(info.duration)}
            </span>
          </div>

          <div className={styles.videoInfo}>
            <div>
              <h2 className={styles.videoTitle}>{info.title}</h2>
              <p className={styles.videoUploader}>{info.uploader}</p>
            </div>

            <div>
              <div className={styles.formatLabel}>Choose format:</div>
              {formatsLoading ? (
                <div className={styles.formatsLoading}>
                  <span className={styles.spinner} /> loading formats…
                </div>
              ) : (
                <div className={styles.formatGrid}>
                  {formats.map((f) => (
                    <button
                      key={f.value}
                      className={`${styles.formatCard} ${
                        selectedFormat === f.value ? styles.formatCardActive : ""
                      }`}
                      onClick={() => setSelectedFormat(f.value)}
                    >
                      <span className={styles.formatCardExt}>{f.ext}</span>
                      <span className={styles.formatCardLabel}>{f.label}</span>
                    </button>
                  ))}
                </div>
              )}

              <div className={styles.cardFooter}>
                <button
                  className={styles.cancelBtn}
                  onClick={() => setInfo(null)}
                >
                  Clear
                </button>
                <button
                  className={styles.downloadBtn}
                  onClick={confirmVideoDownload}
                  disabled={formatsLoading || !selectedFormat}
                >
                  <DownloadIcon />
                  Download
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── DOWNLOAD QUEUE ── */}
      {queue.length > 0 && (
        <section className={styles.queueSection}>
          <h2 className={styles.sectionTitle}>Downloads</h2>
          <div className={styles.queueList}>
            {queue.map((task) => (
              <div
                key={task.id}
                className={`${styles.queueItem} ${styles[task.status]}`}
              >
                <div className={styles.queueItemTop}>
                  <div className={styles.queueLeft}>
                    <span className={styles.queueStatus}>
                      {task.status === "downloading" && (
                        <span className={styles.spinner} />
                      )}
                      {task.status === "done" && (
                        <svg
                          className={`${styles.queueStatusIcon} ${styles.statusDone}`}
                          viewBox="0 0 24 24"
                        >
                          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                        </svg>
                      )}
                      {task.status === "error" && (
                        <svg
                          className={`${styles.queueStatusIcon} ${styles.statusError}`}
                          viewBox="0 0 24 24"
                        >
                          <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                        </svg>
                      )}
                      {task.status === "pending" && (
                        <svg
                          className={`${styles.queueStatusIcon} ${styles.statusPending}`}
                          viewBox="0 0 24 24"
                        >
                          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 14H11V12H13V16zm0-5H11V7H13V11z" />
                        </svg>
                      )}
                    </span>
                    <span className={styles.queueTitle} title={task.title}>
                      {task.title}
                    </span>
                  </div>
                  <div className={styles.queueRight}>
                    <span className={styles.queueFormat}>{task.format}</span>
                    {task.error && (
                      <span className={styles.queueError}>{task.error}</span>
                    )}
                  </div>
                </div>

                {/* Progress Bar */}
                <div className={styles.progressBarWrapper}>
                  {task.status === "downloading" && (
                    <div className={styles.progressIndeterminate} />
                  )}
                  {task.status === "done" && (
                    <div
                      className={`${styles.progressBar} ${styles.progressBarDone}`}
                    />
                  )}
                  {task.status === "error" && (
                    <div
                      className={`${styles.progressBar} ${styles.progressBarError}`}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── FORMAT SELECTION MODAL (from search) ── */}
      {showFormatModal && selectedResult && (
        <div
          className={styles.formatModalOverlay}
          onClick={() => setShowFormatModal(false)}
        >
          <div
            className={styles.formatModal}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.formatModalHeader}>
              <h2 className={styles.formatModalTitle}>Download</h2>
              <button
                className={styles.formatModalClose}
                onClick={() => setShowFormatModal(false)}
              >
                <CloseIcon />
              </button>
            </div>

            <div className={styles.formatModalVideo}>
              <div className={styles.formatModalThumb}>
                <img
                  src={selectedResult.thumbnail}
                  alt={selectedResult.title}
                />
              </div>
              <div className={styles.formatModalVideoInfo}>
                <h3 className={styles.formatModalVideoTitle}>
                  {selectedResult.title}
                </h3>
                <p className={styles.formatModalVideoChannel}>
                  {selectedResult.channel}
                </p>
                <p className={styles.formatModalVideoMeta}>
                  {selectedResult.duration}
                  {selectedResult.viewCount &&
                    ` · ${selectedResult.viewCount}`}
                </p>
              </div>
            </div>

            <div className={styles.formatModalBody}>
              <div className={styles.formatLabel}>Choose format:</div>
              {modalFormatsLoading ? (
                <div className={styles.formatsLoading}>
                  <span className={styles.spinner} /> loading formats…
                </div>
              ) : (
                <div className={styles.formatGrid}>
                  {modalFormats.map((f) => (
                    <button
                      key={f.value}
                      className={`${styles.formatCard} ${
                        modalSelectedFormat === f.value
                          ? styles.formatCardActive
                          : ""
                      }`}
                      onClick={() => setModalSelectedFormat(f.value)}
                    >
                      <span className={styles.formatCardExt}>{f.ext}</span>
                      <span className={styles.formatCardLabel}>{f.label}</span>
                    </button>
                  ))}
                </div>
              )}

              <div className={styles.formatModalFooter}>
                <button
                  className={styles.cancelBtn}
                  onClick={() => setShowFormatModal(false)}
                >
                  Cancel
                </button>
                <button
                  className={styles.downloadBtn}
                  onClick={confirmModalDownload}
                  disabled={modalFormatsLoading || !modalSelectedFormat}
                >
                  <DownloadIcon />
                  Download
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── PLAYLIST MODAL ── */}
      {showPlaylistModal && info?.type === "playlist" && (
        <div
          className={styles.overlay}
          onClick={() => setShowPlaylistModal(false)}
        >
          <div
            className={styles.playlistModal}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Left Sidebar */}
            <div className={styles.playlistSidebar}>
              <div className={styles.playlistSidebarTop}>
                <div
                  style={{
                    width: "100%",
                    aspectRatio: "16/9",
                    background: "rgba(255, 255, 255, 0.05)",
                    border: "1px solid var(--yt-border)",
                    borderRadius: "8px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--yt-red)",
                  }}
                >
                  <PlaylistIcon />
                </div>
                <h2 className={styles.playlistSidebarTitle}>{info.title}</h2>
                <p className={styles.playlistSidebarMeta}>{info.uploader}</p>
                <div>
                  <span className={styles.playlistSidebarCount}>
                    {info.count} videos
                  </span>
                </div>
              </div>

              <div
                style={{
                  marginTop: "auto",
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                }}
              >
                <button
                  className={styles.downloadBtn}
                  onClick={confirmPlaylistDownload}
                  disabled={selectedTracks.size === 0}
                  style={{ width: "100%", justifyContent: "center" }}
                >
                  <DownloadIcon />
                  Download Selected
                </button>
                <button
                  className={styles.cancelBtn}
                  onClick={() => setShowPlaylistModal(false)}
                  style={{ width: "100%" }}
                >
                  Close
                </button>
              </div>
            </div>

            {/* Right Pane */}
            <div className={styles.playlistContent}>
              <div className={styles.modalHeader}>
                <h2 className={styles.modalTitle}>Select Tracks</h2>
                <button
                  className={styles.closeBtn}
                  onClick={() => setShowPlaylistModal(false)}
                >
                  <svg className={styles.closeIcon} viewBox="0 0 24 24">
                    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                  </svg>
                </button>
              </div>

              <div className={styles.playlistFormatRow}>
                <span
                  className={styles.formatLabel}
                  style={{ marginBottom: 0 }}
                >
                  Audio Format:
                </span>
                <div className={styles.formatPills}>
                  {["mp3", "m4a"].map((f) => (
                    <button
                      key={f}
                      className={`${styles.pill} ${
                        playlistFormat === f ? styles.pillActive : ""
                      }`}
                      onClick={() => setPlaylistFormat(f)}
                    >
                      {f.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.trackListHeader}>
                <button className={styles.selectAll} onClick={toggleAll}>
                  {selectedTracks.size === info.entries.length
                    ? "Deselect all"
                    : "Select all"}
                </button>
                <span className={styles.selectedCount}>
                  {selectedTracks.size} / {info.entries.length} selected
                </span>
              </div>

              <div className={styles.trackList}>
                {info.entries.map((entry, i) => (
                  <div
                    key={entry.id}
                    className={`${styles.trackItem} ${
                      selectedTracks.has(entry.id) ? styles.trackSelected : ""
                    }`}
                    onClick={() => toggleTrack(entry.id)}
                  >
                    <span className={styles.trackNum}>{i + 1}</span>
                    <span className={styles.trackTitle} title={entry.title}>
                      {entry.title}
                    </span>
                    <span className={styles.trackDur}>
                      {formatDuration(entry.duration)}
                    </span>
                    <div className={styles.trackCheck}>
                      <input
                        type="checkbox"
                        className={styles.trackCheckbox}
                        checked={selectedTracks.has(entry.id)}
                        readOnly
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── iOS SHORTCUT SETUP MODAL ── */}
      {showShortcutModal && (
        <div
          className={styles.formatModalOverlay}
          onClick={() => setShowShortcutModal(false)}
        >
          <div
            className={styles.shortcutModal}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.shortcutModalHeader}>
              <div className={styles.shortcutModalHeaderLeft}>
                <div className={styles.shortcutModalIcon}>
                  <ShareIcon />
                </div>
                <div>
                  <h2 className={styles.shortcutModalTitle}>
                    Download from iPhone Share
                  </h2>
                  <p className={styles.shortcutModalSubtitle}>
                    One-time setup · Takes 30 seconds
                  </p>
                </div>
              </div>
              <button
                className={styles.formatModalClose}
                onClick={() => setShowShortcutModal(false)}
              >
                <CloseIcon />
              </button>
            </div>

            <div className={styles.shortcutModalBody}>
              <div className={styles.shortcutSteps}>
                <div className={styles.shortcutStep}>
                  <div className={styles.shortcutStepNum}>1</div>
                  <div className={styles.shortcutStepContent}>
                    <h4>Open the Shortcuts app</h4>
                    <p>It comes pre-installed on your iPhone. Search for &quot;Shortcuts&quot; if you can&apos;t find it.</p>
                  </div>
                </div>

                <div className={styles.shortcutStep}>
                  <div className={styles.shortcutStepNum}>2</div>
                  <div className={styles.shortcutStepContent}>
                    <h4>Create a new Shortcut</h4>
                    <p>Tap the <strong>+</strong> button in the top right corner.</p>
                  </div>
                </div>

                <div className={styles.shortcutStep}>
                  <div className={styles.shortcutStepNum}>3</div>
                  <div className={styles.shortcutStepContent}>
                    <h4>Add an &quot;Open URLs&quot; action</h4>
                    <p>Search for &quot;Open URLs&quot; in the actions list and add it. Set the URL to:</p>
                    <div className={styles.shortcutCodeBlock}>
                      <code>{getAppUrl()}/?url=<span className={styles.shortcutCodeHighlight}>[Shortcut Input]</span>&autoDownload=mp3</code>
                    </div>
                    <p className={styles.shortcutNote}>
                      💡 Use the <strong>&quot;Shortcut Input&quot;</strong> magic variable for the URL part. This automatically inserts the YouTube link you share.
                    </p>
                  </div>
                </div>

                <div className={styles.shortcutStep}>
                  <div className={styles.shortcutStepNum}>4</div>
                  <div className={styles.shortcutStepContent}>
                    <h4>Enable &quot;Show in Share Sheet&quot;</h4>
                    <p>
                      Tap the <strong>ⓘ</strong> icon at the bottom → turn on <strong>&quot;Show in Share Sheet&quot;</strong>.
                      Under &quot;Share Sheet Types&quot;, select <strong>URLs</strong>.
                    </p>
                  </div>
                </div>

                <div className={styles.shortcutStep}>
                  <div className={styles.shortcutStepNum}>5</div>
                  <div className={styles.shortcutStepContent}>
                    <h4>Name it &amp; save</h4>
                    <p>Name it something like <strong>&quot;Download MP3&quot;</strong> and tap <strong>Done</strong>.</p>
                  </div>
                </div>
              </div>

              <div className={styles.shortcutDivider} />

              <div className={styles.shortcutHowTo}>
                <h3 className={styles.shortcutHowToTitle}>How to use</h3>
                <div className={styles.shortcutHowToSteps}>
                  <div className={styles.shortcutHowToStep}>
                    <span className={styles.shortcutHowToEmoji}>📺</span>
                    <span>Open any YouTube video</span>
                  </div>
                  <div className={styles.shortcutHowToArrow}>→</div>
                  <div className={styles.shortcutHowToStep}>
                    <span className={styles.shortcutHowToEmoji}>📤</span>
                    <span>Tap Share</span>
                  </div>
                  <div className={styles.shortcutHowToArrow}>→</div>
                  <div className={styles.shortcutHowToStep}>
                    <span className={styles.shortcutHowToEmoji}>⚡</span>
                    <span>Tap &quot;Download MP3&quot;</span>
                  </div>
                  <div className={styles.shortcutHowToArrow}>→</div>
                  <div className={styles.shortcutHowToStep}>
                    <span className={styles.shortcutHowToEmoji}>🎵</span>
                    <span>MP3 downloads!</span>
                  </div>
                </div>
              </div>
            </div>

            <div className={styles.shortcutModalFooter}>
              <button
                className={styles.cancelBtn}
                onClick={() => setShowShortcutModal(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── FOOTER ── */}
      <footer className={styles.footer}>
        <button
          className={styles.iosShortcutBtn}
          onClick={() => setShowShortcutModal(true)}
          id="ios-shortcut-btn"
        >
          <IPhoneIcon />
          <span>Download from iPhone</span>
        </button>
        <div className={styles.footerShortcuts}>
          <span className={styles.footerShortcut}>
            <kbd className={styles.kbd}>Ctrl</kbd>+<kbd className={styles.kbd}>K</kbd> Search
          </span>
          <span className={styles.footerShortcut}>
            <kbd className={styles.kbd}>Esc</kbd> Close
          </span>
          <span className={styles.footerShortcut}>
            <kbd className={styles.kbd}>Enter</kbd> Submit
          </span>
        </div>
        <span>YouTubetoMP3 — Free YouTube Downloader</span>
      </footer>
    </main>
  );
}
