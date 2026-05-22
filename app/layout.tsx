import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "YTDL — YouTube Downloader",
  description: "Download YouTube videos and playlists as MP3 or video",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
