"use client"

export const runtime = 'nodejs'

import { useState, useEffect } from "react"
import { logger } from "@/lib/logger-client"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Lock, AlertCircle, CheckCircle, Loader2, ArrowLeft } from "lucide-react"
// Make sure changePassword is exported from "@/lib/auth"
// If the function is named differently, update the import accordingly
import { changePassword } from "@/lib/auth"
import { getDeviceInfo, getIPAddress } from "@/lib/auth"
import { FloatingHeader } from "@/components/floating-header"
import { Footer } from "@/components/footer"
import Link from "next/link"

export default function ChangePasswordPage() {
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  // Check if user is logged in
  useEffect(() => {
    if (typeof window !== "undefined") {
      const isLoggedIn = localStorage.getItem("isLoggedIn") === "true"
      const userStr = localStorage.getItem("currentUser")
      if (!isLoggedIn || !userStr) {
        router.push("/auth/login")
      }
    }
  }, [router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setSuccess("")
    setLoading(true)

    // Validation
    if (!currentPassword) {
      setError("Vui lòng nhập mật khẩu hiện tại!")
      setLoading(false)
      return
    }

    if (!newPassword) {
      setError("Vui lòng nhập mật khẩu mới!")
      setLoading(false)
      return
    }

    if (!confirmPassword) {
      setError("Vui lòng xác nhận mật khẩu mới!")
      setLoading(false)
      return
    }

    if (newPassword !== confirmPassword) {
      setError("Mật khẩu mới và xác nhận mật khẩu không khớp!")
      setLoading(false)
      return
    }

    if (newPassword.length < 6) {
      setError("Mật khẩu mới phải có ít nhất 6 ký tự!")
      setLoading(false)
      return
    }

    try {
      const currentUser = JSON.parse(localStorage.getItem("currentUser") || "{}")
      const deviceInfo = getDeviceInfo()
      const ipAddress = await getIPAddress()
      const result = await changePassword(currentUser.email, newPassword, currentPassword)
      
      if (!result.success) {
        setError("Có lỗi xảy ra khi đổi mật khẩu")
      } else {
        setSuccess("Đổi mật khẩu thành công! Đang chuyển hướng...")
        setTimeout(() => {
          router.push("/dashboard")
        }, 1500)
      }
    } catch (error: any) {
      logger.error("Change password error", error)
      setError(error.message || "Đã xảy ra lỗi khi đổi mật khẩu. Vui lòng thử lại!")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <FloatingHeader />
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-md mx-auto">
          <Card className="backdrop-blur-sm bg-white/80 dark:bg-gray-900/80 border-white/20 shadow-xl">
            <CardHeader className="space-y-1">
              <CardTitle className="text-2xl text-center flex items-center justify-center gap-2">
                <Lock className="w-6 h-6 text-blue-600" />
                Đổi Mật Khẩu
              </CardTitle>
              <CardDescription className="text-center">
                Cập nhật mật khẩu tài khoản của bạn
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              {error && (
                <Alert variant="destructive" className="border-red-200 bg-red-50 dark:bg-red-900/20">
                  <AlertCircle className="h-4 w-4 text-red-600" />
                  <AlertDescription className="text-red-600 dark:text-red-400">{error}</AlertDescription>
                </Alert>
              )}

              {success && (
                <Alert className="border-green-200 bg-green-50 dark:bg-green-900/20">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <AlertDescription className="text-green-600 dark:text-green-400">{success}</AlertDescription>
                </Alert>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="currentPassword">Mật khẩu hiện tại</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="currentPassword"
                      type="password"
                      placeholder="Nhập mật khẩu hiện tại"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      className="pl-10"
                      disabled={loading}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="newPassword">Mật khẩu mới</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="newPassword"
                      type="password"
                      placeholder="Nhập mật khẩu mới"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="pl-10"
                      disabled={loading}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Xác nhận mật khẩu mới</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="confirmPassword"
                      type="password"
                      placeholder="Xác nhận mật khẩu mới"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="pl-10"
                      disabled={loading}
                      required
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
                  disabled={loading}
                >
                  {loading ? (
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Đang xử lý...
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Lock className="w-4 h-4" />
                      Đổi Mật Khẩu
                    </div>
                  )}
                </Button>
              </form>
            </CardContent>

            <CardFooter className="flex justify-center">
              <Link href="/dashboard" className="inline-flex items-center text-primary hover:underline font-medium">
                <ArrowLeft className="w-4 h-4 mr-1" />
                Quay lại Dashboard
              </Link>
            </CardFooter>
          </Card>
        </div>
      </main>
      <Footer />
    </div>
  )
}