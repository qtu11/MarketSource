import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/lib/logger'
import {
  approveDepositAndUpdateBalance,
  updateDepositStatus,
  updateWithdrawalStatus,
  queryOne,
  createNotification,
  getUserById
} from '@/lib/database'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    // ✅ Webhook Verification chống Spoofing
    const telegramSecret = process.env.TELEGRAM_SECRET_TOKEN;
    if (telegramSecret && request.headers.get('X-Telegram-Bot-API-Secret-Token') !== telegramSecret) {
      logger.warn('Unauthorized telegram webhook attempt');
      return NextResponse.json({ error: 'Unauthorized webhook' }, { status: 401 });
    }

    const body = await request.json()

    // Handle callback queries (button presses)
    if (body.callback_query) {
      const callbackData = body.callback_query.data
      const chatId = body.callback_query.message.chat.id
      const messageId = body.callback_query.message.message_id

      // Parse callback data: action_type_userId_amount_timestamp
      const [action, type, userId, amount, timestamp] = callbackData.split('_')

      if (action === 'approve' || action === 'reject') {
        try {
          let responseText = ''
          const adminEmail = 'admin@telegram.bot'

          if (type === 'deposit') {
            const depositId = Number(userId)
            const deposit = await queryOne<any>('SELECT id, user_id, amount, status FROM deposits WHERE id = $1', [depositId])

            if (!deposit) {
              responseText = `❌ <b>LỖI:</b> Không tìm thấy yêu cầu nạp #${depositId}`
            } else if (deposit.status !== 'pending') {
              responseText = `⚠️ <b>CẢNH BÁO:</b> Yêu cầu nạp #${depositId} đã được xử lý trước đó (${deposit.status})`
            } else {
              const depositAmount = Number(deposit.amount);
              const depositUserId = Number(deposit.user_id);

              if (action === 'approve') {
                const result = await approveDepositAndUpdateBalance(depositId, depositUserId, depositAmount, adminEmail)
                responseText = `✅ <b>ĐÃ DUYỆT NẠP TIỀN</b>\n\n💰 Số tiền: ${depositAmount.toLocaleString('vi-VN')}đ\n👤 User ID: ${depositUserId}\n⏰ Thời gian: ${new Date().toLocaleString('vi-VN')}\n📈 Số dư mới: ${result.newBalance.toLocaleString('vi-VN')}đ`

                // ✅ ĐỒNG BỘ: Tạo thông báo Web
                try {
                  await createNotification({
                    userId: depositUserId,
                    type: 'deposit_approved',
                    message: `Yêu cầu nạp tiền ${depositAmount.toLocaleString('vi-VN')}đ đã được duyệt qua Telegram. Số dư: ${result.newBalance.toLocaleString('vi-VN')}đ`,
                    isRead: false,
                  });
                } catch (e: any) { logger.warn('Notif failed', { error: e.message }); }

                // ✅ ĐỒNG BỘ: Gửi Email
                try {
                  const user = await getUserById(depositUserId);
                  if (user?.email) {
                    const { sendDepositApprovalEmail } = await import('@/lib/email');
                    await sendDepositApprovalEmail(user.email, depositAmount, result.newBalance);
                  }
                } catch (e: any) { logger.warn('Email failed', { error: e.message }); }

                // ✅ ĐỒNG BỘ: Ghi Log Admin
                try {
                  const { logAdminAction, resolveAdminIdForAudit } = await import('@/lib/audit-logger');
                  const adminId = await resolveAdminIdForAudit({ email: adminEmail });
                  await logAdminAction({
                    adminId,
                    adminEmail,
                    action: 'APPROVE_DEPOSIT_TELEGRAM',
                    targetType: 'deposit',
                    targetId: depositId,
                    details: { userId: depositUserId, amount: depositAmount },
                    ipAddress: request.headers.get('x-forwarded-for') || 'telegram-bot',
                  });
                } catch (e: any) { logger.warn('Audit log failed', { error: e.message }); }
              } else {
                await updateDepositStatus(depositId, 'rejected', adminEmail)
                responseText = `❌ <b>ĐÃ TỪ CHỐI NẠP TIỀN</b>\n\n💰 Số tiền: ${depositAmount.toLocaleString('vi-VN')}đ\n👤 User ID: ${depositUserId}\n⏰ Thời gian: ${new Date().toLocaleString('vi-VN')}`

                // ✅ ĐỒNG BỘ: Tạo thông báo Web
                try {
                  await createNotification({
                    userId: depositUserId,
                    type: 'deposit_rejected',
                    message: `Yêu cầu nạp tiền ${depositAmount.toLocaleString('vi-VN')}đ đã bị từ chối qua Telegram.`,
                    isRead: false,
                  });
                } catch (e: any) { logger.warn('Notif failed', { error: e.message }); }

                // ✅ ĐỒNG BỘ: Gửi Email
                try {
                  const user = await getUserById(depositUserId);
                  if (user?.email) {
                    const { sendDepositRejectionEmail } = await import('@/lib/email');
                    await sendDepositRejectionEmail(user.email, depositAmount);
                  }
                } catch (e: any) { logger.warn('Email failed', { error: e.message }); }

                // ✅ ĐỒNG BỘ: Ghi Log Admin
                try {
                  const { logAdminAction, resolveAdminIdForAudit } = await import('@/lib/audit-logger');
                  const adminId = await resolveAdminIdForAudit({ email: adminEmail });
                  await logAdminAction({
                    adminId,
                    adminEmail,
                    action: 'REJECT_DEPOSIT_TELEGRAM',
                    targetType: 'deposit',
                    targetId: depositId,
                    details: { userId: depositUserId, amount: depositAmount },
                    ipAddress: request.headers.get('x-forwarded-for') || 'telegram-bot',
                  });
                } catch (e: any) { logger.warn('Audit log failed', { error: e.message }); }
              }
            }
          } else if (type === 'withdraw') {
            const withdrawalId = Number(userId)
            const withdrawal = await queryOne<any>('SELECT id, user_id, amount, status FROM withdrawals WHERE id = $1', [withdrawalId])

            if (!withdrawal) {
              responseText = `❌ <b>LỖI:</b> Không tìm thấy yêu cầu rút #${withdrawalId}`
            } else if (withdrawal.status !== 'pending') {
              responseText = `⚠️ <b>CẢNH BÁO:</b> Yêu cầu rút #${withdrawalId} đã được xử lý trước đó (${withdrawal.status})`
            } else {
              const withdrawAmount = Number(withdrawal.amount);
              const withdrawUserId = Number(withdrawal.user_id);

              if (action === 'approve') {
                await updateWithdrawalStatus(withdrawalId, 'approved', adminEmail)
                responseText = `✅ <b>ĐÃ DUYỆT RÚT TIỀN</b>\n\n💰 Số tiền: ${withdrawAmount.toLocaleString('vi-VN')}đ\n👤 User ID: ${withdrawUserId}\n⏰ Thời gian: ${new Date().toLocaleString('vi-VN')}\n\n<i>Vui lòng thực hiện chuyển khoản cho khách.</i>`

                // ✅ ĐỒNG BỘ: Tạo thông báo Web
                try {
                  await createNotification({
                    userId: withdrawUserId,
                    type: 'withdrawal_approved',
                    message: `Yêu cầu rút tiền ${withdrawAmount.toLocaleString('vi-VN')}đ đã được duyệt qua Telegram.`,
                    isRead: false,
                  });
                } catch (e: any) { logger.warn('Notif failed', { error: e.message }); }

                // ✅ ĐỒNG BỘ: Gửi Email
                try {
                  const user = await getUserById(withdrawUserId);
                  if (user?.email) {
                    const { sendWithdrawalApprovalEmail } = await import('@/lib/email');
                    const balanceRow = await queryOne<any>('SELECT balance FROM users WHERE id = $1', [withdrawUserId]);
                    await sendWithdrawalApprovalEmail(user.email, withdrawAmount, Number(balanceRow?.balance || 0));
                  }
                } catch (e: any) { logger.warn('Email failed', { error: e.message }); }

                // ✅ ĐỒNG BỘ: Ghi Log Admin
                try {
                  const { logAdminAction, resolveAdminIdForAudit } = await import('@/lib/audit-logger');
                  const adminId = await resolveAdminIdForAudit({ email: adminEmail });
                  await logAdminAction({
                    adminId,
                    adminEmail,
                    action: 'APPROVE_WITHDRAW_TELEGRAM',
                    targetType: 'withdrawal',
                    targetId: withdrawalId,
                    details: { userId: withdrawUserId, amount: withdrawAmount },
                    ipAddress: request.headers.get('x-forwarded-for') || 'telegram-bot',
                  });
                } catch (e: any) { logger.warn('Audit log failed', { error: e.message }); }

              } else {
                await updateWithdrawalStatus(withdrawalId, 'rejected', adminEmail)
                responseText = `❌ <b>ĐÃ TỪ CHỐI RÚT TIỀN</b>\n\n💰 Số tiền: ${withdrawAmount.toLocaleString('vi-VN')}đ\n👤 User ID: ${withdrawUserId}\n⏰ Thời gian: ${new Date().toLocaleString('vi-VN')}`

                // ✅ ĐỒNG BỘ: Tạo thông báo Web
                try {
                  await createNotification({
                    userId: withdrawUserId,
                    type: 'withdrawal_rejected',
                    message: `Yêu cầu rút tiền ${withdrawAmount.toLocaleString('vi-VN')}đ đã bị từ chối qua Telegram.`,
                    isRead: false,
                  });
                } catch (e: any) { logger.warn('Notif failed', { error: e.message }); }

                // ✅ ĐỒNG BỘ: Gửi Email
                try {
                  const user = await getUserById(withdrawUserId);
                  if (user?.email) {
                    const { sendWithdrawalRejectionEmail } = await import('@/lib/email');
                    await sendWithdrawalRejectionEmail(user.email, withdrawAmount);
                  }
                } catch (e: any) { logger.warn('Email failed', { error: e.message }); }

                // ✅ ĐỒNG BỘ: Ghi Log Admin
                try {
                  const { logAdminAction, resolveAdminIdForAudit } = await import('@/lib/audit-logger');
                  const adminId = await resolveAdminIdForAudit({ email: adminEmail });
                  await logAdminAction({
                    adminId,
                    adminEmail,
                    action: 'REJECT_WITHDRAW_TELEGRAM',
                    targetType: 'withdrawal',
                    targetId: withdrawalId,
                    details: { userId: withdrawUserId, amount: withdrawAmount },
                    ipAddress: request.headers.get('x-forwarded-for') || 'telegram-bot',
                  });
                } catch (e: any) { logger.warn('Audit log failed', { error: e.message }); }
              }
            }
          }

          // Edit the original message to show the result
          await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/editMessageText`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              message_id: messageId,
              text: responseText,
              parse_mode: 'HTML'
            })
          })

          // Answer the callback query
          await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              callback_query_id: body.callback_query.id,
              text: action === 'approve' ? '✅ Đã xử lý thành công!' : '❌ Đã từ chối!',
              show_alert: true
            })
          })

        } catch (error: any) {
          logger.error('Error processing callback', error, { callbackData })

          // Answer callback query with error
          await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              callback_query_id: body.callback_query.id,
              text: `❌ Lỗi: ${error.message || 'Không thể xử lý'}`,
              show_alert: true
            })
          })
        }
      }
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    logger.error('Webhook error', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ message: 'Telegram webhook endpoint active and secure' })
}
