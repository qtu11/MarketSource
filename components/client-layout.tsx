"use client"

import React, { Suspense } from "react"
import dynamic from "next/dynamic"
import { Providers } from "@/components/providers"
import { CustomCursor } from "@/components/custom-cursor"

const ChatWidget = dynamic(
  () => import("@/components/chat-widget").then(mod => ({ default: mod.ChatWidget })),
  {
    ssr: false,
    loading: () => <div className="fixed bottom-6 right-6 h-12 w-12 rounded-full bg-muted animate-pulse" />,
  },
)

const ServiceWorkerRegister = dynamic(
  () => import("@/components/service-worker-register").then(mod => ({ default: mod.ServiceWorkerRegister })),
  {
    ssr: false,
    loading: () => null,
  },
)

// Lazy load ErrorBoundary để tránh xung đột với @react-three/fiber trong quá trình module evaluation
import { ErrorBoundary } from "@/components/ErrorBoundary"
import { runStorageMigration } from "@/lib/storage-migration"

export function ClientLayout({ children }: { children: React.ReactNode }) {
  React.useEffect(() => {
    runStorageMigration()
  }, [])

  return (
    <Providers>
      <Suspense fallback={<div className="min-h-screen bg-background" />}>
        <ErrorBoundary>
          <div className="min-h-screen bg-background text-foreground antialiased cursor-none">
            {children}
            <Suspense fallback={null}>
              <ChatWidget />
            </Suspense>
            <ServiceWorkerRegister />
            <CustomCursor />
          </div>
        </ErrorBoundary>
      </Suspense>
    </Providers>
  )
}

