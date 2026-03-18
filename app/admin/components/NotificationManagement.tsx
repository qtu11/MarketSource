"use client"

import { useState, useEffect, useCallback } from "react"
import { logger } from "@/lib/logger-client"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Bell, Send, Users, User, Search, Mail, Eye, BellRing, Settings2 } from "lucide-react"
import { apiGet, apiPost } from "@/lib/api-client"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"

interface Notification {
  id: string | number
  user_id: number
  user_email?: string
  user_name?: string
  type: 'system' | 'deposit' | 'withdraw' | 'chat' | 'promotion'
  title: string
  message: string
  is_read: boolean
  created_at: string
}

interface User {
  id: number
  email: string
  name: string
}

export function NotificationManagement() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [selectedFilterUser, setSelectedFilterUser] = useState<string>("all")
  const [filterType, setFilterType] = useState<string>("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [isSending, setIsSending] = useState(false)

  // Form state
  const [newNotification, setNewNotification] = useState({
    userId: "all",
    type: "system" as const,
    title: "",
    message: "",
    sendEmail: false,
    sendSystem: true
  })

  // Load users
  const loadUsers = useCallback(async () => {
    try {
      // ✅ FIX: Dùng api/get-users được thiết kế cho admin
      const result = await apiGet('/api/get-users')
      if (result.success && result.users) {
        setUsers(result.users)
      } else if (Array.isArray(result.users)) {
        setUsers(result.users)
      } else if (result.data && Array.isArray(result.data)) {
        setUsers(result.data)
      }
    } catch (error) {
      logger.error('Error loading users', error)
    }
  }, [])

  // Load notifications
  const loadNotifications = useCallback(async () => {
    try {
      setIsLoading(true)
      const result = await apiGet('/api/admin/notifications')

      if (result.success && result.notifications) {
        const sorted = result.notifications.sort((a: Notification, b: Notification) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )
        setNotifications(sorted)
      }
    } catch (error) {
      logger.error('Error loading notifications', error)
      setNotifications([])
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadUsers()
    loadNotifications()

    const interval = setInterval(loadNotifications, 30000)
    return () => clearInterval(interval)
  }, [loadUsers, loadNotifications])

  // Filter notifications
  const filteredNotifications = notifications.filter(n => {
    const matchesUser = selectedFilterUser === "all" || n.user_id?.toString() === selectedFilterUser
    const matchesType = filterType === "all" || n.type === filterType
    const matchesSearch = searchQuery === "" ||
      n.message?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      n.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      n.user_email?.toLowerCase().includes(searchQuery.toLowerCase())

    return matchesUser && matchesType && matchesSearch
  })

  // Send notification
  const handleSendNotification = async () => {
    try {
      if (!newNotification.message) {
        alert("Vui lòng nhập nội dung thông báo!")
        return
      }

      if (!newNotification.sendEmail && !newNotification.sendSystem) {
        alert("Vui lòng chọn ít nhất một phương thức gửi (Hệ thống hoặc Email)!")
        return
      }

      setIsSending(true)

      const payload = {
        userId: newNotification.userId,
        type: newNotification.type,
        title: newNotification.title || "Thông báo từ quản trị viên",
        message: newNotification.message,
        sendEmail: newNotification.sendEmail,
        sendSystem: newNotification.sendSystem
      }

      // ✅ Gửi qua API unified send-notification
      const res = await apiPost('/api/admin/send-notification', payload)

      if (res.success) {
        alert(`Đã gửi thông báo thành công!`)
        // Reset form
        setNewNotification({
          userId: "all",
          type: "system",
          title: "",
          message: "",
          sendEmail: false,
          sendSystem: true
        })
        loadNotifications()
      } else {
        alert(`Gửi thất bại: ${res.error || "Lỗi không xác định"}`)
      }
    } catch (error: any) {
      logger.error('Error sending notification', error)
      alert("Có lỗi xảy ra: " + (error.message || "Vui lòng thử lại"))
    } finally {
      setIsSending(false)
    }
  }

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'deposit': return '💰'
      case 'withdraw': return '💸'
      case 'chat': return '💬'
      case 'promotion': return '🎁'
      default: return '🔔'
    }
  }

  const getNotificationColor = (type: string) => {
    switch (type) {
      case 'deposit': return 'bg-green-500/10 text-green-500 border-green-500/20'
      case 'withdraw': return 'bg-blue-500/10 text-blue-500 border-blue-500/20'
      case 'chat': return 'bg-purple-500/10 text-purple-500 border-purple-500/20'
      case 'promotion': return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20'
      default: return 'bg-slate-500/10 text-slate-500 border-slate-500/20'
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            Trung tâm Thông báo
          </h2>
          <p className="text-muted-foreground">Phát hành thông báo hệ thống và gửi email marketing</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="px-3 py-1 border-blue-500/30 text-blue-500 bg-blue-500/5">
            <BellRing className="w-3 h-3 mr-1.5" />
            {notifications.filter(n => !n.is_read).length} thông báo mới
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Form Gửi - 5 columns */}
        <Card className="lg:col-span-5 border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden glass-panel">
          <CardHeader className="border-b border-white/10 bg-slate-50/50 dark:bg-slate-900/50">
            <CardTitle className="flex items-center gap-2 text-lg">
              <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500">
                <Send className="w-4 h-4" />
              </div>
              Tạo thông báo mới
            </CardTitle>
            <CardDescription>Chọn đối tượng và phương thức liên lạc</CardDescription>
          </CardHeader>
          <CardContent className="p-6 space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider opacity-60">Loại</Label>
                <Select
                  value={newNotification.type}
                  onValueChange={(value: any) => setNewNotification({ ...newNotification, type: value })}
                >
                  <SelectTrigger className="bg-white/5 border-white/10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="system">Hệ thống</SelectItem>
                    <SelectItem value="promotion">Khuyến mãi</SelectItem>
                    <SelectItem value="chat">Tin nhắn</SelectItem>
                    <SelectItem value="deposit">Tài chính</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider opacity-60">Người nhận</Label>
                <Select
                  value={newNotification.userId}
                  onValueChange={(value) => setNewNotification({ ...newNotification, userId: value })}
                >
                  <SelectTrigger className="bg-white/5 border-white/10">
                    <SelectValue placeholder="Chọn..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">🚀 Tất cả người dùng ({users.length})</SelectItem>
                    <ScrollArea className="h-60">
                      {users.map((user) => (
                        <SelectItem key={user.id} value={user.id.toString()}>
                          {user.name || user.email.split('@')[0]}
                        </SelectItem>
                      ))}
                    </ScrollArea>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider opacity-60">Tiêu đề</Label>
              <Input
                value={newNotification.title}
                onChange={(e) => setNewNotification({ ...newNotification, title: e.target.value })}
                placeholder="Nhập tiêu đề thu hút..."
                className="bg-white/5 border-white/10 focus:ring-blue-500"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider opacity-60">Nội dung</Label>
              <Textarea
                value={newNotification.message}
                onChange={(e) => setNewNotification({ ...newNotification, message: e.target.value })}
                placeholder="Nội dung truyền tải..."
                rows={6}
                className="bg-white/5 border-white/10 focus:ring-blue-500 resize-none"
              />
            </div>

            <div className="p-4 rounded-xl bg-slate-500/5 border border-white/5 space-y-4">
              <Label className="text-xs font-bold uppercase tracking-wider opacity-60 flex items-center gap-2">
                <Settings2 className="w-3 h-3" />
                Phương thức gửi
              </Label>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500">
                    <Bell className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Bảng tin hệ thống</p>
                    <p className="text-[10px] text-muted-foreground">Xuất hiện trong chuông thông báo</p>
                  </div>
                </div>
                <Switch
                  checked={newNotification.sendSystem}
                  onCheckedChange={(v) => setNewNotification({ ...newNotification, sendSystem: v })}
                />
              </div>
              <div className="flex items-center justify-between border-t border-white/5 pt-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-purple-500/10 text-purple-500">
                    <Mail className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Gửi tới Gmail</p>
                    <p className="text-[10px] text-muted-foreground">Gửi trực tiếp vào hòm thư khách</p>
                  </div>
                </div>
                <Switch
                  checked={newNotification.sendEmail}
                  onCheckedChange={(v) => setNewNotification({ ...newNotification, sendEmail: v })}
                />
              </div>
            </div>

            <Button
              onClick={handleSendNotification}
              className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-bold h-12 rounded-xl transition-all active:scale-95 disabled:opacity-50"
              disabled={isSending}
            >
              {isSending ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Phát hành thông báo
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Danh sách - 7 columns */}
        <Card className="lg:col-span-7 border-slate-200 dark:border-slate-800 shadow-xl glass-panel">
          <Tabs defaultValue="all" onValueChange={(value) => setFilterType(value)} className="w-full">
            <CardHeader className="border-b border-white/10 p-0">
              <div className="px-6 pt-6 pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Eye className="w-4 h-4 text-blue-500" />
                  Lịch sử thông báo
                </CardTitle>
              </div>
              <div className="px-6 pb-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Tìm theo tiêu đề, nội dung hoặc email..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 bg-white/5 border-white/10"
                  />
                </div>
              </div>
              <TabsList className="w-full justify-start rounded-none bg-transparent h-12 px-6 border-t border-white/5">
                <TabsTrigger value="all" className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-blue-500 rounded-none h-full transition-none">Tất cả</TabsTrigger>
                <TabsTrigger value="system" className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-blue-500 rounded-none h-full transition-none">Hệ thống</TabsTrigger>
                <TabsTrigger value="promotion" className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-blue-500 rounded-none h-full transition-none">Khuyến mãi</TabsTrigger>
              </TabsList>
            </CardHeader>

            <CardContent className="p-0">
              <ScrollArea className="h-[650px]">
                {isLoading ? (
                  <div className="flex flex-col items-center justify-center h-full py-20 grayscale opacity-50">
                    <div className="w-10 h-10 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin mb-4" />
                    <p className="text-sm font-medium">Đang truy vấn dữ liệu...</p>
                  </div>
                ) : filteredNotifications.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 opacity-30">
                    <Bell className="w-16 h-16 mb-4" />
                    <p className="font-semibold">Trống rỗng</p>
                    <p className="text-xs">Chưa có thông báo nào được lưu lại</p>
                  </div>
                ) : (
                  <div className="divide-y divide-white/5">
                    {filteredNotifications.map((n) => (
                      <div key={n.id} className="p-4 hover:bg-white/5 transition-colors group">
                        <div className="flex gap-4">
                          <div className="text-2xl pt-1">{getNotificationIcon(n.type)}</div>
                          <div className="flex-1 space-y-1">
                            <div className="flex items-center justify-between">
                              <Badge variant="outline" className={getNotificationColor(n.type)}>
                                {n.type}
                              </Badge>
                              <span className="text-[10px] opacity-40 italic">
                                {new Date(n.created_at).toLocaleString('vi-VN')}
                              </span>
                            </div>
                            <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200">
                              {n.title}
                            </h4>
                            <p className="text-xs text-muted-foreground line-clamp-2 group-hover:line-clamp-none transition-all">
                              {n.message}
                            </p>
                            <div className="pt-2 flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <User className="w-3 h-3 opacity-40" />
                                <span className="text-[10px] font-medium opacity-60">
                                  {n.user_email || "Toàn hệ thống"}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5 grayscale opacity-50 text-[10px]">
                                {n.is_read ? <Badge variant="secondary" className="px-1 py-0 h-4">Đã xem</Badge> : <Badge className="px-1 py-0 h-4 bg-blue-500">Mới</Badge>}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Tabs>
        </Card>
      </div>
    </div>
  )
}

