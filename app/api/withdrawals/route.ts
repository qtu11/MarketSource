

import { NextRequest, NextResponse } from 'next/server'
import { getWithdrawals, createWithdrawal, updateWithdrawalStatus } from '@/lib/database-mysql'
import { verifyFirebaseToken, requireAdmin, validateRequest } from '@/lib/api-auth'
import { checkRateLimitAndRespond } from '@/lib/rate-limit'
import { withdrawalSchema, updateWithdrawalStatusSchema } from '@/lib/validation-schemas'
import { notifyWithdrawalRequest } from '@/lib/notifications'
import { logger } from '@/lib/logger'
import { getUserIdByEmail, getUserByIdMySQL, queryOne } from '@/lib/database-mysql'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest): Promise<Response> {
  try {
    // Rate limiting
    const rateLimitResponse = await checkRateLimitAndRespond(request, 10, 10, 'withdrawals-get');
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    // Verify auth - user chỉ xem được withdrawals của mình, admin xem được tất cả
    const authUser = await verifyFirebaseToken(request);
    const isAdmin = await requireAdmin(request).catch(() => false);

    if (!authUser && !isAdmin) {
      return NextResponse.json({
        success: false,
        error: 'Unauthorized'
      }, { status: 401 });
    }

    // Nếu có userId param và không phải admin → verify chính là user đó
    // ✅ FIX: So sánh đúng cách - cần convert userId từ DB sang uid hoặc ngược lại
    if (userId && authUser && !isAdmin) {
      const dbUserId = await getUserIdByEmail(authUser.email || '');
      const userIdNum = parseInt(userId);

      if (dbUserId !== userIdNum && authUser.uid !== userId) {
        return NextResponse.json({
          success: false,
          error: 'Unauthorized: Can only view your own withdrawals'
        }, { status: 403 });
      }
    }

    // ✅ SECURITY FIX: Nếu không phải admin, bắt buộc phải lọc theo userId của chính người dùng đó
    // Đảm bảo user thường không thể xem withdrawals của người khác (IDOR protection)
    let dbUserId: number | undefined = undefined;
    if (isAdmin) {
      // Admin có thể xem tất cả hoặc xem theo userId cụ thể nếu có param
      if (userId) {
        if (!isNaN(parseInt(userId))) {
          dbUserId = parseInt(userId);
        } else {
          dbUserId = await getUserIdByEmail(userId) || undefined;
        }
      }
    } else if (authUser) {
      // User thường: Luôn chỉ lấy withdrawals của chính mình
      dbUserId = await getUserIdByEmail(authUser.email || '') || undefined;

      if (!dbUserId) {
        return NextResponse.json({ success: false, error: 'User profile not found' }, { status: 404 });
      }
    }

    const withdrawals = await getWithdrawals(dbUserId);

    return NextResponse.json({
      success: true,
      withdrawals
    });
  } catch (error: any) {
    logger.error('Withdrawals API error:', error as Error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Internal server error'
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    // ✅ FIX: Thêm rate limiting cho withdrawal POST (tránh spam withdrawals)
    const rateLimitResponse = await checkRateLimitAndRespond(request, 5, 60, 'withdrawals-post');
    if (rateLimitResponse) return rateLimitResponse;

    // Require authentication
    const authUser = await verifyFirebaseToken(request);
    if (!authUser) {
      return NextResponse.json({
        success: false,
        error: 'Unauthorized'
      }, { status: 401 });
    }

    const body = await request.json();

    // Validate request với Zod
    const validation = validateRequest(body, withdrawalSchema);

    if (!validation.valid || !validation.data) {
      return NextResponse.json({
        success: false,
        error: validation.error || 'Dữ liệu không hợp lệ'
      }, { status: 400 });
    }

    const withdrawalData = validation.data;

    // Verify userId matches authenticated user
    // ✅ FIX: So sánh đúng kiểu dữ liệu (string vs number)
    if (withdrawalData.userId) {
      const withdrawalUserIdStr = withdrawalData.userId.toString();
      // Nếu là number (DB ID), cần check bằng email
      if (!isNaN(Number(withdrawalData.userId))) {
        const user = await getUserByIdMySQL(Number(withdrawalData.userId));
        if (user && user.email !== authUser.email) {
          return NextResponse.json({
            success: false,
            error: 'Unauthorized: User ID mismatch'
          }, { status: 403 });
        }
      } else {
        // Là string (Firebase UID), so sánh trực tiếp
        if (withdrawalUserIdStr !== authUser.uid) {
          return NextResponse.json({
            success: false,
            error: 'Unauthorized: User ID mismatch'
          }, { status: 403 });
        }
      }
    }

    // Create withdrawal
    const result = await createWithdrawal({
      userId: withdrawalData.userId || authUser.uid,
      amount: withdrawalData.amount,
      bankName: withdrawalData.bankName,
      accountNumber: withdrawalData.accountNumber,
      accountName: withdrawalData.accountName,
      userEmail: authUser.email || undefined
    });

    // Get the created withdrawal để trả về đầy đủ thông tin
    // ✅ FIX: Query chỉ withdrawal vừa tạo thay vì query tất cả
    const withdrawalRow = await queryOne<any>(
      `SELECT w.*, u.email, u.username
       FROM withdrawals w
       LEFT JOIN users u ON w.user_id = u.id
       WHERE w.id = ?`,
      [result.id],
    );

    try {
      await notifyWithdrawalRequest({
        userName: authUser.email?.split('@')[0],
        userEmail: authUser.email || undefined,
        amount: withdrawalData.amount,
        bankName: withdrawalData.bankName,
        accountNumber: withdrawalData.accountNumber,
        accountName: withdrawalData.accountName,
        ipAddress: withdrawalData.ipAddress,
        deviceInfo: withdrawalData.deviceInfo,
      });
    } catch (error: any) {
      logger.warn('Failed to notify withdrawal request', { error: error?.message });
    }

    return NextResponse.json({
      success: true,
      message: 'Withdrawal request received',
      withdrawal: withdrawalRow || {
        id: result.id,
        created_at: result.createdAt
      },
      withdrawalId: result.id
    });
  } catch (error: any) {
    logger.error('Withdrawal POST error', error as Error, { endpoint: '/api/withdrawals' });

    if (error.message?.includes('Insufficient balance')) {
      return NextResponse.json({
        success: false,
        error: 'Số dư không đủ để thực hiện rút tiền'
      }, { status: 400 });
    }

    return NextResponse.json({
      success: false,
      error: error.message || 'Internal server error'
    }, { status: 500 });
  }
}

export async function PUT(request: NextRequest): Promise<Response> {
  try {
    // Rate limiting
    const rateLimitResponse = await checkRateLimitAndRespond(request, 20, 10, 'withdrawals-put');
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    // Require admin for status updates
    await requireAdmin(request);

    const body = await request.json();

    // Validate với Zod
    const validation = validateRequest(body, updateWithdrawalStatusSchema);

    if (!validation.valid || !validation.data) {
      return NextResponse.json({
        success: false,
        error: validation.error || 'Dữ liệu không hợp lệ'
      }, { status: 400 });
    }

    const updateData = validation.data;

    // ✅ BUG #1 FIX: Phân nhánh approve/reject đúng cách
    if (updateData.status === 'approved') {
      const withdrawal = await queryOne<any>(
        'SELECT id, user_id, amount, status FROM withdrawals WHERE id = ?',
        [Number(updateData.withdrawalId)]
      );

      if (!withdrawal) {
        return NextResponse.json({
          success: false,
          error: 'Withdrawal not found'
        }, { status: 404 });
      }

      if (withdrawal.status === 'approved') {
        return NextResponse.json({
          success: false,
          error: 'Withdrawal đã được duyệt trước đó'
        }, { status: 400 });
      }

      // ✅ CRITICAL FIX: Gọi hàm trừ balance thay vì chỉ đổi status
      const { approveWithdrawalAndUpdateBalanceMySQL } = await import('@/lib/database-mysql');
      const result = await approveWithdrawalAndUpdateBalanceMySQL(
        Number(updateData.withdrawalId),
        Number(withdrawal.user_id),
        Number(withdrawal.amount),
        updateData.approvedBy || 'admin'
      );

      logger.info('Withdrawal approved and balance deducted', {
        withdrawalId: updateData.withdrawalId,
        userId: withdrawal.user_id,
        amount: withdrawal.amount,
        newBalance: result.newBalance,
      });

      // Tạo notification cho user
      try {
        const { createNotification } = await import('@/lib/database-mysql');
        await createNotification({
          userId: Number(withdrawal.user_id),
          type: 'withdrawal_approved',
          message: `Yêu cầu rút ${Number(withdrawal.amount).toLocaleString('vi-VN')}đ đã được duyệt. Số dư: ${result.newBalance.toLocaleString('vi-VN')}đ`,
          isRead: false,
        });
      } catch (notifErr) {
        logger.warn('Failed to create withdrawal notification', { error: notifErr });
      }

      return NextResponse.json({
        success: true,
        message: 'Withdrawal approved and balance updated',
        newBalance: result.newBalance,
      });
    } else {
      // Reject hoặc pending → chỉ đổi status
      await updateWithdrawalStatus(
        Number(updateData.withdrawalId),
        updateData.status,
        updateData.approvedBy
      );

      return NextResponse.json({
        success: true,
        message: 'Withdrawal status updated'
      });
    }
  } catch (error: any) {
    logger.error('Withdrawal PUT error', error as Error, { endpoint: '/api/withdrawals' });

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
