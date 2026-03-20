"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { MessageSquare, Phone, Send, Bot, Shield, Key, Save, Eye, EyeOff, RefreshCw, CheckCircle, AlertCircle } from 'lucide-react'
import { useState, useCallback, useEffect } from 'react'
import { apiGet } from "@/lib/api-client"

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
  const [showTokens, setShowTokens] = useState<Record<string, boolean>>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [tokens, setTokens] = useState({
    telegramBotToken: '',
    telegramChatId: '',
    whatsappNumber: '',
    geminiApiKey: '',
    hcaptchaSiteKey: '',
    hcaptchaSecret: '',
    smtpHost: '',
    smtpUser: '',
    smtpPass: '',
  })
  const [configStatus, setConfigStatus] = useState<Record<string, boolean>>({})

  // Load current settings status on mount
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const result = await apiGet('/api/settings')
        if (result.success && result.configStatus) {
           setConfigStatus(result.configStatus)
        }
      } catch (err) {
        console.error("Failed to fetch settings status", err)
      }
    }
    fetchStatus()
  }, [])

  const toggleShow = (key: string) => {
    setShowTokens(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      // ✅ FIX: Dùng apiPut wrapper tự động gửi CSRF token
      const { apiPut } = await import('@/lib/api-client')
      const result = await apiPut('/api/settings', { tokens })
      if (result?.success) {
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
      } else {
        alert(result?.error || 'Lỗi khi lưu cài đặt!')
      }
    } catch {
      alert('Không thể kết nối server!')
    } finally {
      setSaving(false)
    }
  }, [tokens])

  const TokenInput = ({ label, tokenKey, placeholder, icon: Icon }: { label: string; tokenKey: string; placeholder: string; icon: any }) => (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
        <Icon className="w-3.5 h-3.5" />
        {label}
      </Label>
      <div className="relative">
        <Input
          type={showTokens[tokenKey] ? "text" : "password"}
          className="bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500 pr-10 h-9 text-sm"
          value={(tokens as any)[tokenKey] || ""}
          placeholder={configStatus[tokenKey] ? "••••••••" : placeholder}
          onChange={(e) => setTokens(prev => ({ ...prev, [tokenKey]: e.target.value }))}
        />
        <button
          type="button"
          onClick={() => toggleShow(tokenKey)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
        >
          {showTokens[tokenKey] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  )

  return (
    <div className="space-y-6">
      {/* API Keys Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Telegram */}
        <Card className="neon-border-hover glass-panel text-slate-100 border-slate-700/50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center text-base">
              <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center mr-2">
                <MessageSquare className="w-4 h-4 text-blue-400" />
              </div>
              Telegram Bot
            </CardTitle>
            <CardDescription className="text-slate-400 text-xs">
              Nhận thông báo nạp/rút/đơn hàng qua Telegram
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <TokenInput label="Bot Token" tokenKey="telegramBotToken" placeholder="123456:ABCdefGhIjKlMnOpQrStUvWxYz" icon={Key} />
            <TokenInput label="Chat ID" tokenKey="telegramChatId" placeholder="-1001234567890" icon={MessageSquare} />
            <div className="flex items-center justify-between pt-2">
              <Badge variant="outline" className="text-[10px] border-blue-500/30 text-blue-400">
                {configStatus.telegramBotToken || configStatus.telegramChatId ? '✅ Đã cấu hình' : '⚠️ Chưa cấu hình'}
              </Badge>
              <Button size="sm" variant="outline" onClick={testTelegramNotification} className="h-8 text-xs border-blue-500/30 text-blue-400 hover:bg-blue-500/10">
                <Send className="w-3 h-3 mr-1" /> Test
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* WhatsApp */}
        <Card className="neon-border-hover glass-panel text-slate-100 border-slate-700/50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center text-base">
              <div className="w-8 h-8 rounded-lg bg-green-500/20 flex items-center justify-center mr-2">
                <Phone className="w-4 h-4 text-green-400" />
              </div>
              WhatsApp
            </CardTitle>
            <CardDescription className="text-slate-400 text-xs">
              Gửi thông báo qua WhatsApp Twilio
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <TokenInput label="Số WhatsApp" tokenKey="whatsappNumber" placeholder="whatsapp:+15706349642" icon={Phone} />
            <div className="flex items-center justify-between pt-2">
              <Badge variant="outline" className="text-[10px] border-green-500/30 text-green-400">
                {configStatus.whatsappNumber ? '✅ Đã cấu hình' : '⚠️ Chưa cấu hình'}
              </Badge>
              <Button size="sm" variant="outline" onClick={testWhatsAppNotification} className="h-8 text-xs border-green-500/30 text-green-400 hover:bg-green-500/10">
                <Phone className="w-3 h-3 mr-1" /> Test
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Gemini AI */}
        <Card className="neon-border-hover glass-panel text-slate-100 border-slate-700/50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center text-base">
              <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center mr-2">
                <Bot className="w-4 h-4 text-purple-400" />
              </div>
              Gemini AI
            </CardTitle>
            <CardDescription className="text-slate-400 text-xs">
              AI tự động trả lời chat khách hàng
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <TokenInput label="API Key" tokenKey="geminiApiKey" placeholder="AIzaSy..." icon={Key} />
            <div className="flex items-center justify-between pt-2">
              <Badge variant="outline" className="text-[10px] border-purple-500/30 text-purple-400">
                {configStatus.geminiApiKey ? '✅ Đã cấu hình' : '⚠️ Chưa cấu hình'}
              </Badge>
              <span className="text-[10px] text-slate-500">Model: gemini-2.0-flash</span>
            </div>
          </CardContent>
        </Card>

        {/* hCaptcha */}
        <Card className="neon-border-hover glass-panel text-slate-100 border-slate-700/50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center text-base">
              <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center mr-2">
                <Shield className="w-4 h-4 text-amber-400" />
              </div>
              hCaptcha
            </CardTitle>
            <CardDescription className="text-slate-400 text-xs">
              Bảo vệ form đăng ký/đăng nhập
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <TokenInput label="Site Key" tokenKey="hcaptchaSiteKey" placeholder="10000000-ffff-ffff-ffff..." icon={Key} />
            <TokenInput label="Secret Key" tokenKey="hcaptchaSecret" placeholder="0x..." icon={Shield} />
          </CardContent>
        </Card>

        {/* SMTP Email */}
        <Card className="neon-border-hover glass-panel text-slate-100 border-slate-700/50 lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center text-base">
              <div className="w-8 h-8 rounded-lg bg-rose-500/20 flex items-center justify-center mr-2">
                <Send className="w-4 h-4 text-rose-400" />
              </div>
              Email SMTP
            </CardTitle>
            <CardDescription className="text-slate-400 text-xs">
              Gửi OTP, thông báo qua email
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <TokenInput label="SMTP Host" tokenKey="smtpHost" placeholder="smtp.gmail.com" icon={Send} />
              <TokenInput label="Email" tokenKey="smtpUser" placeholder="your@gmail.com" icon={Send} />
              <TokenInput label="App Password" tokenKey="smtpPass" placeholder="xxxx xxxx xxxx xxxx" icon={Key} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Save Button */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">
          ⚠️ Thay đổi API tokens yêu cầu restart server để có hiệu lực
        </p>
        <Button
          onClick={handleSave}
          disabled={saving}
          className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white shadow-lg"
        >
          {saving ? (
            <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Đang lưu...</>
          ) : saved ? (
            <><CheckCircle className="w-4 h-4 mr-2" /> Đã lưu!</>
          ) : (
            <><Save className="w-4 h-4 mr-2" /> Lưu cài đặt</>
          )}
        </Button>
      </div>

      {/* System Info */}
      <Card className="neon-border-hover glass-panel text-slate-100 border-slate-700/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Thông tin hệ thống</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-[11px] text-slate-400">Phiên bản</p>
              <p className="font-medium text-sm">v1.0.0</p>
            </div>
            <div>
              <p className="text-[11px] text-slate-400">Đăng nhập cuối</p>
              <p className="font-medium text-sm">
                {adminUser?.loginTime ? new Date(adminUser.loginTime).toLocaleString('vi-VN') : 'N/A'}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-slate-400">Người dùng</p>
              <p className="font-medium text-sm">{stats.totalUsers}</p>
            </div>
            <div>
              <p className="text-[11px] text-slate-400">Doanh thu</p>
              <p className="font-medium text-sm text-green-400">
                {stats.totalRevenue.toLocaleString('vi-VN')}đ
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}