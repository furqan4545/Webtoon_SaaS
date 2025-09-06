import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import Header from "./dashboard/Header";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://app.webtoon.ai";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "webtoon.ai",
    template: "%s • webtoon.ai",
  },
  description:
    "Create beautiful, mobile-first webtoons with AI. Draft scenes, generate characters, and publish stunning webtoon panels in minutes.",
  keywords: [
    "webtoon",
    "ai webtoon",
    "manga",
    "comic",
    "story generator",
    "character generator",
    "scene generator",
  ],
  openGraph: {
    title: "webtoon.ai",
    description:
      "Make beautiful webtoons using AI — from characters to scenes to publishing.",
    url: siteUrl,
    siteName: "webtoon.ai",
    images: [
      {
        url: "/webtoon_icon.png",
        width: 512,
        height: 512,
        alt: "webtoon.ai icon",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "webtoon.ai",
    description:
      "Create beautiful webtoons with AI — characters, scenes, and publishing.",
    images: ["/webtoon_icon.png"],
  },
  icons: {
    icon: [
      { url: "/webtoon_icon_svg.svg", type: "image/svg+xml" },
      { url: "/webtoon_icon.png", type: "image/png" },
      { url: "/favicon.ico", rel: "shortcut icon" },
    ],
    apple: [{ url: "/webtoon_icon.png" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Header />
        {children}
        <Toaster />
      </body>
    </html>
  );
}
