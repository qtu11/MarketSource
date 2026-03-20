import { NextRequest, NextResponse } from 'next/server';
import { getUserByEmail, createOrUpdateUser } from '@/lib/database-mysql';
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
    let { email, password, captchaToken } = body;
    email = email?.trim().toLowerCase();

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
      return NextResponse.json(
        { success: false, error: 'Email hoặc mật khẩu không chính xác' },
        { status: 401 }
      );
    }

    // Verify password
    // ✅ FIX: Tránh account enumeration — không tiết lộ "tài khoản tồn tại nhưng chưa set password"
    if (!user.password_hash) {
      return NextResponse.json(
        { success: false, error: 'Email hoặc mật khẩu không chính xác' },
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

    // ✅ FIX: Tạo auth-token JWT cookie cho user sau login thành công
    // Đảm bảo /api/save-user có thể verify identity khi userManager.setUser() gọi
    // ✅ SECURITY FIX: Loại bỏ fallback-secret (BUG #41)
    const jwtSecret = process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET;
    if (!jwtSecret) {
      throw new Error('Cấu hình hệ thống lỗi: Thiếu JWT_SECRET');
    }
    const secret = new TextEncoder().encode(jwtSecret);
    const authToken = await new SignJWT({ 
      userId: String(user.id), 
      email: user.email, 
      role: user.role || 'user' 
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('7d')
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
      maxAge: 60 * 60 * 24 * 7, // 7 days
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
