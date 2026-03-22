"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useRouter, usePathname } from "next/navigation"
import {
  MessageCircle, X, Send, Minimize2, LogIn, LifeBuoy,
  Sparkles, Bot, User, ChevronDown, RefreshCw,
  ShoppingBag, CreditCard, HelpCircle, Package, Zap,
  Shield, ArrowRight, Maximize2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { apiGet, apiPost } from "@/lib/api-client"
import { logger } from "@/lib/logger-client"
import { cn } from "@/lib/utils"
import { isStoreMobileNavPath, OPEN_CHAT_WIDGET_EVENT } from "@/lib/mobile-store-nav"
import type { User as UserType } from "@/types"

interface Message {
  id: number
  message: string
  isAdmin: boolean
  createdAt: string
  senderName?: string
  senderType?: "user" | "admin" | "ai"
}

interface QuickTag {
  icon: React.ReactNode
  label: string
  message: string
  color: string
}

const QUICK_TAGS: QuickTag[] = [
  {
    icon: <ShoppingBag className="w-3.5 h-3.5" />,
    label: "Sản phẩm",
    message: "Cho tôi xem các sản phẩm source code nổi bật hiện có?",
    color: "from-violet-500 to-purple-500",
  },
  {
    icon: <CreditCard className="w-3.5 h-3.5" />,
    label: "Giá cả",
    message: "Giá các sản phẩm hiện tại là bao nhiêu? Có ưu đãi nào không?",
    color: "from-emerald-500 to-teal-500",
  },
  {
    icon: <Package className="w-3.5 h-3.5" />,
    label: "Nạp tiền",
    message: "Hướng dẫn tôi cách nạp tiền vào tài khoản?",
    color: "from-amber-500 to-orange-500",
  },
  {
    icon: <Shield className="w-3.5 h-3.5" />,
    label: "Rút tiền",
    message: "Chính sách và cách rút tiền như thế nào?",
    color: "from-rose-500 to-pink-500",
  },
  {
    icon: <HelpCircle className="w-3.5 h-3.5" />,
    label: "Chính sách",
    message: "Cho tôi biết chính sách bảo hành và hoàn tiền?",
    color: "from-blue-500 to-cyan-500",
  },
  {
    icon: <Zap className="w-3.5 h-3.5" />,
    label: "Hỗ trợ kỹ thuật",
    message: "Tôi cần hỗ trợ kỹ thuật về sản phẩm đã mua.",
    color: "from-fuchsia-500 to-pink-500",
  },
]

export function ChatWidget() {
  const router = useRouter()
  const pathname = usePathname()
  const [isMounted, setIsMounted] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [isMinimized, setIsMinimized] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [messageText, setMessageText] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isTyping, setIsTyping] = useState(false)
  const [currentUser, setCurrentUser] = useState<UserType | null>(null)
  const [unreadCount, setUnreadCount] = useState(0)
  const [showScrollDown, setShowScrollDown] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    setIsMounted(true)
  }, [])

  useEffect(() => {
    const onOpenFromNav = () => {
      setIsOpen(true)
      setIsMinimized(false)
      setUnreadCount(0)
    }
    window.addEventListener(OPEN_CHAT_WIDGET_EVENT, onOpenFromNav)
    return () => window.removeEventListener(OPEN_CHAT_WIDGET_EVENT, onOpenFromNav)
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return

    const loadUser = () => {
      try {
        const userStr =
          localStorage.getItem("currentUser") ||
          localStorage.getItem("qtusdev_user") ||
          localStorage.getItem("qtusdev_user_fallback")
        if (userStr) {
          const user = JSON.parse(userStr) as UserType
          setCurrentUser(user)
        } else {
          setCurrentUser(null)
        }
      } catch (error) {
        logger.error("Error parsing user:", error)
      }
    }

    // Load user lần đầu
    loadUser()

    // ✅ FIX: Lắng nghe sự kiện login/logout để auto-sync auth state
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "currentUser" || e.key === "qtusdev_user" || e.key === "isLoggedIn") {
        loadUser()
      }
    }

    const handleUserUpdate = () => loadUser()

    window.addEventListener("storage", handleStorageChange)
    window.addEventListener("userUpdated", handleUserUpdate)
    window.addEventListener("loginSuccess", handleUserUpdate)

    // ✅ FIX: Poll mỗi 2s để check nếu user vừa login (vì storage event không fire cho cùng tab)
    const authCheckInterval = setInterval(loadUser, 2000)

    return () => {
      window.removeEventListener("storage", handleStorageChange)
      window.removeEventListener("userUpdated", handleUserUpdate)
      window.removeEventListener("loginSuccess", handleUserUpdate)
      clearInterval(authCheckInterval)
    }
  }, [])

  // ============================================================
  // LOAD CHAT HISTORY
  // ============================================================
  const loadChatHistory = useCallback(async () => {
    if (!currentUser) return
    try {
      const result = await apiGet("/api/chat")
      if (!result || !result.success) return

      const chatMessages = result.messages || []
      const mappedMessages: Message[] = chatMessages.map((m: any) => ({
        id: m.id,
        message: m.message || m.content || "",
        isAdmin: m.is_admin || m.isAdmin || false,
        createdAt: m.created_at || m.createdAt || new Date().toISOString(),
        senderName: m.user_name || m.user_email || (m.is_admin || m.isAdmin ? "Admin" : "User"),
        senderType: m.senderType || (m.is_admin || m.isAdmin ? "admin" : "user"),
      }))

      const sortedMessages = mappedMessages.sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      )

      if (typeof window !== "undefined") {
        const lastSeenMessageId = parseInt(localStorage.getItem("lastSeenMessageId") || "0")
        const unread = sortedMessages.filter((m) => m.isAdmin && m.id > lastSeenMessageId).length
        setUnreadCount(unread)

        if (isOpen && sortedMessages.length > 0) {
          const lastMessageId = sortedMessages[sortedMessages.length - 1].id
          localStorage.setItem("lastSeenMessageId", lastMessageId.toString())
        }
      }

      setMessages(sortedMessages)
    } catch (error: any) {
      if (!error.message?.includes("Unauthorized")) {
        logger.error("Error loading chat history:", error)
      }
    }
  }, [currentUser, isOpen])

  useEffect(() => {
    if (currentUser && isOpen) {
      loadChatHistory()
      pollingIntervalRef.current = setInterval(() => loadChatHistory(), 3000)
      return () => {
        if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current)
      }
    } else {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current)
        pollingIntervalRef.current = null
      }
    }
  }, [currentUser, isOpen, loadChatHistory])

  useEffect(() => {
    if (scrollAreaRef.current) {
      const viewport = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (viewport) {
        viewport.scrollTo({ top: viewport.scrollHeight, behavior: 'smooth' });
      }
    }
  }, [messages.length])

  // ============================================================
  // SEND MESSAGE
  // ============================================================
  const handleSendMessage = async (text?: string) => {
    const msg = (text || messageText).trim()
    if (!msg || isLoading || !currentUser) return

    setIsLoading(true)
    setIsTyping(true)
    const localMsg = msg
    setMessageText("")

    try {
      const result = await apiPost("/api/chat", { message: localMsg })

      const newMessage: Message = {
        id: result.message?.id || Date.now(),
        message: localMsg,
        isAdmin: false,
        createdAt: result.message?.createdAt || new Date().toISOString(),
        senderName: currentUser.name || currentUser.email || "Bạn",
        senderType: "user",
      }
      setMessages((prev) => [...prev, newMessage])

      // Nếu có AI auto-reply → thêm ngay
      if (result.autoReply?.message) {
        setTimeout(() => {
          setMessages((prev) => [
            ...prev,
            {
              id: Date.now() + 1,
              message: result.autoReply.message,
              isAdmin: true,
              createdAt: new Date().toISOString(),
              senderName: "AI Assistant",
              senderType: "ai",
            },
          ])
          setIsTyping(false)
        }, 800)
      } else {
        // Reload chat sau 1s để bắt AI reply từ server
        setTimeout(() => {
          loadChatHistory()
          setIsTyping(false)
        }, 2000)
      }
    } catch (error: any) {
      logger.error("Error sending message:", error)
      setIsTyping(false)
    } finally {
      setIsLoading(false)
      textareaRef.current?.focus()
    }
  }

  const handleQuickTag = (tag: QuickTag) => {
    handleSendMessage(tag.message)
  }

  const handleOpenChat = () => {
    setIsOpen(true)
    setIsMinimized(false)
    setUnreadCount(0)
    if (currentUser) loadChatHistory()
  }

  const handleCloseChat = () => {
    setIsOpen(false)
    setIsExpanded(false)
    if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current)
  }

  const scrollToBottom = () => {
    if (scrollAreaRef.current) {
      const viewport = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (viewport) {
        viewport.scrollTo({ top: viewport.scrollHeight, behavior: 'smooth' });
      }
    }
  }

  if (!isMounted) return null
  if (pathname?.startsWith("/admin")) return null

  const isAuthenticated = Boolean(currentUser)
  const liftFabForMobileNav = isStoreMobileNavPath(pathname)

  // ============================================================
  // RENDER: MESSAGE BUBBLE
  // ============================================================
  const renderMessage = (msg: Message) => {
    const isUser = !msg.isAdmin
    const isAI = msg.senderType === "ai"

    return (
      <div
        key={msg.id}
        className={cn(
          "flex gap-2 w-full animate-in fade-in slide-in-from-bottom-2 duration-300",
          isUser ? "flex-row-reverse" : "flex-row"
        )}
      >
        {/* Avatar */}
        <div
          className={cn(
            "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center shadow-md",
            isUser
              ? "bg-gradient-to-br from-purple-500 to-pink-500"
              : isAI
                ? "bg-gradient-to-br from-emerald-400 to-cyan-500"
                : "bg-gradient-to-br from-purple-500 to-pink-500"
          )}
        >
          {isUser ? (
            <User className="w-4 h-4 text-white" />
          ) : isAI ? (
            <Bot className="w-4 h-4 text-white" />
          ) : (
            <Shield className="w-4 h-4 text-white" />
          )}
        </div>

        {/* Message Container */}
        <div className={cn("flex flex-col max-w-[78%] group", isUser ? "items-end" : "items-start")}>
          {/* Sender label */}
          <p
            className={cn(
              "text-[10px] font-semibold mb-1 px-1",
              isUser ? "text-purple-300/80" : isAI ? "text-emerald-400/90" : "text-purple-400/90"
            )}
          >
            {isUser ? "Bạn" : isAI ? "🤖 AI Assistant" : "👨‍💼 Admin QtusDev"}
          </p>

          {/* Bubble */}
          <div
            className={cn(
              "rounded-2xl px-3 py-2 shadow-lg backdrop-blur-sm transition-all relative",
              isUser
                ? "bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-tr-sm rounded-br-sm"
                : isAI
                  ? "bg-gradient-to-r from-emerald-900/60 to-cyan-900/60 text-emerald-50 border border-emerald-500/30 rounded-tl-sm rounded-bl-sm"
                  : "bg-white/10 text-white border border-white/10 rounded-tl-sm rounded-bl-sm"
            )}
          >
            <p className="text-[13px] whitespace-pre-wrap break-words leading-snug">{msg.message}</p>
            <p className={cn("text-[10px] mt-1 opacity-60", isUser ? "text-right" : "text-left")}>
              {isAI && <span className="text-emerald-300/70 mr-1">✦ AI</span>}
              {new Date(msg.createdAt).toLocaleTimeString("vi-VN", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>
        </div>
      </div>
    )
  }

  // ============================================================
  // RENDER: MAIN WIDGET
  // ============================================================
  return (
    <>
      {/* ====== FLOATING BUTTON ====== */}
      {!isOpen && (
        <div
          className={cn(
            "fixed right-6 z-50",
            liftFabForMobileNav
              ? "bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))] md:bottom-6"
              : "bottom-6"
          )}
        >
          <div className="absolute inset-0 rounded-full bg-gradient-to-r from-purple-500/40 to-pink-500/40 blur-2xl opacity-80 animate-pulse" />
          <Button
            onClick={handleOpenChat}
            size="lg"
            className="relative rounded-full w-16 h-16 shadow-2xl bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white border border-white/20 hover:scale-110 transition-transform duration-300"
            aria-label="Mở chat hỗ trợ"
          >
            <MessageCircle className="w-6 h-6" />
            {unreadCount > 0 && (
              <Badge className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center p-0 text-xs animate-bounce">
                {unreadCount > 9 ? "9+" : unreadCount}
              </Badge>
            )}
          </Button>
        </div>
      )}

      {/* ====== CHAT WINDOW ====== */}
      {isOpen && (
        <div
          className={cn(
            "fixed z-50 transition-all duration-500 ease-out",
            "left-0 right-0 bottom-0 sm:left-auto sm:right-6 sm:bottom-6", // Position
            isExpanded
              ? "h-dvh sm:h-[min(800px,85vh)] w-full sm:w-[32rem]"
              : isMinimized
                ? "h-14 w-full sm:w-80"
                : "h-[70vh] max-h-[600px] w-full sm:w-[26rem]"
          )}
        >
          <div className={cn(
            "h-full w-full flex flex-col shadow-2xl border-x border-t sm:border border-white/10 overflow-hidden bg-gradient-to-b from-slate-900 via-slate-950 to-slate-900 backdrop-blur-xl",
            isMinimized ? "rounded-t-2xl sm:rounded-2xl" : "rounded-t-2xl sm:rounded-2xl"
          )}>
            {/* ====== HEADER ====== */}
            <div className="relative bg-gradient-to-r from-purple-600 via-fuchsia-600 to-pink-600 p-4 flex items-center justify-between">
              {/* Glow effect */}
              <div className="absolute inset-0 bg-gradient-to-r from-purple-600/50 to-pink-600/50 blur-xl opacity-50" />

              <div className="relative flex flex-col gap-0.5">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-white/20 flex items-center justify-center">
                    <MessageCircle className="w-4 h-4" />
                  </div>
                  Hỗ trợ trực tuyến
                </h3>
                <span className="text-xs text-white/70 flex items-center gap-1.5 ml-9">
                  <span
                    className={cn(
                      "h-2 w-2 rounded-full animate-pulse",
                      isAuthenticated ? "bg-emerald-300 shadow-emerald-300/50 shadow-sm" : "bg-yellow-300"
                    )}
                  />
                  {isAuthenticated ? (
                    <span className="flex items-center gap-1">
                      <Bot className="w-3 h-3" /> AI + Admin đang trực tuyến
                    </span>
                  ) : (
                    "Đăng nhập để chat"
                  )}
                </span>
              </div>

              <div className="relative flex gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="text-white/80 hover:bg-white/20 h-8 w-8 p-0 rounded-lg"
                  aria-label="Mở rộng"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsMinimized(!isMinimized)}
                  className="text-white/80 hover:bg-white/20 h-8 w-8 p-0 rounded-lg"
                  aria-label="Thu nhỏ"
                >
                  <Minimize2 className="w-3.5 h-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCloseChat}
                  className="text-white/80 hover:bg-white/20 h-8 w-8 p-0 rounded-lg"
                  aria-label="Đóng"
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>

            {/* ====== BODY ====== */}
            {!isMinimized && (
              <div className="flex-1 flex flex-col overflow-hidden">
                {isAuthenticated ? (
                  <>
                    {/* Messages Area */}
                    <ScrollArea
                      ref={scrollAreaRef}
                      className="flex-1 px-4 py-3 min-h-0"
                    >
                      <div className="space-y-4 pr-3 pb-2">
                        {messages.length === 0 ? (
                          <div className="text-center py-8 flex flex-col items-center gap-3">
                            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center border border-purple-500/20">
                              <Sparkles className="w-7 h-7 text-purple-400" />
                            </div>
                            <div>
                              <p className="font-semibold text-white/90 text-sm">Xin chào! Tôi có thể giúp gì cho bạn?</p>
                              <p className="text-xs text-white/40 mt-1">
                                AI sẽ trả lời tự động • Admin sẽ hỗ trợ khi cần
                              </p>
                            </div>
                          </div>
                        ) : (
                          messages.map(renderMessage)
                        )}

                        {/* Typing indicator */}
                        {isTyping && (
                          <div className="flex items-center gap-2 animate-in fade-in duration-300">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center shadow-md">
                              <Bot className="w-4 h-4 text-white" />
                            </div>
                            <div className="bg-white/10 rounded-2xl rounded-bl-md px-4 py-3 border border-white/10">
                              <div className="flex gap-1.5">
                                <div className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                                <div className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                                <div className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                              </div>
                            </div>
                          </div>
                        )}

                        <div ref={messagesEndRef} />
                      </div>
                    </ScrollArea>

                    {/* Quick Tags */}
                    {messages.length === 0 && (
                      <div className="px-4 pb-2">
                        <p className="text-[10px] text-white/30 uppercase tracking-wider font-semibold mb-2">
                          Câu hỏi thường gặp
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {QUICK_TAGS.map((tag, i) => (
                            <button
                              key={i}
                              onClick={() => handleQuickTag(tag)}
                              disabled={isLoading}
                              className={cn(
                                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium",
                                "bg-white/5 border border-white/10 text-white/70",
                                "hover:bg-white/10 hover:border-white/20 hover:text-white",
                                "transition-all duration-200 hover:scale-105 active:scale-95",
                                "disabled:opacity-50 disabled:cursor-not-allowed"
                              )}
                            >
                              <span className={cn("bg-gradient-to-r bg-clip-text text-transparent", tag.color)}>
                                {tag.icon}
                              </span>
                              {tag.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Scroll to bottom */}
                    {showScrollDown && (
                      <div className="flex justify-center -mt-2 mb-1">
                        <button
                          onClick={scrollToBottom}
                          className="bg-purple-600/80 hover:bg-purple-600 text-white rounded-full p-1.5 shadow-lg transition-all"
                        >
                          <ChevronDown className="w-4 h-4" />
                        </button>
                      </div>
                    )}

                    {/* Input Area */}
                    <div className="border-t border-white/5 bg-slate-900/80 p-3">
                      <div className="flex gap-2 items-end">
                        <Textarea
                          ref={textareaRef}
                          placeholder="Nhập tin nhắn..."
                          value={messageText}
                          onChange={(e) => setMessageText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault()
                              handleSendMessage()
                            }
                          }}
                          rows={1}
                          className="resize-none bg-white/5 border-white/10 text-white placeholder:text-white/30 rounded-xl focus:ring-purple-500/50 focus:border-purple-500/50 min-h-[40px] max-h-[100px]"
                        />
                        <Button
                          onClick={() => handleSendMessage()}
                          disabled={!messageText.trim() || isLoading}
                          className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 shadow-lg rounded-xl h-10 w-10 p-0 flex-shrink-0 disabled:opacity-30 transition-all hover:scale-105 active:scale-95"
                        >
                          {isLoading ? (
                            <RefreshCw className="w-4 h-4 animate-spin" />
                          ) : (
                            <Send className="w-4 h-4" />
                          )}
                        </Button>
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-white/25 mt-2 px-1">
                        <span>Enter gửi • Shift+Enter xuống dòng</span>
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 text-purple-400/60 hover:text-purple-400 transition-colors"
                          onClick={() => router.push("/support")}
                        >
                          <LifeBuoy className="w-3 h-3" />
                          Trung tâm hỗ trợ
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  /* ====== NOT LOGGED IN ====== */
                  <div className="p-8 text-center flex flex-col items-center gap-5 flex-1 justify-center">
                    <div className="relative">
                      <div className="absolute inset-0 bg-gradient-to-br from-purple-500/30 to-pink-500/30 rounded-2xl blur-xl" />
                      <div className="relative w-20 h-20 rounded-2xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center border border-purple-500/20">
                        <MessageCircle className="w-9 h-9 text-purple-400" />
                      </div>
                    </div>
                    <div>
                      <p className="font-bold text-lg text-white">Trò chuyện với AI & Admin</p>
                      <p className="text-sm text-white/40 mt-1.5 max-w-[280px] mx-auto">
                        Đăng nhập để nhận hỗ trợ tức thì từ AI thông minh và đội ngũ admin.
                      </p>
                    </div>

                    {/* Features */}
                    <div className="grid grid-cols-2 gap-2 w-full">
                      {[
                        { icon: <Bot className="w-4 h-4" />, text: "AI trả lời 24/7" },
                        { icon: <ShoppingBag className="w-4 h-4" />, text: "Tư vấn sản phẩm" },
                        { icon: <CreditCard className="w-4 h-4" />, text: "Hỗ trợ nạp/rút" },
                        { icon: <Shield className="w-4 h-4" />, text: "Chính sách & bảo hành" },
                      ].map((feat, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-2 bg-white/5 rounded-xl px-3 py-2 border border-white/5"
                        >
                          <span className="text-purple-400">{feat.icon}</span>
                          <span className="text-[11px] text-white/60">{feat.text}</span>
                        </div>
                      ))}
                    </div>

                    <div className="flex flex-col gap-2 w-full">
                      <Button
                        className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 rounded-xl h-11 shadow-lg"
                        onClick={() => router.push("/auth/login")}
                      >
                        <LogIn className="w-4 h-4 mr-2" />
                        Đăng nhập ngay
                        <ArrowRight className="w-4 h-4 ml-2" />
                      </Button>
                      <Button
                        variant="ghost"
                        className="text-white/40 hover:text-white/70 hover:bg-white/5 rounded-xl"
                        onClick={() => router.push("/support")}
                      >
                        <LifeBuoy className="w-4 h-4 mr-2" />
                        Xem hướng dẫn hỗ trợ
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
