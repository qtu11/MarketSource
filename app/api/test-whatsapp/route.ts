import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { logger } from '@/lib/logger'

export const runtime = 'nodejs'

async function ensureTestAccess(request: NextRequest) {
  if (process.env.NODE_ENV === 'development') return
  await requireAdmin(request)
}

export async function POST(request: NextRequest) {
  try {
    await ensureTestAccess(request)
    return NextResponse.json({
      success: true,
      message: 'Test WhatsApp endpoint is active',
      timestamp: new Date().toISOString(),
    })
  } catch (error: any) {
    logger.error('Test WhatsApp POST error', error)
    return NextResponse.json(
      { success: false, error: error?.message?.includes('Unauthorized') ? 'Unauthorized' : 'Internal server error' },
      { status: error?.message?.includes('Unauthorized') ? 401 : 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    await ensureTestAccess(request)
    return NextResponse.json({
      success: true,
      message: 'Use POST to trigger WhatsApp test',
    })
  } catch (error: any) {
    logger.error('Test WhatsApp GET error', error)
    return NextResponse.json(
      { success: false, error: error?.message?.includes('Unauthorized') ? 'Unauthorized' : 'Internal server error' },
      { status: error?.message?.includes('Unauthorized') ? 401 : 500 }
    )
  }
}
