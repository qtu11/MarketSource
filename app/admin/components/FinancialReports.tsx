"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Download, FileText } from "lucide-react"

interface FinancialRow {
  period: string
  revenue: number
  cost: number
  profit: number
  tax: number
}

interface FinancialReportsProps {
  rows: FinancialRow[]
  onExportPDF: () => void
  onExportExcel: () => void
}

export function FinancialReports({ rows, onExportExcel, onExportPDF }: FinancialReportsProps) {
  return (
    <Card className="neon-border-hover glass-panel text-slate-900 dark:text-slate-100">
      <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <CardTitle>Báo cáo tài chính</CardTitle>
          <CardDescription>Doanh thu, lợi nhuận và thuế theo kỳ</CardDescription>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onExportExcel}>
            <Download className="w-4 h-4 mr-2" />
            Excel
          </Button>
          <Button onClick={onExportPDF}>
            <FileText className="w-4 h-4 mr-2" />
            PDF
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[360px]">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-xs text-muted-foreground uppercase tracking-wide border-b">
                <th className="py-2">Kỳ</th>
                <th>Doanh thu</th>
                <th>Chi phí</th>
                <th>Lợi nhuận</th>
                <th>Thuế</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.period} className="border-b last:border-b-0">
                  <td className="py-2 font-semibold">{row.period}</td>
                  <td>{row.revenue.toLocaleString("vi-VN")}đ</td>
                  <td>{row.cost.toLocaleString("vi-VN")}đ</td>
                  <td className={row.profit >= 0 ? "text-green-600" : "text-red-500"}>
                    {row.profit.toLocaleString("vi-VN")}đ
                  </td>
                  <td>
                    <Badge variant="secondary">{row.tax.toLocaleString("vi-VN")}đ</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollArea>
      </CardContent>
    </Card>
  )
}

