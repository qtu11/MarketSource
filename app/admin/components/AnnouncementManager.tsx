"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"

export interface Announcement {
  id: string
  title: string
  message: string
  type: "system" | "promotion" | "maintenance"
  priority: "low" | "normal" | "high"
  isActive: boolean
  showOnHomepage?: boolean
  startDate?: string
  endDate?: string
}

interface AnnouncementManagerProps {
  items: Announcement[]
  onCreate: (announcement: Omit<Announcement, "id">) => void
  onToggle: (id: string, isActive: boolean) => void
  onDelete: (id: string) => void
}

export function AnnouncementManager({ items, onCreate, onToggle, onDelete }: AnnouncementManagerProps) {
  const [form, setForm] = useState<Omit<Announcement, "id">>({
    title: "",
    message: "",
    type: "system",
    priority: "normal",
    isActive: true,
    showOnHomepage: true,
  })

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card className="neon-border-hover glass-panel text-slate-900 dark:text-slate-100">
        <CardHeader>
          <CardTitle>Tạo thông báo mới</CardTitle>
          <CardDescription>Thông báo sẽ hiển thị realtime cho cả khách hàng và admin</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input placeholder="Tiêu đề" value={form.title} onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))} />
          <Textarea placeholder="Nội dung" rows={4} value={form.message} onChange={(e) => setForm((prev) => ({ ...prev, message: e.target.value }))} />
          <div className="grid grid-cols-2 gap-3">
            <select className="px-3 py-2 border rounded-md bg-background text-sm" value={form.type} onChange={(e) => setForm((prev) => ({ ...prev, type: e.target.value as Announcement["type"] }))}>
              <option value="system">System</option>
              <option value="promotion">Promotion</option>
              <option value="maintenance">Maintenance</option>
            </select>
            <select className="px-3 py-2 border rounded-md bg-background text-sm" value={form.priority} onChange={(e) => setForm((prev) => ({ ...prev, priority: e.target.value as Announcement["priority"] }))}>
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
            </select>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Hiển thị trang chủ</span>
            <Switch checked={form.showOnHomepage} onCheckedChange={(checked) => setForm((prev) => ({ ...prev, showOnHomepage: checked }))} />
          </div>
          <Button className="w-full" onClick={() => onCreate(form)}>
            Tạo thông báo
          </Button>
        </CardContent>
      </Card>

      <Card className="neon-border-hover glass-panel text-slate-900 dark:text-slate-100">
        <CardHeader className="flex items-center justify-between">
          <div>
            <CardTitle>Thông báo gần đây</CardTitle>
            <CardDescription>{items.length} thông báo</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 max-h-[420px] overflow-y-auto pr-2">
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">Chưa có thông báo nào.</p>
          ) : (
            items.map((item) => (
              <div key={item.id} className="border rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="font-semibold">{item.title}</p>
                  <Badge
                    variant={
                      item.priority === "high" ? "destructive" : item.priority === "normal" ? "secondary" : "outline"
                    }
                  >
                    {item.priority}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">{item.message}</p>
                <div className="flex items-center justify-between">
                  <Badge variant="outline">{item.type}</Badge>
                  <div className="flex items-center gap-2">
                    <Switch checked={item.isActive} onCheckedChange={(checked) => onToggle(item.id, checked)} />
                    <Button size="sm" variant="ghost" className="text-red-500" onClick={() => onDelete(item.id)}>
                      Xóa
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}

