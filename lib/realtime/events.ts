import { getRealtimeDB } from "../firebase-admin";
import { logger } from "../logger";

/**
 * Publish event to Firebase Realtime Database
 * Mapping:
 * - notifications -> /notifications
 * - products -> /products
 * - users -> /users
 */
export async function publishDashboardEvent(event: string, payload: Record<string, unknown>) {
  try {
    const db = await getRealtimeDB();
    if (!db) {
      logger.warn('Firebase Realtime DB not available for event', { event });
      return;
    }

    let path = event;
    
    // Tối ưu cấu trúc ghi để tránh ghi đè toàn bộ node
    if (event === 'notifications') {
      // Đối với thông báo, chúng ta push để lưu lịch sử hoặc ít nhất là không ghi đè
      await db.ref('notifications').push({
        ...payload,
        timestamp: Date.now()
      });
    } else if (event === 'users' && payload.id) {
      // Cập nhật riêng cho từng user: /users/{userId}
      await db.ref(`users/${payload.id}`).set({
        ...payload,
        timestamp: Date.now()
      });
    } else if (event === 'products' && payload.id) {
      // Cập nhật riêng cho từng sản phẩm: /products/{productId}
      await db.ref(`products/${payload.id}`).set({
        ...payload,
        timestamp: Date.now()
      });
    } else {
      // Fallback cho các event khác
      await db.ref(path).set({
        ...payload,
        timestamp: Date.now()
      });
    }
    
    logger.debug('Realtime event published to Firebase', { path, event });
  } catch (error) {
    logger.error('Error publishing realtime event to Firebase', error, { event });
  }
}

/**
 * Push a message to the ticker_events list
 */
export async function publishTickerEvent(message: string, type: 'purchase' | 'commission' | 'achievement' | 'info' = 'info') {
  try {
    const db = await getRealtimeDB();
    if (!db) return;

    // Chỉ giữ lại 20 events gần nhất để tối ưu
    const tickerRef = db.ref('ticker_events');
    await tickerRef.push({
      message,
      type,
      timestamp: Date.now()
    });
    
    // Tùy chọn: Clean up các tin nhắn cũ nếu cần (nhưng Firebase push là append-only, client sẽ limit to last)
  } catch (error) {
    logger.error('Error publishing ticker event', error);
  }
}
