import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

// Firebase Admin initialization (lazy load)
let firebaseAdmin: any = null;

async function getFirebaseAdmin() {
  if (firebaseAdmin) {
    return firebaseAdmin;
  }

  try {
    const admin = await import('firebase-admin/app');
    const { getApps, initializeApp, cert } = await import('firebase-admin/app');
    const { getAuth } = await import('firebase-admin/auth');

    const apps = getApps();
    if (apps.length === 0) {
      initializeApp({
        credential: cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        }),
      });
    }

    firebaseAdmin = { getAuth };
    return firebaseAdmin;
  } catch (error) {
    const { logger } = await import('@/lib/logger');
    logger.error('Error initializing Firebase Admin', error);
    // Fallback: nếu không có Firebase Admin, vẫn cho phép chạy (optional)
    return null;
  }
}

/**
 * Verify Firebase token từ request
 * ✅ SECURITY FIX: Email-based auth với flag riêng, rate limiting và secret verification
 */
export async function verifyFirebaseToken(
  request: NextRequest
): Promise<{ uid: string; email: string | null } | null> {
  try {
    const authHeader = request.headers.get('Authorization');
    const userEmail = request.headers.get('X-User-Email');
    const emailAuthSecret = request.headers.get('X-Email-Auth-Secret');

    // ✅ SECURITY FIX: Chỉ cho phép email-based auth với flag riêng VÀ secret
    // Không dựa vào NODE_ENV để tránh misconfiguration
    const ALLOW_EMAIL_AUTH = process.env.ALLOW_EMAIL_AUTH === 'true';
    const EMAIL_AUTH_SECRET = process.env.EMAIL_AUTH_SECRET;
    const IS_DEVELOPMENT = process.env.NODE_ENV === 'development';

    // ✅ SECURITY FIX: Email-based auth chỉ hoạt động khi:
    // 1. Flag ALLOW_EMAIL_AUTH = 'true'
    // 2. Đang ở development mode (BẮT BUỘC)
    // 3. Có secret key match (nếu được set)
    // 4. IP trong whitelist (nếu được set)
    const EMAIL_AUTH_IP_WHITELIST = process.env.EMAIL_AUTH_IP_WHITELIST?.split(',').map(ip => ip.trim()) || [];
    const clientIP = getClientIP(request);

    // ✅ FIX: Tự động cho phép localhost trong môi trường development
    const isLocalhost = clientIP === '127.0.0.1' || clientIP === '::1' || clientIP === '::ffff:127.0.0.1';
    const isIPAllowed = (IS_DEVELOPMENT && isLocalhost) || EMAIL_AUTH_IP_WHITELIST.length === 0 || EMAIL_AUTH_IP_WHITELIST.includes(clientIP);

    const canUseEmailAuth = ALLOW_EMAIL_AUTH && IS_DEVELOPMENT &&
      (!EMAIL_AUTH_SECRET || emailAuthSecret === EMAIL_AUTH_SECRET) &&
      isIPAllowed;

    // ✅ SECURITY: Log email auth attempts
    if (userEmail && !canUseEmailAuth) {
      const { logger } = await import('@/lib/logger');
      logger.warn('Email auth attempt blocked', {
        userEmail,
        ip: clientIP,
        reason: !IS_DEVELOPMENT ? 'production_mode' : !ALLOW_EMAIL_AUTH ? 'flag_disabled' : !isIPAllowed ? 'ip_not_whitelisted' : 'secret_mismatch'
      });
    }

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      if (canUseEmailAuth && userEmail) {
        // ✅ Rate limiting cho email-based auth
        try {
          const { checkRateLimit } = await import('@/lib/rate-limit');
          const ip = getClientIP(request);
          const rateLimitKey = `email_auth:${userEmail}:${ip}`;
          const rateLimit = await checkRateLimit(rateLimitKey, 120, 60); // 120 requests/minute (for internal api auth checking)

          if (!rateLimit.success) {
            const { logger } = await import('@/lib/logger');
            logger.warn('Too many email auth attempts', { userEmail, ip });
            return null;
          }
        } catch (rateLimitError) {
          const { logger } = await import('@/lib/logger');
          logger.warn('Rate limit check failed, denying email auth', { error: rateLimitError });
          return null;
        }

        // ✅ Security: Verify email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(userEmail)) {
          const { logger } = await import('@/lib/logger');
          logger.warn('Invalid email format', { userEmail });
          return null;
        }

        // ✅ Verify user exists in database
        const { getUserIdByEmail } = await import('@/lib/database');
        const userId = await getUserIdByEmail(userEmail);
        if (userId) {
          const { logger } = await import('@/lib/logger');
          logger.info('Email-based auth successful (DEV ONLY)', { userEmail, userId });
          return {
            uid: `email_${userId}`,
            email: userEmail,
          };
        } else {
          const { logger } = await import('@/lib/logger');
          logger.warn('User not found in database', { userEmail });
        }
      } else {
        // ✅ FIX: Chỉ warning khi thực sự cần thiết, không spam log
        const { logger } = await import('@/lib/logger');
        if (emailAuthSecret && EMAIL_AUTH_SECRET && emailAuthSecret !== EMAIL_AUTH_SECRET) {
          logger.warn('Email auth secret mismatch');
        } else if (!IS_DEVELOPMENT && userEmail) {
          logger.warn('Email-based auth is disabled in production. Bearer token required.');
        } else if (!ALLOW_EMAIL_AUTH && userEmail && IS_DEVELOPMENT) {
          logger.warn('Email-based auth is disabled. Set ALLOW_EMAIL_AUTH=true to enable.');
        }
      }
      return null;
    }

    const token = authHeader.split('Bearer ')[1];

    if (!token) {
      return null;
    }

    const admin = await getFirebaseAdmin();

    if (!admin) {
      // ✅ SECURITY FIX: Email-based auth fallback chỉ khi được phép
      const ALLOW_EMAIL_AUTH = process.env.ALLOW_EMAIL_AUTH === 'true';
      const IS_DEVELOPMENT = process.env.NODE_ENV === 'development';
      const EMAIL_AUTH_SECRET = process.env.EMAIL_AUTH_SECRET;
      const emailAuthSecret = request.headers.get('X-Email-Auth-Secret');

      const EMAIL_AUTH_IP_WHITELIST = process.env.EMAIL_AUTH_IP_WHITELIST?.split(',').map(ip => ip.trim()) || [];
      const clientIP = getClientIP(request);
      const isIPAllowed = EMAIL_AUTH_IP_WHITELIST.length === 0 || EMAIL_AUTH_IP_WHITELIST.includes(clientIP);

      const canUseEmailAuth = ALLOW_EMAIL_AUTH && IS_DEVELOPMENT &&
        (!EMAIL_AUTH_SECRET || emailAuthSecret === EMAIL_AUTH_SECRET) &&
        isIPAllowed;

      if (canUseEmailAuth && userEmail) {
        // ✅ Rate limiting
        try {
          const { checkRateLimit } = await import('@/lib/rate-limit');
          const ip = getClientIP(request);
          const rateLimitKey = `email_auth:${userEmail}:${ip}`;
          const rateLimit = await checkRateLimit(rateLimitKey, 120, 60);

          if (!rateLimit.success) {
            return null;
          }
        } catch (rateLimitError) {
          return null;
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (emailRegex.test(userEmail)) {
          const { getUserIdByEmail } = await import('@/lib/database');
          const userId = await getUserIdByEmail(userEmail);
          if (userId) {
            const { logger } = await import('@/lib/logger');
            logger.info('Email-based auth successful (DEV ONLY - no Firebase Admin)', { userEmail, userId });
            return {
              uid: `email_${userId}`,
              email: userEmail,
            };
          }
        }
      }
      const { logger } = await import('@/lib/logger');
      logger.warn('Firebase Admin not available. Email-based auth is disabled in production.');
      return null;
    }

    const auth = admin.getAuth();
    const decodedToken = await auth.verifyIdToken(token);

    return {
      uid: decodedToken.uid,
      email: decodedToken.email || null,
    };
  } catch (error) {
    // ✅ SECURITY FIX: Email fallback chỉ khi được phép và có rate limiting
    const { logger } = await import('@/lib/logger');
    logger.warn('Firebase token verification failed', { error: error instanceof Error ? error.message : error });

    const ALLOW_EMAIL_AUTH = process.env.ALLOW_EMAIL_AUTH === 'true';
    const IS_DEVELOPMENT = process.env.NODE_ENV === 'development';
    const EMAIL_AUTH_SECRET = process.env.EMAIL_AUTH_SECRET;
    const emailAuthSecret = request.headers.get('X-Email-Auth-Secret');

    const EMAIL_AUTH_IP_WHITELIST = process.env.EMAIL_AUTH_IP_WHITELIST?.split(',').map(ip => ip.trim()) || [];
    const clientIP = getClientIP(request);
    const isIPAllowed = EMAIL_AUTH_IP_WHITELIST.length === 0 || EMAIL_AUTH_IP_WHITELIST.includes(clientIP);

    const canUseEmailAuth = ALLOW_EMAIL_AUTH && IS_DEVELOPMENT &&
      (!EMAIL_AUTH_SECRET || emailAuthSecret === EMAIL_AUTH_SECRET) &&
      isIPAllowed;

    if (canUseEmailAuth) {
      try {
        const userEmail = request.headers.get('X-User-Email');
        if (userEmail) {
          // ✅ Rate limiting
          const { checkRateLimit } = await import('@/lib/rate-limit');
          const ip = getClientIP(request);
          const rateLimitKey = `email_auth:${userEmail}:${ip}`;
          const rateLimit = await checkRateLimit(rateLimitKey, 120, 60);

          if (!rateLimit.success) {
            return null;
          }

          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (emailRegex.test(userEmail)) {
            const { getUserIdByEmail } = await import('@/lib/database');
            const userId = await getUserIdByEmail(userEmail);
            if (userId) {
              logger.info('Email-based auth successful (DEV ONLY - token error fallback)', { userEmail, userId });
              return {
                uid: `email_${userId}`,
                email: userEmail,
              };
            }
          }
        }
      } catch (fallbackError) {
        logger.error('Email fallback also failed', fallbackError);
      }
    } else {
      logger.warn('Email-based auth fallback is disabled');
    }
    return null;
  }
}

/**
 * Require authentication - throw error nếu không authenticated
 */
export async function requireAuth(request: NextRequest) {
  const user = await verifyFirebaseToken(request);

  if (!user) {
    throw new Error('Unauthorized: Authentication required');
  }

  return user;
}

/**
 * Require admin authentication
 * Kiểm tra cả Firebase token và admin token (JWT)
 */
async function isDatabaseAdmin(email: string | null): Promise<boolean> {
  if (!email) {
    return false;
  }
  const { getUserIdByEmailMySQL, getUserByIdMySQL } = await import('@/lib/database-mysql');
  const userId = await getUserIdByEmailMySQL(email);
  if (!userId) {
    return false;
  }

  const user = await getUserByIdMySQL(userId);
  return user != null && (user.role === 'admin' || user.role === 'superadmin');
}

async function validateAdminToken(token?: string | null) {
  if (!token) {
    return null;
  }

  try {
    const { verifyAdminToken } = await import('@/lib/jwt');
    const decoded = await verifyAdminToken(token);

    if (decoded && decoded.role === 'admin') {
      return {
        uid: decoded.userId || 'admin-token',
        email: decoded.email || process.env.ADMIN_EMAIL || null,
      };
    }
  } catch (error) {
    const { logger } = await import('@/lib/logger');
    logger.warn('Admin token verification failed', {
      error: error instanceof Error ? error.message : error,
    });
  }

  return null;
}

export async function requireAdmin(request: NextRequest) {
  const tokenFromCookie = request.cookies.get('admin-token')?.value;
  const tokenFromHeader = request.headers.get('X-Admin-Token');
  const adminIdentity = await validateAdminToken(tokenFromCookie || tokenFromHeader);

  if (adminIdentity) {
    return adminIdentity;
  }

  const user = await verifyFirebaseToken(request);

  if (!user) {
    throw new Error('Unauthorized: Authentication required');
  }

  const hasAdminRole = await isDatabaseAdmin(user.email);

  if (hasAdminRole) {
    return user;
  }

  throw new Error('Unauthorized: Admin access required');
}

/**
 * Validate request body với Zod schema hoặc required fields
 */
export function validateRequest<T>(
  body: any,
  schemaOrRequired: z.ZodSchema<T> | { required: string[] }
): { valid: boolean; data?: T; error?: string } {
  try {
    // Nếu là Zod schema
    if ('safeParse' in schemaOrRequired) {
      const validation = (schemaOrRequired as z.ZodSchema<T>).safeParse(body);

      if (!validation.success) {
        return {
          valid: false,
          error: validation.error.errors[0]?.message || 'Validation failed',
        };
      }

      return {
        valid: true,
        data: validation.data,
      };
    }
    // Nếu là object với required fields
    else {
      const required = (schemaOrRequired as { required: string[] }).required;
      const missingFields = required.filter(field => !(field in body) || body[field] === undefined || body[field] === null);

      if (missingFields.length > 0) {
        return {
          valid: false,
          error: `Missing required fields: ${missingFields.join(', ')}`,
        };
      }

      return {
        valid: true,
        data: body as T,
      };
    }
  } catch (error: any) {
    return {
      valid: false,
      error: error.message || 'Validation error',
    };
  }
}

/**
 * Get IP address từ request
 */
export function getClientIP(request: NextRequest): string {
  const forwardedFor = request.headers.get('x-forwarded-for');
  const realIP = request.headers.get('x-real-ip');
  const cfIP = request.headers.get('cf-connecting-ip');
  const nfIP = request.headers.get('x-nf-client-connection-ip');

  if (cfIP) return cfIP.split(',')[0].trim();
  if (nfIP) return nfIP.split(',')[0].trim();
  if (forwardedFor) return forwardedFor.split(',')[0].trim();
  if (realIP) return realIP.trim();

  const requestWithIp = request as NextRequest & { ip?: string | null };
  return requestWithIp.ip || '127.0.0.1';
}

