import { EventEmitter } from 'events';

// Singleton EventEmitter cho toàn bộ ứng dụng Node.js
// Giúp truyền tin giữa Database (Khi có thay đổi) và SSE Stream (Để đẩy cho Client)

class AppEventEmitter extends EventEmitter {}

// Sử dụng global để tránh tạo nhiều instance khi Hot-Reload trong Dev
const globalForEvents = global as unknown as {
  notificationEmitter: AppEventEmitter | undefined;
};

export const notificationEmitter =
  globalForEvents.notificationEmitter ?? new AppEventEmitter();

if (process.env.NODE_ENV !== 'production') {
  globalForEvents.notificationEmitter = notificationEmitter;
}

// Các loại sự kiện thông báo
export const NOTIFICATION_EVENTS = {
  NEW_NOTIFICATION: 'new_notification',
};
