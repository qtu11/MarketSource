import { NextRequest, NextResponse } from 'next/server'
import { getProducts, getProductById, createProduct } from '@/lib/database'
import { requireAdmin, validateRequest } from '@/lib/api-auth'
import { checkRateLimitAndRespond } from '@/lib/rate-limit'
import { productSchema } from '@/lib/validation-schemas'
import { logError, createErrorResponse } from '@/lib/error-handler'

export const runtime = 'nodejs'

import { verifyFirebaseToken } from '@/lib/api-auth'
import { getUserByEmail } from '@/lib/db/users'

/**
 * GET /api/products
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await verifyFirebaseToken(request);
    let userRank = 'Script Kiddie';
    if (auth?.email) {
      const user = await getUserByEmail(auth.email);
      if (user) userRank = (user as any).rank || 'Script Kiddie';
    }

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
      userRank?: string;
    } = { userRank };

    if (category) {
      filters.category = category;
    }

    if (isActive !== null && isActive !== undefined) {
      filters.isActive = isActive === 'true';
    } else {
      filters.isActive = true;
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
 * Admin only
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

    const result = await createProduct({
      title: productData.title,
      description: productData.description || undefined,
      price: productData.price,
      category: productData.category || undefined,
      demoUrl: productData.demoUrl || undefined,
      downloadUrl: productData.downloadUrl || undefined,
      imageUrl: productData.imageUrl || undefined,
      tags: productData.tags || undefined,
      isActive: productData.isActive,
    });

    const product = result?.id ? await getProductById(result.id) : null;

    try {
      const { logAdminAction, resolveAdminIdForAudit } = await import('@/lib/audit-logger');
      const adminSession = await requireAdmin(request);
      const adminId = await resolveAdminIdForAudit({
        email: adminSession.email,
        uid: (adminSession as any).uid,
      });
      await logAdminAction({
        adminId,
        adminEmail: adminSession.email || undefined,
        action: 'CREATE_PRODUCT',
        targetType: 'product',
        targetId: result?.id,
        details: { title: productData.title },
        ipAddress: request.headers.get('x-forwarded-for') || undefined,
      });
    } catch (e) {
      logError('Failed to log admin action (CREATE_PRODUCT)', e);
    }

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
