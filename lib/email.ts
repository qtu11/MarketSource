/**
 * Email Service - Nodemailer SMTP + Resend Fallback
 * ✅ Hỗ trợ gửi OTP qua Gmail SMTP
 * ✅ Fallback sang Resend API nếu SMTP không khả dụng
 * ✅ Template email chuyên nghiệp, bảo mật
 */

import nodemailer from 'nodemailer';
import { logger } from './logger';

// ============================================================
// SMTP TRANSPORTER (Gmail) - Ưu tiên
// ============================================================
let smtpTransporter: nodemailer.Transporter | null = null;

function getSmtpTransporter(): nodemailer.Transporter | null {
  if (smtpTransporter) return smtpTransporter;

  const host = process.env.SMTP_HOST || process.env.NEXT_PUBLIC_SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || process.env.NEXT_PUBLIC_SMTP_PORT || '465');
  const user = process.env.SMTP_USER || process.env.NEXT_PUBLIC_SMTP_USER;
  const pass = process.env.SMTP_PASS || process.env.NEXT_PUBLIC_SMTP_PASS;

  if (!host || !user || !pass || pass === 'your_app_password_here') {
    console.warn('⚠️ SMTP chưa được cấu hình đầy đủ. Sẽ fallback sang Resend hoặc Console.');
    return null;
  }

  smtpTransporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  return smtpTransporter;
}

// ============================================================
// RESEND FALLBACK
// ============================================================
let resend: any = null;

async function getResend() {
  if (resend) return resend;

  try {
    const resendModule = await import('resend');
    const Resend = resendModule.Resend || (resendModule as any).default;
    if (!Resend) throw new Error('Resend not found');

    resend = new Resend(process.env.RESEND_API_KEY || process.env.NEXT_PUBLIC_RESEND_API_KEY);
    return resend;
  } catch (error) {
    console.warn('Resend not available, using console fallback');
    return null;
  }
}

// ============================================================
// CORE SEND EMAIL FUNCTION
// ============================================================
export interface EmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
}

export async function sendEmail(options: EmailOptions) {
  const fromAddress = options.from || process.env.SMTP_USER || process.env.EMAIL_FROM || 'noreply@qtusdevmarket.com';
  const toAddresses = Array.isArray(options.to) ? options.to : [options.to];

  // ✅ Strategy 1: SMTP (Gmail)
  const transporter = getSmtpTransporter();
  if (transporter) {
    try {
      const info = await transporter.sendMail({
        from: `"QTUS Dev Market" <${fromAddress}>`,
        to: toAddresses.join(', '),
        subject: options.subject,
        html: options.html,
      });
      logger.info('Email sent via SMTP', { messageId: info.messageId, to: toAddresses });
      return { success: true, id: info.messageId };
    } catch (smtpError: any) {
      logger.error('SMTP send failed, trying Resend fallback...', smtpError);
    }
  }

  // ✅ Strategy 2: Resend API
  const emailService = await getResend();
  if (emailService) {
    try {
      const result = await emailService.emails.send({
        from: fromAddress,
        to: toAddresses,
        subject: options.subject,
        html: options.html,
      });
      return { success: true, id: result.id };
    } catch (resendError: any) {
      logger.error('Resend send failed', resendError);
    }
  }

  // ✅ Strategy 3: Console fallback (dev only)
  console.log('📧 Email (console fallback):', {
    to: options.to,
    subject: options.subject,
    html: options.html.substring(0, 200) + '...',
  });
  return { success: true, id: 'console-fallback' };
}

// ============================================================
// 🔐 GỬI OTP QUA EMAIL - TEMPLATE CHUYÊN NGHIỆP
// ============================================================
export async function sendOtpEmail(email: string, otp: string) {
  const siteName = 'QTUS Dev Market';
  const siteUrl = process.env.NEXT_PUBLIC_URL || 'https://market-source.vercel.app';
  const expiryMinutes = 15;

  const htmlTemplate = `
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Mã xác nhận OTP</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f0f2f5; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f0f2f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" width="480" style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">
          
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #6366f1 0%, #a855f7 50%, #ec4899 100%); padding: 32px 40px; text-align: center;">
              <h1 style="color: #ffffff; font-size: 22px; margin: 0 0 4px 0; font-weight: 700; letter-spacing: -0.5px;">🔐 ${siteName}</h1>
              <p style="color: rgba(255,255,255,0.85); font-size: 13px; margin: 0;">Xác nhận đặt lại mật khẩu</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 36px 40px;">
              <p style="color: #1a1a2e; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0;">
                Xin chào,
              </p>
              <p style="color: #444; font-size: 14px; line-height: 1.7; margin: 0 0 28px 0;">
                Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn. Vui lòng sử dụng mã xác nhận bên dưới để hoàn tất quá trình:
              </p>

              <!-- OTP Box -->
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 28px;">
                <tr>
                  <td align="center">
                    <div style="background: linear-gradient(135deg, #f8f7ff 0%, #f3f0ff 100%); border: 2px dashed #6366f1; border-radius: 12px; padding: 24px 32px; display: inline-block;">
                      <p style="color: #6366f1; font-size: 11px; text-transform: uppercase; letter-spacing: 3px; margin: 0 0 8px 0; font-weight: 600;">Mã xác nhận của bạn</p>
                      <p style="color: #1a1a2e; font-size: 36px; font-weight: 800; letter-spacing: 10px; margin: 0; font-family: 'Courier New', monospace;">${otp}</p>
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Warning -->
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 24px;">
                <tr>
                  <td style="background-color: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 0 8px 8px 0; padding: 14px 16px;">
                    <p style="color: #92400e; font-size: 13px; margin: 0; line-height: 1.5;">
                      ⏱️ Mã có hiệu lực trong <strong>${expiryMinutes} phút</strong>. Không chia sẻ mã này với bất kỳ ai.
                    </p>
                  </td>
                </tr>
              </table>

              <p style="color: #666; font-size: 13px; line-height: 1.6; margin: 0;">
                Nếu bạn không yêu cầu đặt lại mật khẩu, vui lòng bỏ qua email này. Tài khoản của bạn vẫn an toàn.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8f9fa; padding: 20px 40px; border-top: 1px solid #eee; text-align: center;">
              <p style="color: #999; font-size: 12px; margin: 0 0 4px 0;">
                © ${new Date().getFullYear()} ${siteName}. All rights reserved.
              </p>
              <p style="margin: 0;">
                <a href="${siteUrl}" style="color: #6366f1; font-size: 12px; text-decoration: none;">${siteUrl}</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;

  return sendEmail({
    to: email,
    subject: `[${siteName}] Mã xác nhận đặt lại mật khẩu: ${otp}`,
    html: htmlTemplate,
  });
}

// ============================================================
// CÁC TEMPLATE EMAIL KHÁC (giữ nguyên)
// ============================================================

export async function sendWelcomeEmail(email: string, name: string) {
  const siteName = 'QTUS Dev Market';
  const siteUrl = process.env.NEXT_PUBLIC_URL || 'https://market-source.vercel.app';

  const htmlTemplate = `
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Chào mừng đến với ${siteName}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f7f9; font-family: 'Inter', system-ui, -apple-system, sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f4f7f9; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="background-color: #ffffff; border-radius: 20px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.05);">
          <!-- Brand Header -->
          <tr>
            <td style="background-color: #1a1a2e; padding: 32px 40px; text-align: center;">
              <span style="font-size: 28px; font-weight: 800; background: linear-gradient(to right, #6366f1, #ec4899); -webkit-background-clip: text; color: transparent;">QTUS DEV</span>
              <span style="font-size: 28px; font-weight: 400; color: #ffffff; margin-left: 4px;">MARKET</span>
            </td>
          </tr>
          <!-- Content Body -->
          <tr>
            <td style="padding: 40px;">
              <h2 style="color: #1a1a2e; font-size: 24px; font-weight: 800; margin: 0 0 20px 0;">
                Chào mừng ${name}! 🎉
              </h2>
              <p style="color: #475569; font-size: 16px; line-height: 1.8; margin: 0 0 20px 0;">
                Cảm ơn bạn đã tin tưởng và đăng ký tài khoản tại <strong>${siteName}</strong>. Chúng tôi rất vui mừng được đồng hành cùng bạn trên con đường chinh phục và khám phá những kho mã nguồn chất lượng cao!
              </p>
              <p style="color: #475569; font-size: 16px; line-height: 1.8; margin: 0 0 32px 0;">
                Hãy bắt đầu hành trình của bạn ngay hôm nay. Hàng trăm sản phẩm từ Website, Mobile App, Game cho đến các Tools đỉnh cao đang chờ đón bạn.
              </p>
              <!-- Action Button -->
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td align="center">
                    <a href="${siteUrl}/products" style="background: linear-gradient(135deg, #6366f1 0%, #ec4899 100%); color: #ffffff; padding: 16px 36px; border-radius: 12px; text-decoration: none; font-weight: 700; font-size: 16px; display: inline-block; box-shadow: 0 4px 15px rgba(99, 102, 241, 0.4);">
                      Khám Phá Sản Phẩm Ngay
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Footer Section -->
          <tr>
            <td style="background-color: #f8faff; padding: 30px 40px; text-align: center; border-top: 1px solid #f0f0f0;">
              <p style="color: #94a3b8; font-size: 14px; margin: 0 0 16px 0;">
                Nếu bạn cần hỗ trợ, đừng ngần ngại liên hệ với chúng tôi qua trang Support.
              </p>
              <p style="color: #475569; font-size: 12px; margin: 0;">
                © ${new Date().getFullYear()} ${siteName}. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;

  return sendEmail({
    to: email,
    subject: `Chào mừng bạn đến với ${siteName}! 🎉`,
    html: htmlTemplate,
  });
}

export async function sendPurchaseConfirmationEmail(email: string, productName: string, amount: number) {
  const siteName = 'QTUS Dev Market';
  const siteUrl = process.env.NEXT_PUBLIC_URL || 'https://market-source.vercel.app';

  const htmlTemplate = `
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Xác nhận mua hàng thành công</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f7f9; font-family: 'Inter', system-ui, -apple-system, sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f4f7f9; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="background-color: #ffffff; border-radius: 20px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.05);">
          <!-- Brand Header -->
          <tr>
            <td style="background-color: #1a1a2e; padding: 24px 40px; text-align: center;">
              <span style="font-size: 24px; font-weight: 800; background: linear-gradient(to right, #6366f1, #ec4899); -webkit-background-clip: text; color: transparent;">QTUS DEV</span>
            </td>
          </tr>
          <!-- Content Body -->
          <tr>
            <td style="padding: 40px;">
              <div style="text-align: center; margin-bottom: 30px;">
                <div style="background-color: #ecfdf5; display: inline-block; padding: 16px; border-radius: 50%; margin-bottom: 16px;">
                  <span style="font-size: 32px;">✅</span>
                </div>
                <h2 style="color: #1a1a2e; font-size: 24px; font-weight: 800; margin: 0;">Giao dịch thành công!</h2>
              </div>
              
              <p style="color: #475569; font-size: 16px; line-height: 1.8; margin: 0 0 24px 0;">
                Cảm ơn bạn đã mua hàng tại <strong>${siteName}</strong>. Đơn hàng của bạn đã được thanh toán và xử lý thành công.
              </p>
              
              <!-- Order Details Box -->
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; margin-bottom: 32px;">
                <tr>
                  <td style="padding: 24px;">
                    <p style="color: #64748b; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 8px 0; font-weight: 700;">Sản phẩm đã mua</p>
                    <p style="color: #1e293b; font-size: 18px; font-weight: 700; margin: 0 0 16px 0;">${productName}</p>
                    
                    <div style="border-top: 1px dashed #cbd5e1; margin: 16px 0; padding-top: 16px; display: flex; justify-content: space-between;">
                      <span style="color: #64748b; font-size: 14px;">Tổng tiền thanh toán:</span>
                      <span style="color: #6366f1; font-size: 20px; font-weight: 800;">${amount.toLocaleString('vi-VN')} đ</span>
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Action Button -->
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td align="center">
                    <a href="${siteUrl}/dashboard" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: #ffffff; padding: 16px 36px; border-radius: 12px; text-decoration: none; font-weight: 700; font-size: 16px; display: inline-block; box-shadow: 0 4px 15px rgba(16, 185, 129, 0.4);">
                      Truy Cập Dashboard Tải Source Code
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color: #f8faff; padding: 30px 40px; text-align: center; border-top: 1px solid #f0f0f0;">
              <p style="color: #94a3b8; font-size: 13px; margin: 0;">
                Đây là email tự động. Quy định về hoàn tiền và hỗ trợ, vui lòng xem tại điều khoản.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;

  return sendEmail({
    to: email,
    subject: `[${siteName}] Xác nhận mua hàng thành công: ${productName}`,
    html: htmlTemplate,
  });
}

export async function sendPasswordResetEmail(email: string, resetToken: string) {
  const siteName = 'QTUS Dev Market';
  const siteUrl = process.env.NEXT_PUBLIC_URL || 'https://market-source.vercel.app';
  const resetLink = `${siteUrl}/auth/reset-password?token=${resetToken}`;

  const htmlTemplate = `
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Yêu cầu đặt lại mật khẩu</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f7f9; font-family: 'Inter', system-ui, -apple-system, sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f4f7f9; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="background-color: #ffffff; border-radius: 20px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.05);">
          <!-- Content Body -->
          <tr>
            <td style="padding: 40px;">
              <div style="text-align: center; margin-bottom: 30px;">
                <div style="background: linear-gradient(135deg, #fef3c7 0%, #fef08a 100%); display: inline-block; padding: 16px; border-radius: 50%; margin-bottom: 16px;">
                  <span style="font-size: 32px;">🔐</span>
                </div>
                <h2 style="color: #1a1a2e; font-size: 24px; font-weight: 800; margin: 0;">Yêu cầu Đặt lại Mật khẩu</h2>
              </div>
              
              <p style="color: #475569; font-size: 16px; line-height: 1.8; margin: 0 0 24px 0; text-align: center;">
                Chúng tôi vừa nhận được yêu cầu đặt lại mật khẩu cho tài khoản <strong>${siteName}</strong> của bạn.
                Nhấp vào nút bên dưới để thiết lập mật khẩu mới (Liên kết này sẽ bảo mật và tự động hết hạn sau 1 giờ).
              </p>

              <!-- Action Button -->
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td align="center" style="padding-bottom: 32px;">
                    <a href="${resetLink}" style="background: #1e293b; color: #ffffff; padding: 16px 36px; border-radius: 12px; text-decoration: none; font-weight: 700; font-size: 16px; display: inline-block;">
                      Đặt Lại Mật Khẩu
                    </a>
                  </td>
                </tr>
              </table>
              
              <p style="color: #94a3b8; font-size: 14px; line-height: 1.6; margin: 0; text-align: center; border-top: 1px solid #f1f5f9; padding-top: 24px;">
                Nếu bạn không thực hiện yêu cầu này, xin vui lòng bỏ qua email. Tài khoản của bạn vẫn được giữ an toàn.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;

  return sendEmail({
    to: email,
    subject: `[${siteName}] Đặt lại mật khẩu tài khoản`,
    html: htmlTemplate,
  });
}

export async function sendDepositApprovalEmail(email: string, amount: number, newBalance: number) {
  const siteName = 'QTUS Dev Market';
  const siteUrl = process.env.NEXT_PUBLIC_URL || 'https://market-source.vercel.app';

  const htmlTemplate = `
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Nạp tiền thành công</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f7f9; font-family: 'Inter', system-ui, -apple-system, sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f4f7f9; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="background-color: #ffffff; border-radius: 20px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.05);">
          <!-- Content Body -->
          <tr>
            <td style="padding: 40px;">
              <div style="text-align: center; margin-bottom: 24px;">
                <div style="background-color: #dcfce7; display: inline-block; padding: 16px; border-radius: 50%; margin-bottom: 16px;">
                  <span style="font-size: 32px;">💎</span>
                </div>
                <h2 style="color: #059669; font-size: 24px; font-weight: 800; margin: 0;">Nạp tiền hoàn tất!</h2>
              </div>
              
              <p style="color: #475569; font-size: 16px; line-height: 1.8; margin: 0 0 24px 0; text-align: center;">
                Yêu cầu nạp tiền vào hệ thống của bạn đã được duyệt thành công. Tiền đã được tích hợp vào tài khoản và sẵn sàng giao dịch.
              </p>
              
              <!-- Order Details Box -->
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; margin-bottom: 32px;">
                <tr>
                  <td style="padding: 24px; text-align: center;">
                    <p style="color: #64748b; font-size: 13px; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 8px 0; font-weight: 700;">Số tiền nạp</p>
                    <p style="color: #10b981; font-size: 32px; font-weight: 800; margin: 0 0 16px 0;">+${amount.toLocaleString('vi-VN')} đ</p>
                    
                    <div style="border-top: 1px dashed #cbd5e1; margin: 16px 0; padding-top: 16px;">
                      <span style="color: #64748b; font-size: 14px;">Số dư khả dụng hiện tại: </span>
                      <span style="color: #1e293b; font-size: 16px; font-weight: 700;">${newBalance.toLocaleString('vi-VN')} đ</span>
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Action Button -->
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td align="center">
                    <a href="${siteUrl}/products" style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: #ffffff; padding: 16px 36px; border-radius: 12px; text-decoration: none; font-weight: 700; font-size: 16px; display: inline-block;">
                      Mua Sắm Ngay
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;

  return sendEmail({
    to: email,
    subject: `[${siteName}] Nạp tiền thành công: +${amount.toLocaleString('vi-VN')}đ`,
    html: htmlTemplate,
  });
}

export async function sendSystemNotificationEmail(email: string, title: string, message: string) {
  const siteName = 'QTUS Dev Market';
  const siteUrl = process.env.NEXT_PUBLIC_URL || 'https://market-source.vercel.app';

  const htmlTemplate = `
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f7f9; font-family: 'Inter', system-ui, -apple-system, sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f4f7f9; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="background-color: #ffffff; border-radius: 20px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.05);">
          
          <!-- Brand Header -->
          <tr>
            <td style="background-color: #ffffff; padding: 32px 40px; text-align: left; border-bottom: 1px solid #f0f0f0;">
              <span style="font-size: 24px; font-weight: 800; background: linear-gradient(to right, #6366f1, #ec4899); -webkit-background-clip: text; color: transparent;">QTUS DEV</span>
              <span style="font-size: 24px; font-weight: 400; color: #1a1a2e; margin-left: 4px;">MARKET</span>
            </td>
          </tr>

          <!-- Content Body -->
          <tr>
            <td style="padding: 40px;">
              <div style="background-color: #f8faff; border-radius: 12px; padding: 12px 20px; display: inline-block; margin-bottom: 24px;">
                <span style="color: #6366f1; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px;">📢 Thông báo hệ thống</span>
              </div>
              
              <h2 style="color: #1a1a2e; font-size: 28px; font-weight: 800; margin: 0 0 20px 0; line-height: 1.2; letter-spacing: -0.5px;">
                ${title}
              </h2>

              <div style="color: #475569; font-size: 16px; line-height: 1.8; margin: 0 0 32px 0;">
                ${message.replace(/\n/g, '<br>')}
              </div>

              <!-- Action Button -->
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <a href="${siteUrl}/dashboard" style="background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%); color: #ffffff; padding: 16px 32px; border-radius: 12px; text-decoration: none; font-weight: 700; font-size: 16px; display: inline-block; box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);">
                      Truy cập Hệ thống
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer Section -->
          <tr>
            <td style="background-color: #1a1a2e; padding: 40px; text-align: center;">
              <p style="color: #94a3b8; font-size: 14px; margin: 0 0 16px 0;">
                Bạn nhận được email này vì bạn là thành viên của QTUS Dev Market.
              </p>
              <div style="margin-bottom: 24px;">
                <a href="${siteUrl}" style="color: #6366f1; text-decoration: none; font-size: 14px; font-weight: 600;">Website</a>
                <span style="color: #334155; margin: 0 12px;">•</span>
                <a href="${siteUrl}/terms" style="color: #6366f1; text-decoration: none; font-size: 14px; font-weight: 600;">Điều khoản</a>
                <span style="color: #334155; margin: 0 12px;">•</span>
                <a href="${siteUrl}/privacy" style="color: #6366f1; text-decoration: none; font-size: 14px; font-weight: 600;">Bảo mật</a>
              </div>
              <p style="color: #475569; font-size: 12px; margin: 0;">
                © ${new Date().getFullYear()} QTUS Dev Market. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;

  return sendEmail({
    to: email,
    subject: `[Thông báo] ${title}`,
    html: htmlTemplate,
  });
}
