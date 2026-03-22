"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Star, Download, Layers, Tag, ExternalLink, ShoppingCart, Clock, ArrowLeft, CheckCircle2, ShieldCheck, Zap } from 'lucide-react'
import { FloatingHeader } from "@/components/floating-header"
import { Footer } from "@/components/footer"
import { apiGet } from "@/lib/api-client"
import { mapBackendToFrontend } from "@/lib/product-mapper"
import { replaceMarkdownLinksWithSafeAnchors } from "@/lib/safe-markdown-links"
import dynamic from "next/dynamic"
import NextImage from "next/image"

// Lazy load backdrop
const ThemeAwareBackground = dynamic(
    async () => {
        try {
            const mod = await import("@/components/theme-aware-background")
            return { default: mod.ThemeAwareBackground }
        } catch {
            return () => null
        }
    },
    {
        ssr: false,
        loading: () => <div className="absolute inset-0 bg-blue-50 dark:bg-[#0B0C10]" />
    }
)

export default function ProductDetailPage() {
    const params = useParams()
    const router = useRouter()
    const [product, setProduct] = useState<any>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState("")
    const [activeImage, setActiveImage] = useState("")

    useEffect(() => {
        const fetchProduct = async () => {
            try {
                setLoading(true)
                const result = await apiGet(`/api/products/${params.id}`)
                if (result.success && result.product) {
                    const mappedProduct = mapBackendToFrontend(result.product)
                    setProduct(mappedProduct)
                    setActiveImage(mappedProduct.image || "/placeholder.svg")
                } else {
                    setError(result.error || "Không tìm thấy sản phẩm")
                }
            } catch (err: any) {
                setError(err.message || "Lỗi tải sản phẩm")
            } finally {
                setLoading(false)
            }
        }

        if (params.id) {
            fetchProduct()
        }
    }, [params.id])

    // Lấy hàm handleAddToCart như trong products/page.tsx
    const handleAddToCart = (productToAdd: any) => {
        try {
            // Import dynamic auth mechanism if needed or fallback to local storage logic for cart
            const cartItemsKey = 'cartItems';
            const cart = JSON.parse(localStorage.getItem(cartItemsKey) || '[]')
            const existingItem = cart.find((item: any) => item.id === productToAdd.id)

            if (existingItem) {
                alert("Sản phẩm đã có trong giỏ hàng!")
                return
            }

            const newCart = [...cart, productToAdd]
            localStorage.setItem(cartItemsKey, JSON.stringify(newCart))

            // Dispatch event for FloatingHeader cart badge update
            window.dispatchEvent(new Event('cartUpdated'))
            alert("Đã thêm vào giỏ hàng!")
        } catch (e) {
            console.error("Cart error", e)
            alert("Lỗi khi thêm vào giỏ hàng")
        }
    }

    if (loading) {
        return (
            <div className="bg-blue-50 dark:bg-[#0B0C10] min-h-screen text-gray-900 dark:text-white">
                <FloatingHeader />
                <div className="container mx-auto px-4 py-32 space-y-8">
                    <Skeleton className="h-[400px] w-full rounded-3xl bg-white/5" />
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        <div className="lg:col-span-2 space-y-4">
                            <Skeleton className="h-12 w-3/4 rounded-lg bg-white/5" />
                            <Skeleton className="h-4 w-1/2 rounded-lg bg-white/5" />
                        </div>
                        <Skeleton className="h-64 w-full rounded-3xl bg-white/5" />
                    </div>
                </div>
            </div>
        )
    }

    if (error || !product) {
        return (
            <div className="bg-blue-50 dark:bg-[#0B0C10] min-h-screen text-gray-900 dark:text-white flex items-center justify-center">
                <FloatingHeader />
                <div className="text-center">
                    <h1 className="text-4xl font-bold text-red-500 mb-4">Lỗi</h1>
                    <p className="text-gray-400 mb-8">{error || "Sản phẩm không tồn tại"}</p>
                    <Button onClick={() => router.push('/products')} variant="outline" className="border-white/20 text-white hover:bg-white/10 bg-transparent">
                        Quay lại danh sách
                    </Button>
                </div>
            </div>
        )
    }

    const allImages = [product.image, ...(Array.isArray(product.imageUrls) ? product.imageUrls : [])].filter(Boolean)

    return (
        <div className="bg-transparent min-h-screen relative overflow-x-hidden pt-20 transition-colors duration-300">
            <ThemeAwareBackground />

            <FloatingHeader />

            <main className="container mx-auto px-4 py-8 relative z-10 max-w-6xl">
                <Button
                    onClick={() => router.back()}
                    variant="ghost"
                    className="mb-8 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10"
                >
                    <ArrowLeft className="w-4 h-4 mr-2" /> Quay lại
                </Button>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">

                    {/* Cột trái: Hình ảnh & Chi tiết */}
                    <div className="lg:col-span-2 space-y-8">
                        {/* Gallery */}
                        <div className="space-y-4">
                            <div className="relative aspect-video w-full rounded-2xl overflow-hidden border border-black/10 dark:border-white/10 bg-white/50 dark:bg-black/50 backdrop-blur-sm group shadow-[0_4px_24px_rgba(0,0,0,0.05)] dark:shadow-none">
                                {/* ✅ FIX: Native img — tránh Next.js optimizer block catbox.moe */}
                                <NextImage
                                    src={activeImage || '/placeholder.svg'}
                                    alt={product.title}
                                    fill
                                    unoptimized
                                    sizes="(max-width: 1024px) 100vw, 66vw"
                                    className="w-full h-full object-contain transition-transform duration-500 group-hover:scale-105"
                                    onError={(e) => { e.currentTarget.src = '/placeholder.svg' }}
                                />
                                {product.featured && (
                                    <Badge className="absolute top-4 left-4 z-10 bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg shadow-orange-500/20 border-0">
                                        🔥 Nổi bật
                                    </Badge>
                                )}
                            </div>

                            {allImages.length > 1 && (
                                <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-none">
                                    {allImages.map((img, idx) => (
                                        <button
                                            key={idx}
                                            onClick={() => setActiveImage(img)}
                                            className={`relative w-24 h-16 rounded-lg overflow-hidden flex-shrink-0 border-2 transition-all ${activeImage === img ? 'border-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.5)]' : 'border-transparent opacity-60 hover:opacity-100'}`}
                                        >
                                            <NextImage
                                                src={img}
                                                alt={`${product.title} - ${idx}`}
                                                fill
                                                unoptimized
                                                sizes="96px"
                                                className="w-full h-full object-cover"
                                                onError={(e) => { e.currentTarget.src = '/placeholder.svg' }}
                                            />
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* General Info */}
                        <div className="space-y-6">
                            <h1 className="text-4xl font-bold text-gray-900 dark:text-white tracking-tight">{product.title}</h1>

                            <div className="flex flex-wrap gap-4 items-center">
                                <Badge variant="outline" className="border-purple-500/30 bg-purple-500/10 text-purple-300 py-1.5 px-4 text-sm rounded-full backdrop-blur-md">
                                    <Star className="w-4 h-4 mr-1.5 fill-purple-400 text-purple-400" />
                                    {product.rating ? parseFloat(product.rating).toFixed(1) : "5.0"}
                                </Badge>

                                <Badge variant="outline" className="border-blue-500/30 bg-blue-500/10 text-blue-300 py-1.5 px-4 text-sm rounded-full backdrop-blur-md">
                                    <Download className="w-4 h-4 mr-1.5" />
                                    {product.downloads || 0} lượt tải
                                </Badge>

                                {product.category && (
                                    <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-300 py-1.5 px-4 text-sm rounded-full backdrop-blur-md">
                                        <Layers className="w-4 h-4 mr-1.5" />
                                        {product.category}
                                    </Badge>
                                )}
                            </div>

                            {/* Tags */}
                            {Array.isArray(product.tags) && product.tags.length > 0 && (
                                <div className="flex flex-wrap gap-2 pt-2">
                                    <Tag className="w-5 h-5 text-gray-400 mr-2" />
                                    {product.tags.map((tag: string) => (
                                        <span key={tag} className="text-xs px-3 py-1 rounded-full bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 transition-colors">
                                            {tag}
                                        </span>
                                    ))}
                                </div>
                            )}

                            {/* Detailed Markdown Section */}
                            <div className="pt-8 border-t border-black/10 dark:border-white/10">
                                <h3 className="text-2xl font-semibold text-gray-900 dark:text-white mb-6">Mô tả sản phẩm</h3>
                                {product.detailedDescription ? (
                                    <div
                                        className="prose dark:prose-invert prose-purple max-w-none 
                      prose-headings:text-gray-900 dark:prose-headings:text-white prose-a:text-purple-600 dark:prose-a:text-purple-400 hover:prose-a:text-purple-500 dark:hover:prose-a:text-purple-300
                      prose-img:rounded-xl prose-img:border prose-img:border-black/5 dark:prose-img:border-white/10
                      prose-strong:text-purple-700 dark:prose-strong:text-purple-100"
                                        dangerouslySetInnerHTML={{
                                            __html: (() => {
                                                const raw = product.detailedDescription || '';
                                                let html = raw;
                                                
                                                // ✅ FIX: Đồng bộ Regex render Markdown giống hệt Admin Panel
                                                const isHtml = /<[a-z][\s\S]*>/i.test(raw);
                                                
                                                if (!isHtml || raw.includes('**') || raw.includes('##')) {
                                                    html = raw
                                                        .replace(/\n/g, '<br/>')
                                                        .replace(/\*\*(.*?)\*\*/g, '<strong class="text-gray-900 dark:text-white">$1</strong>')
                                                        .replace(/\*(.*?)\*/g, '<em class="text-gray-600 dark:text-gray-400">$1</em>')
                                                        .replace(/## (.*)/g, '<h2 class="text-xl font-bold mt-6 mb-3 text-purple-600 dark:text-purple-400 border-b border-gray-200 dark:border-gray-800 pb-2">$1</h2>')
                                                        .replace(/### (.*)/g, '<h3 class="text-lg font-bold mt-4 mb-2 text-purple-500 dark:text-purple-300">$1</h3>')
                                                        .replace(/- (.*)/g, '<span class="text-purple-500 mr-2">•</span> $1')
                                                        .replace(/`([^`]+)`/g, '<code class="bg-black/5 dark:bg-white/10 text-pink-600 dark:text-pink-400 px-1.5 py-0.5 rounded text-sm font-mono">$1</code>');
                                                }

                                                html = replaceMarkdownLinksWithSafeAnchors(
                                                    html,
                                                    'target="_blank" rel="noopener noreferrer" class="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 hover:underline"'
                                                );

                                                // ✅ SECURITY: Luôn sanitize; fallback vẫn qua DOMPurify (strip tags) thay vì regex yếu
                                                const PRODUCT_DESC_PURIFY = {
                                                    ALLOWED_TAGS: ['h1','h2','h3','h4','h5','h6','p','br','strong','em','b','i','u','a','ul','ol','li','img','blockquote','pre','code','table','thead','tbody','tr','th','td','hr','span','div','figure','figcaption'],
                                                    ALLOWED_ATTR: ['href','src','alt','title','class','target','rel','width','height'],
                                                    ALLOW_DATA_ATTR: false,
                                                } as const
                                                try {
                                                    const DOMPurify = require('isomorphic-dompurify');
                                                    return DOMPurify.sanitize(html, PRODUCT_DESC_PURIFY);
                                                } catch {
                                                    try {
                                                        const DOMPurify = require('isomorphic-dompurify');
                                                        return DOMPurify.sanitize(html, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
                                                    } catch {
                                                        return '';
                                                    }
                                                }
                                            })()
                                        }}
                                    />
                                ) : (
                                    // ✅ FIX: whitespace-pre-wrap để giữ nguyên xuống dòng
                                    <p className="text-gray-600 dark:text-gray-300 leading-relaxed text-lg bg-black/5 dark:bg-white/5 p-6 rounded-2xl border border-black/10 dark:border-white/10 whitespace-pre-wrap">
                                        {product.description || "Chưa có mô tả chi tiết cho sản phẩm này."}
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Cột phải: Khung Mua Hàng */}
                    <div className="lg:col-span-1">
                        <div className="sticky top-24">
                            <Card className="bg-white/60 dark:bg-black/40 backdrop-blur-xl border-white/60 dark:border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.05)] dark:shadow-2xl overflow-hidden rounded-3xl relative z-10">
                                <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 dark:from-purple-500/10 via-transparent to-pink-500/5 dark:to-pink-500/10 pointer-events-none" />
                                <CardContent className="p-8 space-y-8 relative z-10">
                                    <div className="space-y-2">
                                        <p className="text-gray-500 dark:text-gray-400 font-medium">Giá sản phẩm</p>
                                        <div className="flex items-end gap-3">
                                            <span className="text-5xl font-black bg-gradient-to-r from-purple-600 to-pink-600 dark:from-purple-400 dark:to-pink-500 bg-clip-text text-transparent">
                                                {(product.price || 0).toLocaleString("vi-VN")}đ
                                            </span>
                                        </div>
                                        {product.originalPrice > product.price && (
                                            <p className="text-gray-400 dark:text-gray-500 line-through text-lg">
                                                {product.originalPrice.toLocaleString("vi-VN")}đ
                                            </p>
                                        )}
                                    </div>

                                    <div className="space-y-4 pt-4 border-t border-black/10 dark:border-white/10">
                                        <Button
                                            onClick={() => handleAddToCart(product)}
                                            className="w-full h-14 text-lg font-bold bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white shadow-[0_0_20px_rgba(168,85,247,0.4)] transition-all hover:scale-[1.02]"
                                        >
                                            <ShoppingCart className="w-5 h-5 mr-2" />
                                            Thêm vào giỏ
                                        </Button>

                                        {product.demoLink && (
                                            <Button
                                                onClick={() => window.open(product.demoLink, "_blank")}
                                                variant="outline"
                                                className="w-full h-12 bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 text-gray-900 dark:text-white hover:bg-black/10 dark:hover:bg-white/10"
                                            >
                                                <ExternalLink className="w-5 h-5 mr-2" />
                                                Xem Demo
                                            </Button>
                                        )}
                                    </div>

                                    <div className="pt-6 space-y-4 text-sm text-gray-700 dark:text-gray-300">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-emerald-500/10 rounded-lg">
                                                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                                            </div>
                                            <span className="font-medium">Mã nguồn chất lượng cao</span>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-blue-500/10 rounded-lg">
                                                <ShieldCheck className="w-4 h-4 text-blue-400" />
                                            </div>
                                            <span className="font-medium">Bảo hành trọn đời</span>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-amber-500/10 rounded-lg">
                                                <Zap className="w-4 h-4 text-amber-400" />
                                            </div>
                                            <span className="font-medium">Hỗ trợ cài đặt miễn phí</span>
                                        </div>
                                    </div>

                                    {(product.createdAt || product.created_at) && (
                                        <div className="pt-6 border-t border-black/10 dark:border-white/10 text-center">
                                            <p className="text-xs text-gray-500 flex items-center justify-center gap-1.5">
                                                <Clock className="w-3.5 h-3.5" />
                                                Cập nhật: {new Date(product.updatedAt || product.updated_at || product.createdAt || product.created_at).toLocaleDateString("vi-VN")}
                                            </p>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </div>
                    </div>

                </div>
            </main>

            <Footer />
        </div>
    )
}
