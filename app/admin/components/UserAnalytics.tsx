"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts"
import { Users, Activity, AlertTriangle } from "lucide-react"

interface UserAnalyticsProps {
  retentionRate: number
  churnRate: number
  vipUsers: number
  fraudUsers: number
  cohortData: { month: string; retained: number; churned: number }[]
  segments: { label: string; count: number; color: string }[]
}

export function UserAnalytics({
  retentionRate,
  churnRate,
  vipUsers,
  fraudUsers,
  cohortData,
  segments,
}: UserAnalyticsProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <Card className="lg:col-span-2 neon-border-hover glass-panel text-slate-900 dark:text-slate-100">
        <CardHeader>
          <CardTitle>Retention & Churn</CardTitle>
          <CardDescription>Tỷ lệ giữ chân người dùng theo tháng</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={cohortData}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="month" fontSize={12} />
              <YAxis fontSize={12} />
              <Tooltip />
              <Bar dataKey="retained" fill="#22c55e" name="Retained" radius={[6, 6, 0, 0]} />
              <Bar dataKey="churned" fill="#ef4444" name="Churned" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card className="neon-border-hover glass-panel text-slate-900 dark:text-slate-100">
        <CardHeader>
          <CardTitle>Health status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Metric label="Retention rate" value={`${retentionRate.toFixed(1)}%`} icon={<Users className="w-4 h-4" />} />
          <Progress value={retentionRate} className="h-2" />

          <Metric
            label="Churn rate"
            value={`${churnRate.toFixed(1)}%`}
            icon={<AlertTriangle className="w-4 h-4 text-red-500" />}
          />
          <Progress value={churnRate} className="h-2 bg-red-100" indicatorClassName="bg-red-500" />

          <div className="flex justify-between text-sm text-muted-foreground">
            <span>VIP users</span>
            <Badge variant="secondary">{vipUsers}</Badge>
          </div>
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>Fraud alerts</span>
            <Badge variant="destructive">{fraudUsers}</Badge>
          </div>
        </CardContent>
      </Card>

      <Card className="lg:col-span-3 neon-border-hover glass-panel text-slate-900 dark:text-slate-100">
        <CardHeader>
          <CardTitle>Segmentation</CardTitle>
          <CardDescription>Nhóm người dùng quan trọng</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {segments.map((segment) => (
            <div key={segment.label} className="p-4 border rounded-xl flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">{segment.label}</p>
                <p className="text-xl font-semibold">{segment.count}</p>
              </div>
              <Activity className="w-6 h-6" style={{ color: segment.color }} />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

function Metric({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <span className="font-semibold">{value}</span>
    </div>
  )
}

