import { NextResponse } from 'next/server'
import { notifyDepositRequest, notifyWithdrawalRequest } from '@/lib/notifications'
import { logger } from '@/lib/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    // This is a test endpoint to trigger notifications.
    // In a real application, these would be triggered by actual events.

    // You can uncomment one of the cases below to test a specific notification.
    const testCase = 'deposit' as any // Change to 'withdrawal' to test withdrawal notification

    switch (testCase) {
      case 'deposit':
        await notifyDepositRequest({
          userName: 'Test User',
          userEmail: 'test@example.com',
          amount: 100000,
          method: 'Momo',
          transactionId: 'TEST-123'
        })
        break
      case 'withdrawal':
        await notifyWithdrawalRequest({
          userName: 'Test User',
          userEmail: 'test@example.com',
          amount: 50000,
          bankName: 'Vietcombank',
          accountNumber: '123456789',
          accountName: 'TEST USER'
        })
        break
      default:
        // No specific test case selected, do nothing or log a message
        logger.info('No specific notification test case selected.', { endpoint: '/api/test-notifications' });
        break;
    }

    return NextResponse.json({
      success: true,
      message: "Test notifications sent successfully"
    })
  } catch (error: any) {
    logger.error('Test notification error', error, { endpoint: '/api/test-notifications' })
    return NextResponse.json(
      {
        success: false,
        error: error.message
      },
      { status: 500 }
    )
  }
}
