import React from "react";
import localFont from "next/font/local";
import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/AppShell";
import { OG_IMAGE_URL, SITE_URL } from "@/lib/seo";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-sans",
  weight: "100 900",
});

const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "RAUM CLMM DEX | Stellar Concentrated Liquidity Hub",
  description:
    "RAUM CLMM DEX provides concentrated liquidity trading, swap routing, pool analytics, governance tooling, and operational visibility for Stellar market participants.",
  alternates: {
    canonical: SITE_URL,
  },
  openGraph: {
    title: "RAUM CLMM DEX | Stellar Concentrated Liquidity Hub",
    description:
      "Trade, provide liquidity, and monitor protocol state on Stellar using RAUM CLMM DEX.",
    url: SITE_URL,
    siteName: "RAUM CLMM DEX",
    images: [
      {
        url: OG_IMAGE_URL,
        width: 1200,
        height: 630,
        alt: "RAUM CLMM DEX interface preview",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "RAUM CLMM DEX | Stellar Concentrated Liquidity Hub",
    description:
      "Trade, provide liquidity, and monitor protocol state on Stellar using RAUM CLMM DEX.",
    images: [OG_IMAGE_URL],
  },
  icons: {
    icon: "/raumfi_logo.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme="light" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="font-sans">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:border focus:border-[var(--accent)] focus:bg-[var(--surface)] focus:px-4 focus:py-2 focus:text-xs focus:uppercase focus:tracking-[0.25em]"
        >
          Skip to main content
        </a>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
