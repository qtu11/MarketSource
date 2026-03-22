"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { logger } from "@/lib/logger-client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { MessageCircle, Mail, Facebook, Phone, Clock, HelpCircle, FileText, Users, Send, Bot, ShieldCheck, Smile } from 'lucide-react'
import { FloatingHeader } from "@/components/floating-header"
import { Footer } from "@/components/footer"
import { apiPost, apiGet } from "@/lib/api-client"
import dynamic from "next/dynamic"

const ThemeAwareBackground = dynamic(
  async () => {
    try {
      const mod = await import("@/components/theme-aware-background")
      return { default: mod.ThemeAwareBackground }
    } catch (error) {
      logger.error('Failed to load ThemeAwareBackground component', error)
      throw error
    }
  },
  {
    ssr: false,
    loading: () => <div className="absolute inset-0 bg-blue-50 dark:bg-[#0B0C10]" />
  }
)

export default function SupportPage() {
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [chatMessages, setChatMessages] = useState<any[]>([])
  const [messageText, setMessageText] = useState("")
  const [isLoadingChat, setIsLoadingChat] = useState(false)
  const [contactForm, setContactForm] = useState({
    name: "",
    email: "",
    subject: "",
    message: ""
  })
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const [isTyping, setIsTyping] = useState(false)

  const loadChatHistory = useCallback(async () => {
    // Don't load if no user
    if (!currentUser) {
      return;
    }

    try {
      const result = await apiGet('/api/chat')
      const messages = result.messages || []
      // Map format
      const mappedMessages = messages.map((m: any) => ({
        id: m.id,
        message: m.message || m.content || '',
        isAdmin: m.is_admin || false,
        createdAt: m.created_at || new Date().toISOString(),
        senderName: m.sender_name || m.sender_email || (m.is_admin ? 'Admin' : 'User'),
        receiverName: m.receiver_name || m.receiver_email || (m.is_admin ? 'User' : 'Admin')
      }))

      // Sort và set state
      const sortedMessages = mappedMessages.sort((a: any, b: any) => {
        const dateA = new Date(a.createdAt).getTime();
        const dateB = new Date(b.createdAt).getTime();
        return isNaN(dateA) ? 1 : (isNaN(dateB) ? -1 : dateA - dateB);
      });

      setChatMessages(sortedMessages);
    } catch (error) {
      logger.error('Error loading chat history', error)
      // Don't show error to user, just log
    }
  }, [currentUser])

  useEffect(() => {
    // ✅ FIX: Load current user từ userManager để đảm bảo sync với database
    const loadUser = async () => {
      try {
        const { userManager } = await import('@/lib/userManager');
        const user = await userManager.getUser();
        if (user) {
          setCurrentUser(user);
          setContactForm(prev => ({
            ...prev,
            name: user.name || "",
            email: user.email || ""
          }));
        }
      } catch (error) {
        logger.error("Error loading user", error);
        // Fallback to localStorage
        const userStr = localStorage.getItem("currentUser") || localStorage.getItem("qtusdev_user");
        if (userStr) {
          try {
            const user = JSON.parse(userStr);
            setCurrentUser(user);
            setContactForm(prev => ({
              ...prev,
              name: user.name || "",
              email: user.email || ""
            }));
          } catch (parseError) {
            logger.error("Error parsing user", parseError);
          }
        }
      }
    };

    loadUser();

    // Load chat history
    loadChatHistory()

    // Polling để refresh chat messages mỗi 10 giây (chỉ khi user đã đăng nhập)
    let intervalId: NodeJS.Timeout | null = null;

    if (currentUser) {
      intervalId = setInterval(() => {
        loadChatHistory();
      }, 10000); // 10 seconds
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [currentUser, loadChatHistory])

  const scrollToBottom = useCallback(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    } else {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [chatMessages.length, scrollToBottom])

  const handleSendChatMessage = async () => {
    if (!messageText.trim() || isLoadingChat) return

    const userMsg = messageText.trim()
    setIsLoadingChat(true)
    setMessageText("")

    // Optimistic update — hiển thị tin nhắn user ngay lập tức
    const tempId = Date.now()
    setChatMessages(prev => [...prev, {
      id: tempId,
      message: userMsg,
      isAdmin: false,
      senderType: 'user',
      createdAt: new Date().toISOString(),
      senderName: currentUser?.name || currentUser?.email || 'Bạn'
    }])

    try {
      setIsTyping(true) // Show typing indicator cho AI
      const result = await apiPost('/api/chat', { message: userMsg })

      // Cập nhật ID thực từ server
      setChatMessages(prev => prev.map(m =>
        m.id === tempId ? { ...m, id: result.message?.id || tempId } : m
      ))

      // Nếu có auto-reply từ AI, thêm vào chat
      if (result.autoReply) {
        setTimeout(() => {
          setChatMessages(prev => [...prev, {
            id: Date.now(),
            message: `🤖 ${result.autoReply.message || result.autoReply}`,
            isAdmin: true,
            senderType: 'ai',
            createdAt: new Date().toISOString(),
            senderName: 'AI Assistant'
          }])
          setIsTyping(false)
        }, 800) // Delay nhẹ cho tự nhiên
      } else {
        setIsTyping(false)
      }
    } catch (error: any) {
      logger.error('Error sending message', error)
      // Xóa tin nhắn optimistic nếu lỗi
      setChatMessages(prev => prev.filter(m => m.id !== tempId))
      setError(error.message || "Lỗi gửi tin nhắn")
      setIsTyping(false)
    } finally {
      setIsLoadingChat(false)
    }
  }

  const [error, setError] = useState("")

  const handleSendContactForm = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!contactForm.name || !contactForm.email || !contactForm.message) {
      alert("Vui lòng điền đầy đủ thông tin")
      return
    }

    try {
      // Gửi tin nhắn qua chat API nếu đã đăng nhập
      if (currentUser) {
        await apiPost('/api/chat', {
          message: `[Liên hệ] ${contactForm.subject || 'Không có tiêu đề'}\n\n${contactForm.message}`
        })
        alert("Tin nhắn đã được gửi thành công!")
        setContactForm({
          name: currentUser.name || "",
          email: currentUser.email || "",
          subject: "",
          message: ""
        })
      } else {
        // Nếu chưa đăng nhập, chỉ hiển thị thông báo
        alert("Vui lòng đăng nhập để gửi tin nhắn")
      }
    } catch (error: any) {
      logger.error('Error sending contact form', error)
      alert("Lỗi gửi tin nhắn: " + (error.message || "Vui lòng thử lại"))
    }
  }

  const faqs = [
    {
      question: "Làm thế nào để mua mã nguồn?",
      answer:
        "Bạn cần đăng ký tài khoản, nạp tiền vào ví, sau đó chọn mã nguồn và thanh toán. Mã nguồn sẽ được gửi ngay lập tức sau khi thanh toán thành công.",
    },
    {
      question: "Các phương thức thanh toán được hỗ trợ?",
      answer:
        "Chúng tôi hỗ trợ thanh toán qua Banking (MB Bank, Techcombank, TPBank), Momo và các ví điện tử phổ biến.",
    },
    {
      question: "Tôi có thể hoàn tiền không?",
      answer:
        "Chúng tôi có chính sách hoàn tiền trong vòng 7 ngày nếu mã nguồn không hoạt động như mô tả hoặc có lỗi nghiêm trọng.",
    },
    {
      question: "Mã nguồn có được cập nhật không?",
      answer:
        "Có, chúng tôi thường xuyên cập nhật mã nguồn để sửa lỗi và thêm tính năng mới. Khách hàng đã mua sẽ được cập nhật miễn phí.",
    },
    {
      question: "Tôi cần hỗ trợ cài đặt mã nguồn?",
      answer:
        "Mỗi mã nguồn đều có hướng dẫn cài đặt chi tiết. Nếu cần hỗ trợ thêm, bạn có thể liên hệ qua Zalo hoặc email.",
    },
    {
      question: "Có thể sử dụng mã nguồn cho mục đích thương mại không?",
      answer:
        "Có, tất cả mã nguồn đều có license thương mại. Bạn có thể sử dụng để phát triển dự án cá nhân hoặc thương mại.",
    },
  ]

  const contactMethods = [
    {
      icon: MessageCircle,
      title: "Zalo",
      description: "Chat trực tiếp với chúng tôi",
      value: "Quét mã QR",
      link: "https://files.catbox.moe/kb9350.jpg",
      color: "from-blue-500 to-cyan-500",
      available: "24/7",
    },
    {
      icon: Mail,
      title: "Email",
      description: "Gửi email hỗ trợ",
      value: "qtussnguyen0220@gmail.com",
      link: "mailto:qtussnguyen0220@gmail.com",
      color: "from-red-500 to-pink-500",
      available: "Phản hồi trong 2h",
    },
    {
      icon: Facebook,
      title: "Facebook",
      description: "Nhắn tin qua Facebook",
      value: "Tú Quangg",
      link: "https://www.facebook.com/tu.quangg.195068/",
      color: "from-blue-600 to-blue-500",
      available: "24/7",
    },
    {
      icon: Phone,
      title: "Hotline",
      description: "Gọi điện hỗ trợ",
      value: "0328.551.707",
      link: "tel:0328551707",
      color: "from-green-500 to-emerald-500",
      available: "8:00 - 22:00",
    },
  ]

  return (
    <div className="bg-transparent min-h-screen relative overflow-x-hidden pt-20 transition-colors duration-300">
      <ThemeAwareBackground />
      <FloatingHeader />

      <main className="container mx-auto px-4 py-24 relative z-10">
        <div className="text-center mb-16">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100 mb-4">
            Trung tâm{" "}
            <span className="bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">hỗ trợ</span>
          </h1>
          <p className="text-gray-600 dark:text-gray-400 text-lg max-w-2xl mx-auto">
            Chúng tôi luôn sẵn sàng hỗ trợ bạn 24/7. Hãy liên hệ với chúng tôi qua các kênh dưới đây
          </p>
        </div>

        {/* Contact Methods */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
          {contactMethods.map((method, index) => (
            <Card
              key={index}
              className="bg-white/60 dark:bg-black/40 backdrop-blur-xl border-white/60 dark:border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.05)] dark:shadow-2xl hover:border-purple-500/50 transition-all duration-300 group relative z-10"
            >
              <CardContent className="p-6 text-center">
                <div
                  className={`inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-r ${method.color} mb-4 group-hover:scale-110 transition-transform duration-300`}
                >
                  <method.icon className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">{method.title}</h3>
                <p className="text-gray-600 dark:text-gray-400 text-sm mb-3">{method.description}</p>
                <p className="text-gray-900 dark:text-gray-100 font-medium mb-3">{method.value}</p>
                <Badge variant="secondary" className="bg-white/10 text-gray-300 mb-4">
                  {method.available}
                </Badge>
                <a href={method.link} target="_blank" rel="noopener noreferrer">
                  <Button className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white">
                    Liên hệ ngay
                  </Button>
                </a>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Support Tabs */}
        <Tabs defaultValue="faq" className="space-y-8">
          <TabsList className="bg-black/5 dark:bg-white/10 backdrop-blur-sm border-black/10 dark:border-white/20 grid w-full grid-cols-3">
            <TabsTrigger value="faq" className="data-[state=active]:bg-purple-600 data-[state=active]:text-white text-gray-600 dark:text-gray-300">
              <HelpCircle className="w-4 h-4 mr-2" />
              FAQ
            </TabsTrigger>
            <TabsTrigger value="contact" className="data-[state=active]:bg-purple-600 data-[state=active]:text-white text-gray-600 dark:text-gray-300">
              <Mail className="w-4 h-4 mr-2" />
              Liên hệ
            </TabsTrigger>
            <TabsTrigger value="guides" className="data-[state=active]:bg-purple-600 data-[state=active]:text-white text-gray-600 dark:text-gray-300">
              <FileText className="w-4 h-4 mr-2" />
              Hướng dẫn
            </TabsTrigger>
          </TabsList>

          <TabsContent value="faq" className="space-y-6">
            <Card className="bg-white/60 dark:bg-black/40 backdrop-blur-xl border-white/60 dark:border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.05)] dark:shadow-2xl relative z-10">
              <CardHeader>
                <CardTitle className="text-gray-900 dark:text-gray-100">Câu hỏi thường gặp</CardTitle>
                <CardDescription className="text-gray-600 dark:text-gray-400">
                  Tìm câu trả lời cho những câu hỏi phổ biến nhất
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {faqs.map((faq, index) => (
                    <div key={index} className="border-b border-black/10 dark:border-white/10 pb-6 last:border-b-0">
                      <h3 className="text-gray-900 dark:text-gray-100 font-semibold text-lg mb-3">{faq.question}</h3>
                      <p className="text-gray-600 dark:text-gray-400 leading-relaxed">{faq.answer}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="contact" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Chat với Admin (nếu đã đăng nhập) */}
              {currentUser ? (
                <Card className="bg-white/60 dark:bg-black/40 backdrop-blur-xl border-white/60 dark:border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.05)] dark:shadow-2xl relative z-10">
                  <CardHeader>
                    <CardTitle className="text-gray-900 dark:text-gray-100 flex items-center">
                      <MessageCircle className="w-5 h-5 mr-2" />
                      Chat trực tiếp với Admin
                    </CardTitle>
                    <CardDescription className="text-gray-600 dark:text-gray-400">
                      Gửi tin nhắn và nhận phản hồi realtime từ admin
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {/* Chat Messages */}
                    <div className="flex flex-col h-[500px] border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden bg-gray-50 dark:bg-gray-900/50 relative shadow-inner">
                      {/* Messages Area */}
                      <div ref={scrollAreaRef} className="flex-1 overflow-y-auto p-4 space-y-6 scroll-smooth">
                        {chatMessages.length === 0 ? (
                          <div className="flex flex-col items-center justify-center h-full text-center space-y-3 opacity-50">
                            <MessageCircle className="w-12 h-12 text-gray-400" />
                            <p className="text-gray-500">Chưa có tin nhắn nào.<br />Hãy gửi lời chào đến đội ngũ hỗ trợ!</p>
                          </div>
                        ) : (
                          chatMessages.map((msg) => {
                            const isMe = !msg.isAdmin
                            const isAI = msg.senderType === 'ai'
                            const isAdminUser = msg.senderType === 'admin' || (msg.isAdmin && !isAI)

                            return (
                              <div
                                key={msg.id}
                                className={`flex items-end gap-2 ${isMe ? 'justify-end' : 'justify-start'}`}
                              >
                                {/* Avatar cho Admin/AI (Bên trái) */}
                                {!isMe && (
                                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${isAI ? 'bg-gradient-to-br from-indigo-500 to-purple-500' : 'bg-gradient-to-br from-pink-500 to-rose-500'
                                    }`}>
                                    {isAI ? <Bot className="w-4 h-4 text-white" /> : <ShieldCheck className="w-4 h-4 text-white" />}
                                  </div>
                                )}

                                <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} max-w-[75%]`}>
                                  {/* Sender Name & Badge */}
                                  <div className="flex items-center gap-2 mb-1 px-1">
                                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                                      {isMe ? 'Bạn' : (isAI ? 'Trợ lý AI' : 'Admin')}
                                    </span>
                                    {!isMe && (
                                      <Badge variant="outline" className={`text-[10px] py-0 h-4 border-none ${isAI ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300'
                                        : 'bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300'
                                        }`}>
                                        {isAI ? '24/7' : 'Support'}
                                      </Badge>
                                    )}
                                  </div>

                                  {/* Message Bubble */}
                                  <div
                                    className={`relative px-4 py-2.5 rounded-2xl text-sm ${isMe
                                      ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-br-sm shadow-md'
                                      : 'bg-white/80 dark:bg-gray-800/80 backdrop-blur-md text-gray-900 dark:text-gray-100 rounded-bl-sm border border-black/5 dark:border-gray-700 shadow-sm'
                                      }`}
                                  >
                                    <p className="whitespace-pre-wrap leading-relaxed">{msg.message}</p>
                                  </div>

                                  {/* Timestamp */}
                                  <span className="text-[10px] text-gray-400 mt-1 px-1">
                                    {new Date(msg.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                </div>
                              </div>
                            )
                          })
                        )}

                        {/* Typing Indicator */}
                        {isTyping && (
                          <div className="flex items-end gap-2 justify-start">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center flex-shrink-0">
                              <Bot className="w-4 h-4 text-white" />
                            </div>
                            <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-md border border-black/5 dark:border-gray-700 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm flex items-center gap-1">
                              <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                              <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                              <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                            </div>
                          </div>
                        )}
                        <div ref={chatEndRef} />
                      </div>

                      {/* Message Input */}
                      <div className="p-3 bg-white/50 dark:bg-gray-900/50 backdrop-blur-xl border-t border-black/10 dark:border-gray-800">
                        {error && (
                          <p className="text-xs text-red-500 mb-2 px-2 animate-fade-in">{error}</p>
                        )}
                        <div className="flex items-end gap-2 relative">
                          <Textarea
                            placeholder="Nhập tin nhắn..."
                            value={messageText}
                            onChange={(e) => {
                              setMessageText(e.target.value)
                              if (error) setError("")
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault()
                                handleSendChatMessage()
                              }
                            }}
                            rows={1}
                            className="min-h-[44px] max-h-[120px] resize-none rounded-xl pr-12 bg-black/5 dark:bg-gray-800/80 border-transparent focus:border-purple-500 focus:bg-white/80 dark:focus:bg-gray-900/80 text-gray-900 dark:text-white transition-all text-sm backdrop-blur-sm"
                          />
                          <Button
                            onClick={handleSendChatMessage}
                            disabled={!messageText.trim() || isLoadingChat}
                            size="icon"
                            className="absolute right-1 bottom-1 h-9 w-9 rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white shadow-md transition-transform active:scale-95"
                          >
                            <Send className="w-4 h-4 ml-0.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Card className="bg-white/60 dark:bg-black/40 backdrop-blur-xl border-white/60 dark:border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.05)] dark:shadow-2xl relative z-10">
                  <CardHeader>
                    <CardTitle className="text-gray-900 dark:text-gray-100">Đăng nhập để chat</CardTitle>
                    <CardDescription className="text-gray-600 dark:text-gray-400">
                      Vui lòng đăng nhập để sử dụng tính năng chat với admin
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <a href="/auth/login">
                      <Button className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white">
                        Đăng nhập ngay
                      </Button>
                    </a>
                  </CardContent>
                </Card>
              )}

              {/* Contact Form */}
              <Card className="bg-white/60 dark:bg-black/40 backdrop-blur-xl border-white/60 dark:border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.05)] dark:shadow-2xl relative z-10">
                <CardHeader>
                  <CardTitle className="text-gray-900 dark:text-gray-100">Gửi tin nhắn</CardTitle>
                  <CardDescription className="text-gray-600 dark:text-gray-400">
                    Điền form dưới đây và chúng tôi sẽ phản hồi trong vòng 2 giờ
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form className="space-y-4" onSubmit={handleSendContactForm}>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-gray-900 dark:text-gray-100 text-sm font-medium mb-2">Họ và tên</label>
                        <Input
                          placeholder="Nguyễn Văn A"
                          value={contactForm.name}
                          onChange={(e) => setContactForm(prev => ({ ...prev, name: e.target.value }))}
                          className="bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/20 text-gray-900 dark:text-gray-100 placeholder:text-gray-500 dark:placeholder:text-gray-400"
                        />
                      </div>
                      <div>
                        <label className="block text-gray-900 dark:text-gray-100 text-sm font-medium mb-2">Email</label>
                        <Input
                          type="email"
                          placeholder="your@email.com"
                          value={contactForm.email}
                          onChange={(e) => setContactForm(prev => ({ ...prev, email: e.target.value }))}
                          className="bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/20 text-gray-900 dark:text-gray-100 placeholder:text-gray-500 dark:placeholder:text-gray-400"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-gray-900 dark:text-gray-100 text-sm font-medium mb-2">Chủ đề</label>
                      <Input
                        placeholder="Vấn đề cần hỗ trợ"
                        value={contactForm.subject}
                        onChange={(e) => setContactForm(prev => ({ ...prev, subject: e.target.value }))}
                        className="bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/20 text-gray-900 dark:text-gray-100 placeholder:text-gray-500 dark:placeholder:text-gray-400"
                      />
                    </div>
                    <div>
                      <label className="block text-gray-900 dark:text-gray-100 text-sm font-medium mb-2">Nội dung</label>
                      <Textarea
                        placeholder="Mô tả chi tiết vấn đề bạn gặp phải..."
                        rows={5}
                        value={contactForm.message}
                        onChange={(e) => setContactForm(prev => ({ ...prev, message: e.target.value }))}
                        className="bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/20 text-gray-900 dark:text-gray-100 placeholder:text-gray-500 dark:placeholder:text-gray-400"
                      />
                    </div>
                    <Button
                      type="submit"
                      className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white"
                    >
                      Gửi tin nhắn
                    </Button>
                  </form>
                </CardContent>
              </Card>

              <Card className="bg-white/60 dark:bg-black/40 backdrop-blur-xl border-white/60 dark:border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.05)] dark:shadow-2xl relative z-10">
                <CardHeader>
                  <CardTitle className="text-gray-900 dark:text-gray-100">Thông tin liên hệ</CardTitle>
                  <CardDescription className="text-gray-600 dark:text-gray-400">Các cách khác để liên hệ với chúng tôi</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-4">
                    <div className="flex items-start space-x-4">
                      <div className="bg-gradient-to-r from-blue-500 to-cyan-500 p-3 rounded-lg">
                        <MessageCircle className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <h4 className="text-gray-900 dark:text-gray-100 font-semibold">Zalo</h4>
                        <p className="text-gray-600 dark:text-gray-400 text-sm">Chat trực tiếp 24/7</p>
                        <a
                          href="https://files.catbox.moe/kb9350.jpg"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-purple-400 hover:text-purple-300 text-sm"
                        >
                          Quét mã QR để chat
                        </a>
                      </div>
                    </div>

                    <div className="flex items-start space-x-4">
                      <div className="bg-gradient-to-r from-red-500 to-pink-500 p-3 rounded-lg">
                        <Mail className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <h4 className="text-gray-900 dark:text-gray-100 font-semibold">Email</h4>
                        <p className="text-gray-600 dark:text-gray-400 text-sm">Phản hồi trong 2 giờ</p>
                        <a
                          href="mailto:trachduong93@gmail.com"
                          className="text-purple-400 hover:text-purple-300 text-sm"
                        >
                          trachduong93@gmail.com
                        </a>
                      </div>
                    </div>

                    <div className="flex items-start space-x-4">
                      <div className="bg-gradient-to-r from-blue-600 to-blue-500 p-3 rounded-lg">
                        <Facebook className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <h4 className="text-gray-900 dark:text-gray-100 font-semibold">Facebook</h4>
                        <p className="text-gray-600 dark:text-gray-400 text-sm">Nhắn tin qua Messenger</p>
                        <a
                          href="https://www.facebook.com/tu.quangg.195068/"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-purple-400 hover:text-purple-300 text-sm"
                        >
                          Qtusdev Official
                        </a>
                      </div>
                    </div>

                    <div className="flex items-start space-x-4">
                      <div className="bg-gradient-to-r from-green-500 to-emerald-500 p-3 rounded-lg">
                        <Clock className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <h4 className="text-gray-900 dark:text-gray-100 font-semibold">Giờ làm việc</h4>
                        <p className="text-gray-600 dark:text-gray-400 text-sm">Thứ 2 - Chủ nhật</p>
                        <p className="text-gray-900 dark:text-gray-100 text-sm">8:00 - 22:00 (GMT+7)</p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white/5 rounded-lg p-4">
                    <h4 className="text-gray-900 dark:text-gray-100 font-semibold mb-2">Cam kết hỗ trợ</h4>
                    <ul className="text-gray-600 dark:text-gray-400 text-sm space-y-1">
                      <li>• Phản hồi trong vòng 2 giờ</li>
                      <li>• Hỗ trợ cài đặt miễn phí</li>
                      <li>• Bảo hành mã nguồn 30 ngày</li>
                      <li>• Cập nhật miễn phí</li>
                    </ul>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="guides" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[
                {
                  title: "Hướng dẫn đăng ký tài khoản",
                  description: "Cách tạo tài khoản và xác thực email",
                  icon: Users,
                },
                {
                  title: "Hướng dẫn nạp tiền",
                  description: "Các phương thức nạp tiền và xác nhận giao dịch",
                  icon: MessageCircle,
                },
                {
                  title: "Hướng dẫn mua mã nguồn",
                  description: "Quy trình mua và tải về mã nguồn",
                  icon: FileText,
                },
                {
                  title: "Hướng dẫn cài đặt",
                  description: "Cách cài đặt và chạy mã nguồn",
                  icon: HelpCircle,
                },
                {
                  title: "Chính sách hoàn tiền",
                  description: "Điều kiện và quy trình hoàn tiền",
                  icon: Mail,
                },
                {
                  title: "Bảo mật tài khoản",
                  description: "Cách bảo vệ tài khoản của bạn",
                  icon: Users,
                },
              ].map((guide, index) => (
                <Card
                  key={index}
                  className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl border-black/5 dark:border-gray-700 hover:border-purple-500/50 transition-all duration-300 group cursor-pointer shadow-sm"
                >
                  <CardContent className="p-6">
                    <div className="flex items-center space-x-4 mb-4">
                      <div className="bg-gradient-to-r from-purple-600 to-pink-600 p-3 rounded-lg group-hover:scale-110 transition-transform duration-300">
                        <guide.icon className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <h3 className="text-gray-900 dark:text-gray-100 font-semibold group-hover:text-purple-400 transition-colors">
                          {guide.title}
                        </h3>
                        <p className="text-gray-600 dark:text-gray-400 text-sm">{guide.description}</p>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-black/10 dark:border-white/20 text-gray-700 dark:text-gray-200 hover:bg-black/5 dark:hover:bg-white/10 bg-transparent"
                    >
                      Xem hướng dẫn
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </main>

      <Footer />
    </div>
  )
}
