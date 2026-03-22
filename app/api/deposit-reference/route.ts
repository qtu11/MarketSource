import { NextRequest, NextResponse } from 'next/server'
import { verifyFirebaseToken } from '@/lib/api-auth'
import {
  getOrCreateUserDepositReferenceCode,
  normalizeUserId,
  createOrUpdateUser,
  queryOne,
} from '@/lib/database'
import { checkRateLimitAndRespond } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET — trả mã tham chiếu nạp tiền 16 ký tự (cố định theo user, unique toàn hệ thống).
 */
export async function GET(request: NextRequest) {
  try {
    const rl = await checkRateLimitAndRespond(request, 30, 60, 'deposit-reference')
    if (rl) return rl

    const authUser = await verifyFirebaseToken(request)
    if (!authUser?.email) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const rawEmail = authUser.email.trim()

    let dbUser =
      (await queryOne<{ id: number }>(
        `SELECT id FROM users WHERE LOWER(TRIM(email)) = LOWER(TRIM($1)) AND deleted_at IS NULL LIMIT 1`,
        [rawEmail]
      )) ?? null
    let dbUserId: number | null = dbUser?.id ?? null

    if (!dbUserId) {
      dbUserId = await normalizeUserId(authUser.uid, rawEmail)
    }

    if (!dbUserId) {
      try {
        const created = await createOrUpdateUser({
          email: rawEmail.toLowerCase(),
          name: rawEmail.split('@')[0] || 'User',
        })
        dbUserId = created.id
      } catch (syncErr) {
        logger.warn('deposit-reference: could not sync user to DB', {
          email: rawEmail,
          error: syncErr instanceof Error ? syncErr.message : String(syncErr),
        })
      }
    }

    if (!dbUserId) {
      return NextResponse.json(
        { success: false, error: 'Không tìm thấy tài khoản trong hệ thống. Vui lòng đăng xuất và đăng nhập lại.' },
        { status: 404 }
      )
    }

    const code = await getOrCreateUserDepositReferenceCode(dbUserId)
    return NextResponse.json({ success: true, code })
  } catch (error: any) {
    logger.error('deposit-reference GET error', error)
    return NextResponse.json(
      { success: false, error: 'Không thể tạo mã tham chiếu' },
      { status: 500 }
    )
  }
}
