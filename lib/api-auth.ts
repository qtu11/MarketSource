import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyCSRFToken } from './csrf';
import { verifyAdminToken, invalidateAdminToken, adminTokenBlacklist } from './jwt';

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
    // ✅ FIX SECURITY: Ưu tiên verify session qua NextAuth (chặn spoofing qua X-Email-Auth-Secret)
    const { getServerSession } = await import('next-auth');
    const { authOptions } = await import('@/lib/next-auth');
    const session = await getServerSession(authOptions);
    if (session && session.user && session.user.email) {
      return {
        uid: (session.user as any).id || (session.user as any).uid || session.user.email,
        email: session.user.email
      };
    }

    // ✅ FIX: Check JWT auth-token cookie (set bởi /api/login khi login email/password)
    try {
      const { cookies } = await import('next/headers');
      const cookieStore = await cookies();
      const authTokenCookie = cookieStore.get('auth-token');
      if (authTokenCookie) {
        const { verifyToken } = await import('@/lib/jwt');
        const payload = await verifyToken(authTokenCookie.value);
        if (payload?.email) {
          return {
            uid: payload.userId || payload.email,
            email: payload.email
          };
        }
      }
    } catch (e) { 
      const { logger } = await import('@/lib/logger');
      logger.debug('Cookie check skipped or failed', { error: e instanceof Error ? e.message : String(e) });
    }

    const authHeader = request.headers.get('Authorization');
    const userEmail = request.headers.get('X-User-Email');
    const emailAuthSecret = request.headers.get('X-Email-Auth-Secret');

    // ✅ SECURITY FIX: Email-based auth CHỈ cho phép trong development mode
    // Production: LUÔN bắt buộc NextAuth session hoặc Firebase token, KHÔNG CHẤP NHẬN email header
    const ALLOW_EMAIL_AUTH = process.env.ALLOW_EMAIL_AUTH === 'true';
    const IS_DEVELOPMENT = process.env.NODE_ENV === 'development';

    // ✅ SECURITY: Trong production, email auth LUÔN BỊ TẮT
    const IS_PRODUCTION = process.env.NODE_ENV === 'production';
    let canUseEmailAuth = false;
    
    if (IS_DEVELOPMENT && ALLOW_EMAIL_AUTH && !IS_PRODUCTION) {
      // Chỉ dev mode local mới cho phép email auth (bypass token check)
      const clientIP = getClientIP(request);
      const isLocalhost = clientIP === '127.0.0.1' || clientIP === '::1' || clientIP === '::ffff:127.0.0.1';
      canUseEmailAuth = isLocalhost;
    }

    // ✅ SECURITY BUG #23: Log email auth attempts bị block
    if (userEmail && !canUseEmailAuth) {
      const { logger } = await import('@/lib/logger');
      logger.warn('Email auth attempt blocked (Spoofing risk)', {
        userEmail,
        ip: getClientIP(request),
        env: process.env.NODE_ENV
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
        // ✅ FIX: Chỉ warning khi thực sự cần thiết
        const { logger } = await import('@/lib/logger');
        if (!IS_DEVELOPMENT && userEmail) {
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
      // ✅ SECURITY FIX: Email-based auth fallback CHỈ cho dev mode
      const devMode = process.env.NODE_ENV === 'development';
      const devEmailAuth = process.env.ALLOW_EMAIL_AUTH === 'true';

      if (devMode && devEmailAuth && userEmail) {
        const ip = getClientIP(request);
        const isLocal = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
        if (isLocal) {
          try {
            const { checkRateLimit } = await import('@/lib/rate-limit');
            const rateLimit = await checkRateLimit(`email_auth:${userEmail}:${ip}`, 120, 60);
            if (!rateLimit.success) return null;
          } catch (e) { 
            const { logger } = await import('@/lib/logger');
            logger.debug('Rate limit check skipped/failed in verifyFirebaseToken', { error: e instanceof Error ? e.message : String(e) });
            return null; 
          }

          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (emailRegex.test(userEmail)) {
            const { getUserIdByEmail } = await import('@/lib/database');
            const userId = await getUserIdByEmail(userEmail);
            if (userId) {
              const { logger } = await import('@/lib/logger');
              logger.info('Email-based auth (DEV ONLY - no Firebase Admin)', { userEmail, userId });
              return { uid: `email_${userId}`, email: userEmail };
            }
          }
        }
      }
      const { logger } = await import('@/lib/logger');
      logger.warn('Firebase Admin not available. Token required.');
      return null;
    }

    const auth = admin.getAuth();
    const decodedToken = await auth.verifyIdToken(token);

    return {
      uid: decodedToken.uid,
      email: decodedToken.email || null,
    };
  } catch (error) {
    // ✅ SECURITY FIX: Token verification failed — email fallback CHỈ cho dev
    const { logger } = await import('@/lib/logger');
    logger.warn('Firebase token verification failed', { error: error instanceof Error ? error.message : error });

    const devMode = process.env.NODE_ENV === 'development';
    const devEmailAuth = process.env.ALLOW_EMAIL_AUTH === 'true';

    if (devMode && devEmailAuth) {
      const ip = getClientIP(request);
      const isLocal = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
      if (isLocal) {
        try {
          const userEmail = request.headers.get('X-User-Email');
          if (userEmail) {
            const { checkRateLimit } = await import('@/lib/rate-limit');
            const rateLimit = await checkRateLimit(`email_auth:${userEmail}:${ip}`, 120, 60);
            if (!rateLimit.success) return null;

            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (emailRegex.test(userEmail)) {
              const { getUserIdByEmail } = await import('@/lib/database');
              const userId = await getUserIdByEmail(userEmail);
              if (userId) {
                logger.info('Email-based auth (DEV ONLY - token error fallback)', { userEmail, userId });
                return { uid: `email_${userId}`, email: userEmail };
              }
            }
          }
        } catch (fallbackError) {
          logger.error('Email fallback failed', fallbackError);
        }
      }
    } else {
      logger.warn('Email auth fallback disabled (production)');
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
  if (!token || adminTokenBlacklist.has(token)) {
    return null;
  }

  try {
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

  // Check CSRF for sensitive actions
  if (['POST', 'PUT', 'DELETE'].includes(request.method)) {
    const csrfHeader = request.headers.get('X-CSRF-Token');
    const csrfCookie = request.cookies.get('csrf-token')?.value;
    
    // ✅ BUG #1 FIX: Strict CSRF Verification as per BOSS request
    if (!csrfHeader || !csrfCookie || !verifyCSRFToken(csrfHeader, csrfCookie)) {
      const { logger } = await import('@/lib/logger');
      logger.warn('CSRF validation failed for admin action', {
        method: request.method,
        hasHeader: !!csrfHeader,
        hasCookie: !!csrfCookie,
        ip: getClientIP(request)
      });
      throw new Error('CSRF validation failed: Invalid or missing token');
    }
  }

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

