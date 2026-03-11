import { NextRequest, NextResponse } from 'next/server'
import { createAdminToken } from '@/lib/jwt'
import { getUserByEmail } from '@/lib/database-mysql'
import { z } from 'zod'
import bcryptjs from 'bcryptjs'
import { logger } from '@/lib/logger'

export const runtime = 'nodejs'

// Validation schema
const loginSchema = z.object({
  email: z.string().email('Email không hợp lệ'),
  password: z.string().min(1, 'Mật khẩu không được để trống'),
  deviceInfo: z.any().optional(),
  ipAddress: z.string().optional(),
})

export async function POST(request: NextRequest) {
  try {
    // Rate limiting - 5 attempts per 15 minutes
    const { checkRateLimitAndRespond } = await import('@/lib/rate-limit')
    const rateLimitResponse = await checkRateLimitAndRespond(request, 5, 900, 'admin-login')
    if (rateLimitResponse) {
      return rateLimitResponse
    }

    let body;
    try {
      body = await request.json()
    } catch (e) {
      return NextResponse.json({
        success: false,
        error: 'Dữ liệu không hợp lệ hoặc thiếu'
      }, { status: 400 });
    }

    // Validate input với Zod
    const validation = loginSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json({
        success: false,
        error: validation.error.errors[0]?.message || 'Dữ liệu không hợp lệ'
      }, { status: 400 })
    }

    let { email, password, deviceInfo, ipAddress } = validation.data
    email = email.trim().toLowerCase()

    // 1. Kiểm tra Admin qua Database trước
    const dbUser = await getUserByEmail(email)
    let isValid = false
    let adminEmailFinal = email
    let adminNameFinal = 'Admin'

    if (dbUser && dbUser.role === 'admin') {
      // Xác minh mật khẩu DB
      if (dbUser.password_hash) {
        isValid = await bcryptjs.compare(password, dbUser.password_hash)
      } else {
        isValid = false; // Nên update password hash nếu chưa có
      }
      if (isValid) {
        adminNameFinal = dbUser.name || 'Admin'
      }
    } else {
      // 2. Nếu DB không có (hoặc ko phải admin), fallback về ENV credential
      const adminEmailEnv = process.env.ADMIN_EMAIL || ''
      const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH || ''
      const adminPasswordPlain = process.env.ADMIN_PASSWORD || ''

      if (email === adminEmailEnv) {
        if (adminPasswordHash) {
          isValid = await bcryptjs.compare(password, adminPasswordHash)
        } else if (adminPasswordPlain) {
          isValid = password === adminPasswordPlain
        }
        adminEmailFinal = adminEmailEnv
      }
    }

    if (!isValid) {
      return NextResponse.json({
        success: false,
        error: 'Thông tin đăng nhập không chính xác!'
      }, { status: 401 })
    }

    // Tạo JWT token
    const token = await createAdminToken('admin', adminEmailFinal)

    // ✅ SECURITY FIX: Generate CSRF token cho admin session
    const { generateCSRFToken, setCSRFTokenCookie } = await import('@/lib/csrf')
    const csrfToken = generateCSRFToken()

    // Create response
    const response = NextResponse.json({
      success: true,
      user: {
        id: dbUser?.id?.toString() || 'admin',
        email: adminEmailFinal,
        name: adminNameFinal,
        role: 'admin',
        loginTime: new Date().toISOString(),
        deviceInfo,
        ipAddress
      },
      token, // Include JWT token in response
      csrfToken // Include CSRF token in response (client cần gửi trong header)
    })

    // Set HTTP-only cookie for admin token
    response.cookies.set('admin-token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60, // 24 hours
      path: '/',
    })

    // ✅ SECURITY FIX: Set CSRF token cookie (httpOnly)
    setCSRFTokenCookie(response, csrfToken)

    return response

  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      logger.error('Admin login error', error)
    }
    return NextResponse.json({
      success: false,
      error: 'Lỗi hệ thống!'
    }, { status: 500 })
  }
}
