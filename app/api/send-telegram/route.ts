import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import { requireAdmin } from '@/lib/api-auth';
import { checkRateLimitAndRespond } from '@/lib/rate-limit';

export const runtime = 'nodejs'

// ✅ FIX: Validation schema cho Telegram message
const telegramMessageSchema = z.object({
  message: z.string().min(1, 'Message không được để trống').max(4096, 'Message quá dài (tối đa 4096 ký tự)'),
  chatId: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const rateLimitResponse = await checkRateLimitAndRespond(request, 10, 60, 'send-telegram');
    if (rateLimitResponse) return rateLimitResponse;

    await requireAdmin(request);

    // Server-only secrets
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const defaultChatId = process.env.TELEGRAM_CHAT_ID;

    if (!botToken || !defaultChatId) {
      return NextResponse.json(
        { error: 'Telegram bot token hoặc chat ID chưa được cấu hình' },
        { status: 500 }
      );
    }

    const body = await request.json();
    
    // ✅ FIX: Validate message với Zod
    const validation = telegramMessageSchema.safeParse(body);
    
    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.errors[0]?.message || 'Dữ liệu không hợp lệ' },
        { status: 400 }
      );
    }

    const { message, chatId } = validation.data;

    // ✅ FIX: Sanitize HTML để tránh XSS (basic)
    const sanitizedMessage = message
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .trim();

    if (!sanitizedMessage || sanitizedMessage.length === 0) {
      return NextResponse.json(
        { error: 'Message không được để trống sau khi sanitize' },
        { status: 400 }
      );
    }

    await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      chat_id: chatId || defaultChatId,
      text: sanitizedMessage,
      parse_mode: 'HTML',
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    logger.error('API send telegram error', error);
    
    // ✅ FIX: Trả về lỗi rõ ràng hơn
    if (error.response?.data) {
      return NextResponse.json(
        { error: `Telegram API error: ${error.response.data.description || error.message}` },
        { status: error.response.status || 500 }
      );
    }
    
    return NextResponse.json(
      { error: error.message || 'Failed to send message' },
      { status: 500 }
    );
  }
}
    
