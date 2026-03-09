"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell } from "recharts"
import { Badge } from "@/components/ui/badge"
import { Flame, Package, ShoppingCart } from "lucide-react"

interface ProductMetric {
  id: string
  title: string
  views: number
  purchases: number
  conversion: number
  revenue: number
  rating: number
}

interface ProductAnalyticsProps {
  trends: { month: string; views: number; purchases: number }[]
  topProducts: ProductMetric[]
  categories: { name: string; value: number }[]
}

export function ProductAnalytics({ trends, topProducts, categories }: ProductAnalyticsProps) {
  return (
    <Card className="neon-border-hover glass-panel text-slate-900 dark:text-slate-100">
      <CardHeader>
        <CardTitle>Phân tích sản phẩm</CardTitle>
        <CardDescription>Lượt xem, chuyển đổi và doanh thu theo sản phẩm</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Tabs defaultValue="trend">
          <TabsList>
            <TabsTrigger value="trend">Trend</TabsTrigger>
            <TabsTrigger value="top">Top sản phẩm</TabsTrigger>
            <TabsTrigger value="category">Danh mục</TabsTrigger>
          </TabsList>

          <TabsContent value="trend" className="mt-4">
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={trends}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="month" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip />
                <Line type="monotone" dataKey="views" stroke="#6366f1" strokeWidth={2} name="Views" />
                <Line type="monotone" dataKey="purchases" stroke="#22c55e" strokeWidth={2} name="Purchases" />
              </LineChart>
            </ResponsiveContainer>
          </TabsContent>

          <TabsContent value="top" className="mt-4 space-y-3">
            {topProducts.map((product, idx) => (
              <div key={product.id} className="border rounded-xl p-4 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">#{idx + 1}</p>
                  <p className="font-semibold">{product.title}</p>
                </div>
                <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                  <Badge variant="secondary">
                    <Flame className="w-3 h-3 mr-1" />
                    {product.views.toLocaleString("vi-VN")} views
                  </Badge>
                  <Badge variant="outline">
                    <ShoppingCart className="w-3 h-3 mr-1" />
                    {product.purchases} orders
                  </Badge>
                  <Badge variant="outline">{product.conversion.toFixed(2)}% CVR</Badge>
                  <Badge variant="outline">{product.revenue.toLocaleString("vi-VN")}đ</Badge>
                  <Badge variant="outline">{product.rating.toFixed(1)}⭐</Badge>
                </div>
              </div>
            ))}
          </TabsContent>

          <TabsContent value="category" className="mt-4">
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={categories} cx="50%" cy="50%" labelLine={false} dataKey="value" outerRadius={110}>
                  {categories.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}

const COLORS = ["#0ea5e9", "#a855f7", "#f97316", "#22c55e", "#f43f5e", "#3b82f6", "#facc15"]

