import React from "react"
import type { Metadata } from "next"
import localFont from "next/font/local"
import "@/app/globals.css"
import { ClientLayout } from "@/components/client-layout"
import { validateEnv } from "@/lib/env-validator"
import SessionTimeout from "@/components/SessionTimeout"
import { NotificationCenter } from "@/components/NotificationCenter"

// ✅ BUG #37 & #42: Validate environment variables on server start
const envValidation = validateEnv()
if (envValidation && !envValidation.success && process.env.NODE_ENV === 'production') {
  // Trong production, crash app nếu thiếu biến quan trọng để bảo mật
  console.error('❌ CRITICAL: Missing Environment Variables:', envValidation.errors)
  throw new Error('Hệ thống không thể khởi động do thiếu cấu hình môi trường (ENV missing).')
}

const inter = localFont({
  src: [
    {
      path: "./fonts/Inter-VariableFont.woff2",
      style: "normal",
    },
  ],
  variable: "--font-inter",
  display: "swap",
  fallback: [
    "-apple-system",
    "BlinkMacSystemFont",
    "Segoe UI",
    "Roboto",
    "Oxygen",
    "Ubuntu",
    "sans-serif",
  ],
})

export const metadata: Metadata = {
  title: "QtusDevMarket - Digital Products Marketplace",
  description: "Discover and purchase high-quality digital products, tools, and resources for developers and creators.",
  keywords: ["digital products", "marketplace", "developers", "tools", "resources"],
  authors: [{ name: "QtusDevMarket" }],
  creator: "QtusDevMarket",
  publisher: "QtusDevMarket",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  metadataBase: process.env.NEXT_PUBLIC_SITE_URL 
    ? new URL(process.env.NEXT_PUBLIC_SITE_URL) 
    : new URL("http://localhost:3000"),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "QtusDev Market - Digital Products Marketplace",
    description:
      "Discover and purchase high-quality digital products, tools, and resources for developers and creators.",
    url: "/",
    siteName: "QtusDevMarket",
    images: [
      {
        url: "https://files.catbox.moe/qea4dw.png",
        width: 1200,
        height: 630,
        alt: "QtusDev Market - Digital Products Marketplace",
      },
    ],
    locale: "vi_VN",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "QtusDev Market - Digital Products Marketplace",
    description:
      "Discover and purchase high-quality digital products, tools, and resources for developers and creators.",
    images: ["https://files.catbox.moe/qea4dw.png"],
    creator: "@qtusdevmarket",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  verification: {
    google: "google8b006f6d2da1b75b.html",
  },
  category: "technology",
  generator: 'Next.js',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/logoqtusdev.png" />
        <link rel="apple-touch-icon" href="/logoqtusdev.png" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#8b5cf6" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="QtusDevMarket" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover"
        />
      </head>
      <body className={`${inter.className} bg-background text-foreground antialiased`}>
        <ClientLayout>
          {children}
          <NotificationCenter />
          <SessionTimeout />
        </ClientLayout>
      </body>
    </html>
  )
}
