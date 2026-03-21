import { NextRequest, NextResponse } from "next/server"
import {
  updateBalance,
  getUserById,
  normalizeUserId,
  withTransaction,
} from "@/lib/database"
import { requireAdmin, validateRequest, getClientIP } from "@/lib/api-auth"

export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  try {
    // ✅ SECURITY: CSRF protection
    const { csrfProtection } = await import('@/lib/csrf');
    const csrfCheck = csrfProtection(request);
    if (!csrfCheck.valid) {
      return NextResponse.json(
        { success: false, error: csrfCheck.error || 'CSRF token validation failed' },
        { status: 403 }
      );
    }

    // ✅ SECURITY: Require admin authentication
    const admin = await requireAdmin(request);

    // Parse request body
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid request body' },
        { status: 400 }
      );
    }

    const { userId, userEmail, amount, type, reason } = body;

    // Validate required fields
    if (!userId && !userEmail) {
      return NextResponse.json(
        { success: false, error: 'userId or userEmail is required' },
        { status: 400 }
      );
    }

    if (amount === undefined || amount === null) {
      return NextResponse.json(
        { success: false, error: 'amount is required' },
        { status: 400 }
      );
    }

    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      return NextResponse.json(
        { success: false, error: 'Amount must be a positive number' },
        { status: 400 }
      );
    }

    if (!type || !['increase', 'decrease'].includes(type)) {
      return NextResponse.json(
        { success: false, error: 'type must be "increase" or "decrease"' },
        { status: 400 }
      );
    }

    // Resolve user ID
    const dbUserId = await normalizeUserId(userId || userEmail, userEmail);
    if (!dbUserId) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    // Get user info for logging
    const user = await getUserById(dbUserId);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found in database' },
        { status: 404 }
      );
    }

    // ✅ Execute balance update with transaction
    const result = await withTransaction(async (client) => {
      return await updateBalance(dbUserId, numAmount, type, client);
    });

    // ✅ Audit log
    try {
      const { logAdminAction, resolveAdminIdForAudit } = await import('@/lib/audit-logger');
      const adminId = await resolveAdminIdForAudit({
        email: admin.email,
        uid: (admin as { uid?: string }).uid,
      });
      await logAdminAction({
        adminId,
        adminEmail: admin.email || undefined,
        action: type === 'increase' ? 'ADMIN_BALANCE_INCREASE' : 'ADMIN_BALANCE_DECREASE',
        targetType: 'user',
        targetId: String(dbUserId),
        details: {
          amount: numAmount,
          type,
          reason: reason || 'Admin manual adjustment',
          previousBalance: user.balance,
          newBalance: result.newBalance,
          userEmail: user.email,
        },
        ipAddress: getClientIP(request),
      });
    } catch {
      /* audit log is non-critical */
    }

    // ✅ Notification
    try {
      const { createNotification } = await import('@/lib/database');
      const actionText = type === 'increase' ? 'cộng' : 'trừ';
      await createNotification({
        userId: dbUserId,
        type: `balance_${type}`,
        message: `Admin đã ${actionText} ${numAmount.toLocaleString('vi-VN')}đ ${type === 'increase' ? 'vào' : 'khỏi'} tài khoản của bạn. ${reason ? `Lý do: ${reason}` : ''} Số dư hiện tại: ${result.newBalance.toLocaleString('vi-VN')}đ`,
        isRead: false,
      });
    } catch {
      /* notification is non-critical */
    }

    const { logger } = await import('@/lib/logger');
    logger.info('Admin balance update', {
      adminEmail: admin.email,
      userId: dbUserId,
      userEmail: user.email,
      amount: numAmount,
      type,
      reason,
      newBalance: result.newBalance,
    });

    return NextResponse.json({
      success: true,
      message: `Balance ${type === 'increase' ? 'increased' : 'decreased'} by ${numAmount}`,
      data: {
        userId: dbUserId,
        userEmail: user.email,
        newBalance: result.newBalance,
        amount: numAmount,
        type,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    const { logger } = await import('@/lib/logger');
    logger.error('Error in admin update-user-balance', error);

    // ✅ FIX: Differentiate error types
    if (error.message?.includes('Insufficient balance')) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }

    if (error.message?.includes('User not found')) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 404 }
      );
    }

    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      return NextResponse.json(
        { success: false, error: 'Database connection failed' },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
