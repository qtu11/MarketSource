"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"

export interface Promotion {
  id: string
  name: string
  description?: string
  discountType: "percentage" | "fixed"
  discountValue: number
  channels: string[]
  active: boolean
  startDate?: string
  endDate?: string
}

interface PromotionManagerProps {
  promotions: Promotion[]
  onCreate: (promotion: Omit<Promotion, "id">) => void
  onToggle: (id: string, active: boolean) => void
  onDelete: (id: string) => void
}

export function PromotionManager({ promotions, onCreate, onToggle, onDelete }: PromotionManagerProps) {
  const [form, setForm] = useState<Omit<Promotion, "id">>({
    name: "",
    description: "",
    discountType: "percentage",
    discountValue: 10,
    channels: ["web", "email"],
    active: true,
  })

  return (
    <Card className="neon-border-hover glass-panel text-slate-900 dark:text-slate-100">
      <CardHeader>
        <CardTitle>Quản lý khuyến mãi</CardTitle>
        <CardDescription>Tạo flash sale, bundle deal và phân phối đa kênh</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Input placeholder="Tên chiến dịch" value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} />
            <Textarea placeholder="Mô tả" rows={3} value={form.description} onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))} />
            <div className="flex gap-2">
              <select className="px-3 py-2 border rounded-md bg-background text-sm" value={form.discountType} onChange={(e) => setForm((prev) => ({ ...prev, discountType: e.target.value as Promotion["discountType"] }))}>
                <option value="percentage">%</option>
                <option value="fixed">VNĐ</option>
              </select>
              <Input type="number" value={form.discountValue} onChange={(e) => setForm((prev) => ({ ...prev, discountValue: Number(e.target.value) }))} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Kích hoạt ngay</span>
              <Switch checked={form.active} onCheckedChange={(checked) => setForm((prev) => ({ ...prev, active: checked }))} />
            </div>
            <Button onClick={() => onCreate(form)}>Tạo khuyến mãi</Button>
          </div>

          <div className="space-y-3 max-h-[320px] overflow-y-auto pr-2">
            {promotions.length === 0 ? (
              <p className="text-sm text-muted-foreground">Chưa có chiến dịch nào.</p>
            ) : (
              promotions.map((promotion) => (
                <div key={promotion.id} className="border rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold">{promotion.name}</p>
                    <Badge variant={promotion.active ? "secondary" : "outline"}>
                      {promotion.discountType === "percentage" ? `${promotion.discountValue}%` : `${promotion.discountValue.toLocaleString("vi-VN")}đ`}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{promotion.description}</p>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <div className="flex gap-2">
                      {promotion.channels.map((channel) => (
                        <Badge key={channel} variant="outline">
                          {channel}
                        </Badge>
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch checked={promotion.active} onCheckedChange={(checked) => onToggle(promotion.id, checked)} />
                      <Button size="sm" variant="ghost" className="text-red-500" onClick={() => onDelete(promotion.id)}>
                        Xóa
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

