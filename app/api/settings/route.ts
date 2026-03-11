import { NextRequest, NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/database-mysql'
import { logger } from '@/lib/logger'
import { requireAdmin } from '@/lib/api-auth'
import { checkRateLimitAndRespond } from '@/lib/rate-limit'

export const runtime = 'nodejs'

// Ensure the table exists (Cross DB compatibility)
async function ensureSettingsTable() {
    try {
        const isPostgres = process.env.DATABASE_URL || !process.env.MYSQL_HOST;
        if (isPostgres) {
            await query(`
                CREATE TABLE IF NOT EXISTS settings (
                    id SERIAL PRIMARY KEY,
                    "key" VARCHAR(255) UNIQUE NOT NULL,
                    value TEXT,
                    type VARCHAR(255),
                    group_name VARCHAR(255),
                    label VARCHAR(255),
                    description TEXT,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `);
        } else {
            await query(`
                CREATE TABLE IF NOT EXISTS settings (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    \`key\` VARCHAR(255) UNIQUE NOT NULL,
                    value TEXT,
                    type VARCHAR(255),
                    group_name VARCHAR(255),
                    label VARCHAR(255),
                    description TEXT,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
            `);
        }
    } catch (error) {
        logger.error('Error creating settings table', { error })
    }
}

// Lấy tất cả cài đặt
export async function GET(request: NextRequest) {
    try {
        const rateLimitResponse = await checkRateLimitAndRespond(request, 100, 60, 'get-settings')
        if (rateLimitResponse) return rateLimitResponse

        await ensureSettingsTable()
        const rows = await query<any>('SELECT \`key\`, value FROM settings')

        const settingsObj: Record<string, string> = {}
        if (Array.isArray(rows)) {
            rows.forEach((row: any) => {
                settingsObj[row.key] = row.value
            })
        }

        return NextResponse.json({ success: true, settings: settingsObj })
    } catch (error: any) {
        logger.error('Error fetching settings', error)
        return NextResponse.json({
            error: 'Failed to fetch settings',
            detail: error.message,
            settings: {}
        }, { status: 500 })
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

        await ensureSettingsTable()

        // Lưu từng token vào bảng settings
        for (const [key, value] of Object.entries(tokens)) {
            if (typeof key === 'string' && value !== undefined) {
                const valStr = typeof value === 'string' ? value : JSON.stringify(value)

                // MySQL Upsert (INSERT ... ON DUPLICATE KEY UPDATE)
                await query(
                    `INSERT INTO settings (\`key\`, value) 
                     VALUES (?, ?) 
                     ON DUPLICATE KEY UPDATE value = ?`,
                    [key, valStr, valStr]
                )
            }
        }

        return NextResponse.json({ success: true, message: 'Cập nhật cài đặt thành công' })
    } catch (error: any) {
        logger.error('Error updating settings', { error: error.message || error.toString() })
        return NextResponse.json({ error: error.message || 'Lỗi khi cập nhật cài đặt' }, { status: 500 })
    }
}

// Giữ lại POST cho tương thích
export async function POST(request: NextRequest) {
    return PUT(request);
}
