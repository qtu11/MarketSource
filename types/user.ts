/**
 * User Types & Interfaces
 * Thay thế type 'any' trong toàn bộ frontend
 */

export interface User {
  id: number // MySQL Primary Key
  uid: string // Firebase UID (Required for auth)
  email: string
  name: string | null
  displayName?: string | null
  username: string | null
  avatarUrl?: string | null
  image?: string | null
  passwordHash?: string | null
  ipAddress?: string | null
  role: 'user' | 'admin' | 'superadmin'
  balance: number
  totalSpent?: number
  status: 'active' | 'banned' | 'pending'
  created_at: string | Date
  updated_at: string | Date
  last_login_at?: string | Date
  lastActivity?: string | Date
  loginCount: number
  provider?: string
  providerId?: string
}

export interface UserProfile {
  id?: number
  userId: number
  phone?: string | null
  address?: string | null
  city?: string | null
  country?: string | null
  postalCode?: string | null
  socialLinks?: {
    google?: string | null
    github?: string | null
    facebook?: string | null
    [key: string]: string | null | undefined
  } | null
  twoFactorEnabled?: boolean
  twoFactorSecret?: string | null
  twoFactorBackupCodes?: string[] | null
  created_at?: string | Date
  updated_at?: string | Date
}

export interface UserSession {
  id: string
  userId: number | string
  sessionToken: string
  deviceInfo?: DeviceInfo
  ipAddress?: string
  createdAt: Date
  expiresAt: Date
  lastActivity?: Date
}

export interface DeviceInfo {
  userAgent: string
  platform: string
  language: string
  timezone: string
  deviceType?: string
  browser?: string
  os?: string
  screen?: {
    width: number
    height: number
  }
}

export interface UserSettings {
  userId: number | string
  notifications?: {
    email: boolean
    push: boolean
    sms: boolean
  }
  privacy?: {
    profileVisibility: 'public' | 'private' | 'friends'
    showEmail: boolean
    showPhone: boolean
  }
  preferences?: {
    theme: 'light' | 'dark' | 'auto'
    language: string
    currency: string
  }
}

