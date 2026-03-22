import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { jwtVerify } from 'jose'
import { verifyCsrfTokenEdge } from './lib/csrf-edge'

/**
 * Admin: NextAuth (role=admin) HOẶC cookie admin-token từ POST /api/admin-login (JWT jose, cùng secret với lib/jwt).
 */
async function isAdminAuthorized(request: NextRequest): Promise<boolean> {
  try {
    const nextAuth = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
    })
    if (nextAuth && (nextAuth as { role?: string }).role === 'admin') {
      return true
    }
  } catch {
    /* ignore */
  }

  const raw = request.cookies.get('admin-token')?.value
  if (!raw) return false

  const secretKey = process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET
  if (!secretKey || secretKey.length < 32) return false

  try {
    const secret = new TextEncoder().encode(secretKey)
    const { payload } = await jwtVerify(raw, secret)
    return payload.role === 'admin'
  } catch {
    return false
  }
}

/**
 * User đã đăng nhập: NextAuth session (OAuth / session cookie) HOẶC JWT `auth-token`
 * từ POST /api/login (đăng nhập email + mật khẩu — không tạo session NextAuth).
 */
async function isDashboardUserAuthorized(request: NextRequest): Promise<boolean> {
  try {
    const nextAuth = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
    })
    if (nextAuth) {
      return true
    }
  } catch {
    /* ignore */
  }

  const raw = request.cookies.get("auth-token")?.value
  if (!raw) return false

  const secretKey = process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET
  if (!secretKey || secretKey.length < 32) return false

  try {
    const secret = new TextEncoder().encode(secretKey)
    const { payload } = await jwtVerify(raw, secret)
    // jwtVerify đã kiểm tra chữ ký và exp (mặc định jose)
    const email = payload.email
    const uid = payload.userId ?? payload.sub
    const emailOk = typeof email === 'string' && email.trim().length > 0
    const uidOk =
      uid !== undefined &&
      uid !== null &&
      String(uid).trim().length > 0
    return emailOk || uidOk
  } catch {
    return false
  }
}

/**
 * ✅ SECURITY FIX: Middleware with authentication guard
 * - Bảo vệ /admin/* routes (chỉ admin)
 * - Bảo vệ /dashboard/* routes (user đã đăng nhập)
 * - Block Vite-related requests
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Chrome DevTools tự GET path này; không có route → 404 trong log. Trả JSON rỗng.
  if (pathname === '/.well-known/appspecific/com.chrome.devtools.json') {
    return NextResponse.json({}, { status: 200 })
  }

  const mutatingApi =
    pathname.startsWith('/api/') &&
    ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)

  if (mutatingApi) {
    // Chỉ miễn các endpoint không thể có CSRF sẵn (OAuth, webhook, health, cấp token).
    // /api/admin/* yêu cầu CSRF ở middleware; handler requireAdmin vẫn kiểm tra thêm khi cần.
    const csrfExempt = [
      '/api/auth/',
      '/api/telegram-webhook',
      '/api/health',
      '/api/csrf',
      '/api/admin-login',
      '/api/analytics/track',
    ]
    if (!csrfExempt.some((p) => pathname.startsWith(p))) {
      const csrfHeader = request.headers.get('X-CSRF-Token')
      const csrfCookie = request.cookies.get('csrf-token')?.value
      if (!csrfHeader || !csrfCookie) {
        return NextResponse.json(
          { success: false, error: 'CSRF token missing' },
          { status: 403 }
        )
      }
      const ok = await verifyCsrfTokenEdge(csrfHeader, csrfCookie)
      if (!ok) {
        return NextResponse.json(
          { success: false, error: 'Invalid CSRF token' },
          { status: 403 }
        )
      }
    }
  }

  // ✅ FIX: Ignore Vite-related requests (có thể từ browser extension hoặc cache)
  if (
    pathname.includes('@vite') ||
    pathname.includes('@react-refresh') ||
    pathname.includes('/src/main.tsx') ||
    pathname.includes('vite.svg') ||
    pathname.startsWith('/@')
  ) {
    return new NextResponse(null, { status: 404 })
  }

  // ✅ FIX: Redirect icon-192.png to logoqtusdev.png
  if (pathname === '/icon-192.png') {
    return NextResponse.redirect(new URL('/logoqtusdev.png', request.url))
  }

  // ✅ SECURITY: /admin — NextAuth admin HOẶC JWT cookie admin-token (đăng nhập qua /api/admin-login)
  if (pathname.startsWith('/admin') && !pathname.startsWith('/admin/login')) {
    const allowed = await isAdminAuthorized(request)
    if (!allowed) {
      const loginUrl = new URL('/admin/login', request.url)
      loginUrl.searchParams.set('callbackUrl', pathname)
      return NextResponse.redirect(loginUrl)
    }
  }

  // ✅ SECURITY: /dashboard, nạp/rút — NextAuth HOẶC cookie auth-token (/api/login)
  if (pathname.startsWith('/dashboard') || pathname === '/deposit' || pathname === '/withdraw') {
    const allowed = await isDashboardUserAuthorized(request)
    if (!allowed) {
      const loginUrl = new URL('/auth/login', request.url)
      loginUrl.searchParams.set('callbackUrl', pathname)
      return NextResponse.redirect(loginUrl)
    }
  }

  // ✅ SECURITY: Thêm security headers
  const response = NextResponse.next()

  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-XSS-Protection', '1; mode=block')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
