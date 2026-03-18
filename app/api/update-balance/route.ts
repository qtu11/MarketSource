import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/lib/logger'
import { requireAdmin } from '@/lib/api-auth'

export const runtime = 'nodejs'

/**
 * PUT /api/update-balance
 * Cập nhật balance của user trong PostgreSQL.
 * Chỉ admin và internal server mới được gọi.
 */
export async function PUT(request: NextRequest) {
  try {
    // Chỉ admin mới được manually update balance
    await requireAdmin(request)

    const body = await request.json()
    const { userId, userEmail, newBalance } = body

    if (!newBalance && newBalance !== 0) {
      return NextResponse.json({ error: 'newBalance is required' }, { status: 400 })
    }

    if (typeof newBalance !== 'number' || newBalance < 0) {
      return NextResponse.json({ error: 'newBalance must be a non-negative number' }, { status: 400 })
    }

    // Resolve userId từ email nếu cần
    let dbUserId: number | null = null
    if (typeof userId === 'number') {
      dbUserId = userId
    } else if (userEmail) {
      const { getUserIdByEmail } = await import('@/lib/database-mysql')
      dbUserId = await getUserIdByEmail(userEmail)
    }

    if (!dbUserId) {
      return NextResponse.json({ error: 'Cannot resolve user ID' }, { status: 400 })
    }

    // Update balance trong PostgreSQL
    const { query } = await import('@/lib/database-mysql')
    await query(
      'UPDATE users SET balance = ?, updated_at = NOW() WHERE id = ?',
      [newBalance, dbUserId]
    )

    logger.info('Balance updated via API', { dbUserId, newBalance })

    return NextResponse.json({ success: true, newBalance })
  } catch (error: any) {
    logger.error('Update balance error', error)
    if (error.message?.includes('Unauthorized')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}
