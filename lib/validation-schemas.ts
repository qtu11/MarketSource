/**
 * Zod Validation Schemas
 * Reusable validation schemas cho API endpoints
 */

import { z } from 'zod'

// User schemas
export const emailSchema = z.string().email('Email không hợp lệ')
export const passwordSchema = z.string().min(6, 'Mật khẩu phải có ít nhất 6 ký tự')

export const loginSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  deviceInfo: z.any().optional(),
  ipAddress: z.string().optional(),
})

export const registerSchema = z.object({
  name: z.string().min(2, 'Tên phải có ít nhất 2 ký tự').max(100),
  email: emailSchema,
  password: passwordSchema,
})

// Deposit schemas
export const depositMethodSchema = z.string().min(1, 'Phương thức thanh toán không được để trống')

export const depositSchema = z.object({
  amount: z.number()
    .min(5000, 'Số tiền tối thiểu là 5,000 VNĐ')
    .max(100000000, 'Số tiền tối đa là 100,000,000 VNĐ'), // ✅ FIX: Thêm max amount
  method: depositMethodSchema,
  transactionId: z.string().min(1, 'Mã giao dịch không được để trống').max(255),
  userId: z.union([z.string(), z.number()]).optional(),
  userEmail: z.string().email().optional(),
  userName: z.string().optional(),
  ipAddress: z.string().optional(),
  deviceInfo: z.object({
    deviceType: z.string().optional(),
    browser: z.string().optional(),
    os: z.string().optional(),
  }).optional(),
})

// Withdrawal schemas
export const withdrawalSchema = z.object({
  amount: z.number()
    .min(10000, 'Số tiền tối thiểu là 10,000 VNĐ')
    .max(100000000, 'Số tiền tối đa là 100,000,000 VNĐ'), // ✅ FIX: Thêm max amount
  bankName: z.string().min(2, 'Tên ngân hàng không hợp lệ'),
  accountNumber: z.string().regex(/^[0-9]{8,15}$/, 'Số tài khoản phải có 8-15 chữ số'),
  accountName: z.string().min(3, 'Tên chủ tài khoản phải có ít nhất 3 ký tự'),
  userId: z.union([z.string(), z.number()]).optional(),
  ipAddress: z.string().optional(),
  deviceInfo: z.object({
    deviceType: z.string().optional(),
    browser: z.string().optional(),
    os: z.string().optional(),
  }).optional(),
})

// Product schemas
export const productSchema = z.object({
  title: z.string().min(1, 'Tiêu đề không được để trống').max(255),
  description: z.string().optional().nullable(),
  detailedDescription: z.string().optional().nullable(),
  price: z.coerce.number().min(0, 'Giá không được âm'),
  category: z.string().optional().nullable(),
  demoUrl: z.string().optional().nullable(),
  downloadUrl: z.string().optional().nullable(),
  tags: z.array(z.string()).optional().nullable(),
  imageUrl: z.string().optional().nullable(),
  imageUrls: z.array(z.string()).optional().nullable(),
  isActive: z.boolean().optional(),
})

export const updateProductSchema = z.object({
  title: z.string().min(1, 'Tiêu đề không được để trống').max(255).optional(),
  description: z.string().optional().nullable(),
  detailedDescription: z.string().optional().nullable(),
  price: z.coerce.number().min(0, 'Giá không được âm').optional(),
  category: z.string().optional().nullable(),
  demoUrl: z.string().optional().nullable(),
  downloadUrl: z.string().optional().nullable(),
  tags: z.array(z.string()).optional().nullable(),
  imageUrl: z.string().optional().nullable(),
  imageUrls: z.array(z.string()).optional().nullable(),
  isActive: z.boolean().optional(),
  averageRating: z.coerce.number().min(0).max(5).optional(),
  downloadCount: z.coerce.number().int().min(0).optional(),
})

// Purchase schemas
export const purchaseSchema = z.object({
  userId: z.union([z.string(), z.number()]),
  productId: z.union([z.string(), z.number()]),
  amount: z.number().positive('Số tiền phải lớn hơn 0'),
})

// Update schemas
export const updateDepositStatusSchema = z.object({
  depositId: z.union([z.string(), z.number()]),
  status: z.enum(['pending', 'approved', 'rejected'], {
    errorMap: () => ({ message: 'Trạng thái không hợp lệ' })
  }),
  approvedBy: z.string().optional(),
})

export const updateWithdrawalStatusSchema = z.object({
  withdrawalId: z.union([z.string(), z.number()]),
  status: z.enum(['pending', 'approved', 'rejected'], {
    errorMap: () => ({ message: 'Trạng thái không hợp lệ' })
  }),
  approvedBy: z.string().optional(),
})

// Account number validation helper
export function validateAccountNumber(accountNumber: string): boolean {
  return /^[0-9]{8,15}$/.test(accountNumber)
}

// Phone number validation helper
export function validatePhoneNumber(phone: string): boolean {
  return /^(\+84|0)[0-9]{9,10}$/.test(phone.replace(/\s/g, ''))
}

