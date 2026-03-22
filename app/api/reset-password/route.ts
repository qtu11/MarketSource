import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import bcrypt from "bcryptjs"
import { findValidPasswordResetToken, consumePasswordResetToken, updateUserPasswordHash, getUserByEmail, pool } from "@/lib/database"
import { logger } from "@/lib/logger"

export const runtime = "nodejs"

/**
 * ✅ Reset Password - Xác thực OTP + Đổi mật khẩu
 * Flow: Nhận { email, otp, password } → Tìm user → Kiểm tra OTP → Hash password → Cập nhật DB
 */
const resetSchema = z.object({
  email: z.string().email('Email không hợp lệ'),
  otp: z.string().length(6, 'Mã OTP phải có 6 chữ số'),
  password: z.string().min(6, 'Mật khẩu phải có nhất 6 ký tự').max(128),
});

export async function POST(request: NextRequest) {
  try {
    // ✅ BUG #11 FIX: Rate limiting cho OTP verification (ip)
    const { checkRateLimitAndRespond } = await import('@/lib/rate-limit');
    const rateLimitResponse = await checkRateLimitAndRespond(request, 5, 900, 'reset-password-verify-ip');
    if (rateLimitResponse) return rateLimitResponse;

    const body = await request.json();
    
    // ✅ Thêm rate limiting theo email (Tránh distributed brute-force)
    const emailToRateLimit = body?.email?.toString()?.trim()?.toLowerCase();
    if (emailToRateLimit) {
      const emailRateLimit = await checkRateLimitAndRespond(request, 5, 900, 'reset-password-verify-email', emailToRateLimit);
      if (emailRateLimit) return emailRateLimit;
    }
    const validation = resetSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error.errors[0]?.message || 'Dữ liệu không hợp lệ' },
        { status: 400 }
      );
    }

    const { email, otp, password } = validation.data;

    // ✅ Tìm user bằng email
    const user = await getUserByEmail(email);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Email không tồn tại trong hệ thống.' },
        { status: 400 }
      );
    }

    // ✅ Tìm OTP hợp lệ (token = otp, chưa hết hạn)
    const tokenRecord = await findValidPasswordResetToken(otp);

    if (!tokenRecord) {
      return NextResponse.json(
        { success: false, error: 'Mã OTP không hợp lệ hoặc đã hết hạn. Vui lòng yêu cầu mã mới.' },
        { status: 400 }
      );
    }

    // ✅ Kiểm tra OTP thuộc đúng user này
    if (tokenRecord.user_id !== user.id) {
      return NextResponse.json(
        { success: false, error: 'Mã OTP không khớp với email này.' },
        { status: 400 }
      );
    }

    // ✅ Hash mật khẩu mới bằng bcrypt (10 rounds)
    const passwordHash = await bcrypt.hash(password, 10);

    // ✅ Cập nhật mật khẩu user trong DB
    await updateUserPasswordHash(tokenRecord.user_id, passwordHash);

    try {
      await pool.query(
        `UPDATE users SET
           email_verified_at = COALESCE(email_verified_at, NOW()),
           email_verification_token = NULL,
           email_verification_expires = NULL,
           updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [tokenRecord.user_id]
      );
    } catch {
      /* non-critical */
    }

    // ✅ Xóa OTP đã sử dụng (consume)
    await consumePasswordResetToken(otp);

    logger.info('Password reset successful', { userId: user.id, email });

    return NextResponse.json({
      success: true,
      message: 'Mật khẩu đã được đặt lại thành công! Bạn có thể đăng nhập với mật khẩu mới.',
    });
  } catch (error: any) {
    logger.error('Reset password API error', error, { endpoint: '/api/reset-password' });
    return NextResponse.json(
      { success: false, error: error.message || 'Không thể đặt lại mật khẩu. Vui lòng thử lại.' },
      { status: 500 }
    );
  }
}
