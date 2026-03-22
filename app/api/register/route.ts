import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { getUserByEmail, createOrUpdateUser } from '@/lib/database';
import { getClientIP } from '@/lib/api-auth';
import bcrypt from 'bcryptjs';

export const runtime = 'nodejs'

/**
 * API Register - Đăng ký user mới
 */
export async function POST(request: NextRequest) {
  // ✅ FIX: Khai báo biến ở đầu để có thể dùng trong catch block
  let email: string | undefined;
  let password: string | undefined;
  let name: string | undefined;
  let username: string | undefined;
  let passwordHash: string | undefined;
  let ipAddress: string | undefined;

  try {
    // ✅ FIX: Thêm rate limiting để tránh spam registration
    const { checkRateLimitAndRespond } = await import('@/lib/rate-limit');
    const rateLimitResponse = await checkRateLimitAndRespond(request, 3, 300, 'register');
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const body = await request.json();
    
    // ✅ BUG #7 FIX: Thêm Input Validation bằng Zod Schema nghiêm ngặt
    const { registerSchema } = await import('@/lib/validation-schemas');
    const validation = registerSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error.errors[0]?.message || 'Dữ liệu không hợp lệ' },
        { status: 400 }
      );
    }
    
    // Lấy data đã qua validate
    email = validation.data.email.trim().toLowerCase();
    password = validation.data.password;
    name = validation.data.name;
    username = validation.data.username;
    const referralCode = validation.data.referralCode?.trim() || '';
    const captchaToken = validation.data.captchaToken;

    // ✅ PoW Captcha verification
    const { verifyPoWCaptcha } = await import('@/lib/pow-captcha');
    const captchaResult = verifyPoWCaptcha(captchaToken || '');
    if (!captchaResult.success) {
      return NextResponse.json(
        { success: false, error: 'Xác minh captcha thất bại. Vui lòng thử lại.' },
        { status: 400 }
      );
    }

    const emailRateLimit = await checkRateLimitAndRespond(request, 5, 3600, 'register-email', email);
    if (emailRateLimit) {
      return emailRateLimit;
    }

    // Check if email already exists
    const existingUser = await getUserByEmail(email);

    if (existingUser) {
      return NextResponse.json(
        { success: false, error: 'Email này đã được đăng ký' },
        { status: 400 }
      );
    }

    // Validate referral code before creating user to avoid partial-success state
    let referrer: { id: number; email?: string | null } | null = null
    if (referralCode) {
      const { queryOne } = await import('@/lib/database')
      referrer = await queryOne<{ id: number; email?: string | null }>(
        'SELECT id, email FROM users WHERE referral_code = $1',
        [referralCode]
      )

      if (!referrer) {
        return NextResponse.json(
          { success: false, error: 'Mã giới thiệu không tồn tại trong hệ thống.' },
          { status: 400 }
        )
      }

      if (referrer.email?.toLowerCase() === email.toLowerCase()) {
        return NextResponse.json(
          { success: false, error: 'Bạn không thể tự giới thiệu chính mình.' },
          { status: 400 }
        )
      }
    }

    // Hash password
    passwordHash = await bcrypt.hash(password, 10);

    // Get IP address
    ipAddress = getClientIP(request);

    const verifyToken = randomBytes(32).toString('hex');
    const verifyExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    // Create user (chưa xác minh email — token gửi qua mail)
    const result = await createOrUpdateUser({
      email,
      name,
      username: username || name,
      passwordHash,
      ipAddress,
      role: 'user',
      emailVerificationToken: verifyToken,
      emailVerificationExpires: verifyExpires,
    });

    if (!result || !result.id) {
      return NextResponse.json(
        { success: false, error: 'Không thể tạo tài khoản' },
        { status: 500 }
      );
    }

    // ✅ FIX: Lấy user data đầy đủ từ database để trả về balance và gán thông báo
    const { getUserById, createNotification } = await import('@/lib/database');
    const fullUser = await getUserById(result.id);

    // ✅ Tự động tạo Welcome Notification
    try {
      if (result.id) {
        await createNotification({
          userId: result.id,
          type: 'system',
          message: `Chào mừng bạn đến với Market Source! Khám phá kho mã nguồn chất lượng cao ngay hôm nay.`,
          isRead: false
        })
      }
    } catch (e) {
      const { logger } = await import('@/lib/logger');
      logger.error('Failed to create welcome notification', e)
    }

    // ✅ Gửi Email Chào mừng (Welcome Email)
    try {
      const { sendWelcomeEmail } = await import('@/lib/email');
      await sendWelcomeEmail(email, name);
    } catch (e) {
      const { logger } = await import('@/lib/logger');
      logger.error('Failed to send welcome email', e);
    }
    // ✅ BUG #7 FIX: Gửi thông báo Telegram cho Admin khi có user mới
    try {
      const { notifyNewUserRegistration } = await import('@/lib/notifications');
      await notifyNewUserRegistration({
        userName: name!,
        userEmail: email!,
        ipAddress: ipAddress || getClientIP(request)
      });
      const { logger } = await import('@/lib/logger');
      logger.info('Telegram notification sent for new user registration');
    } catch (teleErr: any) {
      const { logger } = await import('@/lib/logger');
      logger.warn('Failed to send Telegram notification for registration', teleErr);
    }

    // ✅ BUG #10: Notification Wrapper (Optional/Old)
    try {
      if ((globalThis as any).notifyNewUser) {
        (globalThis as any).notifyNewUser({ email, name });
      }
    } catch (e) {
      const { logger } = await import('@/lib/logger');
      logger.debug('New user notification wrapper failed', { error: e instanceof Error ? e.message : String(e) });
    }

    // Link referral only after successful account creation
    if (referrer && result.id) {
      try {
        const { createReferral } = await import('@/lib/database');
        await createReferral(referrer.id, result.id);
        const { logger } = await import('@/lib/logger');
        logger.info('Referral linked successfully', { referrerId: referrer.id, referredId: result.id });
      } catch (refError) {
        const { logger } = await import('@/lib/logger');
        logger.error('Failed to link referral', refError);
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Đăng ký thành công. Vui lòng kiểm tra email để xác minh tài khoản.',
      needsEmailVerification: true,
      userId: result.id,
      user: {
        id: result.id,
        uid: typeof result.id === 'string' ? result.id : String(result.id), // ✅ BUG #46: Safe cast
        email,
        name,
        username: username || name,
        role: fullUser?.role || 'user',
        balance: fullUser?.balance ? parseFloat(String(fullUser.balance)) : 0,
      },
    });

  } catch (error: any) {
    const { logger } = await import('@/lib/logger');
    logger.error('Register API error', error, { email, endpoint: '/api/register' });

    // ✅ FIX: Handle unique constraint violation - sanitize error messages
    const { createErrorResponse } = await import('@/lib/error-handler');
    const isDevelopment = process.env.NODE_ENV === 'development';

    if (error.code === '23505') {
      const errorDetail = error.detail || '';
      // ✅ SECURITY: Sanitize error message để không leak database structure
      if (errorDetail.includes('email')) {
        return NextResponse.json(
          { success: false, error: isDevelopment ? 'Email này đã được đăng ký' : 'Thông tin đăng ký không hợp lệ' },
          { status: 400 }
        );
      } else if (errorDetail.includes('username')) {
        // ✅ FIX: Username đã được xử lý tự động trong createOrUpdateUser, nhưng vẫn có thể fail
        // Retry với username mới - chỉ retry nếu các biến đã được gán
        if (email && name && passwordHash && ipAddress) {
          try {
            const retryUsername = username || name || `user_${Date.now()}`;
            const uniqueUsername = `${retryUsername}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

            const retryResult = await createOrUpdateUser({
              email: email!,
              name: name!,
              username: uniqueUsername,
              passwordHash: passwordHash!,
              ipAddress: ipAddress!,
              role: 'user',
            });

            if (retryResult && retryResult.id) {
              const { getUserById } = await import('@/lib/database');
              const fullUser = await getUserById(retryResult.id);

              return NextResponse.json({
                success: true,
                message: 'Đăng ký thành công (username đã được tự động điều chỉnh)',
                userId: retryResult.id,
                user: {
                  id: retryResult.id,
                  uid: String(retryResult.id),
                  email: email!,
                  name: name!,
                  username: uniqueUsername,
                  role: fullUser?.role || 'user',
                  balance: fullUser?.balance ? parseFloat(String(fullUser.balance)) : 0,
                },
              });
            }
          } catch (retryError) {
            const { logger } = await import('@/lib/logger');
            logger.error('Retry register failed', retryError, { email, endpoint: '/api/register' });
          }
        }

        return NextResponse.json(
          { success: false, error: isDevelopment ? 'Username này đã được sử dụng. Vui lòng chọn username khác.' : 'Thông tin đăng ký không hợp lệ' },
          { status: 400 }
        );
      }

      return NextResponse.json(
        { success: false, error: isDevelopment ? 'Thông tin đăng ký đã tồn tại. Vui lòng thử lại.' : 'Thông tin đăng ký không hợp lệ' },
        { status: 400 }
      );
    }

    // ✅ SECURITY: Sanitize all other errors
    return NextResponse.json(
      createErrorResponse(error, 500, isDevelopment),
      { status: 500 }
    );
  }
}
