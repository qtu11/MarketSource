/**
 * Product Types & Interfaces
 */

export interface Product {
  id: number
  title: string
  description: string | null
  detailedDescription?: string | null
  price: number
  originalPrice?: number | null
  category: string | null
  demoUrl?: string | null
  demoLink?: string | null
  downloadUrl?: string | null
  downloadLink?: string | null
  imageUrl: string | null
  image?: string | null
  imageUrls: string[] | null
  tags: string[] | null
  isActive: boolean
  isFeatured: boolean
  featured?: boolean // Legacy field
  created_at: string | Date
  createdAt?: string | Date
  updated_at: string | Date
  updatedAt?: string | Date
  seller_id?: number | null
  stock?: number
  downloadCount: number
  downloads?: number // Legacy field
  averageRating: number
  rating?: number // Legacy field
  totalRatings: number
}

export interface ProductReview {
  id: number | string
  productId: number | string
  userId: number | string
  rating: number // 1-5
  comment?: string | null
  userName?: string
  userEmail?: string
  userAvatar?: string
  productTitle?: string // For display
  created_at?: string | Date
  createdAt?: string | Date // Alias
  updated_at?: string | Date
}

export interface ProductRating {
  productId: number | string
  averageRating: number
  totalRatings: number
  updated_at?: string | Date
}

export interface Purchase {
  id: number | string
  userId: number | string
  productId: number | string
  product?: Product
  image?: string | null
  imageUrl?: string | null
  amount: number | string
  created_at?: string | Date
  purchaseDate?: string | Date
  title?: string
  category?: string
  price?: number | string
  description?: string
  downloads?: number
  rating?: number
  reviewCount?: number
  review?: string | null
  downloadLink?: string | null
  downloadUrl?: string | null
  demoLink?: string | null
  demoUrl?: string | null
}

export interface DownloadRecord {
  id: number | string
  userId: number | string
  productId: number | string
  productTitle?: string
  version?: string
  totalDownloads?: number
  status?: string
  lastDownloadedAt?: string | Date
  createdAt?: string | Date
  ipAddress?: string | null
  userAgent?: string | null
  downloaded_at?: string | Date
}
