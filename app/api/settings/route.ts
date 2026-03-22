import { NextRequest, NextResponse } from 'next/server'
import { query, pool } from '@/lib/database'
import { logger } from '@/lib/logger'
import { requireAdmin } from '@/lib/api-auth'
import { checkRateLimitAndRespond } from '@/lib/rate-limit'

export const runtime = 'nodejs'

const SENSITIVE_ENV_KEYS: Record<string, string[]> = {
    telegramBotToken: ['TELEGRAM_BOT_TOKEN'],
    telegramChatId: ['TELEGRAM_CHAT_ID'],
    whatsappNumber: ['TWILIO_WHATSAPP_NUMBER'],
    geminiApiKey: ['GEMINI_API_KEY'],
    hcaptchaSecret: ['HCAPTCHA_SECRET_KEY'],
    hcaptchaSiteKey: ['HCAPTCHA_SITE_KEY', 'NEXT_PUBLIC_HCAPTCHA_SITE_KEY'],
    smtpHost: ['SMTP_HOST'],
    smtpUser: ['SMTP_USER'],
    smtpPass: ['SMTP_PASS', 'SMTP_PASSWORD'],
}

const ADMIN_ENV_BACKFILL_KEYS: Record<string, string[]> = {
    telegramChatId: ['TELEGRAM_CHAT_ID'],
    whatsappNumber: ['TWILIO_WHATSAPP_NUMBER'],
    hcaptchaSiteKey: ['HCAPTCHA_SITE_KEY', 'NEXT_PUBLIC_HCAPTCHA_SITE_KEY'],
    smtpHost: ['SMTP_HOST'],
    smtpUser: ['SMTP_USER'],
}

// ✅ SECURITY FIX: Allowlist — chỉ những key này được trả về cho public GET (không cần auth)
const PUBLIC_SETTINGS_KEYS = new Set([
  // Branding
  'siteName', 'siteTagline', 'logoUrl', 'faviconUrl',
  // Colors
  'primaryColor', 'secondaryColor', 'accentColor', 'backgroundColor',
  'surfaceColor', 'textColor', 'mutedTextColor', 'borderColor',
  'successColor', 'warningColor', 'errorColor',
  // Typography
  'headingFont', 'bodyFont', 'baseFontSize', 'headingWeight',
  // Hero
  'heroTitle', 'heroSubtitle', 'heroButtonText', 'heroButtonLink',
  'heroBgType', 'heroBgColor', 'heroBgImage', 'heroOverlayOpacity',
  // Layout
  'layoutMode', 'sidebarPosition', 'containerWidth', 'navStyle',
  'cardStyle', 'borderRadius',
  // Footer & Contact (public info)
  'contactEmail', 'contactPhone', 'contactAddress',
  'footerText', 'footerStyle',
  // Social Links
  'facebookUrl', 'twitterUrl', 'instagramUrl', 'youtubeUrl',
  'telegramUrl', 'githubUrl', 'tiktokUrl',
  // SEO
  'metaTitle', 'metaDescription', 'metaKeywords', 'ogImage',
  // Misc public
  'maintenanceMode', 'maintenanceMessage',
  'hcaptchaSiteKey',
])

// ✅ FIX: Schema managed via migration, remove CREATE TABLE runtime

// Lấy tất cả cài đặt
export async function GET(request: NextRequest) {
    try {
        const rows = await query<any>('SELECT "key", value FROM settings')

        // ✅ SECURITY FIX: Cho phép Admin xem toàn bộ settings
        // Khách chỉ được xem PUBLIC_SETTINGS_KEYS
        let isAdmin = false
        try {
            const { requireAdmin } = await import('@/lib/api-auth')
            await requireAdmin(request)
            isAdmin = true
        } catch {
            isAdmin = false
        }

        const settingsObj: Record<string, string> = {}
        if (Array.isArray(rows)) {
            rows.forEach((row: any) => {
                if (isAdmin || PUBLIC_SETTINGS_KEYS.has(row.key)) {
                    settingsObj[row.key] = row.value
                }
            })
        }

        // ✅ SECURITY FIX: Trả về trạng thái cấu hình (bool) thay vì giá trị thật cho các secret keys nhạy cảm
        const sensitiveKeys = [
            'telegramBotToken', 'telegramChatId', 'whatsappNumber', 
            'geminiApiKey', 'hcaptchaSecret', 'hcaptchaSiteKey',
            'smtpHost', 'smtpUser', 'smtpPass'
        ]
        
        const configStatus: Record<string, boolean> = {}
        sensitiveKeys.forEach(key => {
            // Check in DB or ENV
            const inDb = settingsObj[key] && settingsObj[key].length > 0;
            const envKey = key.replace(/[A-Z]/g, letter => `_${letter.toUpperCase()}`).toUpperCase();
            const inEnv = process.env[envKey] || process.env[`NEXT_PUBLIC_${envKey}`];
            
            configStatus[key] = !!(inDb || inEnv);
            
            // Nếu không phải admin, xoá hẳn value nhạy cảm khỏi settingsObj
            if (!isAdmin && sensitiveKeys.includes(key)) {
               delete settingsObj[key];
            }
        })

        return NextResponse.json({ 
            success: true, 
            settings: settingsObj,
            configStatus: isAdmin ? configStatus : {} // ✅ Chỉ trả configStatus nếu là admin
        })
    } catch (error: any) {
        logger.error('Error fetching settings', error)
        const msg = error instanceof Error ? error.message : String(error)
        const isUnauthorized = msg.includes('Unauthorized') || msg.includes('auth')
        return NextResponse.json(
            {
                error: isUnauthorized ? 'Unauthorized access. Admin privileges required.' : 'Failed to fetch settings',
                settings: {},
            },
            { status: isUnauthorized ? 401 : 500 }
        )
    }
}

// Cập nhật cài đặt (Hỗ trợ PUT như frontend gọi)
export async function PUT(request: NextRequest) {
    try {
        const rateLimitResponse = await checkRateLimitAndRespond(request, 20, 60, 'update-settings')
        if (rateLimitResponse) return rateLimitResponse

        // Yêu cầu quyền admin
        await requireAdmin(request)

        const body = await request.json()
        const { tokens } = body

        if (!tokens || typeof tokens !== 'object') {
            return NextResponse.json({ error: 'Dữ liệu không hợp lệ. Cần object "tokens"' }, { status: 400 })
        }

        // Danh sách các key nhạy cảm không được phép ghi đè bằng chuỗi rỗng (coi như không đổi)
        const sensitiveKeys = ['telegramBotToken', 'geminiApiKey', 'hcaptchaSecret', 'smtpPass', 'twilioAuthToken', 'whatsappNumber']

        // Lưu từng token vào bảng settings
        for (const [key, value] of Object.entries(tokens)) {
            if (typeof key === 'string' && value !== undefined) {
                const valStr = typeof value === 'string' ? value : JSON.stringify(value)
                
                // ✅ UX FIX: Nếu là key nhạy cảm và value là rỗng, bỏ qua (không ghi đè để tránh mất config cũ)
                if (sensitiveKeys.includes(key) && valStr.trim() === '') {
                    continue
                }

                await query(
                    `INSERT INTO settings ("key", value) 
                     VALUES ($1, $2) 
                     ON CONFLICT ("key") DO UPDATE SET value = $2`,
                    [key, valStr]
                )
            }
        }

        return NextResponse.json({ success: true, message: 'Cập nhật cài đặt thành công' })
    } catch (error: any) {
        logger.error('Error updating settings', { error: error instanceof Error ? error.message : String(error) })
        const msg = error instanceof Error ? error.message : String(error)
        const isUnauthorized = msg.includes('Unauthorized') || msg.includes('auth')
        return NextResponse.json(
            {
                error: isUnauthorized
                    ? 'Unauthorized access. Admin privileges required.'
                    : 'Lỗi khi cập nhật cài đặt',
            },
            { status: isUnauthorized ? 401 : 500 }
        )
    }
}

// Giữ lại POST cho tương thích
export async function POST(request: NextRequest) {
    return PUT(request);
}
