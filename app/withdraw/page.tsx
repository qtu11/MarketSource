"use client"

import { useState, useEffect, useRef, useMemo } from "react"
import { logger } from "@/lib/logger-client"
import { getDeviceInfo, getIPAddress } from "@/lib/auth"
import { apiPost, apiGet } from "@/lib/api-client"
import { User, Withdrawal } from "@/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Wallet, Building2, CheckCircle, Clock, XCircle, ArrowRight, Sparkles, Shield, Zap, TrendingUp, ChevronDown, User as UserIcon, AlertTriangle } from "lucide-react"
import { useRouter } from "next/navigation"
import { FloatingHeader } from "@/components/floating-header"
import { Footer } from "@/components/footer"
import dynamic from "next/dynamic"

// Lazy load Three.js components
const ThreeJSProductShowcase = dynamic(
  async () => {
    try {
      const mod = await import("@/components/three-js-product-showcase")
      return { default: mod.ThreeJSProductShowcase }
    } catch (error) {
      logger.error('Failed to load ThreeJS Product Showcase component', error)
      throw error
    }
  },
  {
    ssr: false,
    loading: () => <div className="absolute inset-0 bg-gradient-to-b from-slate-900 to-black" />
  }
)

const ThreeDFallback = dynamic(
  async () => {
    try {
      const mod = await import("@/components/3d-fallback")
      return { default: mod.ThreeDFallback }
    } catch (error) {
      logger.error('Failed to load 3D Fallback component', error)
      throw error
    }
  },
  { ssr: false }
)

const BANKS_LIST = [
  { id: "agribank", name: "Ngân hàng Nông nghiệp và Phát triển Nông thôn Việt Nam", shortName: "Agribank" },
  { id: "bidv", name: "Ngân hàng TMCP Đầu tư và Phát triển Việt Nam", shortName: "BIDV" },
  { id: "vietcombank", name: "Ngân hàng TMCP Ngoại thương Việt Nam", shortName: "Vietcombank" },
  { id: "vietinbank", name: "Ngân hàng TMCP Công thương Việt Nam", shortName: "VietinBank" },
  { id: "acb", name: "Ngân hàng TMCP Á Châu", shortName: "ACB" },
  { id: "techcombank", name: "Ngân hàng TMCP Kỹ thương Việt Nam", shortName: "Techcombank" },
  { id: "mbbank", name: "Ngân hàng TMCP Quân đội", shortName: "MB Bank" },
  { id: "vpbank", name: "Ngân hàng TMCP Việt Nam Thịnh Vượng", shortName: "VPBank" },
  { id: "sacombank", name: "Ngân hàng TMCP Sài Gòn Thương Tín", shortName: "Sacombank" },
  { id: "tpbank", name: "Ngân hàng TMCP Tiên Phong", shortName: "TPBank" },
  { id: "ocb", name: "Ngân hàng TMCP Phương Đông", shortName: "OCB" },
  { id: "msb", name: "Ngân hàng TMCP Hàng Hải Việt Nam", shortName: "MSB" },
  { id: "vib", name: "Ngân hàng TMCP Quốc tế Việt Nam", shortName: "VIB" },
  { id: "shb", name: "Ngân hàng TMCP Sài Gòn – Hà Nội", shortName: "SHB" },
  { id: "dongabank", name: "Ngân hàng TMCP Đông Á", shortName: "DongA Bank" },
  { id: "momo", name: "Ví Điện Tử MoMo", shortName: "MoMo" },
  { id: "zalopay", name: "Ví Điện Tử ZaloPay", shortName: "ZaloPay" },
  { id: "vnpay", name: "Ví Điện Tử VNPAY", shortName: "VNPAY" }
]

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

    const colors = ["236,72,153", "16,185,129", "245,158,11", "59,130,246"]

    for (let i = 0; i < 50; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        z: Math.random() * 1000,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        vz: (Math.random() - 0.5) * 1.5,
        size: Math.random() * 3 + 1,
        color: colors[Math.floor(Math.random() * colors.length)],
        alpha: Math.random() * 0.4 + 0.1,
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
      style={{ opacity: 0.5 }}
    />
  )
}

function StepIndicator({ step, currentStep }: { step: number; currentStep: number }) {
  const isActive = currentStep >= step
  const isCurrent = currentStep === step
  return (
    <div className={`
      flex items-center justify-center w-10 h-10 rounded-full text-sm font-bold transition-all duration-500 z-10
      ${isCurrent
        ? "bg-gradient-to-br from-pink-500 to-rose-600 text-white shadow-lg shadow-pink-500/30 scale-110 border-2 border-white/20"
        : isActive
          ? "bg-gradient-to-br from-emerald-400 to-green-500 text-white shadow-lg shadow-green-500/20"
          : "bg-white/5 text-white/40 border-2 border-white/10"
      }
    `}>
      {isActive && currentStep > step ? <CheckCircle className="w-5 h-5" /> : step}
    </div>
  )
}

export default function WithdrawPage() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([])

  const [withdrawData, setWithdrawData] = useState({
    selectedBank: "",
    accountNumber: "",
    accountName: "",
    amount: "",
    note: ""
  })

  const [isLoading, setIsLoading] = useState(false)
  const [submitSuccess, setSubmitSuccess] = useState(false)
  const [showHistory, setShowHistory] = useState(false)

  useEffect(() => {
    let refreshInterval: NodeJS.Timeout;

    const checkAndLoadUser = async () => {
      const { userManager } = await import('@/lib/userManager');
      if (!userManager.isLoggedIn()) {
        router.push("/auth/login?returnUrl=/withdraw")
        return
      }
      const baseUser = await userManager.getUser()
      if (baseUser && (baseUser.uid || baseUser.email)) {
        const fetchFreshData = async () => {
          const freshUser = await userManager.getUserData(baseUser.uid || baseUser.email || '');
          if (freshUser) {
            setUser(freshUser as User);
          } else {
            setUser(baseUser as User);
          }
        };

        await fetchFreshData();
        loadUserWithdrawals(baseUser.email || '');

        // Auto sync balance every 5 seconds
        refreshInterval = setInterval(fetchFreshData, 5000);
      } else {
        router.push("/auth/login?returnUrl=/withdraw")
      }
    }
    checkAndLoadUser()

    const handleUserUpdate = async () => {
      const { userManager } = await import('@/lib/userManager');
      const baseUser = await userManager.getUser()
      if (baseUser && (baseUser.uid || baseUser.email)) {
        const freshUser = await userManager.getUserData(baseUser.uid || baseUser.email || '');
        setUser((freshUser || baseUser) as User);
        loadUserWithdrawals(baseUser.email || '');
      }
    }

    window.addEventListener("userUpdated", handleUserUpdate)

    return () => {
      window.removeEventListener("userUpdated", handleUserUpdate)
      if (refreshInterval) clearInterval(refreshInterval);
    }
  }, [router])

  const loadUserWithdrawals = async (email: string) => {
    try {
      const result = await apiGet('/api/withdrawals');
      const userWithdrawals = result.withdrawals?.filter((w: any) =>
        w.userEmail === email || w.user_email === email
      ) || [];

      const mappedWithdrawals: Withdrawal[] = userWithdrawals.map((w: any) => ({
        id: w.id,
        userId: w.user_id || w.userId,
        userEmail: w.userEmail || w.user_email || null,
        userName: w.userName || w.user_name || null,
        amount: w.amount,
        bankName: w.bank_name || w.bankName || null,
        accountNumber: w.account_number || w.accountNumber || null,
        accountName: w.account_name || w.accountName || null,
        status: w.status || 'pending',
        requestTime: w.created_at || w.requestTime || new Date(),
        created_at: w.created_at
      }));

      setWithdrawals(mappedWithdrawals.sort((a, b) => {
        const timeA = a.requestTime ? new Date(a.requestTime).getTime() : 0;
        const timeB = b.requestTime ? new Date(b.requestTime).getTime() : 0;
        return timeB - timeA;
      }));
    } catch (error) {
      logger.error("Error loading withdrawals", error)
      setWithdrawals([])
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || isLoading) return
    setIsLoading(true)

    try {
      if (!withdrawData.selectedBank) throw new Error("Vui lòng chọn ngân hàng")
      if (!withdrawData.accountNumber || !/^[0-9]{8,15}$/.test(withdrawData.accountNumber)) {
        throw new Error("Vui lòng nhập số tài khoản hợp lệ (8-15 chữ số)")
      }
      if (!withdrawData.accountName || withdrawData.accountName.trim().length < 3) {
        throw new Error("Vui lòng nhập họ tên chủ tài khoản (tối thiểu 3 ký tự)")
      }
      if (!withdrawData.amount || parseInt(withdrawData.amount) < 5000) {
        throw new Error("Số tiền rút tối thiểu là 5,000đ")
      }

      const withdrawAmount = parseInt(withdrawData.amount)
      const selectedBank = BANKS_LIST.find(b => b.id === withdrawData.selectedBank)

      if (!selectedBank) throw new Error("Ngân hàng không hợp lệ")

      const userBalance = typeof user.balance === 'string' ? parseFloat(user.balance) : (user.balance || 0);
      if (withdrawAmount > userBalance) {
        throw new Error(`Số dư không đủ. Số dư hiện tại: ${userBalance.toLocaleString("vi-VN")}đ`)
      }

      const deviceInfo = getDeviceInfo()
      const ipAddress = await getIPAddress()

      await apiPost('/api/withdrawals', {
        userId: user.uid || user.id,
        amount: withdrawAmount,
        bankName: selectedBank.name,
        accountNumber: withdrawData.accountNumber,
        accountName: withdrawData.accountName,
        userEmail: user.email,
        deviceInfo,
        ipAddress,
      });

      window.dispatchEvent(new Event("withdrawalsUpdated"))
      setSubmitSuccess(true)

      setTimeout(() => {
        setSubmitSuccess(false)
        setWithdrawData({
          selectedBank: "",
          accountNumber: "",
          accountName: "",
          amount: "",
          note: ""
        })
      }, 3000)

      setTimeout(() => {
        if (user.email) loadUserWithdrawals(user.email);
      }, 500);

    } catch (error: any) {
      alert(error.message || 'Có lỗi xảy ra')
    } finally {
      setIsLoading(false)
    }
  }

  const getStatusBadge = (status: string | undefined) => {
    switch (status) {
      case "pending":
        return <Badge className="bg-amber-500/20 text-amber-400 border border-amber-500/30"><Clock className="w-3 h-3 mr-1" />Chờ duyệt</Badge>
      case "approved":
        return <Badge className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"><CheckCircle className="w-3 h-3 mr-1" />Hoàn tất</Badge>
      case "rejected":
        return <Badge className="bg-rose-500/20 text-rose-400 border border-rose-500/30"><XCircle className="w-3 h-3 mr-1" />Từ chối</Badge>
      default:
        return <Badge className="bg-white/10 text-white/50">Không xác định</Badge>
    }
  }

  const pendingWithdrawalTotal = useMemo(
    () =>
      withdrawals
        .filter((w) => w.status === "pending")
        .reduce((sum, w) => sum + Number(w.amount || 0), 0),
    [withdrawals]
  )

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a1a]">
        <div className="relative">
          <div className="w-16 h-16 border-4 border-pink-500/30 border-t-pink-500 rounded-full animate-spin" />
          <div className="w-12 h-12 border-4 border-rose-500/30 border-t-rose-500 rounded-full animate-spin absolute top-2 left-2" style={{ animationDirection: 'reverse', animationDuration: '0.8s' }} />
        </div>
      </div>
    )
  }

  const withdrawAmount = parseInt(withdrawData.amount) || 0
  const userBalance = typeof user.balance === 'string' ? parseFloat(user.balance) : (user.balance || 0);

  let currentStep = 1;
  if (withdrawData.selectedBank) currentStep = 2;
  if (withdrawData.selectedBank && withdrawData.accountNumber && withdrawData.accountName) currentStep = 3;

  return (
    <div className="min-h-screen bg-[#0a0a1a] relative overflow-hidden">
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full bg-pink-600/10 blur-[120px] animate-pulse" style={{ animationDuration: '4s' }} />
        <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full bg-rose-600/10 blur-[120px] animate-pulse" style={{ animationDuration: '6s' }} />
      </div>

      <Animated3DBackground />
      <FloatingHeader />

      <div className="container mx-auto px-4 pt-24 pb-16 relative z-10">
        <div className="text-center mb-10 animate-fade-in-down">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 backdrop-blur-sm mb-6">
            <Sparkles className="w-4 h-4 text-pink-400" />
            <span className="text-sm text-white/70">Rút tiền an toàn & bảo mật</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-white via-pink-200 to-rose-200 bg-clip-text text-transparent mb-4">
            Rút Tiền Khỏi Ví
          </h1>
          <p className="text-white/50 text-lg max-w-xl mx-auto">
            Hỗ trợ rút qua tất cả các ngân hàng Việt Nam, duyệt và xử lý nhanh chóng
          </p>

          <div className="inline-flex flex-col sm:flex-row items-stretch sm:items-center gap-4 mt-8 px-8 py-4 rounded-2xl bg-gradient-to-r from-emerald-500/10 to-green-500/10 border border-emerald-500/20 backdrop-blur-xl max-w-lg mx-auto">
            <div className="flex items-center gap-4">
              <Wallet className="w-6 h-6 text-emerald-400 shrink-0" />
              <div className="text-left min-w-0">
                <p className="text-xs text-emerald-300/60 uppercase tracking-wider">Số dư ví hiện tại</p>
                <p className="text-2xl font-bold text-emerald-400">
                  {userBalance.toLocaleString("vi-VN")}đ
                </p>
              </div>
            </div>
            <div className="text-left text-xs text-white/50 border-t sm:border-t-0 sm:border-l border-white/10 pt-3 sm:pt-0 sm:pl-4 sm:max-w-[280px] leading-relaxed">
              {pendingWithdrawalTotal > 0 && (
                <p className="text-amber-200/90 mb-1.5">
                  <span className="font-semibold">{pendingWithdrawalTotal.toLocaleString("vi-VN")}đ</span> đang chờ duyệt — đã tạm trừ khi bạn gửi yêu cầu. Nếu admin từ chối, tiền được hoàn lại ví.
                </p>
              )}
              <p>
                Hệ thống trừ số dư ngay lúc gửi lệnh rút để không ai rút vượt quá số dư trong lúc chờ xử lý. Sau khi duyệt, khoản này được chuyển ra ngoài theo STK bạn đã nhập.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 max-w-2xl mx-auto mb-10">
          {[
            { icon: Shield, label: "Mã hoá AES-256", color: "text-emerald-400" },
            { icon: Zap, label: "Duyệt nhanh", color: "text-amber-400" },
            { icon: TrendingUp, label: "Miễn phí rút", color: "text-pink-400" },
          ].map((stat, i) => (
            <div key={i} className="flex flex-col items-center justify-center gap-1.5 py-3 px-2 rounded-xl bg-white/5 border border-white/5 backdrop-blur-sm">
              <stat.icon className={`w-5 h-5 ${stat.color}`} />
              <span className="text-xs text-white/60 font-medium whitespace-nowrap">{stat.label}</span>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-center gap-2 md:gap-4 mb-10 max-w-md mx-auto relative px-4">
          <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-0.5 bg-white/10 z-0"></div>
          <div className="absolute left-0 top-1/2 -translate-y-1/2 h-0.5 bg-gradient-to-r from-pink-500 to-rose-600 z-0 transition-all duration-500" style={{ width: currentStep === 1 ? '0%' : currentStep === 2 ? '50%' : '100%' }}></div>
          <StepIndicator step={1} currentStep={currentStep} />
          <div className="flex-1"></div>
          <StepIndicator step={2} currentStep={currentStep} />
          <div className="flex-1"></div>
          <StepIndicator step={3} currentStep={currentStep} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 max-w-6xl mx-auto">
          {/* ========== LEFT: FORM ========== */}
          <div className="lg:col-span-3 space-y-6">
            <form onSubmit={handleSubmit} className="space-y-6">

              {/* STEP 1: Ngân hàng */}
              <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] backdrop-blur-xl p-6 transition-all duration-300 hover:bg-white/[0.05]">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center text-white text-sm font-bold">1</div>
                  <h3 className="text-lg font-semibold text-white">Chọn ngân hàng thụ hưởng</h3>
                </div>

                <div className="space-y-2">
                  <Select
                    value={withdrawData.selectedBank}
                    onValueChange={(value) => setWithdrawData(prev => ({ ...prev, selectedBank: value }))}
                  >
                    <SelectTrigger className="h-14 bg-white/5 border-white/10 text-white rounded-xl focus:ring-pink-500/30 focus:border-pink-500/50">
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-white/40" />
                        <SelectValue placeholder="Chọn ngân hàng của bạn" />
                      </div>
                    </SelectTrigger>
                    <SelectContent className="max-h-[300px] bg-slate-900 border-white/10 text-white">
                      {BANKS_LIST.map((bank) => (
                        <SelectItem key={bank.id} value={bank.id} className="hover:bg-white/10 focus:bg-white/10 cursor-pointer">
                          <div className="py-1 flex flex-col items-start text-left">
                            <span className="font-medium text-pink-300">{bank.shortName}</span>
                            <span className="text-xs text-white/50">{bank.name}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* STEP 2: Thông tin */}
              <div className={`rounded-2xl bg-white/[0.03] border border-white/[0.06] backdrop-blur-xl p-6 transition-all duration-500 ${currentStep < 2 ? 'opacity-40 pointer-events-none' : 'hover:bg-white/[0.05]'}`}>
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center text-white text-sm font-bold">2</div>
                  <h3 className="text-lg font-semibold text-white">Thông tin Nhận tiền</h3>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="accountNumber" className="text-white/70">Số tài khoản nhận*</Label>
                    <Input
                      id="accountNumber"
                      type="text"
                      placeholder="Ví dụ: 09............"
                      value={withdrawData.accountNumber}
                      onChange={(e) => setWithdrawData(prev => ({ ...prev, accountNumber: e.target.value.replace(/\D/g, '') }))}
                      required
                      className="h-12 bg-white/5 border-white/10 text-white placeholder:text-white/30 rounded-xl focus:border-purple-500/50 focus:ring-purple-500/20"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="accountName" className="text-white/70">Tên chủ tài khoản*</Label>
                    <Input
                      id="accountName"
                      type="text"
                      placeholder="Ví dụ: NGUYEN VAN A"
                      value={withdrawData.accountName}
                      onChange={(e) => setWithdrawData(prev => ({ ...prev, accountName: e.target.value.toUpperCase() }))}
                      required
                      className="h-12 bg-white/5 border-white/10 text-white placeholder:text-white/30 rounded-xl focus:border-purple-500/50 focus:ring-purple-500/20 uppercase"
                    />
                    <p className="text-xs text-white/30 flex items-center gap-1 mt-1">
                      <AlertTriangle className="w-3 h-3 text-amber-500" /> Phải nhập TÊN KHÔNG DẤU IN HOA, khớp thông tin ngân hàng!
                    </p>
                  </div>
                </div>
              </div>

              {/* STEP 3: Tiền rút & Xác nhận */}
              <div className={`rounded-2xl bg-white/[0.03] border border-white/[0.06] backdrop-blur-xl p-6 transition-all duration-500 ${currentStep < 3 ? 'opacity-40 pointer-events-none' : 'hover:bg-white/[0.05]'}`}>
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center text-white text-sm font-bold">3</div>
                  <h3 className="text-lg font-semibold text-white">Số tiền rút & Ghi chú</h3>
                </div>

                <div className="space-y-4 border-b border-white/10 pb-6 mb-4">
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <Label htmlFor="amount" className="text-white/70">Số tiền muốn rút (VNĐ)*</Label>
                      <button type="button" onClick={() => setWithdrawData(prev => ({ ...prev, amount: userBalance.toString() }))} className="text-xs text-pink-400 font-medium hover:text-pink-300">Rút toàn bộ</button>
                    </div>
                    <div className="relative">
                      <Input
                        id="amount"
                        type="number"
                        placeholder="Tối thiểu: 5,000đ"
                        value={withdrawData.amount}
                        onChange={(e) => setWithdrawData(prev => ({ ...prev, amount: e.target.value }))}
                        min="5000"
                        step="1000"
                        required
                        className="h-14 lg:text-lg bg-white/5 border-white/10 text-white placeholder:text-white/30 rounded-xl focus:border-emerald-500/50 focus:ring-emerald-500/20 pr-16"
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 font-medium">VNĐ</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="note" className="text-white/70">Ghi chú (Tùy chọn)</Label>
                    <Textarea
                      id="note"
                      placeholder="Lời nhắn cho Admin..."
                      value={withdrawData.note}
                      onChange={(e) => setWithdrawData(prev => ({ ...prev, note: e.target.value }))}
                      className="bg-white/5 border-white/10 text-white placeholder:text-white/30 rounded-xl focus:border-emerald-500/50 focus:ring-emerald-500/20 min-h-[80px]"
                    />
                  </div>

                  {withdrawAmount > 0 && Math.floor(withdrawAmount) <= userBalance && (
                    <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-4 space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-white/60">Số tiền rút:</span>
                        <span className="text-white font-bold">{withdrawAmount.toLocaleString("vi-VN")}đ</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-white/60">Số dư hiện tại:</span>
                        <span className="text-white">{userBalance.toLocaleString("vi-VN")}đ</span>
                      </div>
                      <div className="h-px bg-emerald-500/20 my-2"></div>
                      <div className="flex justify-between text-sm">
                        <span className="text-emerald-300 font-medium">Số dư sau khi rút:</span>
                        <span className="text-emerald-400 font-bold">{(userBalance - withdrawAmount).toLocaleString("vi-VN")}đ</span>
                      </div>
                    </div>
                  )}

                  {withdrawAmount > userBalance && withdrawAmount > 0 && (
                    <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-3 flex items-center gap-3">
                      <XCircle className="w-5 h-5 text-red-400" />
                      <span className="text-red-400 text-sm font-medium">Số dư của bạn không đủ để rút số tiền này!</span>
                    </div>
                  )}
                </div>

                <Button
                  type="submit"
                  disabled={isLoading || withdrawAmount < 5000 || withdrawAmount > userBalance}
                  className="w-full h-14 rounded-xl bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 text-white text-base font-semibold shadow-lg shadow-pink-500/25 transition-all duration-300 hover:shadow-pink-500/40 hover:scale-[1.02] disabled:opacity-40 disabled:pointer-events-none"
                >
                  {isLoading ? (
                    <div className="flex items-center gap-3">
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Đang thực hiện...
                    </div>
                  ) : submitSuccess ? (
                    <div className="flex items-center gap-3">
                      <CheckCircle className="w-5 h-5" />
                      Yêu cầu thành công!
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <Sparkles className="w-5 h-5" />
                      Xác nhận rút tiền
                      <ArrowRight className="w-4 h-4" />
                    </div>
                  )}
                </Button>
              </div>
            </form>
          </div>

          {/* ========== RIGHT: HISTORY ========== */}
          <div className="lg:col-span-2">
            <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] backdrop-blur-xl overflow-hidden sticky top-24">
              <button
                onClick={() => setShowHistory(!showHistory)}
                className="w-full flex items-center justify-between p-5 lg:pointer-events-none"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                    <Clock className="w-4 h-4 text-white" />
                  </div>
                  <div className="text-left">
                    <h3 className="text-base font-semibold text-white">Lịch sử rút tiền</h3>
                    <p className="text-xs text-white/40">{withdrawals.length} giao dịch gần đây</p>
                  </div>
                </div>
                <ChevronDown className={`w-5 h-5 text-white/40 lg:hidden transition-transform ${showHistory ? 'rotate-180' : ''}`} />
              </button>

              <div className={`${showHistory ? 'block' : 'hidden'} lg:block`}>
                <div className="px-5 pb-5 space-y-3 max-h-[600px] overflow-y-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10">
                  {withdrawals.length === 0 ? (
                    <div className="text-center py-12 border border-dashed border-white/10 rounded-xl bg-white/[0.01]">
                      <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4">
                        <Wallet className="w-8 h-8 text-white/20" />
                      </div>
                      <p className="text-white/40 text-sm font-medium">Chưa phát sinh giao dịch</p>
                      <p className="text-white/20 text-xs mt-1">Lịch sử rút tiền sẽ được lưu ở đây</p>
                    </div>
                  ) : (
                    withdrawals.map((withdrawal, idx) => (
                      <div
                        key={withdrawal.id || idx}
                        className="group p-4 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.08] transition-all duration-300"
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <div className={`p-1.5 rounded-lg ${withdrawal.status === 'approved' ? 'bg-emerald-500/10 text-emerald-400' : withdrawal.status === 'rejected' ? 'bg-rose-500/10 text-rose-400' : 'bg-amber-500/10 text-amber-400'}`}>
                              <ArrowRight className="w-4 h-4" />
                            </div>
                            <div>
                              <p className="font-bold text-white tracking-tight">
                                {typeof withdrawal.amount === 'number' ? withdrawal.amount.toLocaleString("vi-VN") : withdrawal.amount}đ
                              </p>
                              <span className="text-[11px] px-1.5 py-0.5 rounded bg-white/5 text-white/50 border border-white/10 uppercase font-medium">
                                {(withdrawal as any).bankShortName || withdrawal.bankName || "Unknown"}
                              </span>
                            </div>
                          </div>
                          {getStatusBadge(withdrawal.status)}
                        </div>

                        <div className="bg-white/5 rounded-lg p-2 flex items-center gap-2 mb-2">
                          <UserIcon className="w-3.5 h-3.5 text-white/30" />
                          <span className="text-xs text-white/60 font-medium">{(withdrawal.accountName || '').toUpperCase()} • {withdrawal.accountNumber}</span>
                        </div>

                        <div className="flex justify-between items-center px-1">
                          <p className="text-xs text-white/30 font-medium font-mono">
                            #{(withdrawal.id || '').toString().padStart(6, '0')}
                          </p>
                          <p className="text-xs text-white/30 italic">
                            {withdrawal.created_at || withdrawal.requestTime ? new Date((withdrawal.created_at || withdrawal.requestTime) as string | number | Date).toLocaleString("vi-VN") : ''}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="mt-6 rounded-2xl bg-white/[0.03] border border-white/[0.06] backdrop-blur-xl p-5">
              <h4 className="flex items-center gap-2 text-sm font-semibold text-white/80 mb-3">
                <AlertTriangle className="w-4 h-4 text-amber-500" /> Lưu ý quan trọng
              </h4>
              <ul className="space-y-2 text-xs text-white/50">
                <li className="flex gap-2">
                  <span className="text-pink-500">•</span> Admin sẽ kiểm tra và giải ngân định kỳ các khung giờ trong ngày.
                </li>
                <li className="flex gap-2">
                  <span className="text-pink-500">•</span> Sai thông tin ngân hàng hệ thống sẽ từ chối và hoàn tiền về ví web.
                </li>
                <li className="flex gap-2">
                  <span className="text-pink-500">•</span> Rút tiền miễn phí giao dịch 100%. Tối thiểu là 5,000 VNĐ.
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  )
}