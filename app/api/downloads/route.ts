import { NextRequest, NextResponse } from 'next/server'
import { verifyFirebaseToken } from '@/lib/api-auth'
import { getUserIdByEmail, query } from '@/lib/database-mysql'
import { logger } from '@/lib/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/downloads
 * Lấy lịch sử tải xuống của user hiện tại
 * Bảng: downloads(id, user_id, product_id, downloaded_at, ip_address, user_agent)
 */
export async function GET(request: NextRequest) {
  try {
    // Rate limiting
    const { checkRateLimitAndRespond } = await import('@/lib/rate-limit')
    const rateLimitRes = await checkRateLimitAndRespond(request, 30, 60, 'downloads-get')
    if (rateLimitRes) return rateLimitRes

    // Auth
    const authUser = await verifyFirebaseToken(request)
    if (!authUser) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    // Lấy DB user ID từ email
    const dbUserId = await getUserIdByEmail(authUser.email || '')
    if (!dbUserId) {
      return NextResponse.json({ success: true, downloads: [] })
    }

    // Query downloads + join với products để lấy title, image
    const downloads = await query(`
      SELECT 
        d.id,
        d.user_id,
        d.product_id,
        d.downloaded_at AS created_at,
        d.ip_address,
        d.user_agent AS device,
        p.title AS product_title,
        p.image_url,
        p.version,
        p.file_size AS size,
        p.download_url,
        (SELECT COUNT(*) FROM downloads WHERE product_id = d.product_id AND user_id = ?) AS total_downloads
      FROM downloads d
      LEFT JOIN products p ON d.product_id = p.id
      WHERE d.user_id = ?
      ORDER BY d.downloaded_at DESC
      LIMIT 100
    `, [dbUserId, dbUserId])

    return NextResponse.json({
      success: true,
      downloads: (downloads || []).map((d: any) => ({
        id: d.id,
        user_id: d.user_id,
        product_id: d.product_id,
        product_title: d.product_title || 'Sản phẩm',
        version: d.version || '1.0',
        size: d.size,
        download_url: d.download_url,
        image_url: d.image_url,
        ip_address: d.ip_address,
        device: d.device,
        created_at: d.created_at,
        total_downloads: d.total_downloads || 1,
        status: 'active',
      }))
    })
  } catch (error: any) {
    logger.error('Downloads API error', error)
    return NextResponse.json({ success: false, downloads: [], error: error.message }, { status: 500 })
  }
}
