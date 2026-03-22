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
    const eventSource = new EventSource("/api/notifications/stream")

    eventSource.onmessage = (event) => {
      try {
        const notification = JSON.parse(event.data)
        
        const currentUserId = (session?.user as any)?.id;
        const isAdmin = (session?.user as any)?.role === 'admin' || (session?.user as any)?.role === 'superadmin';

        // LỌC THÔNG BÁO:
        // 1. Nếu là thông báo cá nhân (có user_id) -> chỉ hiện nếu đúng ID
        // 2. Nếu là thông báo hệ thống (deposit_created, withdrawal_created, order_created) -> hiện cho Admin
        const systemEvents = ['deposit_created', 'withdrawal_created', 'order_created'];
        const isSystemEvent = systemEvents.includes(notification.type);
        
        if (isSystemEvent) {
          if (!isAdmin) return; // Chỉ admin mới nhận thông báo hệ thống này
        } else if (currentUserId && notification.user_id && String(notification.user_id) !== String(currentUserId)) {
          return; // Thông báo cá nhân của người khác
        }

        // HIỆU ỨNG VÀ ĐỒNG BỘ DỮ LIỆU
        const isMajorUserEvent = [
          'deposit_approved',
          'purchase_success',
          'withdrawal_approved',
          'withdrawal_rejected'
        ].includes(notification.type)

        // Nếu là sự kiện liên quan tiền tệ/giao dịch của User -> Sync balance
        if (isMajorUserEvent) {
          syncData()
        }

        // Nếu là sự kiện hệ thống cho Admin -> Phát tín hiệu để Admin Panel load lại bảng
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
          return; // Admin không cần hiện pháo hoa cho yêu cầu mới
        }

        if (isMajorUserEvent && notification.type !== 'withdrawal_rejected') {
          // HIỂN THỊ PHÁO HOA
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
          // HIỂN THỊ TOAST
          const isError = notification.type.includes('rejected') || notification.type.includes('failed')
          if (isError) {
            toast.error(notification.message, { duration: 6000 })
          } else {
            toast.info(notification.message, { duration: 5000 })
          }
        }

      } catch (err) {
        console.error("Error parsing notification data", err)
      }
    }

    eventSource.onerror = (err) => {
      // console.error("EventSource failed:", err)
      eventSource.close()
      
      // Thử kết nối lại sau 10s nếu rớt
      setTimeout(() => {
        // Re-run effect logic
      }, 10000)
    }

    return () => {
      eventSource.close()
    }
  }, [session])

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
