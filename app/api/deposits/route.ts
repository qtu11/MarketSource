import { NextRequest, NextResponse } from 'next/server'
import { getDeposits, createDeposit, updateDepositStatus } from '@/lib/database-mysql'
import { verifyFirebaseToken, requireAdmin, validateRequest } from '@/lib/api-auth'
import { checkRateLimitAndRespond } from '@/lib/rate-limit'
import { depositSchema, updateDepositStatusSchema } from '@/lib/validation-schemas'
import { notifyDepositRequest } from '@/lib/server-notifications'
import { logger } from '@/lib/logger'
import { getUserIdByEmail, getUserByIdMySQL, queryOne } from '@/lib/database-mysql'

export const runtime = 'nodejs'

export async function GET(request: NextRequest): Promise<Response> {
  try {
    // Rate limiting
    const rateLimitResponse = await checkRateLimitAndRespond(request, 10, 10, 'deposits-get');
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

    // Nếu có userId param và không phải admin → verify chính là user đó
    // ✅ FIX: So sánh đúng cách - cần convert userId từ DB sang uid hoặc ngược lại
    if (userId && authUser && !isAdmin) {
      // userId từ query param có thể là number (PostgreSQL ID) hoặc string (Firebase UID)
      // Cần check bằng cách so sánh email hoặc convert userId sang uid
      const dbUserId = await getUserIdByEmail(authUser.email || '');
      const userIdNum = parseInt(userId);

      if (dbUserId !== userIdNum && authUser.uid !== userId) {
        return NextResponse.json({
          success: false,
          error: 'Unauthorized: Can only view your own deposits'
        }, { status: 403 });
      }
    }

    // ✅ FIX: Nếu userId là string (uid), cần convert sang number (DB ID)
    let dbUserId: number | undefined = undefined;
    if (userId) {
      if (isNaN(parseInt(userId))) {
        // userId là string (uid), cần tìm DB ID
        dbUserId = await getUserIdByEmail(authUser?.email || '') || undefined;
      } else {
        dbUserId = parseInt(userId);
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

    // Verify userId matches authenticated user
    // ✅ FIX: So sánh đúng kiểu dữ liệu (string vs number)
    if (depositData.userId) {
      const depositUserIdStr = depositData.userId.toString();
      // Nếu là number (DB ID), cần check bằng email
      if (!isNaN(Number(depositData.userId))) {
        const user = await getUserByIdMySQL(Number(depositData.userId));
        if (user && user.email !== authUser.email) {
          return NextResponse.json({
            success: false,
            error: 'Unauthorized: User ID mismatch'
          }, { status: 403 });
        }
      } else {
        // Là string (Firebase UID), so sánh trực tiếp
        if (depositUserIdStr !== authUser.uid) {
          return NextResponse.json({
            success: false,
            error: 'Unauthorized: User ID mismatch'
          }, { status: 403 });
        }
      }
    }

    // Create deposit
    const result = await createDeposit({
      userId: depositData.userId || authUser.uid,
      amount: depositData.amount,
      method: depositData.method,
      transactionId: depositData.transactionId,
      userEmail: authUser.email || undefined,
      userName: undefined // Có thể thêm từ user data nếu cần
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
    await requireAdmin(request);

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
        updateData.approvedBy || 'admin'
      );

      logger.info('Deposit approved and balance updated', {
        depositId: updateData.depositId,
        userId: deposit.user_id,
        amount: deposit.amount,
        newBalance: result.newBalance,
      });

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
