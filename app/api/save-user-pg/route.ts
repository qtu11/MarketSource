import { NextRequest, NextResponse } from 'next/server';
import { getClientIP, requireAdmin } from '@/lib/api-auth';
import { createOrUpdateUser } from '@/lib/database-mysql';
import bcrypt from 'bcryptjs';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs'

/**
 * API để lưu/cập nhật user vào PostgreSQL
 * Được gọi từ OAuth callbacks hoặc register/login
 */
export async function POST(request: NextRequest) {
  try {
    // ✅ FIX: Protect this endpoint to prevent Account Takeover
    await requireAdmin(request);

    const body = await request.json();
    const {
      email,
      name,
      username,
      password,
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

    // Lấy IP từ request nếu không có trong body
    const ipAddress = providedIp || getClientIP(request);

    // Hash password nếu có
    let passwordHash: string | undefined = undefined;
    if (password) {
      passwordHash = await bcrypt.hash(password, 10);
    }

    // Tạo hoặc cập nhật user
    const result = await createOrUpdateUser({
      email,
      name: name || username,
      username,
      passwordHash,
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
    logger.error('Save user to PostgreSQL error', error, { endpoint: '/api/save-user-pg' });
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to save user' },
      { status: 500 }
    );
  }
}
