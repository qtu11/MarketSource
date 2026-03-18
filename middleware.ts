import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'

/**
 * ✅ SECURITY FIX: Middleware with authentication guard
 * - Bảo vệ /admin/* routes (chỉ admin)
 * - Bảo vệ /dashboard/* routes (user đã đăng nhập)
 * - Block Vite-related requests
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

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

  // ✅ SECURITY: Bảo vệ /admin routes — chỉ cho admin
  if (pathname.startsWith('/admin') && !pathname.startsWith('/admin/login')) {
    try {
      const token = await getToken({
        req: request,
        secret: process.env.NEXTAUTH_SECRET,
      })

      if (!token) {
        // Kiểm tra admin-token cookie (JWT login riêng của admin)
        const adminToken = request.cookies.get('admin-token')?.value
        if (!adminToken) {
          const loginUrl = new URL('/admin/login', request.url)
          loginUrl.searchParams.set('callbackUrl', pathname)
          return NextResponse.redirect(loginUrl)
        }
      }
    } catch (error) {
      // Nếu token check lỗi → redirect về login
      const loginUrl = new URL('/admin/login', request.url)
      loginUrl.searchParams.set('callbackUrl', pathname)
      return NextResponse.redirect(loginUrl)
    }
  }

  // ✅ SECURITY: Bảo vệ /dashboard routes — user phải đăng nhập
  if (pathname.startsWith('/dashboard')) {
    try {
      const token = await getToken({
        req: request,
        secret: process.env.NEXTAUTH_SECRET,
      })

      if (!token) {
        // Kiểm tra auth-token cookie hoặc session-token
        const authToken = request.cookies.get('auth-token')?.value
        const sessionToken = request.cookies.get('next-auth.session-token')?.value
        const secureSessionToken = request.cookies.get('__Secure-next-auth.session-token')?.value

        if (!authToken && !sessionToken && !secureSessionToken) {
          const loginUrl = new URL('/auth/login', request.url)
          loginUrl.searchParams.set('callbackUrl', pathname)
          return NextResponse.redirect(loginUrl)
        }
      }
    } catch (error) {
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
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
}
