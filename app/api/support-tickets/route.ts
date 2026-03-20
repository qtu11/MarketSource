import { NextRequest, NextResponse } from 'next/server'
import { verifyFirebaseToken } from '@/lib/api-auth'
import { logger } from '@/lib/logger'
import { getUserIdByEmail, query, queryOne } from '@/lib/database-mysql'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/support-tickets — lấy danh sách ticket của user đang đăng nhập
export async function GET(request: NextRequest) {
  try {
    const authUser = await verifyFirebaseToken(request)
    if (!authUser?.email) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const userId = await getUserIdByEmail(authUser.email)
    if (!userId) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 })
    }

    const tickets = await query<any[]>(
      `SELECT id, user_id, subject, category, priority, message, status,
              created_at, updated_at, admin_reply, admin_replied_at
       FROM support_tickets
       WHERE user_id = ?
       ORDER BY created_at DESC`,
      [userId]
    )

    return NextResponse.json({
      success: true,
      tickets: (tickets || []).map((t: any) => ({
        id: t.id.toString(),
        userId: t.user_id,
        subject: t.subject,
        category: t.category,
        priority: t.priority,
        message: t.message,
        status: t.status,
        createdAt: t.created_at,
        updatedAt: t.updated_at,
        adminReply: t.admin_reply || null,
        adminRepliedAt: t.admin_replied_at || null,
      })),
    })
  } catch (error: any) {
    logger.error('GET /api/support-tickets failed', error)
    return NextResponse.json({ success: false, error: error.message || 'Internal server error' }, { status: 500 })
  }
}

// POST /api/support-tickets — tạo ticket mới
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

    const body = await request.json()
    const { subject, category, priority, message } = body

    if (!subject || !message) {
      return NextResponse.json({ success: false, error: 'Thiếu subject hoặc message' }, { status: 400 })
    }

    const validCategories = ['product', 'payment', 'technical', 'account', 'other']
    const validPriorities = ['low', 'medium', 'high', 'urgent']
    const safeCategory = validCategories.includes(category) ? category : 'other'
    const safePriority = validPriorities.includes(priority) ? priority : 'medium'

    // ✅ FIX: Schema managed via migration, remove CREATE TABLE runtime

    const result = await query<any>(
      `INSERT INTO support_tickets (user_id, subject, category, priority, message, status)
       VALUES (?, ?, ?, ?, ?, 'open')`,
      [userId, subject.slice(0, 255), safeCategory, safePriority, message.slice(0, 10000)]
    )

    const insertId = (result as any).insertId
    const created = await queryOne<any>(
      'SELECT * FROM support_tickets WHERE id = ?',
      [insertId]
    )

    return NextResponse.json({
      success: true,
      ticket: {
        id: created?.id?.toString(),
        userId: created?.user_id,
        subject: created?.subject,
        category: created?.category,
        priority: created?.priority,
        message: created?.message,
        status: created?.status,
        createdAt: created?.created_at,
        updatedAt: created?.updated_at,
      },
    }, { status: 201 })
  } catch (error: any) {
    logger.error('POST /api/support-tickets failed', error)
    return NextResponse.json({ success: false, error: error.message || 'Internal server error' }, { status: 500 })
  }
}

// PUT /api/support-tickets — cập nhật status của ticket (user tự đổi hoặc admin đổi)
export async function PUT(request: NextRequest) {
  try {
    const authUser = await verifyFirebaseToken(request)
    if (!authUser?.email) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const userId = await getUserIdByEmail(authUser.email)
    if (!userId) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 })
    }

    const body = await request.json()
    const { ticketId, status } = body

    if (!ticketId || !status) {
      return NextResponse.json({ success: false, error: 'Thiếu ticketId hoặc status' }, { status: 400 })
    }

    const validStatuses = ['open', 'in-progress', 'resolved', 'closed']
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ success: false, error: 'Status không hợp lệ' }, { status: 400 })
    }

    // ✅ SECURITY: Chỉ cho user cập nhật ticket của chính mình
    const ticket = await queryOne<any>(
      'SELECT id, user_id FROM support_tickets WHERE id = ?',
      [ticketId]
    )

    if (!ticket) {
      return NextResponse.json({ success: false, error: 'Ticket not found' }, { status: 404 })
    }

    if (ticket.user_id !== userId) {
      return NextResponse.json({ success: false, error: 'Forbidden: Not your ticket' }, { status: 403 })
    }

    await query(
      'UPDATE support_tickets SET status = ?, updated_at = NOW() WHERE id = ?',
      [status, ticketId]
    )

    return NextResponse.json({ success: true, ticketId, status })
  } catch (error: any) {
    logger.error('PUT /api/support-tickets failed', error)
    return NextResponse.json({ success: false, error: error.message || 'Internal server error' }, { status: 500 })
  }
}
