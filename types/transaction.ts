/**
 * Transaction Types & Interfaces
 */

export interface Deposit {
  id: number | string
  userId: number | string
  user_id?: number | string
  userEmail?: string | null
  user_email?: string | null
  userName?: string | null
  amount: number | string
  method?: string | null
  transactionId?: string | null
  status?: 'pending' | 'approved' | 'rejected' | 'failed'
  timestamp?: string | Date
  approvedTime?: string | Date | null
  approvedBy?: string | null
  created_at?: string | Date
}

export interface Withdrawal {
  id: number | string
  userId: number | string
  user_id?: number | string
  userEmail?: string | null
  user_email?: string | null
  userName?: string | null
  amount: number | string
  bankName?: string | null
  accountNumber?: string | null
  accountName?: string | null
  status?: 'pending' | 'approved' | 'rejected' | 'failed'
  created_at?: string | Date
  approvedTime?: string | Date | null
  approvedBy?: string | null
  requestTime?: string | Date
}

export interface Transaction {
  id: number | string
  userId: number | string
  productId?: number | string | null
  referenceCode?: string | null
  amount: number | string
  type: 'deposit' | 'withdraw' | 'purchase'
  status: 'pending' | 'approved' | 'rejected' | 'failed'
  method?: string | null
  metadata?: Record<string, unknown> | null
  created_at?: string | Date
  updated_at?: string | Date
}

