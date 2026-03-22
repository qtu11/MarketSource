import { NextRequest, NextResponse } from 'next/server';
import { getProductById, updateProduct, deleteProduct } from '@/lib/database';
import { verifyFirebaseToken, requireAdmin, validateRequest } from '@/lib/api-auth';
import { checkRateLimitAndRespond } from '@/lib/rate-limit';
import { updateProductSchema } from '@/lib/validation-schemas';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/products/[id]
 * Lấy chi tiết product
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let routeId: string | undefined
  try {
    // Rate limiting
    const rateLimitResponse = await checkRateLimitAndRespond(request, 30, 10, 'product-get');
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const routeParams = await params;
    routeId = routeParams.id;
    const productId = parseInt(routeParams.id);

    if (isNaN(productId)) {
      return NextResponse.json({
        success: false,
        error: 'Invalid product ID'
      }, { status: 400 });
    }

    const product = await getProductById(productId);

    if (!product) {
      return NextResponse.json({
        success: false,
        error: 'Product not found'
      }, { status: 404 });
    }

    // ✅ SECURITY FIX: Sản phẩm inactive chỉ admin mới xem được
    const isInactive = product.is_active === false || product.is_active === 0;
    if (isInactive) {
      try {
        await requireAdmin(request);
      } catch {
        return NextResponse.json({
          success: false,
          error: 'Product not found'
        }, { status: 404 });
      }
    }

    return NextResponse.json({
      success: true,
      product,
    });
  } catch (error: any) {
    logger.error('Product GET error', error, { productId: routeId });
    return NextResponse.json({
      success: false,
      error: error.message || 'Internal server error'
    }, { status: 500 });
  }
}

/**
 * PUT /api/products/[id]
 * Update product (admin only)
 * Cho phép admin sửa ratings và download_count
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let routeId: string | undefined
  try {
    // Rate limiting
    const rateLimitResponse = await checkRateLimitAndRespond(request, 10, 60, 'product-put');
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    // Require admin
    await requireAdmin(request);

    const routeParams = await params;
    routeId = routeParams.id;
    const productId = parseInt(routeParams.id);

    if (isNaN(productId)) {
      return NextResponse.json({
        success: false,
        error: 'Invalid product ID'
      }, { status: 400 });
    }

    const body = await request.json();

    // Validate với Zod
    const validation = validateRequest(body, updateProductSchema);

    if (!validation.valid || !validation.data) {
      return NextResponse.json({
        success: false,
        error: validation.error || 'Dữ liệu không hợp lệ'
      }, { status: 400 });
    }

    const productData = validation.data;

    // Update product
    const updatedProduct = await updateProduct(productId, {
      title: productData.title,
      description: productData.description ?? undefined,
      price: productData.price,
      category: productData.category ?? undefined,
      demoUrl: productData.demoUrl ?? undefined,
      downloadUrl: productData.downloadUrl ?? undefined,
      imageUrl: productData.imageUrl ?? undefined,
      imageUrls: productData.imageUrls ?? undefined,
      detailedDescription: (productData as any).detailedDescription ?? undefined,
      tags: productData.tags ?? undefined,
      isActive: productData.isActive ?? undefined,
      averageRating: productData.averageRating ?? undefined,
      downloadCount: productData.downloadCount ?? undefined,
    });

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
        action: 'UPDATE_PRODUCT',
        targetType: 'product',
        targetId: productId,
        details: { title: productData.title },
        ipAddress: request.headers.get('x-forwarded-for') || undefined,
      });
    } catch (e: any) {
      logger.warn('Failed to log admin action (UPDATE_PRODUCT)', { error: e?.message });
    }

    return NextResponse.json({
      success: true,
      message: 'Product updated successfully',
      product: updatedProduct,
    });
  } catch (error: any) {
    logger.error('Product PUT error', error, { productId: routeId });

    if (error.message?.includes('Unauthorized')) {
      return NextResponse.json({
        success: false,
        error: error.message
      }, { status: 401 });
    }

    return NextResponse.json({
      success: false,
      error: error.message || 'Internal server error'
    }, { status: 500 });
  }
}

/**
 * DELETE /api/products/[id]
 * Delete product (admin only)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let routeId: string | undefined
  try {
    // Rate limiting
    const rateLimitResponse = await checkRateLimitAndRespond(request, 5, 60, 'product-delete');
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    // Require admin
    await requireAdmin(request);

    const routeParams = await params;
    routeId = routeParams.id;
    const productId = parseInt(routeParams.id);

    if (isNaN(productId)) {
      return NextResponse.json({
        success: false,
        error: 'Invalid product ID'
      }, { status: 400 });
    }

    // Check product exists
    const product = await getProductById(productId);

    if (!product) {
      return NextResponse.json({
        success: false,
        error: 'Product not found'
      }, { status: 404 });
    }

    // Delete product
    await deleteProduct(productId);

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
        action: 'DELETE_PRODUCT',
        targetType: 'product',
        targetId: productId,
        details: { title: product.title },
        ipAddress: request.headers.get('x-forwarded-for') || undefined,
      });
    } catch (e: any) {
      logger.warn('Failed to log admin action (DELETE_PRODUCT)', { error: e?.message });
    }

    return NextResponse.json({
      success: true,
      message: 'Product deleted successfully',
    });
  } catch (error: any) {
    logger.error('Product DELETE error', error, { productId: routeId });

    if (error.message?.includes('Unauthorized')) {
      return NextResponse.json({
        success: false,
        error: error.message
      }, { status: 401 });
    }

    return NextResponse.json({
      success: false,
      error: error.message || 'Internal server error'
    }, { status: 500 });
  }
}
