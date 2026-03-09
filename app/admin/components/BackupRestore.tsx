"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { AlertTriangle, HardDrive, UploadCloud } from "lucide-react"

export interface BackupItem {
  id: string
  label: string
  createdAt: string
  size: string
  type: "manual" | "auto"
  status: "ready" | "in-progress"
}

interface BackupRestoreProps {
  backups: BackupItem[]
  onBackup: (type: "full" | "incremental") => void
  onRestore: (id: string) => void
  isBackingUp?: boolean
  isRestoring?: boolean
}

export function BackupRestore({ backups, onBackup, onRestore, isBackingUp = false, isRestoring = false }: BackupRestoreProps) {
  const [selectedBackup, setSelectedBackup] = useState<string | null>(null)

  return (
    <Card className="neon-border-hover glass-panel text-slate-900 dark:text-slate-100">
      <CardHeader>
        <CardTitle>Sao lưu & Khôi phục</CardTitle>
        <CardDescription>Bảo vệ dữ liệu quan trọng, hỗ trợ restore trong 1 click</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="border rounded-xl p-4 space-y-3">
            <p className="text-sm font-semibold flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-blue-500" />
              Tạo backup
            </p>
            <div className="flex gap-2">
              <Button className="flex-1" variant="outline" disabled={isBackingUp} onClick={() => onBackup("incremental")}>
                Incremental
              </Button>
              <Button className="flex-1" disabled={isBackingUp} onClick={() => onBackup("full")}>
                Full backup
              </Button>
            </div>
            {isBackingUp && <Progress value={60} />}
          </div>

          <div className="border rounded-xl p-4 space-y-3">
            <p className="text-sm font-semibold flex items-center gap-2">
              <UploadCloud className="w-4 h-4 text-emerald-500" />
              Khôi phục
            </p>
            <select className="px-3 py-2 border rounded-md bg-background text-sm" value={selectedBackup ?? ""} onChange={(e) => setSelectedBackup(e.target.value)}>
              <option value="">Chọn bản backup</option>
              {backups.map((backup) => (
                <option key={backup.id} value={backup.id}>
                  {backup.label} • {backup.size}
                </option>
              ))}
            </select>
            <Button disabled={!selectedBackup || isRestoring} onClick={() => selectedBackup && onRestore(selectedBackup)}>
              Restore
            </Button>
            {isRestoring && <Progress value={45} />}
          </div>
        </div>

        <div className="border rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">Lịch sử backup</p>
            <Badge variant="outline">{backups.length} bản ghi</Badge>
          </div>
          <div className="space-y-2 max-h-[240px] overflow-y-auto pr-2">
            {backups.map((backup) => (
              <div key={backup.id} className="p-3 border rounded-lg flex flex-wrap gap-2 items-center justify-between">
                <div>
                  <p className="text-sm font-semibold">{backup.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(backup.createdAt).toLocaleString("vi-VN")} • {backup.size}
                  </p>
                </div>
                <Badge variant={backup.type === "manual" ? "secondary" : "outline"}>{backup.type}</Badge>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <AlertTriangle className="w-3 h-3 text-amber-500" />
            Nên tải backup xuống máy tính hàng tuần để phòng sự cố.
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

