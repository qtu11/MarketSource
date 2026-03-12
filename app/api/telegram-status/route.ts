import { NextResponse } from "next/server"

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const botToken = process.env.TELEGRAM_BOT_TOKEN || process.env.NEXT_PUBLIC_TELEGRAM_BOT_TOKEN
    const chatId = process.env.TELEGRAM_CHAT_ID || process.env.NEXT_PUBLIC_TELEGRAM_CHAT_ID

    if (!botToken || !chatId) {
      return NextResponse.json(
        {
          error: "Telegram configuration missing",
          status: "error",
          configured: false,
        },
        { status: 500 },
      )
    }

    // Test Telegram bot connection
    const response = await fetch(`https://api.telegram.org/bot${botToken}/getMe`)
    const data = await response.json()

    if (data.ok) {
      return NextResponse.json({
        status: "success",
        configured: true,
        bot: data.result,
        chatId: chatId,
      })
    } else {
      return NextResponse.json(
        {
          error: "Telegram bot not accessible",
          status: "error",
          configured: false,
        },
        { status: 500 },
      )
    }
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to check Telegram status",
        status: "error",
        configured: false,
      },
      { status: 500 },
    )
  }
}
