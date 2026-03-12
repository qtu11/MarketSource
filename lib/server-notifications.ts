import { logger } from './logger';
import { sendWhatsAppMessage } from './whatsapp';

type DeviceInfo = {
  deviceType?: string;
  browser?: string;
  os?: string;
};

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || process.env.NEXT_PUBLIC_TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || process.env.NEXT_PUBLIC_TELEGRAM_CHAT_ID;

function escapeHTML(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDeviceInfo(deviceInfo?: DeviceInfo) {
  if (!deviceInfo) {
    return 'Thiết bị: Unknown';
  }

  const type = deviceInfo.deviceType || 'Unknown';
  const browser = deviceInfo.browser || 'Unknown';
  const os = deviceInfo.os || 'Unknown';

  return `Thiết bị: ${type} (${browser})\n💻 OS: ${os}`;
}

async function sendTelegramMessage(message: string) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN || process.env.NEXT_PUBLIC_TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID || process.env.NEXT_PUBLIC_TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) {
    logger.warn('Telegram credentials missing, skip notification');
    return;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s timeout

    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML',
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      logger.error('Telegram API error', new Error(JSON.stringify(errorData)), {
        status: response.status,
        statusText: response.statusText
      });
    }
  } catch (error) {
    logger.error('Telegram notification failed', error);
  }
}

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
📱 <b>${formatDeviceInfo(payload.deviceInfo)}

⏰ <b>Thời gian:</b> ${new Date().toLocaleString('vi-VN')}

<i>Vui lòng kiểm tra và duyệt yêu cầu!</i>`;

  await sendTelegramMessage(message);

  const adminWhatsapp = process.env.ADMIN_WHATSAPP || process.env.NEXT_PUBLIC_ADMIN_WHATSAPP || '';
  if (adminWhatsapp) {
    try {
      await sendWhatsAppMessage({
        to: adminWhatsapp,
        body: message.replace(/<[^>]*>/g, '').replace(/💳 YÊU CẦU NẠP TIỀN MỚI/, '💳 *YÊU CẦU NẠP TIỀN MỚI*'),
      });
    } catch (error) {
      logger.error('WhatsApp notification failed', error);
    }
  }
}

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
📱 <b>${formatDeviceInfo(payload.deviceInfo)}
⏰ <b>Thời gian:</b> ${new Date().toLocaleString('vi-VN')}

<i>Vui lòng kiểm tra và xử lý!</i>`;

  await sendTelegramMessage(message);

  const adminWhatsapp = process.env.ADMIN_WHATSAPP || process.env.NEXT_PUBLIC_ADMIN_WHATSAPP || '';
  if (adminWhatsapp) {
    try {
      await sendWhatsAppMessage({
        to: adminWhatsapp,
        body: message.replace(/<[^>]*>/g, '').replace(/💸 YÊU CẦU RÚT TIỀN MỚI/, '💸 *YÊU CẦU RÚT TIỀN MỚI*'),
      });
    } catch (error) {
      logger.error('WhatsApp notification failed', error);
    }
  }
}

export async function notifyPasswordReset(payload: {
  email: string;
  ipAddress?: string;
  deviceInfo?: DeviceInfo;
}) {
  const message = `🔄 <b>YÊU CẦU ĐẶT LẠI MẬT KHẨU</b>

📧 <b>Email:</b> ${escapeHTML(payload.email)}
🌐 <b>IP:</b> ${escapeHTML(payload.ipAddress || 'Unknown')}
📱 <b>${formatDeviceInfo(payload.deviceInfo)}
⏰ <b>Thời gian:</b> ${new Date().toLocaleString('vi-VN')}

<i>Vui lòng kiểm tra yêu cầu này.</i>`;

  await sendTelegramMessage(message);

  const adminWhatsapp = process.env.ADMIN_WHATSAPP || process.env.NEXT_PUBLIC_ADMIN_WHATSAPP || '';
  if (adminWhatsapp) {
    try {
      await sendWhatsAppMessage({
        to: adminWhatsapp,
        body: message.replace(/<[^>]*>/g, ''),
      });
    } catch (error) {
      logger.error('WhatsApp notification failed', error);
    }
  }
}

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

  await sendTelegramMessage(message);
}

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
📱 <b>${formatDeviceInfo(payload.deviceInfo)}
⏰ <b>Thời gian:</b> ${new Date().toLocaleString('vi-VN')}

<i>Chào mừng thành viên mới!</i>`;

  await sendTelegramMessage(message);
}

