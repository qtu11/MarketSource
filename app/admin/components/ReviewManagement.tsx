"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Star, Trash } from "lucide-react"

interface AdminReview {
  id: string
  productTitle: string
  userEmail: string
  rating: number
  comment: string
  status: "pending" | "published" | "rejected"
  createdAt: string
}

interface ReviewManagementProps {
  reviews: AdminReview[]
  onApprove: (id: string) => void
  onReject: (id: string, reason: string) => void
  onDelete: (id: string) => void
  onRespond: (id: string, message: string) => void
}

export function ReviewManagement({ reviews, onApprove, onReject, onDelete, onRespond }: ReviewManagementProps) {
  return (
    <Card className="neon-border-hover glass-panel text-slate-900 dark:text-slate-100">
      <CardHeader>
        <CardTitle>Quản lý đánh giá</CardTitle>
        <CardDescription>Duyệt, phản hồi hoặc xóa đánh giá spam</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 max-h-[520px] overflow-y-auto pr-2">
        {reviews.length === 0 ? (
          <p className="text-sm text-muted-foreground">Không có đánh giá nào.</p>
        ) : (
          reviews.map((review) => (
            <div key={review.id} className="border rounded-xl p-4 space-y-3">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="font-semibold text-sm">{review.productTitle}</p>
                  <p className="text-xs text-muted-foreground">{review.userEmail}</p>
                </div>
                <Badge
                  variant={
                    review.status === "published" ? "secondary" : review.status === "pending" ? "outline" : "destructive"
                  }
                >
                  {review.status}
                </Badge>
              </div>

              <div className="flex gap-1">
                {[...Array(5)].map((_, idx) => (
                  <Star key={idx} className={`w-4 h-4 ${idx < review.rating ? "text-yellow-400 fill-yellow-400" : "text-gray-300"}`} />
                ))}
              </div>

              <p className="text-sm text-muted-foreground">{review.comment}</p>
              <p className="text-xs text-muted-foreground">
                {new Date(review.createdAt).toLocaleString("vi-VN")}
              </p>

              <Textarea
                placeholder="Gửi phản hồi cho người dùng..."
                rows={2}
                onBlur={(e) => e.target.value && onRespond(review.id, e.target.value)}
              />

              <div className="flex flex-wrap gap-2">
                {review.status === "pending" && (
                  <>
                    <Button size="sm" onClick={() => onApprove(review.id)}>
                      Duyệt
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => onReject(review.id, "Không phù hợp")}>
                      Từ chối
                    </Button>
                  </>
                )}
                <Button size="sm" variant="ghost" className="text-red-500" onClick={() => onDelete(review.id)}>
                  <Trash className="w-4 h-4 mr-1" />
                  Xóa
                </Button>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}

