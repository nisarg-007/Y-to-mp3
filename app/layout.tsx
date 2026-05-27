import type { Metadata, Viewport } from "next";
import "./globals.css";
import ThemeProvider from "./components/ThemeProvider";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0f0f0f" },
    { media: "(prefers-color-scheme: light)", color: "#f9f9f9" },
  ],
};

export const metadata: Metadata = {
  title: "YTDL — YouTube Downloader",
  description: "Search, download YouTube videos and playlists as MP3, M4A, or MP4. Fast, free, and premium.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "YouTubetoMP3",
  },
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
