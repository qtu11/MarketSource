import { NextRequest, NextResponse } from 'next/server'
import {
  getDeposits,
  createDeposit,
  updateDepositStatus,
  approveDepositAndUpdateBalance,
  getUserIdByEmail,
  getUserById,
  queryOne,
  createNotification,
  normalizeUserId,
} from '@/lib/database'
import { verifyFirebaseToken, requireAdmin, validateRequest, requireEmailVerifiedForUser } from '@/lib/api-auth'
import { checkRateLimitAndRespond } from '@/lib/rate-limit'
import { depositSchema, updateDepositStatusSchema } from '@/lib/validation-schemas'
import { notifyDepositRequest } from '@/lib/notifications'
import { logger } from '@/lib/logger'

export const runtime = 'nodejs'

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const rateLimitResponse = await checkRateLimitAndRespond(request, 30, 60, 'deposits-get');
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    const authUser = await verifyFirebaseToken(request);
    const isAdmin = await requireAdmin(request).catch(() => false);

    if (authUser && !isAdmin) {
      const ev = await requireEmailVerifiedForUser(authUser);
      if (ev) return ev;
    }

    if (!authUser && !isAdmin) {
      return NextResponse.json({
        success: false,
        error: 'Unauthorized'
      }, { status: 401 });
    }

    let dbUserId: number | undefined = undefined;
    if (isAdmin) {
      if (userId) {
        if (!isNaN(parseInt(userId))) {
          dbUserId = parseInt(userId);
        } else {
          dbUserId = await getUserIdByEmail(userId) || undefined;
        }
      }
    } else if (authUser) {
      dbUserId = await getUserIdByEmail(authUser.email || '') || undefined;
      
      if (!dbUserId) {
        return NextResponse.json({ success: false, error: 'User profile not found' }, { status: 404 });
      }
    }

    const deposits = await getDeposits(dbUserId);

    return NextResponse.json({
      success: true,
      deposits
    });
  } catch (error: any) {
    logger.error('Deposits API error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Internal server error'
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const rateLimitIp = await checkRateLimitAndRespond(request, 40, 60, 'deposits-post-ip')
    if (rateLimitIp) return rateLimitIp

    const authUser = await verifyFirebaseToken(request);
    if (!authUser) {
      return NextResponse.json({
        success: false,
        error: 'Unauthorized'
      }, { status: 401 });
    }

    const evPost = await requireEmailVerifiedForUser(authUser);
    if (evPost) return evPost;

    const dbUserIdForRl = await normalizeUserId(authUser.uid, authUser.email || undefined)
    if (!dbUserIdForRl) {
      return NextResponse.json({ success: false, error: 'User profile not found' }, { status: 404 })
    }

    const rateLimitUser = await checkRateLimitAndRespond(request, 5, 60, 'deposits-post', dbUserIdForRl)
    if (rateLimitUser) return rateLimitUser

    const body = await request.json();

    const validation = validateRequest(body, depositSchema);

    if (!validation.valid || !validation.data) {
      return NextResponse.json({
        success: false,
        error: validation.error || 'Dữ liệu không hợp lệ'
      }, { status: 400 });
    }

    const depositData = validation.data;

    const dbUserIdToken = authUser.uid;

    const effectiveTxnId = (
      depositData.transactionId?.trim() ||
      depositData.idempotencyKey?.trim() ||
      ''
    )

    if (effectiveTxnId) {
      const existingDeposit = await queryOne<any>(
        'SELECT id FROM deposits WHERE transaction_id = $1',
        [effectiveTxnId]
      );
      if (existingDeposit) {
        return NextResponse.json({
          success: false,
          error: 'Mã giao dịch (Transaction ID) này đã tồn tại trong hệ thống. Vui lòng kiểm tra lại.'
        }, { status: 400 });
      }
    }

    const result = await createDeposit({
      userId: dbUserIdToken,
      amount: depositData.amount,
      method: depositData.method,
      transactionId: effectiveTxnId,
      userEmail: authUser.email || undefined,
      userName: undefined,
      ipAddress: depositData.ipAddress,
      deviceInfo: depositData.deviceInfo
    });

    const depositRow = await queryOne<any>(
      `SELECT d.*, u.email, u.username
       FROM deposits d
       LEFT JOIN users u ON d.user_id = u.id
       WHERE d.id = $1`,
      [result.id],
    );

    const notifyPayload = {
      userName: depositData.userName || authUser.email?.split('@')[0] || 'User',
      userEmail: authUser.email || undefined,
      amount: depositData.amount,
      method: depositData.method,
      transactionId: effectiveTxnId,
      ipAddress: depositData.ipAddress,
      deviceInfo: depositData.deviceInfo,
    };

    try {
      await notifyDepositRequest(notifyPayload);
    } catch (error: any) {
      logger.warn('Failed to notify deposit request', { error: error?.message });
    }

    return NextResponse.json({
      success: true,
      message: 'Deposit request received',
      deposit: depositRow || {
        id: result.id,
        timestamp: result.timestamp
      },
      depositId: result.id
    });
  } catch (error: any) {
    logger.error('Deposit POST error', error, { endpoint: '/api/deposits' });
    return NextResponse.json({
      success: false,
      error: error.message || 'Internal server error'
    }, { status: 500 });
  }
}

export async function PUT(request: NextRequest): Promise<Response> {
  try {
    const rateLimitResponse = await checkRateLimitAndRespond(request, 20, 10, 'deposits-put');
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const admin = await requireAdmin(request);

    const body = await request.json();

    const validation = validateRequest(body, updateDepositStatusSchema);

    if (!validation.valid || !validation.data) {
      return NextResponse.json({
        success: false,
        error: validation.error || 'Dữ liệu không hợp lệ'
      }, { status: 400 });
    }

    const updateData = validation.data;

    if (updateData.status === 'approved') {
      const deposit = await queryOne<any>(
        'SELECT id, user_id, amount, status FROM deposits WHERE id = $1',
        [Number(updateData.depositId)]
      );

      if (!deposit) {
        return NextResponse.json({
          success: false,
          error: 'Deposit not found'
        }, { status: 404 });
      }

      if (deposit.status === 'approved') {
        return NextResponse.json({
          success: false,
          error: 'Deposit đã được duyệt trước đó'
        }, { status: 400 });
      }

      const result = await approveDepositAndUpdateBalance(
        Number(updateData.depositId),
        Number(deposit.user_id),
        Number(deposit.amount),
        updateData.approvedBy || (admin as any).email || 'admin'
      );

      const { logAdminAction } = await import('@/lib/audit-logger');
      const adminId = (admin as any).userId || (admin as any).uid || 0;
      await logAdminAction({
        adminId: typeof adminId === 'number' ? adminId : 0,
        adminEmail: (admin as any).email || 'unknown',
        action: 'APPROVE_DEPOSIT',
        targetType: 'deposit',
        targetId: updateData.depositId,
        details: { amount: deposit.amount, userId: deposit.user_id },
        ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown'
      });

      logger.info('Deposit approved and balance updated', {
        depositId: updateData.depositId,
        userId: deposit.user_id,
        amount: deposit.amount,
        newBalance: result.newBalance,
      });

      try {
        await createNotification({
          userId: Number(deposit.user_id),
          type: 'deposit_approved',
          message: `Yêu cầu nạp tiền ${Number(deposit.amount).toLocaleString('vi-VN')}đ đã được duyệt. Số dư: ${result.newBalance.toLocaleString('vi-VN')}đ`,
          isRead: false,
        });
      } catch (notifErr) {
        logger.warn('Failed to create deposit notification', { error: notifErr });
      }

      return NextResponse.json({
        success: true,
        message: 'Deposit approved and balance updated',
        newBalance: result.newBalance,
      });
    } else {
      await updateDepositStatus(
        Number(updateData.depositId),
        updateData.status,
        updateData.approvedBy
      );

      return NextResponse.json({
        success: true,
        message: 'Deposit status updated'
      });
    }
  } catch (error: any) {
    logger.error('Deposit PUT error', error, { endpoint: '/api/deposits' });

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
