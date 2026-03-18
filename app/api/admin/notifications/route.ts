import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/api-auth"
import { query } from "@/lib/database-mysql"
import { checkRateLimitAndRespond } from '@/lib/rate-limit'

export const runtime = 'nodejs'

// Force dynamic rendering
export const dynamic = 'force-dynamic'

// GET: Get all notifications (admin only)
export async function GET(request: NextRequest) {
  try {
    // ✅ SECURITY FIX: Thêm rate limit
    const rateLimitResponse = await checkRateLimitAndRespond(request, 30, 60, 'admin-notifications-get');
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    await requireAdmin(request)

    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const type = searchParams.get('type')
    const isRead = searchParams.get('isRead')

    let sql = `
      SELECT 
        n.*,
        u.email as user_email,
        u.name as user_name
      FROM notifications n
      LEFT JOIN users u ON n.user_id = u.id
      WHERE n.deleted_at IS NULL
    `
    const params: any[] = []

    if (userId) {
      sql += ` AND n.user_id = ?`
      params.push(parseInt(userId))
    }

    if (type) {
      sql += ` AND n.type = ?`
      params.push(type)
    }

    if (isRead !== null && isRead !== '') {
      sql += ` AND n.is_read = ?`
      params.push(isRead === 'true' ? 1 : 0)
    }

    sql += ` ORDER BY n.created_at DESC LIMIT 1000`

    const rows = await query<any>(sql, params)

    return NextResponse.json({
      success: true,
      notifications: rows
    })
  } catch (error: any) {
    const { logger } = await import('@/lib/logger')
    logger.error('Admin notifications GET error', error, { endpoint: '/api/admin/notifications' })
    
    if (error.message?.includes('Unauthorized')) {
      return NextResponse.json(
        { error: error.message },
        { status: 401 }
      )
    }
    
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
