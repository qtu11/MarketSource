"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { TrendingUp, TrendingDown, Users, Package, DollarSign, Calendar, Download, Eye, Star, Clock, FileText } from 'lucide-react'
import { useState, useMemo, useCallback } from "react"
import { 
  ChartContainer, 
  ChartTooltip, 
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent
} from "@/components/ui/chart"
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, AreaChart, Area, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from "recharts"

interface AnalyticsProps {
  users: any[]
  products: any[]
  purchases: any[]
  deposits: any[]
  withdrawals: any[]
}

/** Chuỗi YYYY-MM-DD (UTC) hoặc null nếu không parse được — tránh RangeError từ toISOString */
function toDateKey(value: unknown): string | null {
  if (value == null || value === "") return null
  const d = new Date(value as string | number | Date)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString().split("T")[0]
}

/** So khớp purchase ↔ product (pg / JSON có thể trả id dạng string hoặc number). */
function purchaseMatchesProduct(purchase: Record<string, unknown>, productId: unknown): boolean {
  const pid = Number(productId)
  if (!Number.isFinite(pid) || pid <= 0) return false
  const raw = purchase.product_id ?? purchase.productId
  const ppid = Number(raw)
  return Number.isFinite(ppid) && ppid === pid
}

export function Analytics({ users, products, purchases, deposits, withdrawals }: AnalyticsProps) {
  const [timeRange, setTimeRange] = useState("7d")

  // Filter data by time range
  const filterByTimeRange = useCallback((data: any[], dateFields: string[] = ["createdAt"]) => {
    const now = new Date()
    const days = timeRange === "7d" ? 7 : timeRange === "30d" ? 30 : timeRange === "90d" ? 90 : 365
    const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
    
    return data.filter(item => {
      // Find the first valid date field
      let dateValue = null;
      for (const field of dateFields) {
        if (item[field]) {
          dateValue = item[field];
          break;
        }
      }
      
      if (!dateValue && item.created_at) dateValue = item.created_at;
      if (!dateValue && item.timestamp) dateValue = item.timestamp;
      
      if (!dateValue) return false;

      const itemDate = new Date(dateValue)
      return !isNaN(itemDate.getTime()) && itemDate >= startDate
    })
  }, [timeRange])

  // Calculate analytics data
  const analytics = useMemo(() => {
    const filteredUsers = filterByTimeRange(users, ["createdAt", "joinedAt", "registrationTime"])
    const filteredPurchases = filterByTimeRange(purchases, ["timestamp", "purchaseDate", "created_at"])
    const filteredDeposits = filterByTimeRange(deposits, ["timestamp", "created_at"])
    const filteredWithdrawals = filterByTimeRange(withdrawals, ["timestamp", "created_at"])

    // Revenue analytics
    const totalRevenue = filteredPurchases.reduce((sum, p) => sum + Number(p.amount || 0), 0)
    const totalDeposits = filteredDeposits.reduce((sum, d) => sum + Number(d.amount || 0), 0)
    const totalWithdrawals = filteredWithdrawals.reduce((sum, w) => sum + Number(w.amount || 0), 0)
    // ✅ FIX: netRevenue chỉ tính từ sales (purchases), không cộng deposits vào
    // Deposits là tiền nạp của user, không phải doanh thu bán hàng
    const netRevenue = totalRevenue

    // ✅ FIX: activeUsers — dùng updated_at hoặc last_sign_in_at thay vì lastActivity (không có trong DB)
    // Coi user là "hoạt động" nếu updated_at trong 30 ngày gần đây
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const activeUsers = users.filter(user => {
      const activityDate = user.lastActivity || user.last_sign_in_at || user.updated_at || user.updatedAt
      if (!activityDate) return false
      const d = new Date(activityDate)
      return !isNaN(d.getTime()) && d >= thirtyDaysAgo
    }).length

    // Sản phẩm bán chạy: dùng toàn bộ purchases (không lọc theo kỳ như biểu đồ).
    // Lý do: bộ lọc "7 ngày" khiến mọi đơn cũ bị loại → luôn "0 bán"; so sánh === cũng lệch string/number.
    const productSales = products.map(product => {
      const pRecs = purchases.filter((p) => purchaseMatchesProduct(p as Record<string, unknown>, product.id))
      const sales = pRecs.length
      const revenue = pRecs.reduce((sum, p) => sum + Number(p.amount || 0), 0)
      return {
        ...product,
        sales,
        revenue
      }
    }).sort((a, b) => b.sales - a.sales)

    // Daily data for trends - improved with better date handling
    const getDaysCount = () => {
      return timeRange === "7d" ? 7 : timeRange === "30d" ? 30 : timeRange === "90d" ? 90 : 365
    }
    
    const dailyData = Array.from({ length: getDaysCount() }, (_, i) => {
      const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000)
      const dateStr = date.toISOString().split('T')[0]
      const dateLabel = `${date.getDate()}/${date.getMonth() + 1}`
      
      const dayPurchases = filteredPurchases.filter(p => {
        const key = toDateKey(p.timestamp ?? p.purchaseDate ?? p.created_at)
        return key === dateStr
      })
      
      const dayDeposits = filteredDeposits.filter(d => {
        const key = toDateKey(d.timestamp ?? d.created_at)
        return key === dateStr
      })
      
      const dayWithdrawals = filteredWithdrawals.filter(w => {
        const key = toDateKey(w.timestamp ?? w.created_at)
        return key === dateStr
      })
      
      const dayUsers = filteredUsers.filter(u => {
        const key = toDateKey(
          u.createdAt ?? u.joinedAt ?? u.created_at ?? u.registrationTime
        )
        return key === dateStr
      })
      
      return {
        date: dateStr,
        dateLabel,
        revenue: dayPurchases.reduce((sum, p) => sum + Number(p.amount || 0), 0),
        deposits: dayDeposits.reduce((sum, d) => sum + Number(d.amount || 0), 0),
        withdrawals: dayWithdrawals.reduce((sum, w) => sum + Number(w.amount || 0), 0),
        users: dayUsers.length,
        transactions: dayPurchases.length
      }
    }).reverse()

    // ✅ FIX: conversionRate — tỷ lệ user đã mua / tổng user (không chia filtered users trong kỳ)
    // Vì filteredUsers là user mới đăng ký trong kỳ, không phải tổng user truy cập
    const uniqueBuyers = new Set(
      purchases.map(p => (p.user_id || p.userId || p.uid || p.userEmail || p.user_email)?.toString()).filter(Boolean)
    ).size
    const userBehavior = {
      averageOrderValue: totalRevenue / (filteredPurchases.length || 1),
      // ✅ FIX: conversionRate = (số user đã mua / tổng user) * 100
      conversionRate: users.length > 0 ? (uniqueBuyers / users.length) * 100 : 0,
      repeatCustomers: users.filter(user => {
        const userId = (user.uid || user.id)?.toString()
        const userPurchases = purchases.filter(p => {
          // ✅ FIX: so sánh đúng field — purchases dùng user_id hoặc userId
          const pUserId = (p.user_id || p.userId || p.uid)?.toString()
          const pEmail = p.userEmail || p.user_email || p.email
          return pUserId === userId || pEmail === user.email
        })
        return userPurchases.length > 1
      }).length
    }

    return {
      totalRevenue,
      totalDeposits,
      totalWithdrawals,
      netRevenue,
      activeUsers,
      productSales,
      dailyData,
      userBehavior,
      newUsers: filteredUsers.length,
      totalUsersAll: users.length,      // ✅ Tổng users toàn bộ (không filter theo kỳ)
      totalTransactions: filteredPurchases.length,
      uniqueBuyers,                      // ✅ Số user đã mua ít nhất 1 lần
    }
  }, [users, products, purchases, deposits, withdrawals, filterByTimeRange, timeRange])

  // Chart configurations
  const revenueChartConfig = {
    revenue: {
      label: "Doanh thu",
      color: "hsl(var(--chart-1))",
    },
    deposits: {
      label: "Nạp tiền",
      color: "hsl(var(--chart-2))",
    },
    withdrawals: {
      label: "Rút tiền",
      color: "hsl(var(--chart-3))",
    },
  }

  const userChartConfig = {
    users: {
      label: "Người dùng mới",
      color: "hsl(var(--chart-4))",
    },
  }

  const productChartConfig = {
    sales: {
      label: "Số lượng bán",
      color: "hsl(var(--chart-5))",
    },
  }

  // Revenue distribution for pie chart
  const revenueDistribution = useMemo(() => {
    return [
      { name: "Bán hàng", value: analytics.totalRevenue, color: "#10b981" },
      { name: "Nạp tiền", value: analytics.totalDeposits, color: "#3b82f6" },
    ]
  }, [analytics.totalRevenue, analytics.totalDeposits])

  // Export analytics data
  const exportData = (format: 'json' | 'csv' = 'json') => {
    if (format === 'json') {
      const data = {
        summary: {
          timeRange,
          totalRevenue: analytics.totalRevenue,
          totalUsers: analytics.newUsers,
          totalTransactions: analytics.totalTransactions,
          averageOrderValue: analytics.userBehavior.averageOrderValue,
          conversionRate: analytics.userBehavior.conversionRate
        },
        productSales: analytics.productSales,
        dailyData: analytics.dailyData,
        exportedAt: new Date().toISOString()
      }
      
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `analytics_${timeRange}_${new Date().toISOString().split('T')[0]}.json`
      a.click()
    } else {
      // CSV export
      const headers = ['Ngày', 'Doanh thu', 'Nạp tiền', 'Rút tiền', 'Người dùng mới', 'Giao dịch']
      const rows = analytics.dailyData.map(day => [
        day.dateLabel,
        day.revenue,
        day.deposits,
        day.withdrawals,
        day.users,
        day.transactions
      ])
      
      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.join(','))
      ].join('\n')
      
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `analytics_${timeRange}_${new Date().toISOString().split('T')[0]}.csv`
      a.click()
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Thống kê & Phân tích</h2>
          <p className="text-muted-foreground">Phân tích chi tiết về hoạt động kinh doanh</p>
        </div>
        <div className="flex items-center space-x-4">
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">7 ngày</SelectItem>
              <SelectItem value="30d">30 ngày</SelectItem>
              <SelectItem value="90d">90 ngày</SelectItem>
              <SelectItem value="365d">1 năm</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={() => exportData('json')} variant="outline" size="sm">
            <FileText className="w-4 h-4 mr-2" />
            JSON
          </Button>
          <Button onClick={() => exportData('csv')} variant="outline" size="sm">
            <Download className="w-4 h-4 mr-2" />
            CSV
          </Button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Doanh thu thuần</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {analytics.netRevenue.toLocaleString('vi-VN')}đ
            </div>
            <p className="text-xs text-muted-foreground">
              {analytics.netRevenue > 0 ? <TrendingUp className="inline w-3 h-3 text-green-500" /> : <TrendingDown className="inline w-3 h-3 text-red-500" />}
              {" "}Trong {timeRange === "7d" ? "7 ngày" : timeRange === "30d" ? "30 ngày" : timeRange === "90d" ? "90 ngày" : "1 năm"} qua
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Người dùng hoạt động</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{analytics.activeUsers}</div>
            <p className="text-xs text-muted-foreground">
              {analytics.newUsers} người mới · Tổng {analytics.totalUsersAll || users.length} user
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Giá trị đơn hàng TB</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">
              {analytics.userBehavior.averageOrderValue.toLocaleString('vi-VN')}đ
            </div>
            <p className="text-xs text-muted-foreground">
              {analytics.totalTransactions} giao dịch
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tỷ lệ chuyển đổi</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              {analytics.userBehavior.conversionRate.toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground">
              {analytics.uniqueBuyers || 0} đã mua · {analytics.userBehavior.repeatCustomers} quay lại
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue Line Chart */}
        <Card className="neon-border-hover glass-panel text-slate-900 dark:text-slate-100">
          <CardHeader>
            <CardTitle>Biểu đồ doanh thu theo thời gian</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={revenueChartConfig} className="h-[300px]">
              <LineChart data={analytics.dailyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="dateLabel" 
                  tick={{ fontSize: 12 }}
                  angle={-45}
                  textAnchor="end"
                  height={60}
                />
                <YAxis tick={{ fontSize: 12 }} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Line 
                  type="monotone" 
                  dataKey="revenue" 
                  stroke="var(--color-revenue)" 
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  name="Doanh thu"
                />
                <Line 
                  type="monotone" 
                  dataKey="deposits" 
                  stroke="var(--color-deposits)" 
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  name="Nạp tiền"
                />
                <Line 
                  type="monotone" 
                  dataKey="withdrawals" 
                  stroke="var(--color-withdrawals)" 
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  name="Rút tiền"
                />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Revenue Distribution Pie Chart */}
        <Card className="neon-border-hover glass-panel text-slate-900 dark:text-slate-100">
          <CardHeader>
            <CardTitle>Phân bố doanh thu</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={revenueChartConfig} className="h-[300px]">
              <PieChart>
                <Pie
                  data={revenueDistribution}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {revenueDistribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <ChartTooltip 
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div className="rounded-lg border bg-background p-2 shadow-sm">
                          <div className="grid gap-2">
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-muted-foreground">
                                {payload[0].name}
                              </span>
                              <span className="font-bold">
                                {payload[0].value?.toLocaleString('vi-VN')}đ
                              </span>
                            </div>
                          </div>
                        </div>
                      )
                    }
                    return null
                  }}
                />
              </PieChart>
            </ChartContainer>
            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between p-2 bg-green-50 dark:bg-green-900/20 rounded">
                <span className="text-sm">Doanh thu bán hàng</span>
                <span className="font-bold text-green-600">
                  {analytics.totalRevenue.toLocaleString('vi-VN')}đ
                </span>
              </div>
              <div className="flex items-center justify-between p-2 bg-blue-50 dark:bg-blue-900/20 rounded">
                <span className="text-sm">Tổng nạp tiền</span>
                <span className="font-bold text-blue-600">
                  {analytics.totalDeposits.toLocaleString('vi-VN')}đ
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* User Growth and Top Products */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* User Growth Area Chart */}
        <Card className="neon-border-hover glass-panel text-slate-900 dark:text-slate-100">
          <CardHeader>
            <CardTitle>Tăng trưởng người dùng</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={userChartConfig} className="h-[300px]">
              <AreaChart data={analytics.dailyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="dateLabel" 
                  tick={{ fontSize: 12 }}
                  angle={-45}
                  textAnchor="end"
                  height={60}
                />
                <YAxis tick={{ fontSize: 12 }} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Area 
                  type="monotone" 
                  dataKey="users" 
                  stroke="var(--color-users)" 
                  fill="var(--color-users)"
                  fillOpacity={0.6}
                  name="Người dùng mới"
                />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Top Products */}
        <Card>
          <CardHeader>
            <CardTitle>Sản phẩm bán chạy</CardTitle>
            <CardDescription>
              Tổng lượt mua theo toàn bộ giao dịch đã ghi nhận (không áp dụng bộ lọc thời gian phía trên).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {analytics.productSales.slice(0, 5).map((product, index) => (
                <div key={product.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center space-x-3">
                    <Badge className="bg-blue-100 text-blue-800">#{index + 1}</Badge>
                    <div>
                      <p className="text-sm font-medium">{product.title}</p>
                      <p className="text-xs text-muted-foreground">{product.category}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold">{product.sales} bán</p>
                    <p className="text-xs text-green-600">{product.revenue.toLocaleString('vi-VN')}đ</p>
                  </div>
                </div>
              ))}
              {analytics.productSales.length === 0 && (
                <p className="text-center text-muted-foreground py-4">Chưa có dữ liệu bán hàng</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Daily Trends */}
      <Card>
        <CardHeader>
          <CardTitle>Xu hướng 30 ngày gần đây</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <p className="text-sm text-muted-foreground">Tổng doanh thu</p>
                <p className="text-2xl font-bold text-green-600">
                  {analytics.dailyData.reduce((sum, day) => sum + day.revenue, 0).toLocaleString('vi-VN')}đ
                </p>
              </div>
              <div className="text-center p-4 bg-blue-50 rounded-lg">
                <p className="text-sm text-muted-foreground">Người dùng mới</p>
                <p className="text-2xl font-bold text-blue-600">
                  {analytics.dailyData.reduce((sum, day) => sum + day.users, 0)}
                </p>
              </div>
              <div className="text-center p-4 bg-purple-50 rounded-lg">
                <p className="text-sm text-muted-foreground">Giao dịch</p>
                <p className="text-2xl font-bold text-purple-600">
                  {analytics.dailyData.reduce((sum, day) => sum + day.transactions, 0)}
                </p>
              </div>
            </div>

            {/* Simple trend visualization */}
            <div className="space-y-2">
              <h4 className="font-medium">Biểu đồ xu hướng (7 ngày gần nhất)</h4>
              <div className="flex items-end space-x-1 h-32 bg-gray-50 p-4 rounded">
                {analytics.dailyData.slice(-7).map((day, index) => {
                  const maxRevenue = Math.max(...analytics.dailyData.slice(-7).map(d => d.revenue))
                  const height = maxRevenue > 0 ? (day.revenue / maxRevenue) * 80 : 0
                  return (
                    <div key={index} className="flex-1 flex flex-col items-center">
                      <div
                        className="bg-blue-500 w-full rounded-t"
                        style={{ height: `${height}px` }}
                        title={`${day.revenue.toLocaleString('vi-VN')}đ`}
                      ></div>
                      <p className="text-xs text-muted-foreground mt-2">
                        {new Date(day.date).getDate()}/{new Date(day.date).getMonth() + 1}
                      </p>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* User Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Phân tích người dùng</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center p-3 border rounded">
                <p className="text-2xl font-bold text-blue-600">{users.length}</p>
                <p className="text-sm text-muted-foreground">Tổng người dùng</p>
              </div>
              <div className="text-center p-3 border rounded">
                <p className="text-2xl font-bold text-green-600">{analytics.activeUsers}</p>
                <p className="text-sm text-muted-foreground">Hoạt động (30 ngày)</p>
              </div>
            </div>
            
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Khách hàng mới</span>
                <span>{analytics.newUsers}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Khách hàng quay lại</span>
                <span>{analytics.userBehavior.repeatCustomers}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Tỷ lệ chuyển đổi</span>
                <span>{analytics.userBehavior.conversionRate.toFixed(1)}%</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Hoạt động gần đây</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {purchases.slice(0, 5).map((purchase) => (
                <div key={purchase.id} className="flex items-center space-x-3 p-2 border rounded">
                  <div className="bg-green-100 p-2 rounded-full">
                    <Package className="w-4 h-4 text-green-600" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{purchase.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(purchase.timestamp).toLocaleString('vi-VN')}
                    </p>
                  </div>
                  <p className="text-sm font-bold text-green-600">
                    {Number(purchase.amount || 0).toLocaleString('vi-VN')}đ
                  </p>
                </div>
              ))}
              {purchases.length === 0 && (
                <p className="text-center text-muted-foreground py-4">Chưa có hoạt động nào</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}