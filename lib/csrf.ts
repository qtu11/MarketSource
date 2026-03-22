/**
 * CSRF Protection Middleware
 * ✅ SECURITY FIX: CSRF protection cho admin routes
 */

import { NextRequest, NextResponse } from 'next/server';
import { randomBytes, createHash, timingSafeEqual } from 'crypto';

// ✅ FIX: Đảm bảo secret đồng bộ giữa Node và Edge, dùng NEXTAUTH_SECRET làm fallback tin cậy
const CSRF_SECRET = process.env.CSRF_SECRET || process.env.NEXTAUTH_SECRET || 'dev-csrf-secret-only';

/**
 * Generate CSRF token
 */
export function generateCSRFToken(): string {
  const token = randomBytes(32).toString('hex');
  return token;
}

/**
 * Hash CSRF token để lưu trong cookie
 */
export function hashCSRFToken(token: string): string {
  return createHash('sha256').update(token + CSRF_SECRET).digest('hex');
}

/**
 * Verify CSRF token
 */
export function verifyCSRFToken(token: string, hashedToken: string): boolean {
  try {
    const expectedHash = hashCSRFToken(token);
    const expectedBuffer = Buffer.from(expectedHash, 'hex');
    const actualBuffer = Buffer.from(hashedToken, 'hex');
    
    if (expectedBuffer.length !== actualBuffer.length) {
      return false;
    }
    
    return timingSafeEqual(expectedBuffer, actualBuffer);
  } catch (error) {
    return false;
  }
}

/**
 * CSRF Protection Middleware
 * Kiểm tra CSRF token từ header và cookie
 */
export function csrfProtection(request: NextRequest): { valid: boolean; error?: string } {
  // Skip CSRF check cho GET requests (read-only)
  if (request.method === 'GET' || request.method === 'HEAD' || request.method === 'OPTIONS') {
    return { valid: true };
  }

  const csrfToken = request.headers.get('X-CSRF-Token');
  const csrfCookie = request.cookies.get('csrf-token')?.value;

  if (!csrfToken || !csrfCookie) {
    if (process.env.NODE_ENV === 'development') {
      const { logger } = require('@/lib/logger');
      logger.error('CSRF token missing', { hasTokenHeader: !!csrfToken, hasCookie: !!csrfCookie });
    }
    return { valid: false, error: 'CSRF token missing' };
  }

  if (!verifyCSRFToken(csrfToken, csrfCookie)) {
    if (process.env.NODE_ENV === 'development') {
      const { logger } = require('@/lib/logger');
      // ✅ FIX: Truyền null/Error cho param 2, context cho param 3 để in string hợp lệ thay vì [object Object]
      logger.error('Invalid CSRF token sequence', new Error('Mismatch'), { csrfToken, csrfCookie });
    }
    return { valid: false, error: 'Invalid CSRF token' };
  }

  return { valid: true };
}

/**
 * Set CSRF token cookie trong response
 */
export function setCSRFTokenCookie(response: NextResponse, token: string): NextResponse {
  const hashedToken = hashCSRFToken(token);
  
  // ✅ FIX: Chỉ dùng Secure flag nếu là production THẬT và KHÔNG PHẢI localhost.
  // Nếu NODE_ENV=production nhưng chạy local (ví dụ test build) thì vẫn phải tắt Secure để cookie được gửi qua HTTP.
  const isProduction = process.env.NODE_ENV === 'production';
  const isLocalhost = response.url ? (response.url.includes('localhost') || response.url.includes('127.0.0.1')) : true;

  response.cookies.set('csrf-token', hashedToken, {
    httpOnly: true,
    secure: isProduction && !isLocalhost,
    sameSite: 'lax', // Dùng lax thay vì strict để tránh vấn đề redirect từ login page / oauth
    maxAge: 60 * 60 * 24, // 24 hours
    path: '/',
  });

  return response;
}

