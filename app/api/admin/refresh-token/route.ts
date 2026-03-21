import { NextRequest, NextResponse } from "next/server"
import { verifyAdminToken, createAdminToken } from "@/lib/jwt"

export const runtime = "nodejs"

/**
 * Admin Token Refresh Endpoint
 * Cho phép admin refresh token trước khi hết hạn (24h)
 * để tránh bị logout giữa session dài.
 */
export async function POST(request: NextRequest) {
  try {
    // ✅ Get current admin token
    const adminToken = request.cookies.get('admin-token')?.value;

    if (!adminToken) {
      return NextResponse.json(
        { success: false, error: 'No admin token found' },
        { status: 401 }
      );
    }

    // ✅ Verify current token is still valid
    const payload = await verifyAdminToken(adminToken);
    if (!payload) {
      return NextResponse.json(
        { success: false, error: 'Invalid or expired admin token' },
        { status: 401 }
      );
    }

    // ✅ Issue new token with fresh 24h expiry
    const newToken = await createAdminToken(payload.userId, payload.email);

    const response = NextResponse.json({
      success: true,
      message: 'Admin token refreshed successfully',
      timestamp: new Date().toISOString(),
    });

    // ✅ Set new httpOnly cookie
    response.cookies.set('admin-token', newToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 86400, // 24h
      sameSite: 'lax',
      path: '/',
    });

    return response;
  } catch (error: any) {
    const { logger } = await import('@/lib/logger');
    logger.error('Error refreshing admin token', error);

    return NextResponse.json(
      { success: false, error: 'Failed to refresh token' },
      { status: 500 }
    );
  }
}
