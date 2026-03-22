"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, XCircle } from 'lucide-react';

interface DepositProps {
  pendingDeposits: any[];
  processingDeposit: string | null;
  approveDeposit: (depositId: string) => void;
  rejectDeposit: (depositId: string) => void;
  loadData: () => void;
}

export function Deposit({
  pendingDeposits,
  processingDeposit,
  approveDeposit,
  rejectDeposit,
  loadData
}: DepositProps) {
  const [showRejected, setShowRejected] = useState(false)
  /** Bật «Hiện đã duyệt»: chờ + đã duyệt (ẩn từ chối). «Hiện đã từ chối»: chỉ các lệnh rejected. */
  const [includeApproved, setIncludeApproved] = useState(false)

  const filteredDeposits = pendingDeposits.filter(d => {
    if (showRejected) return d.status === "rejected"
    if (!includeApproved) return d.status === "pending"
    return d.status !== "rejected"
  })

  return (
    <div className="space-y-6">
      <Card className="shadow-md neon-border-hover glass-panel text-slate-900 dark:text-slate-100">
        <CardHeader>
          <CardTitle className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center space-x-2">
              Yêu cầu nạp tiền ({filteredDeposits.length})
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse"></div>
                <span className="text-xs text-muted-foreground">Real-time</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={loadData}>
                Làm mới
              </Button>
              <Button
                size="sm"
                variant={includeApproved ? "default" : "outline"}
                onClick={() => setIncludeApproved(!includeApproved)}
                className="text-xs h-7"
                disabled={showRejected}
              >
                {includeApproved ? "Chỉ chờ duyệt" : "Hiện đã duyệt"}
              </Button>
              <Button
                size="sm"
                variant={showRejected ? "default" : "outline"}
                onClick={() => setShowRejected(!showRejected)}
                className="text-xs h-7"
              >
                {showRejected ? "Ẩn đã từ chối" : "Hiện đã từ chối"}
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {filteredDeposits
              .sort((a, b) => new Date(b.created_at || b.timestamp || 0).getTime() - new Date(a.created_at || a.timestamp || 0).getTime())
              .map((deposit) => (
                <div key={deposit.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2">
                      <h3 className="font-semibold">{deposit.userName || 'Unknown User'}</h3>
                      {deposit.status === "pending" && (
                        <Badge className="bg-yellow-500 text-white animate-pulse shadow-md">Mới</Badge>
                      )}
                      {deposit.userStatus && (
                        <Badge className={
                          deposit.userStatus === "active" ? "bg-green-500 text-white shadow-md" :
                            "bg-red-500 text-white shadow-md"
                        }>
                          {deposit.userStatus === "active" ? "Hoạt động" : "Khóa"}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{deposit.userEmail}</p>

                    {/* Enhanced User Info */}
                    <div className="mt-2 p-2 bg-gray-100 dark:bg-gray-800 rounded border-l-4 border-blue-500 shadow-inner">
                      <p className="text-xs text-blue-600">
                        💰 Số dư hiện tại: {Number(deposit.userBalance || 0).toLocaleString('vi-VN')}đ
                      </p>
                      <p className="text-xs text-green-600">
                        ➕ Sau nạp: {(Number(deposit.userBalance || 0) + Number(deposit.amount || 0)).toLocaleString('vi-VN')}đ
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      <Badge className="bg-blue-500 text-white shadow-md">{deposit.method}</Badge>
                      {(deposit.deposit_reference_code || deposit.depositReferenceCode) && (
                        <span className="text-sm font-mono text-amber-600 dark:text-amber-400">
                          Mã giao dịch (hệ thống): {deposit.deposit_reference_code || deposit.depositReferenceCode}
                        </span>
                      )}
                      <span className="text-sm text-muted-foreground">
                        Mã GD ngân hàng: {deposit.transactionId || deposit.transaction_id || "—"}
                      </span>
                    </div>
                    <div className="mt-2 space-y-1">
                      <p className="text-xs text-muted-foreground">
                        🕐 Thời gian: {deposit.requestTimeFormatted}
                      </p>
                      <p className="text-xs text-blue-600">
                        🌐 IP: {deposit.ipAddress || deposit.ip_address || 'Unknown'}
                      </p>
                      <p className="text-xs text-blue-600">
                        📱 Thiết bị: {deposit.deviceInfo?.deviceType || deposit.device_info?.deviceType || 'Unknown'} ({deposit.deviceInfo?.browser || deposit.device_info?.browser || 'Unknown'})
                      </p>
                      {deposit.note && (
                        <p className="text-xs text-gray-700 bg-gray-100 dark:bg-gray-700 p-2 rounded shadow-sm">
                          📝 Ghi chú: {deposit.note}
                        </p>
                      )}
                      {deposit.processed && (
                        <div className="text-xs text-green-700 bg-green-50 dark:bg-green-900 p-2 rounded shadow-sm">
                          ✅ Đã xử lý bởi: {deposit.approvedBy} lúc {new Date(deposit.approvedTime).toLocaleString('vi-VN')}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center space-x-4">
                    <div className="text-right">
                      <p className="text-lg font-bold text-green-600">
                        {deposit.amount.toLocaleString('vi-VN')}đ
                      </p>
                      <Badge className={
                        deposit.status === "pending" ? "bg-yellow-500 text-white shadow-md" :
                          deposit.status === "approved" ? "bg-green-500 text-white shadow-md" :
                            "bg-red-500 text-white shadow-md"
                      }>
                        {deposit.status === "pending" ? "Chờ duyệt" :
                          deposit.status === "approved" ? "Đã duyệt" : "Từ chối"}
                      </Badge>
                    </div>
                    {deposit.status === "pending" && (
                      <div className="flex space-x-2">
                        <Button
                          size="sm"
                          onClick={() => approveDeposit(deposit.id)}
                          disabled={processingDeposit === deposit.id}
                          className="bg-green-600 hover:bg-green-700 text-white shadow-md"
                        >
                          {processingDeposit === deposit.id ? (
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                          ) : (
                            <CheckCircle className="w-4 h-4" />
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => rejectDeposit(deposit.id)}
                          disabled={processingDeposit === deposit.id}
                          className="text-red-600 hover:text-red-700 border-red-500 disabled:opacity-50"
                        >
                          <XCircle className="w-4 h-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            {filteredDeposits.length === 0 && (
              <p className="text-center text-muted-foreground py-8">
                {pendingDeposits.length === 0
                  ? 'Không có yêu cầu nạp tiền nào'
                  : showRejected
                    ? 'Không có yêu cầu nạp tiền bị từ chối.'
                    : !includeApproved
                      ? 'Không có yêu cầu chờ duyệt. Nhấn «Hiện đã duyệt» để xem lịch sử.'
                      : 'Không có mục nào khớp bộ lọc hiện tại.'}
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
