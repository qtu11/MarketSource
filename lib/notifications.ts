import { logger } from './logger';
import { sendWhatsAppMessage } from './whatsapp';
import * as emailService from './email';

/**
 * Interface cho thông tin thiết bị
 */
export type DeviceInfo = {
  deviceType?: string;
  browser?: string;
  os?: string;
};

/**
 * Các biến môi trường cho Telegram
 */
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || process.env.NEXT_PUBLIC_TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || process.env.NEXT_PUBLIC_TELEGRAM_CHAT_ID;

/**
 * Hàm escape HTML để tránh lỗi khi gửi qua Telegram
 */
function escapeHTML(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Định dạng thông tin thiết bị để hiển thị
 */
function formatDeviceInfo(deviceInfo?: DeviceInfo) {
  if (!deviceInfo) return 'Thiết bị: Unknown';
  const type = deviceInfo.deviceType || 'Unknown';
  const browser = deviceInfo.browser || 'Unknown';
  const os = deviceInfo.os || 'Unknown';
  return `Thiết bị: ${type} (${browser})\n💻 OS: ${os}`;
}

/**
 * CORE: Gửi tin nhắn Telegram với xử lý lỗi và timeout
 */
export async function sendTelegramNotification(message: string, chatId?: string) {
  const token = TELEGRAM_BOT_TOKEN;
  const targetChatId = chatId || TELEGRAM_CHAT_ID;

  if (!token || !targetChatId) {
    logger.warn('Telegram credentials missing, skip notification');
    return false;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: targetChatId,
        text: message,
        parse_mode: 'HTML',
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      logger.error('Telegram API error', new Error(JSON.stringify(errorData)));
      return false;
    }
    return true;
  } catch (error) {
    logger.error('Telegram notification failed', error);
    return false;
  }
}

/**
 * Thông báo yêu cầu nạp tiền
 */
export async function notifyDepositRequest(payload: {
  userName?: string;
  userEmail?: string;
  amount: number;
  method: string;
  transactionId: string;
  ipAddress?: string;
  deviceInfo?: DeviceInfo;
}) {
  const message = `💳 <b>YÊU CẦU NẠP TIỀN MỚI</b>

👤 <b>Khách hàng:</b> ${escapeHTML(payload.userName || 'Unknown')}
📧 <b>Email:</b> ${escapeHTML(payload.userEmail || 'Unknown')}
💰 <b>Số tiền:</b> ${payload.amount.toLocaleString('vi-VN')}đ
🏦 <b>Phương thức:</b> ${escapeHTML(payload.method)}
📝 <b>Mã giao dịch:</b> ${escapeHTML(payload.transactionId)}
🌐 <b>IP:</b> ${escapeHTML(payload.ipAddress || 'Unknown')}
📱 <b>${formatDeviceInfo(payload.deviceInfo)}</b>

⏰ <b>Thời gian:</b> ${new Date().toLocaleString('vi-VN')}

<i>Vui lòng kiểm tra và duyệt yêu cầu!</i>`;

  await sendTelegramNotification(message);

  // Gửi WhatsApp nếu có cấu hình
  const adminWhatsapp = process.env.ADMIN_WHATSAPP || process.env.NEXT_PUBLIC_ADMIN_WHATSAPP;
  if (adminWhatsapp) {
    await sendWhatsAppMessage({
      to: adminWhatsapp,
      body: message.replace(/<[^>]*>/g, '').replace(/💳 YÊU CẦU NẠP TIỀN MỚI/, '💳 *YÊU CẦU NẠP TIỀN MỚI*'),
    }).catch(e => logger.error('WhatsApp failed', e));
  }
}

/**
 * Thông báo yêu cầu rút tiền
 */
export async function notifyWithdrawalRequest(payload: {
  userName?: string;
  userEmail?: string;
  amount: number;
  bankName: string;
  accountNumber: string;
  accountName: string;
  ipAddress?: string;
  deviceInfo?: DeviceInfo;
}) {
  const message = `💸 <b>YÊU CẦU RÚT TIỀN MỚI</b>

👤 <b>Khách hàng:</b> ${escapeHTML(payload.userName || 'Unknown')}
📧 <b>Email:</b> ${escapeHTML(payload.userEmail || 'Unknown')}
💰 <b>Số tiền:</b> ${payload.amount.toLocaleString('vi-VN')}đ
🏦 <b>Ngân hàng:</b> ${escapeHTML(payload.bankName)}
📝 <b>Tài khoản:</b> ${escapeHTML(payload.accountName)} - ${escapeHTML(payload.accountNumber)}
🌐 <b>IP:</b> ${escapeHTML(payload.ipAddress || 'Unknown')}
📱 <b>${formatDeviceInfo(payload.deviceInfo)}</b>
⏰ <b>Thời gian:</b> ${new Date().toLocaleString('vi-VN')}

<i>Vui lòng kiểm tra và xử lý!</i>`;

  await sendTelegramNotification(message);
}

/**
 * Thông báo mua hàng thành công
 */
export async function notifyPurchaseSuccess(payload: {
  userName?: string;
  userEmail?: string;
  amount: number;
  productTitle: string;
}) {
  const message = `🛒 <b>ĐƠN HÀNG MỚI</b>

👤 <b>Khách hàng:</b> ${escapeHTML(payload.userName || 'Unknown')}
📧 <b>Email:</b> ${escapeHTML(payload.userEmail || 'Unknown')}
🛍️ <b>Sản phẩm:</b> ${escapeHTML(payload.productTitle)}
💰 <b>Giá trị:</b> ${payload.amount.toLocaleString('vi-VN')}đ
⏰ <b>Thời gian:</b> ${new Date().toLocaleString('vi-VN')}

<i>Đơn hàng đã thanh toán thành công.</i>`;

  await sendTelegramNotification(message);
  
  // Gửi email xác nhận cho khách nếu có email
  if (payload.userEmail) {
    await emailService.sendPurchaseConfirmationEmail(
      payload.userEmail, 
      payload.productTitle, 
      payload.amount
    ).catch(e => logger.error('Purchase email failed', e));
  }
}

/**
 * Thông báo đăng ký người dùng mới
 */
export async function notifyNewUserRegistration(payload: {
  userName?: string;
  userEmail?: string;
  ipAddress?: string;
  deviceInfo?: DeviceInfo;
}) {
  const message = `🆕 <b>NGƯỜI DÙNG MỚI ĐĂNG KÝ</b>

👤 <b>Tên:</b> ${escapeHTML(payload.userName || 'Unknown')}
📧 <b>Email:</b> ${escapeHTML(payload.userEmail || 'Unknown')}
🌐 <b>IP:</b> ${escapeHTML(payload.ipAddress || 'Unknown')}
📱 <b>${formatDeviceInfo(payload.deviceInfo)}</b>
⏰ <b>Thời gian:</b> ${new Date().toLocaleString('vi-VN')}

<i>Chào mừng thành viên mới!</i>`;

  await sendTelegramNotification(message);
  
  // Gửi email chào mừng
  if (payload.userEmail) {
    await emailService.sendWelcomeEmail(payload.userEmail, payload.userName || 'bạn')
      .catch(e => logger.error('Welcome email failed', e));
  }
}

/**
 * Thông báo đặt lại mật khẩu
 */
export async function notifyPasswordResetRequest(payload: {
  userEmail: string;
  ipAddress?: string;
  deviceInfo?: DeviceInfo;
}) {
  const message = `🔄 <b>YÊU CẦU ĐẶT LẠI MẬT KHẨU</b>

📧 <b>Email:</b> ${escapeHTML(payload.userEmail)}
🌐 <b>IP:</b> ${escapeHTML(payload.ipAddress || 'Unknown')}
📱 <b>${formatDeviceInfo(payload.deviceInfo)}</b>
⏰ <b>Thời gian:</b> ${new Date().toLocaleString('vi-VN')}

<i>Vui lòng kiểm tra yêu cầu này.</i>`;

  await sendTelegramNotification(message);
}

// Aliases cho backward compatibility (nếu cần)
export const sendDepositNotification = notifyDepositRequest;
export const sendWithdrawalNotification = notifyWithdrawalRequest;
export const sendPurchaseNotification = notifyPurchaseSuccess;