import { logger } from "./logger"

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

const STORAGE_KEYS = {
  CURRENT: "currentUser",
  LEGACY: "qtusdev_user",
  USERS_MAP: "users",
  LOGGED_IN: "isLoggedIn",
  SYNC_QUEUE: "user_sync_queue",
}

const isBrowser = () => typeof window !== "undefined"

type UsersMap = Record<string, UserData>

class UserManager {
  private firestorePromise: Promise<any | null> | null = null

  private getNavigatorOnline(): boolean {
    if (!isBrowser()) return false
    if (typeof navigator === "undefined") return false
    return navigator.onLine
  }

  private safeParse<T>(value: string | null): T | null {
    if (!value) return null
    try {
      return JSON.parse(value) as T
    } catch (error) {
      logger.warn("UserManager.safeParse failed", { error })
      return null
    }
  }

  private readUsersMap(): UsersMap {
    if (!isBrowser()) return {}
    const raw = localStorage.getItem(STORAGE_KEYS.USERS_MAP)
    return this.safeParse<UsersMap>(raw) || {}
  }

  private writeUsersMap(map: UsersMap) {
    if (!isBrowser()) return
    try {
      localStorage.setItem(STORAGE_KEYS.USERS_MAP, JSON.stringify(map))
    } catch (error) {
      logger.warn("UserManager.writeUsersMap failed", { error })
    }
  }

  private cacheUserLocally(user: UserData, options: { setAsCurrent?: boolean } = {}): boolean {
    if (!isBrowser()) return false
    try {
      const serialized = JSON.stringify(user)
      localStorage.setItem(`user_${user.uid}`, serialized)

      const currentUser = this.getCurrentLocalUser()
      const shouldUpdateCurrent =
        typeof options.setAsCurrent === "boolean"
          ? options.setAsCurrent
          : !currentUser || currentUser.uid === user.uid

      if (shouldUpdateCurrent) {
        localStorage.setItem(STORAGE_KEYS.CURRENT, serialized)
        localStorage.setItem(STORAGE_KEYS.LEGACY, serialized)
        localStorage.setItem(STORAGE_KEYS.LOGGED_IN, "true")
      }

      const map = this.readUsersMap()
      map[user.uid] = user
      this.writeUsersMap(map)

      // ✅ FIX: Dispatch event để UI reactive cập nhật (balance, name, etc.)
      try {
        window.dispatchEvent(new Event('userUpdated'))
      } catch (_) { /* SSR safe */ }

      return true
    } catch (error) {
      logger.warn("UserManager.cacheUserLocally failed", { error })
      return false
    }
  }

  private getLocalUser(uid: string): UserData | null {
    if (!isBrowser()) return null

    const map = this.readUsersMap()
    if (map[uid]) {
      return map[uid]
    }

    const stored = this.safeParse<UserData>(localStorage.getItem(`user_${uid}`))
    if (stored?.uid === uid) {
      return stored
    }

    const currentUser = this.safeParse<UserData>(localStorage.getItem(STORAGE_KEYS.CURRENT))
    if (currentUser?.uid === uid) {
      return currentUser
    }

    const legacyUser = this.safeParse<UserData>(localStorage.getItem(STORAGE_KEYS.LEGACY))
    if (legacyUser?.uid === uid) {
      return legacyUser
    }

    return null
  }

  private getLocalUserByEmail(email: string): UserData | null {
    if (!isBrowser()) return null
    const normalizedEmail = email.toLowerCase()

    const currentUser = this.safeParse<UserData>(localStorage.getItem(STORAGE_KEYS.CURRENT))
    if (currentUser?.email?.toLowerCase() === normalizedEmail) {
      return currentUser
    }

    const users = Object.values(this.readUsersMap())
    return (
      users.find(user => user.email?.toLowerCase() === normalizedEmail) ||
      null
    )
  }

  private getCurrentLocalUser(): UserData | null {
    if (!isBrowser()) return null
    return (
      this.safeParse<UserData>(localStorage.getItem(STORAGE_KEYS.CURRENT)) ||
      this.safeParse<UserData>(localStorage.getItem(STORAGE_KEYS.LEGACY))
    )
  }

  private readOfflineQueue(): UserData[] {
    if (!isBrowser()) return []
    return this.safeParse<UserData[]>(localStorage.getItem(STORAGE_KEYS.SYNC_QUEUE)) || []
  }

  private writeOfflineQueue(queue: UserData[]) {
    if (!isBrowser()) return
    try {
      localStorage.setItem(STORAGE_KEYS.SYNC_QUEUE, JSON.stringify(queue))
    } catch (error) {
      logger.warn("UserManager.writeOfflineQueue failed", { error })
    }
  }

  private queueOfflineSync(user: UserData) {
    if (!isBrowser()) return
    const queue = this.readOfflineQueue()
    queue.push(user)
    this.writeOfflineQueue(queue)
  }

  private async getFirestoreInstance(): Promise<any | null> {
    if (!isBrowser()) return null
    if (this.firestorePromise) return this.firestorePromise

    this.firestorePromise = (async () => {
      try {
        const { initializeApp, getApps } = await import("firebase/app")
        const { getFirestore } = await import("firebase/firestore")

        if (
          !process.env.NEXT_PUBLIC_FIREBASE_API_KEY ||
          !process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ||
          !process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
        ) {
          return null
        }

        const config = {
          apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
          authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
          projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        }

        const app = getApps().length ? getApps()[0] : initializeApp(config)
        return getFirestore(app)
      } catch (error) {
        logger.warn("UserManager.getFirestoreInstance failed", { error })
        return null
      }
    })()

    return this.firestorePromise
  }

  private async fetchFromFirestore(uid: string): Promise<UserData | null> {
    try {
      const firestore = await this.getFirestoreInstance()
      if (!firestore) return null
      const { doc, getDoc } = await import("firebase/firestore")
      const snapshot = await getDoc(doc(firestore, "users", uid))
      if (!snapshot.exists()) return null
      return { uid, ...snapshot.data() } as UserData
    } catch (error) {
      logger.warn("UserManager.fetchFromFirestore failed", { error, uid })
      return null
    }
  }

  private async saveToFirestore(user: UserData): Promise<boolean> {
    try {
      const firestore = await this.getFirestoreInstance()
      if (!firestore) return false
      const { doc, setDoc } = await import("firebase/firestore")
      await setDoc(doc(firestore, "users", user.uid), user, { merge: true })
      return true
    } catch (error) {
      logger.warn("UserManager.saveToFirestore failed", { error, uid: user.uid })
      return false
    }
  }

  private async persistToApi(user: UserData): Promise<boolean> {
    if (!isBrowser()) return false
    try {
      const payload = {
        email: user.email,
        name: user.name || user.displayName,
        username: user.username || user.email?.split("@")[0],
        avatarUrl: user.avatar || user.avatar_url || user.image,
        provider: user.provider || "email",
        ipAddress: user.ipAddress || user.ip || "unknown",
      }

      if (!payload.email) {
        return false
      }

      const response = await fetch("/api/save-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      return response.ok
    } catch (error) {
      logger.warn("UserManager.persistToApi failed", { error, uid: user.uid })
      return false
    }
  }

  private async fetchUserFromApi(uidOrEmail: string): Promise<UserData | null> {
    if (!isBrowser()) return null
    try {
      const response = await fetch(`/api/get-user?uid=${encodeURIComponent(uidOrEmail)}`, {
        cache: "no-store",
      })
      const data = await response.json().catch(() => null)
      if (response.ok && data?.data) {
        return data.data as UserData
      }
    } catch (error) {
      logger.warn("UserManager.fetchUserFromApi failed", { error, uid: uidOrEmail })
    }
    return null
  }

  private mergeUserRecords(...records: Array<UserData | null | undefined>): UserData | null {
    const validRecords = records.filter((record): record is UserData => !!record)
    if (!validRecords.length) return null

    const merged = validRecords.reduce<UserData>((acc, curr) => {
      return { ...acc, ...curr }
    }, {} as UserData)

    return merged.uid ? merged : null
  }

  private normalizeUser(uid: string, data: Partial<UserData>, existing?: UserData | null): UserData {
    const now = new Date().toISOString()
    const normalizedLoginCount =
      typeof data.loginCount === "number"
        ? data.loginCount
        : typeof existing?.loginCount === "number"
          ? existing.loginCount + 1
          : 1

    return {
      ...(existing || {}),
      ...data,
      uid,
      lastActivity: data.lastActivity || now,
      loginCount: normalizedLoginCount,
      updatedAt: now,
    }
  }

  private async persistRemotely(user: UserData): Promise<{ firestoreSaved: boolean; apiSaved: boolean }> {
    if (!this.getNavigatorOnline()) {
      this.queueOfflineSync(user)
      return { firestoreSaved: false, apiSaved: false }
    }

    const [firestoreSaved, apiSaved] = await Promise.all([
      this.saveToFirestore(user),
      this.persistToApi(user),
    ])

    return { firestoreSaved, apiSaved }
  }

  async flushOfflineQueue(): Promise<void> {
    if (!isBrowser() || !this.getNavigatorOnline()) return
    const queue = this.readOfflineQueue()
    if (!queue.length) return

    const remaining: UserData[] = []
    for (const queuedUser of queue) {
      const result = await this.persistRemotely(queuedUser)
      if (!result.firestoreSaved || !result.apiSaved) {
        remaining.push(queuedUser)
      }
    }

    this.writeOfflineQueue(remaining)
  }

  async getUserData(uid: string): Promise<UserData | null> {
    if (!uid) return null

    try {
      if (!isBrowser()) {
        return null
      }

      const localData = this.getLocalUser(uid)
      const remoteData = this.getNavigatorOnline() ? await this.fetchFromFirestore(uid) : null
      const apiData =
        this.getNavigatorOnline() && !localData ? await this.fetchUserFromApi(uid) : null

      const merged = this.mergeUserRecords(apiData, remoteData, localData)
      if (merged) {
        this.cacheUserLocally(merged)
      }
      return merged
    } catch (error) {
      logger.warn("UserManager.getUserData failed", { error, uid })
      return null
    }
  }

  async updateBalance(uid: string, newBalance: number): Promise<void> {
    try {
      const existing = await this.getUserData(uid)
      const updated = this.normalizeUser(uid, { ...existing, balance: newBalance }, existing)
      const isCurrent = this.getCurrentLocalUser()?.uid === uid
      this.cacheUserLocally(updated, { setAsCurrent: isCurrent })
      const result = await this.persistRemotely(updated)
      if (!result.firestoreSaved || !result.apiSaved) {
        logger.warn("UserManager.updateBalance sync incomplete", { uid, result })
      }

      // ✅ BUG #7 FIX: Đồng bộ balance lên PostgreSQL qua API
      // (persistRemotely chỉ sync lên Firestore + /api/save-user, không update balance trong DB)
      if (isBrowser() && existing?.email) {
        try {
          await fetch('/api/update-balance', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              userEmail: existing.email,
              newBalance,
            }),
          })
        } catch (syncErr) {
          logger.warn('UserManager.updateBalance: Failed to sync balance to PostgreSQL', { uid, syncErr })
        }
      }
    } catch (error) {
      logger.warn("UserManager.updateBalance failed", { error, uid })
    }
  }


  async saveUserData(uid: string, data: Partial<UserData>): Promise<UserSyncResult> {
    if (!uid) {
      return {
        localSaved: false,
        firestoreSaved: false,
        apiSaved: false,
        offlineQueued: false,
        loginCount: 0,
        message: "UID is required",
      }
    }

    const existing = this.getLocalUser(uid)
    const normalized = this.normalizeUser(uid, data, existing)
    const localSaved = this.cacheUserLocally(normalized, { setAsCurrent: true })

    let firestoreSaved = false
    let apiSaved = false
    let offlineQueued = false

    if (this.getNavigatorOnline()) {
      const remoteResult = await this.persistRemotely(normalized)
      firestoreSaved = remoteResult.firestoreSaved
      apiSaved = remoteResult.apiSaved
    } else {
      this.queueOfflineSync(normalized)
      offlineQueued = true
    }

    return {
      localSaved,
      firestoreSaved,
      apiSaved,
      offlineQueued,
      loginCount: normalized.loginCount ?? 1,
    }
  }

  async setUser(userData: UserData): Promise<UserSyncResult> {
    const now = new Date().toISOString()
    const existing = this.getLocalUser(userData.uid)
    const payload = {
      ...userData,
      lastActivity: now,
      loginCount: (existing?.loginCount ?? 0) + 1,
    }
    return this.saveUserData(userData.uid, payload)
  }

  async getUser(): Promise<UserData | null> {
    if (!isBrowser()) return null
    const cached = this.getCurrentLocalUser()
    if (!cached) return null

    if (!this.getNavigatorOnline()) {
      return cached
    }

    const refreshed = await this.getUserData(cached.uid)
    return refreshed || cached
  }

  isLoggedIn(): boolean {
    if (!isBrowser()) return false
    const isFlagSet = localStorage.getItem(STORAGE_KEYS.LOGGED_IN) === "true"
    const userExists = !!this.getCurrentLocalUser()
    return isFlagSet && userExists
  }

  private activeUsersPromise: Promise<UserData[]> | null = null;
  private lastUsersFetchTime = 0;

  async getAllUsers(): Promise<UserData[]> {
    if (!isBrowser()) {
      return []
    }

    try {
      const usersMap = this.readUsersMap()
      const cachedUsers = Object.values(usersMap)

      // ✅ FIX: Trả về local cache nếu mạng offline hoặc chưa tới thời hạn TTL (5000ms)
      if (!this.getNavigatorOnline() || (Date.now() - this.lastUsersFetchTime < 5000 && cachedUsers.length > 0)) {
        return cachedUsers;
      }

      // ✅ FIX: Nếu đang có request chạy thì return Promise đó (chống Cache Stampede)
      if (this.activeUsersPromise) {
        return this.activeUsersPromise;
      }

      this.activeUsersPromise = (async () => {
        try {
          const { apiGet } = await import("./api-client")
          const result = await apiGet("/api/users")
          const usersArray = result?.users || result?.data || []

          if (Array.isArray(usersArray) && usersArray.length > 0) {
            const normalizedUsers = usersArray.map((user: any) => ({
              uid: user.id?.toString() || user.uid || "",
              id: user.id,
              email: user.email,
              name: user.name || user.username,
              displayName: user.name || user.username,
              username: user.username,
              avatar_url: user.avatar_url,
              avatar: user.avatar_url,
              balance: user.balance ? parseFloat(String(user.balance)) : 0,
              role: user.role || "user",
              createdAt: user.created_at,
              lastActivity: user.last_login || user.updated_at,
              ipAddress: user.ip_address,
              provider: user.provider || "email",
              ...user,
            })) as UserData[]

            normalizedUsers.forEach(user => {
              if (user.uid) {
                const isCurrent = this.getCurrentLocalUser()?.uid === user.uid
                this.cacheUserLocally(user, { setAsCurrent: isCurrent })
              }
            })

            this.lastUsersFetchTime = Date.now();
            return normalizedUsers
          }
        } catch (apiError) {
          logger.warn("UserManager.getAllUsers API fallback", { error: apiError })
        }

        return Object.values(this.readUsersMap());
      })();

      try {
        return await this.activeUsersPromise;
      } finally {
        this.activeUsersPromise = null;
      }
    } catch (error) {
      logger.warn("UserManager.getAllUsers failed", { error })
      return []
    }
  }

  async findUserByEmail(email: string): Promise<UserData | null> {
    if (!email) return null
    const localUser = this.getLocalUserByEmail(email)
    if (localUser) {
      return localUser
    }

    if (this.getNavigatorOnline()) {
      const remoteUser = await this.fetchUserFromApi(email)
      if (remoteUser) {
        this.cacheUserLocally(remoteUser, { setAsCurrent: true })
        return remoteUser
      }
    }

    return null
  }
}

export const userManager = new UserManager()

if (isBrowser()) {
  window.addEventListener("online", () => {
    userManager.flushOfflineQueue().catch(error => {
      logger.warn("UserManager.flushOfflineQueue listener failed", { error })
    })
  })
}

