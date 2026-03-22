import { NextRequest, NextResponse } from "next/server"
import {
  approveWithdrawalAndUpdateBalance,
  updateWithdrawalStatus,
  getUserById,
  normalizeUserId,
  getUserIdByEmail,
} from "@/lib/database"
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
    const admin = await requireAdmin(request);

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

    // ✅ FIX: Query withdrawal state cho CẢ hai action (approve và reject)
    const { queryOne } = await import('@/lib/database');
    const withdrawal = await queryOne<any>(
      'SELECT id, user_id, amount, status FROM withdrawals WHERE id = $1',
      [withdrawalId]
    );

    if (!withdrawal) {
      return NextResponse.json(
        { success: false, error: 'Withdrawal not found' },
        { status: 404 }
      );
    }

    // ✅ FIX: Chung logic bảo vệ (Bao gồm cả reject và approve)
    if (withdrawal.status !== 'pending') {
      return NextResponse.json(
        { success: false, error: `Withdrawal has already been processed (${withdrawal.status})` },
        { status: 400 }
      );
    }

    if (action === 'approve') {

      // ✅ FIX: Validate userId match với withdrawal
      const withdrawalUserId = withdrawal.user_id;
      const normalizedWithdrawalUserId = await normalizeUserId(userId, userEmail);

      if (String(normalizedWithdrawalUserId) !== String(withdrawalUserId)) {
        return NextResponse.json(
          { success: false, error: 'User ID mismatch with withdrawal' },
          { status: 400 }
        );
      }

      // ✅ FIX: Validate amount match với withdrawal
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

      // ✅ BUG #8 FIX: Log admin action (resolve DB id — tránh admin_id = 0 vi phạm FK)
      const { logAdminAction, resolveAdminIdForAudit } = await import('@/lib/audit-logger');
      const auditAdminId = await resolveAdminIdForAudit({
        email: (admin as any).email,
        uid: (admin as any).uid,
      });
      await logAdminAction({
        adminId: auditAdminId,
        adminEmail: (admin as any).email || 'unknown',
        action: 'APPROVE_WITHDRAWAL',
        targetType: 'withdrawal',
        targetId: withdrawalId,
        details: { amount, userId: dbUserId, newBalance: result.newBalance },
        ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown'
      });

      // ✅ FIX: userManager is client-side only — balance already updated in DB
      const { logger } = await import('@/lib/logger');
      logger.info('Withdrawal approved, balance updated in DB', { 
        withdrawalId, userId, newBalance: result.newBalance 
      });

      // ✅ FIX: Tạo notification cho user khi withdrawal được approve
      try {
        const { createNotification } = await import('@/lib/database');
        await createNotification({
          userId: Number(dbUserId),
          type: 'withdrawal_approved',
          message: `Yêu cầu rút tiền ${amount.toLocaleString('vi-VN')}đ đã được duyệt. Tiền sẽ được chuyển vào tài khoản của bạn trong vòng 1-3 ngày làm việc. Số dư hiện tại: ${result.newBalance.toLocaleString('vi-VN')}đ`,
          isRead: false,
        });
      } catch (notifError) {
        const { logger } = await import('@/lib/logger');
        logger.warn('Failed to create notification (non-critical)', { error: notifError, userId: dbUserId });
      }

      // ✅ NEW: Gửi email thông báo rút tiền thành công cho khách hàng
      try {
        const recipientEmail = userEmail || (await (async () => {
          const { getUserById } = await import('@/lib/database');
          const user = await getUserById(dbUserId);
          return user?.email;
        })());
        if (recipientEmail) {
          const { sendWithdrawalApprovalEmail } = await import('@/lib/email');
          await sendWithdrawalApprovalEmail(recipientEmail, amount, result.newBalance);
        }
      } catch (emailError) {
        const { logger } = await import('@/lib/logger');
        logger.warn('Failed to send withdrawal approval email (non-critical)', { error: emailError, userId: dbUserId });
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
        const { createNotification } = await import('@/lib/database');
        const rejectAmt = Number(amount) || Number(withdrawal.amount) || 0;
        await createNotification({
          userId: Number(dbUserIdForReject),
          type: 'withdrawal_rejected',
          message: `Yêu cầu rút tiền ${rejectAmt.toLocaleString('vi-VN')}đ đã bị từ chối. Vui lòng liên hệ admin để biết thêm chi tiết.`,
          isRead: false,
        });
      } catch (notifError) {
        const { logger } = await import('@/lib/logger');
        logger.warn('Failed to create notification (non-critical)', { error: notifError, userId: dbUserIdForReject });
      }

      // ✅ BUG #8 FIX: Log admin action for rejection
      const { logAdminAction, resolveAdminIdForAudit } = await import('@/lib/audit-logger');
      const auditAdminIdReject = await resolveAdminIdForAudit({
        email: (admin as any).email,
        uid: (admin as any).uid,
      });
      await logAdminAction({
        adminId: auditAdminIdReject,
        adminEmail: (admin as any).email || 'unknown',
        action: 'REJECT_WITHDRAWAL',
        targetType: 'withdrawal',
        targetId: withdrawalId,
        details: { status: 'rejected' },
        ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown'
      });

      // ✅ NEW: Gửi email thông báo rút tiền bị từ chối
      try {
        const recipientEmail = userEmail || (await (async () => {
          const { getUserById } = await import('@/lib/database');
          const user = await getUserById(dbUserIdForReject);
          return user?.email;
        })());
        if (recipientEmail) {
          const { sendWithdrawalRejectionEmail } = await import('@/lib/email');
          const rejectAmt = Number(amount) || Number(withdrawal.amount) || 0;
          await sendWithdrawalRejectionEmail(recipientEmail, rejectAmt);
        }
      } catch (emailError) {
        const { logger } = await import('@/lib/logger');
        logger.warn('Failed to send withdrawal rejection email (non-critical)', { error: emailError, userId: dbUserIdForReject });
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

    // ✅ FIX: Differentiate error types
    const errMsg = error instanceof Error ? error.message : String(error);

    if (errMsg.includes('User ID mismatch') || errMsg.includes('Amount mismatch') || errMsg.includes('Insufficient balance')) {
      return NextResponse.json(
        { success: false, error: errMsg },
        { status: 400 }
      );
    }

    if (errMsg.includes('already been approved') || errMsg.includes('already been processed')) {
      return NextResponse.json(
        { success: false, error: errMsg },
        { status: 409 }
      );
    }

    if ((error as any)?.code === 'ENOTFOUND' || (error as any)?.code === 'ECONNREFUSED') {
      return NextResponse.json(
        { success: false, error: 'Database connection failed' },
        { status: 503 }
      );
    }

    return NextResponse.json(
      createErrorResponse(error, 500),
      { status: 500 }
    );
  }
}
