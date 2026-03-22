import { NextRequest, NextResponse } from 'next/server';
import { getUserByEmail, deletePasswordResetTokens, createPasswordResetTokenRecord } from '@/lib/database';
import { getClientIP } from '@/lib/api-auth';
import crypto from 'crypto';
import { logger } from '@/lib/logger';
import { notifyPasswordResetRequest } from '@/lib/notifications';
import { sendOtpEmail } from '@/lib/email';

export const runtime = 'nodejs'

/**
 * ✅ Request Password Reset - Gửi OTP 6 số qua Email SMTP
 * Flow: Nhận email → Tìm user → Tạo OTP 6 số → Lưu DB → Gửi email
 */
export async function POST(request: NextRequest) {
  try {
    let { email, deviceInfo, ipAddress: providedIp } = await request.json();
    email = email?.trim().toLowerCase();

    // ✅ BUG #5 FIX: Rate limiting per-IP và per-Email để tránh spam OTP
    const { checkRateLimitAndRespond } = await import('@/lib/rate-limit');
    
    // 1. IP rate limit (3 lần / 5 phút)
    const ipRateLimit = await checkRateLimitAndRespond(request, 3, 300, 'password-reset-ip');
    if (ipRateLimit) return ipRateLimit;

    // 2. Email rate limit (3 lần / 15 phút để đề phòng spam hòm thư)
    if (email) {
      const emailRateLimit = await checkRateLimitAndRespond(request, 3, 900, 'password-reset-email', email);
      if (emailRateLimit) return emailRateLimit;
    }

    if (!email) {
      return NextResponse.json(
        { success: false, error: 'Email là bắt buộc' },
        { status: 400 }
      );
    }

    // ✅ Tìm user trong PostgreSQL
    const user = await getUserByEmail(email);

    if (!user) {
      // Security best practice: Không tiết lộ email có tồn tại hay không
      return NextResponse.json({
        success: true,
        message: 'Nếu email tồn tại trong hệ thống, chúng tôi đã gửi mã xác nhận đến hộp thư của bạn.',
      });
    }

    // ✅ Tạo OTP 6 số ngẫu nhiên (an toàn bằng crypto)
    const otp = crypto.randomInt(100000, 999999).toString();

    // ✅ Thời gian hết hạn: 15 phút
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 15);

    // ✅ Xóa các OTP cũ của user này trước khi tạo mới
    await deletePasswordResetTokens(user.id);

    // ✅ Lưu OTP vào bảng password_resets (dùng cột token để lưu OTP)
    await createPasswordResetTokenRecord(user.id, otp, expiresAt);

    // ✅ Gửi OTP qua Email (SMTP Gmail → Resend fallback → Console fallback)
    try {
      await sendOtpEmail(user.email, otp);
      logger.info('OTP email sent successfully', { email: user.email });
    } catch (emailError) {
      logger.error('Failed to send OTP email', emailError, { email });
      return NextResponse.json(
        { success: false, error: 'Không thể gửi email xác nhận. Vui lòng thử lại sau.' },
        { status: 500 }
      );
    }

    // ✅ Gửi thông báo nội bộ (Telegram/WhatsApp) - fire and forget
    const ipAddress = providedIp || getClientIP(request); // Telegram notification
    try {
      await notifyPasswordResetRequest({
        userEmail: email,
        ipAddress,
        deviceInfo
      });
    } catch (error) {
      logger.error('Failed to send Telegram for password reset', error);
    }

    return NextResponse.json({
      success: true,
      message: 'Nếu email tồn tại trong hệ thống, chúng tôi đã gửi mã xác nhận đến hộp thư của bạn.',
    });
  } catch (error: any) {
    logger.error('API request password reset error', error, { endpoint: '/api/request-password-reset' });
    return NextResponse.json(
      { success: false, error: error.message || 'Có lỗi xảy ra. Vui lòng thử lại.' },
      { status: 500 }
    );
  }
}
