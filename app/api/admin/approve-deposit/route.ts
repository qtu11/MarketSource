import { NextRequest, NextResponse } from "next/server"
import {
  approveDepositAndUpdateBalance,
  updateDepositStatus,
  getUserById,
  normalizeUserId,
  getUserIdByEmail,
} from "@/lib/database"
import { requireAdmin, validateRequest, getClientIP } from "@/lib/api-auth"
import { userManager } from "@/lib/userManager"

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

    const admin = await requireAdmin(request);

    const { depositId, amount, userId, action, userEmail } = await request.json();

    // Validate request
    const validation = validateRequest({ depositId, userId, action }, {
      required: ['depositId', 'userId', 'action']
    });

    if (!validation.valid) {
      return NextResponse.json(
        { success: false, error: validation.error || 'Missing required fields: depositId, userId, or action' },
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

    // ✅ FIX: Query deposit state cho CẢ hai action (approve và reject)
    const { queryOne } = await import('@/lib/database');
    const deposit = await queryOne<any>(
      'SELECT id, user_id, amount, status FROM deposits WHERE id = $1',
      [depositId]
    );

    if (!deposit) {
      return NextResponse.json(
        { success: false, error: 'Deposit not found' },
        { status: 404 }
      );
    }

    // ✅ FIX: Chung logic bảo vệ (Bao gồm cả reject vaf approve)
    if (deposit.status !== 'pending') {
      return NextResponse.json(
        { success: false, error: `Deposit has already been processed (${deposit.status})` },
        { status: 400 }
      );
    }

    if (action === 'approve') {

      // ✅ FIX: Validate userId match với deposit
      const depositUserId = deposit.user_id;
      const normalizedDepositUserId = await normalizeUserId(userId, userEmail);

      if (String(normalizedDepositUserId) !== String(depositUserId)) {
        return NextResponse.json(
          { success: false, error: 'User ID mismatch with deposit' },
          { status: 400 }
        );
      }

      // ✅ FIX: Validate amount match với deposit
      const dbAmount = Number(deposit.amount);
      const reqAmount = Number(amount);

      if (Math.abs(dbAmount - reqAmount) > 0.01) {
        const { logger } = await import('@/lib/logger');
        logger.warn('Deposit amount mismatch', { depositId, dbAmount, reqAmount });
        return NextResponse.json(
          { success: false, error: `Amount mismatch with deposit. DB: ${dbAmount}, Req: ${reqAmount}` },
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
      const result = await approveDepositAndUpdateBalance(
        parseInt(depositId),
        dbUserId,
        amount,
        adminEmail
      );

      // ✅ FIX: Tạo notification cho user khi deposit được approve
      try {
        const { createNotification } = await import('@/lib/database');
        await createNotification({
          userId: Number(dbUserId),
          type: 'deposit_approved',
          message: `Yêu cầu nạp tiền ${amount.toLocaleString('vi-VN')}đ đã được duyệt. Số dư hiện tại: ${result.newBalance.toLocaleString('vi-VN')}đ`,
          isRead: false,
        });
      } catch (notifError) {
        const { logger } = await import('@/lib/logger');
        logger.warn('Failed to create notification (non-critical)', { error: notifError, userId: dbUserId });
      }

      // ✅ NEW: Gửi email thông báo nạp tiền thành công cho khách hàng
      try {
        const recipientEmail = userEmail || (await (async () => {
          const { getUserById } = await import('@/lib/database');
          const user = await getUserById(dbUserId);
          return user?.email;
        })());
        if (recipientEmail) {
          const { sendDepositApprovalEmail } = await import('@/lib/email');
          await sendDepositApprovalEmail(recipientEmail, amount, result.newBalance);
        }
      } catch (emailError) {
        const { logger } = await import('@/lib/logger');
        logger.warn('Failed to send deposit approval email (non-critical)', { error: emailError, userId: dbUserId });
      }

      try {
        const { logAdminAction, resolveAdminIdForAudit } = await import('@/lib/audit-logger');
        const adminId = await resolveAdminIdForAudit({
          email: admin.email,
          uid: (admin as { uid?: string }).uid,
        });
        await logAdminAction({
          adminId,
          adminEmail: admin.email || undefined,
          action: 'DEPOSIT_APPROVE',
          targetType: 'deposit',
          targetId: depositId,
          details: { userId: dbUserId, amount },
          ipAddress: getClientIP(request),
        });
      } catch {
        /* non-critical */
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

      // Update deposit status to rejected
      await updateDepositStatus(parseInt(depositId), 'rejected');

      // ✅ FIX: Tạo notification cho user khi deposit bị reject
      try {
        const { createNotification } = await import('@/lib/database');
        await createNotification({
          userId: dbUserIdForReject,
          type: 'deposit_rejected',
          message: `Yêu cầu nạp tiền ${amount.toLocaleString('vi-VN')}đ đã bị từ chối. Vui lòng liên hệ admin để biết thêm chi tiết.`,
          isRead: false,
        });
      } catch (notifError) {
        const { logger } = await import('@/lib/logger');
        logger.warn('Failed to create notification (non-critical)', { error: notifError, userId: dbUserIdForReject });
      }

      try {
        const { logAdminAction, resolveAdminIdForAudit } = await import('@/lib/audit-logger');
        const adminId = await resolveAdminIdForAudit({
          email: admin.email,
          uid: (admin as { uid?: string }).uid,
        });
        await logAdminAction({
          adminId,
          adminEmail: admin.email || undefined,
          action: 'DEPOSIT_REJECT',
          targetType: 'deposit',
          targetId: depositId,
          details: { userId: dbUserIdForReject },
          ipAddress: getClientIP(request),
        });
      } catch {
        /* non-critical */
      }

      // ✅ NEW: Gửi email thông báo nạp tiền bị từ chối
      try {
        const recipientEmail = userEmail || (await (async () => {
          const { getUserById } = await import('@/lib/database');
          const user = await getUserById(dbUserIdForReject);
          return user?.email;
        })());
        if (recipientEmail) {
          const { sendDepositRejectionEmail } = await import('@/lib/email');
          await sendDepositRejectionEmail(recipientEmail, Number(amount || deposit.amount));
        }
      } catch (emailError) {
        const { logger } = await import('@/lib/logger');
        logger.warn('Failed to send deposit rejection email (non-critical)', { error: emailError, userId: dbUserIdForReject });
      }
    }

    // Send notification
    if (action === 'approve') {
      try {
        const { sendTelegramNotification } = await import('@/lib/notifications');
        const { logger } = await import('@/lib/logger');
        const message = `✅ <b>NẠP TIỀN ĐÃ ĐƯỢC DUYỆT</b>

💰 Số tiền: ${amount.toLocaleString('vi-VN')}đ
📝 Deposit ID: ${depositId}
⏰ Thời gian: ${new Date().toLocaleString('vi-VN')}

<i>Tiền đã được cộng vào tài khoản người dùng.</i>`;

        await sendTelegramNotification(message);
      } catch (error) {
        const { logger } = await import('@/lib/logger');
        logger.error('Telegram notification failed', error, { context: 'deposit-approval' });
      }
    }

    return NextResponse.json({
      success: true,
      message: action === 'approve' ? 'Deposit approved successfully' : 'Deposit rejected',
      depositId,
      timestamp: new Date().toISOString()
    });
  } catch (error: unknown) {
    const { createErrorResponse, logError } = await import('@/lib/error-handler');
    logError('Error processing deposit approval', error);

    // ✅ FIX: Differentiate error types
    const errMsg = error instanceof Error ? error.message : String(error);

    if (errMsg.includes('User ID mismatch') || errMsg.includes('Amount mismatch')) {
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
