"use client"

import { useState, useEffect, useRef } from "react"
import { logger } from "@/lib/logger-client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { MessageSquare, Send, User, Search, ShieldCheck, Bot, Circle, ArrowLeft, RefreshCw } from 'lucide-react'
import { Textarea } from "@/components/ui/textarea"

interface CustomerSupportProps {
  users: any[]
  adminUser: any
}

export function CustomerSupport({ users: propUsers, adminUser }: CustomerSupportProps) {
  const [localUsers, setLocalUsers] = useState<any[]>([])
  const [activeChat, setActiveChat] = useState<string | null>(null)
  const [messages, setMessages] = useState<any[]>([])
  const [newMessage, setNewMessage] = useState("")
  const [searchTerm, setSearchTerm] = useState("")
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("")
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [fetchingUsers, setFetchingUsers] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // ✅ FIX: Merge propUsers + tự fetch từ API nếu propUsers ít hơn thực tế
  const users = localUsers.length > 0 ? localUsers : propUsers

  // ✅ FIX: Tự fetch users từ API để luôn hiển thị đầy đủ
  useEffect(() => {
    const fetchUsers = async () => {
      setFetchingUsers(true)
      try {
        const { apiGet } = await import('@/lib/api-client')
        const result = await apiGet('/api/users')

        // ✅ FIX: /api/users trả về cột `id` (không phải `uid`) từ DB
        // Map lại để đảm bảo uid luôn có giá trị
        const rawUsers = result?.users || result?.data || []
        if (Array.isArray(rawUsers) && rawUsers.length > 0) {
          setLocalUsers(rawUsers.map((u: any) => ({
            ...u,
            // ✅ KEY: uid phải map đúng từ DB id field
            uid: u.uid || u.id || u.user_id,
            name: u.name || u.username || u.full_name,
            email: u.email,
          })))
        } else {
          logger.warn('fetchUsers: API returned empty users array', { result })
          // Fallback: dùng propUsers nếu API trả rỗng
          if (propUsers.length > 0) {
            setLocalUsers(propUsers.map((u: any) => ({
              ...u,
              uid: u.uid || u.id,
            })))
          }
        }
      } catch (error) {
        logger.warn('Could not fetch users from API, falling back to prop users', { error })
        // Fallback khi API lỗi
        if (propUsers.length > 0) {
          setLocalUsers(propUsers.map((u: any) => ({
            ...u,
            uid: u.uid || u.id,
          })))
        }
      } finally {
        setFetchingUsers(false)
      }
    }
    fetchUsers()
  }, [propUsers]) // fetchUsers runs once on mount or when propUsers change

  // Sync propUsers to localUsers when propUsers length changes
  useEffect(() => {
    if (propUsers && propUsers.length > 0) {
      setLocalUsers((prev) => {
        // Only update if propUsers has more users to prevent overwriting fetched data
        if (propUsers.length > prev.length) {
          const currentMap = new Map(prev.map((u) => [u.email, u]))
          let changed = false
          propUsers.forEach((newU: any) => {
            if (!currentMap.has(newU.email)) {
              currentMap.set(newU.email, newU)
              changed = true
            }
          })
          return changed ? Array.from(currentMap.values()) : prev
        }
        return prev
      })
    }
  }, [propUsers])


  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearchTerm(searchTerm), 300)
    return () => clearTimeout(timer)
  }, [searchTerm])

  // Auto scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // Auto-refresh messages mỗi 10s
  useEffect(() => {
    if (!activeChat) return
    const interval = setInterval(() => {
      loadChatMessages(activeChat, true)
    }, 10000)
    return () => clearInterval(interval)
  }, [activeChat])

  // Load chat messages
  const loadChatMessages = async (userId: string, silent = false) => {
    if (!silent) {
      setActiveChat(userId)
      setMessages([])
      setLoading(true)
    }
    try {
      const { apiGet } = await import('@/lib/api-client')
      const result = await apiGet(`/api/chat?userId=${userId}`)
      if (result?.messages && Array.isArray(result.messages)) {
        setMessages(result.messages)
      }
    } catch (error) {
      logger.warn('Error loading messages', { error })
    } finally {
      setLoading(false)
    }
  }

  // Send message
  const sendMessage = async () => {
    if (!newMessage.trim() || !activeChat || sending) return
    setSending(true)

    const tempMsg = {
      id: `temp-${Date.now()}`,
      senderType: "admin",
      senderName: adminUser?.name || 'Admin',
      content: newMessage,
      message: newMessage,
      timestamp: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    }
    setMessages(prev => [...prev, tempMsg])
    const msgText = newMessage
    setNewMessage("")

    try {
      const { apiPost } = await import('@/lib/api-client')
      await apiPost('/api/chat', {
        userId: activeChat,
        message: msgText,
        isAdmin: true,
      })
      // Reload to get server-assigned ID
      await loadChatMessages(activeChat, true)
    } catch (error) {
      logger.error('Error sending message', error)
    }

    // Telegram notification (fire-and-forget)
    try {
      const user = findUser(activeChat)
      const { apiPost } = await import('@/lib/api-client');
      apiPost('/api/admin/send-telegram', {
        message: `💬 <b>TIN NHẮN TỪ ADMIN</b>\n\n👤 <b>Gửi tới:</b> ${user?.name || user?.email}\n💬 <b>Nội dung:</b> ${msgText}`,
        chatId: process.env.NEXT_PUBLIC_TELEGRAM_CHAT_ID
      }).catch((err) => { 
        logger.debug('Telegram admin notify failed (silent)', { error: err instanceof Error ? err.message : String(err) });
      });
    } catch (e) {
      logger.debug('Telegram notification wrapper failed', { error: e instanceof Error ? e.message : String(e) });
    }

    setSending(false)
  }

  // Find user by ID
  const findUser = (id: string | null) => {
    if (!id) return null
    const idStr = id.toString()
    return users.find((u: any) => {
      return u.uid?.toString() === idStr || u.id?.toString() === idStr
    })
  }

  // Get users with chat history
  const chatUsers = users.filter(u => {
    if (!debouncedSearchTerm) return true
    const s = debouncedSearchTerm.toLowerCase()
    return (u.name || '').toLowerCase().includes(s) ||
      (u.email || '').toLowerCase().includes(s) ||
      (u.username || '').toLowerCase().includes(s)
  })

  const activeUser = findUser(activeChat)

  return (
    <div className="flex h-[calc(100vh-180px)] rounded-xl overflow-hidden border border-slate-700/50 bg-slate-900/50 backdrop-blur-sm">

      {/* ═══════════════ LEFT PANEL: Users List ═══════════════ */}
      <div className={`w-80 border-r border-slate-700/50 flex flex-col bg-slate-900/80 ${activeChat ? 'hidden lg:flex' : 'flex'}`}>

        {/* Header */}
        <div className="p-4 border-b border-slate-700/50">
          <h3 className="text-base font-bold text-white mb-3 flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-purple-400" />
            Khách hàng
            <Badge className="bg-purple-500/20 text-purple-300 text-[10px] ml-auto">
              {chatUsers.length}
            </Badge>
          </h3>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <Input
              placeholder="Tìm kiếm..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500 h-9 text-sm rounded-lg"
            />
          </div>
        </div>

        {/* Users List */}
        <div className="flex-1 overflow-y-auto">
          {fetchingUsers && localUsers.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-slate-500">
              <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mb-3" />
              <p className="text-sm">Đang tải danh sách...</p>
            </div>
          )}

          {!fetchingUsers && chatUsers.length === 0 && (
            <div className="p-8 text-center text-slate-500 text-sm">
              {debouncedSearchTerm ? 'Không tìm thấy khách hàng' : 'Chưa có khách hàng nào'}
            </div>
          )}

          {chatUsers.map((user) => {
            const userKey = (user.uid || user.id || '').toString()
            const isActive = activeChat === userKey
            const isOnline = user.lastActivity && (Date.now() - new Date(user.lastActivity).getTime()) < 300000

            return (
              <div
                key={userKey}
                onClick={() => loadChatMessages(userKey)}
                className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-all border-b border-slate-800/50
                  ${isActive
                    ? 'bg-purple-500/15 border-l-2 border-l-purple-500'
                    : 'hover:bg-slate-800/50 border-l-2 border-l-transparent'
                  }`}
              >
                {/* Avatar */}
                <div className="relative flex-shrink-0">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm
                    ${isActive ? 'bg-gradient-to-br from-purple-500 to-pink-500' : 'bg-gradient-to-br from-slate-600 to-slate-700'}`}>
                    {(user.name || user.email || '?')[0]?.toUpperCase() || '?'}
                  </div>
                  {isOnline && (
                    <Circle className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 fill-emerald-400 text-slate-900 stroke-[3]" />
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">
                    {user.name || user.username || 'Unknown'}
                  </p>
                  <p className="text-[11px] text-slate-400 truncate">{user.email}</p>
                </div>

                {/* Online indicator */}
                {isOnline && (
                  <span className="text-[9px] text-emerald-400 font-medium flex-shrink-0">Online</span>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* ═══════════════ RIGHT PANEL: Chat Area ═══════════════ */}
      <div className={`flex-1 flex flex-col ${!activeChat ? 'hidden lg:flex' : 'flex'}`}>

        {activeChat && activeUser ? (
          <>
            {/* Chat Header */}
            <div className="px-4 py-3 border-b border-slate-700/50 flex items-center gap-3 bg-slate-900/80">
              {/* Back button mobile */}
              <button
                onClick={() => setActiveChat(null)}
                className="lg:hidden text-slate-400 hover:text-white"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>

              {/* User avatar */}
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-bold text-sm">
                {(activeUser.name || activeUser.email || '?')[0].toUpperCase()}
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white truncate">
                  {activeUser.name || activeUser.username || activeUser.email}
                </p>
                <p className="text-[11px] text-slate-400">{activeUser.email}</p>
              </div>

              <Button
                size="sm"
                variant="ghost"
                onClick={() => loadChatMessages(activeChat)}
                className="text-slate-400 hover:text-white h-8 w-8 p-0"
              >
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3" style={{ background: 'linear-gradient(180deg, rgba(15,23,42,0.95) 0%, rgba(30,41,59,0.95) 100%)' }}>
              {loading && (
                <div className="flex justify-center py-8">
                  <RefreshCw className="w-5 h-5 text-purple-400 animate-spin" />
                </div>
              )}

              {!loading && messages.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-slate-500">
                  <MessageSquare className="w-10 h-10 mb-3 opacity-30" />
                  <p className="text-sm">Chưa có tin nhắn</p>
                </div>
              )}

              {messages.map((msg) => {
                const sType = msg.senderType || (msg.sender === "admin" || msg.is_admin ? (msg.content?.startsWith('🤖 ') ? 'ai' : 'admin') : 'user')
                const isMe = sType === 'admin'
                const content = sType === 'ai' && msg.content?.startsWith('🤖 ')
                  ? msg.content.substring(2).trim()
                  : (msg.content || msg.message)

                return (
                  <div key={msg.id} className={`flex items-end gap-2 ${isMe ? 'justify-end' : 'justify-start'}`}>
                    {/* Avatar left */}
                    {!isMe && (
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0
                        ${sType === 'ai' ? 'bg-gradient-to-br from-emerald-500 to-cyan-500' : 'bg-gradient-to-br from-slate-500 to-slate-600'}`}>
                        {sType === 'ai' ? <Bot className="w-3.5 h-3.5 text-white" /> : <User className="w-3.5 h-3.5 text-white" />}
                      </div>
                    )}

                    <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} max-w-[70%]`}>
                      {/* Sender label */}
                      <span className="text-[10px] text-slate-500 mb-0.5 px-1">
                        {isMe ? 'Bạn' : sType === 'ai' ? '✦ AI' : (msg.senderName || activeUser?.name || 'Khách')}
                      </span>

                      {/* Bubble */}
                      <div className={`px-3 py-2 rounded-2xl text-[13px] leading-snug
                        ${isMe
                          ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-br-md shadow-lg shadow-purple-500/10'
                          : sType === 'ai'
                            ? 'bg-emerald-500/15 text-emerald-100 border border-emerald-500/20 rounded-bl-md'
                            : 'bg-slate-800 text-slate-100 border border-slate-700/50 rounded-bl-md'
                        }`}>
                        <p className="whitespace-pre-wrap break-words">{content}</p>
                      </div>

                      <span className="text-[10px] text-slate-600 mt-0.5 px-1">
                        {new Date(msg.timestamp || msg.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    {/* Avatar right */}
                    {isMe && (
                      <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 bg-gradient-to-br from-purple-600 to-pink-600">
                        <ShieldCheck className="w-3.5 h-3.5 text-white" />
                      </div>
                    )}
                  </div>
                )
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-3 border-t border-slate-700/50 bg-slate-900/80">
              <div className="flex gap-2">
                <Textarea
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Nhập tin nhắn..."
                  rows={1}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault()
                      sendMessage()
                    }
                  }}
                  className="flex-1 bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500 min-h-10 max-h-32 rounded-xl text-sm resize-none"
                />
                <Button
                  onClick={sendMessage}
                  disabled={!newMessage.trim() || sending}
                  className="h-10 w-10 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 p-0 flex-shrink-0"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
              <p className="text-[10px] text-slate-600 mt-1.5 px-1">
                Nhấn Enter để gửi, Shift+Enter xuống dòng
              </p>
            </div>
          </>
        ) : (
          /* Empty State */
          <div className="flex-1 flex flex-col items-center justify-center text-slate-500">
            <div className="w-20 h-20 rounded-2xl bg-slate-800/50 flex items-center justify-center mb-4">
              <MessageSquare className="w-8 h-8 text-slate-600" />
            </div>
            <p className="text-base font-medium text-slate-400 mb-1">Chọn khách hàng</p>
            <p className="text-sm text-slate-600">để bắt đầu cuộc trò chuyện</p>
          </div>
        )}
      </div>
    </div>
  )
}