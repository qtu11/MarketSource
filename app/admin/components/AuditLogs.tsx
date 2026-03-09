"use client"

import { useMemo } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Download } from "lucide-react"

export interface AuditLog {
  id: string
  action: string
  entityType: string
  entityId?: string
  userEmail?: string
  adminEmail?: string
  ipAddress?: string
  createdAt: string
  oldData?: Record<string, any>
  newData?: Record<string, any>
}

interface AuditLogsProps {
  logs: AuditLog[]
  search: string
  onSearchChange: (value: string) => void
  onExport: () => void
}

export function AuditLogs({ logs, search, onSearchChange, onExport }: AuditLogsProps) {
  const filtered = useMemo(() => {
    if (!search.trim()) return logs
    return logs.filter((log) =>
      [log.action, log.entityType, log.userEmail, log.adminEmail, log.ipAddress]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(search.toLowerCase()))
    )
  }, [logs, search])

  return (
    <Card className="neon-border-hover glass-panel text-slate-900 dark:text-slate-100">
      <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <CardTitle>Audit logs</CardTitle>
          <CardDescription>Theo dõi toàn bộ hành động quan trọng trên hệ thống</CardDescription>
        </div>
        <div className="flex gap-2">
          <Input placeholder="Tìm theo user, entity, IP..." value={search} onChange={(e) => onSearchChange(e.target.value)} />
          <Button variant="outline" onClick={onExport}>
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[420px] pr-4">
          <div className="space-y-3">
            {filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground">Không có bản ghi nào.</p>
            ) : (
              filtered.map((log) => (
                <div key={log.id} className="border rounded-xl p-4 space-y-2">
                  <div className="flex flex-wrap gap-2 items-center justify-between">
                    <div>
                      <p className="font-semibold text-sm">{log.action}</p>
                      <p className="text-xs text-muted-foreground">
                        {log.entityType} #{log.entityId || "---"}
                      </p>
                    </div>
                    <Badge variant="outline">
                      {new Date(log.createdAt).toLocaleString("vi-VN")}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    {log.userEmail && <Badge variant="secondary">User: {log.userEmail}</Badge>}
                    {log.adminEmail && <Badge variant="outline">Admin: {log.adminEmail}</Badge>}
                    {log.ipAddress && <Badge variant="outline">IP: {log.ipAddress}</Badge>}
                  </div>
                  {(log.oldData || log.newData) && (
                    <pre className="bg-muted p-2 text-xs rounded-lg overflow-x-auto">
                      {JSON.stringify({ old: log.oldData, new: log.newData }, null, 2)}
                    </pre>
                  )}
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  )
}

