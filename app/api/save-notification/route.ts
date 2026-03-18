export const runtime = 'nodejs'

// /app/api/save-notification/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createNotification } from "@/lib/database-mysql";
import { logger } from "@/lib/logger";

export async function POST(request: NextRequest) {
  try {
    // ✅ BUG #6 FIX: Thêm auth check - chỉ admin hoặc server internal được tạo notification
    const { requireAdmin } = await import('@/lib/api-auth');
    await requireAdmin(request);

    const notificationData = await request.json();
    
    // ✅ FIX: Dùng database.ts thay vì mysql.ts
    // ✅ FIX: Normalize userId - cần convert sang number nếu là string
    let userId: number;
    if (typeof notificationData.userId === 'number') {
      userId = notificationData.userId;
    } else if (typeof notificationData.user_id === 'number') {
      userId = notificationData.user_id;
    } else {
      // Nếu là string (Firebase UID), cần convert sang DB ID
      const { getUserIdByEmail } = await import('@/lib/database-mysql');
      const normalizedUserId = await getUserIdByEmail(notificationData.userEmail || '');
      if (!normalizedUserId) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }
      userId = normalizedUserId;
    }
    
    const result = await createNotification({
      userId: userId,
      type: notificationData.type || 'system',
      message: notificationData.message || notificationData.content || notificationData.title || 'Thông báo',
      isRead: notificationData.isRead || false,
    });
    
    return NextResponse.json({ success: true, id: result.id });
  } catch (error: any) {
    logger.error('Error saving notification', error, { endpoint: '/api/save-notification' });
    if (error.message?.includes('Unauthorized')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: error.message || 'Failed to save notification' }, { status: 500 });
  }
}

