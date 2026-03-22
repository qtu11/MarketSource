"use client"

import React, { useEffect, useState, useCallback } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { SuccessCelebration } from "./SuccessCelebration"

/**
 * Global Component hỗ trợ lắng nghe thông báo Real-time qua SSE.
 * Tự động hiển thị Toast (sonner) hoặc Pháo hoa (SuccessCelebration).
 * ĐỒNG THỜI: Cập nhật số dư và làm mới dữ liệu toàn trang không cần load lại.
 */
export function NotificationCenter() {
  const { data: session } = useSession()
  const router = useRouter()
  const [celebration, setCelebration] = useState<{
    isOpen: boolean
    title: string
    message: string
    type: string
  }>({
    isOpen: false,
    title: "",
    message: "",
    type: "default"
  })

  const closeCelebration = useCallback(() => {
    setCelebration(prev => ({ ...prev, isOpen: false }))
  }, [])

  // Hàm đồng bộ lại số dư và làm mới dữ liệu UI
  const syncData = useCallback(async () => {
    try {
      // 1. Lấy số dư mới nhất từ API
      const response = await fetch("/api/get-balance")
      const data = await response.json()
      
      if (data.success) {
        // 2. Cập nhật localStorage để Header và các trang Client nhận diện được
        const storedUser = localStorage.getItem("currentUser")
        if (storedUser) {
          const user = JSON.parse(storedUser)
          user.balance = data.balance
          user.role = data.role
          localStorage.setItem("currentUser", JSON.stringify(user))
        }

        // 3. Phát sự kiện cho toàn bộ hệ thống Client
        window.dispatchEvent(new Event("userUpdated"))
        
        // 4. Làm mới Server Components (Next.js)
        router.refresh()
        
        console.log("Real-time: Data synced successfully", data.balance)
      }
    } catch (err) {
      console.error("Real-time: Sync data failed", err)
    }
  }, [router])

  useEffect(() => {
    let eventSource: EventSource | null = null
    let reconnectTimeout: NodeJS.Timeout | null = null
    let retryCount = 0

    const connect = () => {
      if (reconnectTimeout) clearTimeout(reconnectTimeout)
      
      console.log(`Real-time: Attempting to connect SSE (Attempt ${retryCount + 1})`)
      eventSource = new EventSource("/api/notifications/stream")

      eventSource.onopen = () => {
        console.log("Real-time: SSE Connection opened")
        retryCount = 0 // Reset retry count on successful connection
      }

      eventSource.onmessage = (event) => {
        try {
          // SSE Keep-alive/ping message can be ignored
          if (event.data === ': ping') return

          const notification = JSON.parse(event.data)
          
          const currentUserId = (session?.user as any)?.id;
          const isAdmin = (session?.user as any)?.role === 'admin' || (session?.user as any)?.role === 'superadmin';

          /**
           * ✅ SECURITY: Mặc dù server đã lọc, chúng ta vẫn giữ logic lọc tại client
           * để đảm bảo tính nhất quán và layer bảo mật thứ hai.
           */
          const systemEvents = ['deposit_created', 'withdrawal_created', 'order_created'];
          const isSystemEvent = systemEvents.includes(notification.type);
          
          if (isSystemEvent) {
            if (!isAdmin) return;
          } else if (currentUserId && notification.user_id && String(notification.user_id) !== String(currentUserId)) {
            return;
          }

          // HIỆU ỨNG VÀ ĐỒNG BỘ DỮ LIỆU
          const isMajorUserEvent = [
            'deposit_approved',
            'purchase_success',
            'withdrawal_approved',
            'withdrawal_rejected'
          ].includes(notification.type)

          if (isMajorUserEvent) {
            syncData()
          }

          if (isSystemEvent && isAdmin) {
            if (notification.type === 'deposit_created') {
              window.dispatchEvent(new Event('depositsUpdated'));
            } else if (notification.type === 'withdrawal_created') {
              window.dispatchEvent(new Event('withdrawalsUpdated'));
            } else if (notification.type === 'order_created') {
              window.dispatchEvent(new Event('purchasesUpdated'));
            }
            router.refresh();
            toast.info(`🔔 Admin: ${notification.message}`, { duration: 8000, position: 'bottom-right' });
            return;
          }

          if (isMajorUserEvent && notification.type !== 'withdrawal_rejected') {
            setCelebration({
              isOpen: true,
              title: notification.type === 'deposit_approved' ? "Nạp tiền thành công!" : 
                     notification.type === 'purchase_success' ? "Mua hàng thành công!" :
                     "Rút tiền thành công!",
              message: notification.message,
              type: notification.type
            })
            toast.success(notification.message, { duration: 5000 })
          } else {
            const isError = notification.type.includes('rejected') || notification.type.includes('failed')
            if (isError) {
              toast.error(notification.message, { duration: 6000 })
            } else {
              toast.info(notification.message, { duration: 5000 })
            }
          }
        } catch (err) {
          console.error("Real-time: Error parsing notification data", err)
        }
      }

      eventSource.onerror = (err) => {
        console.warn("Real-time: SSE Connection failed, scheduled reconnect", err)
        if (eventSource) {
          eventSource.close()
          eventSource = null
        }
        
        // Exponential backoff: 2s, 4s, 8s, 16s, max 30s
        const delay = Math.min(2000 * Math.pow(2, retryCount), 30000)
        reconnectTimeout = setTimeout(() => {
          retryCount++
          connect()
        }, delay)
      }
    }

    connect()

    return () => {
      if (eventSource) {
        eventSource.close()
      }
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout)
      }
    }
  }, [session, router, syncData])

  return (
    <>
      <SuccessCelebration 
        isOpen={celebration.isOpen}
        onClose={closeCelebration}
        title={celebration.title}
        message={celebration.message}
        type={celebration.type}
      />
    </>
  )
}
