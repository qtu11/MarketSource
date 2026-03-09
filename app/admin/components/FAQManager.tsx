"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"

export interface FAQItem {
  id: string
  category: string
  question: string
  answer: string
  isPublished: boolean
  viewCount: number
}

interface FAQManagerProps {
  faqs: FAQItem[]
  onSave: (faq: Omit<FAQItem, "id" | "viewCount">) => void
  onToggle: (id: string) => void
  onDelete: (id: string) => void
}

export function FAQManager({ faqs, onSave, onToggle, onDelete }: FAQManagerProps) {
  const [form, setForm] = useState<Omit<FAQItem, "id" | "viewCount">>({
    category: "General",
    question: "",
    answer: "",
    isPublished: true,
  })

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card className="neon-border-hover glass-panel text-slate-900 dark:text-slate-100">
        <CardHeader>
          <CardTitle>FAQ Builder</CardTitle>
          <CardDescription>Tạo câu hỏi thường gặp cho khách hàng</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <select className="px-3 py-2 border rounded-md bg-background text-sm" value={form.category} onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}>
            <option value="General">General</option>
            <option value="Payment">Payment</option>
            <option value="Product">Product</option>
            <option value="Account">Account</option>
          </select>
          <Input placeholder="Câu hỏi" value={form.question} onChange={(e) => setForm((prev) => ({ ...prev, question: e.target.value }))} />
          <Textarea placeholder="Câu trả lời chi tiết" rows={4} value={form.answer} onChange={(e) => setForm((prev) => ({ ...prev, answer: e.target.value }))} />
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>Xuất bản ngay</span>
            <input type="checkbox" checked={form.isPublished} onChange={(e) => setForm((prev) => ({ ...prev, isPublished: e.target.checked }))} />
          </div>
          <Button className="w-full" onClick={() => onSave(form)}>
            Lưu FAQ
          </Button>
        </CardContent>
      </Card>

      <Card className="neon-border-hover glass-panel text-slate-900 dark:text-slate-100">
        <CardHeader className="flex items-center justify-between">
          <div>
            <CardTitle>Danh sách FAQ</CardTitle>
            <CardDescription>{faqs.length} câu hỏi</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 max-h-[420px] overflow-y-auto pr-2">
          {faqs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Chưa có FAQ nào.</p>
          ) : (
            faqs.map((faq) => (
              <div key={faq.id} className="border rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <Badge variant="secondary">{faq.category}</Badge>
                  <Badge variant={faq.isPublished ? "outline" : "destructive"}>
                    {faq.isPublished ? "Published" : "Draft"}
                  </Badge>
                </div>
                <p className="font-semibold">{faq.question}</p>
                <p className="text-sm text-muted-foreground">{faq.answer}</p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => onToggle(faq.id)}>
                    {faq.isPublished ? "Ẩn" : "Xuất bản"}
                  </Button>
                  <Button size="sm" variant="ghost" className="text-red-500" onClick={() => onDelete(faq.id)}>
                    Xóa
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}

