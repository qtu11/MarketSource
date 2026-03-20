import { NextRequest, NextResponse } from 'next/server'
import { getDeposits, createDeposit, updateDepositStatus } from '@/lib/database-mysql'
import { verifyFirebaseToken, requireAdmin, validateRequest } from '@/lib/api-auth'
import { checkRateLimitAndRespond } from '@/lib/rate-limit'
import { depositSchema, updateDepositStatusSchema } from '@/lib/validation-schemas'
import { notifyDepositRequest } from '@/lib/notifications'
import { logger } from '@/lib/logger'
import { getUserIdByEmail, getUserByIdMySQL, queryOne } from '@/lib/database-mysql'

export const runtime = 'nodejs'

export async function GET(request: NextRequest): Promise<Response> {
  try {
    // Rate limiting — ✅ SECURITY FIX: Giảm từ 200 xuống 30 (chống scraping)
    const rateLimitResponse = await checkRateLimitAndRespond(request, 30, 60, 'deposits-get');
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    // Verify auth - user chỉ xem được deposits của mình, admin xem được tất cả
    const authUser = await verifyFirebaseToken(request);
    const isAdmin = await requireAdmin(request).catch(() => false);

    if (!authUser && !isAdmin) {
      return NextResponse.json({
        success: false,
        error: 'Unauthorized'
      }, { status: 401 });
    }

    // ✅ SECURITY FIX: Nếu không phải admin, bắt buộc phải lọc theo userId của chính người dùng đó
    // Đảm bảo user thường không thể xem deposits của người khác bằng cách bỏ trống userId param (IDOR)
    let dbUserId: number | undefined = undefined;
    if (isAdmin) {
      if (userId) {
        if (!isNaN(parseInt(userId))) {
          dbUserId = parseInt(userId);
        } else {
          dbUserId = await getUserIdByEmail(userId) || undefined; // search theo email nếu userId là string
        }
      }
    } else if (authUser) {
      // User thường: Luôn chỉ lấy deposits của chính mình
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
    // ✅ BUG #5 FIX: Rate limiting cho deposit POST
    const rateLimitResponse = await checkRateLimitAndRespond(request, 5, 60, 'deposits-post');
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
    const validation = validateRequest(body, depositSchema);

    if (!validation.valid || !validation.data) {
      return NextResponse.json({
        success: false,
        error: validation.error || 'Dữ liệu không hợp lệ'
      }, { status: 400 });
    }

    const depositData = validation.data;

    // ✅ SECURITY FIX: KHÔNG tin userId từ client. Luôn lấy từ authUser server-side.
    const dbUserIdToken = authUser.uid;

    // ✅ BUG #4 HARD FIX: Strictly check for duplicate transaction ID
    if (depositData.transactionId) {
      const existingDeposit = await queryOne<any>(
        'SELECT id FROM deposits WHERE transaction_id = ?',
        [depositData.transactionId]
      );
      if (existingDeposit) {
        return NextResponse.json({
          success: false,
          error: 'Mã giao dịch (Transaction ID) này đã tồn tại trong hệ thống. Vui lòng kiểm tra lại.'
        }, { status: 400 });
      }
    }

    // Create deposit
    const result = await createDeposit({
      userId: dbUserIdToken, // Luôn dùng UID từ token
      amount: depositData.amount,
      method: depositData.method,
      transactionId: depositData.transactionId,
      userEmail: authUser.email || undefined,
      userName: undefined
    });

    // Get the created deposit để trả về đầy đủ thông tin
    // ✅ FIX: Query chỉ deposit vừa tạo thay vì query tất cả
    const depositRow = await queryOne<any>(
      `SELECT d.*, u.email, u.username
       FROM deposits d
       LEFT JOIN users u ON d.user_id = u.id
       WHERE d.id = ?`,
      [result.id],
    );

    const notifyPayload = {
      userName: depositData.userName || authUser.email?.split('@')[0] || 'User',
      userEmail: authUser.email || undefined,
      amount: depositData.amount,
      method: depositData.method,
      transactionId: depositData.transactionId,
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
    // Rate limiting
    const rateLimitResponse = await checkRateLimitAndRespond(request, 20, 10, 'deposits-put');
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    // Require admin for status updates
    const admin = await requireAdmin(request);

    const body = await request.json();

    // Validate với Zod
    const validation = validateRequest(body, updateDepositStatusSchema);

    if (!validation.valid || !validation.data) {
      return NextResponse.json({
        success: false,
        error: validation.error || 'Dữ liệu không hợp lệ'
      }, { status: 400 });
    }

    const updateData = validation.data;

    // ✅ FIX: Khi approve, dùng hàm approveDepositAndUpdateBalance để cộng balance
    if (updateData.status === 'approved') {
      // Lấy thông tin deposit để biết userId và amount
      const deposit = await queryOne<any>(
        'SELECT id, user_id, amount, status FROM deposits WHERE id = ?',
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

      const { approveDepositAndUpdateBalanceMySQL } = await import('@/lib/database-mysql');
      const result = await approveDepositAndUpdateBalanceMySQL(
        Number(updateData.depositId),
        Number(deposit.user_id),
        Number(deposit.amount),
        updateData.approvedBy || (admin as any).email || 'admin'
      );

      // ✅ BUG #8 FIX: Log admin action
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

      // ✅ FIX: Tạo notification cho user khi deposit được approve
      try {
        const { createNotification } = await import('@/lib/database-mysql');
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
      // Reject hoặc pending → chỉ đổi status, không cộng balance
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
