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
  Grid3x3, LayoutList
} from 'lucide-react'
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/api-client"
import { mapBackendToFrontend, mapFrontendToBackend, mapBackendProductsToFrontend } from "@/lib/product-mapper"

interface ProductProps {
  products: any[]
  setProducts: (products: any[]) => void
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
function ImagePreview({ src, alt, size = 'md' }: { src: string; alt: string; size?: 'sm' | 'md' | 'lg' }) {
  const [err, setErr] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const sizeClass = size === 'sm' ? 'h-16 w-16' : size === 'lg' ? 'h-48 w-full' : 'h-32 w-full'

  useEffect(() => { setErr(false); setLoaded(false) }, [src])

  if (!src) return (
    <div className={`${sizeClass} rounded-lg bg-gray-800/50 flex items-center justify-center border border-dashed border-gray-600`}>
      <ImageIcon className="w-6 h-6 text-gray-600" />
    </div>
  )

  return (
    <div className={`${sizeClass} rounded-lg overflow-hidden border border-gray-600/50 bg-gray-900/50 relative`}>
      {!loaded && !err && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      {err ? (
        <div className="w-full h-full flex flex-col items-center justify-center text-gray-500 gap-1">
          <X className="w-5 h-5 text-red-400" />
          <span className="text-xs">Lỗi URL</span>
        </div>
      ) : (
        <img
          src={src}
          alt={alt}
          className={`w-full h-full object-cover transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
          onLoad={() => setLoaded(true)}
          onError={() => setErr(true)}
          loading="lazy"
        />
      )}
    </div>
  )
}

const EMPTY_PRODUCT = {
  title: "", description: "", price: "", category: "",
  image: "", downloadLink: "", demoLink: "", tags: "",
  detailedDescription: "", imageUrls: "", isFeatured: false,
  rating: "", downloadCount: ""
}

export default function Product({ products, setProducts, adminUser }: ProductProps) {
  const [newProduct, setNewProduct] = useState({ ...EMPTY_PRODUCT })
  const [editingProduct, setEditingProduct] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list')
  const [activeTab, setActiveTab] = useState<'add' | 'edit'>('add')
  const [previewMode, setPreviewMode] = useState(false)
  const [expandedProduct, setExpandedProduct] = useState<string | null>(null)
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
  const parseImageUrls = (raw: string | string[]): string[] => {
    if (Array.isArray(raw)) return raw.filter(Boolean)
    if (!raw || typeof raw !== 'string') return []
    return raw.split(',').map(s => s.trim()).filter(Boolean)
  }

  // ✅ FIX: Build productData đúng format trước khi gửi API
  const buildProductData = (form: any) => mapFrontendToBackend({
    ...form,
    price: parseFloat(form.price) || 0,
    tags: typeof form.tags === 'string'
      ? form.tags.split(',').map((t: string) => t.trim()).filter(Boolean)
      : (Array.isArray(form.tags) ? form.tags : []),
    // ✅ KEY FIX: image field → imageUrl cho backend
    imageUrl: form.image || form.imageUrl || null,
    // ✅ KEY FIX: CSV string → array trước khi gửi
    imageUrls: parseImageUrls(form.imageUrls),
    downloadUrl: form.downloadLink || form.downloadUrl || null,
    demoUrl: form.demoLink || form.demoUrl || null,
  })

  // ✅ Thêm sản phẩm mới
  const addProduct = useCallback(async () => {
    if (!newProduct.title || !newProduct.price) {
      alert("Vui lòng nhập tên sản phẩm và giá!")
      return
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
  }, [newProduct, products, setProducts])

  // ✅ Sửa sản phẩm
  const saveEdit = useCallback(async () => {
    if (!editingProduct) return
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
  }, [editingProduct, products, setProducts])

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
  const startEdit = (product: any) => {
    setEditingProduct({
      ...product,
      image: product.image || product.imageUrl || '',
      imageUrls: Array.isArray(product.imageUrls) ? product.imageUrls.join(', ') : product.imageUrls || '',
      tags: Array.isArray(product.tags) ? product.tags.join(', ') : product.tags || '',
      downloadLink: product.downloadLink || product.downloadUrl || '',
      demoLink: product.demoLink || product.demoUrl || '',
      rating: product.rating || product.averageRating || '',
      downloadCount: product.downloadCount || product.downloads || '',
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

  // ✅ Product Form Component (dùng lại cho cả add và edit)
  const ProductForm = ({ form, setForm, onSubmit, submitLabel, descRef }: {
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
          value={form.image || ''} placeholder="https://files.catbox.moe/abc.png"
          onChange={e => setForm({ ...form, image: e.target.value })}
          className="bg-gray-800/50 border-gray-600/50 text-white placeholder:text-gray-600 focus:border-purple-500/50 h-9 font-mono text-xs"
        />
        {/* Live preview ảnh chính */}
        {form.image && (
          <div className="mt-2">
            <ImagePreview src={form.image} alt="Ảnh chính" size="lg" />
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
            value={form.downloadLink || form.downloadUrl || ''} placeholder="https://mega.nz/..."
            onChange={e => setForm({ ...form, downloadLink: e.target.value })}
            className="bg-gray-800/50 border-gray-600/50 text-white placeholder:text-gray-600 focus:border-purple-500/50 h-9 text-xs"
          />
        </div>
        <div>
          <Label className="text-xs text-gray-400 mb-1 block">🎬 Link demo</Label>
          <Input
            value={form.demoLink || form.demoUrl || ''} placeholder="https://youtube.com/..."
            onChange={e => setForm({ ...form, demoLink: e.target.value })}
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
              __html: (form.detailedDescription || '')
                .replace(/\n/g, '<br/>')
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/\*(.*?)\*/g, '<em>$1</em>')
                .replace(/## (.*)/g, '<h2 class="text-lg font-bold mt-4 mb-2">$1</h2>')
                .replace(/### (.*)/g, '<h3 class="text-base font-bold mt-3 mb-1">$1</h3>')
                .replace(/- (.*)/g, '• $1')
            }}
          />
        ) : (
          <>
            <RichTextToolbar textareaRef={descRef} value={form.detailedDescription || ''} onChange={v => setForm({ ...form, detailedDescription: v })} />
            <Textarea
              ref={descRef}
              value={form.detailedDescription || ''}
              placeholder="Viết mô tả chi tiết sản phẩm (hỗ trợ **bold**, *italic*, ## Heading, - danh sách)"
              onChange={e => setForm({ ...form, detailedDescription: e.target.value })}
              rows={10}
              className="bg-gray-800/50 border-gray-600/50 border-t-0 rounded-t-none text-white placeholder:text-gray-600 focus:border-purple-500/50 resize-y font-mono text-sm"
            />
          </>
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
                value={form.rating || ''} placeholder="4.5"
                onChange={e => setForm({ ...form, rating: e.target.value })}
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
              <ProductForm
                form={newProduct} setForm={setNewProduct}
                onSubmit={addProduct} submitLabel="Thêm sản phẩm"
                descRef={newDescRef}
              />
            ) : editingProduct ? (
              <ProductForm
                form={editingProduct} setForm={setEditingProduct}
                onSubmit={saveEdit} submitLabel="Lưu thay đổi"
                descRef={editDescRef}
              />
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
                      <img
                        src={product.image || '/placeholder.svg'}
                        alt={product.title}
                        className="w-full h-full object-cover"
                        onError={e => { (e.target as HTMLImageElement).src = '/placeholder.svg' }}
                        loading="lazy"
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
                      <div className="w-14 h-14 rounded-lg overflow-hidden flex-shrink-0 bg-gray-800/50">
                        <img
                          src={product.image || '/placeholder.svg'} alt={product.title}
                          className="w-full h-full object-cover"
                          onError={e => { (e.target as HTMLImageElement).src = '/placeholder.svg' }}
                          loading="lazy"
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
                          {product.rating > 0 && <span className="text-yellow-400 text-xs">⭐ {parseFloat(product.rating).toFixed(1)}</span>}
                          {product.downloads > 0 && <span className="text-gray-500 text-xs">📥 {product.downloads}</span>}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {product.downloadLink && (
                          <a href={product.downloadLink} target="_blank" rel="noopener noreferrer"
                            className="p-1.5 rounded-lg bg-gray-700/50 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors">
                            <Download className="w-3.5 h-3.5" />
                          </a>
                        )}
                        {product.demoLink && (
                          <a href={product.demoLink} target="_blank" rel="noopener noreferrer"
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
                          {product.image && <div>🖼️ <span className="font-mono text-gray-500 truncate">...{product.image.slice(-30)}</span></div>}
                          {product.downloadLink && <div>📥 <a href={product.downloadLink} className="text-blue-400 hover:underline" target="_blank">Download</a></div>}
                          {product.demoLink && <div>🎬 <a href={product.demoLink} className="text-blue-400 hover:underline" target="_blank">Demo</a></div>}
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
                              <img key={i} src={url} className="w-12 h-12 rounded object-cover border border-gray-600/50"
                                onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
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