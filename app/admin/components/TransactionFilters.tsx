"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Filter, RefreshCw } from "lucide-react"

interface TransactionFiltersProps {
  filters: {
    q: string
    type: string
    status: string
    method: string
  dateRange?: { from: string; to: string }
  }
  onChange: (filters: TransactionFiltersProps["filters"]) => void
  onReset: () => void
  onExport: () => void
}

export function TransactionFilters({ filters, onChange, onReset, onExport }: TransactionFiltersProps) {
  const update = (patch: Partial<TransactionFiltersProps["filters"]>) => onChange({ ...filters, ...patch })

  return (
    <Card className="neon-border-hover glass-panel text-slate-900 dark:text-slate-100">
      <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-blue-500" />
            Bộ lọc giao dịch
          </CardTitle>
          <CardDescription>Tìm kiếm giao dịch theo nhiều tiêu chí nâng cao</CardDescription>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onReset}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Reset
          </Button>
          <Button size="sm" onClick={onExport}>
            Export
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Input placeholder="Tìm theo ID, email, số tiền..." value={filters.q} onChange={(e) => update({ q: e.target.value })} />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <select className="px-3 py-2 border rounded-md bg-background text-sm" value={filters.type} onChange={(e) => update({ type: e.target.value })}>
            <option value="all">Tất cả loại</option>
            <option value="deposit">Nạp tiền</option>
            <option value="withdraw">Rút tiền</option>
            <option value="purchase">Mua hàng</option>
          </select>
          <select className="px-3 py-2 border rounded-md bg-background text-sm" value={filters.status} onChange={(e) => update({ status: e.target.value })}>
            <option value="all">Tất cả trạng thái</option>
            <option value="pending">Chờ duyệt</option>
            <option value="approved">Đã duyệt</option>
            <option value="rejected">Từ chối</option>
          </select>
          <select className="px-3 py-2 border rounded-md bg-background text-sm" value={filters.method} onChange={(e) => update({ method: e.target.value })}>
            <option value="all">Phương thức</option>
            <option value="momo">MoMo</option>
            <option value="bank">Bank Transfer</option>
            <option value="crypto">Crypto</option>
          </select>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Input
            type="date"
            value={filters.dateRange?.from || ""}
            onChange={(e) => update({ dateRange: { ...(filters.dateRange || { to: "" }), from: e.target.value } })}
          />
          <Input
            type="date"
            value={filters.dateRange?.to || ""}
            onChange={(e) => update({ dateRange: { ...(filters.dateRange || { from: "" }), to: e.target.value } })}
          />
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <Badge variant="outline">{filters.type}</Badge>
          <Badge variant="outline">{filters.status}</Badge>
          <Badge variant="outline">{filters.method}</Badge>
        </div>
      </CardContent>
    </Card>
  )
}

