import { NextRequest, NextResponse } from 'next/server';
import { getClientIP, requireAdmin } from '@/lib/api-auth';
import { createOrUpdateUser } from '@/lib/database-mysql';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs'

/**
 * API để lưu/cập nhật user vào PostgreSQL
 * Được gọi từ OAuth callbacks hoặc register/login
 * Alias cho save-user-pg để tương thích với code cũ
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      email,
      name,
      username,
      avatarUrl,
      provider,
      ipAddress: providedIp,
    } = body;

    if (!email) {
      return NextResponse.json(
        { success: false, error: 'Email is required' },
        { status: 400 }
      );
    }

    // ✅ FIX SECURITY: Mọi request update profile phải đi kèm verify token
    const { getServerSession } = await import('next-auth');
    const { authOptions } = await import('@/lib/next-auth');
    const session = await getServerSession(authOptions);

    if (!session || !session.user || session.user.email !== email) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized profile update request' },
        { status: 401 }
      );
    }

    // Lấy IP từ request nếu không có trong body
    const ipAddress = providedIp || getClientIP(request);

    // Tạo hoặc cập nhật user (Không bao giờ cho phép update password qua route này)
    const result = await createOrUpdateUser({
      email,
      name: name || username,
      username,
      passwordHash: undefined,
      avatarUrl,
      ipAddress,
      role: 'user', // Default role, có thể thay đổi sau
    });

    return NextResponse.json({
      success: true,
      userId: result.id,
      isNew: result.isNew,
      message: result.isNew ? 'User created successfully' : 'User updated successfully',
    });
  } catch (error: any) {
    logger.error('Save user to PostgreSQL error', error, { endpoint: '/api/save-user' });
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to save user' },
      { status: 500 }
    );
  }
}
