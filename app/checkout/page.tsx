"use client"

import { logger } from "@/lib/logger-client"

import { useState, useEffect, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Separator } from "@/components/ui/separator"
import { CheckCircle, AlertCircle, ShoppingCart, CreditCard, ArrowLeft } from 'lucide-react'
import { Logo } from "@/components/logo"
import Link from "next/link"
import Image from "next/image"
import { getDeviceInfo, getIPAddress } from "@/lib/auth"
import { getLocalStorage, setLocalStorage, removeLocalStorage } from "@/lib/localStorage-utils"
import { FloatingHeader } from "@/components/floating-header"
import { Footer } from "@/components/footer"
import dynamic from "next/dynamic"

// Lazy load Three.js components để tối ưu performance
const ThreeJSProductShowcase = dynamic(
  async () => {
    try {
      const mod = await import("@/components/three-js-product-showcase")
      return { default: mod.ThreeJSProductShowcase }
    } catch (error) {
      logger.error('Failed to load ThreeJS Product Showcase component', error)
      throw error
    }
  },
  { 
    ssr: false,
    loading: () => <div className="absolute inset-0 bg-gradient-to-b from-purple-100 to-pink-100 dark:from-purple-900 dark:to-pink-900" />
  }
)

const ThreeDFallback = dynamic(
  async () => {
    try {
      const mod = await import("@/components/3d-fallback")
      return { default: mod.ThreeDFallback }
    } catch (error) {
      logger.error('Failed to load 3D Fallback component', error)
      throw error
    }
  },
  { ssr: false }
)

function CheckoutContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [cartItems, setCartItems] = useState<any[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    // ✅ FIX: Load current user từ userManager để đảm bảo sync với database
    const loadUser = async () => {
      try {
        const { userManager } = await import('@/lib/userManager');
        if (!userManager.isLoggedIn()) {
          router.push("/auth/login")
          return
        }
        
        const user = await userManager.getUser();
        if (user) {
          setCurrentUser(user);
        } else {
          router.push("/auth/login")
          return
        }
      } catch (error) {
        logger.error('Error loading user', error);
        // Fallback to localStorage
        const currentUserFromStorage =
          getLocalStorage<any>("currentUser", null) || getLocalStorage<any>("qtusdev_user", null)
        const isLoggedIn = getLocalStorage<string | null>("isLoggedIn", null) === "true"
        
        if (!currentUserFromStorage || !isLoggedIn) {
          router.push("/auth/login")
          return
        }
        
        setCurrentUser(currentUserFromStorage)
      }
    };
    
    loadUser();

    // Load cart items
    const cart = getLocalStorage<any[]>("cartItems", [])
    if (cart.length === 0) {
      router.push("/products")
      return
    }
    setCartItems(cart)
  }, [router])

  const totalAmount = cartItems
    .filter((item: any) => item.quantity === undefined || Number(item.quantity) > 0)
    .reduce((sum, item) => {
      const priceNum = typeof item.price === 'number' ? item.price : Number(item.price) || 0;
      const qtyNum = item.quantity !== undefined ? Number(item.quantity) : 1;
      return sum + (priceNum * Math.max(0, qtyNum));
    }, 0)

  const handlePurchase = async () => {
    if (!currentUser || cartItems.length === 0) return

    setIsProcessing(true)
    setError("")

    try {
      // Check if data is valid
      if (isNaN(totalAmount) || totalAmount < 0 || !isFinite(totalAmount)) {
        setError("Dữ liệu giỏ hàng không hợp lệ!")
        return
      }

      // Check if user has enough balance
      if ((currentUser.balance || 0) < totalAmount) {
        setError("Số dư không đủ. Vui lòng nạp thêm tiền vào tài khoản.")
        return
      }

      // Get device info and IP address
      const deviceInfo = getDeviceInfo()
      const ipAddress = await getIPAddress()

      // Create order
      const orderId = `ORDER_${Date.now()}`
      const order = {
        id: orderId,
        userId: currentUser.id,
        userEmail: currentUser.email,
        userName: currentUser.name || currentUser.email,
        items: cartItems,
        totalAmount: totalAmount,
        status: "completed",
        orderTime: new Date().toISOString(),
        orderTimeFormatted: new Date().toLocaleString("vi-VN"),
        deviceInfo,
        ipAddress
      }

      // Save order to localStorage
      const orders = getLocalStorage<any[]>("orders", [])
      orders.unshift(order)
      setLocalStorage("orders", orders)

      // ✅ FIX: Create purchase records trong database TRƯỚC khi update balance
      // Đảm bảo purchase thành công mới trừ tiền
      // Balance đã được trừ trong createPurchase() function (transaction-safe)
      const purchaseResults = [];
      const successfulItems: number[] = [];
      let lastError = null;
      // ✅ BUG #9+#12 FIX: Dùng apiPost thay vì raw fetch + localStorage token
      const { apiPost } = await import('@/lib/api-client');
      try {
        for (const item of cartItems) {
          const result = await apiPost('/api/purchases', {
            userId: currentUser.uid || currentUser.id,
            productId: item.id,
            amount: (typeof item.price === 'number' ? item.price : Number(item.price) || 0) * (item.quantity !== undefined ? Number(item.quantity) : 1),
            userEmail: currentUser.email
          });
          
          if (!result.success) {
            throw new Error(result.error || 'Purchase failed');
          }
          purchaseResults.push(result);
          successfulItems.push(item.id);
        }
      } catch (purchaseError: any) {
        logger.error('Failed processing purchase records', purchaseError);
        lastError = purchaseError;
      }

      // Giữ lại item lỗi
      const remainingCart = cartItems.filter(item => !successfulItems.includes(item.id));
      setCartItems(remainingCart);

      if (remainingCart.length === 0) {
        removeLocalStorage("cartItems");
      } else {
        setLocalStorage("cartItems", remainingCart);
        window.dispatchEvent(new Event("cartUpdated"));
        
        if (lastError) {
          setError('Một số sản phẩm thanh toán bị lỗi: ' + (lastError.message || 'Unknown Error') + '. Hệ thống đã ghi nhận các sản phẩm thành công.');
          setIsProcessing(false);
          // Refetch fresh balance to show correctly
          const { userManager } = await import('@/lib/userManager');
          const updatedUserData = await userManager.getUser();
          if (updatedUserData) {
            setCurrentUser({...currentUser, balance: updatedUserData.balance});
          }
          return;
        }
      }

      // ✅ FIX: Chỉ update balance SAU KHI tất cả purchases thành công
      // Balance đã được trừ trong createPurchase() function (transaction-safe)
      const { userManager } = await import('@/lib/userManager');
      // Reload user để có balance mới nhất từ database
      const updatedUserData = await userManager.getUser();
      if (updatedUserData) {
        const totalPaid = cartItems
          .filter(item => successfulItems.includes(item.id))
          .reduce((sum, item) => sum + ((typeof item.price === 'number' ? item.price : Number(item.price) || 0) * (item.quantity !== undefined ? Number(item.quantity) : 1)), 0);

        const updatedUser = {
          ...currentUser,
          ...updatedUserData, // ✅ Mới đúng, merge hết Data mới nhất để không mất loginCount, avatar, v.v
          balance: updatedUserData.balance || (currentUser.balance || 0) - totalPaid
        };
        setLocalStorage("currentUser", updatedUser);
        setCurrentUser(updatedUser);
      }
      
      // Dispatch event để các component khác update
      window.dispatchEvent(new Event("userUpdated"));

      // Clear cart
      removeLocalStorage("cartItems")

      setSuccess(true)

    } catch (error) {
      logger.error("Purchase error", error)
      setError("Có lỗi xảy ra khi xử lý đơn hàng. Vui lòng thử lại!")
    } finally {
      setIsProcessing(false)
    }
  }

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Logo />
          <p className="mt-4 text-muted-foreground">Đang tải...</p>
        </div>
      </div>
    )
  }

  if (success) {
    return (
      <div className="min-h-screen bg-background relative">
        {/* 3D Background */}
        <div className="absolute inset-0">
          <ThreeJSProductShowcase />
          <ThreeDFallback />
        </div>
        
        <FloatingHeader />
        
        <div className="min-h-screen flex items-center justify-center relative z-10">
          <Card className="w-full max-w-md">
            <CardContent className="pt-6">
              <div className="text-center">
                <CheckCircle className="h-16 w-16 text-green-600 mx-auto mb-4" />
                <h2 className="text-2xl font-bold mb-2">Thanh toán thành công!</h2>
                <p className="text-muted-foreground mb-4">
                  Đơn hàng của bạn đã được xử lý thành công.
                </p>
                <Badge variant="secondary" className="mb-4">
                  Tổng tiền: {totalAmount.toLocaleString('vi-VN')}đ
                </Badge>
                <div className="space-y-2">
                  <Button 
                    onClick={() => router.push("/dashboard")}
                    className="w-full"
                  >
                    Về trang chủ
                  </Button>
                  <Button 
                    onClick={() => router.push("/products")}
                    variant="outline"
                    className="w-full"
                  >
                    Tiếp tục mua sắm
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
        <Footer />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background relative">
      {/* 3D Background */}
      <div className="absolute inset-0">
        <ThreeJSProductShowcase />
        <ThreeDFallback />
      </div>
      
      <FloatingHeader />
      
      <div className="container mx-auto px-4 py-8 relative z-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center space-x-4">
            <Link href="/cart" className="flex items-center space-x-2 hover:opacity-80 transition-opacity">
              <ArrowLeft className="w-5 h-5" />
              <span>Quay lại giỏ hàng</span>
            </Link>
            <Logo />
          </div>
          <div className="text-right">
            <p className="text-sm text-muted-foreground">Người dùng: {currentUser.name || currentUser.email}</p>
            <p className="text-2xl font-bold text-green-600">
              Số dư: {(currentUser.balance || 0).toLocaleString('vi-VN')}đ
            </p>
          </div>
        </div>

        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold mb-2">Thanh toán đơn hàng</h1>
            <p className="text-muted-foreground">Xem lại đơn hàng và hoàn tất thanh toán</p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <ShoppingCart className="w-5 h-5" />
                <span>Chi tiết đơn hàng</span>
              </CardTitle>
              <CardDescription>
                Kiểm tra lại các sản phẩm trong đơn hàng
              </CardDescription>
            </CardHeader>
            <CardContent>
              {error && (
                <Alert className="mb-4 border-red-200 bg-red-50 dark:bg-red-900/20">
                  <AlertCircle className="h-4 w-4 text-red-600" />
                  <AlertDescription className="text-red-600 dark:text-red-400">
                    {error}
                  </AlertDescription>
                </Alert>
              )}

              {/* Order Items */}
              <div className="space-y-4 mb-6">
                {cartItems.map((item) => (
                  <div key={item.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center space-x-4">
                      <Image
                        src={item.image || "/placeholder.svg"} 
                        alt={item.title}
                        width={64}
                        height={64}
                        className="w-16 h-16 object-cover rounded"
                      />
                      <div>
                        <h3 className="font-semibold">{item.title}</h3>
                        <p className="text-sm text-muted-foreground">{item.description}</p>
                        <Badge variant="secondary">Số lượng: {item.quantity}</Badge>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">{((typeof item.price === 'number' ? item.price : Number(item.price) || 0) * (item.quantity !== undefined ? Number(item.quantity) : 1)).toLocaleString('vi-VN')}đ</p>
                      <p className="text-sm text-muted-foreground">{(typeof item.price === 'number' ? item.price : Number(item.price) || 0).toLocaleString('vi-VN')}đ x {item.quantity !== undefined ? Number(item.quantity) : 1}</p>
                    </div>
                  </div>
                ))}
              </div>

              <Separator className="my-4" />

              {/* Order Summary */}
              <div className="space-y-2 mb-6">
                <div className="flex justify-between">
                  <span>Tạm tính:</span>
                  <span>{totalAmount.toLocaleString('vi-VN')}đ</span>
                </div>
                <div className="flex justify-between">
                  <span>Phí giao dịch:</span>
                  <span>0đ</span>
                </div>
                <Separator />
                <div className="flex justify-between text-lg font-semibold">
                  <span>Tổng cộng:</span>
                  <span className="text-blue-600">{totalAmount.toLocaleString('vi-VN')}đ</span>
                </div>
              </div>

              {/* Balance Check */}
              <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg mb-6">
                <div className="flex justify-between items-center">
                  <span>Số dư hiện tại:</span>
                  <span className="font-semibold">{(currentUser.balance || 0).toLocaleString('vi-VN')}đ</span>
                </div>
                <div className="flex justify-between items-center">
                  <span>Số dư sau thanh toán:</span>
                  <span className={`font-semibold ${(currentUser.balance || 0) >= totalAmount ? 'text-green-600' : 'text-red-600'}`}>
                    {((currentUser.balance || 0) - totalAmount).toLocaleString('vi-VN')}đ
                  </span>
                </div>
              </div>

              {/* Payment Button */}
              <Button
                onClick={handlePurchase}
                disabled={isProcessing || (currentUser.balance || 0) < totalAmount}
                className="w-full bg-blue-600 hover:bg-blue-700"
                size="lg"
              >
                {isProcessing ? (
                  <div className="flex items-center">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Đang xử lý...
                  </div>
                ) : (
                  <div className="flex items-center">
                    <CreditCard className="w-4 h-4 mr-2" />
                    Thanh toán {totalAmount.toLocaleString('vi-VN')}đ
                  </div>
                )}
              </Button>

              {(currentUser.balance || 0) < totalAmount && (
                <div className="mt-4 text-center">
                  <p className="text-sm text-muted-foreground mb-2">
                    Bạn cần nạp thêm {(totalAmount - (currentUser.balance || 0)).toLocaleString('vi-VN')}đ
                  </p>
                  <Link href="/deposit">
                    <Button variant="outline" size="sm">
                      Nạp tiền ngay
                    </Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
      <Footer />
    </div>
  )
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="text-center">
              <Logo />
              <p className="mt-4 text-muted-foreground">Đang tải...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    }>
      <CheckoutContent />
    </Suspense>
  );
}
