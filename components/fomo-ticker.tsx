"use client"

import React, { useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { ref, onValue, query, limitToLast } from "firebase/database"
import { realtimeDb } from "@/lib/firebase"
import { TrendingUp, Award, DollarSign, Info, ShieldAlert } from "lucide-react"
import { cn } from "@/lib/utils"

interface TickerEvent {
  id: string
  message: string
  type: 'purchase' | 'commission' | 'achievement' | 'info'
  timestamp: number
}

export function FomoTicker() {
  const [events, setEvents] = useState<TickerEvent[]>([])
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)
    
    // Đảm bảo Firebase được khởi tạo (api-client.ts đã có logic lazy init nhưng ta cần chắc chắn ở đây)
    // Nếu getDatabase() fail, ta sẽ catch lỗi
    let unsubscribe: any = () => {}
    
    try {
      if (!realtimeDb) throw new Error("Firebase RTDB not initialized")
      const tickerRef = query(ref(realtimeDb, 'ticker_events'), limitToLast(10))
      
      unsubscribe = onValue(tickerRef, (snapshot) => {
        const data = snapshot.val()
        if (data) {
          const eventList = Object.entries(data).map(([id, val]: [string, any]) => ({
            id,
            ...val
          })).sort((a, b) => b.timestamp - a.timestamp)
          setEvents(eventList)
        }
      }, (err) => {
        console.warn("FomoTicker: Firebase subscription failed", err)
      })
    } catch (e) {
      console.warn("FomoTicker: Firebase not ready yet")
    }

    return () => {
      if (unsubscribe) unsubscribe()
    }
  }, [])

  if (!isMounted || events.length === 0) return null

  return (
    <div className="w-full bg-violet-600/10 border-b border-violet-500/20 overflow-hidden py-1 flex items-center shadow-sm select-none">
      {/* Label cố định bên trái */}
      <div className="flex-none px-3 md:px-4 py-1 flex items-center gap-2 border-r border-violet-500/20 bg-background/80 backdrop-blur-md z-20 relative">
        <div className="absolute inset-0 bg-violet-500/5 animate-pulse pointer-events-none" />
        <TrendingUp className="h-3.5 w-3.5 text-violet-500" />
        <span className="text-[10px] md:text-xs font-black uppercase tracking-tighter text-violet-500 whitespace-nowrap">
          SYSTEM LIVE FEED
        </span>
      </div>
      
      {/* Vùng chạy chữ */}
      <div className="flex-1 relative overflow-hidden h-7">
        <div className="absolute inset-0 flex items-center">
          <motion.div 
            className="flex gap-16 md:gap-24 whitespace-nowrap px-8"
            initial={{ x: 0 }}
            animate={{ x: "-50%" }}
            transition={{ 
              repeat: Infinity, 
              duration: 35, 
              ease: "linear",
              repeatType: "loop"
            }}
          >
            {/* Render 2 lần để tạo vòng lặp vô tận */}
            {[...events, ...events].map((event, idx) => (
              <div key={`${event.id}-${idx}`} className="flex items-center gap-2.5 group cursor-default">
                <div className={cn(
                  "p-1 rounded-full",
                  event.type === 'purchase' && "bg-green-500/20 text-green-500",
                  event.type === 'commission' && "bg-orange-500/20 text-orange-500",
                  event.type === 'achievement' && "bg-yellow-500/20 text-yellow-500",
                  event.type === 'info' && "bg-blue-500/20 text-blue-500"
                )}>
                  {event.type === 'purchase' && <DollarSign className="h-3 w-3" />}
                  {event.type === 'commission' && <TrendingUp className="h-3 w-3" />}
                  {event.type === 'achievement' && <Award className="h-3 w-3" />}
                  {event.type === 'info' && <Info className="h-3 w-3" />}
                </div>
                <span className="text-xs md:text-sm font-medium text-foreground/90 group-hover:text-primary transition-colors">
                  {event.message}
                </span>
                <span className="text-[9px] text-muted-foreground/50 font-mono">
                  {new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))}
          </motion.div>
        </div>
      </div>

      {/* Cấp bậc Rank Badge gợi ý (Static info) */}
      <div className="hidden lg:flex flex-none px-4 items-center gap-3 border-l border-violet-500/20 bg-background/50 backdrop-blur-sm z-20 h-full">
         <div className="flex items-center gap-1.5 opacity-60 hover:opacity-100 transition-opacity">
            <ShieldAlert className="h-3.5 w-3.5 text-yellow-500" />
            <span className="text-[10px] font-bold text-muted-foreground uppercase">Hacker Rank Active</span>
         </div>
      </div>
    </div>
  )
}
