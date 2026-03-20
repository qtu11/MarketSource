import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/lib/logger'

export const runtime = 'nodejs'

/**
 * Admin logout endpoint
 * Clears admin-token cookie
 */
export async function POST(request: NextRequest) {
  try {
    // ✅ BUG #6 FIX: Invalidate admin token in server-side blacklist
    const tokenCookie = request.cookies.get('admin-token')?.value;
    const tokenHeader = request.headers.get('X-Admin-Token');
    const token = tokenCookie || tokenHeader;

    if (token) {
      const { invalidateAdminToken } = await import('@/lib/jwt');
      invalidateAdminToken(token);
    }

    const response = NextResponse.json({
      success: true,
      message: 'Logged out successfully',
    })

    // Clear admin-token cookie
    response.cookies.set('admin-token', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 0, // Expire immediately
      path: '/',
    })

    // Clear CSRF token cookie
    response.cookies.set('csrf-token', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 0,
      path: '/',
    })

    return response
  } catch (error) {
    logger.error('Admin logout error', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Logout failed',
      },
      { status: 500 }
    )
  }
}
