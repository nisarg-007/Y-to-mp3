"use client";

import { useState, useRef, useCallback } from "react";
import styles from "./page.module.css";

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

function formatDuration(s: number) {
  if (!s) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export default function Home() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState<VideoInfo | PlaylistInfo | null>(null);
  const [error, setError] = useState("");

  // Playlist modal
  const [showPlaylistModal, setShowPlaylistModal] = useState(false);
  const [selectedTracks, setSelectedTracks] = useState<Set<string>>(new Set());
  const [playlistFormat, setPlaylistFormat] = useState("mp3");

  // Format picker details (single video)
  const [formats, setFormats] = useState<Format[]>([]);
  const [formatsLoading, setFormatsLoading] = useState(false);
  const [selectedFormat, setSelectedFormat] = useState("mp3");

  // Download queue
  const [queue, setQueue] = useState<DownloadTask[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);

  const fetchInfo = useCallback(async (inputUrl: string) => {
    const trimmed = inputUrl.trim();
    if (!trimmed) return;
    setLoading(true);
    setError("");
    setInfo(null);

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

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData("text");
    if (pasted.includes("youtube.com") || pasted.includes("youtu.be")) {
      e.preventDefault();
      setUrl(pasted);
      fetchInfo(pasted);
    }
  };

  const handleSubmit = () => fetchInfo(url);

  // Download a single video
  const startDownload = async (task: Omit<DownloadTask, "status">) => {
    const newTask: DownloadTask = { ...task, status: "downloading" };
    setQueue((q) => [...q, newTask]);

    try {
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
      const ext = task.format === "mp3" ? "mp3" : task.format === "m4a" ? "m4a" : task.format.split("-")[1] || "mp4";
      const fileName = `${task.title.replace(/[^a-z0-9]/gi, "_").slice(0, 60)}.${ext}`;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(a.href);

      setQueue((q) => q.map((t) => (t.id === task.id ? { ...t, status: "done" } : t)));
    } catch (e: any) {
      setQueue((q) => q.map((t) => (t.id === task.id ? { ...t, status: "error", error: e.message } : t)));
    }
  };

  // Confirm single video download
  const confirmVideoDownload = () => {
    if (!info || info.type !== "video") return;
    startDownload({
      id: `${info.id}-${Date.now()}`,
      title: info.title,
      url: info.url,
      format: selectedFormat,
    });
  };

  // Confirm playlist download
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

  return (
    <main className={styles.main}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.logo} onClick={() => { setUrl(""); setInfo(null); setError(""); }}>
          <div className={styles.logoMark} />
          <span className={styles.logoText}>
            YouTube<span className={styles.logoTextSub}>toMP3</span>
          </span>
        </div>
        <p className={styles.tagline}>Paste a YouTube link. Get your audio or video file instantly.</p>
      </header>

      {/* Input / Search Bar */}
      <section className={styles.inputSection}>
        <div className={styles.inputContainer}>
          <input
            ref={inputRef}
            className={styles.urlInput}
            type="text"
            placeholder="Paste YouTube URL here..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onPaste={handlePaste}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            spellCheck={false}
          />
          <button
            className={styles.fetchBtn}
            onClick={handleSubmit}
            disabled={loading || !url.trim()}
          >
            {loading ? (
              <span className={styles.spinner} />
            ) : (
              <svg className={styles.fetchIcon} viewBox="0 0 24 24">
                <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
              </svg>
            )}
          </button>
        </div>
        {error && (
          <p className={styles.errorMsg}>
            <svg style={{ width: 16, height: 16, fill: "currentColor", marginRight: 6 }} viewBox="0 0 24 24">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
            </svg>
            {error}
          </p>
        )}
        <p className={styles.hint}>
          Auto-detects playlists · Supports youtube.com & youtu.be
        </p>
      </section>

      {/* Single Video Card Details */}
      {info && info.type === "video" && (
        <div className={styles.videoCard}>
          <div className={styles.thumbnailWrapper}>
            {info.thumbnail && (
              <img src={info.thumbnail} alt="" className={styles.videoThumbnail} />
            )}
            <span className={styles.durationBadge}>{formatDuration(info.duration)}</span>
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
                      className={`${styles.formatCard} ${selectedFormat === f.value ? styles.formatCardActive : ""}`}
                      onClick={() => setSelectedFormat(f.value)}
                    >
                      <span className={styles.formatCardExt}>{f.ext}</span>
                      <span className={styles.formatCardLabel}>{f.label}</span>
                    </button>
                  ))}
                </div>
              )}

              <div className={styles.cardFooter}>
                <button className={styles.cancelBtn} onClick={() => setInfo(null)}>
                  Clear
                </button>
                <button
                  className={styles.downloadBtn}
                  onClick={confirmVideoDownload}
                  disabled={formatsLoading || !selectedFormat}
                >
                  <svg style={{ width: 18, height: 18, fill: "currentColor" }} viewBox="0 0 24 24">
                    <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM17 13l-5 5-5-5h3V9h4v4h3z" />
                  </svg>
                  Download
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Queue */}
      {queue.length > 0 && (
        <section className={styles.queueSection}>
          <h2 className={styles.sectionTitle}>
            Downloads
          </h2>
          <div className={styles.queueList}>
            {queue.map((task) => (
              <div key={task.id} className={`${styles.queueItem} ${styles[task.status]}`}>
                <div className={styles.queueLeft}>
                  <span className={styles.queueStatus}>
                    {task.status === "downloading" && <span className={styles.spinner} />}
                    {task.status === "done" && (
                      <svg className={`${styles.queueStatusIcon} ${styles.statusDone}`} viewBox="0 0 24 24">
                        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                      </svg>
                    )}
                    {task.status === "error" && (
                      <svg className={`${styles.queueStatusIcon} ${styles.statusError}`} viewBox="0 0 24 24">
                        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                      </svg>
                    )}
                    {task.status === "pending" && (
                      <svg className={`${styles.queueStatusIcon} ${styles.statusPending}`} viewBox="0 0 24 24">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 14H11V12H13V16zm0-5H11V7H13V11z" />
                      </svg>
                    )}
                  </span>
                  <span className={styles.queueTitle} title={task.title}>{task.title}</span>
                </div>
                <div className={styles.queueRight}>
                  <span className={styles.queueFormat}>{task.format}</span>
                  {task.error && <span className={styles.queueError}>{task.error}</span>}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Playlist Modal */}
      {showPlaylistModal && info?.type === "playlist" && (
        <div className={styles.overlay} onClick={() => setShowPlaylistModal(false)}>
          <div className={styles.playlistModal} onClick={(e) => e.stopPropagation()}>
            {/* Left Sidebar: Playlist cover/actions */}
            <div className={styles.playlistSidebar}>
              <div className={styles.playlistSidebarTop}>
                <div style={{
                  width: "100%",
                  aspectRatio: "16/9",
                  background: "rgba(255, 255, 255, 0.05)",
                  border: "1px solid var(--yt-border)",
                  borderRadius: "8px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--yt-red)",
                }}>
                  <svg style={{ width: 44, height: 44, fill: "currentColor" }} viewBox="0 0 24 24">
                    <path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0-2-.9-2-2V4c0-1.1-.9-2-2-2zm0 14H8V4h12v12z" />
                  </svg>
                </div>
                <h2 className={styles.playlistSidebarTitle}>{info.title}</h2>
                <p className={styles.playlistSidebarMeta}>{info.uploader}</p>
                <div>
                  <span className={styles.playlistSidebarCount}>{info.count} videos</span>
                </div>
              </div>

              <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: "10px" }}>
                <button
                  className={styles.downloadBtn}
                  onClick={confirmPlaylistDownload}
                  disabled={selectedTracks.size === 0}
                  style={{ width: "100%", justifyContent: "center" }}
                >
                  <svg style={{ width: 18, height: 18, fill: "currentColor" }} viewBox="0 0 24 24">
                    <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM17 13l-5 5-5-5h3V9h4v4h3z" />
                  </svg>
                  Download Selected
                </button>
                <button className={styles.cancelBtn} onClick={() => setShowPlaylistModal(false)} style={{ width: "100%" }}>
                  Close
                </button>
              </div>
            </div>

            {/* Right Pane: Scrollable Tracklist */}
            <div className={styles.playlistContent}>
              <div className={styles.modalHeader}>
                <h2 className={styles.modalTitle}>Select Tracks</h2>
                <button className={styles.closeBtn} onClick={() => setShowPlaylistModal(false)}>
                  <svg className={styles.closeIcon} viewBox="0 0 24 24">
                    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                  </svg>
                </button>
              </div>

              <div className={styles.playlistFormatRow}>
                <span className={styles.formatLabel} style={{ marginBottom: 0 }}>Audio Format:</span>
                <div className={styles.formatPills}>
                  {["mp3", "m4a"].map((f) => (
                    <button
                      key={f}
                      className={`${styles.pill} ${playlistFormat === f ? styles.pillActive : ""}`}
                      onClick={() => setPlaylistFormat(f)}
                    >
                      {f.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.trackListHeader}>
                <button className={styles.selectAll} onClick={toggleAll}>
                  {selectedTracks.size === info.entries.length ? "Deselect all" : "Select all"}
                </button>
                <span className={styles.selectedCount}>{selectedTracks.size} / {info.entries.length} selected</span>
              </div>

              <div className={styles.trackList}>
                {info.entries.map((entry, i) => (
                  <div
                    key={entry.id}
                    className={`${styles.trackItem} ${selectedTracks.has(entry.id) ? styles.trackSelected : ""}`}
                    onClick={() => toggleTrack(entry.id)}
                  >
                    <span className={styles.trackNum}>{i + 1}</span>
                    <span className={styles.trackTitle} title={entry.title}>{entry.title}</span>
                    <span className={styles.trackDur}>{formatDuration(entry.duration)}</span>
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
    </main>
  );
}
