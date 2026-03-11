import { NextRequest, NextResponse } from "next/server"
import {
  approveDepositAndUpdateBalanceMySQL,
  updateDepositStatusMySQL,
  getUserByIdMySQL,
  normalizeUserIdMySQL as normalizeUserId,
  getUserIdByEmailMySQL as getUserIdByEmail,
} from "@/lib/database-mysql"
import { requireAdmin, validateRequest } from "@/lib/api-auth"
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

    // Require admin authentication
    await requireAdmin(request);

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

    if (action === 'approve') {
      // ✅ FIX: Query deposit để validate (không cần FOR UPDATE vì approveDepositAndUpdateBalanceMySQL đã có transaction)
      const { queryOne } = await import('@/lib/database-mysql');
      const deposit = await queryOne<any>(
        'SELECT id, user_id, amount, status FROM deposits WHERE id = ?',
        [depositId]
      );

      if (!deposit) {
        return NextResponse.json(
          { success: false, error: 'Deposit not found' },
          { status: 404 }
        );
      }

      // ✅ FIX: Validate deposit status
      if (deposit.status === 'approved') {
        return NextResponse.json(
          { success: false, error: 'Deposit has already been approved' },
          { status: 400 }
        );
      }

      if (deposit.status === 'rejected') {
        return NextResponse.json(
          { success: false, error: 'Deposit has been rejected and cannot be approved' },
          { status: 400 }
        );
      }

      // ✅ FIX: Validate userId match với deposit (Ép sang chuỗi để so sánh vì CSDL có thể trả ra BigInt là chuỗi)
      const depositUserId = deposit.user_id;
      const normalizedDepositUserId = await normalizeUserId(userId, userEmail);

      if (String(normalizedDepositUserId) !== String(depositUserId)) {
        return NextResponse.json(
          { success: false, error: 'User ID mismatch with deposit' },
          { status: 400 }
        );
      }

      // ✅ FIX: Validate amount match với deposit (Sử dụng epsilon comparison để tránh sai lệch định dạng Decimal từ DB)
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
      const result = await approveDepositAndUpdateBalanceMySQL(
        parseInt(depositId),
        dbUserId,
        amount,
        adminEmail
      );

      // Sync với userManager (Firestore/localStorage)
      try {
        const stringUserId = String(userId);
        const userData = await userManager.getUserData(stringUserId);
        if (userData) {
          await userManager.updateBalance(stringUserId, result.newBalance);
        }
      } catch (syncError) {
        const { logger } = await import('@/lib/logger');
        logger.warn('userManager sync failed (non-critical)', { error: syncError, userId });
      }

      // ✅ FIX: Tạo notification cho user khi deposit được approve
      try {
        const { createNotification } = await import('@/lib/database-mysql');
        await createNotification({
          userId: dbUserId,
          type: 'deposit_approved',
          message: `Yêu cầu nạp tiền ${amount.toLocaleString('vi-VN')}đ đã được duyệt. Số dư hiện tại: ${result.newBalance.toLocaleString('vi-VN')}đ`,
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

      // Update deposit status to rejected
      await updateDepositStatusMySQL(parseInt(depositId), 'rejected');

      // ✅ FIX: Tạo notification cho user khi deposit bị reject
      try {
        const { createNotification } = await import('@/lib/database-mysql');
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
    }

    // Send notification
    if (action === 'approve') {
      const message = `✅ <b>NẠP TIỀN ĐÃ ĐƯỢC DUYỆT</b>

💰 Số tiền: ${amount.toLocaleString('vi-VN')}đ
📝 Deposit ID: ${depositId}
⏰ Thời gian: ${new Date().toLocaleString('vi-VN')}

<i>Tiền đã được cộng vào tài khoản người dùng.</i>`;

      // ✅ SECURITY FIX: Chỉ dùng server-side env vars (không expose ra client)
      const botToken = process.env.TELEGRAM_BOT_TOKEN;
      const chatId = process.env.TELEGRAM_CHAT_ID;

      if (botToken && chatId) {
        try {
          await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              text: message,
              parse_mode: 'HTML'
            })
          });
        } catch (error) {
          const { logger } = await import('@/lib/logger');
          logger.error('Telegram notification failed', error, { context: 'deposit-approval' });
        }
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
    return NextResponse.json(
      createErrorResponse(error, 500),
      { status: 500 }
    );
  }
}
