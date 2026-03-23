import { logger } from "./logger"
import { removeLocalStorage, setLocalStorage } from "./localStorage-utils"

export interface UserData {
  uid: string
  id?: number | string
  email?: string
  name?: string
  displayName?: string
  username?: string
  avatar?: string
  avatar_url?: string
  image?: string
  provider?: string
  ip?: string
  ipAddress?: string
  balance?: number
  rank?: string
  locPoints?: number
  totalSpent?: number
  lastActivity?: string
  loginCount?: number
  role?: string
  createdAt?: string
  updatedAt?: string
  purchasedProducts?: any[]
  notifications?: any[]
  meta?: Record<string, any>
  [key: string]: any
}

export interface UserSyncResult {
  localSaved: boolean
  firestoreSaved: boolean
  apiSaved: boolean
  offlineQueued: boolean
  loginCount: number
  message?: string
}

const isBrowser = () => typeof window !== "undefined"

class UserManager {
  /**
   * Lấy dữ liệu người dùng từ API (Real Database).
   * Không còn dùng LocalStorage cache để tránh stale data.
   */
  async getUserData(uid: string): Promise<UserData | null> {
    if (!uid || !isBrowser()) return null

    try {
      const response = await fetch(`/api/get-user?uid=${encodeURIComponent(uid)}`, {
        cache: "no-store",
      })
      const data = await response.json().catch(() => null)
      if (response.ok && data?.data) {
        return data.data as UserData
      }
    } catch (error) {
      logger.warn("UserManager.getUserData fetch failed", { error, uid })
    }
    return null
  }

  /**
   * Cập nhật số dư (Dùng API Admin hoặc Hệ thống).
   * Note: Client không được tự gọi update balance vì lý do bảo mật.
   */
  async updateBalance(uid: string, newBalance: number): Promise<void> {
    logger.warn("UserManager.updateBalance called from client. This is restricted. Balance should be updated via server-side transactions.")
  }

  /**
   * Lưu hoặc đồng bộ người dùng vào Database.
   */
  async saveUserData(uid: string, data: Partial<UserData>): Promise<UserSyncResult> {
    if (!uid || !isBrowser()) {
      return { localSaved: false, firestoreSaved: false, apiSaved: false, offlineQueued: false, loginCount: 0, message: "Invalid session" }
    }

    try {
      const { getCsrfHeaders } = await import("@/lib/csrf-client")
      const csrf = await getCsrfHeaders()
      const payload = {
        email: data.email,
        name: data.name || data.displayName,
        username: data.username || data.email?.split("@")[0],
        avatarUrl: data.avatar || data.avatar_url || data.image,
        provider: data.provider || "email",
        ipAddress: data.ipAddress || data.ip || "unknown",
      }

      const response = await fetch("/api/save-user", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...csrf },
        credentials: "include",
        body: JSON.stringify(payload),
      })

      const success = response.ok

      // Header, DebugInfo, cart/checkout… vẫn đọc localStorage `currentUser` + `isLoggedIn`.
      // Trước đây chỉ gọi API nên không ghi storage → UI tưởng chưa đăng nhập dù cookie auth-token đã có.
      const mergedForClient: UserData = {
        uid,
        ...data,
      }
      try {
        setLocalStorage("currentUser", mergedForClient)
        // Không dùng setLocalStorage cho flag này: code cũ dùng getItem === 'true' (chuỗi thuần), không phải JSON boolean.
        localStorage.setItem("isLoggedIn", "true")
        window.dispatchEvent(new Event("userUpdated"))
      } catch (persistErr) {
        logger.warn("userManager: persist session to localStorage failed", { error: persistErr })
      }

      return {
        localSaved: true,
        firestoreSaved: true,
        apiSaved: success,
        offlineQueued: false,
        loginCount: data.loginCount || 1,
      }
    } catch (error) {
      logger.error("UserManager.saveUserData failed", { error, uid })
      return { localSaved: false, firestoreSaved: false, apiSaved: false, offlineQueued: false, loginCount: 0 }
    }
  }

  async setUser(userData: UserData): Promise<UserSyncResult> {
    return this.saveUserData(userData.uid, userData)
  }

  /**
   * Lấy người dùng hiện tại từ session.
   */
  async getUser(): Promise<UserData | null> {
    if (!isBrowser()) return null
    // Trong NextAuth, nên dùng useSession hook thay cho userManager.getUser()
    // Tuy nhiên để tương thích, ta có thể fetch profile hiện tại.
    try {
      const response = await fetch("/api/profile", {
        cache: "no-store",
        credentials: "include",
      })
      // Nếu token hết hạn/invalid thì không được fallback localStorage (tránh UI stale)
      if (response.status === 401 || response.status === 403) {
        removeLocalStorage("currentUser")
        removeLocalStorage("qtusdev_user")
        removeLocalStorage("isLoggedIn")
        return null
      }

      const data = await response.json().catch(() => null)
      if (!data?.success || !data?.profile) return null
      const p = data.profile
      return {
        uid: String(p.id),
        id: p.id,
        email: p.email,
        name: p.name,
        displayName: p.name,
        avatar: p.avatarUrl,
        avatar_url: p.avatarUrl,
        balance: p.balance,
        rank: p.rank,
        locPoints: p.loc_points,
      } as UserData
    } catch {
      return null
    }
  }

  isLoggedIn(): boolean {
    if (!isBrowser()) return false
    // Tạm thời dựa vào cookie hoặc session token do NextAuth quản lý
    return true // Placeholder - components should use useSession()
  }

  async getAllUsers(): Promise<UserData[]> {
    if (!isBrowser()) return []
    try {
      const response = await fetch("/api/users", { cache: "no-store" })
      const data = await response.json().catch(() => null)
      const usersArray = data?.users || data?.data || []
      return usersArray.map((user: any) => ({
        ...user,
        uid: user.id?.toString() || user.uid,
      })) as UserData[]
    } catch (error) {
      logger.error("UserManager.getAllUsers failed", { error })
      return []
    }
  }

  async findUserByEmail(email: string): Promise<UserData | null> {
    if (!email || !isBrowser()) return null
    return this.getUserData(email)
  }

  async flushOfflineQueue(): Promise<void> {
    // No-op - offline queue removed for data integrity
  }
}

export const userManager = new UserManager()
