"use client"

import { useState, useEffect, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Star, Download, Eye, ShoppingCart, Search, X, ExternalLink, Tag, Layers, Clock } from 'lucide-react'
import { FloatingHeader } from "@/components/floating-header"
import { Footer } from "@/components/footer"
import dynamic from "next/dynamic"
import Image from "next/image"
import { getLocalStorage, setLocalStorage } from "@/lib/localStorage-utils"
import { logger } from "@/lib/logger-client"
import { ProductSkeletonGrid } from "@/components/product-skeleton"

// Lazy load Three.js components để tối ưu performance
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

const BASE_CATEGORIES = [
  { id: "all", name: "Tất cả", count: 0 },
  { id: "website", name: "Website", count: 0 },
  { id: "mobile app", name: "Mobile App", count: 0 },
  { id: "game", name: "Game", count: 0 },
  { id: "tool", name: "Tools", count: 0 },
  { id: "template", name: "Template", count: 0 },
  { id: "other", name: "Other", count: 0 },
]

// ✅ FIX: Normalize category từ DB ("Website", "Tool", "Mobile App") → lowercase ID để so sánh
function normalizeCategoryId(category: string | null | undefined): string {
  if (!category) return "other";
  const lower = category.toLowerCase().trim();
  // Map các tên phổ biến về ID chuẩn
  if (lower === "tools" || lower === "tool") return "tool";
  if (lower === "mobile" || lower === "mobile app") return "mobile app";
  return lower;
}

export default function ProductsPage() {
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedCategory, setSelectedCategory] = useState("all")
  const [sortBy, setSortBy] = useState("price-low")
  const [priceRange, setPriceRange] = useState("all")
  const [products, setProducts] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedProduct, setSelectedProduct] = useState<any | null>(null)

  const [categories, setCategories] = useState(BASE_CATEGORIES)

  useEffect(() => {
    // ✅ FIX: Load products từ API thay vì localStorage
    const loadProducts = async () => {
      setIsLoading(true);
      try {
        const { apiGet } = await import('@/lib/api-client');
        const { mapBackendProductsToFrontend } = await import('@/lib/product-mapper');

        const result = await apiGet('/api/products');
        if (result.success && result.products) {
          // Map backend format → frontend format
          const mappedProducts = mapBackendProductsToFrontend(result.products);

          // Ensure all products have proper structure
          const validatedProducts = mappedProducts.map((product: any) => ({
            ...product,
            tags: Array.isArray(product.tags) ? product.tags : [],
            rating: product.rating || product.averageRating || 0,
            downloads: product.downloads || product.downloadCount || 0,
            price: product.price || 0,
            originalPrice: product.originalPrice || product.price || 0,
          }));

          setProducts(validatedProducts);

          // ✅ FIX: Normalize category trước khi đếm — so sánh case-insensitive
          const normalizedProducts = validatedProducts.map((p: any) => ({
            ...p,
            _categoryId: normalizeCategoryId(p.category),
          }));
          setProducts(normalizedProducts);

          const updatedCategories = BASE_CATEGORIES.map((category) => {
            if (category.id === "all") {
              return { ...category, count: normalizedProducts.length }
            } else {
              return {
                ...category,
                count: normalizedProducts.filter((p: any) => p._categoryId === category.id).length
              }
            }
          });
          setCategories(updatedCategories);
        }
      } catch (error: any) {
        logger.error('Error loading products', error);

        // ✅ FIX: Hiển thị thông báo lỗi rõ ràng nếu là database connection error
        if (error?.message?.includes('Database connection failed') ||
          error?.error?.includes('Database connection failed') ||
          error?.code === 'DB_CONNECTION_FAILED') {
          // Set empty products và hiển thị error message
          setProducts([]);
          // Log để user biết
          logger.error('⚠️ Database connection failed. Please check Netlify environment variables.');
          return;
        }

        // Fallback to localStorage nếu API fail vì lý do khác
        const uploadedProducts = getLocalStorage<any[]>("uploadedProducts", []);
        const validatedProducts = uploadedProducts.map((product: any) => ({
          ...product,
          tags: Array.isArray(product.tags) ? product.tags : [],
          rating: product.rating || 0,
          downloads: product.downloads || 0,
          price: product.price || 0,
          originalPrice: product.originalPrice || product.price || 0,
        }));
        setProducts(validatedProducts);
      } finally {
        setIsLoading(false);
      }
    };

    loadProducts();
  }, [])

  // ✅ FIX: Debounce search query để tránh quá nhiều re-renders
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("")

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300); // 300ms delay

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const filteredProducts = useMemo((): any[] => {
    return products.filter((product) => {
      const matchesSearch =
        product.title?.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
        product.description?.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
        (Array.isArray(product.tags) && product.tags.some((tag: any) => tag.toLowerCase().includes(debouncedSearchQuery.toLowerCase())))

      // ✅ FIX: Dùng normalized category ID để so sánh chính xác
      const matchesCategory = selectedCategory === "all" || product._categoryId === selectedCategory

      const matchesPrice =
        priceRange === "all" ||
        (priceRange === "under-100k" && product.price < 100000) ||
        (priceRange === "100k-200k" && product.price >= 100000 && product.price < 200000) ||
        (priceRange === "200k-300k" && product.price >= 200000 && product.price < 300000) ||
        (priceRange === "over-300k" && product.price >= 300000)

      return matchesSearch && matchesCategory && matchesPrice
    })
  }, [products, debouncedSearchQuery, selectedCategory, priceRange])

  const sortedProducts = [...filteredProducts].sort((a, b) => {
    switch (sortBy) {
      case "newest":
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      case "oldest":
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      case "price-low":
        return a.price - b.price
      case "price-high":
        return b.price - a.price
      case "popular":
        return (b.downloads || 0) - (a.downloads || 0)
      case "rating":
        return (b.rating || 0) - (a.rating || 0)
      case "relevance":
        const calculateRelevanceScore = (product: any) => {
          if (!debouncedSearchQuery) return 0;
          const lowerQuery = debouncedSearchQuery.toLowerCase();
          let score = 0;

          // Score for title
          if (product.title?.toLowerCase().includes(lowerQuery)) {
            score += 10;
          }

          // Score for description
          if (product.description?.toLowerCase().includes(lowerQuery)) {
            score += 5;
          }

          // Score for tags
          if (Array.isArray(product.tags)) {
            product.tags.forEach((tag: any) => {
              if (tag.toLowerCase().includes(lowerQuery)) {
                score += 3;
              }
            });
          }
          return score;
        };

        const scoreA = calculateRelevanceScore(a);
        const scoreB = calculateRelevanceScore(b);

        // Sort by score descending, then by rating descending as a tie-breaker
        if (scoreB !== scoreA) {
          return scoreB - scoreA;
        } else {
          return (b.rating || 0) - (a.rating || 0);
        }
      default:
        return 0
    }
  })

  const handleAddToCart = (product: any) => {
    if (typeof window !== "undefined" && (window as any).addToCart) {
      ; (window as any).addToCart(product)
    } else {
      // Fallback if addToCart is not available
      const cartItems = getLocalStorage<any[]>("cartItems", [])
      const existingItem = cartItems.find((item: any) => item.id === product.id)

      if (existingItem) {
        existingItem.quantity += 1
      } else {
        cartItems.push({ ...product, quantity: 1 })
      }

      setLocalStorage("cartItems", cartItems)
      window.dispatchEvent(new Event("cartUpdated"))
      alert(`Đã thêm "${product.title}" vào giỏ hàng!`)
    }
  }

  return (
    <div className="bg-white dark:bg-gray-900 min-h-screen relative overflow-hidden">
      {/* ✅ Hiệu ứng 3D Mưa sao băng theo yêu cầu */}
      <MeteorShowerBackdrop />

      {/* Vẫn giữ một chút gradient mờ overlay để text bên trên dễ đọc */}
      <div className="absolute inset-0 pointer-events-none z-0">
        <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-purple-500/10 dark:bg-purple-500/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 left-1/2 w-[600px] h-[400px] bg-indigo-500/10 dark:bg-indigo-500/5 rounded-full blur-[140px]" />
      </div>

      <FloatingHeader />

      <main className="container mx-auto px-4 pt-24 pb-12 relative z-10">
        <div className="mb-8 animate-fade-in-down">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100 mb-4">
            Mã nguồn{" "}
            <span className="bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
              chất lượng cao
            </span>
          </h1>
          <p className="text-gray-600 dark:text-gray-400 text-lg">
            Khám phá hàng trăm mã nguồn được tuyển chọn kỹ lưỡng từ các developer hàng đầu
          </p>
        </div>

        {/* Filters */}
        <div className="mb-8">
          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardContent className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-gray-900 dark:text-gray-100 text-sm font-medium mb-2">Tìm kiếm</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="Tìm kiếm mã nguồn..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10 bg-gray-100 dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-900 dark:text-gray-100 placeholder:text-gray-500 dark:placeholder-gray-400"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-gray-900 dark:text-gray-100 text-sm font-medium mb-2">Thể loại</label>
                  <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                    <SelectTrigger className="bg-gray-100 dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-900 dark:text-gray-100">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                          {category.name} ({category.count})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="block text-gray-900 dark:text-gray-100 text-sm font-medium mb-2">Khoảng giá</label>
                  <Select value={priceRange} onValueChange={setPriceRange}>
                    <SelectTrigger className="bg-gray-100 dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-900 dark:text-gray-100">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tất cả</SelectItem>
                      <SelectItem value="under-100k">Dưới 100k</SelectItem>
                      <SelectItem value="100k-200k">100k - 200k</SelectItem>
                      <SelectItem value="200k-300k">200k - 300k</SelectItem>
                      <SelectItem value="over-300k">Trên 300k</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="block text-gray-900 dark:text-gray-100 text-sm font-medium mb-2">Sắp xếp</label>
                  <Select value={sortBy} onValueChange={setSortBy}>
                    <SelectTrigger className="bg-gray-100 dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-900 dark:text-gray-100">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="newest">Mới nhất</SelectItem>
                      <SelectItem value="oldest">Cũ nhất</SelectItem>
                      <SelectItem value="price-low">Giá thấp đến cao</SelectItem>
                      <SelectItem value="price-high">Giá cao đến thấp</SelectItem>
                      <SelectItem value="popular">Phổ biến nhất</SelectItem>
                      <SelectItem value="rating">Đánh giá cao nhất</SelectItem>
                      <SelectItem value="relevance">Phù hợp nhất</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Results Count */}
        <div className="mb-6">
          <p className="text-gray-600 dark:text-gray-400">
            Hiển thị {sortedProducts.length} kết quả
            {searchQuery && ` cho "${searchQuery}"`}
            {selectedCategory !== "all" &&
              ` trong thể loại "${categories.find((c) => c.id === selectedCategory)?.name}"`}
          </p>
        </div>

        {/* Products Grid */}
        {isLoading ? (
          <ProductSkeletonGrid count={6} />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {sortedProducts.map((product, index) => (
              <Card
                key={product.id}
                className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-purple-500/50 transition-all duration-300 group overflow-hidden card-hover glass-card animate-fade-in-up cursor-pointer"
                style={{ animationDelay: `${index * 50}ms` }}
                onClick={() => setSelectedProduct(product)}
              >
                <div className="relative overflow-hidden">
                  <Image
                    src={product.image || "/placeholder.svg"}
                    alt={product.title}
                    width={400}
                    height={192}
                    className="w-full h-48 object-cover group-hover:scale-110 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  {product.featured && (
                    <Badge className="absolute top-4 left-4 bg-gradient-to-r from-yellow-500 to-orange-500 text-white">
                      Nổi bật
                    </Badge>
                  )}
                  <div className="absolute top-4 right-4 flex items-center space-x-2">
                    <div className="bg-black/50 backdrop-blur-sm rounded-full px-2 py-1 flex items-center">
                      <Star className="w-4 h-4 text-yellow-400 mr-1" />
                      <span className="text-gray-900 dark:text-gray-100 text-sm">{product.rating}</span>
                    </div>
                  </div>
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  {/* ✅ Hover overlay "Xem chi tiết" */}
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <span className="rounded-full bg-white/90 dark:bg-gray-800/90 px-6 py-2.5 text-sm font-semibold text-purple-700 dark:text-purple-300 shadow-xl backdrop-blur-sm">
                      <Eye className="inline-block mr-2 h-4 w-4" />
                      Xem chi tiết
                    </span>
                  </div>

                </div>

                <CardContent className="p-6">
                  <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2 group-hover:text-purple-400 transition-colors">
                    {product.title}
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400 text-sm mb-4 line-clamp-2">{product.description}</p>

                  <div className="flex flex-wrap gap-2 mb-4">
                    {Array.isArray(product.tags) &&
                      product.tags.length > 0 &&
                      product.tags.slice(0, 3).map((tag: any, index: number) => (
                        <Badge key={index} variant="secondary" className="bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300 text-xs">
                          {tag}
                        </Badge>
                      ))}
                    {Array.isArray(product.tags) && product.tags.length > 3 && (
                      <Badge variant="secondary" className="bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300 text-xs">
                        +{product.tags.length - 3}
                      </Badge>
                    )}
                  </div>

                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-2">
                      <span className="text-2xl font-bold text-gray-900 dark:text-gray-100">{product.price.toLocaleString("vi-VN")}đ</span>
                      {product.originalPrice > product.price && (
                        <span className="text-sm text-gray-600 dark:text-gray-400 line-through">
                          {product.originalPrice.toLocaleString("vi-VN")}đ
                        </span>
                      )}
                    </div>
                    <div className="flex items-center text-gray-600 dark:text-gray-400 text-sm">
                      <Download className="w-4 h-4 mr-1" />
                      {product.downloads}
                    </div>
                  </div>

                  <div className="flex space-x-2">
                    <Button
                      onClick={(e) => { e.stopPropagation(); handleAddToCart(product); }}
                      className="flex-1 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white hover-lift hover-glow animate-gradient"
                    >
                      <ShoppingCart className="w-4 h-4 mr-2 group-hover:animate-bounce" />
                      Mua ngay
                    </Button>
                    {product.demoLink && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-700 bg-transparent hover-lift"
                        onClick={(e) => { e.stopPropagation(); window.open(product.demoLink, "_blank"); }}
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* No Results */}
        {sortedProducts.length === 0 && (
          <div className="text-center py-16">
            <div className="text-6xl mb-4">🔍</div>
            <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Không tìm thấy kết quả</h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              {products.length === 0
                ? "Chưa có sản phẩm nào được upload. Admin vui lòng upload sản phẩm mới."
                : "Thử thay đổi từ khóa tìm kiếm hoặc bộ lọc để tìm thấy mã nguồn phù hợp"}
            </p>
            {/* ✅ FIX: Hiển thị thông báo nếu database connection fail */}
            {products.length === 0 && (
              <div className="mt-4 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                  ⚠️ Nếu bạn là admin, vui lòng kiểm tra database connection trên Netlify.
                </p>
              </div>
            )}
            {products.length > 0 && (
              <Button
                onClick={() => {
                  setSearchQuery("")
                  setSelectedCategory("all")
                  setPriceRange("all")
                  setSortBy("newest")
                }}
                variant="outline"
                className="border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-700 bg-transparent"
              >
                Xóa bộ lọc
              </Button>
            )}
          </div>
        )}

        {/* Load More */}
        {sortedProducts.length > 0 && (
          <div className="text-center mt-12">
            <Button
              variant="outline"
              size="lg"
              className="border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-700 px-8 bg-transparent"
            >
              Xem thêm mã nguồn
            </Button>
          </div>
        )}
      </main>

      <Footer />

      {/* ✅ Product Detail Modal */}
      <AnimatePresence>
        {selectedProduct && (
          <motion.div
            className="fixed inset-0 z-[100] flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setSelectedProduct(null)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />
            <motion.div
              className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl border border-white/20 bg-white shadow-2xl dark:bg-gray-900 dark:border-gray-700/50"
              initial={{ opacity: 0, scale: 0.9, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 30 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
            >
              <button
                onClick={() => setSelectedProduct(null)}
                className="absolute right-4 top-4 z-20 rounded-full bg-black/40 p-2 text-white backdrop-blur-sm transition hover:bg-black/60"
              >
                <X className="h-5 w-5" />
              </button>

              <div className="relative h-64 sm:h-72 w-full overflow-hidden rounded-t-3xl">
                <Image
                  src={selectedProduct.image || "/placeholder.svg"}
                  alt={selectedProduct.title}
                  fill
                  className="object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                {selectedProduct.featured && (
                  <Badge className="absolute left-5 top-5 bg-gradient-to-r from-amber-400 to-orange-500 text-white shadow-lg">
                    🔥 Nổi bật
                  </Badge>
                )}
                <div className="absolute bottom-5 left-5 right-5">
                  <h2 className="text-2xl font-bold text-white drop-shadow-lg">
                    {selectedProduct.title}
                  </h2>
                </div>
              </div>

              <div className="space-y-5 p-6">
                <div className="flex flex-wrap gap-4">
                  <div className="flex items-center gap-2 rounded-full bg-yellow-50 dark:bg-yellow-500/10 px-4 py-2">
                    <Star className="h-4 w-4 text-yellow-500" />
                    <span className="text-sm font-semibold text-yellow-700 dark:text-yellow-300">
                      {(selectedProduct.rating || 0).toFixed(1)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 rounded-full bg-blue-50 dark:bg-blue-500/10 px-4 py-2">
                    <Download className="h-4 w-4 text-blue-500" />
                    <span className="text-sm font-semibold text-blue-700 dark:text-blue-300">
                      {selectedProduct.downloads || 0} lượt tải
                    </span>
                  </div>
                  {selectedProduct.category && (
                    <div className="flex items-center gap-2 rounded-full bg-purple-50 dark:bg-purple-500/10 px-4 py-2">
                      <Layers className="h-4 w-4 text-purple-500" />
                      <span className="text-sm font-semibold text-purple-700 dark:text-purple-300">
                        {selectedProduct.category}
                      </span>
                    </div>
                  )}
                </div>

                <div>
                  <h4 className="text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">Mô tả</h4>
                  <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
                    {selectedProduct.description || "Chưa có mô tả chi tiết cho sản phẩm này."}
                  </p>
                </div>

                {Array.isArray(selectedProduct.tags) && selectedProduct.tags.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2 flex items-center gap-1">
                      <Tag className="h-3.5 w-3.5" /> Tags
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {selectedProduct.tags.map((tag: string) => (
                        <span
                          key={tag}
                          className="rounded-full border border-purple-200/60 bg-purple-50 px-3 py-1 text-xs font-medium text-purple-700 dark:border-purple-500/30 dark:bg-purple-500/10 dark:text-purple-200"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between rounded-2xl bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-500/10 dark:to-pink-500/10 p-5">
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Giá bán</p>
                    <p className="text-3xl font-bold text-gray-900 dark:text-white">
                      {(selectedProduct.price || 0).toLocaleString("vi-VN")}đ
                    </p>
                    {selectedProduct.originalPrice > selectedProduct.price && (
                      <p className="text-sm text-gray-500 line-through">
                        {selectedProduct.originalPrice.toLocaleString("vi-VN")}đ
                      </p>
                    )}
                  </div>
                  <div className="flex gap-3">
                    {selectedProduct.demoLink && (
                      <Button
                        variant="outline"
                        className="border-gray-200 dark:border-gray-700"
                        onClick={() => window.open(selectedProduct.demoLink, "_blank")}
                      >
                        <ExternalLink className="mr-2 h-4 w-4" />
                        Demo
                      </Button>
                    )}
                    <Button
                      onClick={() => { handleAddToCart(selectedProduct); setSelectedProduct(null); }}
                      className="bg-gradient-to-r from-purple-600 to-pink-600 shadow-lg shadow-purple-500/30"
                    >
                      <ShoppingCart className="mr-2 h-4 w-4" />
                      Mua ngay
                    </Button>
                  </div>
                </div>

                {(selectedProduct.createdAt || selectedProduct.created_at) && (
                  <p className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Đăng lúc: {new Date(selectedProduct.createdAt || selectedProduct.created_at).toLocaleDateString("vi-VN")}
                  </p>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
