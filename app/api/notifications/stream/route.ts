import { NextRequest } from 'next/server';
import { notificationEmitter, NOTIFICATION_EVENTS } from '@/lib/events';
import { verifyFirebaseToken } from '@/lib/api-auth';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * API SSE (Server-Sent Events)
 * Cung cấp luồng dữ liệu thời gian thực cho Client lắng nghe thông báo.
 */
export async function GET(req: NextRequest) {
  // 1. Xác thực người dùng (Tùy chọn: nếu muốn stream riêng cho từng user)
  let userId: string | null = null;
  try {
    const user = await verifyFirebaseToken(req);
    userId = user?.uid || null;
  } catch (err) {
    // Cho phép anonymous stream nếu cần, hoặc chặn tùy logic
    logger.warn('SSE: Anonymous or invalid token connection');
  }

  const responseStream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      // Hàm gửi dữ liệu SSE chuẩn: "data: <json>\n\n"
      const emit = (data: any) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      // Gửi gói tin ping mỗi 30s để giữ connection
      const keepAlive = setInterval(() => {
        controller.enqueue(encoder.encode(': ping\n\n'));
      }, 30000);

      // Lắng nghe sự kiện từ Event Bus (lib/events.ts)
      const onNotification = (notification: any) => {
        // Kiểm tra xem thông báo này có dành cho user hiện tại không
        // Nếu notification.user_id khớp với userId (hoặc thông báo global)
        // Lưu ý: userId từ firebase là string, user_id trong DB thường là number
        // Cần đồng nhất hoặc gửi hết cho client tự filter (đơn giản hơn trong dev)
        emit(notification);
      };

      notificationEmitter.on(NOTIFICATION_EVENTS.NEW_NOTIFICATION, onNotification);

      // Khi client đóng kết nối
      req.signal.addEventListener('abort', () => {
        clearInterval(keepAlive);
        notificationEmitter.off(NOTIFICATION_EVENTS.NEW_NOTIFICATION, onNotification);
        controller.close();
      });
    },
  });

  return new Response(responseStream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}
