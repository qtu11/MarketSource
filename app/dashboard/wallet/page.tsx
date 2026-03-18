"use client"

import { useMemo, useState } from "react"
import useSWR from "swr"
import { motion, useReducedMotion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useCurrentUser } from "@/hooks/use-current-user"
import { apiGet } from "@/lib/api-client"
import { useRouter } from "next/navigation"

const fetcher = async (endpoint: string) => apiGet(endpoint)

export default function WalletPage() {
  const user = useCurrentUser()
  const router = useRouter()
  const shouldReduce = useReducedMotion()
  const [showAllDeposits, setShowAllDeposits] = useState(false)
  const [showAllWithdrawals, setShowAllWithdrawals] = useState(false)
  const [activeTab, setActiveTab] = useState<"deposits" | "withdrawals">("deposits")

  // ✅ BUG-A4 FIX: Fetch cả deposits VÀ withdrawals
  const { data: depositsData } = useSWR(user ? "/api/deposits?userId=self" : null, fetcher, {
    revalidateOnFocus: false,
  })
  const { data: withdrawalsData } = useSWR(user ? "/api/withdrawals?userId=self" : null, fetcher, {
    revalidateOnFocus: false,
  })

  const deposits = useMemo(() => depositsData?.deposits ?? [], [depositsData])
  const withdrawals = useMemo(() => withdrawalsData?.withdrawals ?? [], [withdrawalsData])

  // ✅ BUG-A3 FIX: Hiện tất cả hoặc chỉ 5 tùy state
  const visibleDeposits = showAllDeposits ? deposits : deposits.slice(0, 5)
  const visibleWithdrawals = showAllWithdrawals ? withdrawals : withdrawals.slice(0, 5)

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Đã duyệt</Badge>
      case "pending":
        return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">Chờ duyệt</Badge>
      case "rejected":
        return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Từ chối</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Ví QtusDev</h1>
        <p className="text-muted-foreground">Nạp / rút và kiểm soát số dư của bạn.</p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="rounded-2xl shadow-lg">
          <CardHeader>
            <CardTitle>Số dư hiện tại</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-3xl font-bold">
              {(user?.balance ?? 0).toLocaleString("vi-VN", { style: "currency", currency: "VND" })}
            </p>
            {/* ✅ BUG-A2 FIX: Thêm onClick handlers cho nút Nạp/Rút */}
            <div className="flex gap-2">
              <Button
                size="lg"
                className="flex-1"
                onClick={() => router.push("/dashboard/overview#deposit")}
              >
                Nạp tiền
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="flex-1"
                onClick={() => router.push("/dashboard/overview#withdraw")}
              >
                Rút tiền
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-lg">
          <CardHeader>
            <CardTitle>Thiết lập bảo mật</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">Bật 2FA và cảnh báo đăng nhập để bảo vệ tài khoản.</p>
            <Button variant="outline" onClick={() => router.push("/dashboard/overview#security")}>
              Truy cập trang bảo mật
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* ✅ BUG-A4 FIX: Tabs cho Deposits và Withdrawals */}
      <Card className="rounded-2xl shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Lịch sử giao dịch</span>
            <div className="flex gap-1">
              <Button
                size="sm"
                variant={activeTab === "deposits" ? "default" : "outline"}
                onClick={() => setActiveTab("deposits")}
                className="text-xs"
              >
                Nạp tiền ({deposits.length})
              </Button>
              <Button
                size="sm"
                variant={activeTab === "withdrawals" ? "default" : "outline"}
                onClick={() => setActiveTab("withdrawals")}
                className="text-xs"
              >
                Rút tiền ({withdrawals.length})
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {activeTab === "deposits" ? (
            <>
              <div className="grid grid-cols-4 text-sm font-medium text-muted-foreground mb-2">
                <span>Ngày</span>
                <span>Số tiền</span>
                <span>Phương thức</span>
                <span>Trạng thái</span>
              </div>
              <div className="divide-y">
                {visibleDeposits.map((deposit: any, index: number) => (
                  <motion.div
                    key={deposit.id}
                    initial={{ opacity: 0, y: shouldReduce ? 0 : 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.04 }}
                    className="grid grid-cols-4 py-3 text-sm items-center"
                  >
                    <span>{new Date(deposit.timestamp || deposit.created_at).toLocaleDateString("vi-VN")}</span>
                    <span className="font-semibold text-green-500">
                      +{Number(deposit.amount).toLocaleString("vi-VN")}đ
                    </span>
                    <span className="capitalize">{deposit.method || "chuyển khoản"}</span>
                    {getStatusBadge(deposit.status)}
                  </motion.div>
                ))}
                {deposits.length === 0 && <p className="py-4 text-muted-foreground">Chưa có giao dịch nạp tiền.</p>}
              </div>
              {/* ✅ BUG-A3 FIX: Nút xem tất cả */}
              {deposits.length > 5 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full mt-2 text-xs"
                  onClick={() => setShowAllDeposits(!showAllDeposits)}
                >
                  {showAllDeposits ? "Thu gọn" : `Xem tất cả (${deposits.length} giao dịch)`}
                </Button>
              )}
            </>
          ) : (
            <>
              <div className="grid grid-cols-4 text-sm font-medium text-muted-foreground mb-2">
                <span>Ngày</span>
                <span>Số tiền</span>
                <span>Ngân hàng</span>
                <span>Trạng thái</span>
              </div>
              <div className="divide-y">
                {visibleWithdrawals.map((withdrawal: any, index: number) => (
                  <motion.div
                    key={withdrawal.id}
                    initial={{ opacity: 0, y: shouldReduce ? 0 : 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.04 }}
                    className="grid grid-cols-4 py-3 text-sm items-center"
                  >
                    <span>{new Date(withdrawal.created_at || withdrawal.timestamp).toLocaleDateString("vi-VN")}</span>
                    <span className="font-semibold text-red-500">
                      -{Number(withdrawal.amount).toLocaleString("vi-VN")}đ
                    </span>
                    <span className="truncate">{withdrawal.bank_name || "N/A"}</span>
                    {getStatusBadge(withdrawal.status)}
                  </motion.div>
                ))}
                {withdrawals.length === 0 && <p className="py-4 text-muted-foreground">Chưa có giao dịch rút tiền.</p>}
              </div>
              {withdrawals.length > 5 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full mt-2 text-xs"
                  onClick={() => setShowAllWithdrawals(!showAllWithdrawals)}
                >
                  {showAllWithdrawals ? "Thu gọn" : `Xem tất cả (${withdrawals.length} giao dịch)`}
                </Button>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </section>
  )
}
