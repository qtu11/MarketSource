"use client"

import { useMemo } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Download, Lock, Mail, Unlock } from "lucide-react"

interface BulkUser {
  id: string
  email: string
  name?: string
  role?: string
  status?: string
  balance?: number
  selected?: boolean
}

interface UserBulkActionsProps {
  users: BulkUser[]
  onToggle: (userId: string) => void
  onSelectAll: (value: boolean) => void
  onLock: (ids: string[]) => void
  onUnlock: (ids: string[]) => void
  onExport: (ids: string[]) => void
  onEmail: (ids: string[]) => void
}

export function UserBulkActions({ users, onToggle, onSelectAll, onLock, onUnlock, onExport, onEmail }: UserBulkActionsProps) {
  const { selectedIds, totalSelected } = useMemo(() => {
    const selected = users.filter((user) => user.selected).map((user) => user.id)
    return {
      selectedIds: selected,
      totalSelected: selected.length,
    }
  }, [users])

  return (
    <Card className="neon-border-hover glass-panel text-slate-900 dark:text-slate-100">
      <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <CardTitle>Bulk actions</CardTitle>
          <CardDescription>Khóa, mở khóa, gửi email hoặc xuất dữ liệu hàng loạt</CardDescription>
        </div>
        <Badge variant="outline">{totalSelected} đã chọn</Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <Checkbox checked={totalSelected === users.length} onCheckedChange={(checked) => onSelectAll(!!checked)} />
          <span className="text-sm text-muted-foreground">Chọn tất cả ({users.length})</span>
          <Input placeholder="Tìm user..." className="max-w-sm ml-auto" />
        </div>

        <div className="flex flex-wrap gap-3">
          <Button size="sm" variant="outline" disabled={!totalSelected} onClick={() => onLock(selectedIds)}>
            <Lock className="w-4 h-4 mr-2" />
            Khóa tài khoản
          </Button>
          <Button size="sm" variant="outline" disabled={!totalSelected} onClick={() => onUnlock(selectedIds)}>
            <Unlock className="w-4 h-4 mr-2" />
            Mở khóa
          </Button>
          <Button size="sm" variant="outline" disabled={!totalSelected} onClick={() => onEmail(selectedIds)}>
            <Mail className="w-4 h-4 mr-2" />
            Gửi email
          </Button>
          <Button size="sm" variant="outline" disabled={!totalSelected} onClick={() => onExport(selectedIds)}>
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
        </div>

        <div className="border rounded-xl max-h-[260px] overflow-y-auto pr-2">
          {users.map((user) => (
            <label key={user.id} className="flex items-center gap-3 px-4 py-2 border-b last:border-b-0 text-sm cursor-pointer">
              <Checkbox checked={!!user.selected} onCheckedChange={() => onToggle(user.id)} />
              <div>
                <p className="font-medium">{user.email}</p>
                <p className="text-xs text-muted-foreground">
                  {user.name || "—"} • {user.role || "user"} • {user.balance?.toLocaleString("vi-VN")}đ
                </p>
              </div>
              <Badge className="ml-auto" variant={user.status === "active" ? "secondary" : "destructive"}>
                {user.status || "unknown"}
              </Badge>
            </label>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

