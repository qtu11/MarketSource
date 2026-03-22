

import { NextRequest, NextResponse } from 'next/server'
import { getWithdrawals, createWithdrawal, updateWithdrawalStatus, getUserIdByEmail, getUserById, queryOne, normalizeUserId } from '@/lib/database'
import { verifyFirebaseToken, requireAdmin, validateRequest, requireEmailVerifiedForUser } from '@/lib/api-auth'
import { checkRateLimitAndRespond } from '@/lib/rate-limit'
import { withdrawalSchema, updateWithdrawalStatusSchema } from '@/lib/validation-schemas'
import { notifyWithdrawalRequest } from '@/lib/notifications'
import { logger } from '@/lib/logger'

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

    // Nếu có userId param và không phải admin → verify chính là user đó
    // ✅ FIX: So sánh đúng cách - cần convert userId từ DB sang uid hoặc ngược lại
    if (userId && authUser && !isAdmin) {
      const dbUserId = await getUserIdByEmail(authUser.email || '');
      const param = String(userId).trim();
      const sameNumericId =
        dbUserId !== null && /^\d+$/.test(param) && String(dbUserId) === param;
      const sameProviderUid = authUser.uid === param;
      if (!sameNumericId && !sameProviderUid) {
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
    const rateLimitIp = await checkRateLimitAndRespond(request, 40, 60, 'withdrawals-post-ip')
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

    const rateLimitUser = await checkRateLimitAndRespond(request, 5, 60, 'withdrawals-post', dbUserIdForRl)
    if (rateLimitUser) return rateLimitUser

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

    // ✅ SECURITY FIX: KHÔNG tin userId từ client. Luôn lấy từ authUser server-side.
    const dbUserIdToken = authUser.uid;

    // Create withdrawal
    const result = await createWithdrawal({
      userId: dbUserIdToken, // Luôn dùng UID từ token
      amount: withdrawalData.amount,
      bankName: withdrawalData.bankName,
      accountNumber: withdrawalData.accountNumber,
      accountName: withdrawalData.accountName,
      userEmail: authUser.email || undefined,
      idempotencyKey: withdrawalData.idempotencyKey?.trim() || undefined,
      ipAddress: withdrawalData.ipAddress,
      deviceInfo: withdrawalData.deviceInfo,
    });

    // Get the created withdrawal để trả về đầy đủ thông tin
    // ✅ FIX: Query chỉ withdrawal vừa tạo thay vì query tất cả
    const withdrawalRow = await queryOne<any>(
      `SELECT w.*, u.email, u.username
       FROM withdrawals w
       LEFT JOIN users u ON w.user_id = u.id
       WHERE w.id = $1`,
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

    const errorMsg = error.message || '';
    const isBusinessError = 
      errorMsg.includes('Insufficient balance') ||
      errorMsg.includes('Số dư không đủ') ||
      errorMsg.includes('You have a pending withdrawal request') ||
      errorMsg.includes('chờ duyệt') ||
      errorMsg.includes('Số tiền rút') ||
      errorMsg.includes('tối thiểu') ||
      errorMsg.includes('tối đa') ||
      errorMsg.includes('Vượt giới hạn') ||
      errorMsg.includes('Ngân hàng') ||
      errorMsg.includes('tài khoản') ||
      errorMsg.includes('không được để trống');

    if (isBusinessError) {
      return NextResponse.json({
        success: false,
        error: errorMsg.replace('Insufficient balance', 'Số dư không đủ để thực hiện rút tiền')
      }, { status: 400 });
    }

    return NextResponse.json({
      success: false, // fallback 500
      error: 'Internal server error'
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
    if (updateData.status === 'approved' || updateData.status === 'rejected') {
      const withdrawal = await queryOne<any>(
        'SELECT id, user_id, amount, status FROM withdrawals WHERE id = $1',
        [Number(updateData.withdrawalId)]
      );

      if (!withdrawal) {
        return NextResponse.json({
          success: false,
          error: 'Withdrawal not found'
        }, { status: 404 });
      }

      if (withdrawal.status === 'approved' && updateData.status === 'approved') {
        return NextResponse.json({
          success: false,
          error: 'Withdrawal đã được duyệt trước đó'
        }, { status: 400 });
      }

      // ✅ CRITICAL FIX: Dùng updateWithdrawalStatus duy nhất để xử lý cả status và balance
      await updateWithdrawalStatus(
        Number(updateData.withdrawalId),
        updateData.status as 'approved' | 'rejected' | 'pending',
        updateData.approvedBy || 'admin'
      );

      logger.info('Withdrawal status updated', {
        withdrawalId: updateData.withdrawalId,
        status: updateData.status,
        userId: withdrawal.user_id,
        amount: withdrawal.amount,
      });

      // Tạo notification cho user
      try {
        const { createNotification } = await import('@/lib/database');
        await createNotification({
          userId: Number(withdrawal.user_id),
          type: updateData.status === 'approved' ? 'withdrawal_approved' : 'withdrawal_rejected',
          message: updateData.status === 'approved' 
            ? `Yêu cầu rút ${Number(withdrawal.amount).toLocaleString('vi-VN')}đ đã được duyệt.` 
            : `Yêu cầu rút ${Number(withdrawal.amount).toLocaleString('vi-VN')}đ đã bị từ chối. Số tiền đã được hoàn lại vào ví.`,
          isRead: false,
        });
      } catch (notifErr) {
        logger.warn('Failed to create withdrawal notification', { error: notifErr });
      }

      // ✅ NEW: Gửi email khi duyệt/từ chối
      try {
        const user = await getUserById(Number(withdrawal.user_id));
        if (user?.email) {
          const { sendWithdrawalApprovalEmail, sendWithdrawalRejectionEmail } = await import('@/lib/email');
          if (updateData.status === 'approved') {
            const userFull = await getUserById(Number(withdrawal.user_id)); // Re-fetch to get new balance if needed, but normally bal is in lib/database
            // Get new balance to be accurate
            const balanceRow = await queryOne<any>('SELECT balance FROM users WHERE id = $1', [Number(withdrawal.user_id)]);
            await sendWithdrawalApprovalEmail(user.email, Number(withdrawal.amount), Number(balanceRow?.balance || 0));
          } else {
            await sendWithdrawalRejectionEmail(user.email, Number(withdrawal.amount));
          }
        }
      } catch (emailErr) {
        logger.warn('Failed to send withdrawal email', { error: emailErr });
      }

      return NextResponse.json({
        success: true,
        message: `Withdrawal ${updateData.status} successfully`,
      });
    } else {
      // Pending → chỉ đổi status cơ bản
      await updateWithdrawalStatus(
        Number(updateData.withdrawalId),
        'pending',
        updateData.approvedBy
      );

      return NextResponse.json({
        success: true,
        message: 'Withdrawal moved to pending'
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
