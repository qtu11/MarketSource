/**
 * CSRF Protection Middleware
 * ✅ SECURITY FIX: CSRF protection cho admin routes
 */

import { NextRequest, NextResponse } from 'next/server';
import { randomBytes, createHash, timingSafeEqual } from 'crypto';

// ✅ BUG #7 FIX: Không dùng hardcoded secret trong production
const CSRF_SECRET = process.env.CSRF_SECRET || (process.env.NODE_ENV === 'production' ? (() => { throw new Error('CSRF_SECRET env variable is required in production!') })() : 'dev-csrf-secret-only');

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
  
  response.cookies.set('csrf-token', hashedToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 60 * 60 * 24, // 24 hours
    path: '/',
  });

  return response;
}

