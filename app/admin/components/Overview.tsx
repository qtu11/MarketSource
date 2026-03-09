"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Users, Package, DollarSign, Bell } from 'lucide-react'

interface OverviewProps {
  stats: {
    totalUsers: number
    totalProducts: number
    totalRevenue: number
    pendingDepositsCount: number
    pendingWithdrawalsCount: number
    totalPurchases: number
    newUsersCount: number
  }
  users: any[]
  purchases: any[]
  notifications: any[]
}

export function Overview({ stats, users, purchases, notifications }: OverviewProps) {
  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 ">
        <Card className="neon-border-hover glass-panel text-slate-900 dark:text-slate-100">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 ">
            <CardTitle className="text-sm font-medium ">Tổng người dùng</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalUsers}</div>
            <p className="text-xs text-muted-foreground">
              {stats.newUsersCount} người dùng mới trong 7 ngày qua
            </p>
          </CardContent>
        </Card>

        <Card className="neon-border-hover glass-panel text-slate-900 dark:text-slate-100">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 ">
            <CardTitle className="text-sm font-medium">Tổng sản phẩm</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalProducts}</div>
            <p className="text-xs text-muted-foreground">
              Đang bán
            </p>
          </CardContent>
        </Card>

        <Card className="neon-border-hover glass-panel text-slate-900 dark:text-slate-100">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tổng doanh thu</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {stats.totalRevenue.toLocaleString('vi-VN')}đ
            </div>
            <p className="text-xs text-muted-foreground">
              {stats.totalPurchases} giao dịch
            </p>
          </CardContent>
        </Card>

        <Card className="neon-border-hover glass-panel text-slate-900 dark:text-slate-100">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Chờ duyệt</CardTitle>
            <Bell className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              {stats.pendingDepositsCount + stats.pendingWithdrawalsCount}
            </div>
            <p className="text-xs text-muted-foreground">
              Nạp: {stats.pendingDepositsCount} | Rút: {stats.pendingWithdrawalsCount}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activities and Registrations */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 neon-border-hover glass-panel text-slate-900 dark:text-slate-100">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Giao dịch gần đây
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-xs text-muted-foreground">Live</span>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4 max-h-64 overflow-y-auto">
              {purchases
                .sort((a, b) => new Date(b.purchaseDate).getTime() - new Date(a.purchaseDate).getTime())
                .slice(0, 10)
                .map((purchase) => (
                <div key={purchase.id} className="flex items-center space-x-4 p-2 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg transition-colors">
                  <div className="bg-green-100 dark:bg-green-900/20 p-2 rounded-full">
                    <Package className="w-4 h-4 text-green-600" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{purchase.title}</p>
                    <p className="text-xs text-muted-foreground">
                      Khách hàng: {purchase.userName || 'Unknown'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(purchase.purchaseDate).toLocaleString('vi-VN')}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-green-600">
                      +{purchase.amount.toLocaleString('vi-VN')}đ
                    </p>
                    <Badge className="bg-green-100 text-green-800 text-xs">
                      Hoàn thành
                    </Badge>
                  </div>
                </div>
              ))}
              {purchases.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Chưa có giao dịch nào
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="neon-border-hover glass-panel text-slate-900 dark:text-slate-100">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Đăng ký mới ({stats.newUsersCount})
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                <span className="text-xs text-muted-foreground">Live</span>
              </div>
            </CardTitle>
            <CardDescription>Người dùng đăng ký trong 7 ngày qua</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4 max-h-64 overflow-y-auto">
              {users
                .filter(user => {
                  const registrationDate = new Date(user.createdAt)
                  const now = new Date()
                  const diffTime = Math.abs(now.getTime() - registrationDate.getTime())
                  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
                  return diffDays <= 7
                })
                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                .slice(0, 10)
                .map((user) => (
                  <div key={user.uid} className="flex items-center space-x-4 p-2 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg transition-colors">
                    <div className="bg-blue-100 dark:bg-blue-900/20 p-2 rounded-full relative">
                      <Users className="w-4 h-4 text-blue-600" />
                      {/* New user indicator */}
                      <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-white"></div>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">{user.name || user.email}</p>
                      <p className="text-xs text-muted-foreground">{user.email}</p>
                      <p className="text-xs text-muted-foreground">
                        Đăng ký: {new Date(user.createdAt).toLocaleString('vi-VN')}
                      </p>
                      <p className="text-xs text-blue-600">
                        Số dư: {(user.balance || 0).toLocaleString('vi-VN')}đ
                      </p>
                    </div>
                    <div className="text-right">
                      <Badge className="bg-blue-500 text-white text-xs">Mới</Badge>
                      <Badge className={`mt-1 text-xs ${user.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                        {user.status === 'active' ? 'Hoạt động' : 'Khóa'}
                      </Badge>
                    </div>
                  </div>
                ))}
              {stats.newUsersCount === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Không có đăng ký mới
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

              <Card className="neon-border-hover glass-panel text-slate-900 dark:text-slate-100">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Thông báo gần đây
              <Badge variant="outline" className="ml-auto">
                {notifications.filter(n => n.type.includes("deposit_") || n.type.includes("withdrawal_")).length} nạp/rút
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4 max-h-96 overflow-y-auto">
              {notifications
                .filter(n => n.type.includes("deposit_") || n.type.includes("withdrawal_"))
                .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                .slice(0, 10)
                .map((notification) => (
                <div key={notification.id} className="flex items-start space-x-4 p-3 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                  <div className={`p-2 rounded-full ${notification.type.includes("deposit_") ? 'bg-green-100 dark:bg-green-900/20' : 'bg-orange-100 dark:bg-orange-900/20'}`}>
                    <Bell className={`w-4 h-4 ${notification.type.includes("deposit_") ? 'text-green-600' : 'text-orange-600'}`} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <Badge className={`text-xs ${notification.type.includes("deposit_") ? 'bg-green-100 text-green-800' : 'bg-orange-100 text-orange-800'}`}>
                        {notification.type.includes("deposit_") ? 'Nạp tiền' : 'Rút tiền'}
                      </Badge>
                      {!notification.read && (
                        <Badge className="bg-blue-500 text-white text-xs">Mới</Badge>
                      )}
                    </div>
                    <p className="text-sm font-medium mt-2">{notification.title}</p>
                    <p className="text-xs text-muted-foreground">{notification.message}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      ⏰ {new Date(notification.timestamp).toLocaleString('vi-VN')}
                    </p>
                  </div>
                </div>
              ))}
              {notifications.filter(n => n.type.includes("deposit_") || n.type.includes("withdrawal_")).length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Không có thông báo nạp/rút nào
                </p>
              )}
            </div>
          </CardContent>
        </Card>
    </div>
  )
}