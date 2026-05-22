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
  if (!s) return "—";
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

  // Format picker modal (single video)
  const [showFormatModal, setShowFormatModal] = useState(false);
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
        setShowFormatModal(true);
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
    setShowFormatModal(false);
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
        <div className={styles.logo}>
          <span className={styles.logoMark}>▶</span>
          <span className={styles.logoText}>YTDL</span>
        </div>
        <p className={styles.tagline}>paste a youtube link. get your file.</p>
      </header>

      {/* Input */}
      <section className={styles.inputSection}>
        <div className={styles.inputWrapper}>
          <span className={styles.inputPrefix}>$</span>
          <input
            ref={inputRef}
            className={styles.urlInput}
            type="text"
            placeholder="paste youtube URL here..."
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
            {loading ? <span className={styles.spinner} /> : "FETCH"}
          </button>
        </div>
        {error && <p className={styles.errorMsg}>⚠ {error}</p>}
        <p className={styles.hint}>
          auto-detects playlist · supports youtube.com & youtu.be
        </p>
      </section>

      {/* Queue */}
      {queue.length > 0 && (
        <section className={styles.queueSection}>
          <h2 className={styles.sectionTitle}>
            <span className={styles.titleDot} />
            Downloads
          </h2>
          <div className={styles.queueList}>
            {queue.map((task) => (
              <div key={task.id} className={`${styles.queueItem} ${styles[task.status]}`}>
                <div className={styles.queueLeft}>
                  <span className={styles.queueStatus}>
                    {task.status === "downloading" && <span className={styles.spinner} />}
                    {task.status === "done" && "✓"}
                    {task.status === "error" && "✗"}
                    {task.status === "pending" && "·"}
                  </span>
                  <span className={styles.queueTitle}>{task.title}</span>
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
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <h2 className={styles.modalTitle}>{info.title}</h2>
                <p className={styles.modalMeta}>{info.uploader} · {info.count} tracks</p>
              </div>
              <button className={styles.closeBtn} onClick={() => setShowPlaylistModal(false)}>✕</button>
            </div>

            <div className={styles.modalFormatRow}>
              <span className={styles.formatLabel}>Format:</span>
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
                {selectedTracks.size === info.entries.length ? "deselect all" : "select all"}
              </button>
              <span className={styles.selectedCount}>{selectedTracks.size} selected</span>
            </div>

            <div className={styles.trackList}>
              {info.entries.map((entry, i) => (
                <div
                  key={entry.id}
                  className={`${styles.trackItem} ${selectedTracks.has(entry.id) ? styles.trackSelected : ""}`}
                  onClick={() => toggleTrack(entry.id)}
                >
                  <span className={styles.trackNum}>{String(i + 1).padStart(2, "0")}</span>
                  <span className={styles.trackTitle}>{entry.title}</span>
                  <span className={styles.trackDur}>{formatDuration(entry.duration)}</span>
                  <span className={styles.trackCheck}>{selectedTracks.has(entry.id) ? "☑" : "☐"}</span>
                </div>
              ))}
            </div>

            <div className={styles.modalFooter}>
              <button className={styles.cancelBtn} onClick={() => setShowPlaylistModal(false)}>
                Cancel
              </button>
              <button
                className={styles.downloadBtn}
                onClick={confirmPlaylistDownload}
                disabled={selectedTracks.size === 0}
              >
                Download {selectedTracks.size} track{selectedTracks.size !== 1 ? "s" : ""}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Format Picker Modal (single video) */}
      {showFormatModal && info?.type === "video" && (
        <div className={styles.overlay} onClick={() => setShowFormatModal(false)}>
          <div className={`${styles.modal} ${styles.modalSmall}`} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <h2 className={styles.modalTitle}>{info.title}</h2>
                <p className={styles.modalMeta}>{info.uploader} · {formatDuration(info.duration)}</p>
              </div>
              <button className={styles.closeBtn} onClick={() => setShowFormatModal(false)}>✕</button>
            </div>

            {info.thumbnail && (
              <img src={info.thumbnail} alt="" className={styles.thumb} />
            )}

            <div className={styles.formatLabel} style={{ marginBottom: 8 }}>Choose format:</div>

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

            <div className={styles.modalFooter}>
              <button className={styles.cancelBtn} onClick={() => setShowFormatModal(false)}>Cancel</button>
              <button
                className={styles.downloadBtn}
                onClick={confirmVideoDownload}
                disabled={formatsLoading || !selectedFormat}
              >
                Download
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
