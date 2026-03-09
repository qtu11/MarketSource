"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { MessageSquare, Phone, Send } from 'lucide-react'

interface SettingProps {
  adminUser: any
  stats: {
    totalUsers: number
    totalRevenue: number
  }
  testTelegramNotification: () => void
  testWhatsAppNotification: () => void
}

export function Setting({
  adminUser,
  stats,
  testTelegramNotification,
  testWhatsAppNotification
}: SettingProps) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="neon-border-hover glass-panel text-slate-900 dark:text-slate-100">
          <CardHeader>
            <CardTitle className="flex items-center ">
              <MessageSquare className="w-5 h-5 mr-2" />
              Thông báo Telegram
            </CardTitle>
            <CardDescription>
              Kiểm tra kết nối với Telegram Bot
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
              <p className="text-sm text-blue-800 dark:text-blue-200">
                <strong>Bot Token:</strong> {process.env.NEXT_PUBLIC_TELEGRAM_BOT_TOKEN ? '✅ Configured' : '❌ Not configured'}<br />
                <strong>Chat ID:</strong> {process.env.NEXT_PUBLIC_TELEGRAM_CHAT_ID ? '✅ Configured' : '❌ Not configured'}
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                ⚠️ Note: Không hiển thị token trực tiếp vì lý do bảo mật
              </p>
            </div>
            <Button onClick={testTelegramNotification} className="w-full">
              <Send className="w-4 h-4 mr-2" />
              Test Telegram
            </Button>
          </CardContent>
        </Card>

        <Card className="neon-border-hover glass-panel text-slate-900 dark:text-slate-100">
          <CardHeader>
            <CardTitle className="flex items-center">
              <Phone className="w-5 h-5 mr-2" />
              Thông báo WhatsApp
            </CardTitle>
            <CardDescription>
              Kiểm tra kết nối với WhatsApp
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
              <p className="text-sm text-green-800 dark:text-green-200">
                <strong>Số điện thoại:</strong> {process.env.NEXT_PUBLIC_TWILIO_WHATSAPP_NUMBER}<br />
                <strong>Trạng thái:</strong> Sẵn sàng
              </p>
            </div>
            <Button onClick={testWhatsAppNotification} className="w-full">
              <Phone className="w-4 h-4 mr-2" />
              Test WhatsApp
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card className="neon-border-hover glass-panel text-slate-900 dark:text-slate-100">
        <CardHeader>
          <CardTitle>Thông tin hệ thống</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Phiên bản</p>
              <p className="font-medium">v1.0.0</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Đăng nhập lần cuối</p>
              <p className="font-medium">{new Date(adminUser.loginTime).toLocaleString('vi-VN')}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Tổng người dùng</p>
              <p className="font-medium">{stats.totalUsers}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Tổng doanh thu</p>
              <p className="font-medium text-green-600">
                {stats.totalRevenue.toLocaleString('vi-VN')}đ
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}