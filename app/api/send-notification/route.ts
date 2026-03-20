import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { checkRateLimitAndRespond } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'
import { createNotificationMySQL, getUserIdByEmail } from '@/lib/database-mysql'
import { sendTelegramNotification } from '@/lib/notifications'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    const rateLimitResponse = await checkRateLimitAndRespond(request, 20, 60, 'send-notification')
    if (rateLimitResponse) return rateLimitResponse

    await requireAdmin(request)

    const body = await request.json()
    const { type, title, message, userId, userEmail, user } = body

    if (!type || !message) {
      return NextResponse.json(
        { error: 'Missing required fields: type, message' },
        { status: 400 }
      )
    }

    let targetUserId: number | null = null
    if (typeof userId === 'number') {
      targetUserId = userId
    } else if (typeof userId === 'string' && /^\d+$/.test(userId)) {
      targetUserId = Number(userId)
    } else {
      const targetEmail =
        (typeof userEmail === 'string' && userEmail) ||
        (typeof user?.email === 'string' && user.email) ||
        ''
      if (targetEmail) {
        targetUserId = await getUserIdByEmail(targetEmail)
      }
    }

    if (!targetUserId) {
      return NextResponse.json(
        { error: 'Cannot resolve target user ID' },
        { status: 400 }
      )
    }

    const finalMessage = title ? `**${title}**\n${message}` : message
    const saved = await createNotificationMySQL({
      userId: targetUserId,
      type,
      message: finalMessage,
      isRead: false,
    })

    if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
      try {
        await sendTelegramNotification(finalMessage)
      } catch (telegramError) {
        logger.error('Telegram notification error', telegramError, { endpoint: '/api/send-notification' })
      }
    }

    return NextResponse.json({
      success: true,
      notificationId: saved.id,
      userId: targetUserId,
      message: 'Thông báo đã được gửi!'
    })
  } catch (error: any) {
    logger.error('Send notification error', error, { endpoint: '/api/send-notification' })
    if (error?.message?.includes('Unauthorized')) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }
    return NextResponse.json(
      { error: error.message || 'Lỗi khi gửi thông báo!' },
      { status: 500 }
    )
  }
}
