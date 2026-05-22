import type { Metadata } from "next";
import "./globals.css";
import ThemeProvider from "./components/ThemeProvider";

export const metadata: Metadata = {
  title: "YTDL — YouTube Downloader",
  description: "Search, download YouTube videos and playlists as MP3, M4A, or MP4. Fast, free, and premium.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
