import { NextRequest, NextResponse } from "next/server"
import {
  approveWithdrawalAndUpdateBalance,
  updateWithdrawalStatus,
  getUserById,
  normalizeUserIdMySQL as normalizeUserId,
  getUserIdByEmail,
} from "@/lib/database-mysql"
import { requireAdmin, validateRequest } from "@/lib/api-auth"
// ✅ FIX: Removed static import of client-only userManager (uses localStorage)

export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  try {
    // ✅ SECURITY FIX: CSRF protection cho admin routes
    const { csrfProtection } = await import('@/lib/csrf');
    const csrfCheck = csrfProtection(request);
    if (!csrfCheck.valid) {
      return NextResponse.json(
        { success: false, error: csrfCheck.error || 'CSRF token validation failed' },
        { status: 403 }
      );
    }

    // Require admin authentication
    await requireAdmin(request);

    const { withdrawalId, amount, userId, action, userEmail } = await request.json();

    // Validate request
    const validation = validateRequest({ withdrawalId, userId, action }, {
      required: ['withdrawalId', 'userId', 'action']
    });

    if (!validation.valid) {
      return NextResponse.json(
        { success: false, error: validation.error || 'Missing required fields: withdrawalId, userId, or action' },
        { status: 400 }
      );
    }

    // Validate action
    if (!['approve', 'reject'].includes(action)) {
      return NextResponse.json(
        { success: false, error: 'Invalid action. Must be "approve" or "reject"' },
        { status: 400 }
      );
    }

    // Validate amount if approve
    if (action === 'approve' && (!amount || amount <= 0)) {
      return NextResponse.json(
        { success: false, error: 'Amount must be greater than 0 for approval' },
        { status: 400 }
      );
    }

    if (action === 'approve') {
      // ✅ FIX: Query withdrawal để validate (không cần FOR UPDATE vì approveWithdrawalAndUpdateBalanceMySQL đã có transaction)
      const { queryOne } = await import('@/lib/database-mysql');
      const withdrawal = await queryOne<any>(
        'SELECT id, user_id, amount, status FROM withdrawals WHERE id = ?',
        [withdrawalId]
      );

      if (!withdrawal) {
        return NextResponse.json(
          { success: false, error: 'Withdrawal not found' },
          { status: 404 }
        );
      }

      // ✅ FIX: Validate withdrawal status
      if (withdrawal.status === 'approved') {
        return NextResponse.json(
          { success: false, error: 'Withdrawal has already been approved' },
          { status: 400 }
        );
      }

      if (withdrawal.status === 'rejected') {
        return NextResponse.json(
          { success: false, error: 'Withdrawal has been rejected and cannot be approved' },
          { status: 400 }
        );
      }

      // ✅ FIX: Validate userId match với withdrawal (Ép sang chuỗi để so sánh vì CSDL kết xuất BigInt là chuỗi)
      const withdrawalUserId = withdrawal.user_id;
      const normalizedWithdrawalUserId = await normalizeUserId(userId, userEmail);

      if (String(normalizedWithdrawalUserId) !== String(withdrawalUserId)) {
        return NextResponse.json(
          { success: false, error: 'User ID mismatch with withdrawal' },
          { status: 400 }
        );
      }

      // ✅ FIX: Validate amount match với withdrawal (Sử dụng epsilon comparison để tránh sai lệch định dạng Decimal từ DB)
      const dbAmount = Number(withdrawal.amount);
      const reqAmount = Number(amount);

      if (Math.abs(dbAmount - reqAmount) > 0.01) {
        const { logger } = await import('@/lib/logger');
        logger.warn('Withdrawal amount mismatch', { withdrawalId, dbAmount, reqAmount });
        return NextResponse.json(
          { success: false, error: `Amount mismatch with withdrawal. DB: ${dbAmount}, Req: ${reqAmount}` },
          { status: 400 }
        );
      }

      // Normalize userId: convert string uid to PostgreSQL INT
      const dbUserId = await normalizeUserId(userId, userEmail);

      if (!dbUserId) {
        return NextResponse.json(
          { success: false, error: 'Cannot resolve user ID. User may not exist in database.' },
          { status: 400 }
        );
      }

      // Use transaction-safe function để đảm bảo atomicity
      const adminEmail = process.env.ADMIN_EMAIL || 'admin';
      const result = await approveWithdrawalAndUpdateBalance(
        parseInt(withdrawalId),
        dbUserId,
        amount,
        adminEmail
      );

      // ✅ FIX: userManager is client-side only — balance already updated in DB
      // Client-side sync happens automatically via userUpdated event
      const { logger } = await import('@/lib/logger');
      logger.info('Withdrawal approved, balance updated in DB', { 
        withdrawalId, userId, newBalance: result.newBalance 
      });

      // ✅ FIX: Tạo notification cho user khi withdrawal được approve
      try {
        const { createNotification } = await import('@/lib/database-mysql');
        await createNotification({
          userId: dbUserId,
          type: 'withdrawal_approved',
          message: `Yêu cầu rút tiền ${amount.toLocaleString('vi-VN')}đ đã được duyệt. Tiền sẽ được chuyển vào tài khoản của bạn trong vòng 1-3 ngày làm việc. Số dư hiện tại: ${result.newBalance.toLocaleString('vi-VN')}đ`,
          isRead: false,
        });
      } catch (notifError) {
        const { logger } = await import('@/lib/logger');
        logger.warn('Failed to create notification (non-critical)', { error: notifError, userId: dbUserId });
      }
    } else if (action === 'reject') {
      // Normalize userId cho reject action
      const dbUserIdForReject = await normalizeUserId(userId, userEmail);

      if (!dbUserIdForReject) {
        return NextResponse.json(
          { success: false, error: 'Cannot resolve user ID. User may not exist in database.' },
          { status: 400 }
        );
      }

      // Update withdrawal status to rejected
      await updateWithdrawalStatus(parseInt(withdrawalId), 'rejected');

      // ✅ FIX: Tạo notification cho user khi withdrawal bị reject
      try {
        const { createNotification } = await import('@/lib/database-mysql');
        await createNotification({
          userId: dbUserIdForReject,
          type: 'withdrawal_rejected',
          message: `Yêu cầu rút tiền ${amount.toLocaleString('vi-VN')}đ đã bị từ chối. Vui lòng liên hệ admin để biết thêm chi tiết.`,
          isRead: false,
        });
      } catch (notifError) {
        const { logger } = await import('@/lib/logger');
        logger.warn('Failed to create notification (non-critical)', { error: notifError, userId: dbUserIdForReject });
      }
    }

    // Send notification
    if (action === 'approve') {
      try {
        const { sendTelegramNotification } = await import('@/lib/notifications');
        const { logger } = await import('@/lib/logger');
        const message = `✅ <b>RÚT TIỀN ĐÃ ĐƯỢC DUYỆT</b>

💰 Số tiền: ${amount.toLocaleString('vi-VN')}đ
📝 Withdrawal ID: ${withdrawalId}
⏰ Thời gian: ${new Date().toLocaleString('vi-VN')}

<i>Tiền đã được trừ khỏi tài khoản người dùng.</i>`;

        await sendTelegramNotification(message);
      } catch (error) {
        const { logger } = await import('@/lib/logger');
        logger.error('Telegram notification failed', error, { context: 'withdrawal-approval' });
      }
    }

    return NextResponse.json({
      success: true,
      message: action === 'approve' ? 'Withdrawal approved successfully' : 'Withdrawal rejected',
      withdrawalId,
      timestamp: new Date().toISOString()
    });
  } catch (error: unknown) {
    const { createErrorResponse, logError } = await import('@/lib/error-handler');
    logError('Error processing withdrawal approval', error);
    return NextResponse.json(
      createErrorResponse(error, 500),
      { status: 500 }
    );
  }
}
