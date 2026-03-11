import { NextRequest, NextResponse } from 'next/server'
import { getProducts, getProductById } from '@/lib/database-mysql'
import { requireAdmin, validateRequest } from '@/lib/api-auth'
import { checkRateLimitAndRespond } from '@/lib/rate-limit'
import { productSchema } from '@/lib/validation-schemas'
import { logError, createErrorResponse } from '@/lib/error-handler'
import { query } from '@/lib/database-mysql'

export const runtime = 'nodejs'

/**
 * GET /api/products
 * Lấy danh sách products từ database
 */
export async function GET(request: NextRequest) {
  try {
    // Rate limiting
    const rateLimitResponse = await checkRateLimitAndRespond(request, 30, 10, 'products-get');
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category')
    const isActive = searchParams.get('isActive')
    const limit = searchParams.get('limit')
    const offset = searchParams.get('offset')

    const filters: {
      category?: string;
      isActive?: boolean;
      limit?: number;
      offset?: number;
    } = {};

    if (category) {
      filters.category = category;
    }

    if (isActive !== null) {
      filters.isActive = isActive === 'true';
    }

    if (limit) {
      const limitNum = parseInt(limit);
      if (!isNaN(limitNum) && limitNum > 0) {
        filters.limit = Math.min(limitNum, 100);
      }
    }

    if (offset) {
      const offsetNum = parseInt(offset);
      if (!isNaN(offsetNum) && offsetNum >= 0) {
        filters.offset = offsetNum;
      }
    }

    const products = await getProducts(filters)

    return NextResponse.json({
      success: true,
      products: products || [],
      count: products?.length || 0,
    });
  } catch (error: any) {
    logError('Products GET', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch products from database',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      products: [],
      count: 0
    }, { status: 500 });
  }
}

/**
 * POST /api/products
 * Tạo product mới (admin only) — ✅ FIX: MySQL syntax thay vì PostgreSQL
 */
export async function POST(request: NextRequest) {
  try {
    const rateLimitResponse = await checkRateLimitAndRespond(request, 10, 60, 'products-post');
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    await requireAdmin(request);
    const body = await request.json()
    const validation = validateRequest(body, productSchema);

    if (!validation.valid || !validation.data) {
      return NextResponse.json({
        success: false,
        error: validation.error || 'Dữ liệu không hợp lệ'
      }, { status: 400 });
    }

    const productData = validation.data

    // ✅ FIX: Dùng MySQL syntax (? placeholder) thay vì PostgreSQL ($1,$2)
    const sql = `
      INSERT INTO products (
        title, description, price, category, demo_url, download_url, image_url, tags, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
    `;

    // ✅ FIX: tags phải là array cho PostgreSQL hoặc JSON string cho MySQL
    const isPostgres = process.env.DATABASE_URL || !process.env.MYSQL_HOST;
    const tagsValue = isPostgres
      ? (Array.isArray(productData.tags) ? productData.tags : JSON.parse(productData.tags || '[]'))
      : (Array.isArray(productData.tags) ? JSON.stringify(productData.tags) : productData.tags || '[]');

    const res = await query(sql, [
      productData.title,
      productData.description || null,
      productData.price,
      productData.category || null,
      productData.demoUrl || null,
      productData.downloadUrl || null,
      productData.imageUrl || null,
      tagsValue,
      productData.isActive !== false,
    ]);

    // ✅ FIX: MySQL trả về insertId thay vì RETURNING
    const newId = (res as any).insertId;
    const product = newId ? await getProductById(newId) : null;

    return NextResponse.json({
      success: true,
      message: 'Product created successfully',
      product,
    });
  } catch (error: any) {
    logError('Products POST', error);
    return NextResponse.json(
      createErrorResponse(error, 500),
      { status: 500 }
    );
  }
}


