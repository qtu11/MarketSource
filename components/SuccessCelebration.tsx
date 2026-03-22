"use client"

import React, { useEffect, useState } from 'react'
import confetti from 'canvas-confetti'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, X } from 'lucide-react'

interface SuccessCelebrationProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  message?: string
  type?: string
}

export function SuccessCelebration({
  isOpen,
  onClose,
  title = "Thành công!",
  message = "Hành động của bạn đã được thực hiện thành công.",
  type = "default"
}: SuccessCelebrationProps) {
  
  useEffect(() => {
    if (isOpen) {
      // Hiệu ứng pháo hoa rực rỡ
      const duration = 3 * 1000
      const animationEnd = Date.now() + duration
      const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 9999 }

      const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min

      const interval: any = setInterval(function() {
        const timeLeft = animationEnd - Date.now()

        if (timeLeft <= 0) {
          return clearInterval(interval)
        }

        const particleCount = 50 * (timeLeft / duration)
        
        // Bắn pháo hoa từ 2 phía
        confetti({
          ...defaults,
          particleCount,
          origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 }
        })
        confetti({
          ...defaults,
          particleCount,
          origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 }
        })
      }, 250)

      // Tự động đóng sau 8 giây nếu người dùng không đóng
      const timer = setTimeout(onClose, 8000)
      return () => {
        clearInterval(interval)
        clearTimeout(timer)
      }
    }
  }, [isOpen, onClose])

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          {/* Nền mờ cực sang trọng */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-md"
          />

          {/* Box thông báo giữa màn hình */}
          <motion.div
            initial={{ scale: 0.5, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.8, opacity: 0, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="relative w-full max-w-sm overflow-hidden rounded-3xl bg-white p-8 text-center shadow-2xl dark:bg-slate-900 border border-white/20"
          >
            {/* Nút đóng */}
            <button
              onClick={onClose}
              className="absolute right-4 top-4 rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
            >
              <X size={20} />
            </button>

            {/* Icon thành công */}
            <div className="mb-6 flex justify-center">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: "spring" }}
                className="flex h-20 w-20 items-center justify-center rounded-full bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400"
              >
                <CheckCircle2 size={48} />
              </motion.div>
            </div>

            {/* Nội dung */}
            <h2 className="mb-2 text-2xl font-black text-slate-900 dark:text-white">
              {title}
            </h2>
            <p className="mb-6 text-slate-600 dark:text-slate-400">
              {message}
            </p>

            {/* Button xác nhận */}
            <button
              onClick={onClose}
              className="w-full rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 py-4 font-bold text-white shadow-lg shadow-blue-500/30 transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              Tuyệt quá!
            </button>

            {/* Hiệu ứng tia sáng chạy quanh (CSS) */}
            <div className="absolute -inset-[100%] animate-[spin_3s_linear_infinite] bg-[conic-gradient(from_0deg,transparent_0_340deg,white_360deg)] opacity-10 pointer-events-none" />
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
