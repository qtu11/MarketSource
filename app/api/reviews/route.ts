import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken, validateRequest, getClientIP } from '@/lib/api-auth';
import { query, queryOne, getUserIdByEmail, createReview, getReviews, getProductAverageRating, pool } from '@/lib/database';
import { z } from 'zod';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const reviewSchema = z.object({
  productId: z.number().int().positive(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(5000).optional(),
});

export async function POST(request: NextRequest) {
  try {
    // ✅ FIX: Thêm rate limiting để tránh spam reviews
    const { checkRateLimitAndRespond } = await import('@/lib/rate-limit');
    const rateLimitResponse = await checkRateLimitAndRespond(request, 5, 60, 'review-post');
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const authUser = await verifyFirebaseToken(request);
    if (!authUser) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    
    const body = await request.json();
    
    // Validate với Zod
    const validation = validateRequest(body, reviewSchema);
    
    if (!validation.valid || !validation.data) {
      return NextResponse.json({
        success: false,
        error: validation.error || 'Dữ liệu không hợp lệ'
      }, { status: 400 });
    }
    
    const { productId, rating, comment } = validation.data;
    
    // Get user_id từ email
    const userId = await getUserIdByEmail(authUser.email || '');
    
    if (!userId) {
      return NextResponse.json({ success: false, error: 'User not found in database' }, { status: 404 });
    }
    
    // ✅ FIX: Enforce user phải mua sản phẩm trước khi review
    const purchaseCheck = await query<any>(
      'SELECT id FROM purchases WHERE user_id = $1 AND product_id = $2',
      [userId, productId]
    );
    if (purchaseCheck.length === 0) {
      return NextResponse.json({ 
        success: false, 
        error: 'Bạn cần mua sản phẩm trước khi đánh giá' 
      }, { status: 403 });
    }
    
    // Insert review
    const result = await createReview({
      userId,
      productId,
      rating,
      comment: comment || null,
      ipAddress: getClientIP(request),
    });

    // Audit log
    try {
      const { logAdminAction } = await import('@/lib/audit-logger');
      await logAdminAction({
        adminId: userId,
        adminEmail: authUser.email || 'user',
        action: 'USER_CREATE_REVIEW',
        targetType: 'product',
        targetId: String(productId),
        details: { rating, hasComment: !!comment },
        ipAddress: getClientIP(request),
      });
    } catch { /* ignore */ }
    
    return NextResponse.json({
      success: true,
      review: {
        id: result.id,
        userId,
        productId,
        rating,
        comment: comment || null,
        createdAt: result.createdAt,
        updatedAt: result.updatedAt
      }
    });
  } catch (error: any) {
    logger.error('Review POST error', error);
    
    // Handle unique constraint violation (PostgreSQL code 23505)
    if (error.code === '23505') {
      return NextResponse.json({
        success: false,
        error: 'Bạn đã đánh giá sản phẩm này rồi'
      }, { status: 400 });
    }
    
    return NextResponse.json({ success: false, error: error.message || 'Internal server error' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    // ✅ FIX: Thêm rate limiting
    const { checkRateLimitAndRespond } = await import('@/lib/rate-limit');
    const rateLimitResponse = await checkRateLimitAndRespond(request, 30, 10, 'review-get');
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const { searchParams } = new URL(request.url);
    const productIdParam = searchParams.get('productId');
    const userIdParam = searchParams.get('userId');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
    const offset = Math.max(parseInt(searchParams.get('offset') || '0'), 0);
    
    const filters: any = {
      limit,
      offset,
    };
    
    if (productIdParam) {
      filters.productId = parseInt(productIdParam);
    }
    
    if (userIdParam) {
      filters.userId = parseInt(userIdParam);
    }
    
    const reviews = await getReviews(filters);
    
    // Get average rating nếu có productId
    let averageRating = null;
    if (productIdParam) {
      const ratingData = await getProductAverageRating(parseInt(productIdParam));
      
      // Get min/max từ reviews
      const minMaxResult = await queryOne<any>(
        'SELECT MIN(rating) as min_rating, MAX(rating) as max_rating FROM reviews WHERE product_id = $1',
        [parseInt(productIdParam)]
      );
      
      averageRating = {
        average: ratingData.average_rating,
        count: ratingData.total_ratings,
        min: minMaxResult?.min_rating ? parseInt(minMaxResult.min_rating) : 0,
        max: minMaxResult?.max_rating ? parseInt(minMaxResult.max_rating) : 0
      };
    }
    
    return NextResponse.json({
      success: true,
      reviews,
      averageRating,
      pagination: {
        limit,
        offset,
        total: reviews.length
      }
    });
  } catch (error: any) {
    logger.error('Review GET error', error, { url: request.url });
    return NextResponse.json({ success: false, error: error.message || 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const authUser = await verifyFirebaseToken(request);
    if (!authUser?.email) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const userId = await getUserIdByEmail(authUser.email);
    if (!userId) {
      return NextResponse.json({ success: false, error: 'User not found in database' }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const reviewId = Number(body?.reviewId);

    if (!reviewId) {
      return NextResponse.json({ success: false, error: 'Missing reviewId' }, { status: 400 });
    }

    const result = await pool.query(
      'DELETE FROM reviews WHERE id = $1 AND user_id = $2',
      [reviewId, userId]
    );

    const affectedRows = result.rowCount || 0;
    if (affectedRows === 0) {
      return NextResponse.json({ success: false, error: 'Review not found or unauthorized' }, { status: 404 });
    }

    return NextResponse.json({ success: true, reviewId });
  } catch (error: any) {
    logger.error('Review DELETE error', error);
    return NextResponse.json({ success: false, error: error.message || 'Internal server error' }, { status: 500 });
  }
}
