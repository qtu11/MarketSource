"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { ShoppingCart, Plus, Minus, Trash2, CreditCard, ArrowLeft, Wallet, Star, Download, Package, ShieldCheck, Sparkles, Tag } from 'lucide-react'
import { FloatingHeader } from "@/components/floating-header"
import { Footer } from "@/components/footer"
import { Logo } from "@/components/logo"
import { getDeviceInfo, getIPAddress } from "@/lib/auth"
import { getLocalStorage, setLocalStorage, removeLocalStorage } from "@/lib/localStorage-utils"
import { logger } from "@/lib/logger-client"
import Link from "next/link"
import Image from "next/image"

export default function CartPage() {
  const router = useRouter()
  const [cartItems, setCartItems] = useState<any[]>([])
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (mounted) {
      loadCartItems()
      loadCurrentUser()
    }
  }, [mounted])

  const loadCartItems = () => {
    try {
      const items = getLocalStorage<any[]>('cartItems', [])
      setCartItems(items)
    } catch (error) {
      logger.error('Error loading cart items', error)
      setCartItems([])
    }
  }

  const loadCurrentUser = async () => {
    try {
      const { userManager } = await import('@/lib/userManager');
      if (userManager.isLoggedIn()) {
        const user = await userManager.getUser();
        if (user) {
          setCurrentUser(user);
          return;
        }
      }

      const isLoggedIn = getLocalStorage<string | null>("isLoggedIn", null) === "true"
      const currentUserFromStorage = getLocalStorage<any>("currentUser", null) || getLocalStorage<any>("qtusdev_user", null)

      if (isLoggedIn && currentUserFromStorage) {
        setCurrentUser(currentUserFromStorage)
      }
    } catch (error) {
      logger.error('Error loading current user', error)
    }
  }

  const updateQuantity = (productId: number, newQuantity: number) => {
    if (newQuantity <= 0) {
      removeFromCart(productId)
      return
    }

    const updatedItems = cartItems.map(item =>
      item.id === productId ? { ...item, quantity: newQuantity } : item
    )

    setCartItems(updatedItems)
    setLocalStorage('cartItems', updatedItems)
    window.dispatchEvent(new Event('cartUpdated'))
  }

  const removeFromCart = (productId: number) => {
    const updatedItems = cartItems.filter(item => item.id !== productId)

    setCartItems(updatedItems)
    setLocalStorage('cartItems', updatedItems)
    window.dispatchEvent(new Event('cartUpdated'))
  }

  const getTotalPrice = () => {
    return cartItems
      .filter((item: any) => item.quantity === undefined || Number(item.quantity) > 0)
      .reduce((total, item) => {
        const priceNum = typeof item.price === 'number' ? item.price : Number(item.price) || 0;
        const qtyNum = item.quantity !== undefined ? Number(item.quantity) : 1;
        return total + (priceNum * Math.max(0, qtyNum));
      }, 0)
  }

  const handleCheckout = async () => {
    if (isLoading) return // ✅ BUG #30 FIX: Chặn double click khi đang xử lý
    if (!currentUser) {
      alert("Vui lòng đăng nhập để thanh toán!")
      router.push("/auth/login")
      return
    }

    if (cartItems.length === 0) {
      alert("Giỏ hàng trống!")
      return
    }

    const totalPrice = getTotalPrice()

    if (isNaN(totalPrice) || totalPrice < 0 || !isFinite(totalPrice)) {
      alert("Dữ liệu giỏ hàng không hợp lệ!")
      return
    }

    if (currentUser.balance < totalPrice) {
      alert(`Số dư không đủ! Bạn cần ${(totalPrice - currentUser.balance).toLocaleString('vi-VN')}đ nữa.`)
      router.push("/deposit")
      return
    }

    setIsLoading(true)

    try {
      const deviceInfo = getDeviceInfo()
      const ipAddress = await getIPAddress()
      
      // ✅ BUG #26 FIX: Sử dụng Bulk Purchase API thay vì vòng lặp N+1
      const token = getLocalStorage<string | null>('firebaseToken', null) || getLocalStorage<string | null>('authToken', null);
      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch('/api/purchases/bulk', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          userId: currentUser.uid || currentUser.id,
          items: cartItems.map(item => ({
            id: item.id,
            quantity: item.quantity !== undefined ? Number(item.quantity) : 1,
            price: typeof item.price === 'number' ? item.price : Number(item.price) || 0
          }))
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Lỗi hệ thống' }));
        throw new Error(errorData.error || `Checkout failed: ${response.status}`);
      }

      const bulkResult = await response.json();
      if (!bulkResult.success) {
        throw new Error(bulkResult.error || 'Thanh toán thất bại');
      }

      // Xử lý kết quả
      const itemsPurchased = bulkResult.results || [];
      const successfulItems = itemsPurchased.filter((r: any) => r.success).map((r: any) => r.id);
      
      // Xoá các sản phẩm thành công khỏi giỏ hàng
      const remainingCart = cartItems.filter(item => !successfulItems.includes(item.id));
      setCartItems(remainingCart);
      
      if (remainingCart.length === 0) {
        removeLocalStorage('cartItems');
      } else {
        setLocalStorage('cartItems', remainingCart);
      }
      window.dispatchEvent(new Event('cartUpdated'));

      if (successfulItems.length < cartItems.length) {
        alert('Một số sản phẩm thanh toán bị lỗi. Giỏ hàng đã được cập nhật!');
        setIsLoading(false);
        return;
      }

      const { userManager } = await import('@/lib/userManager');
      const updatedUserData = await userManager.getUser();
      const updatedUser = {
        ...currentUser,
        ...(updatedUserData || {}), // ✅ Ensure we get all DB fields
        balance: updatedUserData?.balance !== undefined ? updatedUserData.balance : currentUser.balance - totalPrice,
        totalSpent: updatedUserData?.totalSpent !== undefined ? updatedUserData.totalSpent : ((currentUser.totalSpent || 0) + totalPrice)
      }
      setLocalStorage("currentUser", updatedUser)
      const registeredUsers = getLocalStorage<any[]>("registeredUsers", [])
      const updatedUsers = registeredUsers.map((u: any) =>
        (u.id === currentUser.id || u.uid === currentUser.uid || u.email === currentUser.email) ? updatedUser : u
      )
      setLocalStorage("registeredUsers", updatedUsers)
      setLocalStorage("currentUser", updatedUser)
      setCurrentUser(updatedUser)

      const userPurchases = getLocalStorage<any[]>("userPurchases", [])
      const newPurchases = cartItems.map(item => ({
        ...item,
        userId: currentUser.id || currentUser.uid,
        userEmail: currentUser.email,
        purchaseDate: new Date().toISOString(),
        purchaseTime: new Date().toLocaleString("vi-VN"),
        deviceInfo,
        ipAddress,
        downloads: 0,
        rating: 0,
        reviewCount: 0,
        review: null
      }))

      userPurchases.push(...newPurchases)
      setLocalStorage("userPurchases", userPurchases)

      const orderNotification = {
        id: Date.now(),
        type: "new_order",
        title: "Đơn hàng mới",
        message: `🛒 ${currentUser.name} đã mua ${cartItems.length} sản phẩm\n💰 Tổng tiền: ${totalPrice.toLocaleString('vi-VN')}đ\n📧 Email: ${currentUser.email}\n🌐 IP: ${ipAddress}\n📱 Thiết bị: ${deviceInfo.deviceType} - ${deviceInfo.browser}\n⏰ Thời gian: ${new Date().toLocaleString("vi-VN")}\n\nSản phẩm:\n${cartItems.map(item => `• ${item.title} (${item.quantity || 1}x)`).join('\n')}`,
        timestamp: new Date().toISOString(),
        read: false,
      }

      const adminNotifications = getLocalStorage<any[]>("adminNotifications", [])
      adminNotifications.unshift(orderNotification)
      setLocalStorage("adminNotifications", adminNotifications)

      setCartItems([])
      removeLocalStorage('cartItems')
      window.dispatchEvent(new Event('cartUpdated'))
      window.dispatchEvent(new Event('userUpdated'))

      const totalPaid = cartItems
        .filter(item => successfulItems.includes(item.id))
        .reduce((sum, item) => sum + ((typeof item.price === 'number' ? item.price : Number(item.price) || 0) * (item.quantity !== undefined ? Number(item.quantity) : 1)), 0);

      alert(`Thanh toán thành công! Bạn đã mua ${successfulItems.length} sản phẩm với tổng tiền ${totalPaid.toLocaleString('vi-VN')}đ`);
      router.push("/dashboard")

    } catch (error) {
      logger.error("Checkout error", error)
      alert("Có lỗi xảy ra khi thanh toán. Vui lòng thử lại!")
    } finally {
      setIsLoading(false)
    }
  }

  if (!mounted) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <Logo />
          <p className="mt-4 text-gray-400">Đang tải giỏ hàng...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 relative overflow-hidden">
      {/* ✅ Premium Gradient Background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-40 -right-40 w-[600px] h-[600px] bg-purple-500/10 dark:bg-purple-500/[0.07] rounded-full blur-[150px]" />
        <div className="absolute top-1/2 -left-40 w-[500px] h-[500px] bg-blue-500/10 dark:bg-blue-500/[0.05] rounded-full blur-[130px]" />
        <div className="absolute -bottom-40 right-1/3 w-[400px] h-[400px] bg-pink-500/10 dark:bg-pink-500/[0.06] rounded-full blur-[120px]" />
        <div className="absolute inset-0 opacity-[0.02] dark:opacity-[0.04]" style={{ backgroundImage: 'radial-gradient(circle, currentColor 1px, transparent 1px)', backgroundSize: '32px 32px' }} />
      </div>

      <FloatingHeader />

      <main className="container mx-auto px-4 pt-28 pb-16 relative z-10">
        <div className="max-w-5xl mx-auto">
          {/* Header */}
          <div className="mb-10">
            <Button
              variant="ghost"
              onClick={() => router.back()}
              className="mb-4 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors -ml-2"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Quay lại mua sắm
            </Button>
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
                  Giỏ hàng{" "}
                  <span className="bg-gradient-to-r from-purple-500 to-pink-500 bg-clip-text text-transparent">
                    của bạn
                  </span>
                </h1>
                <p className="text-gray-500 dark:text-gray-400 flex items-center gap-2">
                  <Package className="w-4 h-4" />
                  {cartItems.length} sản phẩm trong giỏ hàng
                </p>
              </div>
              {currentUser && (
                <div className="hidden sm:block text-right bg-gradient-to-br from-emerald-500/10 to-green-500/10 dark:from-emerald-500/[0.08] dark:to-green-500/[0.08] border border-emerald-200/50 dark:border-emerald-500/20 rounded-2xl px-6 py-4">
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium uppercase tracking-wider mb-1">Số dư ví</p>
                  <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">
                    {(currentUser.balance || 0).toLocaleString('vi-VN')}
                    <span className="text-sm font-normal ml-1">đ</span>
                  </p>
                </div>
              )}
            </div>
          </div>

          {cartItems.length === 0 ? (
            /* ✅ Empty Cart — Premium design */
            <div className="text-center py-20">
              <div className="relative inline-block mb-8">
                <div className="w-32 h-32 rounded-full bg-gradient-to-br from-purple-100 to-pink-100 dark:from-purple-500/10 dark:to-pink-500/10 flex items-center justify-center mx-auto">
                  <ShoppingCart className="w-16 h-16 text-purple-400 dark:text-purple-500" />
                </div>
                <div className="absolute -top-2 -right-2 w-10 h-10 rounded-full bg-gradient-to-br from-yellow-400 to-orange-400 flex items-center justify-center shadow-lg">
                  <Sparkles className="w-5 h-5 text-white" />
                </div>
              </div>
              <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-3">
                Giỏ hàng trống
              </h2>
              <p className="text-gray-500 dark:text-gray-400 mb-8 max-w-md mx-auto">
                Khám phá hàng trăm mã nguồn chất lượng cao và thêm vào giỏ hàng để bắt đầu mua sắm
              </p>
              <Button asChild size="lg" className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white shadow-lg shadow-purple-500/25 rounded-xl px-8">
                <Link href="/products">
                  <Sparkles className="w-4 h-4 mr-2" />
                  Khám phá sản phẩm
                </Link>
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Cart Items */}
              <div className="lg:col-span-2 space-y-4">
                {cartItems.map((item, index) => (
                  <div
                    key={item.id}
                    className="group bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5 hover:border-purple-300 dark:hover:border-purple-500/40 transition-all duration-300 hover:shadow-lg hover:shadow-purple-500/5 animate-fade-in-up"
                    style={{ animationDelay: `${index * 80}ms` }}
                  >
                    <div className="flex items-start gap-5">
                      {/* Product Image */}
                      <div className="relative flex-shrink-0">
                        <Image
                          src={item.image || "/placeholder.svg"}
                          alt={item.title}
                          width={100}
                          height={100}
                          className="w-24 h-24 rounded-xl object-cover ring-1 ring-gray-200 dark:ring-gray-700 group-hover:ring-purple-400/50 transition-all"
                        />
                        {item.category && (
                          <Badge className="absolute -top-2 -left-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white text-[10px] px-2 py-0.5 shadow-md">
                            {item.category}
                          </Badge>
                        )}
                      </div>

                      {/* Product Info */}
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-lg text-gray-900 dark:text-white group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors truncate">
                          {item.title}
                        </h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-1 mt-1">
                          {item.description}
                        </p>
                        <div className="flex items-center gap-4 mt-2.5">
                          {(item.rating > 0) && (
                            <div className="flex items-center gap-1 text-sm">
                              <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" />
                              <span className="text-gray-600 dark:text-gray-400">{item.rating}</span>
                            </div>
                          )}
                          {(item.downloads > 0) && (
                            <div className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400">
                              <Download className="w-3.5 h-3.5" />
                              <span>{item.downloads}</span>
                            </div>
                          )}
                          {Array.isArray(item.tags) && item.tags.length > 0 && (
                            <div className="flex items-center gap-1">
                              {item.tags.slice(0, 2).map((tag: string, i: number) => (
                                <span key={i} className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Price & Actions */}
                      <div className="flex flex-col items-end gap-3 flex-shrink-0">
                        <p className="text-xl font-bold text-gray-900 dark:text-white whitespace-nowrap">
                          {((typeof item.price === 'number' ? item.price : Number(item.price) || 0) * (item.quantity !== undefined ? Number(item.quantity) : 1)).toLocaleString('vi-VN')}
                          <span className="text-sm font-medium text-gray-500 dark:text-gray-400 ml-0.5">đ</span>
                        </p>
                        <div className="flex items-center gap-2">
                          <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-xl overflow-hidden">
                            <button
                              onClick={() => updateQuantity(item.id, (item.quantity !== undefined ? Number(item.quantity) : 1) - 1)}
                              className="px-3 py-2 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-gray-600 dark:text-gray-300"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <span className="w-8 text-center font-medium text-sm text-gray-900 dark:text-white">
                              {item.quantity !== undefined ? Number(item.quantity) : 1}
                            </span>
                            <button
                              onClick={() => updateQuantity(item.id, (item.quantity !== undefined ? Number(item.quantity) : 1) + 1)}
                              className="px-3 py-2 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-gray-600 dark:text-gray-300"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <button
                            onClick={() => removeFromCart(item.id)}
                            className="p-2 rounded-xl text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-all"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        {(item.quantity !== undefined ? Number(item.quantity) : 1) > 1 && (
                          <p className="text-xs text-gray-400">
                            {(typeof item.price === 'number' ? item.price : Number(item.price) || 0).toLocaleString('vi-VN')}đ × {item.quantity !== undefined ? Number(item.quantity) : 1}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}

                {/* Clear All */}
                <div className="flex justify-end pt-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-gray-400 hover:text-red-500 dark:hover:text-red-400 text-sm"
                    onClick={() => {
                      if (confirm("Xóa tất cả sản phẩm khỏi giỏ hàng?")) {
                        setCartItems([])
                        removeLocalStorage('cartItems')
                        window.dispatchEvent(new Event('cartUpdated'))
                      }
                    }}
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                    Xóa tất cả
                  </Button>
                </div>
              </div>

              {/* ✅ Order Summary — Premium Sticky Sidebar */}
              <div className="lg:col-span-1">
                <div className="sticky top-28 space-y-4">
                  {/* Summary Card */}
                  <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden">
                    <div className="bg-gradient-to-r from-purple-600 to-pink-600 px-6 py-4">
                      <h3 className="text-white font-semibold text-lg flex items-center gap-2">
                        <Tag className="w-5 h-5" />
                        Tóm tắt đơn hàng
                      </h3>
                    </div>
                    <div className="p-6 space-y-4">
                      <div className="space-y-3">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-500 dark:text-gray-400">Tạm tính ({cartItems.length} sản phẩm)</span>
                          <span className="text-gray-900 dark:text-white font-medium">{getTotalPrice().toLocaleString('vi-VN')}đ</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-500 dark:text-gray-400">Phí giao hàng</span>
                          <span className="text-emerald-600 dark:text-emerald-400 font-medium">Miễn phí</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-500 dark:text-gray-400">Giảm giá</span>
                          <span className="text-gray-400 dark:text-gray-500">-0đ</span>
                        </div>
                      </div>

                      <Separator className="dark:bg-gray-800" />

                      <div className="flex justify-between items-center">
                        <span className="text-lg font-semibold text-gray-900 dark:text-white">Tổng cộng</span>
                        <span className="text-2xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
                          {getTotalPrice().toLocaleString('vi-VN')}đ
                        </span>
                      </div>

                      {currentUser ? (
                        <div className="space-y-3 pt-2">
                          {/* Balance Info */}
                          <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                                <Wallet className="w-4 h-4" /> Số dư
                              </span>
                              <span className="font-semibold text-gray-900 dark:text-white">
                                {(currentUser.balance || 0).toLocaleString('vi-VN')}đ
                              </span>
                            </div>
                            {currentUser.balance >= getTotalPrice() && (
                              <div className="flex items-center justify-between">
                                <span className="text-sm text-gray-500 dark:text-gray-400">Còn lại sau mua</span>
                                <span className="font-medium text-emerald-600 dark:text-emerald-400">
                                  {(currentUser.balance - getTotalPrice()).toLocaleString('vi-VN')}đ
                                </span>
                              </div>
                            )}
                            {currentUser.balance < getTotalPrice() && (
                              <p className="text-sm text-red-500 font-medium mt-1">
                                ⚠ Thiếu {(getTotalPrice() - currentUser.balance).toLocaleString('vi-VN')}đ
                              </p>
                            )}
                          </div>

                          {currentUser.balance < getTotalPrice() ? (
                            <div className="space-y-2">
                              <Button asChild className="w-full bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-600 hover:to-green-600 text-white rounded-xl h-12 shadow-lg shadow-emerald-500/20">
                                <Link href="/deposit">
                                  <Wallet className="w-4 h-4 mr-2" />
                                  Nạp thêm tiền
                                </Link>
                              </Button>
                              <Button
                                disabled
                                className="w-full rounded-xl h-12 opacity-50"
                              >
                                <CreditCard className="w-4 h-4 mr-2" />
                                Số dư không đủ
                              </Button>
                            </div>
                          ) : (
                            <Button
                              onClick={handleCheckout}
                              disabled={isLoading}
                              className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white rounded-xl h-12 text-base font-semibold shadow-lg shadow-purple-500/25 transition-all hover:shadow-xl hover:shadow-purple-500/30 hover:-translate-y-0.5"
                            >
                              {isLoading ? (
                                <div className="flex items-center">
                                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white mr-2"></div>
                                  Đang xử lý...
                                </div>
                              ) : (
                                <>
                                  <CreditCard className="w-5 h-5 mr-2" />
                                  Thanh toán ngay
                                </>
                              )}
                            </Button>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-3 pt-2">
                          <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
                            Đăng nhập để thanh toán
                          </p>
                          <Button asChild className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white rounded-xl h-12">
                            <Link href="/auth/login">
                              Đăng nhập
                            </Link>
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Trust Badges */}
                  <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5">
                    <div className="space-y-3">
                      <div className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-400">
                        <ShieldCheck className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                        <span>Thanh toán an toàn & bảo mật</span>
                      </div>
                      <div className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-400">
                        <Download className="w-5 h-5 text-blue-500 flex-shrink-0" />
                        <span>Tải xuống ngay sau khi thanh toán</span>
                      </div>
                      <div className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-400">
                        <Star className="w-5 h-5 text-yellow-500 flex-shrink-0" />
                        <span>Hỗ trợ 24/7 từ đội ngũ kỹ thuật</span>
                      </div>
                    </div>
                  </div>

                  {/* Terms */}
                  <p className="text-center text-xs text-gray-400 dark:text-gray-500 px-4">
                    Bằng việc thanh toán, bạn đồng ý với{" "}
                    <Link href="/terms" className="text-purple-500 hover:underline">Điều khoản</Link>
                    {" và "}
                    <Link href="/privacy" className="text-purple-500 hover:underline">Chính sách bảo mật</Link>
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  )
}
