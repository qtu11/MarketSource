import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { pool, getUserByEmail } from '@/lib/database'
import { checkRateLimitAndRespond } from '@/lib/rate-limit'
import { sendVerificationEmail } from '@/lib/email'
import { logger } from '@/lib/logger'

export const runtime = 'nodejs'

/**
 * POST /api/resend-verification { email }
 * Không cần đăng nhập (user chưa verify không có JWT hợp lệ). Có rate limit + CSRF (middleware).
 */
export async function POST(request: NextRequest) {
  try {
    let body: { email?: string } = {}
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ success: false, error: 'Dữ liệu không hợp lệ' }, { status: 400 })
    }

    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''

    // ✅ BUG #5 FIX: Rate limiting per-IP và per-Email
    const ipRateLimit = await checkRateLimitAndRespond(request, 3, 3600, 'resend-verify-ip')
    if (ipRateLimit) return ipRateLimit

    if (email) {
      const emailRateLimit = await checkRateLimitAndRespond(request, 3, 3600, 'resend-verify-email', email)
      if (emailRateLimit) return emailRateLimit
    }
    if (!email) {
      return NextResponse.json({ success: false, error: 'Email là bắt buộc' }, { status: 400 })
    }

    const user = await getUserByEmail(email)
    if (!user) {
      return NextResponse.json({
        success: true,
        message: 'Nếu email tồn tại và chưa xác minh, chúng tôi đã gửi hướng dẫn.',
      })
    }

    const verified = (user as { email_verified_at?: unknown }).email_verified_at
    if (verified) {
      return NextResponse.json({ success: false, error: 'Email đã được xác minh' }, { status: 400 })
    }

    const token = randomBytes(32).toString('hex')
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    await pool.query(
      `UPDATE users SET email_verification_token = $1, email_verification_expires = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3`,
      [token, expires, user.id]
    )

    const site =
      process.env.NEXT_PUBLIC_SITE_URL ||
      process.env.NEXTAUTH_URL ||
      'http://localhost:3000'
    const verifyUrl = `${site.replace(/\/$/, '')}/api/verify-email?token=${encodeURIComponent(token)}`

    try {
      await sendVerificationEmail(email, verifyUrl)
    } catch (e) {
      logger.warn('resend verification email failed', { error: e })
    }

    return NextResponse.json({ success: true, message: 'Đã gửi lại email xác minh' })
  } catch (e: any) {
    logger.error('resend-verification', e)
    return NextResponse.json({ success: false, error: e?.message || 'Lỗi hệ thống' }, { status: 500 })
  }
}
