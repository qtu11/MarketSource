/**
 * Product Data Mapper
 * Map data structure giữa Frontend và Backend
 */

/**
 * Map backend product format → frontend format
 */
export function mapBackendToFrontend(backendProduct: any): any {
  const imageUrl = backendProduct.image_url || backendProduct.thumbnail || null;
  const averageRating = Number(backendProduct.average_rating) || 0;
  const downloadCount = parseInt(backendProduct.download_count || '0');
  const createdAt = backendProduct.created_at || new Date().toISOString();
  const updatedAt = backendProduct.updated_at || new Date().toISOString();

  return {
    id: Number(backendProduct.id),
    title: backendProduct.title,
    description: backendProduct.description || null,
    detailedDescription: backendProduct.detailed_description || null,
    price: Number(backendProduct.price) || 0,
    originalPrice: backendProduct.original_price ? Number(backendProduct.original_price) : (Number(backendProduct.price) || 0),
    category: backendProduct.category || null,
    imageUrl,
    image: imageUrl,
    imageUrls: (() => {
      const raw = backendProduct.image_urls;
      if (Array.isArray(raw)) return raw.filter(Boolean);
      if (typeof raw === 'string' && raw.trim()) {
        try { return JSON.parse(raw).filter(Boolean); } catch {}
        return raw.split(',').map((s: string) => s.trim()).filter(Boolean);
      }
      return [];
    })(),
    downloadUrl: backendProduct.download_url || null,
    downloadLink: backendProduct.download_url || null,
    demoUrl: backendProduct.demo_url || null,
    demoLink: backendProduct.demo_url || null,
    averageRating,
    rating: averageRating,
    totalRatings: parseInt(backendProduct.total_ratings || '0'),
    downloadCount,
    downloads: downloadCount,
    tags: Array.isArray(backendProduct.tags) ? backendProduct.tags : (backendProduct.tags ? [backendProduct.tags] : []),
    isActive: backendProduct.is_active !== undefined ? Boolean(backendProduct.is_active) : true,
    isFeatured: Boolean(backendProduct.is_featured),
    featured: Boolean(backendProduct.is_featured),
    created_at: createdAt,
    createdAt,
    updated_at: updatedAt,
    updatedAt,
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
    isFeatured: frontendProduct.isFeatured !== undefined ? Boolean(frontendProduct.isFeatured) : undefined,
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

