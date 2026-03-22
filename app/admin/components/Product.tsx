"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import { logger } from "@/lib/logger-client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Download, ExternalLink, Edit, Trash2, Plus, Eye, Search,
  Image as ImageIcon, Star, RotateCcw, Check, X, Bold, Italic,
  Type, List, Link, AlignLeft, Package, ChevronDown, ChevronUp,
  Grid3x3, LayoutList, Maximize2
} from 'lucide-react'
import NextImage from "next/image"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/api-client"
import { mapBackendToFrontend, mapFrontendToBackend, mapBackendProductsToFrontend } from "@/lib/product-mapper"
import { replaceMarkdownLinksWithSafeAnchors } from "@/lib/safe-markdown-links"
import { Product as ProductType } from "@/types/product"

interface ProductProps {
  products: ProductType[]
  setProducts: (products: ProductType[]) => void
  adminUser: any
}

// ✅ Rich Text Toolbar Component
function RichTextToolbar({ textareaRef, value, onChange }: {
  textareaRef: React.RefObject<HTMLTextAreaElement>
  value: string
  onChange: (val: string) => void
}) {
  const insertAt = (before: string, after: string = '') => {
    const el = textareaRef.current
    if (!el) return
    const start = el.selectionStart
    const end = el.selectionEnd
    const selected = value.slice(start, end)
    const newVal = value.slice(0, start) + before + selected + after + value.slice(end)
    onChange(newVal)
    setTimeout(() => {
      el.focus()
      el.setSelectionRange(start + before.length, start + before.length + selected.length)
    }, 10)
  }

  const tools = [
    { icon: <Bold className="w-3.5 h-3.5" />, title: 'In đậm', action: () => insertAt('**', '**') },
    { icon: <Italic className="w-3.5 h-3.5" />, title: 'In nghiêng', action: () => insertAt('*', '*') },
    { icon: <Type className="w-3.5 h-3.5" />, title: 'Tiêu đề H2', action: () => insertAt('\n## ') },
    { icon: <span className="text-xs font-bold">H3</span>, title: 'Tiêu đề H3', action: () => insertAt('\n### ') },
    { icon: <List className="w-3.5 h-3.5" />, title: 'Danh sách', action: () => insertAt('\n- ') },
    { icon: <Link className="w-3.5 h-3.5" />, title: 'Link', action: () => insertAt('[', '](url)') },
    { icon: <AlignLeft className="w-3.5 h-3.5" />, title: 'Xuống dòng', action: () => insertAt('\n\n') },
    { icon: <span className="text-xs font-mono">{'`'}</span>, title: 'Code inline', action: () => insertAt('`', '`') },
  ]

  return (
    <div className="flex flex-wrap gap-1 p-2 bg-gray-800/50 border border-gray-600/50 rounded-t-lg">
      {tools.map((tool, i) => (
        <button
          key={i}
          type="button"
          title={tool.title}
          onClick={tool.action}
          className="p-1.5 rounded hover:bg-gray-700 text-gray-300 hover:text-white transition-colors"
        >
          {tool.icon}
        </button>
      ))}
    </div>
  )
}

// ✅ Live Image Preview
function ImagePreview({ src, alt, size = 'md', className = '' }: { src: string; alt: string; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const [err, setErr] = useState(false)
  const [loaded, setLoaded] = useState(false)
  
  const sizeClasses = {
    sm: 'h-16 w-16',
    md: 'h-32 w-full',
    lg: 'h-48 w-full'
  }

  useEffect(() => { setErr(false); setLoaded(false) }, [src])

  // ✅ BUG #13 FIX: Sanitize image URL to prevent XSS (javascript:alert(1))
  const isSafeImage = (url: string) => {
    if (!url) return false;
    const lower = url.toLowerCase().trim();
    if (lower.startsWith('javascript:')) return false;
    if (lower.startsWith('data:')) {
      return lower.startsWith('data:image/');
    }
    return true;
  };

  if (!src) return (
    <div className={`${sizeClasses[size]} rounded-lg bg-gray-800/50 flex items-center justify-center border border-dashed border-gray-600 ${className}`}>
      <ImageIcon className="w-6 h-6 text-gray-600" />
    </div>
  )

  return (
    <div className={`relative overflow-hidden rounded-lg bg-gray-900 border border-gray-700/50 flex flex-col ${sizeClasses[size]} ${className}`}>
      {!loaded && !err && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      {err || !isSafeImage(src) ? (
        <div className="w-full h-full flex flex-col items-center justify-center text-gray-500 gap-1">
          <X className="w-5 h-5 text-red-400" />
          <span className="text-xs">{!isSafeImage(src) ? 'URL không an toàn' : 'Lỗi URL'}</span>
        </div>
      ) : (
        <NextImage
          src={src}
          alt={alt}
          fill
          unoptimized
          sizes="(max-width: 768px) 100vw, 33vw"
          className={`w-full h-full object-cover transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
          onLoad={() => setLoaded(true)}
          onError={() => setErr(true)}
        />
      )}
    </div>
  )
}

const EMPTY_PRODUCT = {
  title: "", 
  description: "", 
  price: "", 
  category: "",
  imageUrl: "", 
  downloadUrl: "", 
  demoUrl: "", 
  tags: "",
  detailedDescription: "", 
  imageUrls: "", 
  isFeatured: false,
  averageRating: "", 
  downloadCount: ""
}

export default function Product({ products, setProducts, adminUser }: ProductProps) {
  const [newProduct, setNewProduct] = useState({ ...EMPTY_PRODUCT })
  const [editingProduct, setEditingProduct] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list')
  const [activeTab, setActiveTab] = useState<'add' | 'edit'>('add')
  const [previewMode, setPreviewMode] = useState(false)
  const [expandedProduct, setExpandedProduct] = useState<number | null>(null)
  const newDescRef = useRef<HTMLTextAreaElement>(null)
  const editDescRef = useRef<HTMLTextAreaElement>(null)

  // ✅ Load products từ API
  useEffect(() => {
    const loadProducts = async () => {
      try {
        setIsLoading(true)
        const result = await apiGet('/api/products')
        if (result.success && result.products) {
          setProducts(mapBackendProductsToFrontend(result.products))
        }
      } catch (error) {
        logger.error('Error loading products', error)
      } finally {
        setIsLoading(false)
      }
    }
    loadProducts()
  }, [setProducts])

  // ✅ FIX: Parse imageUrls từ CSV string thành array (fix image không hiện)
  const parseImageUrls = useCallback((raw: string | string[]): string[] => {
    if (Array.isArray(raw)) return raw.filter(Boolean)
    if (!raw || typeof raw !== 'string') return []
    return raw.split(',').map(s => s.trim()).filter(Boolean)
  }, [])

  // ✅ BUG #6 FIX: Improved URL validation (SSRF & XSS protection)
  const isValidUrl = (url: string): boolean => {
    if (!url) return true;
    try {
      const u = new URL(url);
      
      // Enforce https in production
      if (process.env.NODE_ENV === 'production' && u.protocol !== 'https:') {
        return false;
      }
      if (!['http:', 'https:'].includes(u.protocol)) return false;

      // Block local/internal hostnames
      const hostname = u.hostname.toLowerCase();
      const isInternal = 
        hostname === 'localhost' || 
        hostname === '127.0.0.1' || 
        hostname.startsWith('192.168.') || 
        hostname.startsWith('10.') ||
        hostname.endsWith('.local') ||
        hostname === '0.0.0.0';

      return !isInternal;
    } catch {
      return false;
    }
  };

  // ✅ FIX: Build productData đúng format trước khi gửi API
  const buildProductData = useCallback((form: any) => mapFrontendToBackend({
    ...form,
    price: parseFloat(form.price) || 0,
    tags: typeof form.tags === 'string'
      ? form.tags.split(',').map((t: string) => t.trim()).filter(Boolean)
      : (Array.isArray(form.tags) ? form.tags : []),
    imageUrl: form.imageUrl || null,
    imageUrls: parseImageUrls(form.imageUrls),
    downloadUrl: form.downloadUrl || null,
    demoUrl: form.demoUrl || null,
  }), [parseImageUrls])

  // ✅ Thêm sản phẩm mới
  const addProduct = useCallback(async () => {
    if (isLoading) return; // ✅ BUG #30 FIX: Chặn double click

    if (!newProduct.title || !newProduct.price) {
      alert("Vui lòng nhập tên sản phẩm và giá!")
      return
    }

    // ✅ BUG #29: Validate URLs
    if (newProduct.imageUrl && !isValidUrl(newProduct.imageUrl)) {
      alert("URL ảnh chính không hợp lệ!"); return;
    }
    if (newProduct.downloadUrl && !isValidUrl(newProduct.downloadUrl)) {
      alert("URL tải xuống không hợp lệ!"); return;
    }
    if (newProduct.demoUrl && !isValidUrl(newProduct.demoUrl)) {
      alert("URL demo không hợp lệ!"); return;
    }
    setIsLoading(true)
    try {
      const productData = buildProductData(newProduct)
      const result = await apiPost('/api/products', productData)
      if (result.success && result.product) {
        const mapped = mapBackendToFrontend(result.product)
        setProducts([...products, mapped])
        setNewProduct({ ...EMPTY_PRODUCT })
        alert("✅ Thêm sản phẩm thành công!")
      } else {
        throw new Error(result.error || 'Lỗi tạo sản phẩm')
      }
    } catch (error: any) {
      logger.error("Error adding product", error)
      alert("❌ Lỗi: " + (error.message || "Vui lòng thử lại"))
    } finally {
      setIsLoading(false)
    }
  }, [newProduct, products, setProducts, buildProductData, isLoading])

  // ✅ Sửa sản phẩm
  const saveEdit = useCallback(async () => {
    if (isLoading) return; // ✅ BUG #30 FIX: Chặn double click
    if (!editingProduct) return

    // ✅ BUG #29: Validate URLs
    if (editingProduct.image && !isValidUrl(editingProduct.image)) {
      alert("URL ảnh không hợp lệ!"); return;
    }
    if (editingProduct.downloadLink && !isValidUrl(editingProduct.downloadLink)) {
      alert("URL tải xuống không hợp lệ!"); return;
    }
    if (editingProduct.demoLink && !isValidUrl(editingProduct.demoLink)) {
      alert("URL demo không hợp lệ!"); return;
    }
    setIsLoading(true)
    try {
      const productId = typeof editingProduct.id === 'string' ? parseInt(editingProduct.id) : editingProduct.id
      if (isNaN(productId)) throw new Error('Invalid product ID')

      const productData = buildProductData({
        ...editingProduct,
        imageUrls: Array.isArray(editingProduct.imageUrls)
          ? editingProduct.imageUrls.join(', ')
          : editingProduct.imageUrls || '',
        tags: Array.isArray(editingProduct.tags)
          ? editingProduct.tags.join(', ')
          : editingProduct.tags || ''
      })

      // Thêm admin override fields nếu có
      if (editingProduct.rating !== undefined && editingProduct.rating !== '') {
        productData.averageRating = parseFloat(editingProduct.rating)
      }
      if (editingProduct.downloadCount !== undefined && editingProduct.downloadCount !== '') {
        productData.downloadCount = parseInt(editingProduct.downloadCount)
      }
      productData.isFeatured = editingProduct.isFeatured || false

      const result = await apiPut(`/api/products/${productId}`, productData)
      if (result.success && result.product) {
        const mapped = mapBackendToFrontend(result.product)
        setProducts(products.map(p => p.id === editingProduct.id ? mapped : p))
        setEditingProduct(null)
        setActiveTab('add')
        alert("✅ Cập nhật thành công!")
      } else {
        throw new Error(result.error || 'Lỗi cập nhật')
      }
    } catch (error: any) {
      logger.error("Error editing product", error)
      alert("❌ Lỗi: " + (error.message || "Vui lòng thử lại"))
    } finally {
      setIsLoading(false)
    }
  }, [editingProduct, products, setProducts, buildProductData, isLoading])

  // ✅ Xóa sản phẩm
  const deleteProduct = useCallback(async (productId: string | number) => {
    if (!confirm("⚠️ Bạn chắc chắn muốn xóa sản phẩm này?")) return
    setIsLoading(true)
    try {
      const id = typeof productId === 'string' ? parseInt(productId) : productId
      const result = await apiDelete(`/api/products/${id}`)
      if (result.success) {
        setProducts(products.filter(p => {
          const pId = typeof p.id === 'string' ? parseInt(p.id) : p.id
          return pId !== id
        }))
        alert("✅ Xóa thành công!")
      } else {
        throw new Error(result.error || 'Lỗi xóa sản phẩm')
      }
    } catch (error: any) {
      logger.error("Error deleting product", error)
      alert("❌ Lỗi: " + (error.message || "Vui lòng thử lại"))
    } finally {
      setIsLoading(false)
    }
  }, [products, setProducts])

  // Start editing
  const startEdit = (product: ProductType) => {
    setEditingProduct({
      ...product,
      imageUrl: product.imageUrl || '',
      imageUrls: Array.isArray(product.imageUrls) ? product.imageUrls.join(', ') : '',
      tags: Array.isArray(product.tags) ? product.tags.join(', ') : '',
      downloadUrl: product.downloadUrl || '',
      demoUrl: product.demoUrl || '',
      averageRating: product.averageRating || '',
      downloadCount: product.downloadCount || '',
    })
    setActiveTab('edit')
  }

  // Filtered products
  const filteredProducts = products.filter(p =>
    !searchTerm ||
    p.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.category?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (Array.isArray(p.tags) && p.tags.some((t: string) => t.toLowerCase().includes(searchTerm.toLowerCase())))
  )

  // ✅ Product Form Render Function (chuyển thành hàm để tránh bị React unmount/remount gây mất focus)
  const renderProductForm = ({ form, setForm, onSubmit, submitLabel, descRef }: {
    form: any, setForm: (f: any) => void, onSubmit: () => void,
    submitLabel: string, descRef: React.RefObject<HTMLTextAreaElement>
  }) => (
    <div className="space-y-4">
      {/* Preview toggle */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Thông tin cơ bản</h3>
        <button
          type="button"
          onClick={() => setPreviewMode(!previewMode)}
          className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-colors ${previewMode ? 'border-purple-500 bg-purple-500/20 text-purple-300' : 'border-gray-600 text-gray-400 hover:border-gray-500'}`}
        >
          <Eye className="w-3 h-3" /> {previewMode ? 'Editing' : 'Preview'}
        </button>
      </div>

      {/* Tên & Giá */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs text-gray-400 mb-1 block">Tên sản phẩm *</Label>
          <Input
            value={form.title || ''} placeholder="Tên sản phẩm"
            onChange={e => setForm({ ...form, title: e.target.value })}
            className="bg-gray-800/50 border-gray-600/50 text-white placeholder:text-gray-600 focus:border-purple-500/50 h-9"
          />
        </div>
        <div>
          <Label className="text-xs text-gray-400 mb-1 block">Giá (VNĐ) *</Label>
          <Input
            type="number" value={form.price || ''} placeholder="100000"
            onChange={e => setForm({ ...form, price: e.target.value })}
            className="bg-gray-800/50 border-gray-600/50 text-white placeholder:text-gray-600 focus:border-purple-500/50 h-9"
          />
        </div>
      </div>

      {/* Danh mục & Tags */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs text-gray-400 mb-1 block">Danh mục</Label>
          <Select value={form.category || ''} onValueChange={v => setForm({ ...form, category: v })}>
            <SelectTrigger className="bg-gray-800/50 border-gray-600/50 text-white h-9">
              <SelectValue placeholder="Chọn danh mục" />
            </SelectTrigger>
            <SelectContent className="bg-gray-900 border-gray-700">
              <SelectItem value="Website">🌐 Website</SelectItem>
              <SelectItem value="Mobile App">📱 Mobile App</SelectItem>
              <SelectItem value="Game">🎮 Game</SelectItem>
              <SelectItem value="Tool">🔧 Tool</SelectItem>
              <SelectItem value="Template">📄 Template</SelectItem>
              <SelectItem value="Other">📦 Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs text-gray-400 mb-1 block">Tags (phân cách bởi dấu phẩy)</Label>
          <Input
            value={form.tags || ''} placeholder="react, nextjs, typescript"
            onChange={e => setForm({ ...form, tags: e.target.value })}
            className="bg-gray-800/50 border-gray-600/50 text-white placeholder:text-gray-600 focus:border-purple-500/50 h-9"
          />
        </div>
      </div>

      {/* Mô tả ngắn */}
      <div>
        <Label className="text-xs text-gray-400 mb-1 block">Mô tả ngắn</Label>
        <Textarea
          value={form.description || ''} placeholder="Mô tả sản phẩm ngắn gọn (hiển thị trên card)"
          onChange={e => setForm({ ...form, description: e.target.value })} rows={2}
          className="bg-gray-800/50 border-gray-600/50 text-white placeholder:text-gray-600 focus:border-purple-500/50 resize-none text-sm"
        />
      </div>

      {/* Ảnh chính */}
      <div>
        <Label className="text-xs text-gray-400 mb-1 block">🖼️ Link ảnh chính (URL)</Label>
        <Input
          value={form.imageUrl || ''} placeholder="https://files.catbox.moe/abc.png"
          onChange={e => setForm({ ...form, imageUrl: e.target.value })}
          className="bg-gray-800/50 border-gray-600/50 text-white placeholder:text-gray-600 focus:border-purple-500/50 h-9 font-mono text-xs"
        />
        {/* Live preview ảnh chính */}
        {form.imageUrl && (
          <div className="mt-2">
            <ImagePreview src={form.imageUrl} alt="Ảnh chính" size="lg" />
          </div>
        )}
      </div>

      {/* Thư viện ảnh phụ */}
      <div>
        <Label className="text-xs text-gray-400 mb-1 block">📸 Thư viện ảnh phụ (mỗi URL cách nhau bởi dấu phẩy)</Label>
        <Textarea
          value={typeof form.imageUrls === 'string' ? form.imageUrls : (Array.isArray(form.imageUrls) ? form.imageUrls.join(', ') : '')}
          placeholder="https://img1.png, https://img2.png, https://img3.png"
          onChange={e => setForm({ ...form, imageUrls: e.target.value })} rows={2}
          className="bg-gray-800/50 border-gray-600/50 text-white placeholder:text-gray-600 focus:border-purple-500/50 resize-none font-mono text-xs"
        />
        {/* Preview gallery ảnh phụ */}
        {form.imageUrls && parseImageUrls(form.imageUrls).length > 0 && (
          <div className="flex gap-2 mt-2 flex-wrap">
            {parseImageUrls(form.imageUrls).map((url, i) => (
              <ImagePreview key={i} src={url} alt={`Ảnh ${i + 1}`} size="sm" />
            ))}
          </div>
        )}
      </div>

      {/* Links */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs text-gray-400 mb-1 block">🔗 Link tải xuống</Label>
          <Input
            value={form.downloadUrl || ''} placeholder="https://mega.nz/..."
            onChange={e => setForm({ ...form, downloadUrl: e.target.value })}
            className="bg-gray-800/50 border-gray-600/50 text-white placeholder:text-gray-600 focus:border-purple-500/50 h-9 text-xs"
          />
        </div>
        <div>
          <Label className="text-xs text-gray-400 mb-1 block">🎬 Link demo</Label>
          <Input
            value={form.demoUrl || ''} placeholder="https://youtube.com/..."
            onChange={e => setForm({ ...form, demoUrl: e.target.value })}
            className="bg-gray-800/50 border-gray-600/50 text-white placeholder:text-gray-600 focus:border-purple-500/50 h-9 text-xs"
          />
        </div>
      </div>

      {/* Mô tả chi tiết với rich text toolbar */}
      <div>
        <Label className="text-xs text-gray-400 mb-1 block">📝 Mô tả chi tiết (Markdown/HTML)</Label>
        {previewMode ? (
          <div
            className="min-h-[200px] p-3 bg-gray-800/30 border border-gray-600/50 rounded-lg text-sm text-gray-200 prose prose-invert prose-sm max-w-none whitespace-pre-wrap"
            dangerouslySetInnerHTML={{
              __html: (() => {
                const raw = form.detailedDescription || '';
                let html = raw
                  .replace(/\n/g, '<br/>')
                  .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                  .replace(/\*(.*?)\*/g, '<em>$1</em>')
                  .replace(/## (.*)/g, '<h2 class="text-lg font-bold mt-4 mb-2">$1</h2>')
                  .replace(/### (.*)/g, '<h3 class="text-base font-bold mt-3 mb-1">$1</h3>')
                  .replace(/- (.*)/g, '• $1');
                html = replaceMarkdownLinksWithSafeAnchors(html, 'target="_blank" rel="noopener noreferrer" class="text-blue-400 hover:underline hover:text-blue-300"');

                // ✅ SECURITY FIX: Sanitize XSS payload trong Preview (VD: <img src=x onerror=alert(1)>)
                try {
                    const DOMPurify = require('isomorphic-dompurify');
                    return DOMPurify.sanitize(html, {
                        ALLOWED_TAGS: ['h1','h2','h3','h4','h5','h6','p','br','strong','em','b','i','u','a','ul','ol','li','img','blockquote','pre','code','table','thead','tbody','tr','th','td','hr','span','div'],
                        ALLOWED_ATTR: ['href','src','alt','class','target','rel'],
                    });
                } catch {
                    return html.replace(/<script[\s\S]*?<\/script>/gi, '');
                }
              })()
            }}
          />
        ) : (
          <div className="space-y-2">
            <Textarea
              value={form.detailedDescription || ''}
              placeholder="Viết mô tả chi tiết sản phẩm..."
              onChange={e => setForm({ ...form, detailedDescription: e.target.value })}
              rows={4}
              className="bg-gray-800/50 border-gray-600/50 text-white placeholder:text-gray-600 focus:border-purple-500/50 resize-y font-mono text-sm"
            />
            <Dialog>
              <DialogTrigger asChild>
                <div className="flex justify-end">
                  <Button type="button" variant="outline" size="sm" className="h-8 bg-purple-600/10 border-purple-500/30 hover:bg-purple-600/20 text-purple-300">
                    <Maximize2 className="w-3.5 h-3.5 mr-1.5" /> Mở rộng khung soạn thảo chuyên nghiệp
                  </Button>
                </div>
              </DialogTrigger>
              <DialogContent className="max-w-[95vw] w-[1200px] h-[85vh] flex flex-col bg-gray-950 border-gray-700 p-0 shadow-2xl">
                <DialogHeader className="p-4 border-b border-gray-800 bg-gray-900/80 shrink-0">
                  <DialogTitle className="text-white flex items-center gap-2">
                    <Type className="w-5 h-5 text-purple-400" />
                    Soạn thảo Mô tả chi tiết
                  </DialogTitle>
                </DialogHeader>
                <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-2">
                   {/* LEFT: Editor */}
                   <div className="flex flex-col border-r border-gray-800 h-full p-4 gap-2 bg-gray-900/30">
                     <RichTextToolbar textareaRef={descRef} value={form.detailedDescription || ''} onChange={v => setForm({ ...form, detailedDescription: v })} />
                     <Textarea
                        ref={descRef}
                        value={form.detailedDescription || ''}
                        placeholder="Viết mô tả..."
                        onChange={e => setForm({ ...form, detailedDescription: e.target.value })}
                        className="flex-1 bg-gray-950 border-gray-700 text-gray-300 focus:border-purple-500/50 resize-none font-mono text-sm p-4 h-full"
                     />
                   </div>
                   {/* RIGHT: Preview */}
                   <div className="p-6 h-full overflow-y-auto bg-gray-900/50 custom-scrollbar">
                     <h3 className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-4 border-b border-gray-800 pb-2">Live Preview</h3>
                     <div
                        className="prose prose-invert prose-sm xl:prose-base max-w-none text-gray-300 break-words whitespace-pre-wrap"
                        dangerouslySetInnerHTML={{
                          __html: (() => {
                            const raw = form.detailedDescription || '';
                            let html = raw
                              .replace(/\n/g, '<br/>')
                              .replace(/\*\*(.*?)\*\*/g, '<strong class="text-white">$1</strong>')
                              .replace(/\*(.*?)\*/g, '<em class="text-gray-400">$1</em>')
                              .replace(/## (.*)/g, '<h2 class="text-xl font-bold mt-6 mb-3 text-purple-300 border-b border-gray-800 pb-2">$1</h2>')
                              .replace(/### (.*)/g, '<h3 class="text-lg font-bold mt-4 mb-2 text-purple-400">$1</h3>')
                              .replace(/- (.*)/g, '<span class="text-purple-500 mr-2">•</span> $1')
                              .replace(/`([^`]+)`/g, '<code class="bg-gray-800 text-pink-400 px-1.5 py-0.5 rounded text-sm font-mono">$1</code>');
                            html = replaceMarkdownLinksWithSafeAnchors(html, 'target="_blank" rel="noopener noreferrer" class="text-blue-400 hover:underline hover:text-blue-300"');

                            // ✅ SECURITY FIX: Sanitize XSS payload trong Khung soạn thảo Mở rộng
                            try {
                                const DOMPurify = require('isomorphic-dompurify');
                                return DOMPurify.sanitize(html, {
                                    ALLOWED_TAGS: ['h1','h2','h3','h4','h5','h6','p','br','strong','em','b','i','u','a','ul','ol','li','img','blockquote','pre','code','table','thead','tbody','tr','th','td','hr','span','div'],
                                    ALLOWED_ATTR: ['href','src','alt','class','target','rel'],
                                });
                            } catch {
                                return html.replace(/<script[\s\S]*?<\/script>/gi, '');
                            }
                          })()
                        }}
                     />
                   </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>

      {/* Admin override fields (nếu đang edit) */}
      {form.id && (
        <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg space-y-3">
          <h4 className="text-xs font-semibold text-yellow-400 uppercase tracking-wider">⚙️ Admin Override</h4>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs text-gray-400 mb-1 block">Rating (0-5)</Label>
              <Input
                type="number" min="0" max="5" step="0.1"
                value={form.averageRating || ''} placeholder="4.5"
                onChange={e => setForm({ ...form, averageRating: e.target.value })}
                className="bg-gray-800/50 border-gray-600/50 text-white h-8 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs text-gray-400 mb-1 block">Lượt tải</Label>
              <Input
                type="number" min="0"
                value={form.downloadCount || ''} placeholder="0"
                onChange={e => setForm({ ...form, downloadCount: e.target.value })}
                className="bg-gray-800/50 border-gray-600/50 text-white h-8 text-sm"
              />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 cursor-pointer pb-1">
                <input
                  type="checkbox"
                  checked={form.isFeatured || false}
                  onChange={e => setForm({ ...form, isFeatured: e.target.checked })}
                  className="w-4 h-4 rounded accent-purple-500"
                />
                <span className="text-xs text-gray-300">⭐ Nổi bật</span>
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-3 pt-2">
        <Button
          onClick={onSubmit} disabled={isLoading} className="flex-1 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white border-0 h-10"
        >
          {isLoading ? (
            <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />{form.id ? 'Đang cập nhật...' : 'Đang thêm...'}</>
          ) : (
            <>{form.id ? <><Check className="w-4 h-4 mr-2" />Lưu thay đổi</> : <><Plus className="w-4 h-4 mr-2" />Thêm sản phẩm</>}</>
          )}
        </Button>
        {form.id && (
          <Button variant="outline" onClick={() => { setEditingProduct(null); setActiveTab('add') }}
            className="border-gray-600 text-gray-300 hover:bg-gray-700 h-10">
            <X className="w-4 h-4 mr-1" /> Hủy
          </Button>
        )}
      </div>
    </div>
  )

  return (
    <div className="flex gap-6 h-full min-h-[calc(100vh-200px)]">

      {/* ============ LEFT PANEL: Form ============ */}
      <div className="w-[420px] flex-shrink-0">
        <Card className="bg-gray-900/50 border-gray-700/50 backdrop-blur-sm h-full flex flex-col">
          {/* Tabs */}
          <div className="flex border-b border-gray-700/50">
            <button
              onClick={() => setActiveTab('add')}
              className={`flex-1 py-3 text-sm font-medium transition-colors ${activeTab === 'add' ? 'text-purple-400 border-b-2 border-purple-500 bg-purple-500/5' : 'text-gray-500 hover:text-gray-300'}`}
            >
              <Plus className="w-4 h-4 inline mr-1.5" />Thêm mới
            </button>
            {editingProduct ? (
              <button
                onClick={() => setActiveTab('edit')}
                className={`flex-1 py-3 text-sm font-medium transition-colors ${activeTab === 'edit' ? 'text-blue-400 border-b-2 border-blue-500 bg-blue-500/5' : 'text-gray-500 hover:text-gray-300'}`}
              >
                <Edit className="w-4 h-4 inline mr-1.5" />Chỉnh sửa
              </button>
            ) : (
              <div className="flex-1 py-3 text-sm text-gray-700 text-center">
                <Edit className="w-4 h-4 inline mr-1.5" />Chỉnh sửa
              </div>
            )}
          </div>

          <CardContent className="flex-1 overflow-y-auto py-4 custom-scrollbar">
            {activeTab === 'add' ? (
              renderProductForm({
                form: newProduct, setForm: setNewProduct,
                onSubmit: addProduct, submitLabel: "Thêm sản phẩm",
                descRef: newDescRef
              })
            ) : editingProduct ? (
              renderProductForm({
                form: editingProduct, setForm: setEditingProduct,
                onSubmit: saveEdit, submitLabel: "Lưu thay đổi",
                descRef: editDescRef
              })
            ) : (
              <div className="flex flex-col items-center justify-center h-full py-16 text-gray-600">
                <Package className="w-12 h-12 mb-3" />
                <p className="text-sm">Chọn sản phẩm để chỉnh sửa</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ============ RIGHT PANEL: Product List ============ */}
      <div className="flex-1">
        <Card className="bg-gray-900/50 border-gray-700/50 backdrop-blur-sm h-full flex flex-col">
          <CardHeader className="pb-3 border-b border-gray-700/50">
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="text-white text-base">Danh sách sản phẩm</CardTitle>
                <p className="text-xs text-gray-500 mt-0.5">{products.length} sản phẩm · {filteredProducts.length} đang hiển thị</p>
              </div>
              <div className="flex items-center gap-2">
                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
                  <Input
                    value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                    placeholder="Tìm kiếm..." className="pl-8 h-8 w-44 bg-gray-800/50 border-gray-600/50 text-white text-sm placeholder:text-gray-600"
                  />
                </div>
                {/* View mode */}
                <div className="flex bg-gray-800/50 rounded-lg p-0.5 border border-gray-700/50">
                  <button onClick={() => setViewMode('list')} className={`p-1.5 rounded transition-colors ${viewMode === 'list' ? 'bg-purple-600 text-white' : 'text-gray-500 hover:text-gray-300'}`}>
                    <LayoutList className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => setViewMode('grid')} className={`p-1.5 rounded transition-colors ${viewMode === 'grid' ? 'bg-purple-600 text-white' : 'text-gray-500 hover:text-gray-300'}`}>
                    <Grid3x3 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </CardHeader>

          <CardContent className="flex-1 overflow-y-auto pt-3 custom-scrollbar">
            {isLoading && products.length === 0 ? (
              <div className="flex items-center justify-center h-full py-16">
                <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-600">
                <Package className="w-12 h-12 mb-3" />
                <p className="text-sm">{searchTerm ? 'Không tìm thấy sản phẩm' : 'Chưa có sản phẩm nào'}</p>
              </div>
            ) : viewMode === 'grid' ? (
              /* === GRID VIEW === */
              <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
                {filteredProducts.map(product => (
                  <div key={product.id} className="group bg-gray-800/30 rounded-xl border border-gray-700/50 overflow-hidden hover:border-purple-500/50 transition-all">
                    <div className="relative h-36">
                      <NextImage
                        src={product.imageUrl || '/placeholder.svg'}
                        alt={product.title}
                        fill
                        unoptimized
                        sizes="(max-width: 1280px) 50vw, 33vw"
                        className="w-full h-full object-cover"
                        onError={e => { e.currentTarget.src = '/placeholder.svg' }}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-gray-900/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center pb-2 gap-2">
                        <button onClick={() => startEdit(product)} className="p-2 bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">
                          <Edit className="w-3.5 h-3.5 text-white" />
                        </button>
                        <button onClick={() => deleteProduct(product.id)} className="p-2 bg-red-600 rounded-lg hover:bg-red-700 transition-colors">
                          <Trash2 className="w-3.5 h-3.5 text-white" />
                        </button>
                      </div>
                      {product.isFeatured && <Badge className="absolute top-2 left-2 bg-yellow-500/90 text-white text-xs px-1.5 py-0.5 border-0">⭐</Badge>}
                    </div>
                    <div className="p-3">
                      <h3 className="font-semibold text-white text-sm line-clamp-1 mb-1">{product.title}</h3>
                      <div className="flex items-center justify-between">
                        <Badge variant="outline" className="border-purple-500/30 text-purple-300 text-xs">{product.category}</Badge>
                        <span className="text-green-400 font-bold text-sm">{product.price?.toLocaleString('vi-VN')}đ</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              /* === LIST VIEW === */
              <div className="space-y-2">
                {filteredProducts.map(product => (
                  <div key={product.id} className="group">
                    <div className={`flex items-center gap-4 p-3 rounded-xl border transition-all ${expandedProduct === product.id ? 'bg-gray-800/60 border-purple-500/30' : 'bg-gray-800/20 border-gray-700/30 hover:border-gray-600/50 hover:bg-gray-800/40'}`}>
                      {/* Ảnh */}
                      <div className="relative w-14 h-14 rounded-lg overflow-hidden flex-shrink-0 bg-gray-800/50">
                        <NextImage
                          src={product.imageUrl || '/placeholder.svg'} alt={product.title}
                          fill
                          unoptimized
                          sizes="56px"
                          className="w-full h-full object-cover"
                          onError={e => { e.currentTarget.src = '/placeholder.svg' }}
                        />
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-white text-sm truncate">{product.title}</h3>
                          {product.isFeatured && <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-xs px-1.5 py-0 border">⭐</Badge>}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {product.category && <Badge variant="outline" className="border-purple-500/30 text-purple-300 text-xs px-1.5 py-0">{product.category}</Badge>}
                          <span className="text-green-400 font-bold text-sm">{product.price?.toLocaleString('vi-VN')}đ</span>
                          {product.averageRating > 0 && <span className="text-yellow-400 text-xs">⭐ {product.averageRating.toFixed(1)}</span>}
                          {product.downloadCount > 0 && <span className="text-gray-500 text-xs">📥 {product.downloadCount}</span>}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {product.downloadUrl && (
                          <a href={product.downloadUrl} target="_blank" rel="noopener noreferrer"
                            className="p-1.5 rounded-lg bg-gray-700/50 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors">
                            <Download className="w-3.5 h-3.5" />
                          </a>
                        )}
                        {product.demoUrl && (
                          <a href={product.demoUrl} target="_blank" rel="noopener noreferrer"
                            className="p-1.5 rounded-lg bg-gray-700/50 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors">
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                        <button onClick={() => setExpandedProduct(expandedProduct === product.id ? null : product.id)}
                          className="p-1.5 rounded-lg bg-gray-700/50 hover:bg-gray-700 text-gray-400 hover:text-gray-300 transition-colors">
                          {expandedProduct === product.id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </button>
                        <button onClick={() => startEdit(product)}
                          className="p-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 hover:text-blue-300 transition-colors">
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => deleteProduct(product.id)}
                          className="p-1.5 rounded-lg bg-red-600/20 hover:bg-red-600/40 text-red-400 hover:text-red-300 transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Expanded details */}
                    {expandedProduct === product.id && (
                      <div className="mx-3 mb-2 p-3 bg-gray-800/30 rounded-b-xl border border-t-0 border-gray-700/30 text-xs text-gray-400 space-y-2">
                        {product.description && <p className="line-clamp-3 text-gray-300">{product.description}</p>}
                        <div className="flex flex-wrap gap-3">
                        {product.imageUrl && <div>🖼️ <span className="font-mono text-gray-500 truncate">...{product.imageUrl.slice(-30)}</span></div>}
                        {product.downloadUrl && <div>📥 <a href={product.downloadUrl} className="text-blue-400 hover:underline" target="_blank">Download</a></div>}
                        {product.demoUrl && <div>🎬 <a href={product.demoUrl} className="text-blue-400 hover:underline" target="_blank">Demo</a></div>}
                        </div>
                        {Array.isArray(product.tags) && product.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {product.tags.map((tag: string, i: number) => (
                              <span key={i} className="px-1.5 py-0.5 bg-gray-700/50 rounded text-gray-400">{tag}</span>
                            ))}
                          </div>
                        )}
                        {Array.isArray(product.imageUrls) && product.imageUrls.length > 0 && (
                          <div className="flex gap-2">
                            {product.imageUrls.slice(0, 4).map((url: string, i: number) => (
                              <NextImage
                                key={i}
                                src={url}
                                alt={`${product.title} thumbnail ${i + 1}`}
                                width={48}
                                height={48}
                                unoptimized
                                className="w-12 h-12 rounded object-cover border border-gray-600/50"
                                onError={e => { e.currentTarget.style.display = 'none' }}
                              />
                            ))}
                            {product.imageUrls.length > 4 && <div className="w-12 h-12 rounded bg-gray-700/50 flex items-center justify-center text-gray-400 text-xs">+{product.imageUrls.length - 4}</div>}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
