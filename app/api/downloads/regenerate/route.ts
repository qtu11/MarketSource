import { NextRequest, NextResponse } from 'next/server'
import { getClientIP, verifyFirebaseToken } from '@/lib/api-auth'
import { getUserIdByEmail, queryOne, trackDownload } from '@/lib/database-mysql'
import { logger } from '@/lib/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const authUser = await verifyFirebaseToken(request)
    if (!authUser?.email) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const userId = await getUserIdByEmail(authUser.email)
    if (!userId) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 })
    }

    const body = await request.json().catch(() => ({}))
    const recordId = body?.id
    if (!recordId) {
      return NextResponse.json({ success: false, error: 'Missing download record id' }, { status: 400 })
    }

    const download = await queryOne<any>(
      'SELECT id, product_id FROM downloads WHERE id = ? AND user_id = ?',
      [recordId, userId]
    )

    if (!download?.product_id) {
      return NextResponse.json({ success: false, error: 'Download record not found' }, { status: 404 })
    }

    const result = await trackDownload({
      userId,
      productId: Number(download.product_id),
      ipAddress: getClientIP(request),
      userAgent: request.headers.get('user-agent') || undefined,
    })

    return NextResponse.json({
      success: true,
      downloadUrl: result.downloadUrl,
      downloadedAt: result.downloadedAt,
    })
  } catch (error: any) {
    logger.error('Downloads regenerate API error', error)
    return NextResponse.json({ success: false, error: error.message || 'Internal server error' }, { status: 500 })
  }
}
