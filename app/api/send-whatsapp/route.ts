import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { sendWhatsAppMessage } from '@/lib/whatsapp';
import { requireAdmin } from '@/lib/api-auth';
import { checkRateLimitAndRespond } from '@/lib/rate-limit';

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    const rateLimitResponse = await checkRateLimitAndRespond(request, 10, 60, 'send-whatsapp');
    if (rateLimitResponse) return rateLimitResponse;

    await requireAdmin(request);

    const { to, body } = await request.json();
    if (!to || typeof to !== 'string' || !body || typeof body !== 'string') {
      return NextResponse.json(
        { error: 'Invalid payload: "to" and "body" are required' },
        { status: 400 }
      );
    }

    // Ensure environment variables are set
    const data = await sendWhatsAppMessage({ to, body });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    logger.error('Error sending WhatsApp message', error);
    return NextResponse.json(
      {
        error: 'Failed to send WhatsApp message'
      },
      { status: error instanceof Error && error.message.includes('Unauthorized') ? 401 : 500 }
    );
  }
}
