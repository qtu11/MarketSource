"use client"

import { useState, useEffect, useRef } from "react"
import { logger } from "@/lib/logger-client"
import { User, Deposit } from "@/types"
import { getLocalStorage, setLocalStorage } from "@/lib/localStorage-utils"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Wallet, CreditCard, Smartphone, Copy, CheckCircle, Clock, XCircle,
  ArrowRight, Sparkles, Shield, Zap, TrendingUp, ChevronDown, QrCode
} from "lucide-react"
import { useRouter } from "next/navigation"
import { getDeviceInfo, getIPAddress } from "@/lib/auth"
import { FloatingHeader } from "@/components/floating-header"
import { Footer } from "@/components/footer"
import { apiPost, apiGet } from "@/lib/api-client"
import Image from "next/image"

// ==================== PAYMENT METHODS ====================
const PAYMENT_METHODS = [
  {
    id: "mbbank",
    name: "MB Bank",
    icon: CreditCard,
    accountNumber: "0328551707",
    accountName: "NGUYEN QUANG TU",
    qrCode: "https://files.catbox.moe/wox1o7.jpg",
    logo: "https://files.catbox.moe/fq9mki.png",
    color: "from-blue-500 to-indigo-600",
    bgGlow: "rgba(59,130,246,0.15)",
  },
  {
    id: "momo",
    name: "Momo",
    icon: Smartphone,
    accountNumber: "0328551707",
    accountName: "NGUYEN QUANG TU",
    qrCode: "https://files.catbox.moe/s565tf.jpg",
    logo: "https://files.catbox.moe/4204yj.png",
    color: "from-pink-500 to-rose-600",
    bgGlow: "rgba(236,72,153,0.15)",
  },
  {
    id: "techcombank",
    name: "Techcombank",
    icon: CreditCard,
    accountNumber: "2002200710",
    accountName: "NGUYEN QUANG TU",
    qrCode: "https://files.catbox.moe/pb65ti.jpg",
    logo: "https://files.catbox.moe/y54uf2.jpg",
    color: "from-red-500 to-orange-600",
    bgGlow: "rgba(239,68,68,0.15)",
  },
  {
    id: "tpbank",
    name: "TPBank",
    icon: CreditCard,
    accountNumber: "00005372546",
    accountName: "NGUYEN QUANG TU",
    qrCode: "https://files.catbox.moe/9q3jn5.jpg",
    logo: "https://files.catbox.moe/hxmo0s.png",
    color: "from-purple-500 to-violet-600",
    bgGlow: "rgba(168,85,247,0.15)",
  }
]

const PRESET_AMOUNTS = [
  { value: 10000, label: "10K" },
  { value: 20000, label: "20K" },
  { value: 50000, label: "50K" },
  { value: 100000, label: "100K" },
  { value: 200000, label: "200K" },
  { value: 500000, label: "500K" },
  { value: 1000000, label: "1M" },
  { value: 2000000, label: "2M" },
]

// ==================== ANIMATED 3D BACKGROUND ====================
function Animated3DBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    let animId: number
    let particles: Array<{
      x: number; y: number; z: number;
      vx: number; vy: number; vz: number;
      size: number; color: string; alpha: number;
    }> = []

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener("resize", resize)

    // Create floating orbs
    const colors = [
      "139,92,246",   // purple
      "59,130,246",   // blue
      "236,72,153",   // pink
      "16,185,129",   // emerald
      "245,158,11",   // amber
    ]

    for (let i = 0; i < 60; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        z: Math.random() * 1000,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        vz: (Math.random() - 0.5) * 2,
        size: Math.random() * 4 + 1,
        color: colors[Math.floor(Math.random() * colors.length)],
        alpha: Math.random() * 0.5 + 0.1,
      })
    }

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      particles.forEach((p) => {
        p.x += p.vx
        p.y += p.vy
        p.z += p.vz

        if (p.x < 0 || p.x > canvas.width) p.vx *= -1
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1
        if (p.z < 0 || p.z > 1000) p.vz *= -1

        const scale = Math.max(0, (1000 - p.z) / 1000)
        const size = Math.max(0.1, p.size * scale * 3)
        const alpha = Math.max(0, p.alpha * scale)

        ctx.beginPath()
        const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, size)
        gradient.addColorStop(0, `rgba(${p.color}, ${alpha})`)
        gradient.addColorStop(1, `rgba(${p.color}, 0)`)
        ctx.fillStyle = gradient
        ctx.arc(p.x, p.y, size, 0, Math.PI * 2)
        ctx.fill()
      })

      // Draw connections between nearby particles
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x
          const dy = particles[i].y - particles[j].y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < 150) {
            const alpha = (1 - dist / 150) * 0.08
            ctx.beginPath()
            ctx.strokeStyle = `rgba(139,92,246, ${alpha})`
            ctx.lineWidth = 0.5
            ctx.moveTo(particles[i].x, particles[i].y)
            ctx.lineTo(particles[j].x, particles[j].y)
            ctx.stroke()
          }
        }
      }

      animId = requestAnimationFrame(animate)
    }

    animate()

    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener("resize", resize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-0"
      style={{ opacity: 0.6 }}
    />
  )
}

// ==================== STEP INDICATOR ====================
function StepIndicator({ step, currentStep }: { step: number; currentStep: number }) {
  const isActive = currentStep >= step
  const isCurrent = currentStep === step
  return (
    <div className={`
      flex items-center justify-center w-10 h-10 rounded-full text-sm font-bold transition-all duration-500
      ${isCurrent
        ? "bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-lg shadow-purple-500/30 scale-110"
        : isActive
          ? "bg-gradient-to-br from-emerald-400 to-green-500 text-white shadow-lg shadow-green-500/20"
          : "bg-white/10 text-white/40 border border-white/10"
      }
    `}>
      {isActive && currentStep > step ? <CheckCircle className="w-5 h-5" /> : step}
    </div>
  )
}

// ==================== MAIN COMPONENT ====================
export default function DepositPage() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [amount, setAmount] = useState("")
  const [selectedMethod, setSelectedMethod] = useState("")
  const [transactionId, setTransactionId] = useState("")
  const [deposits, setDeposits] = useState<Deposit[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [copiedField, setCopiedField] = useState("")
  const [step, setStep] = useState(1) // 1: Amount, 2: Method, 3: Confirm
  const [showHistory, setShowHistory] = useState(false)
  const [submitSuccess, setSubmitSuccess] = useState(false)

  // ==================== USER LOADING ====================
  useEffect(() => {
    const checkAndLoadUser = async () => {
      const { userManager } = await import('@/lib/userManager')
      if (!userManager.isLoggedIn()) {
        router.push("/auth/login?returnUrl=/deposit")
        return
      }
      const userData = await userManager.getUser()
      if (userData) {
        const mappedUser: User = {
          ...userData,
          id: Number((userData as any).id || 0),
          uid: userData.uid || '',
          email: userData.email || '',
          name: userData.name || (userData as any).displayName || null,
          username: (userData as any).username || (userData as any).displayName || null,
          role: (userData as any).role || 'user',
          status: (userData as any).status || 'active',
          balance: Number(userData.balance || 0),
          loginCount: Number((userData as any).loginCount || 0),
          created_at: (userData as any).created_at || new Date().toISOString(),
          updated_at: (userData as any).updated_at || new Date().toISOString(),
        } as User

        setUser(mappedUser)
        loadUserDeposits(userData.email || '')
      } else {
        router.push("/auth/login?returnUrl=/deposit")
      }
    }
    checkAndLoadUser()

    const handleUserUpdate = async () => {
      const { userManager } = await import('@/lib/userManager')
      const updatedUser = await userManager.getUser()
      if (updatedUser) {
        const mappedUser: User = {
          ...updatedUser,
          id: Number((updatedUser as any).id || 0),
          uid: updatedUser.uid || '',
          email: updatedUser.email || '',
          name: updatedUser.name || (updatedUser as any).displayName || null,
          username: (updatedUser as any).username || (updatedUser as any).displayName || null,
          role: (updatedUser as any).role || 'user',
          status: (updatedUser as any).status || 'active',
          balance: Number(updatedUser.balance || 0),
          loginCount: Number((updatedUser as any).loginCount || 0),
          created_at: (updatedUser as any).created_at || new Date().toISOString(),
          updated_at: (updatedUser as any).updated_at || new Date().toISOString(),
        } as User
        setUser(mappedUser)
        loadUserDeposits(updatedUser.email || '')
      }
    }
    window.addEventListener("userUpdated", handleUserUpdate)

    const refreshInterval = setInterval(() => {
      if (user?.email) loadUserDeposits(user.email)
    }, 30000)

    return () => {
      window.removeEventListener("userUpdated", handleUserUpdate)
      clearInterval(refreshInterval)
    }
  }, [router]) // eslint-disable-line react-hooks/exhaustive-deps

  // ==================== LOAD DEPOSITS ====================
  const loadUserDeposits = async (email: string) => {
    try {
      const result = await apiGet('/api/deposits')
      const userDeposits = result.deposits?.filter((d: Deposit | { userEmail?: string; user_email?: string }) =>
        d.userEmail === email || (d as { user_email?: string }).user_email === email
      ) || []

      const mappedDeposits: Deposit[] = userDeposits.map((d: Deposit | Record<string, unknown>) => ({
        id: (d as Deposit).id,
        userId: (d as { user_id?: number | string }).user_id || (d as Deposit).userId,
        userEmail: (d as Deposit).userEmail || (d as { user_email?: string }).user_email || null,
        userName: (d as Deposit).userName || (d as { user_name?: string }).user_name || null,
        amount: (d as Deposit).amount,
        method: (d as Deposit).method || null,
        transactionId: (d as Deposit).transactionId || (d as { transaction_id?: string }).transaction_id || null,
        status: (d as Deposit).status || 'pending',
        timestamp: (d as { timestamp?: string | Date }).timestamp || (d as Deposit).timestamp || (d as { created_at?: string | Date }).created_at || new Date(),
        created_at: (d as { created_at?: string | Date }).created_at || (d as Deposit).created_at
      }))

      setDeposits(mappedDeposits.sort((a, b) => {
        const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0
        const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0
        return timeB - timeA
      }))
    } catch (error) {
      logger.error("Error loading deposits", error)
      try {
        const allDeposits = getLocalStorage<Deposit[]>("deposits", [])
        const userDeposits = allDeposits.filter((d) => d.userEmail === email)
        setDeposits(userDeposits.sort((a, b) => {
          const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0
          const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0
          return timeB - timeA
        }))
      } catch (localError) {
        logger.error("Error loading from localStorage", localError)
      }
    }
  }

  // ==================== COPY TO CLIPBOARD ====================
  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text)
    setCopiedField(field)
    setTimeout(() => setCopiedField(""), 2000)
  }

  // ==================== HANDLE SUBMIT ====================
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || isLoading) return
    setIsLoading(true)

    try {
      if (!amount || !selectedMethod || !transactionId) {
        throw new Error("Vui lòng điền đầy đủ thông tin")
      }
      const depositAmount = parseInt(amount)
      if (depositAmount < 5000) {
        throw new Error("Số tiền nạp tối thiểu là 5,000đ")
      }
      const method = PAYMENT_METHODS.find(m => m.id === selectedMethod)
      if (!method) {
        throw new Error("Phương thức thanh toán không hợp lệ")
      }

      const deviceInfo = getDeviceInfo()
      const ipAddress = await getIPAddress()

      let depositRequest: Deposit & { accountName?: string; accountNumber?: string; requestTimeFormatted?: string; ipAddress?: string }
      try {
        const result = await apiPost('/api/deposits', {
          userId: user.uid || user.id,
          amount: depositAmount,
          method: method.name,
          transactionId,
          userEmail: user.email,
          userName: user.name || user.displayName || user.email,
          deviceInfo,
          ipAddress,
        })
        depositRequest = {
          id: result.deposit?.id || Date.now(),
          userId: user.uid || user.id,
          userEmail: user.email || null,
          userName: user.name || user.displayName || user.email || null,
          amount: depositAmount,
          method: method.name,
          accountName: method.accountName,
          accountNumber: method.accountNumber,
          transactionId,
          status: "pending",
          timestamp: result.deposit?.timestamp || new Date().toISOString(),
          requestTimeFormatted: result.deposit?.timestamp
            ? new Date(result.deposit.timestamp).toLocaleString("vi-VN")
            : new Date().toLocaleString("vi-VN"),
          created_at: result.deposit?.created_at || result.deposit?.timestamp || new Date().toISOString(),
          ipAddress,
        }
      } catch (apiError) {
        logger.error('API error, saving to localStorage as fallback', apiError)
        depositRequest = {
          id: Date.now(),
          userId: user.uid || user.id,
          userEmail: user.email || null,
          userName: user.name || user.displayName || user.email || null,
          amount: depositAmount,
          method: method.name,
          accountName: method.accountName,
          accountNumber: method.accountNumber,
          transactionId,
          status: "pending",
          timestamp: new Date().toISOString(),
          requestTimeFormatted: new Date().toLocaleString("vi-VN"),
          created_at: new Date().toISOString(),
          ipAddress,
        }
        const allDeposits = getLocalStorage<Deposit[]>("deposits", [])
        allDeposits.push(depositRequest as Deposit)
        setLocalStorage("deposits", allDeposits)
      }

      const notifications = getLocalStorage<Array<Record<string, unknown>>>("notifications", [])
      notifications.push({
        id: Date.now(),
        type: "deposit_request",
        title: "Yêu cầu nạp tiền mới",
        message: `${user.name} yêu cầu nạp ${depositAmount.toLocaleString("vi-VN")}đ qua ${method.name}`,
        user: { email: user.email, name: user.name, ipAddress },
        timestamp: new Date().toISOString(),
        read: false,
        depositInfo: depositRequest
      })
      setLocalStorage("notifications", notifications)

      window.dispatchEvent(new Event("depositsUpdated"))
      window.dispatchEvent(new Event("notificationsUpdated"))

      // Show success animation
      setSubmitSuccess(true)
      setTimeout(() => {
        setSubmitSuccess(false)
        setAmount("")
        setTransactionId("")
        setSelectedMethod("")
        setStep(1)
      }, 3000)

      setTimeout(() => {
        if (user.email) loadUserDeposits(user.email)
      }, 500)

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Có lỗi xảy ra'
      alert(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }

  // ==================== STATUS BADGE ====================
  const getStatusBadge = (status: string | undefined) => {
    switch (status) {
      case "pending":
        return (
          <Badge className="bg-amber-500/20 text-amber-400 border border-amber-500/30 backdrop-blur-sm">
            <Clock className="w-3 h-3 mr-1" />Chờ duyệt
          </Badge>
        )
      case "approved":
        return (
          <Badge className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 backdrop-blur-sm">
            <CheckCircle className="w-3 h-3 mr-1" />Đã duyệt
          </Badge>
        )
      case "rejected":
        return (
          <Badge className="bg-red-500/20 text-red-400 border border-red-500/30 backdrop-blur-sm">
            <XCircle className="w-3 h-3 mr-1" />Từ chối
          </Badge>
        )
      default:
        return <Badge className="bg-white/10 text-white/60">Không xác định</Badge>
    }
  }

  // ==================== LOADING STATE ====================
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a1a]">
        <div className="relative">
          <div className="w-16 h-16 border-4 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
          <div className="w-12 h-12 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin absolute top-2 left-2" style={{ animationDirection: 'reverse', animationDuration: '0.8s' }} />
        </div>
      </div>
    )
  }

  const selectedMethodInfo = PAYMENT_METHODS.find(m => m.id === selectedMethod)
  const depositAmount = parseInt(amount) || 0
  const currentStep = !amount || depositAmount < 5000 ? 1 : !selectedMethod ? 2 : 3

  return (
    <>
      <FloatingHeader />

      {/* ==================== ANIMATED BG ==================== */}
      <div className="min-h-screen bg-[#0a0a1a] relative overflow-hidden">
        {/* Gradient orbs */}
        <div className="fixed inset-0 pointer-events-none z-0">
          <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full bg-purple-600/20 blur-[120px] animate-pulse" style={{ animationDuration: '4s' }} />
          <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full bg-blue-600/20 blur-[120px] animate-pulse" style={{ animationDuration: '6s' }} />
          <div className="absolute top-[40%] left-[50%] w-[400px] h-[400px] rounded-full bg-pink-600/10 blur-[100px] animate-pulse" style={{ animationDuration: '5s' }} />
        </div>

        <Animated3DBackground />

        {/* ==================== MAIN CONTENT ==================== */}
        <div className="container mx-auto px-4 pt-24 pb-16 relative z-10">

          {/* Hero Section */}
          <div className="text-center mb-12 animate-fade-in-down">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 backdrop-blur-sm mb-6">
              <Sparkles className="w-4 h-4 text-purple-400" />
              <span className="text-sm text-white/70">Nạp tiền nhanh & an toàn</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-white via-purple-200 to-blue-200 bg-clip-text text-transparent mb-4">
              Nạp Tiền Tài Khoản
            </h1>
            <p className="text-white/50 text-lg max-w-xl mx-auto">
              Chuyển khoản ngân hàng hoặc ví điện tử, xử lý trong vài phút
            </p>

            {/* Balance Card */}
            <div className="inline-flex items-center gap-4 mt-8 px-8 py-4 rounded-2xl bg-gradient-to-r from-emerald-500/10 to-green-500/10 border border-emerald-500/20 backdrop-blur-xl">
              <Wallet className="w-6 h-6 text-emerald-400" />
              <div className="text-left">
                <p className="text-xs text-emerald-300/60 uppercase tracking-wider">Số dư hiện tại</p>
                <p className="text-2xl font-bold text-emerald-400">
                  {(user.balance || 0).toLocaleString("vi-VN")}đ
                </p>
              </div>
            </div>
          </div>

          {/* Stats Bar */}
          <div className="grid grid-cols-3 gap-4 max-w-2xl mx-auto mb-12">
            {[
              { icon: Shield, label: "Bảo mật 100%", color: "text-emerald-400" },
              { icon: Zap, label: "Xử lý < 5 phút", color: "text-amber-400" },
              { icon: TrendingUp, label: "Không phí nạp", color: "text-blue-400" },
            ].map((stat, i) => (
              <div key={i} className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-white/5 border border-white/5 backdrop-blur-sm">
                <stat.icon className={`w-4 h-4 ${stat.color}`} />
                <span className="text-xs text-white/60 font-medium">{stat.label}</span>
              </div>
            ))}
          </div>

          {/* Step Progress */}
          <div className="flex items-center justify-center gap-4 mb-10 max-w-md mx-auto">
            <StepIndicator step={1} currentStep={currentStep} />
            <div className={`flex-1 h-0.5 rounded-full transition-all duration-500 ${currentStep >= 2 ? 'bg-gradient-to-r from-violet-500 to-purple-600' : 'bg-white/10'}`} />
            <StepIndicator step={2} currentStep={currentStep} />
            <div className={`flex-1 h-0.5 rounded-full transition-all duration-500 ${currentStep >= 3 ? 'bg-gradient-to-r from-violet-500 to-purple-600' : 'bg-white/10'}`} />
            <StepIndicator step={3} currentStep={currentStep} />
          </div>

          {/* ==================== FORM + HISTORY GRID ==================== */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 max-w-6xl mx-auto">

            {/* ========== LEFT: DEPOSIT FORM ========== */}
            <div className="lg:col-span-3 space-y-6">
              <form onSubmit={handleSubmit} className="space-y-6">

                {/* STEP 1: Amount */}
                <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] backdrop-blur-xl p-6 transition-all duration-300 hover:bg-white/[0.05]">
                  <div className="flex items-center gap-3 mb-5">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white text-sm font-bold">1</div>
                    <h3 className="text-lg font-semibold text-white">Số tiền nạp</h3>
                  </div>

                  <div className="relative">
                    <Input
                      id="amount"
                      type="number"
                      placeholder="Nhập số tiền (tối thiểu 5,000đ)"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      min="5000"
                      step="1000"
                      required
                      className="h-14 text-lg bg-white/5 border-white/10 text-white placeholder:text-white/30 rounded-xl focus:border-purple-500/50 focus:ring-purple-500/20 pr-16"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 font-medium">VNĐ</span>
                  </div>

                  {/* Preset amounts */}
                  <div className="grid grid-cols-4 gap-2 mt-4">
                    {PRESET_AMOUNTS.map((preset) => (
                      <button
                        key={preset.value}
                        type="button"
                        onClick={() => setAmount(preset.value.toString())}
                        className={`
                          py-2.5 rounded-xl text-sm font-semibold transition-all duration-200
                          ${amount === preset.value.toString()
                            ? "bg-gradient-to-r from-violet-500 to-purple-600 text-white shadow-lg shadow-purple-500/25"
                            : "bg-white/5 text-white/60 border border-white/10 hover:bg-white/10 hover:text-white"
                          }
                        `}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>

                  {depositAmount > 0 && (
                    <div className="mt-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                      <p className="text-emerald-400 text-sm font-medium">
                        💰 Bạn sẽ nhận: <span className="text-lg font-bold">{depositAmount.toLocaleString("vi-VN")}đ</span>
                      </p>
                    </div>
                  )}
                </div>

                {/* STEP 2: Payment Method */}
                <div className={`rounded-2xl bg-white/[0.03] border border-white/[0.06] backdrop-blur-xl p-6 transition-all duration-500 ${currentStep < 2 ? 'opacity-40 pointer-events-none' : 'hover:bg-white/[0.05]'}`}>
                  <div className="flex items-center gap-3 mb-5">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-sm font-bold">2</div>
                    <h3 className="text-lg font-semibold text-white">Phương thức thanh toán</h3>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {PAYMENT_METHODS.map((method) => (
                      <button
                        key={method.id}
                        type="button"
                        onClick={() => setSelectedMethod(method.id)}
                        className={`
                          relative p-4 rounded-xl border transition-all duration-300 text-left group
                          ${selectedMethod === method.id
                            ? `bg-gradient-to-br ${method.color} border-transparent shadow-lg`
                            : "bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20"
                          }
                        `}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-lg overflow-hidden bg-white/10 flex items-center justify-center ${selectedMethod === method.id ? 'bg-white/20' : ''}`}>
                            <Image src={method.logo} alt={method.name} width={32} height={32} className="object-contain rounded" />
                          </div>
                          <span className={`font-semibold text-sm ${selectedMethod === method.id ? 'text-white' : 'text-white/70'}`}>
                            {method.name}
                          </span>
                        </div>
                        {selectedMethod === method.id && (
                          <div className="absolute top-2 right-2">
                            <CheckCircle className="w-5 h-5 text-white" />
                          </div>
                        )}
                      </button>
                    ))}
                  </div>

                  {/* Bank Info + QR Code */}
                  {selectedMethodInfo && (
                    <div className="mt-6 rounded-xl bg-white/5 border border-white/10 overflow-hidden animate-fade-in-up">
                      <div className="p-5 space-y-3">
                        <h4 className="text-white/80 font-semibold text-sm flex items-center gap-2">
                          <QrCode className="w-4 h-4 text-purple-400" />
                          Thông tin chuyển khoản
                        </h4>

                        {[
                          { label: "Ngân hàng", value: selectedMethodInfo.name, key: "bankName" },
                          { label: "Số tài khoản", value: selectedMethodInfo.accountNumber, key: "accountNumber" },
                          { label: "Chủ tài khoản", value: selectedMethodInfo.accountName, key: "accountName" },
                          { label: "Nội dung CK", value: `NAP ${user.email}`, key: "content" },
                        ].map((info) => (
                          <div key={info.key} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                            <span className="text-xs text-white/40">{info.label}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-white/80">{info.value}</span>
                              <button
                                type="button"
                                onClick={() => copyToClipboard(info.value, info.key)}
                                className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                              >
                                {copiedField === info.key
                                  ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                                  : <Copy className="w-3.5 h-3.5 text-white/40" />
                                }
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>

                      {selectedMethodInfo.qrCode && (
                        <div className="flex justify-center p-5 bg-white/[0.02] border-t border-white/5">
                          <div className="p-3 bg-white rounded-xl">
                            <Image
                              src={selectedMethodInfo.qrCode}
                              alt="QR Code"
                              width={180}
                              height={180}
                              className="w-44 h-44 object-contain rounded-lg"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* STEP 3: Transaction ID */}
                <div className={`rounded-2xl bg-white/[0.03] border border-white/[0.06] backdrop-blur-xl p-6 transition-all duration-500 ${currentStep < 3 ? 'opacity-40 pointer-events-none' : 'hover:bg-white/[0.05]'}`}>
                  <div className="flex items-center gap-3 mb-5">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center text-white text-sm font-bold">3</div>
                    <h3 className="text-lg font-semibold text-white">Xác nhận giao dịch</h3>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="transactionId" className="text-white/60 text-sm">Mã giao dịch</Label>
                      <Input
                        id="transactionId"
                        type="text"
                        placeholder="Nhập mã giao dịch từ ngân hàng/ví điện tử"
                        value={transactionId}
                        onChange={(e) => setTransactionId(e.target.value)}
                        required
                        className="mt-2 h-12 bg-white/5 border-white/10 text-white placeholder:text-white/30 rounded-xl focus:border-purple-500/50 focus:ring-purple-500/20"
                      />
                      <p className="text-xs text-white/30 mt-2">
                        Nhập mã giao dịch hoặc nội dung chuyển khoản để admin duyệt nhanh hơn
                      </p>
                    </div>

                    {/* Summary */}
                    {depositAmount > 0 && selectedMethodInfo && transactionId && (
                      <div className="rounded-xl bg-gradient-to-r from-violet-500/10 to-purple-500/10 border border-violet-500/20 p-4 space-y-2">
                        <p className="text-xs text-white/40 uppercase tracking-wider font-medium">Tóm tắt giao dịch</p>
                        <div className="flex justify-between text-sm">
                          <span className="text-white/60">Số tiền:</span>
                          <span className="text-white font-bold">{depositAmount.toLocaleString("vi-VN")}đ</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-white/60">Phương thức:</span>
                          <span className="text-white font-medium">{selectedMethodInfo.name}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-white/60">Mã GD:</span>
                          <span className="text-white font-medium">{transactionId}</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Submit Button */}
                  <Button
                    type="submit"
                    disabled={isLoading || !amount || !selectedMethod || !transactionId}
                    className="w-full mt-6 h-14 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white text-base font-semibold shadow-lg shadow-purple-500/25 transition-all duration-300 hover:shadow-purple-500/40 hover:scale-[1.02] disabled:opacity-40 disabled:pointer-events-none"
                  >
                    {isLoading ? (
                      <div className="flex items-center gap-3">
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Đang xử lý...
                      </div>
                    ) : submitSuccess ? (
                      <div className="flex items-center gap-3">
                        <CheckCircle className="w-5 h-5" />
                        Gửi thành công!
                      </div>
                    ) : (
                      <div className="flex items-center gap-3">
                        <Sparkles className="w-5 h-5" />
                        Gửi yêu cầu nạp tiền
                        <ArrowRight className="w-4 h-4" />
                      </div>
                    )}
                  </Button>
                </div>
              </form>
            </div>

            {/* ========== RIGHT: DEPOSIT HISTORY ========== */}
            <div className="lg:col-span-2">
              <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] backdrop-blur-xl overflow-hidden sticky top-24">
                <button
                  onClick={() => setShowHistory(!showHistory)}
                  className="w-full flex items-center justify-between p-5 lg:pointer-events-none"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
                      <Clock className="w-4 h-4 text-white" />
                    </div>
                    <div className="text-left">
                      <h3 className="text-base font-semibold text-white">Lịch sử nạp tiền</h3>
                      <p className="text-xs text-white/40">{deposits.length} giao dịch</p>
                    </div>
                  </div>
                  <ChevronDown className={`w-5 h-5 text-white/40 lg:hidden transition-transform ${showHistory ? 'rotate-180' : ''}`} />
                </button>

                <div className={`${showHistory ? 'block' : 'hidden'} lg:block`}>
                  <div className="px-5 pb-5 space-y-3 max-h-[600px] overflow-y-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10">
                    {deposits.length === 0 ? (
                      <div className="text-center py-12">
                        <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4">
                          <Wallet className="w-8 h-8 text-white/20" />
                        </div>
                        <p className="text-white/30 text-sm">Chưa có lịch sử nạp tiền</p>
                        <p className="text-white/20 text-xs mt-1">Giao dịch đầu tiên sẽ xuất hiện ở đây</p>
                      </div>
                    ) : (
                      deposits.map((deposit, index) => (
                        <div
                          key={deposit.id || index}
                          className="group p-4 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] transition-all duration-200"
                        >
                          <div className="flex items-start justify-between mb-2">
                            <div>
                              <p className="text-white font-bold text-base">
                                +{typeof deposit.amount === 'number' ? deposit.amount.toLocaleString("vi-VN") : deposit.amount}đ
                              </p>
                              <p className="text-xs text-white/40 mt-0.5">{deposit.method}</p>
                            </div>
                            {getStatusBadge(deposit.status)}
                          </div>
                          <div className="flex items-center justify-between">
                            <p className="text-xs text-white/30">
                              {deposit.timestamp ? new Date(deposit.timestamp).toLocaleString("vi-VN") : ''}
                            </p>
                            {deposit.transactionId && (
                              <p className="text-xs text-white/20 font-mono">
                                #{(deposit.transactionId || '').toString().slice(-8)}
                              </p>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Success Overlay */}
      {submitSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="text-center animate-bounce-in">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-emerald-400 to-green-500 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-emerald-500/30">
              <CheckCircle className="w-10 h-10 text-white" />
            </div>
            <h3 className="text-2xl font-bold text-white mb-2">Gửi thành công!</h3>
            <p className="text-white/60">Yêu cầu nạp tiền đang chờ admin duyệt</p>
          </div>
        </div>
      )}

      <Footer />

      {/* CSS Animations */}
      <style jsx global>{`
        @keyframes fade-in-down {
          from { opacity: 0; transform: translateY(-20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fade-in-up {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes bounce-in {
          0% { opacity: 0; transform: scale(0.3); }
          50% { opacity: 1; transform: scale(1.05); }
          70% { transform: scale(0.95); }
          100% { transform: scale(1); }
        }
        .animate-fade-in-down { animation: fade-in-down 0.6s ease-out; }
        .animate-fade-in-up { animation: fade-in-up 0.6s ease-out; }
        .animate-fade-in { animation: fade-in 0.3s ease-out; }
        .animate-bounce-in { animation: bounce-in 0.6s ease-out; }

        /* Custom scrollbar */
        .scrollbar-thin::-webkit-scrollbar { width: 4px; }
        .scrollbar-track-transparent::-webkit-scrollbar-track { background: transparent; }
        .scrollbar-thumb-white\\/10::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.1);
          border-radius: 100px;
        }
      `}</style>
    </>
  )
}