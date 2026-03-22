import { NextRequest, NextResponse } from 'next/server'
import { verifyFirebaseToken } from '@/lib/api-auth'
import { getUserIdByEmail, query } from '@/lib/database'
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

    const rateUser = await checkRateLimitAndRespond(request, 80, 60, 'downloads-get-user', dbUserId)
    if (rateUser) return rateUser

    // Query downloads + join với products để lấy title, image
    // Chỉ select cột có trong schema `products` (không có version / file_size trên mọi DB)
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
        p.download_url,
        (SELECT COUNT(*)::int FROM downloads d2 WHERE d2.product_id = d.product_id AND d2.user_id = $1) AS total_downloads
      FROM downloads d
      LEFT JOIN products p ON d.product_id = p.id
      WHERE d.user_id = $2
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
        version: '1.0',
        size: null,
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
    return NextResponse.json({ success: false, downloads: [], error: 'Internal server error' }, { status: 500 })
  }
}
