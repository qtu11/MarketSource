import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { checkRateLimitAndRespond } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs'

/**
 * POST /api/admin/send-telegram
 * ✅ SECURITY FIX: Server-side proxy cho Telegram API
 * Không expose bot token ra client-side
 */
export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const rateLimitResponse = await checkRateLimitAndRespond(request, 10, 60, 'telegram-send');
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    // Require admin authentication
    await requireAdmin(request);

    const body = await request.json();
    const { message, chatId } = body;

    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Message is required and must be a string' },
        { status: 400 }
      );
    }

    // ✅ Server-side only - không expose ra client
    const botToken = process.env.TELEGRAM_BOT_TOKEN || process.env.NEXT_PUBLIC_TELEGRAM_BOT_TOKEN;
    const defaultChatId = process.env.TELEGRAM_CHAT_ID || process.env.NEXT_PUBLIC_TELEGRAM_CHAT_ID;

    if (!botToken) {
      logger.error('❌ Telegram bot token not configured');
      return NextResponse.json(
        { success: false, error: 'Telegram bot not configured' },
        { status: 500 }
      );
    }

    // Use provided chatId or fallback to default
    const targetChatId = chatId || defaultChatId;

    if (!targetChatId) {
      return NextResponse.json(
        { success: false, error: 'Chat ID is required' },
        { status: 400 }
      );
    }

    // Call Telegram helper
    const { sendTelegramNotification } = await import('@/lib/notifications');
    const success = await sendTelegramNotification(message, targetChatId).catch((error) => {
      logger.error('Telegram notification failed', error, { context: 'admin-send-telegram' });
      return false; // Indicate failure
    });

    if (!success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to send Telegram message'
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Telegram notification sent successfully'
    });
  } catch (error: any) {
    logger.error('❌ Error sending Telegram message', error);
    
    // ✅ SECURITY: Sanitize error messages
    const isDev = process.env.NODE_ENV === 'development';
    return NextResponse.json(
      {
        success: false,
        error: isDev ? error.message : 'Internal server error'
      },
      { status: 500 }
    );
  }
}
