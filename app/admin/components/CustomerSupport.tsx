"use client"

import { useState, useEffect, useRef } from "react"
import { logger } from "@/lib/logger-client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { MessageSquare, Send, Phone, Mail, Clock, User, AlertCircle, CheckCircle, XCircle, Search, ShieldCheck, Bot } from 'lucide-react'

interface CustomerSupportProps {
  users: any[]
  adminUser: any
}

export function CustomerSupport({ users, adminUser }: CustomerSupportProps) {
  const [activeChat, setActiveChat] = useState<string | null>(null)
  const [messages, setMessages] = useState<any[]>([])
  const [newMessage, setNewMessage] = useState("")
  const [tickets, setTickets] = useState<any[]>([])
  const [selectedTicket, setSelectedTicket] = useState<any>(null)
  const [ticketFilter, setTicketFilter] = useState("all")
  const [searchTerm, setSearchTerm] = useState("")
  // ✅ FIX: Debounce search để tránh quá nhiều re-renders
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("")
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Debounce search term
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 300); // 300ms delay

    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Component Load
  useEffect(() => {
    // Ticket mock data loaded to memory instead of localStorage for now to prevent cache issues.
    // In the future this should be backed by a DB table.
    setTickets([])
  }, [])

  // Auto scroll to bottom when new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // Load chat messages for selected user
  const loadChatMessages = async (userId: string) => {
    setActiveChat(userId)
    setMessages([]) // Clear old messages before loading

    // Load từ API để có messages mới nhất
    try {
      const { apiGet } = await import('@/lib/api-client');
      const result = await apiGet(`/api/chat?userId=${userId}`);
      if (result?.messages && Array.isArray(result.messages)) {
        setMessages(result.messages);
      }
    } catch (error) {
      logger.warn('Error loading messages from API', { error });
    }
  }

  // Send message
  const sendMessage = async () => {
    if (!newMessage.trim() || !activeChat) return

    const message = {
      id: Date.now().toString(),
      senderType: "admin",
      senderName: adminUser.name || 'Admin',
      content: newMessage,
      timestamp: new Date().toISOString(),
      read: false
    }

    const updatedMessages = [...messages, message]
    setMessages(updatedMessages)

    // ✅ FIX: Gửi message qua API để lưu vào database
    try {
      const { apiPost } = await import('@/lib/api-client');
      await apiPost('/api/chat', {
        userId: activeChat,
        message: newMessage,
        isAdmin: true,
      });
    } catch (apiError) {
      logger.error('Error sending message via API', apiError);
    }

    // Send notification to user
    try {
      // ✅ FIX: So sánh đúng kiểu dữ liệu (string vs number)
      const activeChatStr = activeChat.toString();
      const user = users.find((u: any) => {
        const uUid = u.uid?.toString();
        const uId = u.id?.toString();
        return uUid === activeChatStr || uId === activeChatStr;
      });
      const telegramMessage = `💬 <b>TIN NHẮN TỪ ADMIN</b>

👤 <b>Gửi tới:</b> ${user?.name || user?.email}
👨‍💻 <b>Admin:</b> ${adminUser.name}
💬 <b>Nội dung:</b> ${newMessage}
⏰ <b>Thời gian:</b> ${new Date().toLocaleString('vi-VN')}`

      // ✅ FIX: Admin token đã được set trong httpOnly cookie, không cần lấy từ localStorage
      // Cookie sẽ tự động được gửi kèm request
      const csrfToken = localStorage.getItem('csrf-token');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (csrfToken) {
        headers['X-CSRF-Token'] = csrfToken;
      }

      await fetch('/api/admin/send-telegram', {
        method: "POST",
        headers,
        body: JSON.stringify({
          message: telegramMessage,
          chatId: process.env.NEXT_PUBLIC_TELEGRAM_CHAT_ID
        })
      }).catch((error) => {
        logger.error('Failed to send Telegram notification', error);
      })

      // Save notification
      const notifications = JSON.parse(localStorage.getItem("adminNotifications") || "[]")
      notifications.unshift({
        id: Date.now(),
        type: "admin_message",
        title: "Tin nhắn đã gửi",
        message: telegramMessage,
        timestamp: new Date().toISOString(),
        read: false
      })
      localStorage.setItem("adminNotifications", JSON.stringify(notifications))
    } catch (error) {
      logger.error("Error sending notification", error)
    }

    setNewMessage("")
  }

  // Create new support ticket
  const createTicket = (user: any, type: string = "general") => {
    // ✅ FIX: Dùng uid hoặc id
    const ticket = {
      id: Date.now().toString(),
      userId: user.uid || user.id,
      userName: user.name || user.email,
      userEmail: user.email,
      type,
      status: "open",
      priority: "medium",
      subject: `Hỗ trợ cho ${user.name || user.email}`,
      description: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      assignedTo: adminUser.email,
      messages: []
    }

    const updatedTickets = [ticket, ...tickets]
    setTickets(updatedTickets)
    setSelectedTicket(ticket)
  }

  // Update ticket status
  const updateTicketStatus = (ticketId: string, status: string) => {
    const updatedTickets = tickets.map(ticket =>
      ticket.id === ticketId
        ? { ...ticket, status, updatedAt: new Date().toISOString() }
        : ticket
    )
    setTickets(updatedTickets)
  }

  // Filter tickets
  const filteredTickets = tickets.filter(ticket => {
    const matchesFilter = ticketFilter === "all" || ticket.status === ticketFilter
    const matchesSearch = ticket.userName.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
      ticket.userEmail.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
      ticket.subject.toLowerCase().includes(debouncedSearchTerm.toLowerCase())
    return matchesFilter && matchesSearch
  })

  // Get online users (last activity within 5 minutes)
  const onlineUsers = users.filter(user => {
    if (!user.lastActivity) return false
    const lastActivity = new Date(user.lastActivity).getTime()
    const now = new Date().getTime()
    return (now - lastActivity) < 5 * 60 * 1000
  })

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Người dùng online</CardTitle>
            <User className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{onlineUsers.length}</div>
            <p className="text-xs text-muted-foreground">Đang hoạt động</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tickets mở</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              {tickets.filter(t => t.status === "open").length}
            </div>
            <p className="text-xs text-muted-foreground">Cần xử lý</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tickets đã giải quyết</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {tickets.filter(t => t.status === "resolved").length}
            </div>
            <p className="text-xs text-muted-foreground">Hoàn thành</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tổng tin nhắn</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {messages.length /* Tạm thời count messages của chat đang mở */}
            </div>
            <p className="text-xs text-muted-foreground">Tất cả cuộc trò chuyện</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Users List & Support Tickets */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Hỗ trợ khách hàng</span>
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                <span className="text-xs text-muted-foreground">Live</span>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Search */}
            <div className="flex items-center space-x-2">
              <Search className="w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Tìm kiếm khách hàng..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            {/* Filter */}
            <Select value={ticketFilter} onValueChange={setTicketFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Lọc tickets" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả tickets</SelectItem>
                <SelectItem value="open">Đang mở</SelectItem>
                <SelectItem value="in-progress">Đang xử lý</SelectItem>
                <SelectItem value="resolved">Đã giải quyết</SelectItem>
                <SelectItem value="closed">Đã đóng</SelectItem>
              </SelectContent>
            </Select>

            {/* Online Users */}
            <div className="space-y-2">
              <h4 className="font-medium text-sm text-green-600">Đang online ({onlineUsers.length})</h4>
              {onlineUsers.slice(0, 5).map((user) => {
                // ✅ FIX: Dùng uid hoặc id làm key
                const userKey = user.uid || user.id;
                return (
                  <div key={userKey} className="flex items-center justify-between p-2 border rounded hover:bg-gray-50">
                    <div>
                      <p className="text-sm font-medium">{user.name || user.email}</p>
                      <p className="text-xs text-muted-foreground">{user.email}</p>
                    </div>
                    <div className="flex space-x-1">
                      <Button size="sm" variant="outline" onClick={() => loadChatMessages(userKey)}>
                        <MessageSquare className="w-3 h-3" />
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => createTicket(user, "chat")}>
                        <Phone className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Support Tickets */}
            <div className="space-y-2">
              <h4 className="font-medium text-sm">Support Tickets ({filteredTickets.length})</h4>
              <div className="max-h-64 overflow-y-auto space-y-2">
                {filteredTickets.map((ticket) => (
                  <div
                    key={ticket.id}
                    className={`p-3 border rounded cursor-pointer hover:bg-gray-50 ${selectedTicket?.id === ticket.id ? 'border-blue-500 bg-blue-50' : ''
                      }`}
                    onClick={() => setSelectedTicket(ticket)}
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">{ticket.userName}</p>
                      <Badge className={
                        ticket.status === "open" ? "bg-red-100 text-red-800" :
                          ticket.status === "in-progress" ? "bg-yellow-100 text-yellow-800" :
                            ticket.status === "resolved" ? "bg-green-100 text-green-800" :
                              "bg-gray-100 text-gray-800"
                      }>
                        {ticket.status === "open" ? "Mở" :
                          ticket.status === "in-progress" ? "Đang xử lý" :
                            ticket.status === "resolved" ? "Đã giải quyết" : "Đã đóng"}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{ticket.subject}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(ticket.createdAt).toLocaleString('vi-VN')}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Chat Interface */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              {activeChat ? (
                <>
                  <span>Chat với {users.find((u: any) => {
                    const uUid = u.uid?.toString();
                    const uId = u.id?.toString();
                    const activeChatStr = activeChat.toString();
                    return uUid === activeChatStr || uId === activeChatStr;
                  })?.name || users.find((u: any) => {
                    const uUid = u.uid?.toString();
                    const uId = u.id?.toString();
                    const activeChatStr = activeChat.toString();
                    return uUid === activeChatStr || uId === activeChatStr;
                  })?.email}</span>
                  <div className="flex items-center space-x-2">
                    <Badge className="bg-green-100 text-green-800">Online</Badge>
                  </div>
                </>
              ) : selectedTicket ? (
                <>
                  <span>Ticket: {selectedTicket.subject}</span>
                  <div className="flex space-x-2">
                    <Select value={selectedTicket.status} onValueChange={(value) => updateTicketStatus(selectedTicket.id, value)}>
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="open">Mở</SelectItem>
                        <SelectItem value="in-progress">Đang xử lý</SelectItem>
                        <SelectItem value="resolved">Đã giải quyết</SelectItem>
                        <SelectItem value="closed">Đã đóng</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              ) : (
                <span>Chọn khách hàng để bắt đầu chat</span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {activeChat ? (
              <div className="space-y-4">
                <div className="h-[400px] overflow-y-auto border rounded-xl p-4 space-y-4 bg-gray-50 dark:bg-gray-900/50">
                  {messages.map((message) => {
                    // API returns senderType ('user', 'ai', 'admin') or legacy 'sender' field
                    const sType = message.senderType || (message.sender === "admin" || message.is_admin ? (message.content?.startsWith('🤖 ') ? 'ai' : 'admin') : 'user');
                    const isMe = sType === 'admin';

                    return (
                      <div
                        key={message.id}
                        className={`flex items-end gap-2 ${isMe ? "justify-end" : "justify-start"}`}
                      >
                        {/* Avatar cho User/AI */}
                        {!isMe && (
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${sType === 'ai' ? 'bg-gradient-to-br from-indigo-500 to-purple-500' : 'bg-gradient-to-br from-gray-400 to-gray-500'
                            }`}>
                            {sType === 'ai' ? <Bot className="w-4 h-4 text-white" /> : <User className="w-4 h-4 text-white" />}
                          </div>
                        )}

                        <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} max-w-[75%]`}>
                          {/* Sender Name */}
                          <div className="flex items-center gap-2 mb-1 px-1">
                            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                              {isMe ? 'Bạn (Admin)' : (sType === 'ai' ? 'Trợ lý AI' : (message.senderName || 'Khách hàng'))}
                            </span>
                          </div>

                          {/* Message Bubble */}
                          <div
                            className={`relative px-4 py-2 rounded-2xl text-sm ${isMe
                              ? "bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-br-sm shadow-sm"
                              : sType === "ai"
                                ? "bg-indigo-50 dark:bg-indigo-900/40 text-indigo-900 dark:text-indigo-100 rounded-bl-sm border border-indigo-100 dark:border-indigo-800"
                                : "bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-bl-sm border border-gray-200 dark:border-gray-700 shadow-sm"
                              }`}
                          >
                            <p className="whitespace-pre-wrap leading-relaxed">
                              {/* Remove robot emoji if AI type explicitly sent */}
                              {sType === 'ai' && message.content?.startsWith('🤖 ')
                                ? message.content.substring(2).trim()
                                : (message.content || message.message)}
                            </p>
                          </div>

                          <p className="text-[10px] text-gray-400 mt-1 px-1">
                            {new Date(message.timestamp || message.createdAt).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>

                        {/* Avatar Admin (Me) */}
                        {isMe && (
                          <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 bg-gradient-to-br from-blue-600 to-cyan-600">
                            <ShieldCheck className="w-4 h-4 text-white" />
                          </div>
                        )}
                      </div>
                    )
                  })}
                  <div ref={messagesEndRef} />
                </div>

                {/* Message Input */}
                <div className="flex space-x-2 pt-2">
                  <Input
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Nhập câu trả lời cho khách hàng (Admin)..."
                    onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                    className="flex-1 bg-gray-50 border-gray-200 focus:border-blue-500 rounded-xl"
                  />
                  <Button
                    onClick={sendMessage}
                    disabled={!newMessage.trim()}
                    className="rounded-xl w-12 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700"
                  >
                    <Send className="w-4 h-4 ml-1" />
                  </Button>
                </div>
              </div>
            ) : selectedTicket ? (
              <div className="space-y-4">
                {/* Ticket Details */}
                <div className="bg-gray-50 p-4 rounded-lg space-y-2">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <strong>Khách hàng:</strong> {selectedTicket.userName}
                    </div>
                    <div>
                      <strong>Email:</strong> {selectedTicket.userEmail}
                    </div>
                    <div>
                      <strong>Loại:</strong> {selectedTicket.type}
                    </div>
                    <div>
                      <strong>Ưu tiên:</strong> {selectedTicket.priority}
                    </div>
                    <div>
                      <strong>Được tạo:</strong> {new Date(selectedTicket.createdAt).toLocaleString('vi-VN')}
                    </div>
                    <div>
                      <strong>Cập nhật:</strong> {new Date(selectedTicket.updatedAt).toLocaleString('vi-VN')}
                    </div>
                  </div>
                  <div>
                    <strong>Chủ đề:</strong> {selectedTicket.subject}
                  </div>
                </div>

                {/* Quick Actions */}
                <div className="flex space-x-2">
                  <Button
                    size="sm"
                    onClick={() => loadChatMessages(selectedTicket.userId?.toString() || '')}
                  >
                    <MessageSquare className="w-4 h-4 mr-2" />
                    Mở Chat
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      // ✅ FIX: So sánh đúng kiểu dữ liệu
                      const ticketUserId = selectedTicket.userId?.toString();
                      const user = users.find((u: any) => {
                        const uUid = u.uid?.toString();
                        const uId = u.id?.toString();
                        return uUid === ticketUserId || uId === ticketUserId;
                      });
                      if (user) {
                        window.open(`mailto:${user.email}?subject=Re: ${selectedTicket.subject}`, '_blank')
                      }
                    }}
                  >
                    <Mail className="w-4 h-4 mr-2" />
                    Gửi Email
                  </Button>
                </div>
              </div>
            ) : (
              <div className="h-64 flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>Chọn khách hàng để bắt đầu chat hoặc chọn ticket để xem chi tiết</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}