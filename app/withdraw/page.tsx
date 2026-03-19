"use client"

import { useState, useEffect } from "react"
import { logger } from "@/lib/logger-client"
import { getDeviceInfo, getIPAddress } from "@/lib/auth"
import { apiPost, apiGet } from "@/lib/api-client"
import { User, Withdrawal } from "@/types"
import { getLocalStorage, setLocalStorage } from "@/lib/localStorage-utils"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Wallet, CreditCard, Smartphone, CheckCircle, Clock, XCircle, AlertTriangle } from "lucide-react"
import { useRouter } from "next/navigation"
import { FloatingHeader } from "@/components/floating-header"
import { Footer } from "@/components/footer"
import dynamic from "next/dynamic"

// Lazy load Three.js components để tối ưu performance
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
    loading: () => <div className="absolute inset-0 bg-gradient-to-b from-purple-100 to-pink-100 dark:from-purple-900 dark:to-pink-900" />
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

// Danh sách đầy đủ ngân hàng Việt Nam
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
  { id: "namabank", name: "Ngân hàng TMCP Nam Á", shortName: "Nam A Bank" },
  { id: "bacabank", name: "Ngân hàng TMCP Bắc Á", shortName: "Bac A Bank" },
  { id: "vietcapitalbank", name: "Ngân hàng TMCP Bản Việt", shortName: "Viet Capital Bank" },
  { id: "kienlongbank", name: "Ngân hàng TMCP Kiên Long", shortName: "KienlongBank" },
  { id: "eximbank", name: "Ngân hàng TMCP Xuất Nhập Khẩu Việt Nam", shortName: "Eximbank" },
  { id: "vietabank", name: "Ngân hàng TMCP Việt Á", shortName: "VietABank" },
  { id: "abbank", name: "Ngân hàng TMCP An Bình", shortName: "ABBANK" },
  { id: "scb", name: "Ngân hàng TMCP Sài Gòn", shortName: "SCB" },
  { id: "baovietbank", name: "Ngân hàng TMCP Bảo Việt", shortName: "BaoViet Bank" },
  { id: "gpbank", name: "Ngân hàng TMCP Dầu Khí Toàn Cầu", shortName: "GPBank" },
  { id: "pvcombank", name: "Ngân hàng TMCP Đại Chúng Việt Nam", shortName: "PVcomBank" },
  { id: "seabank", name: "Ngân hàng TMCP Đông Nam Á", shortName: "SeABank" },
  { id: "trustbank", name: "Ngân hàng TMCP Đại Tín (CB Bank)", shortName: "TrustBank" },
  { id: "vietbank", name: "Ngân hàng TMCP Việt Nam Thương Tín", shortName: "VietBank" },
  { id: "lienvietpostbank", name: "Ngân hàng TMCP Liên Việt Post Bank", shortName: "LienVietPostBank" },
  { id: "saigonbank", name: "Ngân hàng TMCP Sài Gòn Công Thương", shortName: "Saigonbank" },
  { id: "pgbank", name: "Ngân hàng TMCP Xăng Dầu Petrolimex", shortName: "PG Bank" },
  { id: "ncb", name: "Ngân hàng TMCP Nam Việt (Navibank)", shortName: "NCB" },
  { id: "tinnghiabank", name: "Ngân hàng TMCP Việt Nam Tín Nghĩa", shortName: "TinNghia Bank" },
  { id: "standardchartered", name: "Ngân hàng TNHH MTV Standard Chartered Việt Nam", shortName: "Standard Chartered" },
  { id: "hsbc", name: "Ngân hàng TNHH MTV HSBC Việt Nam", shortName: "HSBC" },
  { id: "anz", name: "Ngân hàng TNHH MTV ANZ Việt Nam", shortName: "ANZ" },
  { id: "shinhan", name: "Ngân hàng TNHH MTV Shinhan Việt Nam", shortName: "Shinhan" },
  { id: "woori", name: "Ngân hàng TNHH MTV Woori Bank Việt Nam", shortName: "Woori Bank" },
  { id: "vrb", name: "Ngân hàng Liên doanh Việt – Nga", shortName: "VRB" },
]

export default function WithdrawPage() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [withdrawData, setWithdrawData] = useState({
    selectedBank: "",
    accountNumber: "",
    accountName: "",
    amount: "",
    note: ""
  })
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([])
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    // Check if user is logged in và sync với userManager
    const checkAndLoadUser = async () => {
      const { userManager } = await import('@/lib/userManager');
      
      if (!userManager.isLoggedIn()) {
        router.push("/auth/login?returnUrl=/withdraw")
        return
      }

      // Load user từ userManager để đảm bảo sync
      const userData = await userManager.getUser()
      if (userData) {
        // Map UserData to User type
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
        loadUserWithdrawals(userData.email || '')
      } else {
        router.push("/auth/login?returnUrl=/withdraw")
      }
    }

    checkAndLoadUser()

    // Listen for real-time updates
    const handleUserUpdate = async () => {
      const { userManager } = await import('@/lib/userManager');
      const updatedUser = await userManager.getUser()
      if (updatedUser) {
        // Map UserData to User type
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
        loadUserWithdrawals(updatedUser.email || '')
      }
    }

    window.addEventListener("userUpdated", handleUserUpdate)
    
    // ✅ BUG #10 FIX: Auto-refresh mỗi 30 giây thay vì 5 giây để tránh rate limit
    const refreshInterval = setInterval(() => {
      if (user?.email) {
        loadUserWithdrawals(user.email);
      }
    }, 30000);
    
    return () => {
      window.removeEventListener("userUpdated", handleUserUpdate)
      clearInterval(refreshInterval);
    }
  }, [router, user?.email])

  const loadUserWithdrawals = async (email: string) => {
    try {
      // Gọi API để lấy withdrawals từ PostgreSQL
      const result = await apiGet('/api/withdrawals');
      const userWithdrawals = result.withdrawals?.filter((w: Withdrawal | { userEmail?: string; user_email?: string }) => 
        w.userEmail === email || (w as { user_email?: string }).user_email === email
      ) || [];
      
      // Map để đồng nhất format
      const mappedWithdrawals: Withdrawal[] = userWithdrawals.map((w: Withdrawal | Record<string, unknown>) => ({
        id: (w as Withdrawal).id,
        userId: (w as { user_id?: number | string }).user_id || (w as Withdrawal).userId,
        userEmail: (w as Withdrawal).userEmail || (w as { user_email?: string }).user_email || null,
        userName: (w as Withdrawal).userName || (w as { user_name?: string }).user_name || null,
        amount: (w as Withdrawal).amount,
        bankName: (w as { bank_name?: string }).bank_name || null,
        accountNumber: (w as { account_number?: string }).account_number || null,
        accountName: (w as { account_name?: string }).account_name || null,
        status: (w as Withdrawal).status || 'pending',
        requestTime: (w as { created_at?: string | Date }).created_at || (w as Withdrawal).requestTime || new Date(),
        created_at: (w as { created_at?: string | Date }).created_at || (w as Withdrawal).created_at
      }));
      
      setWithdrawals(mappedWithdrawals.sort((a, b) => {
        const timeA = a.requestTime ? new Date(a.requestTime).getTime() : 0;
        const timeB = b.requestTime ? new Date(b.requestTime).getTime() : 0;
        return timeB - timeA;
      }));
    } catch (error) {
      logger.error("Error loading withdrawals", error);
      // Fallback to localStorage nếu API fail
      try {
        const allWithdrawals = getLocalStorage<Withdrawal[]>("withdrawals", []);
        const userWithdrawals = allWithdrawals.filter((w) => w.userEmail === email);
        setWithdrawals(userWithdrawals.sort((a, b) => {
          const timeA = a.requestTime ? new Date(a.requestTime).getTime() : 0;
          const timeB = b.requestTime ? new Date(b.requestTime).getTime() : 0;
          return timeB - timeA;
        }));
      } catch (localError) {
        logger.error("Error loading from localStorage", localError);
      }
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || isLoading) return

    setIsLoading(true)
    
    try {
      // Validate input
      if (!withdrawData.selectedBank) {
        throw new Error("Vui lòng chọn ngân hàng")
      }
      if (!withdrawData.accountNumber || !/^[0-9]{8,15}$/.test(withdrawData.accountNumber)) {
        throw new Error("Vui lòng nhập số tài khoản hợp lệ (8-15 chữ số)")
      }
      if (!withdrawData.accountName || withdrawData.accountName.trim().length < 3) {
        throw new Error("Vui lòng nhập họ tên chủ tài khoản (tối thiểu 3 ký tự)")
      }
      if (!withdrawData.amount || parseInt(withdrawData.amount) < 10000) {
        throw new Error("Số tiền rút tối thiểu là 10,000đ")
      }

      const withdrawAmount = parseInt(withdrawData.amount)
      const selectedBank = BANKS_LIST.find(b => b.id === withdrawData.selectedBank)
      
      if (!selectedBank) {
        throw new Error("Ngân hàng không hợp lệ")
      }

      const userBalance = typeof user.balance === 'string' ? parseFloat(user.balance) : (user.balance || 0);
      if (withdrawAmount > userBalance) {
        throw new Error(`Số dư không đủ. Số dư hiện tại: ${userBalance.toLocaleString("vi-VN")}đ`)
      }

      // Get device info and IP address trước
      const deviceInfo = getDeviceInfo()
      const ipAddress = await getIPAddress()
      const timestamp = new Date().toISOString()

      // Gọi API để lưu withdrawal vào PostgreSQL
      let withdrawRequest: Withdrawal & { bankId?: string; bankShortName?: string; requestTimeFormatted?: string; ipAddress?: string; deviceInfo?: unknown; userAgent?: string; processed?: boolean };
      try {
        const result = await apiPost('/api/withdrawals', {
          userId: user.uid || user.id,
          amount: withdrawAmount,
          bankName: selectedBank.name,
          accountNumber: withdrawData.accountNumber,
          accountName: withdrawData.accountName,
          userEmail: user.email,
          deviceInfo,
          ipAddress,
        });

        // Tạo withdrawal object từ response
        withdrawRequest = {
          id: result.withdrawal?.id || Date.now(),
          userId: user.uid || user.id,
          userEmail: user.email || null,
          userName: user.name || null,
          bankId: selectedBank.id,
          bankName: selectedBank.name,
          bankShortName: selectedBank.shortName,
          accountNumber: withdrawData.accountNumber,
          accountName: withdrawData.accountName,
          amount: withdrawAmount,
          requestTime: result.withdrawal?.created_at || timestamp,
          requestTimeFormatted: result.withdrawal?.created_at
            ? new Date(result.withdrawal.created_at).toLocaleString("vi-VN")
            : new Date(timestamp).toLocaleString("vi-VN"),
          ipAddress: ipAddress,
          deviceInfo: deviceInfo,
          userAgent: navigator.userAgent,
          status: "pending",
          approvedBy: null,
          approvedTime: null,
          processed: false,
          created_at: result.withdrawal?.created_at || timestamp
        };

        logger.debug('Withdrawal saved to PostgreSQL', { result });
      } catch (apiError: unknown) {
        logger.error('API error, saving to localStorage as fallback', apiError);
        
        // Fallback: Save to localStorage nếu API fail
        withdrawRequest = {
          id: Date.now(),
          userId: user.uid || user.id,
          userEmail: user.email || null,
          userName: user.name || null,
          bankId: selectedBank.id,
          bankName: selectedBank.name,
          bankShortName: selectedBank.shortName,
          accountNumber: withdrawData.accountNumber,
          accountName: withdrawData.accountName,
          amount: withdrawAmount,
          requestTime: timestamp,
          requestTimeFormatted: new Date(timestamp).toLocaleString("vi-VN"),
          ipAddress: ipAddress,
          deviceInfo: deviceInfo,
          userAgent: navigator.userAgent,
          status: "pending",
          approvedBy: null,
          approvedTime: null,
          processed: false,
          created_at: timestamp
        };

        const allWithdrawals = getLocalStorage<Withdrawal[]>("withdrawals", []);
        allWithdrawals.push(withdrawRequest as Withdrawal);
        setLocalStorage("withdrawals", allWithdrawals);

        const pendingWithdrawals = getLocalStorage<Withdrawal[]>("pendingWithdrawals", []);
        pendingWithdrawals.push(withdrawRequest as Withdrawal);
        setLocalStorage("pendingWithdrawals", pendingWithdrawals);
      }

      // Send notification to admin
      const notifications = getLocalStorage<Array<Record<string, unknown>>>("notifications", []);
      notifications.push({
        id: Date.now(),
        type: "withdrawal_request",
        title: "Yêu cầu rút tiền mới",
        message: `${user.name} yêu cầu rút ${withdrawAmount.toLocaleString("vi-VN")}đ qua ${selectedBank.shortName}`,
        user: { email: user.email, name: user.name },
        timestamp: timestamp,
        read: false,
        withdrawalInfo: withdrawRequest
      });
      setLocalStorage("notifications", notifications);

      // Dispatch events for real-time updates
      window.dispatchEvent(new Event("withdrawalsUpdated"))
      window.dispatchEvent(new Event("notificationsUpdated"))

      // Reset form
      setWithdrawData({
        selectedBank: "",
        accountNumber: "",
        accountName: "",
        amount: "",
        note: ""
      })

      // Reload withdrawals (debounce để tránh duplicate calls)
      setTimeout(() => {
        if (user.email) {
          loadUserWithdrawals(user.email);
        }
      }, 500);

      alert("Yêu cầu rút tiền đã được gửi! Vui lòng chờ admin xử lý.")

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Có lỗi xảy ra';
      alert(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }

  const getStatusBadge = (status: string | undefined) => {
    switch (status) {
      case "pending":
        return <Badge className="bg-yellow-100 text-yellow-800"><Clock className="w-3 h-3 mr-1" />Chờ duyệt</Badge>
      case "approved":
        return <Badge className="bg-green-100 text-green-800"><CheckCircle className="w-3 h-3 mr-1" />Đã chuyển</Badge>
      case "rejected":
        return <Badge className="bg-red-100 text-red-800"><XCircle className="w-3 h-3 mr-1" />Từ chối</Badge>
      default:
        return <Badge>Không xác định</Badge>
    }
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
      </div>
    )
  }

  const withdrawAmount = parseInt(withdrawData.amount) || 0
  const selectedBank = BANKS_LIST.find(b => b.id === withdrawData.selectedBank)

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 relative">
      {/* 3D Background */}
      <div className="absolute inset-0">
        <ThreeJSProductShowcase />
        <ThreeDFallback />
      </div>
      
      <FloatingHeader />
      
      <div className="container mx-auto px-4 py-8 max-w-4xl relative z-10">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Withdraw Form */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Wallet className="w-5 h-5 mr-2" />
              Rút tiền từ tài khoản
            </CardTitle>
            <CardDescription>
              Số dư hiện tại: <span className="font-bold text-green-600">{user.balance?.toLocaleString("vi-VN") || "0"}đ</span>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Chọn ngân hàng */}
              <div className="space-y-2">
                <Label htmlFor="bank">Ngân hàng*</Label>
                <Select 
                  value={withdrawData.selectedBank} 
                  onValueChange={(value) => setWithdrawData(prev => ({ ...prev, selectedBank: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn ngân hàng" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    {BANKS_LIST.map((bank) => (
                      <SelectItem key={bank.id} value={bank.id}>
                        <div>
                          <div className="font-medium">{bank.shortName}</div>
                          <div className="text-xs text-muted-foreground">{bank.name}</div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Số tài khoản */}
              <div className="space-y-2">
                <Label htmlFor="accountNumber">Số tài khoản*</Label>
                <Input
                  id="accountNumber"
                  type="text"
                  placeholder="Nhập số tài khoản"
                  value={withdrawData.accountNumber}
                  onChange={(e) => setWithdrawData(prev => ({ ...prev, accountNumber: e.target.value }))}
                  pattern="[0-9]{8,15}"
                  required
                />
                <p className="text-xs text-muted-foreground">8-15 chữ số</p>
              </div>

              {/* Tên chủ tài khoản */}
              <div className="space-y-2">
                <Label htmlFor="accountName">Họ và tên chủ tài khoản*</Label>
                <Input
                  id="accountName"
                  type="text"
                  placeholder="Nhập họ tên đầy đủ"
                  value={withdrawData.accountName}
                  onChange={(e) => setWithdrawData(prev => ({ ...prev, accountName: e.target.value }))}
                  required
                />
              </div>

              {/* Số tiền */}
              <div className="space-y-2">
                <Label htmlFor="amount">Số tiền muốn rút*</Label>
                <Input
                  id="amount"
                  type="number"
                  placeholder="Nhập số tiền (VNĐ)"
                  value={withdrawData.amount}
                  onChange={(e) => setWithdrawData(prev => ({ ...prev, amount: e.target.value }))}
                  min="10000"
                  step="1000"
                  required
                />
                <p className="text-xs text-muted-foreground">Tối thiểu 10,000đ</p>
              </div>

              {/* Ghi chú */}
              <div className="space-y-2">
                <Label htmlFor="note">Ghi chú (nếu có)</Label>
                <Textarea
                  id="note"
                  placeholder="Ghi chú thêm (không bắt buộc)"
                  value={withdrawData.note}
                  onChange={(e) => setWithdrawData(prev => ({ ...prev, note: e.target.value }))}
                  rows={3}
                />
              </div>

              {/* Thông báo số dư */}
              {withdrawAmount > 0 && (() => {
                const userBalance = typeof user.balance === 'string' ? parseFloat(user.balance) : (user.balance || 0);
                return (
                  <div className={`p-4 rounded-lg ${withdrawAmount > userBalance ? 'bg-red-50 border border-red-200' : 'bg-green-50 border border-green-200'}`}>
                  <p className="text-sm">
                    <strong>Số tiền rút:</strong> {withdrawAmount.toLocaleString("vi-VN")}đ
                  </p>
                  <p className="text-sm">
                      <strong>Số dư hiện tại:</strong> {userBalance.toLocaleString("vi-VN")}đ
                  </p>
                    {withdrawAmount <= userBalance && (
                    <p className="text-sm font-semibold text-green-600">
                        Số dư còn lại: {userBalance - withdrawAmount}đ
                    </p>
                  )}
                </div>
                );
              })()}

              <Button 
                type="submit" 
                className="w-full" 
                disabled={isLoading || !withdrawData.selectedBank || withdrawAmount > (typeof user.balance === 'string' ? parseFloat(user.balance) : (user.balance || 0))}
              >
                {isLoading ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                ) : (
                  "Gửi yêu cầu rút tiền"
                )}
              </Button>

              {withdrawAmount > (typeof user.balance === 'string' ? parseFloat(user.balance) : (user.balance || 0)) && withdrawAmount > 0 && (
                <p className="text-red-600 text-sm text-center">
                  Số dư không đủ để thực hiện giao dịch này
                </p>
              )}
            </form>
          </CardContent>
        </Card>

        {/* Withdraw History */}
        <Card>
          <CardHeader>
            <CardTitle>Lịch sử rút tiền</CardTitle>
            <CardDescription>
              Theo dõi trạng thái các yêu cầu rút tiền của bạn
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4 max-h-96 overflow-y-auto">
              {withdrawals.length === 0 ? (
                <p className="text-center text-gray-500 py-8">
                  Chưa có lịch sử rút tiền
                </p>
              ) : (
                withdrawals.map((withdrawal) => (
                  <div key={withdrawal.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <p className="font-medium">{withdrawal.amount.toLocaleString("vi-VN")}đ</p>
                      <p className="text-sm text-gray-500">{(withdrawal as Withdrawal & { bankShortName?: string }).bankShortName || withdrawal.bankName}</p>
                      <p className="text-xs text-gray-400">Số TK: {String(withdrawal.accountNumber || '')}</p>
                      <p className="text-xs text-gray-400">{(withdrawal as Withdrawal & { requestTimeFormatted?: string }).requestTimeFormatted || (withdrawal.requestTime ? new Date(withdrawal.requestTime).toLocaleString("vi-VN") : '')}</p>
                    </div>
                    <div className="text-right">
                      {getStatusBadge(withdrawal.status)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
      </div>
      <Footer />
    </div>
  )
}