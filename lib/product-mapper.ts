/**
 * Product Data Mapper
 * Map data structure giữa Frontend và Backend
 */

/**
 * Map backend product format → frontend format
 */
export function mapBackendToFrontend(backendProduct: any): any {
  return {
    id: backendProduct.id?.toString() || backendProduct.id,
    title: backendProduct.title,
    description: backendProduct.description,
    detailedDescription: backendProduct.detailed_description,
    price: parseFloat(backendProduct.price || '0'),
    originalPrice: backendProduct.original_price ? parseFloat(backendProduct.original_price) : parseFloat(backendProduct.price || '0'),
    category: backendProduct.category,
    // Map image fields
    image: backendProduct.image_url || backendProduct.image || '/placeholder.svg',
    imageUrl: backendProduct.image_url,
    imageUrls: (() => {
      const raw = backendProduct.image_urls;
      if (Array.isArray(raw)) return raw.filter(Boolean);
      if (typeof raw === 'string' && raw.trim()) {
        // Thử parse JSON trước
        try { return JSON.parse(raw).filter(Boolean); } catch {}
        // Fallback: CSV (url1, url2, url3)
        return raw.split(',').map((s: string) => s.trim()).filter(Boolean);
      }
      return [];
    })(),
    // Map download fields
    downloadLink: backendProduct.download_url || backendProduct.downloadUrl,
    downloadUrl: backendProduct.download_url,
    // Map demo fields
    demoLink: backendProduct.demo_url || backendProduct.demoUrl,
    demoUrl: backendProduct.demo_url,
    // Map rating fields
    rating: parseFloat(backendProduct.average_rating || backendProduct.rating || '0'),
    averageRating: parseFloat(backendProduct.average_rating || '0'),
    totalRatings: parseInt(backendProduct.total_ratings || '0'),
    // Map download count
    downloads: parseInt(backendProduct.download_count || backendProduct.downloads || '0'),
    downloadCount: parseInt(backendProduct.download_count || '0'),
    // Other fields
    tags: Array.isArray(backendProduct.tags) ? backendProduct.tags : (backendProduct.tags ? [backendProduct.tags] : []),
    isActive: backendProduct.is_active !== undefined ? backendProduct.is_active : true,
    isFeatured: backendProduct.is_featured || false,
    featured: backendProduct.is_featured || false,
    createdAt: backendProduct.created_at || backendProduct.createdAt,
    updatedAt: backendProduct.updated_at || backendProduct.updatedAt,
  };
}

/**
 * Map frontend product format → backend format
 */
export function mapFrontendToBackend(frontendProduct: any): any {
  return {
    title: frontendProduct.title,
    description: frontendProduct.description || null,
    detailedDescription: frontendProduct.detailedDescription || null,
    price: parseFloat(frontendProduct.price || '0'),
    category: frontendProduct.category || null,
    // Map image fields
    imageUrl: frontendProduct.imageUrl || frontendProduct.image || null,
    imageUrls: Array.isArray(frontendProduct.imageUrls) ? frontendProduct.imageUrls : [],
    // Map download fields
    downloadUrl: frontendProduct.downloadUrl || frontendProduct.downloadLink || null,
    // Map demo fields
    demoUrl: frontendProduct.demoUrl || frontendProduct.demoLink || null,
    // Map tags
    tags: Array.isArray(frontendProduct.tags) ? frontendProduct.tags : (frontendProduct.tags ? frontendProduct.tags.split(',').map((t: string) => t.trim()) : []),
    // Map active status
    isActive: frontendProduct.isActive !== undefined ? frontendProduct.isActive : true,
    // Admin can manually set these
    averageRating: frontendProduct.averageRating !== undefined ? parseFloat(frontendProduct.averageRating) : undefined,
    downloadCount: frontendProduct.downloadCount !== undefined ? parseInt(frontendProduct.downloadCount) : undefined,
  };
}

/**
 * Map array of products
 */
export function mapBackendProductsToFrontend(backendProducts: any[]): any[] {
  return backendProducts.map(mapBackendToFrontend);
}

