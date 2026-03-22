"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import {
    MessageCircle, Send, Sparkles, Bot, User, ChevronDown, RefreshCw,
    ShoppingBag, CreditCard, HelpCircle, Package, Zap, Shield,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { apiGet, apiPost } from "@/lib/api-client"
import { logger } from "@/lib/logger-client"
import { cn } from "@/lib/utils"
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

export function DashboardChatClient({ currentUser }: { currentUser: UserType | null }) {
    const [messages, setMessages] = useState<Message[]>([])
    const [messageText, setMessageText] = useState("")
    const [isLoading, setIsLoading] = useState(false)
    const [isTyping, setIsTyping] = useState(false)
    const [showScrollDown, setShowScrollDown] = useState(false)
    const messagesEndRef = useRef<HTMLDivElement>(null)
    const scrollAreaRef = useRef<HTMLDivElement>(null)
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

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

            setMessages(sortedMessages)
        } catch (error: any) {
            if (!error.message?.includes("Unauthorized")) {
                logger.error("Error loading chat history:", error)
            }
        }
    }, [currentUser])

    useEffect(() => {
        if (currentUser) {
            loadChatHistory()
            pollingIntervalRef.current = setInterval(() => loadChatHistory(), 4000)
            return () => {
                if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current)
            }
        }
    }, [currentUser, loadChatHistory])

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

    const scrollToBottom = () => {
        if (scrollAreaRef.current) {
            const viewport = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
            if (viewport) {
                viewport.scrollTo({ top: viewport.scrollHeight, behavior: 'smooth' });
            }
        }
    }

    if (!currentUser) return null

    // ============================================================
    // RENDER MESSAGE
    // ============================================================
    const renderMessage = (msg: Message) => {
        const isUser = !msg.isAdmin
        const isAI = msg.senderType === "ai"

        return (
            <div
                key={msg.id}
                className={cn(
                    "flex gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300",
                    isUser ? "justify-end" : "justify-start"
                )}
            >
                {!isUser && (
                    <div
                        className={cn(
                            "flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center shadow-md",
                            isAI
                                ? "bg-gradient-to-br from-emerald-400 to-cyan-500"
                                : "bg-gradient-to-br from-purple-500 to-pink-500"
                        )}
                    >
                        {isAI ? <Bot className="w-5 h-5 text-white" /> : <Shield className="w-5 h-5 text-white" />}
                    </div>
                )}

                <div className={cn("max-w-[75%] group", isUser ? "order-1" : "order-2")}>
                    <p
                        className={cn(
                            "text-xs font-semibold mb-1 px-1",
                            isUser ? "text-right text-purple-600 dark:text-purple-400" : isAI ? "text-emerald-600 dark:text-emerald-400" : "text-purple-600 dark:text-purple-400"
                        )}
                    >
                        {isUser ? "Bạn" : isAI ? "🤖 Máy chủ phục vụ tự động AI 24/7" : "👨‍💼 Đội ngũ hỗ trợ QtusDev"}
                    </p>

                    <div
                        className={cn(
                            "rounded-2xl px-5 py-3 shadow-sm transition-all relative text-[15px]",
                            isUser
                                ? "bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-br-md shadow-purple-500/20"
                                : isAI
                                    ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-950 dark:text-emerald-50 border border-emerald-500/20 rounded-bl-md"
                                    : "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-bl-md"
                        )}
                    >
                        {isAI && (
                            <div className="flex items-center gap-1.5 mb-1.5">
                                <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
                                <span className="text-[11px] text-emerald-600 font-semibold tracking-wide uppercase">AI-Powered</span>
                            </div>
                        )}
                        <p className="whitespace-pre-wrap break-words leading-relaxed">{msg.message}</p>
                        <p className={cn("text-[10px] mt-2 opacity-60 font-medium", isUser ? "text-right text-purple-100" : "text-left text-slate-500")}>
                            {new Date(msg.createdAt).toLocaleTimeString("vi-VN", {
                                hour: "2-digit",
                                minute: "2-digit",
                            })}
                        </p>
                    </div>
                </div>

                {isUser && (
                    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-md order-2">
                        <User className="w-5 h-5 text-white" />
                    </div>
                )}
            </div>
        )
    }

    return (
        <Card className="h-[75vh] min-h-[600px] flex flex-col bg-slate-50/50 dark:bg-slate-900/50 border-slate-200/60 dark:border-slate-800/60 overflow-hidden shadow-xl shadow-purple-900/5">
            <CardHeader className="bg-white dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 px-6 py-4 flex-none">
                <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2.5 text-lg">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500/10 to-pink-500/10 flex items-center justify-center border border-purple-500/20">
                            <MessageCircle className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                        </div>
                        <div>
                            Trò chuyện trực tuyến
                            <p className="text-sm font-normal text-muted-foreground mt-0.5">Mọi câu hỏi của bạn sẽ được AI và Admin giải đáp ngay lập tức</p>
                        </div>
                    </CardTitle>
                    <div className="flex items-center gap-2">
                        <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-sm font-medium border border-emerald-200 dark:border-emerald-500/20">
                            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                            Đang hoạt động
                        </span>
                    </div>
                </div>
            </CardHeader>

            <CardContent className="flex-1 p-0 flex flex-col overflow-hidden relative">
                <ScrollArea
                    ref={scrollAreaRef}
                    className="flex-1 p-6"
                >
                    <div className="space-y-6 max-w-4xl mx-auto pb-4">
                        {messages.length === 0 ? (
                            <div className="text-center py-16 flex flex-col items-center gap-4">
                                <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-purple-500/10 to-pink-500/10 flex items-center justify-center border border-purple-500/20 shadow-inner">
                                    <Sparkles className="w-10 h-10 text-purple-500" />
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-600 to-pink-600">Xin chào {currentUser.name}!</h3>
                                    <p className="text-slate-500 mt-2 text-[15px]">Bạn cần hỗ trợ về sản phẩm hay thanh toán? Hãy để lại lời nhắn.</p>
                                </div>
                            </div>
                        ) : (
                            messages.map(renderMessage)
                        )}

                        {isTyping && (
                            <div className="flex items-center gap-3 animate-in fade-in duration-300">
                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center shadow-md">
                                    <Bot className="w-5 h-5 text-white" />
                                </div>
                                <div className="bg-emerald-50 dark:bg-emerald-950/30 rounded-2xl rounded-bl-md px-5 py-3 border border-emerald-500/20">
                                    <div className="flex gap-2">
                                        <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                                        <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                                        <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                                    </div>
                                </div>
                            </div>
                        )}

                        <div ref={messagesEndRef} />
                    </div>
                </ScrollArea>

                {messages.length === 0 && (
                    <div className="px-6 py-4 bg-slate-50/80 dark:bg-slate-900/80 backdrop-blur-sm border-t border-slate-200 dark:border-slate-800 pointer-events-auto">
                        <p className="text-xs uppercase tracking-widest font-bold text-slate-500 mb-3 ml-1">
                            Khám phá nhanh
                        </p>
                        <div className="flex flex-wrap gap-2 max-w-4xl mx-auto">
                            {QUICK_TAGS.map((tag, i) => (
                                <button
                                    key={i}
                                    onClick={() => handleQuickTag(tag)}
                                    disabled={isLoading}
                                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-700 transition-all hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
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

                {showScrollDown && (
                    <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-10">
                        <button
                            onClick={scrollToBottom}
                            className="bg-white dark:bg-slate-900 text-purple-600 border border-slate-200 dark:border-slate-800 rounded-full p-2 shadow-lg hover:scale-110 transition-transform"
                        >
                            <ChevronDown className="w-5 h-5" />
                        </button>
                    </div>
                )}

                <div className="p-4 bg-white dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex-none">
                    <div className="max-w-4xl mx-auto relative rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 focus-within:ring-2 focus-within:ring-purple-500/50 transition-all shadow-inner overflow-hidden flex">
                        <Textarea
                            ref={textareaRef}
                            placeholder="Bạn muốn hỏi gì về nạp rút, sản phẩm hay thủ tục?"
                            value={messageText}
                            onChange={(e) => setMessageText(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey) {
                                    e.preventDefault()
                                    handleSendMessage()
                                }
                            }}
                            rows={1}
                            className="resize-none bg-transparent border-0 text-[15px] p-4 pr-16 min-h-[60px] max-h-[160px] focus-visible:ring-0 shadow-none text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
                        />
                        <div className="absolute right-2 bottom-2">
                            <Button
                                onClick={() => handleSendMessage()}
                                disabled={!messageText.trim() || isLoading}
                                className="rounded-xl h-11 w-11 p-0 flex-shrink-0 bg-gradient-to-br from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 shadow-md transition-transform hover:scale-105 active:scale-95 disabled:opacity-40"
                            >
                                {isLoading ? (
                                    <RefreshCw className="w-5 h-5 text-white animate-spin" />
                                ) : (
                                    <Send className="w-5 h-5 text-white ml-0.5" />
                                )}
                            </Button>
                        </div>
                    </div>
                    <div className="text-center mt-3">
                        <p className="text-xs text-slate-400 font-medium">Nhấn Enter để gửi tin nhắn, Shift + Enter để xuống dòng</p>
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}
