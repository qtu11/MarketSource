"use client"

import { useState, useCallback, useEffect } from "react"
import { logger } from "@/lib/logger-client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Download, ExternalLink, Edit, Trash2, Plus } from 'lucide-react'
import Image from "next/image"
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/api-client"
import { mapBackendToFrontend, mapFrontendToBackend, mapBackendProductsToFrontend } from "@/lib/product-mapper"

interface ProductProps {
  products: any[]
  setProducts: (products: any[]) => void
  adminUser: any
}

export default function Product({ products, setProducts, adminUser }: ProductProps) {
  const [newProduct, setNewProduct] = useState({
    title: "",
    description: "",
    price: "",
    category: "",
    image: "",
    downloadLink: "",
    demoLink: "",
    tags: ""
  })
  const [editingProduct, setEditingProduct] = useState<any>(null)
  const [showEditModal, setShowEditModal] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  // ✅ FIX: Load products từ API khi component mount
  useEffect(() => {
    const loadProducts = async () => {
      try {
        setIsLoading(true);
        const result = await apiGet('/api/products');
        if (result.success && result.products) {
          const mappedProducts = mapBackendProductsToFrontend(result.products);
          setProducts(mappedProducts);
        }
      } catch (error) {
        logger.error('Error loading products', error);
        // Fallback to localStorage nếu API fail
        const loadedProducts = JSON.parse(localStorage.getItem("uploadedProducts") || "[]");
        setProducts(loadedProducts);
      } finally {
        setIsLoading(false);
      }
    };
    
    loadProducts();
  }, [setProducts]);

  // ✅ FIX: Gọi API POST /api/products để tạo product mới
  const addProduct = useCallback(async () => {
    try {
      if (!newProduct.title || !newProduct.price) {
        alert("Vui lòng nhập đầy đủ thông tin sản phẩm!")
        return
      }

      setIsLoading(true);

      // Map frontend format → backend format
      const productData = mapFrontendToBackend({
        ...newProduct,
        price: parseFloat(newProduct.price),
        tags: newProduct.tags ? newProduct.tags.split(",").map(tag => tag.trim()).filter(Boolean) : [],
        imageUrl: newProduct.image,
        downloadUrl: newProduct.downloadLink,
        demoUrl: newProduct.demoLink,
      });

      // Gọi API
      const result = await apiPost('/api/products', productData);

      if (result.success && result.product) {
        // Map backend response → frontend format
        const mappedProduct = mapBackendToFrontend(result.product);
        const updatedProducts = [...products, mappedProduct];
        setProducts(updatedProducts);

        // Clear form
        setNewProduct({
          title: "",
          description: "",
          price: "",
          category: "",
          image: "",
          downloadLink: "",
          demoLink: "",
          tags: ""
        });

        alert("Thêm sản phẩm thành công!")
      } else {
        throw new Error(result.error || 'Failed to create product');
      }
    } catch (error: any) {
      logger.error("Error adding product", error)
      alert("Có lỗi xảy ra khi thêm sản phẩm: " + (error.message || "Vui lòng thử lại"))
    } finally {
      setIsLoading(false);
    }
  }, [newProduct, products, setProducts])

  // ✅ FIX: Gọi API PUT /api/products/[id] để update product
  const editProduct = useCallback(async (product: any) => {
    try {
      if (!product.title || !product.price) {
        alert("Vui lòng nhập đầy đủ thông tin sản phẩm!")
        return
      }

      setIsLoading(true);

      const productId = typeof product.id === 'string' ? parseInt(product.id) : product.id;
      if (isNaN(productId)) {
        throw new Error('Invalid product ID');
      }

      // Map frontend format → backend format
      const productData = mapFrontendToBackend({
        ...product,
        price: parseFloat(product.price),
        tags: Array.isArray(product.tags) ? product.tags : (product.tags ? product.tags.split(",").map((tag: string) => tag.trim()).filter(Boolean) : []),
        imageUrl: product.imageUrl || product.image,
        downloadUrl: product.downloadUrl || product.downloadLink,
        demoUrl: product.demoUrl || product.demoLink,
        // Admin có thể sửa ratings và download_count
        averageRating: product.rating !== undefined ? parseFloat(product.rating) : undefined,
        downloadCount: product.downloadCount !== undefined ? parseInt(product.downloadCount) : undefined,
      });

      // Gọi API
      const result = await apiPut(`/api/products/${productId}`, productData);

      if (result.success && result.product) {
        // Map backend response → frontend format
        const mappedProduct = mapBackendToFrontend(result.product);
        const updatedProducts = products.map(p =>
          p.id === product.id ? mappedProduct : p
        );
        setProducts(updatedProducts);
        setEditingProduct(null);
        setShowEditModal(false);
        alert("Cập nhật sản phẩm thành công!")
      } else {
        throw new Error(result.error || 'Failed to update product');
      }
    } catch (error: any) {
      logger.error("Error editing product", error)
      alert("Có lỗi xảy ra khi cập nhật sản phẩm: " + (error.message || "Vui lòng thử lại"))
    } finally {
      setIsLoading(false);
    }
  }, [products, setProducts])

  // ✅ FIX: Gọi API DELETE /api/products/[id] để xóa product
  const deleteProduct = useCallback(async (productId: string | number) => {
    if (!confirm("Bạn có chắc chắn muốn xóa sản phẩm này?")) return

    try {
      setIsLoading(true);

      const id = typeof productId === 'string' ? parseInt(productId) : productId;
      if (isNaN(id)) {
        throw new Error('Invalid product ID');
      }

      // Gọi API
      const result = await apiDelete(`/api/products/${id}`);

      if (result.success) {
        const updatedProducts = products.filter(p => {
          const pId = typeof p.id === 'string' ? parseInt(p.id) : p.id;
          return pId !== id;
        });
        setProducts(updatedProducts);
        alert("Xóa sản phẩm thành công!")
      } else {
        throw new Error(result.error || 'Failed to delete product');
      }
    } catch (error: any) {
      logger.error("Error deleting product", error)
      alert("Có lỗi xảy ra khi xóa sản phẩm: " + (error.message || "Vui lòng thử lại"))
    } finally {
      setIsLoading(false);
    }
  }, [products, setProducts])

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1 neon-border-hover glass-panel text-slate-900 dark:text-slate-100">
          <CardHeader>
            <CardTitle>Thêm sản phẩm mới</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="title">Tên sản phẩm</Label>
              <Input
                id="title"
                value={newProduct.title}
                onChange={(e) => setNewProduct({...newProduct, title: e.target.value})}
                placeholder="Nhập tên sản phẩm"
              />
            </div>
            <div>
              <Label htmlFor="description">Mô tả</Label>
              <Textarea
                id="description"
                value={newProduct.description}
                onChange={(e) => setNewProduct({...newProduct, description: e.target.value})}
                placeholder="Mô tả sản phẩm"
                rows={3}
              />
            </div>
            <div>
              <Label htmlFor="price">Giá (VNĐ)</Label>
              <Input
                id="price"
                type="number"
                value={newProduct.price}
                onChange={(e) => setNewProduct({...newProduct, price: e.target.value})}
                placeholder="0"
              />
            </div>
            <div>
              <Label htmlFor="category">Danh mục</Label>
              <Select value={newProduct.category} onValueChange={(value) => setNewProduct({...newProduct, category: value})}>
                <SelectTrigger>
                  <SelectValue placeholder="Chọn danh mục" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Website">Website</SelectItem>
                  <SelectItem value="Mobile App">Mobile App</SelectItem>
                  <SelectItem value="Game">Game</SelectItem>
                  <SelectItem value="Tool">Tool</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="image">Link hình ảnh</Label>
              <Input
                id="image"
                value={newProduct.image}
                onChange={(e) => setNewProduct({...newProduct, image: e.target.value})}
                placeholder="https://example.com/image.jpg"
              />
            </div>
            <div>
              <Label htmlFor="downloadLink">Link tải xuống</Label>
              <Input
                id="downloadLink"
                value={newProduct.downloadLink}
                onChange={(e) => setNewProduct({...newProduct, downloadLink: e.target.value})}
                placeholder="https://example.com/download"
              />
            </div>
            <div>
              <Label htmlFor="demoLink">Link demo</Label>
              <Input
                id="demoLink"
                value={newProduct.demoLink}
                onChange={(e) => setNewProduct({...newProduct, demoLink: e.target.value})}
                placeholder="https://example.com/demo"
              />
            </div>
            <div>
              <Label htmlFor="tags">Tags (phân cách bằng dấu phẩy)</Label>
              <Input
                id="tags"
                value={newProduct.tags}
                onChange={(e) => setNewProduct({...newProduct, tags: e.target.value})}
                placeholder="react, nextjs, typescript"
              />
            </div>
            <Button onClick={addProduct} className="w-full" disabled={isLoading}>
              <Plus className="w-4 h-4 mr-2" />
              {isLoading ? 'Đang thêm...' : 'Thêm sản phẩm'}
            </Button>
          </CardContent>
        </Card>

        {editingProduct && showEditModal && (
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle>Chỉnh sửa sản phẩm</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 max-h-[600px] overflow-y-auto">
              <div>
                <Label htmlFor="edit-title">Tên sản phẩm</Label>
                <Input
                  id="edit-title"
                  value={editingProduct.title}
                  onChange={(e) => setEditingProduct({...editingProduct, title: e.target.value})}
                  placeholder="Nhập tên sản phẩm"
                />
              </div>
              <div>
                <Label htmlFor="edit-description">Mô tả</Label>
                <Textarea
                  id="edit-description"
                  value={editingProduct.description}
                  onChange={(e) => setEditingProduct({...editingProduct, description: e.target.value})}
                  placeholder="Mô tả sản phẩm"
                  rows={3}
                />
              </div>
              <div>
                <Label htmlFor="edit-price">Giá (VNĐ)</Label>
                <Input
                  id="edit-price"
                  type="number"
                  value={editingProduct.price}
                  onChange={(e) => setEditingProduct({...editingProduct, price: e.target.value})}
                  placeholder="0"
                />
              </div>
              <div>
                <Label htmlFor="edit-category">Danh mục</Label>
                <Select value={editingProduct.category} onValueChange={(value) => setEditingProduct({...editingProduct, category: value})}>
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn danh mục" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Website">Website</SelectItem>
                    <SelectItem value="Mobile App">Mobile App</SelectItem>
                    <SelectItem value="Game">Game</SelectItem>
                    <SelectItem value="Tool">Tool</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="edit-image">Link hình ảnh</Label>
                <Input
                  id="edit-image"
                  value={editingProduct.image}
                  onChange={(e) => setEditingProduct({...editingProduct, image: e.target.value})}
                  placeholder="https://example.com/image.jpg"
                />
              </div>
              <div>
                <Label htmlFor="edit-downloadLink">Link tải xuống</Label>
                <Input
                  id="edit-downloadLink"
                  value={editingProduct.downloadLink}
                  onChange={(e) => setEditingProduct({...editingProduct, downloadLink: e.target.value})}
                  placeholder="https://example.com/download"
                />
              </div>
              <div>
                <Label htmlFor="edit-demoLink">Link demo</Label>
                <Input
                  id="edit-demoLink"
                  value={editingProduct.demoLink}
                  onChange={(e) => setEditingProduct({...editingProduct, demoLink: e.target.value})}
                  placeholder="https://example.com/demo"
                />
              </div>
              <div>
                <Label htmlFor="edit-tags">Tags (phân cách bằng dấu phẩy)</Label>
                <Input
                  id="edit-tags"
                  value={editingProduct.tags?.join(", ") || ""}
                  onChange={(e) => setEditingProduct({...editingProduct, tags: e.target.value.split(",").map(tag => tag.trim())})}
                  placeholder="react, nextjs, typescript"
                />
              </div>
              
              {/* Rating - Admin có thể manually set */}
              <div>
                <Label htmlFor="edit-rating">Đánh giá (0-5 sao) - Admin override</Label>
                <Input
                  id="edit-rating"
                  type="number"
                  min="0"
                  max="5"
                  step="0.1"
                  value={editingProduct.rating || editingProduct.averageRating || 0}
                  onChange={(e) => setEditingProduct({...editingProduct, rating: parseFloat(e.target.value)})}
                  placeholder="0"
                />
                <p className="text-xs text-gray-500 mt-1">Admin có thể manually set rating (sẽ override tự động tính từ reviews)</p>
              </div>

              {/* Download Count - Admin có thể manually set */}
              <div>
                <Label htmlFor="edit-downloadCount">Lượt tải về - Admin override</Label>
                <Input
                  id="edit-downloadCount"
                  type="number"
                  min="0"
                  value={editingProduct.downloadCount || editingProduct.downloads || 0}
                  onChange={(e) => setEditingProduct({...editingProduct, downloadCount: parseInt(e.target.value)})}
                  placeholder="0"
                />
                <p className="text-xs text-gray-500 mt-1">Admin có thể manually set download count (sẽ override tự động tính từ downloads)</p>
              </div>

              {/* Is Featured */}
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="edit-isFeatured"
                  checked={editingProduct.isFeatured || false}
                  onChange={(e) => setEditingProduct({...editingProduct, isFeatured: e.target.checked})}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <Label htmlFor="edit-isFeatured" className="cursor-pointer">
                  Hiển thị nổi bật trên trang chủ
                </Label>
              </div>

              <div className="flex space-x-2">
                <Button onClick={() => {
                  editProduct(editingProduct)
                }} className="flex-1" disabled={isLoading}>
                  <Edit className="w-4 h-4 mr-2" />
                  {isLoading ? 'Đang cập nhật...' : 'Cập nhật sản phẩm'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setEditingProduct(null)
                    setShowEditModal(false)
                  }}
                  className="flex-1"
                >
                  Hủy
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="lg:col-span-2 neon-border-hover glass-panel text-slate-900 dark:text-slate-100">
          <CardHeader>
            <CardTitle>Danh sách sản phẩm ({products.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {products.map((product) => (
                <div key={product.id} className="flex items-center space-x-4 p-4 border rounded-lg">
                  <Image
                    src={product.image || "/placeholder.svg"}
                    alt={product.title}
                    width={64}
                    height={64}
                    className="w-16 h-16 rounded-lg object-cover"
                  />
                  <div className="flex-1">
                    <div className="flex items-center space-x-2">
                      <h3 className="font-semibold">{product.title}</h3>
                      {product.isFeatured && (
                        <Badge className="bg-yellow-500 text-white text-xs">⭐ Nổi bật</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {product.description?.slice(0, 100)}...
                    </p>
                    <div className="flex items-center space-x-2 mt-2 flex-wrap">
                      <Badge>{product.category}</Badge>
                      <span className="text-sm font-medium text-green-600">
                        {product.price.toLocaleString('vi-VN')}đ
                      </span>
                      {product.rating && (
                        <span className="text-sm text-yellow-500 flex items-center">
                          ⭐ {product.rating.toFixed(1)}
                        </span>
                      )}
                      {product.downloadCount !== undefined && (
                        <span className="text-sm text-gray-500">
                          📥 {product.downloadCount} lượt tải
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex space-x-2">
                    {product.downloadLink && (
                      <Button size="sm" variant="outline" asChild>
                        <a href={product.downloadLink} target="_blank" rel="noopener noreferrer">
                          <Download className="w-4 h-4" />
                        </a>
                      </Button>
                    )}
                    {product.demoLink && (
                      <Button size="sm" variant="outline" asChild>
                        <a href={product.demoLink} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditingProduct({...product})
                        setShowEditModal(true)
                      }}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => deleteProduct(product.id)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
              {products.length === 0 && (
                <p className="text-center text-muted-foreground py-8">
                  Chưa có sản phẩm nào
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}