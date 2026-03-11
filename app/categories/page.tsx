"use client"

import { useState, useEffect } from "react"
import { logger } from "@/lib/logger-client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Code, Smartphone, Gamepad2, Wrench, FileText, Star, Download, Eye, ShoppingCart } from 'lucide-react'
import { FloatingHeader } from "@/components/floating-header"
import { Footer } from "@/components/footer"
import Link from "next/link"
import Image from "next/image"
import dynamic from "next/dynamic"

// Lazy load Three.js components để tối ưu performance
const MeteorShowerBackdrop = dynamic(
  async () => {
    try {
      const mod = await import("@/components/meteor-shower-3d")
      return { default: mod.MeteorShower3D }
    } catch (error) {
      logger.error('Failed to load MeteorShower3D component', error)
      throw error
    }
  },
  {
    ssr: false,
    loading: () => <div className="absolute inset-0 bg-[#0B0C10]" />
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

export default function CategoriesPage() {
  const [products, setProducts] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const categories = [
    {
      id: "website",
      name: "Website",
      description: "Mã nguồn website đầy đủ tính năng",
      icon: Code,
      color: "from-blue-500 to-cyan-500",
      bgColor: "bg-blue-500/10",
      textColor: "text-blue-600 dark:text-blue-400"
    },
    {
      id: "mobile",
      name: "Mobile App",
      description: "Ứng dụng di động iOS & Android",
      icon: Smartphone,
      color: "from-green-500 to-emerald-500",
      bgColor: "bg-green-500/10",
      textColor: "text-green-600 dark:text-green-400"
    },
    {
      id: "game",
      name: "Game",
      description: "Game 2D, 3D và mini games",
      icon: Gamepad2,
      color: "from-purple-500 to-pink-500",
      bgColor: "bg-purple-500/10",
      textColor: "text-purple-600 dark:text-purple-400"
    },
    {
      id: "tool",
      name: "Tools",
      description: "Công cụ và tiện ích hữu ích",
      icon: Wrench,
      color: "from-orange-500 to-red-500",
      bgColor: "bg-orange-500/10",
      textColor: "text-orange-600 dark:text-orange-400"
    },
    {
      id: "template",
      name: "Template",
      description: "Template HTML, CSS, React",
      icon: FileText,
      color: "from-indigo-500 to-purple-500",
      bgColor: "bg-indigo-500/10",
      textColor: "text-indigo-600 dark:text-indigo-400"
    }
  ]

  useEffect(() => {
    // Load products từ API
    const loadProducts = async () => {
      setIsLoading(true)
      try {
        const { apiGet } = await import('@/lib/api-client')
        const { mapBackendProductsToFrontend } = await import('@/lib/product-mapper')

        const result = await apiGet('/api/products')
        if (result?.success && Array.isArray(result.products)) {
          const mapped = mapBackendProductsToFrontend(result.products).map((product: any) => ({
            ...product,
            price: product.price || 0,
            originalPrice: product.originalPrice || product.price || 0,
            rating: product.rating || product.averageRating || 0,
            downloads: product.downloads || product.downloadCount || 0,
            tags: Array.isArray(product.tags) ? product.tags : [],
          }))
          setProducts(mapped)
          return
        }
        throw new Error('Invalid response format')
      } catch (error) {
        logger.error('Error fetching products from API, falling back to localStorage', error)
        try {
          const uploadedProducts = JSON.parse(localStorage.getItem("uploadedProducts") || "[]")
          setProducts(uploadedProducts.map((p: any) => ({
            ...p,
            price: p.price || 0,
            originalPrice: p.originalPrice || p.price || 0,
            rating: p.rating || 0,
            downloads: p.downloads || 0,
            tags: Array.isArray(p.tags) ? p.tags : []
          })))
        } catch (e) {
          logger.error('Error parsing localStorage', e)
          setProducts([])
        }
      } finally {
        setIsLoading(false)
      }
    }

    loadProducts();
  }, [])

  const getProductsByCategory = (categoryId: string) => {
    return products.filter(product => product.category === categoryId)
  }

  const handleAddToCart = (product: any) => {
    if (typeof window !== "undefined" && (window as any).addToCart) {
      ; (window as any).addToCart(product)
    } else {
      const cartItems = JSON.parse(localStorage.getItem("cartItems") || "[]")
      const existingItem = cartItems.find((item: any) => item.id === product.id)

      if (existingItem) {
        existingItem.quantity += 1
      } else {
        cartItems.push({ ...product, quantity: 1 })
      }

      localStorage.setItem("cartItems", JSON.stringify(cartItems))
      window.dispatchEvent(new Event("cartUpdated"))
      alert(`Đã thêm "${product.title}" vào giỏ hàng!`)
    }
  }

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 transition-colors duration-300 relative">
      {/* 3D Background */}
      <div className="absolute inset-0 pointer-events-none">
        <MeteorShowerBackdrop />
      </div>

      <FloatingHeader />

      <main className="container mx-auto px-4 pt-24 pb-12 relative z-10">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100 mb-4">
            Thể loại{" "}
            <span className="bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
              mã nguồn
            </span>
          </h1>
          <p className="text-gray-600 dark:text-gray-400 text-lg">
            Khám phá các thể loại mã nguồn đa dạng từ website, mobile app đến game và tools
          </p>
        </div>

        {/* Categories Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-12">
          {categories.map((category) => {
            const categoryProducts = getProductsByCategory(category.id)
            const CategoryIcon = category.icon

            return (
              <Card
                key={category.id}
                className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-purple-500/50 transition-all duration-300 group"
              >
                <CardHeader>
                  <div className={`inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-r ${category.color} mb-4 group-hover:scale-110 transition-transform duration-300`}>
                    <CategoryIcon className="w-8 h-8 text-white" />
                  </div>
                  <CardTitle className="text-gray-900 dark:text-gray-100 group-hover:text-purple-400 transition-colors">
                    {category.name}
                  </CardTitle>
                  <CardDescription className="text-gray-600 dark:text-gray-400">
                    {category.description}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between mb-4">
                    <Badge className={`${category.bgColor} ${category.textColor}`}>
                      {categoryProducts.length} sản phẩm
                    </Badge>
                    <Link href={`/products?category=${category.id}`}>
                      <Button variant="outline" size="sm" className="border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700">
                        Xem tất cả
                      </Button>
                    </Link>
                  </div>

                  {/* Featured products from this category */}
                  <div className="space-y-3">
                    {categoryProducts.slice(0, 2).map((product) => (
                      <div key={product.id} className="flex items-center space-x-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                        <Image
                          src={product.image || "/placeholder.svg"}
                          alt={product.title}
                          width={48}
                          height={48}
                          className="w-12 h-12 rounded-lg object-cover"
                        />
                        <div className="flex-1 min-w-0">
                          <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                            {product.title}
                          </h4>
                          <div className="flex items-center space-x-2 mt-1">
                            <span className="text-sm font-bold text-gray-900 dark:text-gray-100">
                              {product.price.toLocaleString("vi-VN")}đ
                            </span>
                            <div className="flex items-center">
                              <Star className="w-3 h-3 text-yellow-400 mr-1" />
                              <span className="text-xs text-gray-600 dark:text-gray-400">{product.rating || 0}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}

                    {categoryProducts.length === 0 && (
                      <p className="text-gray-500 dark:text-gray-400 text-sm text-center py-4">
                        Chưa có sản phẩm nào trong thể loại này
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>

        {/* Featured Products */}
        {products.length > 0 && (
          <div className="mb-12">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-8">
              Sản phẩm{" "}
              <span className="bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                nổi bật
              </span>
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {products.slice(0, 6).map((product) => (
                <Card
                  key={product.id}
                  className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-purple-500/50 transition-all duration-300 group overflow-hidden"
                >
                  <div className="relative">
                    <Image
                      src={product.image || "/placeholder.svg"}
                      alt={product.title}
                      width={400}
                      height={192}
                      className="w-full h-48 object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    {product.featured && (
                      <Badge className="absolute top-4 left-4 bg-gradient-to-r from-yellow-500 to-orange-500 text-white">
                        Nổi bật
                      </Badge>
                    )}
                    <div className="absolute top-4 right-4 flex items-center space-x-2">
                      <div className="bg-black/50 backdrop-blur-sm rounded-full px-2 py-1 flex items-center">
                        <Star className="w-4 h-4 text-yellow-400 mr-1" />
                        <span className="text-white text-sm">{product.rating || 0}</span>
                      </div>
                    </div>
                  </div>

                  <CardContent className="p-6">
                    <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2 group-hover:text-purple-400 transition-colors line-clamp-2">
                      {product.title}
                    </h3>
                    <p className="text-gray-600 dark:text-gray-400 text-sm mb-4 line-clamp-2">{product.description}</p>

                    <div className="flex flex-wrap gap-2 mb-4">
                      {Array.isArray(product.tags) &&
                        product.tags.length > 0 &&
                        product.tags.slice(0, 3).map((tag: any, index: number) => (
                          <Badge key={index} variant="secondary" className="bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs">
                            {tag}
                          </Badge>
                        ))}
                    </div>

                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center space-x-2">
                        <span className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                          {product.price.toLocaleString("vi-VN")}đ
                        </span>
                        {product.originalPrice > product.price && (
                          <span className="text-sm text-gray-600 dark:text-gray-400 line-through">
                            {product.originalPrice.toLocaleString("vi-VN")}đ
                          </span>
                        )}
                      </div>
                      <div className="flex items-center text-gray-600 dark:text-gray-400 text-sm">
                        <Download className="w-4 h-4 mr-1" />
                        {product.downloads || 0}
                      </div>
                    </div>

                    <div className="flex space-x-2">
                      <Button
                        onClick={() => handleAddToCart(product)}
                        className="flex-1 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white"
                      >
                        <ShoppingCart className="w-4 h-4 mr-2" />
                        Mua ngay
                      </Button>
                      {product.demoLink && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700"
                          onClick={() => window.open(product.demoLink, "_blank")}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Call to Action */}
        <div className="text-center bg-gradient-to-r from-purple-100 to-pink-100 dark:from-purple-900/20 dark:to-pink-900/20 rounded-2xl p-8">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-4">
            Không tìm thấy mã nguồn phù hợp?
          </h2>
          <p className="text-gray-600 dark:text-gray-400 text-lg mb-6 max-w-2xl mx-auto">
            Liên hệ với chúng tôi để được tư vấn và tìm kiếm mã nguồn theo yêu cầu riêng của bạn
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/contact">
              <Button className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white">
                Liên hệ tư vấn
              </Button>
            </Link>
            <Link href="/products">
              <Button variant="outline" className="border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700">
                Xem tất cả sản phẩm
              </Button>
            </Link>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  )
}
