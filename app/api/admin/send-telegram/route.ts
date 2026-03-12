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

    // Call Telegram API
    const telegramResponse = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: targetChatId,
          text: message,
          parse_mode: 'HTML',
        }),
      }
    );

    if (!telegramResponse.ok) {
      const errorData = await telegramResponse.json().catch(() => ({}));
      logger.error('❌ Telegram API error', undefined, { errorData });
      
      // ✅ SECURITY: Không expose error details trong production
      const isDev = process.env.NODE_ENV === 'development';
      return NextResponse.json(
        {
          success: false,
          error: isDev 
            ? `Telegram API error: ${JSON.stringify(errorData)}`
            : 'Failed to send Telegram message'
        },
        { status: telegramResponse.status }
      );
    }

    const result = await telegramResponse.json();

    return NextResponse.json({
      success: true,
      messageId: result.result?.message_id,
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
