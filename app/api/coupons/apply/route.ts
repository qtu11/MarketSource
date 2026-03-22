import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken, requireEmailVerifiedForUser } from '@/lib/api-auth';
import { getUserIdByEmail, query, queryOne, withTransaction } from '@/lib/database';
import { checkRateLimitAndRespond } from '@/lib/rate-limit';
import { z } from 'zod';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const applyCouponSchema = z.object({
  code: z.string().min(1).max(50),
});

/**
 * POST /api/coupons/apply
 * Áp dụng coupon cho user
 */
export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const rateLimitResponse = await checkRateLimitAndRespond(request, 10, 60, 'coupons-apply');
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    // Require authentication
    const authUser = await verifyFirebaseToken(request);
    if (!authUser) {
      return NextResponse.json({
        success: false,
        error: 'Unauthorized'
      }, { status: 401 });
    }

    const ev = await requireEmailVerifiedForUser(authUser);
    if (ev) return ev;

    const userId = await getUserIdByEmail(authUser.email || '');
    if (!userId) {
      return NextResponse.json(
        {
          success: false,
          error: 'Không tìm thấy tài khoản trong hệ thống. Vui lòng đăng xuất và đăng nhập lại để đồng bộ.',
        },
        { status: 400 }
      );
    }

    const body = await request.json();
    const validation = applyCouponSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({
        success: false,
        error: validation.error.errors[0]?.message || 'Invalid coupon code'
      }, { status: 400 });
    }

    const { code } = validation.data;
    const couponCode = code.toUpperCase().trim();

    // Tìm coupon theo code
    const coupon = await queryOne<any>(`
      SELECT * FROM coupons 
      WHERE code = $1 AND is_active = TRUE
    `, [couponCode]);

    if (!coupon) {
      return NextResponse.json(
        {
          success: false,
          error: 'Coupon không tồn tại hoặc đã bị vô hiệu hóa',
        },
        { status: 400 }
      );
    }

    // Kiểm tra thời gian hiệu lực
    const now = new Date();
    if (coupon.valid_from && new Date(coupon.valid_from) > now) {
      return NextResponse.json({
        success: false,
        error: 'Coupon chưa có hiệu lực'
      }, { status: 400 });
    }

    if (coupon.valid_until && new Date(coupon.valid_until) < now) {
      return NextResponse.json({
        success: false,
        error: 'Coupon đã hết hạn'
      }, { status: 400 });
    }

    // Kiểm tra xem user đã sử dụng coupon này chưa
    const usedCoupon = await queryOne<any>(`
      SELECT * FROM user_coupons 
      WHERE user_id = $1 AND coupon_id = $2
    `, [userId, coupon.id]);

    if (usedCoupon) {
      return NextResponse.json({
        success: false,
        error: 'Bạn đã sử dụng coupon này rồi'
      }, { status: 400 });
    }

    // Kiểm tra giới hạn số lần sử dụng (nếu có)
    if (coupon.usage_limit && coupon.usage_limit > 0) {
      const usageCountResult = await queryOne<any>(`
        SELECT COUNT(*) as count FROM user_coupons WHERE coupon_id = $1
      `, [coupon.id]);

      const usageCount = usageCountResult ? Number(usageCountResult.count) : 0;

      if (usageCount >= coupon.usage_limit) {
        return NextResponse.json({
          success: false,
          error: 'Coupon đã hết lượt sử dụng'
        }, { status: 400 });
      }
    }

    // Lưu vào user_coupons (đánh dấu đã áp dụng)
    try {
      await withTransaction(async (client) => {
        await client.query(`
          INSERT INTO user_coupons (user_id, coupon_id, used_at)
          VALUES ($1, $2, CURRENT_TIMESTAMP)
          ON CONFLICT (user_id, coupon_id) DO UPDATE SET used_at = CURRENT_TIMESTAMP
        `, [userId, coupon.id]);
      });
    } catch (error: any) {
      if (error.code === '42P01' || error.message?.includes('does not exist')) {
        logger.warn('user_coupons table does not exist, skipping tracking');
      } else {
        throw error;
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Coupon đã được áp dụng thành công',
      coupon: {
        id: coupon.id,
        code: coupon.code,
        name: coupon.name || coupon.title || coupon.code,
        description: coupon.description || '',
        type: coupon.discount_type === 'percentage' ? 'percentage' : 'fixed',
        discount_value: coupon.discount_value || 0,
        min_purchase_amount: coupon.min_purchase_amount || 0,
        max_discount_amount: coupon.max_discount_amount || null,
      }
    });
  } catch (error: any) {
    logger.error('Coupons apply POST error', error, { endpoint: '/api/coupons/apply' });

    return NextResponse.json({
      success: false,
      error: error.message || 'Internal server error'
    }, { status: 500 });
  }
}
