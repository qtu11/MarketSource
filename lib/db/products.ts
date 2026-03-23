import { logger } from '../logger';
import { PoolClient, Pool } from 'pg';
import { pool, getPool, query, queryOne, withTransaction, getPoolInstance, hasDownloadCountColumn } from "./core";
export async function getProducts(filters?: {
  category?: string;
  isActive?: boolean;
  limit?: number;
  offset?: number;
  userRank?: string; // NEW
}) {
  try {
    // âœ… FIX: Check pool instance trÆ°á»›c khi query
    const instance = getPoolInstance();
    if (!instance) {
      throw new Error('Database connection failed. Pool instance is null.');
    }

    // âœ… FIX: Check xem cá»™t download_count cĂ³ tá»“n táº¡i khĂ´ng
    const hasDownloadCount = await hasDownloadCountColumn();

    // âœ… FIX: Join vá»›i product_ratings Ä‘á»ƒ láº¥y ratings vĂ  download_count (náº¿u cĂ³)
    const params: any[] = [filters?.userRank || 'Script Kiddie'];
    let paramIndex = 2;

    let query = `
      SELECT p.*, 
             pr.average_rating, 
             pr.total_ratings
      ${hasDownloadCount ? ', COALESCE(p.download_count, 0) as download_count' : ', 0 as download_count'}
      FROM products p
      LEFT JOIN product_ratings pr ON p.id = pr.product_id
      WHERE p.deleted_at IS NULL
      AND (
        p.is_hidden = FALSE 
        OR ($1::text IS NOT NULL AND (
          CASE p.min_rank
            WHEN 'Script Kiddie' THEN 0
            WHEN 'Apprentice' THEN 1
            WHEN 'Senior Dev' THEN 2
            WHEN 'Architect' THEN 3
            WHEN 'Legendary Hacker' THEN 4
            ELSE 0
          END <= 
          CASE $1::text
            WHEN 'Script Kiddie' THEN 0
            WHEN 'Apprentice' THEN 1
            WHEN 'Senior Dev' THEN 2
            WHEN 'Architect' THEN 3
            WHEN 'Legendary Hacker' THEN 4
            ELSE 0
          END
        ))
      )
    `;

    if (filters?.category) {
      query += ` AND p.category = $${paramIndex}`;
      params.push(filters.category);
      paramIndex++;
    }

    if (filters?.isActive !== undefined) {
      query += ` AND p.is_active = $${paramIndex}`;
      params.push(filters.isActive);
      paramIndex++;
    }

    query += ' ORDER BY p.created_at DESC';

    if (filters?.limit) {
      query += ` LIMIT $${paramIndex}`;
      params.push(filters.limit);
      paramIndex++;
    }

    if (filters?.offset) {
      query += ` OFFSET $${paramIndex}`;
      params.push(filters.offset);
    }

    const result = await instance.query(query, params);
    return result.rows || [];
  } catch (error: any) {
    logger.error('Error getting products', error, {
      filters,
      hasPool: !!getPoolInstance(),
      errorCode: error?.code,
      errorMessage: error?.message
    });

    // âœ… FIX: Náº¿u lĂ  database connection error, throw vá»›i message rĂµ rĂ ng
    if (error?.message?.includes('Pool instance is null') ||
      error?.message?.includes('Database connection failed') ||
      error?.code === 'ENOTFOUND' ||
      error?.code === 'ECONNREFUSED' ||
      error?.code === 'ETIMEDOUT') {
      const dbError = new Error('Database connection failed. Please check environment variables.');
      (dbError as any).code = error?.code || 'DB_CONNECTION_FAILED';
      throw dbError;
    }

    // âœ… FIX: Náº¿u lĂ  lá»—i SQL, log vĂ  throw
    if (error?.code === '42P01' || error?.code === '42703') {
      logger.error('SQL error in getProducts - possible schema mismatch', error);
    }

    throw error;
  }
}
export async function getProductById(productId: number, userRank?: string) {
  try {
    // âœ… FIX: Check xem cá»™t download_count cĂ³ tá»“n táº¡i khĂ´ng
    const hasDownloadCount = await hasDownloadCountColumn();

    // âœ… FIX: Join vá»›i product_ratings Ä‘á»ƒ láº¥y ratings vĂ  download_count (náº¿u cĂ³)
    const query = `
      SELECT p.*, 
             pr.average_rating, 
             pr.total_ratings
      ${hasDownloadCount ? ', COALESCE(p.download_count, 0) as download_count' : ', 0 as download_count'}
      FROM products p
      LEFT JOIN product_ratings pr ON p.id = pr.product_id
      WHERE p.id = $1 AND p.deleted_at IS NULL
    `;
    const result = await (getPoolInstance()!).query(query, [productId]);
    const product = result.rows[0];

    if (!product) return null;

    // ✅ SECURITY CHECK: Nếu sản phẩm ẩn, kiểm tra rank
    if (product.is_hidden) {
      const getRankLevel = (r: string) => {
        const ranks = ['Script Kiddie', 'Apprentice', 'Senior Dev', 'Architect', 'Legendary Hacker'];
        return ranks.indexOf(r);
      };
      
      const userLevel = getRankLevel(userRank || 'Script Kiddie');
      const minLevel = getRankLevel(product.min_rank || 'Script Kiddie');
      
      if (userLevel < minLevel) {
        logger.warn('Unauthorized access to hidden product', { productId, userRank });
        return null;
      }
    }

    return product;
  } catch (error) {
    logger.error('Error getting product by ID', error, { productId });
    throw error;
  }
}
export async function createProduct(productData: {
  title: string;
  description?: string;
  price: number;
  category?: string;
  demoUrl?: string;
  downloadUrl?: string;
  imageUrl?: string;
  tags?: string[];
  isActive?: boolean;
}) {
  try {
    // âœ… FIX: Check xem cá»™t download_count cĂ³ tá»“n táº¡i khĂ´ng
    const hasDownloadCount = await hasDownloadCountColumn();

    const columns = hasDownloadCount
      ? 'title, description, price, category, demo_url, download_url, image_url, tags, is_active, download_count, created_at, updated_at'
      : 'title, description, price, category, demo_url, download_url, image_url, tags, is_active, created_at, updated_at';

    const values = hasDownloadCount
      ? '$1, $2, $3, $4, $5, $6, $7, $8, $9, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP'
      : '$1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP';

    const result = await pool.query(
      `INSERT INTO products (${columns})
      VALUES (${values})
      RETURNING id, created_at`,
      [
        productData.title,
        productData.description || null,
        productData.price,
        productData.category || null,
        productData.demoUrl || null,
        productData.downloadUrl || null,
        productData.imageUrl || null,
        productData.tags || null,
        productData.isActive !== undefined ? productData.isActive : true,
      ]
    );

    return {
      id: result.rows[0].id,
      createdAt: result.rows[0].created_at,
    };
  } catch (error) {
    logger.error('Error creating product', error, { title: productData.title });
    throw error;
  }
}
export async function updateProduct(
  productId: number,
  productData: {
    title?: string;
    description?: string;
    price?: number;
    category?: string;
    demoUrl?: string;
    downloadUrl?: string;
    imageUrl?: string;
    imageUrls?: string[] | null;
    detailedDescription?: string | null;
    tags?: string[];
    isActive?: boolean;
    averageRating?: number; // Manual override
    downloadCount?: number; // Manual override
  }
) {
  try {
    const updates: string[] = [];
    const params: any[] = [productId];
    let paramIndex = 2;

    if (productData.title !== undefined) {
      updates.push(`title = $${paramIndex}`);
      params.push(productData.title);
      paramIndex++;
    }

    if (productData.description !== undefined) {
      updates.push(`description = $${paramIndex}`);
      params.push(productData.description);
      paramIndex++;
    }

    if (productData.price !== undefined) {
      updates.push(`price = $${paramIndex}`);
      params.push(productData.price);
      paramIndex++;
    }

    if (productData.category !== undefined) {
      updates.push(`category = $${paramIndex}`);
      params.push(productData.category);
      paramIndex++;
    }

    if (productData.demoUrl !== undefined) {
      updates.push(`demo_url = $${paramIndex}`);
      params.push(productData.demoUrl || null);
      paramIndex++;
    }

    if (productData.downloadUrl !== undefined) {
      updates.push(`download_url = $${paramIndex}`);
      params.push(productData.downloadUrl || null);
      paramIndex++;
    }

    if (productData.imageUrl !== undefined) {
      updates.push(`image_url = $${paramIndex}`);
      params.push(productData.imageUrl || null);
      paramIndex++;
    }

    if (productData.detailedDescription !== undefined) {
      updates.push(`detailed_description = $${paramIndex}`);
      params.push(productData.detailedDescription || null);
      paramIndex++;
    }

    if (productData.imageUrls !== undefined) {
      updates.push(`image_urls = $${paramIndex}`);
      params.push(productData.imageUrls ? JSON.stringify(productData.imageUrls) : '[]');
      paramIndex++;
    }

    if (productData.tags !== undefined) {
      updates.push(`tags = $${paramIndex}`);
      params.push(productData.tags || null);
      paramIndex++;
    }

    if (productData.isActive !== undefined) {
      updates.push(`is_active = $${paramIndex}`);
      params.push(productData.isActive);
      paramIndex++;
    }

    // âœ… FIX: Cho phĂ©p admin manually set download_count (náº¿u column tá»“n táº¡i)
    if (productData.downloadCount !== undefined) {
      const hasDownloadCount = await hasDownloadCountColumn();
      if (hasDownloadCount) {
        updates.push(`download_count = $${paramIndex}`);
        params.push(productData.downloadCount);
        paramIndex++;
      }
    }

    // LuĂ´n cáº­p nháº­t updated_at
    updates.push('updated_at = CURRENT_TIMESTAMP');

    if (updates.length > 1) { // CĂ³ Ă­t nháº¥t 1 update + updated_at
      await pool.query(
        `UPDATE products SET ${updates.join(', ')} WHERE id = $1`,
        params
      );
    }

    // âœ… FIX: Náº¿u admin muá»‘n manually set average_rating, update vĂ o product_ratings
    if (productData.averageRating !== undefined) {
      await pool.query(
        `INSERT INTO product_ratings (product_id, average_rating, total_ratings, updated_at)
         VALUES ($1, $2, 
           COALESCE((SELECT total_ratings FROM product_ratings WHERE product_id = $1), 0),
           CURRENT_TIMESTAMP)
         ON CONFLICT (product_id)
         DO UPDATE SET 
           average_rating = EXCLUDED.average_rating,
           updated_at = EXCLUDED.updated_at`,
        [productId, productData.averageRating]
      );
    }

    // ✅ Realtime Update
    try {
      const { publishDashboardEvent } = await import('../realtime/events');
      await publishDashboardEvent('products', { id: productId, ...productData, type: 'product_update' });
    } catch (e) { /* ignore */ }

    return await getProductById(productId);
  } catch (error) {
    logger.error('Error updating product', error, { productId });
    throw error;
  }
}
export async function deleteProduct(productId: number) {
  try {
    const result = await pool.query(
      'DELETE FROM products WHERE id = $1 RETURNING id',
      [productId]
    );
    return result.rows[0] || null;
  } catch (error) {
    logger.error('Error deleting product', error, { productId });
    throw error;
  }
}
export async function trackProductView(productId: number, ipAddress?: string) {
  try {
    await pool.query(
      `INSERT INTO product_views (product_id, ip_address, viewed_at)
       VALUES ($1, $2, CURRENT_TIMESTAMP)`,
      [productId, ipAddress || null]
    );
  } catch (error) {
    logger.error("Error tracking product view", error, { productId });
  }
}
export async function searchProducts(query: string, filters?: {
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  minRating?: number;
  limit?: number;
  offset?: number;
}) {
  try {
    // PostgreSQL Full-Text Search using websearch_to_tsquery for better UX
    let sql = `
      SELECT p.*,
             pr.average_rating as avg_rating,
             pr.total_ratings as review_count,
             ts_rank(to_tsvector('english', p.title || ' ' || COALESCE(p.description, '')), websearch_to_tsquery('english', $1)) as rank
      FROM products p
      LEFT JOIN product_ratings pr ON p.id = pr.product_id
      WHERE p.deleted_at IS NULL AND p.is_active = TRUE
        AND (
          to_tsvector('english', p.title || ' ' || COALESCE(p.description, '')) @@ websearch_to_tsquery('english', $1)
          OR p.title ILIKE $2
          OR p.tags::text ILIKE $2
        )
    `;
    const params: any[] = [query, `%${query}%`];
    let paramIndex = 3;

    if (filters?.category) {
      sql += ` AND p.category = $${paramIndex}`;
      params.push(filters.category);
      paramIndex++;
    }

    if (filters?.minPrice !== undefined) {
      sql += ` AND p.price >= $${paramIndex}`;
      params.push(filters.minPrice);
      paramIndex++;
    }

    if (filters?.maxPrice !== undefined) {
      sql += ` AND p.price <= $${paramIndex}`;
      params.push(filters.maxPrice);
      paramIndex++;
    }

    if (filters?.minRating !== undefined) {
      sql += ` AND (pr.average_rating >= $${paramIndex} OR pr.average_rating IS NULL)`;
      params.push(filters.minRating);
      paramIndex++;
    }

    sql += ` ORDER BY rank DESC, p.created_at DESC`;

    if (filters?.limit) {
      sql += ` LIMIT $${paramIndex}`;
      params.push(filters.limit);
      paramIndex++;
    }

    if (filters?.offset) {
      sql += ` OFFSET $${paramIndex}`;
      params.push(filters.offset);
    }

    const result = await pool.query(sql, params);
    return result.rows;
  } catch (error) {
    logger.error('Error searching products (Postgres)', error, { query, filters });
    throw error;
  }
}
export async function getBundles(isActive?: boolean) {
  try {
    let query = `
      SELECT b.*,
             COUNT(bp.product_id) as product_count
      FROM bundles b
      LEFT JOIN bundle_products bp ON b.id = bp.bundle_id
    `;
    const params: any[] = [];

    if (isActive !== undefined) {
      query += ' WHERE b.is_active = $1';
      params.push(isActive);
    }

    query += ' GROUP BY b.id ORDER BY b.created_at DESC';

    const result = await pool.query(query, params);
    return result.rows;
  } catch (error) {
    logger.error("Error getting bundles", error);
    throw error;
  }
}
export async function getBundleById(bundleId: number) {
  try {
    const result = await pool.query(
      "SELECT * FROM bundles WHERE id = $1",
      [bundleId]
    );
    return result.rows[0] || null;
  } catch (error) {
    logger.error("Error getting bundle by ID", error, { bundleId });
    throw error;
  }
}
export async function getBundleWithProducts(bundleId: number) {
  try {
    const bundleRes = await pool.query(
      'SELECT * FROM bundles WHERE id = $1',
      [bundleId]
    );

    if (bundleRes.rows.length === 0) return null;

    const productRes = await pool.query(
      `SELECT p.*
       FROM products p
       JOIN bundle_products bp ON p.id = bp.product_id
       WHERE bp.bundle_id = $1 AND p.deleted_at IS NULL`,
      [bundleId]
    );

    return {
      ...bundleRes.rows[0],
      products: productRes.rows,
    };
  } catch (error) {
    logger.error('Error getting bundle with products', error, { bundleId });
    throw error;
  }
}
export async function getProductViewCount(productId: number): Promise<number> {
  try {
    const result = await pool.query(
      "SELECT COUNT(*) as count FROM product_views WHERE product_id = $1",
      [productId]
    );
    return parseInt(result.rows[0].count);
  } catch (error) {
    logger.error("Error getting product view count", error, { productId });
    return 0;
  }
}
export async function createBanner(bannerData: {
  title: string
  imageUrl: string
  link?: string
  isActive?: boolean
}) {
  try {
    const result = await pool.query(
      `INSERT INTO banners (title, image_url, link, is_active, created_at)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP) RETURNING id`,
      [
        bannerData.title,
        bannerData.imageUrl,
        bannerData.link || null,
        bannerData.isActive !== false,
      ]
    );
    return { id: result.rows[0].id };
  } catch (error) {
    logger.error("Error creating banner", error, { bannerData });
    throw error;
  }
}

