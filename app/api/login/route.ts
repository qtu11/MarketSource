import { NextRequest, NextResponse } from 'next/server';
import { getUserByEmail, createOrUpdateUser } from '@/lib/database-mysql';
import { getClientIP } from '@/lib/api-auth';
import bcrypt from 'bcryptjs';

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
    let { email, password, captchaToken } = body;
    email = email?.trim().toLowerCase();

    // ✅ hCaptcha verification (Bypass in development)
    const isDev = process.env.NODE_ENV === 'development';
    if (!isDev) {
      const { verifyHCaptcha } = await import('@/lib/hcaptcha');
      const captchaResult = await verifyHCaptcha(captchaToken || '');
      if (!captchaResult.success) {
        return NextResponse.json(
          { success: false, error: 'Xác minh captcha thất bại. Vui lòng thử lại.' },
          { status: 400 }
        );
      }
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
      return NextResponse.json(
        { success: false, error: 'Email hoặc mật khẩu không chính xác' },
        { status: 401 }
      );
    }

    // Verify password
    if (!user.password_hash) {
      return NextResponse.json(
        { success: false, error: 'Tài khoản chưa được thiết lập mật khẩu' },
        { status: 401 }
      );
    }

    const isPasswordValid = await bcrypt.compare(password, user.password_hash);

    if (!isPasswordValid) {
      return NextResponse.json(
        { success: false, error: 'Email hoặc mật khẩu không chính xác' },
        { status: 401 }
      );
    }

    // Update IP address và last login
    const ipAddress = getClientIP(request);
    await createOrUpdateUser({
      email,
      ipAddress,
    });

    // Return user data (không trả về password_hash)
    const { password_hash, ...userWithoutPassword } = user;

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        uid: String(user.id), // Convert to string for compatibility
        email: user.email,
        name: user.name,
        username: user.username,
        avatar_url: user.avatar_url,
        balance: user.balance ? parseFloat(String(user.balance)) : 0,
        role: user.role || 'user',
      },
    });
  } catch (error: any) {
    const { logger } = await import('@/lib/logger');
    logger.error('Login API error', error, { endpoint: '/api/login' });
    return NextResponse.json(
      { success: false, error: error.message || 'Lỗi hệ thống' },
      { status: 500 }
    );
  }
}
