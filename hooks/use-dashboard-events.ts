"use client"

import { useEffect } from "react"

/**
 * Hook lắng nghe sự kiện cập nhật dữ liệu từ NotificationCenter (EventBus)
 * Thay thế cho cơ chế SSE cũ rời rạc.
 */
export function useDashboardEvents(onUpdate: () => void) {
  useEffect(() => {
    const handleUpdate = () => {
      console.log("Dashboard Hook: Syncing data...");
      onUpdate()
    }

    window.addEventListener("userUpdated", handleUpdate)
    return () => {
      window.removeEventListener("userUpdated", handleUpdate)
    }
  }, [onUpdate])
}

