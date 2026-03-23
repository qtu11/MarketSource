import { NextRequest, NextResponse } from 'next/server'
import { publishTickerEvent } from '@/lib/realtime/events'

export async function GET(request: NextRequest) {
  try {
    await publishTickerEvent("User a***@gmail.com vừa chốt đơn Source Code SaaS AI", "purchase");
    await publishTickerEvent("Hệ thống vừa thanh toán 5.000.000đ hoa hồng cho cộng tác viên DevMaster", "commission");
    await publishTickerEvent("User t***@gmail.com vừa thăng hạng lên Senior Dev!", "achievement");
    
    return NextResponse.json({ success: true, message: "Ticker events seeded" });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
