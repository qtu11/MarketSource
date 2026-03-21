export const runtime = 'nodejs'

// /app/api/save-notification/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createNotification } from "@/lib/database";
import { logger } from "@/lib/logger";

export async function POST(request: NextRequest) {
  try {
    // ✅ BUG #6 FIX: Thêm auth check - chỉ admin hoặc server internal được tạo notification
    const { requireAdmin } = await import('@/lib/api-auth');
    await requireAdmin(request);

    const notificationData = await request.json();
    
    // ✅ FIX: Dùng database.ts thay vì mysql.ts
    // ✅ FIX: Normalize userId - sử dụng chuẩn hàm normalizeUserId
    const rawUserId = notificationData.userId || notificationData.user_id;
    const { normalizeUserId } = await import('@/lib/database');
    const dbUserId = await normalizeUserId(rawUserId, notificationData.userEmail);
    
    if (!dbUserId) {
      return NextResponse.json({ error: 'User not found in database. Please ensure user account is synchronized.' }, { status: 404 });
    }
    
    let userId = dbUserId;
    
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

