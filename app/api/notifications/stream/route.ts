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
  let dbUserId: string | number | null = null;
  let authUserEmail: string | null = null;
  let isAdmin = false;

  const authUser = await verifyFirebaseToken(req).catch(() => null);
  if (!authUser) {
    return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  authUserEmail = authUser.email ?? null;
  if (!authUserEmail) {
    return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Fetch user from DB to get ID and role
  const { getUserByEmail } = await import('@/lib/database');
  const dbUser = await getUserByEmail(authUserEmail);
  if (!dbUser) {
    return new Response(JSON.stringify({ success: false, error: 'User not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  dbUserId = dbUser.id;
  isAdmin = dbUser.role === 'admin' || dbUser.role === 'superadmin';

  logger.info('SSE: Client connected', { email: authUserEmail, isAdmin });

  const responseStream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      // Hàm gửi dữ liệu SSE chuẩn: "data: <json>\n\n"
      const emit = (data: any) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch (err) {
          logger.error('SSE: Controller enqueue error', err);
        }
      };

      // Gửi gói tin ping mỗi 30s để giữ connection
      const keepAlive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': ping\n\n'));
        } catch (err) {
          clearInterval(keepAlive);
          logger.debug('SSE: Ping failed, connection likely closed');
        }
      }, 30000);

      // Lắng nghe sự kiện từ Event Bus (lib/events.ts)
      const onNotification = (notification: any) => {
        /**
         * ✅ SECURITY FIX: Lọc thông báo ngay tại server.
         * 1. Thông báo cá nhân: Chỉ gửi nếu notification.user_id khớp với DB ID của người kết nối.
         * 2. Thông báo hệ thống cho Admin: Chỉ gửi nếu người kết nối có role admin/superadmin.
         */
        const isSystemEvent = ['deposit_created', 'withdrawal_created', 'order_created'].includes(notification.type);
        const isPersonalEvent = notification.user_id != null;

        // Giả sử userId từ verifyFirebaseToken là Firebase UID.
        // Cần lấy thêm role từ DB hoặc context để lọc chính xác.
        // Trong route này, chúng ta sẽ tin tưởng notification.user_email hoặc notification.user_id nếu có.

        if (isSystemEvent) {
          // System events chỉ dành cho admin (không fail-open cho user thường).
          if (!isAdmin) return;
          emit(notification);
          return;
        }

        if (isPersonalEvent) {
          if (dbUserId != null && String(notification.user_id) === String(dbUserId)) {
            emit(notification);
          }
          return;
        }

        // Nếu notification không gắn user_id thì chỉ admin mới được xem (giảm rò rỉ).
        if (isAdmin) {
          emit(notification);
        }
      };

      notificationEmitter.on(NOTIFICATION_EVENTS.NEW_NOTIFICATION, onNotification);

      // Khi client đóng kết nối
      req.signal.addEventListener('abort', () => {
        clearInterval(keepAlive);
        notificationEmitter.off(NOTIFICATION_EVENTS.NEW_NOTIFICATION, onNotification);
        try {
          controller.close();
        } catch (e) {
          // Ignore
        }
        logger.debug('SSE: Connection closed by client', { email: authUserEmail });
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
