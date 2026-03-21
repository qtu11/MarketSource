import { NextResponse } from 'next/server'
import { generateCSRFToken, setCSRFTokenCookie } from '@/lib/csrf'

export const runtime = 'nodejs'
// ✅ FIX #22: Đảm bảo route này không bao giờ bị cache tĩnh (khắc phục lỗi Invalid CSRF Token liên tục)
export const dynamic = 'force-dynamic'

/** Cấp CSRF token + cookie (double-submit). Gọi trước các request POST/PUT/PATCH/DELETE. */
export async function GET() {
  const token = generateCSRFToken()
  const response = NextResponse.json({ csrfToken: token })
  return setCSRFTokenCookie(response, token)
}
