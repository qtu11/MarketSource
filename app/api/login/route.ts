import { NextRequest, NextResponse } from 'next/server';
import { getUserByEmail, createOrUpdateUser } from '@/lib/database';
import { getClientIP } from '@/lib/api-auth';
import bcrypt from 'bcryptjs';
import { SignJWT } from 'jose';

/**
 * API Login - Xác thực user với email/password
 */
export async function POST(request: NextRequest) {
  try {
    // ✅ FIX: Thêm rate limiting để tránh brute force attack
    const { checkRateLimitAndRespond } = await import('@/lib/rate-limit');
    const rateLimitResponse = await checkRateLimitAndRespond(request, 5, 60, 'login');
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const body = await request.json();
    let { email, password, captchaToken, rememberMe } = body;
    email = email?.trim().toLowerCase();
    /** Ghi nhớ đăng nhập: cookie + JWT dài hơn (thiết bị vẫn đăng nhập sau khi đóng trình duyệt) */
    const persistSession = Boolean(rememberMe);
    const sessionMaxAgeSec = persistSession
      ? 60 * 60 * 24 * 30 // 30 ngày
      : 60 * 60 * 24; // 1 ngày (máy dùng chung / không ghi nhớ)
    const jwtExpires = persistSession ? '30d' : '1d';

    // ✅ PoW Captcha verification
    const { verifyPoWCaptcha } = await import('@/lib/pow-captcha');
    const captchaResult = verifyPoWCaptcha(captchaToken || '');
    if (!captchaResult.success) {
      return NextResponse.json(
        { success: false, error: 'Xác minh captcha thất bại. Vui lòng thử lại.' },
        { status: 400 }
      );
    }

    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: 'Email và mật khẩu là bắt buộc' },
        { status: 400 }
      );
    }

    // Tìm user trong database
    const user = await getUserByEmail(email);

    if (!user) {
      if (process.env.NODE_ENV === 'development') {
        const { logger } = await import('@/lib/logger');
        logger.warn('[login] 401 — không có user với email này trong DB (kiểm tra đã đăng ký / đúng email)', {
          email,
        });
      }
      return NextResponse.json(
        { success: false, error: 'Email hoặc mật khẩu không chính xác' },
        { status: 401 }
      );
    }

    // Verify password
    // ✅ FIX: Tránh account enumeration — không tiết lộ "tài khoản tồn tại nhưng chưa set password"
    if (!user.password_hash) {
      if (process.env.NODE_ENV === 'development') {
        const { logger } = await import('@/lib/logger');
        logger.warn('[login] 401 — user không có password_hash (VD: chỉ đăng nhập OAuth)', { email });
      }
      return NextResponse.json(
        { success: false, error: 'Email hoặc mật khẩu không chính xác' },
        { status: 401 }
      );
    }

    const isPasswordValid = await bcrypt.compare(password, user.password_hash);

    if (!isPasswordValid) {
      if (process.env.NODE_ENV === 'development') {
        const { logger } = await import('@/lib/logger');
        logger.warn('[login] 401 — sai mật khẩu', { email });
      }
      return NextResponse.json(
        { success: false, error: 'Email hoặc mật khẩu không chính xác' },
        { status: 401 }
      );
    }

    const verifiedAt = (user as { email_verified_at?: string | Date | null }).email_verified_at;
    if (!verifiedAt) {
      return NextResponse.json(
        {
          success: false,
          error: 'Vui lòng xác minh email trước khi đăng nhập. Kiểm tra hộp thư hoặc gửi lại email xác minh.',
          code: 'EMAIL_NOT_VERIFIED',
        },
        { status: 403 }
      );
    }

    // Update IP address và last login
    const ipAddress = getClientIP(request);
    await createOrUpdateUser({
      email,
      ipAddress,
    });

    // ✅ FIX: Tạo auth-token JWT cookie cho user sau login thành công
    // Đảm bảo /api/save-user có thể verify identity khi userManager.setUser() gọi
    // ✅ SECURITY FIX: Loại bỏ fallback-secret (BUG #41)
    const jwtSecret = process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET;
    if (!jwtSecret || jwtSecret.length < 32) {
      throw new Error('Cấu hình hệ thống lỗi: Thiếu JWT_SECRET hoặc độ dài không đủ an toàn (>=32)');
    }
    const secret = new TextEncoder().encode(jwtSecret);
    const authToken = await new SignJWT({
      userId: String(user.id),
      email: user.email,
      role: user.role || 'user',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(jwtExpires)
      .sign(secret);

    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        uid: String(user.id),
        email: user.email,
        name: user.name,
        username: user.username,
        avatar_url: user.avatar_url,
        balance: user.balance ? parseFloat(String(user.balance)) : 0,
        role: user.role || 'user',
      },
    });

    // Set auth-token cookie
    response.cookies.set('auth-token', authToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: sessionMaxAgeSec,
    });

    return response;
  } catch (error: any) {
    const { logger } = await import('@/lib/logger');
    logger.error('Login API error', error, { endpoint: '/api/login' });
    return NextResponse.json(
      { success: false, error: error.message || 'Lỗi hệ thống' },
      { status: 500 }
    );
  }
}
