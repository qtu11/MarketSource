import { NextRequest, NextResponse } from 'next/server'
import { verifyFirebaseToken } from '@/lib/api-auth'
import { getUserIdByEmail, query } from '@/lib/database-mysql'
import { logger } from '@/lib/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params
    const authUser = await verifyFirebaseToken(request)

    if (!authUser) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const dbUserId = await getUserIdByEmail(authUser.email || '')
    if (!dbUserId) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 })
    }

    // Synthetic "current-*" sessions are generated client-side when no DB session exists.
    if (id === 'current' || id.startsWith('current-')) {
      return NextResponse.json({ success: true, message: 'Current session is already trusted' })
    }

    const result = await query(
      'UPDATE user_sessions SET is_trusted = 1 WHERE id = ? AND user_id = ?',
      [id, dbUserId]
    )

    const affectedRows = (result as any).affectedRows || 0
    if (affectedRows === 0) {
      return NextResponse.json({ success: false, error: 'Session not found or unauthorized' }, { status: 404 })
    }

    return NextResponse.json({ success: true, message: 'Session marked as trusted' })
  } catch (error: any) {
    logger.error('Session trust route error', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
