"use client"

export const runtime = 'nodejs'

import { useState, useEffect, useMemo, useCallback, useRef, FormEvent, ChangeEvent } from "react"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { User as UserIcon, Wallet, ShoppingBag, Download, CreditCard, TrendingUp, Calendar, Mail, Phone, MapPin, Eye, ExternalLink, LogOut, Settings, Bell, Star, Clock, DollarSign, Package, Star as StarIcon, Lock, Filter, Search, MessageSquare, ShieldCheck, KeyRound, ListChecks, Share2, Activity, Heart, Camera, Smartphone } from "lucide-react"
import { NotificationCenter } from "../components/NotificationCenter"
import { SpendingChart } from "../components/SpendingChart"
import { DownloadHistory } from "../components/DownloadHistory"
import { PersonalAnalytics } from "../components/PersonalAnalytics"
import { ReferralProgram } from "../components/ReferralProgram"
import type { ReferralStat } from "../components/ReferralProgram"
import { CouponsCenter } from "../components/CouponsCenter"
import { DeviceManagement } from "../components/DeviceManagement"
import { ReviewManager } from "../components/ReviewManager"
import { Logo } from "@/components/logo"
import { FloatingHeader } from "@/components/floating-header"
import { Footer } from "@/components/footer"
import dynamic from "next/dynamic"
import { ThreeDFallback } from "@/components/3d-fallback"
import { DebugInfo } from "@/components/DebugInfo"
import { DashboardChatClient } from "@/components/dashboard-chat-client"

// Lazy load Three.js components để tránh lỗi ReactCurrentOwner
const ThreeJSBackground = dynamic(
  () => import("@/components/three-js-background").then(mod => ({ default: mod.ThreeJSBackground })),
  {
    ssr: false,
    loading: () => <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-blue-50/50 to-indigo-50 dark:from-slate-950 dark:via-blue-950/50 dark:to-indigo-950" />
  }
)
import { getDeviceInfo, getIPAddress } from "@/lib/auth"
import { apiGet } from "@/lib/api-client"
import { logger } from "@/lib/logger-client"
import { setLocalStorage, getLocalStorage, removeLocalStorage } from "@/lib/localStorage-utils"
import type { User, Purchase, Deposit, Withdrawal, Notification, SupportTicket, DownloadRecord, ProductReview, DeviceSession, Coupon } from "@/types"
import type { UserData } from "@/lib/userManager"
import Image from "next/image"

export default function DashboardPage() {
  const router = useRouter()
  const { data: session, status: sessionStatus } = useSession()
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [userPurchases, setUserPurchases] = useState<Purchase[]>([])
  const [depositHistory, setDepositHistory] = useState<Deposit[]>([])
  const [withdrawHistory, setWithdrawHistory] = useState<Withdrawal[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [userIP, setUserIP] = useState<string>("Loading...")
  const [deviceInfo, setDeviceInfo] = useState<{ userAgent: string; platform: string; language: string; deviceType?: string; browser?: string; os?: string } | null>(null)
  const [wishlistIds, setWishlistIds] = useState<string[]>([])
  const [purchaseSearch, setPurchaseSearch] = useState("")
  const [purchaseSort, setPurchaseSort] = useState("recent")
  const [purchaseCategoryFilter, setPurchaseCategoryFilter] = useState("all")
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false)
  const [activityFilter, setActivityFilter] = useState("all")
  const [supportTickets, setSupportTickets] = useState<SupportTicket[]>([])
  const [ticketForm, setTicketForm] = useState({
    subject: "",
    category: "product",
    priority: "medium",
    message: ""
  })
  const [downloadRecords, setDownloadRecords] = useState<DownloadRecord[]>([])
  const [downloadLoading, setDownloadLoading] = useState(false)
  const [userReviews, setUserReviews] = useState<ProductReview[]>([])
  const [referralStats, setReferralStats] = useState<ReferralStat[]>([])
  const [referralMeta, setReferralMeta] = useState({
    code: "",
    totalCommission: 0,
    pendingCommission: 0,
  })
  const [couponList, setCouponList] = useState<Coupon[]>([])
  const [isApplyingCoupon, setIsApplyingCoupon] = useState(false)
  const [deviceSessions, setDeviceSessions] = useState<DeviceSession[]>([])
  const [securityPreferences, setSecurityPreferences] = useState({
    twoFactorEnabled: false,
    deviceAlerts: true,
    loginNotifications: true,
    backupCodesGenerated: false,
    backupCodes: [] as string[],
  })
  const [profileForm, setProfileForm] = useState({
    name: "",
    phone: "",
    address: "",
    city: "",
    country: "",
    socialGoogle: "",
    socialGithub: "",
    socialFacebook: "",
  })
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false)
  const [isSavingProfile, setIsSavingProfile] = useState(false)
  const [profileMessage, setProfileMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const [profileLoaded, setProfileLoaded] = useState(false)
  const avatarInputRef = useRef<HTMLInputElement | null>(null)
  const [twoFactorSecret, setTwoFactorSecret] = useState("")
  const [twoFactorQRCode, setTwoFactorQRCode] = useState("")
  const [twoFactorToken, setTwoFactorToken] = useState("")
  const [twoFactorBackupCodes, setTwoFactorBackupCodes] = useState<string[]>([])
  const [isStartingTwoFactor, setIsStartingTwoFactor] = useState(false)
  const [isVerifyingTwoFactor, setIsVerifyingTwoFactor] = useState(false)
  const [isDisablingTwoFactor, setIsDisablingTwoFactor] = useState(false)

  const normalizeRole = (role?: string | null): User["role"] => {
    if (role === "admin" || role === "superadmin" || role === "user") {
      return role
    }
    return undefined
  }

  const submitProfile = useCallback(
    async (payload: Record<string, any>) => {
      if (!currentUser?.email) return null
      const { apiPut } = await import('@/lib/api-client')
      const data = await apiPut("/api/profile", {
        email: currentUser.email,
        ...payload,
      })
      if (!data.success) {
        throw new Error(data.error || "Không thể cập nhật hồ sơ")
      }
      return data.profile
    },
    [currentUser?.email]
  )

  const loadUserProfile = useCallback(async () => {
    if (!currentUser?.email || profileLoaded) return
    try {
      const result = await apiGet(`/api/profile?email=${encodeURIComponent(currentUser.email)}`)
      if (result?.profile) {
        const profile = result.profile
        setProfileForm({
          name: profile.name || currentUser.name || "",
          phone: profile.phone || "",
          address: profile.address || "",
          city: profile.city || "",
          country: profile.country || "",
          socialGoogle: profile.socialLinks?.google || "",
          socialGithub: profile.socialLinks?.github || "",
          socialFacebook: profile.socialLinks?.facebook || "",
        })
        setAvatarPreview(profile.avatarUrl || currentUser.avatarUrl || currentUser.image || null)
        setSecurityPreferences((prev) => ({
          ...prev,
          twoFactorEnabled: profile.twoFactorEnabled ?? prev.twoFactorEnabled,
        }))
        setProfileLoaded(true)
      }
    } catch (error) {
      logger.warn("Không thể tải hồ sơ người dùng", { error })
      setProfileForm((prev) => ({
        ...prev,
        name: currentUser.name || prev.name || currentUser.email || "",
      }))
      setAvatarPreview((prev) => prev || currentUser.avatarUrl || currentUser.image || null)
      setProfileLoaded(true)
    }
  }, [currentUser, profileLoaded])

  useEffect(() => {
    if (currentUser?.email) {
      setProfileLoaded(false)
    }
  }, [currentUser?.email])

  useEffect(() => {
    loadUserProfile()

    // ✅ FIX: Lắng nghe sự kiện để cập nhật balance/profile khi admin duyệt hoặc user update elsewhere
    const handleUserUpdate = () => {
      setProfileLoaded(false)
      loadUserProfile()
    }

    window.addEventListener('userUpdated', handleUserUpdate)
    return () => window.removeEventListener('userUpdated', handleUserUpdate)
  }, [loadUserProfile])

  const handleProfileInputChange = (field: keyof typeof profileForm, value: string) => {
    setProfileForm((prev) => ({
      ...prev,
      [field]: value,
    }))
  }

  const handleAvatarChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || !currentUser?.email) return
    setIsUploadingAvatar(true)
    setProfileMessage(null)
    try {
      const formData = new FormData()
      formData.append("file", file)
      formData.append("email", currentUser.email)
      const response = await fetch("/api/profile/avatar", {
        method: "POST",
        body: formData,
      })
      const data = await response.json()
      if (!response.ok || !data?.success) {
        throw new Error(data.error || "Upload avatar thất bại")
      }
      setAvatarPreview(data.avatarUrl)
      setCurrentUser((prev: any) =>
        prev
          ? {
            ...prev,
            avatarUrl: data.avatarUrl,
            image: data.avatarUrl,
          }
          : prev
      )
      setProfileMessage({ type: "success", text: "Đã cập nhật avatar" })
    } catch (error: any) {
      logger.error("Avatar upload failed", error, { email: currentUser.email })
      setProfileMessage({ type: "error", text: error.message || "Không thể upload avatar" })
    } finally {
      setIsUploadingAvatar(false)
    }
  }

  const handleProfileSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!currentUser?.email) return
    setIsSavingProfile(true)
    setProfileMessage(null)
    try {
      const payload = {
        name: profileForm.name || currentUser.name || currentUser.email,
        avatarUrl: avatarPreview || currentUser.avatarUrl || currentUser.image || null,
        phone: profileForm.phone || null,
        address: profileForm.address || null,
        city: profileForm.city || null,
        country: profileForm.country || null,
        socialLinks: {
          google: profileForm.socialGoogle || null,
          github: profileForm.socialGithub || null,
          facebook: profileForm.socialFacebook || null,
        },
      }
      const updatedProfile = await submitProfile(payload)
      if (updatedProfile) {
        setCurrentUser((prev: any) =>
          prev
            ? {
              ...prev,
              name: updatedProfile.name || prev.name,
              avatarUrl: updatedProfile.avatarUrl || prev.avatarUrl,
              image: updatedProfile.avatarUrl || prev.image,
            }
            : prev
        )
        setProfileMessage({ type: "success", text: "Đã lưu thông tin cá nhân" })
      }
    } catch (error: any) {
      logger.error("Profile update failed", error, { email: currentUser.email })
      setProfileMessage({ type: "error", text: error.message || "Không thể lưu thay đổi" })
    } finally {
      setIsSavingProfile(false)
    }
  }

  const startTwoFactorSetup = async () => {
    if (!currentUser?.email) return
    setIsStartingTwoFactor(true)
    setProfileMessage(null)
    setTwoFactorBackupCodes([])
    setTwoFactorToken("")
    try {
      const response = await fetch("/api/profile/2fa/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: currentUser.email }),
      })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Không thể khởi tạo 2FA")
      }
      setTwoFactorSecret(data.secret)
      setTwoFactorQRCode(data.qrCode)
    } catch (error: any) {
      setProfileMessage({ type: "error", text: error.message || "Không thể khởi tạo 2FA" })
    } finally {
      setIsStartingTwoFactor(false)
    }
  }

  const verifyTwoFactor = async () => {
    if (!currentUser?.email || !twoFactorSecret || !twoFactorToken) return
    setIsVerifyingTwoFactor(true)
    setProfileMessage(null)
    try {
      const response = await fetch("/api/profile/2fa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: currentUser.email,
          secret: twoFactorSecret,
          token: twoFactorToken,
        }),
      })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Không thể kích hoạt 2FA")
      }
      setTwoFactorBackupCodes(data.backupCodes || [])
      setSecurityPreferences((prev) => ({
        ...prev,
        twoFactorEnabled: true,
        backupCodes: data.backupCodes || prev.backupCodes,
        backupCodesGenerated: true,
      }))
      setTwoFactorToken("")
      setTwoFactorSecret("")
      setTwoFactorQRCode("")
      setProfileMessage({ type: "success", text: "Đã bật 2FA thành công" })
    } catch (error: any) {
      setProfileMessage({ type: "error", text: error.message || "Không thể kích hoạt 2FA" })
    } finally {
      setIsVerifyingTwoFactor(false)
    }
  }

  const disableTwoFactor = async () => {
    if (!currentUser?.email) return
    setIsDisablingTwoFactor(true)
    setProfileMessage(null)
    try {
      const response = await fetch("/api/profile/2fa/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: currentUser.email }),
      })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Không thể tắt 2FA")
      }
      setSecurityPreferences((prev) => ({
        ...prev,
        twoFactorEnabled: false,
        backupCodes: [],
      }))
      setTwoFactorSecret("")
      setTwoFactorQRCode("")
      setTwoFactorToken("")
      setTwoFactorBackupCodes([])
      setProfileMessage({ type: "success", text: "Đã tắt 2FA" })
    } catch (error: any) {
      setProfileMessage({ type: "error", text: error.message || "Không thể tắt 2FA" })
    } finally {
      setIsDisablingTwoFactor(false)
    }
  }

  const wishlistProducts = useMemo(
    () => userPurchases.filter((p) => wishlistIds.includes(String(p.id))),
    [userPurchases, wishlistIds]
  )

  const purchaseCategories = useMemo(() => {
    const categories = new Set<string>()
    userPurchases.forEach((purchase) => {
      if (purchase.category) categories.add(purchase.category)
    })
    return Array.from(categories)
  }, [userPurchases])

  const filteredPurchases = useMemo(() => {
    let data = [...userPurchases]

    if (purchaseSearch) {
      data = data.filter((purchase) =>
        purchase.title?.toLowerCase().includes(purchaseSearch.toLowerCase())
      )
    }

    if (purchaseCategoryFilter !== "all") {
      data = data.filter((purchase) => purchase.category === purchaseCategoryFilter)
    }

    if (showFavoritesOnly) {
      data = data.filter((purchase) => wishlistIds.includes(String(purchase.id)))
    }

    switch (purchaseSort) {
      case "price-asc":
        data.sort((a, b) => {
          const priceA = typeof a.price === 'number' ? a.price : (typeof a.price === 'string' ? parseFloat(a.price) || 0 : 0)
          const priceB = typeof b.price === 'number' ? b.price : (typeof b.price === 'string' ? parseFloat(b.price) || 0 : 0)
          return priceA - priceB
        })
        break
      case "price-desc":
        data.sort((a, b) => {
          const priceA = typeof a.price === 'number' ? a.price : (typeof a.price === 'string' ? parseFloat(a.price) || 0 : 0)
          const priceB = typeof b.price === 'number' ? b.price : (typeof b.price === 'string' ? parseFloat(b.price) || 0 : 0)
          return priceB - priceA
        })
        break
      case "name":
        data.sort((a, b) => (a.title || "").localeCompare(b.title || ""))
        break
      default:
        data.sort(
          (a, b) => {
            const timeA = a.purchaseDate ? (typeof a.purchaseDate === 'string' || a.purchaseDate instanceof Date ? new Date(a.purchaseDate).getTime() : 0) : 0
            const timeB = b.purchaseDate ? (typeof b.purchaseDate === 'string' || b.purchaseDate instanceof Date ? new Date(b.purchaseDate).getTime() : 0) : 0
            return timeB - timeA
          }
        )
    }

    return data
  }, [
    userPurchases,
    purchaseSearch,
    purchaseCategoryFilter,
    purchaseSort,
    showFavoritesOnly,
    wishlistIds,
  ])

  const activityFeed = useMemo(() => {
    const base = [
      ...userPurchases.map((p) => ({
        id: `purchase-${p.id}`,
        type: "purchase" as const,
        time: p.purchaseDate,
        title: `Mua ${p.title}`,
        amount: p.amount || p.price || 0,
        meta: p.category,
      })),
      ...depositHistory.map((d) => ({
        id: `deposit-${d.id}`,
        type: "deposit" as const,
        time: d.approvedTime || d.timestamp,
        title: `Nạp ${d.amount.toLocaleString("vi-VN")}đ qua ${d.method}`,
        amount: d.amount,
        meta: d.transactionId,
      })),
      ...withdrawHistory.map((w) => ({
        id: `withdraw-${w.id}`,
        type: "withdraw" as const,
        time: w.approvedTime || w.requestTime,
        title: `Rút ${w.amount.toLocaleString("vi-VN")}đ`,
        amount: w.amount,
        meta: w.bankName,
      })),
    ].filter((item) => !!item.time)

    return base.sort(
      (a, b) => {
        const timeA = a.time ? (typeof a.time === 'string' || a.time instanceof Date ? new Date(a.time).getTime() : 0) : 0
        const timeB = b.time ? (typeof b.time === 'string' || b.time instanceof Date ? new Date(b.time).getTime() : 0) : 0
        return timeB - timeA
      }
    )
  }, [userPurchases, depositHistory, withdrawHistory])

  const filteredActivity = useMemo(() => {
    if (activityFilter === "all") return activityFeed
    return activityFeed.filter((item) => item.type === activityFilter)
  }, [activityFeed, activityFilter])

  const refreshDownloadHistory = useCallback(
    async (user?: any) => {
      if (!user?.uid && !user?.id && !user?.email) return
      setDownloadLoading(true)
      try {
        const result = await apiGet('/api/downloads')
        const downloads = (result.downloads || result.data || []).filter((item: any) => {
          const uid = user.uid?.toString()
          const id = user.id?.toString()
          const downloadUserId = item.user_id?.toString()
          return downloadUserId === uid || downloadUserId === id || item.userEmail === user.email
        })
        const mapped: DownloadRecord[] = downloads.map((item: any) => ({
          id: item.id || `${item.product_id}-${item.created_at}`,
          productId: item.product_id,
          productTitle: item.product_title || "Sản phẩm",
          version: item.version || "1.0",
          size: item.size || item.file_size,
          downloadUrl: item.download_url,
          checksum: item.checksum,
          expiresAt: item.expires_at,
          createdAt: item.created_at || item.generated_at || new Date().toISOString(),
          lastDownloadedAt: item.last_downloaded_at,
          totalDownloads: item.total_downloads || item.download_count,
          ipAddress: item.ip_address,
          device: item.device || item.device_info,
          status: item.status || "active",
        }))
        setDownloadRecords(mapped)
        setLocalStorage("downloadHistory", mapped)
      } catch (error) {
        logger.warn("Download history fallback", { error })
        try {
          const stored = getLocalStorage<DownloadRecord[]>("downloadHistory", [])
          setDownloadRecords(stored)
        } catch {
          setDownloadRecords([])
        }
      } finally {
        setDownloadLoading(false)
      }
    },
    []
  )

  const loadReviews = useCallback(async (user?: any) => {
    if (!user?.email) return
    try {
      const result = await apiGet('/api/reviews')
      const reviews = (result.reviews || result.data || []).filter(
        (review: any) => review.userEmail === user.email || review.user_id === user.uid || review.user_id === user.id
      )
      const mapped: ProductReview[] = reviews.map((review: any) => ({
        id: review.id || `${review.product_id}-${review.created_at}`,
        productId: review.product_id,
        productTitle: review.product_title || "Sản phẩm",
        rating: review.rating || 5,
        comment: review.comment || "",
        helpfulCount: review.helpful_count || 0,
        status: review.status || "published",
        createdAt: review.created_at || new Date().toISOString(),
      }))
      setUserReviews(mapped)
      setLocalStorage("userReviews", mapped)
    } catch (error) {
      logger.warn("Review load fallback", { error })
      try {
        const stored = getLocalStorage<ProductReview[]>("userReviews", [])
        setUserReviews(stored)
      } catch {
        setUserReviews([])
      }
    }
  }, [])

  const loadReferralStats = useCallback(async (user?: any) => {
    if (!user?.uid) return
    try {
      const result = await apiGet('/api/referrals')
      const referrals = result.data || result.referrals || []
      setReferralStats(
        referrals.map((item: any) => ({
          id: item.id,
          email: item.referredEmail || item.email,
          status: item.status,
          joinedAt: item.created_at || new Date().toISOString(),
          commission: item.commission_amount || 0,
        }))
      )
      setReferralMeta({
        code: user.referralCode || result.referralCode || user.uid,
        totalCommission: result.totalCommission || 0,
        pendingCommission: result.pendingCommission || 0,
      })
    } catch (error) {
      logger.warn("Referral fallback", { error })
      setReferralMeta({
        code: user?.referralCode || user?.uid || "qtusdev",
        totalCommission: 0,
        pendingCommission: 0,
      })
      setReferralStats([])
    }
  }, [])

  const loadCoupons = useCallback(async (user?: any) => {
    try {
      const result = await apiGet('/api/coupons')
      const coupons = (result.coupons || result.data || []).map((coupon: any) => ({
        id: coupon.id,
        code: coupon.code,
        name: coupon.name,
        description: coupon.description,
        type: coupon.discount_type || coupon.type || "percentage",
        value: coupon.discount_value || 0,
        minPurchase: coupon.min_purchase_amount,
        maxDiscount: coupon.max_discount_amount,
        status: coupon.status || "available",
        validFrom: coupon.valid_from,
        validUntil: coupon.valid_until,
      }))
      setCouponList(coupons)
      setLocalStorage("userCoupons", coupons)
    } catch (error) {
      logger.warn("Coupons fallback", { error })
      try {
        const stored = getLocalStorage<Coupon[]>("userCoupons", [])
        setCouponList(stored)
      } catch {
        setCouponList([])
      }
    }
  }, [])

  const loadDeviceSessions = useCallback(async (user?: any) => {
    if (!user?.uid) return
    try {
      const result = await apiGet('/api/sessions')
      const sessions = (result.sessions || result.data || []).filter(
        (session: any) => session.user_id === user.uid || session.user_id === user.id
      )
      const mapped: DeviceSession[] = sessions.map((session: any) => ({
        id: session.id,
        deviceName: session.device_name,
        deviceType: session.device_type,
        browser: session.browser,
        os: session.os,
        ipAddress: session.ip_address,
        location: session.location,
        lastActivity: session.last_activity || session.updated_at || new Date().toISOString(),
        isCurrent: session.is_current,
        isTrusted: session.is_trusted,
      }))
      setDeviceSessions(mapped)
      setLocalStorage("userSessions", mapped)
    } catch (error) {
      logger.warn("Sessions fallback", { error })
      try {
        const stored = getLocalStorage<DeviceSession[]>("userSessions", [])
        setDeviceSessions(stored)
      } catch {
        setDeviceSessions([])
      }
    }
  }, [])

  const handleDownloadExport = useCallback(() => {
    if (downloadRecords.length === 0) return
    const headers = ["Product", "Version", "Downloads", "Status", "LastDownloaded"]
    const rows = downloadRecords.map((record) => [
      record.productTitle,
      record.version,
      record.totalDownloads || 0,
      record.status,
      record.lastDownloadedAt || record.createdAt,
    ])
    const csv = [headers.join(","), ...rows.map((row) => row.join(","))].join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `download-history-${Date.now()}.csv`
    a.click()
  }, [downloadRecords])

  const handleAnalyticsExport = useCallback(() => {
    if (userPurchases.length === 0) return
    const headers = ["Product", "Category", "Amount", "PurchasedAt"]
    const rows = userPurchases.map((purchase) => [
      purchase.title,
      purchase.category,
      purchase.amount || purchase.price || 0,
      purchase.purchaseDate,
    ])
    const csv = [headers.join(","), ...rows.map((row) => row.join(","))].join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `personal-analytics-${Date.now()}.csv`
    a.click()
  }, [userPurchases])

  const handleRegenerateLink = useCallback(
    async (record: { id: string;[key: string]: any }) => {
      try {
        await fetch("/api/downloads/regenerate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: record.id }),
        })
        await refreshDownloadHistory(currentUser)
      } catch (error) {
        logger.error("Regenerate link failed", error, { recordId: record.id })
      }
    },
    [currentUser, refreshDownloadHistory]
  )

  const handleReviewCreate = useCallback(
    (review: Omit<import('../components/ReviewManager').ProductReview, "id" | "createdAt">) => {
      if (!currentUser) return
      const newReview: ProductReview = {
        ...review,
        id: `local-${Date.now()}`,
        productId: review.productId,
        userId: typeof currentUser.id === 'number' ? currentUser.id : String(currentUser.id),
        rating: review.rating,
        comment: review.comment || null,
        createdAt: new Date().toISOString(),
      }
      setUserReviews((prev) => {
        const updated = [newReview, ...prev]
        setLocalStorage("userReviews", updated)
        return updated
      })
    },
    [currentUser]
  )

  const handleReviewUpdate = useCallback((review: import('../components/ReviewManager').ProductReview) => {
    if (!currentUser) return
    const updatedReview: ProductReview = {
      ...review,
      userId: typeof currentUser.id === 'number' ? currentUser.id : String(currentUser.id),
      productId: review.productId,
    }
    setUserReviews((prev) => {
      const updated = prev.map((item) => (item.id === review.id ? updatedReview : item))
      setLocalStorage("userReviews", updated)
      return updated
    })
  }, [currentUser])

  const handleReviewDelete = useCallback((id: string) => {
    setUserReviews((prev) => {
      const updated = prev.filter((item) => item.id !== id)
      setLocalStorage("userReviews", updated)
      return updated
    })
  }, [])

  const handleCouponApply = useCallback(
    async (code: string) => {
      setIsApplyingCoupon(true)
      try {
        await fetch("/api/coupons/apply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
        })
        await loadCoupons(currentUser)
      } catch (error) {
        logger.error("Apply coupon failed", error)
      } finally {
        setIsApplyingCoupon(false)
      }
    },
    [currentUser, loadCoupons]
  )

  const handleReferralCopy = useCallback((link: string) => {
    try {
      navigator.clipboard.writeText(link)
    } catch (error) {
      logger.warn("Clipboard copy failed", { error })
    }
  }, [])

  const handleReferralShare = useCallback((link: string) => {
    if (navigator.share) {
      navigator.share({ url: link, title: "Giới thiệu QTUS", text: "Nhận hoa hồng khi đăng ký." }).catch(() => null)
    } else {
      handleReferralCopy(link)
    }
  }, [handleReferralCopy])

  const handleRevokeSession = useCallback((sessionId: string) => {
    setDeviceSessions((prev) => {
      const updated = prev.filter((session) => session.id !== sessionId)
      setLocalStorage("userSessions", updated)
      return updated
    })
  }, [])

  const handleMarkTrusted = useCallback((sessionId: string) => {
    setDeviceSessions((prev) => {
      const updated = prev.map((session) =>
        session.id === sessionId ? { ...session, isTrusted: true } : session
      )
      setLocalStorage("userSessions", updated)
      return updated
    })
  }, [])

  // Handle NextAuth session - save to localStorage if exists
  useEffect(() => {
    if (sessionStatus === 'authenticated' && session?.user && typeof window !== 'undefined') {
      // Check if already saved
      const savedUser = getLocalStorage<User | null>('currentUser', null);
      if (savedUser) {
        try {
          const parsed = typeof savedUser === 'string' ? JSON.parse(savedUser) : savedUser;
          if (parsed && parsed.email === session.user.email) {
            logger.debug('OAuth user already saved');
            return;
          }

        } catch (e) {
          // Ignore parse errors, continue to save
        }
      }

      // Save OAuth user to localStorage
      logger.debug('Saving NextAuth session to localStorage');
      const saveOAuthUser = async () => {
        try {
          const response = await fetch('/api/auth-callback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: (session.user as any).id || `social_${Date.now()}`,
              email: session.user.email,
              name: session.user.name,
              image: session.user.image,
              provider: (session.user as any).provider || 'google',
              ipAddress: userIP !== "Loading..." ? userIP : 'unknown'
            })
          });

          if (response.ok) {
            const data = await response.json();

            // Check if user data exists
            if (!data.user || !data.user.uid) {
              logger.error('User data or uid not found in response');
              return;
            }

            // Save to localStorage ở client-side
            const { userManager } = await import('@/lib/userManager');
            await userManager.saveUserData(data.user.uid, data.user);

            logger.debug('OAuth user saved to localStorage from dashboard');
            // Reload page to refresh user data
            window.location.reload();
          }
        } catch (error) {
          logger.error('Error saving OAuth user in dashboard', error);
        }
      };

      saveOAuthUser();
    }
  }, [session, sessionStatus, userIP]);

  useEffect(() => {
    // Fetch current IP and device info
    const fetchUserInfo = async () => {
      try {
        const ip = await getIPAddress()
        const device = getDeviceInfo()
        setUserIP(ip)
        setDeviceInfo({
          userAgent: device.userAgent || 'Unknown',
          platform: device.platform || 'Unknown',
          language: device.language || 'Unknown',
          deviceType: device.deviceType,
          browser: device.browser,
          os: device.os
        })
        logger.debug('User info', { ip, device })
      } catch (error) {
        logger.error('Error fetching user info', error)
        setUserIP('Unknown')
        setDeviceInfo({ userAgent: 'Unknown', platform: 'Unknown', language: 'Unknown', deviceType: 'Unknown', browser: 'Unknown', os: 'Unknown' })
      }
    }

    fetchUserInfo()
  }, [])



  useEffect(() => {
    // ✅ FIX: Comprehensive user authentication check với userManager
    const loadUser = async () => {
      try {
        const { userManager } = await import('@/lib/userManager');

        // Check login status
        if (!userManager.isLoggedIn()) {
          logger.warn('User not authenticated, redirecting to login')
          router.push("/auth/login")
          return
        }

        // Get user từ userManager (đã sync với database)
        let completeUser = (await userManager.getUser()) as (User & UserData) | null;

        if (!completeUser) {
          // Fallback to localStorage
          const currentUserData = getLocalStorage<User | null>("currentUser", null);
          const qtusdevUserData = getLocalStorage<User | null>("qtusdev_user", null);
          const userStr = currentUserData ? JSON.stringify(currentUserData) : (qtusdevUserData ? JSON.stringify(qtusdevUserData) : null)
          if (!userStr) {
            logger.warn('User not found, redirecting to login')
            router.push("/auth/login")
            return
          }

          try {
            completeUser = JSON.parse(userStr) as User & UserData;
          } catch (parseError) {
            logger.error('Error parsing user', parseError);
            router.push("/auth/login")
            return
          }
        }

        if (!completeUser) {
          logger.warn('User not found, redirecting to login')
          router.push("/auth/login")
          return
        }

        logger.debug('User found', {
          uid: completeUser.uid,
          email: completeUser.email,
          provider: completeUser.provider,
          balance: completeUser.balance
        })

        // Merge với data từ database nếu có
        if (completeUser.uid) {
          try {
            const userUid = completeUser.uid as string;
            const syncedUserData = await userManager.getUserData(userUid);
            if (syncedUserData) {
              const fallbackEmail = syncedUserData?.email || completeUser.email || 'unknown@qtus.dev';
              const mergedUser: User & UserData = {
                ...completeUser,
                id: completeUser.id || syncedUserData?.id || syncedUserData?.uid || userUid || '',
                uid: userUid,
                email: fallbackEmail,
                name: syncedUserData?.name || syncedUserData?.displayName || completeUser.name,
                displayName: syncedUserData?.displayName || syncedUserData?.name || completeUser.displayName,
                provider: syncedUserData?.provider || completeUser.provider || 'email',
                balance: syncedUserData?.balance ?? completeUser.balance ?? 0,
                loginCount: syncedUserData?.loginCount ?? completeUser.loginCount ?? 1,
                lastActivity: syncedUserData?.lastActivity || completeUser.lastActivity || new Date().toISOString(),
                ipAddress: userIP !== "Loading..." ? userIP : (syncedUserData?.ip || syncedUserData?.ipAddress || completeUser.ipAddress || 'Unknown'),
                deviceInfo: deviceInfo || completeUser.deviceInfo || syncedUserData?.meta?.deviceInfo,
                status: syncedUserData?.role === 'admin' ? 'active' : (completeUser.status || 'active')
              }
              completeUser = mergedUser
            }
          } catch (syncError) {
            logger.warn('Error syncing user data', { error: syncError });
          }
        }

        if (!completeUser || !completeUser.id) {
          logger.error('User data is null or missing id after loading')
          router.push("/auth/login")
          return
        }

        setCurrentUser(completeUser)

        // Update lại via userManager để đảm bảo sync
        if (completeUser.uid) {
          const normalizedUserForManager = {
            ...completeUser,
            uid: completeUser.uid,
          }
          await userManager.saveUserData(completeUser.uid, normalizedUserForManager)
        }

        logger.debug('User data synced and set', {
          uid: completeUser.uid,
          email: completeUser.email,
          balance: completeUser.balance,
          provider: completeUser.provider
        })

        // Load data từ API PostgreSQL
        try {
          // Load purchases từ API (only if user is logged in)
          if (completeUser && completeUser.email) {
            try {
              const purchasesResult = await apiGet('/api/purchases');
              // API trả về { success: true, data: purchases }
              const allPurchases = purchasesResult.data || purchasesResult.purchases || [];
              const userPurchasesList = allPurchases.filter((purchase: any) =>
                purchase.userEmail === completeUser.email || purchase.user_email === completeUser.email
              );

              // Map format để tương thích với UI
              const mappedPurchases = userPurchasesList.map((p: any) => ({
                id: p.id || p.product_id,
                productId: p.product_id,
                userId: p.user_id,
                userEmail: p.userEmail || p.user_email,
                title: p.product_title || 'Sản phẩm',
                description: p.description || '',
                price: p.amount,
                amount: p.amount,
                purchaseDate: p.created_at || new Date().toISOString(),
                category: p.category || 'Uncategorized',
                image: p.image_url || '/placeholder.svg',
                downloadLink: p.download_url || null,
                demoLink: p.demo_url || null,
                downloads: 0,
                rating: 0,
                reviewCount: 0
              }));

              setUserPurchases(mappedPurchases);
              logger.debug('User purchases loaded from API', { count: mappedPurchases.length });
            } catch (purchaseError: any) {
              // ✅ FIX: Chỉ log error nếu không phải Unauthorized (401)
              if (purchaseError.message?.includes('Unauthorized')) {
                logger.warn('User not authenticated, skipping purchases load');
                // Không throw error, chỉ skip và dùng fallback
              } else {
                logger.error('Error loading purchases from API', purchaseError);
              }
              // Fallback to localStorage
              try {
                const allPurchases = getLocalStorage<any[]>("userPurchases", []);
                const userPurchasesList = allPurchases.filter((purchase: any) => {
                  // ✅ FIX: So sánh đúng kiểu dữ liệu (string vs number)
                  const purchaseUserId = purchase.userId?.toString();
                  const userUid = completeUser.uid?.toString();
                  const userId = completeUser.id?.toString();
                  return purchaseUserId === userUid ||
                    purchaseUserId === userId ||
                    purchase.userEmail === completeUser.email;
                });
                setUserPurchases(userPurchasesList);
              } catch (localError) {
                logger.error('Error loading from localStorage', localError);
              }
            }
          }

          // Load deposits từ API
          if (completeUser.email) {
            try {
              const depositsResult = await apiGet('/api/deposits');
              const userDeposits = depositsResult.deposits?.filter((d: any) =>
                d.userEmail === completeUser.email || d.user_email === completeUser.email
              ) || [];

              // Map format
              const mappedDeposits = userDeposits.map((d: any) => ({
                id: d.id,
                user_id: d.user_id,
                userId: d.user_id,
                userEmail: d.userEmail || d.user_email,
                userName: d.userName || d.user_name,
                amount: d.amount,
                method: d.method,
                transactionId: d.transactionId || d.transaction_id,
                status: d.status,
                approvedTime: d.approved_time || d.approvedTime,
                timestamp: d.timestamp || d.created_at,
                requestTime: d.timestamp || d.created_at,
                requestTimeFormatted: d.timestamp
                  ? new Date(d.timestamp).toLocaleString("vi-VN")
                  : new Date().toLocaleString("vi-VN")
              }));

              setDepositHistory(mappedDeposits);
              logger.debug('User deposits loaded from API', { count: mappedDeposits.length });
            } catch (depositError: any) {
              // ✅ FIX: Chỉ log error nếu không phải Unauthorized (401)
              if (depositError.message?.includes('Unauthorized')) {
                logger.warn('User not authenticated, skipping deposits load');
                // Không throw error, chỉ skip và dùng fallback
              } else {
                logger.error('Error loading deposits from API', depositError);
              }
              // Fallback to localStorage
              try {
                const allDeposits = getLocalStorage<any[]>("approvedDeposits", []);
                const pendingDeposits = getLocalStorage<any[]>("deposits", []);
                const allDepositsCombined = [...allDeposits, ...pendingDeposits];
                const userDeposits = allDepositsCombined.filter((deposit: any) => {
                  // ✅ FIX: So sánh đúng kiểu dữ liệu (string vs number)
                  const depositUserId = deposit.userId?.toString();
                  const userUid = completeUser.uid?.toString();
                  const userId = completeUser.id?.toString();
                  return depositUserId === userUid ||
                    depositUserId === userId ||
                    deposit.userEmail === completeUser.email;
                });
                setDepositHistory(userDeposits);
              } catch (localError) {
                logger.error('Error loading from localStorage', localError);
              }
            }
          }

          // Load withdrawals từ API
          if (completeUser.email) {
            try {
              const withdrawalsResult = await apiGet('/api/withdrawals');
              const userWithdrawals = withdrawalsResult.withdrawals?.filter((w: any) =>
                w.userEmail === completeUser.email || w.user_email === completeUser.email
              ) || [];

              // Map format
              const mappedWithdrawals = userWithdrawals.map((w: any) => ({
                id: w.id,
                userId: w.user_id,
                userEmail: w.userEmail || w.user_email,
                userName: w.userName || w.user_name,
                amount: w.amount,
                bankName: w.bank_name,
                bankShortName: w.bank_name,
                accountNumber: w.account_number,
                accountName: w.account_name,
                status: w.status,
                approvedTime: w.approved_time || w.approvedTime,
                requestTime: w.created_at || w.requestTime,
                requestTimeFormatted: w.created_at
                  ? new Date(w.created_at).toLocaleString("vi-VN")
                  : new Date().toLocaleString("vi-VN")
              }));

              setWithdrawHistory(mappedWithdrawals);
              logger.debug('User withdrawals loaded from API', { count: mappedWithdrawals.length });
            } catch (withdrawalError: any) {
              // ✅ FIX: Chỉ log error nếu không phải Unauthorized (401)
              if (withdrawalError.message?.includes('Unauthorized')) {
                logger.warn('User not authenticated, skipping withdrawals load');
                // Không throw error, chỉ skip và dùng fallback
              } else {
                logger.error('Error loading withdrawals from API', withdrawalError);
              }
              // Fallback to localStorage
              try {
                const allWithdrawals = getLocalStorage<any[]>("approvedWithdrawals", []);
                const pendingWithdrawals = getLocalStorage<any[]>("withdrawals", []);
                const allWithdrawalsCombined = [...allWithdrawals, ...pendingWithdrawals];
                const userWithdrawals = allWithdrawalsCombined.filter((withdrawal: any) => {
                  // ✅ FIX: So sánh đúng kiểu dữ liệu (string vs number)
                  const withdrawalUserId = withdrawal.userId?.toString();
                  const userUid = completeUser.uid?.toString();
                  const userId = completeUser.id?.toString();
                  return withdrawalUserId === userUid ||
                    withdrawalUserId === userId ||
                    withdrawal.userEmail === completeUser.email;
                });
                setWithdrawHistory(userWithdrawals);
              } catch (localError) {
                logger.error('Error loading from localStorage', localError);
              }
            }
          }
        } catch (error) {
          logger.error('Error loading data from API', error);
        }

        // ✅ FIX: Chỉ send notification một lần khi dashboard được load lần đầu
        // Không gửi mỗi lần refresh để tránh spam
        const lastNotificationTime = getLocalStorage<string | null>('lastDashboardNotification', null);
        const now = Date.now();
        if (!lastNotificationTime || now - parseInt(lastNotificationTime) > 300000) { // 5 phút
          setLocalStorage('lastDashboardNotification', now.toString());
        }

      } catch (error) {
        logger.error('Error parsing user data', error)
        router.push("/auth/login")
      } finally {
        setIsLoading(false)
      }
    };

    loadUser();
  }, [router, userIP, deviceInfo]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load persisted wishlist, tickets, security preferences khi đã có user
  useEffect(() => {
    if (!currentUser?.uid) return
    try {
      const wishlistKey = `wishlist_${currentUser.uid}`
      const savedWishlist = getLocalStorage<string[]>(wishlistKey, [])
      if (savedWishlist.length > 0) {
        setWishlistIds(savedWishlist)
      }

      const ticketsKey = `supportTickets_${currentUser.uid}`
      const savedTickets = getLocalStorage<SupportTicket[]>(ticketsKey, [])
      if (savedTickets.length > 0) {
        setSupportTickets(savedTickets)
      }

      const securityKey = `securityPrefs_${currentUser.uid}`
      const savedSecurity = getLocalStorage<any>(securityKey, null)
      if (savedSecurity) {
        const parsed = savedSecurity
        setSecurityPreferences((prev) => ({
          ...prev,
          ...parsed,
          backupCodes: parsed.backupCodes || [],
        }))
      }
    } catch (error) {
      logger.error('Error loading user preferences', error)
    }
  }, [currentUser?.uid])

  // Persist wishlist
  useEffect(() => {
    if (!currentUser?.uid) return
    setLocalStorage(`wishlist_${currentUser.uid}`, wishlistIds)
  }, [wishlistIds, currentUser?.uid])

  // Persist tickets
  useEffect(() => {
    if (!currentUser?.uid) return
    setLocalStorage(`supportTickets_${currentUser.uid}`, supportTickets)
  }, [supportTickets, currentUser?.uid])

  // Persist security prefs
  useEffect(() => {
    if (!currentUser?.uid) return
    setLocalStorage(`securityPrefs_${currentUser.uid}`, securityPreferences)
  }, [securityPreferences, currentUser?.uid])

  // ✅ FIX: Refresh user balance immediately when deposits/withdrawals are updated
  useEffect(() => {
    if (!currentUser?.uid) return;

    const refreshUserBalance = async () => {
      if (!currentUser?.uid) return;
      try {
        const { getLocalStorage } = await import('@/lib/localStorage-utils');
        const syncedUserData = getLocalStorage<UserData | null>('currentUser', null);

        if (syncedUserData && syncedUserData.uid === currentUser.uid) {
          setCurrentUser((prev) => ({
            ...prev!,
            balance: syncedUserData.balance ?? prev?.balance ?? 0,
          }));
        }
      } catch (error) {
        logger.error('Error refreshing user balance', error);
      }
    };

    const handleDepositsUpdated = () => {
      refreshUserBalance();
    };

    const handleWithdrawalsUpdated = () => {
      refreshUserBalance();
    };

    const handleUserUpdated = () => {
      refreshUserBalance();
    };

    window.addEventListener('depositsUpdated', handleDepositsUpdated);
    window.addEventListener('withdrawalsUpdated', handleWithdrawalsUpdated);
    window.addEventListener('userUpdated', handleUserUpdated);

    return () => {
      window.removeEventListener('depositsUpdated', handleDepositsUpdated);
      window.removeEventListener('withdrawalsUpdated', handleWithdrawalsUpdated);
      window.removeEventListener('userUpdated', handleUserUpdated);
    };
  }, [currentUser?.uid]);

  // ✅ FIX: Set up real-time updates với tối ưu hiệu năng
  useEffect(() => {
    if (!currentUser?.email) return;

    // AbortController để cancel pending requests khi component unmount
    const abortController = new AbortController();
    let intervalId: NodeJS.Timeout | null = null;
    let isUpdating = false; // ✅ Throttle flag để tránh concurrent updates
    let lastUpdateTime = 0; // ✅ Track last update time
    const UPDATE_INTERVAL = 30000; // ✅ 30 giây thay vì 5 giây
    const MIN_UPDATE_INTERVAL = 10000; // ✅ Minimum 10 giây giữa các updates

    // ✅ Cache user email để tránh parse localStorage nhiều lần
    const userEmail = currentUser.email;

    const updateData = async () => {
      // ✅ Throttle: Chỉ update nếu đã qua MIN_UPDATE_INTERVAL
      const now = Date.now();
      if (now - lastUpdateTime < MIN_UPDATE_INTERVAL) {
        return;
      }

      // ✅ Prevent concurrent updates
      if (isUpdating || abortController.signal.aborted) {
        return;
      }

      isUpdating = true;
      lastUpdateTime = now;

      try {
        // ✅ Batch API calls - chỉ refresh data, không sync userManager mỗi lần
        const [purchasesResult, depositsResult, withdrawalsResult] = await Promise.allSettled([
          apiGet('/api/purchases').catch(() => ({ data: [], purchases: [] })),
          apiGet('/api/deposits').catch(() => ({ deposits: [] })),
          apiGet('/api/withdrawals').catch(() => ({ withdrawals: [] }))
        ]);

        if (abortController.signal.aborted) {
          isUpdating = false;
          return;
        }

        // Process purchases
        if (purchasesResult.status === 'fulfilled') {
          try {
            const allPurchases = purchasesResult.value.data || purchasesResult.value.purchases || [];
            const userPurchasesList = allPurchases.filter((purchase: any) =>
              purchase.userEmail === userEmail || purchase.user_email === userEmail
            );

            const mappedPurchases = userPurchasesList.map((p: any) => ({
              id: p.id || p.product_id,
              productId: p.product_id,
              userId: p.user_id,
              userEmail: p.userEmail || p.user_email,
              title: p.product_title || 'Sản phẩm',
              description: p.description || '',
              price: p.amount,
              amount: p.amount,
              purchaseDate: p.created_at || new Date().toISOString(),
              category: p.category || 'Uncategorized',
              image: p.image_url || '/placeholder.svg',
              downloadLink: p.download_url || null,
              demoLink: p.demo_url || null,
              downloads: 0,
              rating: 0,
              reviewCount: 0
            }));

            if (!abortController.signal.aborted) {
              setUserPurchases(mappedPurchases);
            }
          } catch (error: any) {
            if (error.name !== 'AbortError') {
              logger.error('Error refreshing purchases', error);
            }
          }
        }

        // Process deposits
        if (depositsResult.status === 'fulfilled') {
          try {
            const userDeposits = depositsResult.value.deposits?.filter((d: any) =>
              d.userEmail === userEmail || d.user_email === userEmail
            ) || [];

            const mappedDeposits = userDeposits.map((d: any) => ({
              id: d.id,
              userId: d.user_id,
              userEmail: d.userEmail || d.user_email,
              userName: d.userName || d.user_name,
              amount: d.amount,
              method: d.method,
              transactionId: d.transactionId || d.transaction_id,
              status: d.status,
              approvedTime: d.approved_time || d.approvedTime,
              timestamp: d.timestamp || d.created_at,
              requestTime: d.timestamp || d.created_at,
              requestTimeFormatted: d.timestamp
                ? new Date(d.timestamp).toLocaleString("vi-VN")
                : new Date().toLocaleString("vi-VN")
            }));

            if (!abortController.signal.aborted) {
              setDepositHistory(mappedDeposits);
            }
          } catch (error: any) {
            if (error.name !== 'AbortError') {
              logger.error('Error refreshing deposits', error);
            }
          }
        }

        // Process withdrawals
        if (withdrawalsResult.status === 'fulfilled') {
          try {
            const userWithdrawals = withdrawalsResult.value.withdrawals?.filter((w: any) =>
              w.userEmail === userEmail || w.user_email === userEmail
            ) || [];

            const mappedWithdrawals = userWithdrawals.map((w: any) => ({
              id: w.id,
              userId: w.user_id,
              userEmail: w.userEmail || w.user_email,
              userName: w.userName || w.user_name,
              amount: w.amount,
              bankName: w.bank_name,
              bankShortName: w.bank_name,
              accountNumber: w.account_number,
              accountName: w.account_name,
              status: w.status,
              approvedTime: w.approved_time || w.approvedTime,
              requestTime: w.created_at || w.requestTime,
              requestTimeFormatted: w.created_at
                ? new Date(w.created_at).toLocaleString("vi-VN")
                : new Date().toLocaleString("vi-VN")
            }));

            if (!abortController.signal.aborted) {
              setWithdrawHistory(mappedWithdrawals);
            }
          } catch (error: any) {
            if (error.name !== 'AbortError') {
              logger.error('Error refreshing withdrawals', error);
            }
          }
        }

        // ✅ Chỉ sync userManager mỗi 2 phút (120 giây) thay vì mỗi lần update
        const timeSinceLastUserSync = now - (window as any).lastUserSyncTime || Infinity;
        if (timeSinceLastUserSync > 120000) {
          try {
            const currentUserFromStorage = getLocalStorage<User | null>("currentUser", null) || getLocalStorage<User | null>("qtusdev_user", null);
            if (currentUserFromStorage?.uid && !abortController.signal.aborted) {
              const { userManager } = await import('@/lib/userManager');
              const syncedUserData = await userManager.getUserData(currentUserFromStorage.uid);

              if (syncedUserData && !abortController.signal.aborted) {
                const completeUser: User = {
                  ...currentUserFromStorage,
                  ...syncedUserData,
                  uid: syncedUserData.uid || currentUserFromStorage.uid,
                  email: syncedUserData.email || currentUserFromStorage.email,
                  name: syncedUserData.name || syncedUserData.displayName || currentUserFromStorage.name,
                  provider: syncedUserData.provider || currentUserFromStorage.provider || 'email',
                  balance: syncedUserData.balance ?? currentUserFromStorage.balance ?? 0,
                  role: normalizeRole(syncedUserData.role ?? currentUserFromStorage.role),
                };

                if (!abortController.signal.aborted) {
                  setCurrentUser(completeUser);
                  (window as any).lastUserSyncTime = now;
                }
              }
            }
          } catch (error) {
            // Silent fail for user sync
          }
        }

      } catch (error: any) {
        if (error.name !== 'AbortError') {
          logger.error('Error in real-time update', error);
        }
      } finally {
        isUpdating = false;
      }
    };

    // ✅ Delay initial call để tránh gọi ngay sau khi mount
    const initialTimeout = setTimeout(() => {
      if (!abortController.signal.aborted) {
        updateData();
      }
    }, 2000);

    // ✅ Thêm event listener để update data khi user focus lại tab
    const handleFocus = () => {
      if (!abortController.signal.aborted) {
        updateData();
        // Disabling refreshUserBalance here since it's handled in a separate useEffect
        // and is not available in this scope
        // refreshUserBalance();
      }
    };
    window.addEventListener('focus', handleFocus);

    return () => {
      // Cleanup
      clearTimeout(initialTimeout);
      window.removeEventListener('focus', handleFocus);
      abortController.abort();
    }
  }, [currentUser?.email]) // ✅ Chỉ depend on email, không phải toàn bộ currentUser object

  const handleLogout = () => {
    logger.info('User logout initiated')
    removeLocalStorage("isLoggedIn")
    removeLocalStorage("currentUser")
    removeLocalStorage("qtusdev_user")
    router.push("/")
  }

  const getStats = () => {
    const totalSpent = userPurchases.reduce((sum, purchase) => {
      const price = typeof purchase.price === 'number' ? purchase.price : typeof purchase.price === 'string' ? parseFloat(purchase.price) || 0 : 0
      return sum + price
    }, 0)
    const totalDeposited = depositHistory.reduce((sum, deposit) => {
      const amount = typeof deposit.amount === 'number' ? deposit.amount : typeof deposit.amount === 'string' ? parseFloat(deposit.amount) || 0 : 0
      return sum + amount
    }, 0)
    const totalWithdrawn = withdrawHistory.reduce((sum, withdrawal) => {
      const amount = typeof withdrawal.amount === 'number' ? withdrawal.amount : typeof withdrawal.amount === 'string' ? parseFloat(withdrawal.amount) || 0 : 0
      return sum + amount
    }, 0)

    // Get balance from currentUser (synced with registeredUsers)
    const currentBalance = currentUser?.balance || 0

    return {
      totalPurchases: userPurchases.length,
      totalSpent,
      totalDeposited,
      totalWithdrawn,
      currentBalance
    }
  }

  const toggleWishlist = (productId: string | number) => {
    const id = String(productId)
    setWishlistIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    )
  }

  const handleTicketSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!ticketForm.subject || !ticketForm.message || !currentUser) return

    const newTicket: SupportTicket = {
      id: Date.now().toString(),
      userId: typeof currentUser.id === 'number' ? currentUser.id : String(currentUser.id),
      subject: ticketForm.subject,
      category: ticketForm.category as 'product' | 'payment' | 'technical' | 'account' | 'other',
      priority: ticketForm.priority as 'low' | 'medium' | 'high' | 'urgent',
      message: ticketForm.message,
      status: "open",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    setSupportTickets((prev) => [newTicket, ...prev])
    setTicketForm({ subject: "", category: "product", priority: "medium", message: "" })
  }

  const updateTicketStatus = (ticketId: string, status: string) => {
    setSupportTickets((prev) =>
      prev.map((ticket) =>
        ticket.id === ticketId ? { ...ticket, status, updatedAt: new Date().toISOString() } : ticket
      )
    )
  }

  const exportActivityLog = () => {
    const payload = JSON.stringify(activityFeed, null, 2)
    const blob = new Blob([payload], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `activity-log-${currentUser?.uid || "user"}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  const handleSecurityToggle = (key: "deviceAlerts" | "loginNotifications") => (checked: boolean) => {
    setSecurityPreferences((prev) => {
      const next = {
        ...prev,
        [key]: checked,
      }
      return next
    })
  }

  const shareWishlist = async () => {
    const shareData = wishlistProducts.map((product) => ({
      title: product.title,
      price: product.price,
      category: product.category,
      purchasedAt: product.purchaseDate,
    }))
    const text = `Danh sách yêu thích của tôi trên QtusDev:\n${shareData
      .map(
        (item, index) =>
          `${index + 1}. ${item.title} - ${typeof item.price === 'number' ? item.price.toLocaleString("vi-VN") : (typeof item.price === 'string' ? parseFloat(item.price).toLocaleString("vi-VN") : '0')}đ`
      )
      .join("\n")}`

    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({
          title: "Wishlist QtusDev",
          text,
        })
      } else if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(text)
        alert("Đã sao chép wishlist vào clipboard!")
      }
    } catch (error) {
      logger.error("Share wishlist error", error)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Logo />
          <p className="mt-4 text-muted-foreground">Đang tải dashboard...</p>
        </div>
      </div>
    )
  }

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Logo />
          <p className="mt-4 text-muted-foreground">Vui lòng đăng nhập để truy cập dashboard</p>
          <Button
            onClick={() => router.push("/auth/login")}
            className="mt-4"
          >
            Đăng nhập
          </Button>
        </div>
      </div>
    )
  }

  const stats = getStats()

  return (
    <div className="min-h-screen bg-background relative">
      {/* 3D Liquid Background */}
      <div className="liquid-3d-bg" />
      {/* 3D Background */}
      <div className="absolute inset-0">
        <ThreeJSBackground />
        <ThreeDFallback />
      </div>

      <FloatingHeader />

      <main className="container mx-auto px-4 pt-24 pb-8 relative z-10">
        <div className="max-w-7xl mx-auto">
          {/* Debug Info - Only show in development */}
          {process.env.NODE_ENV === 'development' && <DebugInfo />}

          {/* Header */}
          <div className="flex items-center justify-between mb-8 animate-fade-in-down">
            <div>
              <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
              <p className="text-muted-foreground">
                Chào mừng trở lại, {currentUser.name || currentUser.email}!
              </p>
            </div>
            <div className="flex items-center space-x-4">
              <Button variant="outline" onClick={() => router.push("/products")} className="transition-transform hover:scale-105">
                <ShoppingBag className="w-4 h-4 mr-2" />
                Mua sắm
              </Button>
              <Button variant="outline" onClick={handleLogout} className="transition-transform hover:scale-105">
                <LogOut className="w-4 h-4 mr-2" />
                Đăng xuất
              </Button>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-8 animate-fade-in-up">
            <Card className="liquid-glass-card transition-transform hover:scale-105">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 ">
                <CardTitle className="text-sm font-medium">Số dư hiện tại</CardTitle>
                <Wallet className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  {stats.currentBalance.toLocaleString('vi-VN')}đ
                </div>
                <p className="text-xs text-muted-foreground">
                  Có thể sử dụng ngay
                </p>
              </CardContent>
            </Card>

            <Card className="liquid-glass-card transition-transform hover:scale-105">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Tổng chi tiêu</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {stats.totalSpent.toLocaleString('vi-VN')}đ
                </div>
                <p className="text-xs text-muted-foreground">
                  {stats.totalPurchases} giao dịch
                </p>
              </CardContent>
            </Card>

            <Card className="liquid-glass-card transition-transform hover:scale-105">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Đã nạp</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-600">
                  {stats.totalDeposited.toLocaleString('vi-VN')}đ
                </div>
                <p className="text-xs text-muted-foreground">
                  {depositHistory.length} lần nạp
                </p>
              </CardContent>
            </Card>

            <Card className="liquid-glass-card transition-transform hover:scale-105">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Đã rút</CardTitle>
                <CreditCard className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">
                  {stats.totalWithdrawn.toLocaleString('vi-VN')}đ
                </div>
                <p className="text-xs text-muted-foreground">
                  {withdrawHistory.length} lần rút
                </p>
              </CardContent>
            </Card>

            <Card className="liquid-glass-card transition-transform hover:scale-105">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Tổng Downloads</CardTitle>
                <Download className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-purple-600">
                  {userPurchases.reduce((sum, purchase) => sum + (purchase.downloads || 0), 0)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Tổng số lượt tải xuống
                </p>
              </CardContent>
            </Card>

            {/* Account Statistics Summary */}
            <Card className="transition-transform hover:scale-105 md:col-span-5 bg-white/60  dark:bg-black/50">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Settings className="w-5 h-5 mr-2" />
                  Thống kê tài khoản
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <div className="text-center p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                    <p className="text-2xl font-bold text-blue-600">{userPurchases.length}</p>
                    <p className="text-xs text-muted-foreground">Sản phẩm đã mua</p>
                  </div>
                  <div className="text-center p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                    <p className="text-2xl font-bold text-green-600">{depositHistory.length}</p>
                    <p className="text-xs text-muted-foreground">Lịch sử nạp tiền</p>
                  </div>
                  <div className="text-center p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                    <p className="text-2xl font-bold text-red-600">{withdrawHistory.length}</p>
                    <p className="text-xs text-muted-foreground">Lịch sử rút tiền</p>
                  </div>
                  <div className="text-center p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                    <p className="text-2xl font-bold text-purple-600">
                      {userPurchases.reduce((sum, purchase) => sum + (purchase.downloads || 0), 0)}
                    </p>
                    <p className="text-xs text-muted-foreground">Tổng số lượt tải xuống</p>
                  </div>
                  <div className="text-center p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                    <p className="text-2xl font-bold text-yellow-600">
                      {stats.totalSpent.toLocaleString('vi-VN')}đ
                    </p>
                    <p className="text-xs text-muted-foreground">Tổng chi tiêu</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Analytics Overview: Biểu đồ chi tiêu + Top sản phẩm + Hoạt động gần đây */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8 animate-fade-in-up">
            <div className="lg:col-span-2">
              <SpendingChart purchases={userPurchases.map(p => ({
                id: p.id,
                price: typeof p.price === 'number' ? p.price : (typeof p.price === 'string' ? parseFloat(p.price) || 0 : 0),
                amount: typeof p.amount === 'number' ? p.amount : (typeof p.amount === 'string' ? parseFloat(p.amount) || 0 : 0),
                purchaseDate: p.purchaseDate ? (typeof p.purchaseDate === 'string' ? p.purchaseDate : (p.purchaseDate instanceof Date ? p.purchaseDate.toISOString() : new Date().toISOString())) : new Date().toISOString()
              }))} />
            </div>
            <div className="space-y-4">
              <Card className="bg-white/60 dark:bg-black/50">
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Star className="w-5 h-5 mr-2" />
                    Top 5 sản phẩm đã mua nhiều nhất
                  </CardTitle>
                  <CardDescription>
                    Dựa trên số lượt tải xuống / đánh giá
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {userPurchases.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Chưa có dữ liệu sản phẩm
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {userPurchases
                        .slice()
                        .sort(
                          (a, b) =>
                            (b.downloads || 0) - (a.downloads || 0)
                        )
                        .slice(0, 5)
                        .map((p, index) => (
                          <div
                            key={p.id}
                            className="flex items-center justify-between text-sm"
                          >
                            <div className="flex items-center space-x-2">
                              <span className="text-xs text-muted-foreground">
                                #{index + 1}
                              </span>
                              <span className="font-medium line-clamp-1">
                                {p.title}
                              </span>
                            </div>
                            <div className="text-xs text-muted-foreground text-right">
                              <div>
                                {p.downloads || 0} tải xuống
                              </div>
                              <div>
                                {(p.rating || 0)}/5 ⭐
                              </div>
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="bg-white/60 dark:bg-black/50">
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Clock className="w-5 h-5 mr-2" />
                    Hoạt động gần đây
                  </CardTitle>
                  <CardDescription>
                    Mua hàng, nạp, rút trong thời gian gần đây
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {userPurchases.length === 0 &&
                    depositHistory.length === 0 &&
                    withdrawHistory.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Chưa có hoạt động nào.
                    </p>
                  ) : (
                    <div className="space-y-3 text-xs">
                      {[
                        ...userPurchases.map((p: any) => ({
                          type: "purchase" as const,
                          time: p.purchaseDate,
                          label: `Mua "${p.title}"`,
                          amount: p.amount || p.price || 0,
                        })),
                        ...depositHistory.map((d: any) => ({
                          type: "deposit" as const,
                          time: d.approvedTime || d.timestamp,
                          label: `Nạp ${d.amount.toLocaleString(
                            "vi-VN"
                          )}đ qua ${d.method}`,
                          amount: d.amount,
                        })),
                        ...withdrawHistory.map((w: any) => ({
                          type: "withdraw" as const,
                          time: w.approvedTime || w.requestTime,
                          label: `Rút ${w.amount.toLocaleString(
                            "vi-VN"
                          )}đ về ${w.bankName}`,
                          amount: w.amount,
                        })),
                      ]
                        .filter((item) => !!item.time)
                        .sort(
                          (a, b) =>
                            new Date(b.time).getTime() -
                            new Date(a.time).getTime()
                        )
                        .slice(0, 8)
                        .map((item, idx) => (
                          <div
                            key={idx}
                            className="flex items-start justify-between"
                          >
                            <div>
                              <p className="font-medium">{item.label}</p>
                              <p className="text-[11px] text-muted-foreground">
                                {new Date(item.time).toLocaleString(
                                  "vi-VN"
                                )}
                              </p>
                            </div>
                            <span
                              className={`ml-2 font-semibold ${item.type === "purchase"
                                ? "text-blue-600"
                                : item.type === "deposit"
                                  ? "text-green-600"
                                  : "text-red-600"
                                }`}
                            >
                              {item.type === "withdraw" ? "-" : "+"}
                              {item.amount.toLocaleString("vi-VN")}đ
                            </span>
                          </div>
                        ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8 animate-fade-in-up delay-100">
            <Card className="cursor-pointer hover:shadow-lg transition-all duration-300 transform hover:-translate-y-1 bg-white/60  dark:bg-black/50" onClick={() => router.push("/deposit")}>
              <CardContent className="flex items-center p-6">
                <div className="bg-green-100 dark:bg-green-900/20 p-3 rounded-full mr-4">
                  <Wallet className="w-6 h-6 text-green-600" />
                </div>
                <div>
                  <h3 className="font-semibold">Nạp tiền</h3>
                  <p className="text-sm text-muted-foreground">Nạp tiền vào tài khoản</p>
                </div>
              </CardContent>
            </Card>

            <Card className="cursor-pointer hover:shadow-lg transition-all duration-300 transform hover:-translate-y-1 bg-white/60  dark:bg-black/50" onClick={() => router.push("/withdraw")}>
              <CardContent className="flex items-center p-6">
                <div className="bg-red-100 dark:bg-red-900/20 p-3 rounded-full mr-4">
                  <CreditCard className="w-6 h-6 text-red-600" />
                </div>
                <div>
                  <h3 className="font-semibold">Rút tiền</h3>
                  <p className="text-sm text-muted-foreground">Rút tiền về ngân hàng</p>
                </div>
              </CardContent>
            </Card>

            <Card className="cursor-pointer hover:shadow-lg transition-all duration-300 transform hover:-translate-y-1 bg-white/60  dark:bg-black/50" onClick={() => router.push("/products")}>
              <CardContent className="flex items-center p-6">
                <div className="bg-blue-100 dark:bg-blue-900/20 p-3 rounded-full mr-4">
                  <ShoppingBag className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-semibold">Mua sắm</h3>
                  <p className="text-sm text-muted-foreground">Khám phá sản phẩm mới</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Main Content */}
          <Tabs defaultValue="purchases" className="space-y-6">
            <div className="w-full">
              <TabsList className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 p-2 h-auto bg-muted/50 backdrop-blur-sm rounded-lg border border-border/50">
                <TabsTrigger value="purchases" className="transition-all hover:scale-105 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md">
                  <Package className="w-4 h-4 mr-1.5" />
                  <span className="hidden sm:inline">Sản phẩm đã mua</span>
                  <span className="sm:hidden">Sản phẩm</span>
                </TabsTrigger>
                <TabsTrigger value="downloads" className="transition-all hover:scale-105 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md">
                  <Download className="w-4 h-4 mr-1.5" />
                  <span className="hidden sm:inline">Tải xuống</span>
                  <span className="sm:hidden">Tải</span>
                </TabsTrigger>
                <TabsTrigger value="wishlist" className="transition-all hover:scale-105 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md">
                  <Heart className="w-4 h-4 mr-1.5" />
                  Wishlist
                </TabsTrigger>
                <TabsTrigger value="reviews" className="transition-all hover:scale-105 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md">
                  <Star className="w-4 h-4 mr-1.5" />
                  <span className="hidden sm:inline">Đánh giá</span>
                  <span className="sm:hidden">Đánh giá</span>
                </TabsTrigger>
                <TabsTrigger value="deposits" className="transition-all hover:scale-105 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md">
                  <TrendingUp className="w-4 h-4 mr-1.5" />
                  <span className="hidden md:inline">Lịch sử nạp tiền</span>
                  <span className="md:hidden">Nạp tiền</span>
                </TabsTrigger>
                <TabsTrigger value="withdrawals" className="transition-all hover:scale-105 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md">
                  <CreditCard className="w-4 h-4 mr-1.5" />
                  <span className="hidden md:inline">Lịch sử rút tiền</span>
                  <span className="md:hidden">Rút tiền</span>
                </TabsTrigger>
                <TabsTrigger value="activity" className="transition-all hover:scale-105 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md">
                  <Activity className="w-4 h-4 mr-1.5" />
                  Hoạt động
                </TabsTrigger>
                <TabsTrigger value="analytics" className="transition-all hover:scale-105 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md">
                  <Settings className="w-4 h-4 mr-1.5" />
                  <span className="hidden lg:inline">Analytics cá nhân</span>
                  <span className="lg:hidden">Analytics</span>
                </TabsTrigger>
                <TabsTrigger value="notifications" className="transition-all hover:scale-105 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md">
                  <Bell className="w-4 h-4 mr-1.5" />
                  <span className="hidden sm:inline">Thông báo</span>
                  <span className="sm:hidden">TB</span>
                </TabsTrigger>
                <TabsTrigger value="chat" className="transition-all hover:scale-105 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md">
                  <MessageSquare className="w-4 h-4 mr-1.5" />
                  Trò chuyện AI/Admin
                </TabsTrigger>
                <TabsTrigger value="support" className="transition-all hover:scale-105 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md">
                  <ListChecks className="w-4 h-4 mr-1.5" />
                  Support Tickets
                </TabsTrigger>
                <TabsTrigger value="profile" className="transition-all hover:scale-105 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md">
                  <UserIcon className="w-4 h-4 mr-1.5" />
                  <span className="hidden lg:inline">Thông tin cá nhân</span>
                  <span className="lg:hidden">Cá nhân</span>
                </TabsTrigger>
                <TabsTrigger value="security" className="transition-all hover:scale-105 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md">
                  <ShieldCheck className="w-4 h-4 mr-1.5" />
                  Bảo mật
                </TabsTrigger>
                <TabsTrigger value="referrals" className="transition-all hover:scale-105 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md">
                  <Share2 className="w-4 h-4 mr-1.5" />
                  Referral
                </TabsTrigger>
                <TabsTrigger value="coupons" className="transition-all hover:scale-105 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md">
                  <Star className="w-4 h-4 mr-1.5" />
                  Coupons
                </TabsTrigger>
                <TabsTrigger value="devices" className="transition-all hover:scale-105 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md">
                  <Smartphone className="w-4 h-4 mr-1.5" />
                  Thiết bị
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="purchases" className="space-y-4 mt-6 animate-fade-in-up">
              <Card className="liquid-glass-card border-border/50 shadow-lg hover:shadow-xl transition-shadow duration-300">
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Package className="w-5 h-5 mr-2" />
                    Sản phẩm đã mua ({userPurchases.length})
                  </CardTitle>
                  <CardDescription>
                    Thư viện sản phẩm đã mua với tìm kiếm, lọc và đánh dấu yêu thích
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {userPurchases.length === 0 ? (
                    <div className="text-center py-8">
                      <ShoppingBag className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                      <p className="text-muted-foreground">Bạn chưa mua sản phẩm nào</p>
                      <Button
                        onClick={() => router.push("/products")}
                        className="mt-4"
                      >
                        Khám phá sản phẩm
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* Bộ lọc thư viện */}
                      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-4">
                        <div className="flex items-center gap-2 flex-1">
                          <Search className="w-4 h-4 text-muted-foreground" />
                          <Input
                            value={purchaseSearch}
                            onChange={(e) => setPurchaseSearch(e.target.value)}
                            placeholder="Tìm theo tên sản phẩm..."
                            className="max-w-md"
                          />
                        </div>
                        <div className="flex flex-wrap gap-2 items-center justify-end">
                          <div className="flex items-center gap-2">
                            <Filter className="w-4 h-4 text-muted-foreground" />
                            <select
                              value={purchaseCategoryFilter}
                              onChange={(e) => setPurchaseCategoryFilter(e.target.value)}
                              className="px-3 py-2 border rounded-md bg-background text-sm"
                            >
                              <option value="all">Tất cả danh mục</option>
                              {purchaseCategories.map((category) => (
                                <option key={category} value={category}>
                                  {category}
                                </option>
                              ))}
                            </select>
                          </div>
                          <select
                            value={purchaseSort}
                            onChange={(e) => setPurchaseSort(e.target.value)}
                            className="px-3 py-2 border rounded-md bg-background text-sm"
                          >
                            <option value="recent">Mới nhất</option>
                            <option value="price-asc">Giá tăng dần</option>
                            <option value="price-desc">Giá giảm dần</option>
                            <option value="name">Theo tên A-Z</option>
                          </select>
                          <Button
                            type="button"
                            size="sm"
                            variant={showFavoritesOnly ? "default" : "outline"}
                            onClick={() => setShowFavoritesOnly((prev) => !prev)}
                          >
                            <StarIcon
                              className={`w-4 h-4 mr-1 ${showFavoritesOnly ? "text-yellow-300" : ""
                                }`}
                            />
                            Yêu thích
                          </Button>
                          <Badge variant="outline">
                            Tổng: {filteredPurchases.length}/{userPurchases.length}
                          </Badge>
                        </div>
                      </div>

                      {filteredPurchases.length === 0 ? (
                        <div className="text-center py-10">
                          <p className="text-muted-foreground">
                            Không tìm thấy sản phẩm phù hợp với bộ lọc hiện tại.
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {filteredPurchases.map((purchase) => (
                            <div key={purchase.id} className="flex items-center space-x-4 p-4 border rounded-lg">
                              <Image
                                src={purchase.product?.imageUrl || purchase.product?.downloadUrl || "/placeholder.svg"}
                                alt={purchase.title || 'Product'}
                                width={64}
                                height={64}
                                className="w-16 h-16 rounded-lg object-cover"
                              />
                              <div className="flex-1">
                                <h3 className="font-semibold">{purchase.title}</h3>
                                <p className="text-sm text-muted-foreground">
                                  {purchase.description?.slice(0, 100)}...
                                </p>
                                <div className="flex items-center space-x-2 mt-2">
                                  <Badge>{purchase.category}</Badge>
                                  <span className="text-sm text-muted-foreground">
                                    {purchase.purchaseDate ? (typeof purchase.purchaseDate === 'string' || purchase.purchaseDate instanceof Date ? new Date(purchase.purchaseDate).toLocaleDateString('vi-VN') : 'N/A') : 'N/A'}
                                  </span>
                                  <Button
                                    type="button"
                                    size="icon"
                                    variant="ghost"
                                    className="ml-1"
                                    onClick={() => toggleWishlist(purchase.id)}
                                    aria-label="Đánh dấu yêu thích"
                                  >
                                    <StarIcon
                                      className={`w-4 h-4 ${wishlistIds.includes(String(purchase.id))
                                        ? "text-yellow-500 fill-yellow-500"
                                        : "text-gray-300"
                                        }`}
                                    />
                                  </Button>
                                </div>
                                {/* Review Section */}
                                <div className="mt-3">
                                  <div className="flex items-center space-x-1">
                                    {[...Array(5)].map((_, i) => (
                                      <button
                                        key={i}
                                        type="button"
                                        className="focus:outline-none"
                                        onClick={() => {
                                          // Update rating in localStorage for this purchase
                                          const allPurchases = getLocalStorage<any[]>("userPurchases", []);
                                          const updatedPurchases = allPurchases.map((p: any) =>
                                            p.id === purchase.id ? { ...p, rating: i + 1 } : p
                                          );
                                          setLocalStorage("userPurchases", updatedPurchases);
                                          // Optionally, update global rating for homepage, etc.
                                          // You may want to trigger a global state update here if needed
                                          // ✅ FIX: So sánh đúng kiểu dữ liệu
                                          setUserPurchases(updatedPurchases.filter((p: any) => {
                                            const pUserId = p.userId?.toString();
                                            const userId = currentUser.id?.toString();
                                            const userUid = currentUser.uid?.toString();
                                            return pUserId === userId || pUserId === userUid || p.userEmail === currentUser.email;
                                          }));
                                        }}
                                      >
                                        <StarIcon
                                          className={`w-4 h-4 ${i < (purchase.rating || 0) ? 'text-yellow-500 fill-yellow-500' : 'text-gray-300'}`}
                                        />
                                      </button>
                                    ))}
                                    <span className="text-sm text-muted-foreground ml-2">
                                      {purchase.rating || 0}/5 ({purchase.reviewCount || 0} đánh giá)
                                    </span>
                                  </div>
                                  <div className="mt-1">
                                    <span className="text-xs text-muted-foreground">
                                      Tổng số lượt tải xuống: {purchase.downloads || 0}
                                    </span>
                                  </div>
                                  {purchase.review && (
                                    <p className="text-sm text-muted-foreground italic mt-1">
                                      "{purchase.review}"
                                    </p>
                                  )}
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="font-bold text-lg">
                                  {typeof purchase.price === 'number' ? purchase.price.toLocaleString('vi-VN') : (typeof purchase.price === 'string' ? parseFloat(purchase.price).toLocaleString('vi-VN') : '0')}đ
                                </p>
                                <div className="flex space-x-2 mt-2">
                                  {purchase.downloadLink && (
                                    <Button size="sm" variant="outline" asChild>
                                      <a href={purchase.downloadLink} target="_blank" rel="noopener noreferrer">
                                        <Download className="w-4 h-4 mr-1" />
                                        Tải xuống
                                      </a>
                                    </Button>
                                  )}
                                  {purchase.demoLink && (
                                    <Button size="sm" variant="outline" asChild>
                                      <a href={purchase.demoLink} target="_blank" rel="noopener noreferrer">
                                        <Eye className="w-4 h-4 mr-1" />
                                        Demo
                                      </a>
                                    </Button>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="referrals" className="space-y-4 mt-6 animate-fade-in-up">
              <ReferralProgram
                referralCode={referralMeta.code || currentUser?.uid || String(currentUser?.id || '') || "qtusdev"}
                stats={referralStats}
                totalCommission={referralMeta.totalCommission}
                pendingCommission={referralMeta.pendingCommission}
                onCopy={handleReferralCopy}
                onShare={handleReferralShare}
              />
            </TabsContent>

            <TabsContent value="coupons" className="space-y-4 mt-6 animate-fade-in-up">
              <CouponsCenter
                coupons={couponList.map(c => ({
                  id: String(c.id),
                  code: c.code,
                  name: c.title || c.code,
                  description: c.description,
                  type: c.discountType === 'percentage' ? 'percentage' as const : 'fixed' as const,
                  value: c.discountValue,
                  minPurchase: c.minPurchase,
                  maxDiscount: c.maxDiscount,
                  status: c.isActive ? 'available' as const : 'expired' as const,
                  validFrom: typeof c.validFrom === 'string' ? c.validFrom : (c.validFrom instanceof Date ? c.validFrom.toISOString() : ''),
                  validUntil: typeof c.validUntil === 'string' ? c.validUntil : (c.validUntil instanceof Date ? c.validUntil.toISOString() : ''),
                  createdAt: ''
                }))}
                isApplying={isApplyingCoupon}
                onApply={handleCouponApply}
                onRefresh={() => loadCoupons(currentUser)}
              />
            </TabsContent>

            <TabsContent value="devices" className="space-y-4 mt-6 animate-fade-in-up">
              <DeviceManagement
                sessions={deviceSessions.map(s => ({
                  ...s,
                  id: String(s.id),
                  lastActivity: typeof s.lastActivity === 'string' ? s.lastActivity : (s.lastActivity instanceof Date ? s.lastActivity.toISOString() : new Date().toISOString())
                }))}
                onRevoke={handleRevokeSession}
                onMarkTrusted={handleMarkTrusted}
              />
            </TabsContent>

            <TabsContent value="analytics" className="space-y-4 mt-6 animate-fade-in-up">
              <PersonalAnalytics
                purchases={userPurchases.map(p => ({
                  id: String(p.id),
                  title: p.title || 'Product',
                  amount: typeof p.amount === 'number' ? p.amount : (typeof p.amount === 'string' ? parseFloat(p.amount) || 0 : 0),
                  purchaseDate: p.purchaseDate ? (typeof p.purchaseDate === 'string' ? p.purchaseDate : (p.purchaseDate instanceof Date ? p.purchaseDate.toISOString() : new Date().toISOString())) : new Date().toISOString(),
                  category: p.category
                }))}
                wishlistCount={wishlistProducts.length}
                totalDownloads={userPurchases.reduce((sum, purchase) => sum + (purchase.downloads || 0), 0)}
                onExport={handleAnalyticsExport}
              />
            </TabsContent>

            <TabsContent value="reviews" className="space-y-4 mt-6 animate-fade-in-up">
              <ReviewManager
                reviews={userReviews.map(r => ({
                  id: String(r.id),
                  productId: String(r.productId),
                  productTitle: r.productTitle || 'Product',
                  rating: r.rating,
                  comment: r.comment || '',
                  createdAt: (r.createdAt ? (typeof r.createdAt === 'string' ? r.createdAt : (r.createdAt instanceof Date ? r.createdAt.toISOString() : new Date().toISOString())) : (r.created_at ? (typeof r.created_at === 'string' ? r.created_at : (r.created_at instanceof Date ? r.created_at.toISOString() : new Date().toISOString())) : new Date().toISOString())),
                  helpfulCount: 0,
                  status: 'published' as const
                }))}
                onCreate={handleReviewCreate}
                onUpdate={handleReviewUpdate}
                onDelete={handleReviewDelete}
              />
            </TabsContent>

            <TabsContent value="downloads" className="space-y-4 mt-6 animate-fade-in-up">
              <DownloadHistory
                records={downloadRecords.map(r => {
                  const record = r as any;
                  return {
                    id: String(r.id),
                    productId: String(r.productId),
                    productTitle: r.productTitle || 'Product',
                    createdAt: (r.createdAt ? (typeof r.createdAt === 'string' ? r.createdAt : (r.createdAt instanceof Date ? r.createdAt.toISOString() : new Date().toISOString())) : (record.created_at ? (typeof record.created_at === 'string' ? record.created_at : (record.created_at instanceof Date ? record.created_at.toISOString() : new Date().toISOString())) : new Date().toISOString())),
                    lastDownloadedAt: r.lastDownloadedAt ? (typeof r.lastDownloadedAt === 'string' ? r.lastDownloadedAt : (r.lastDownloadedAt instanceof Date ? r.lastDownloadedAt.toISOString() : undefined)) : undefined,
                    version: r.version,
                    totalDownloads: r.totalDownloads,
                    ipAddress: r.ipAddress || undefined,
                    status: (r.status as 'active' | 'expired' | 'revoked') || 'active'
                  };
                })}
                isLoading={downloadLoading}
                onRefresh={() => refreshDownloadHistory(currentUser)}
                onRequestRegenerate={handleRegenerateLink}
                onBulkExport={handleDownloadExport}
              />
            </TabsContent>

            <TabsContent value="wishlist" className="space-y-4 mt-6 animate-fade-in-up">
              <Card className="liquid-glass-card border-border/50 shadow-lg hover:shadow-xl transition-shadow duration-300">
                <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between">
                  <div>
                    <CardTitle className="flex items-center">
                      <Heart className="w-5 h-5 mr-2 text-pink-500" />
                      Wishlist của bạn
                    </CardTitle>
                    <CardDescription>
                      Danh sách sản phẩm yêu thích – nhấn chia sẻ để gửi cho bạn bè
                    </CardDescription>
                  </div>
                  <div className="flex gap-2 mt-4 md:mt-0">
                    <Button variant="outline" onClick={shareWishlist} disabled={wishlistProducts.length === 0}>
                      <Share2 className="w-4 h-4 mr-2" />
                      Chia sẻ
                    </Button>
                    <Badge variant="outline">
                      {wishlistProducts.length} mục
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  {wishlistProducts.length === 0 ? (
                    <div className="text-center py-10">
                      <Heart className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                      <p className="text-muted-foreground">Chưa có sản phẩm nào trong wishlist.</p>
                      <Button className="mt-4" variant="outline" onClick={() => setShowFavoritesOnly(false)}>
                        Khám phá sản phẩm
                      </Button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {wishlistProducts.map((product) => (
                        <div key={product.id} className="p-4 border rounded-lg flex items-start space-x-4">
                          <Image
                            src={product.product?.imageUrl || product.product?.downloadUrl || "/placeholder.svg"}
                            alt={product.title || 'Product'}
                            width={80}
                            height={80}
                            className="rounded-lg object-cover"
                          />
                          <div className="flex-1">
                            <div className="flex items-start justify-between">
                              <div>
                                <h3 className="font-semibold">{product.title}</h3>
                                <p className="text-sm text-muted-foreground">
                                  Đã mua ngày {product.purchaseDate ? (typeof product.purchaseDate === 'string' || product.purchaseDate instanceof Date ? new Date(product.purchaseDate).toLocaleDateString("vi-VN") : 'N/A') : 'N/A'}
                                </p>
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => toggleWishlist(product.id)}
                                aria-label="Bỏ khỏi wishlist"
                              >
                                <Heart className="w-4 h-4 text-pink-500 fill-pink-500" />
                              </Button>
                            </div>
                            <div className="flex items-center gap-2 mt-2">
                              <Badge variant="secondary">{product.category}</Badge>
                              <span className="text-sm text-green-600 font-semibold">
                                {typeof product.price === 'number' ? product.price.toLocaleString("vi-VN") : (typeof product.price === 'string' ? parseFloat(product.price).toLocaleString("vi-VN") : '0')}đ
                              </span>
                            </div>
                            <div className="flex gap-2 mt-3">
                              {product.downloadLink && (
                                <Button size="sm" variant="outline" asChild>
                                  <a href={product.downloadLink} target="_blank" rel="noopener noreferrer">
                                    <Download className="w-4 h-4 mr-1" />
                                    Tải lại
                                  </a>
                                </Button>
                              )}
                              {product.demoLink && (
                                <Button size="sm" variant="outline" asChild>
                                  <a href={product.demoLink} target="_blank" rel="noopener noreferrer">
                                    <Eye className="w-4 h-4 mr-1" />
                                    Xem demo
                                  </a>
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="deposits" className="space-y-4 mt-6 animate-fade-in-up">
              <Card className="liquid-glass-card border-border/50 shadow-lg hover:shadow-xl transition-shadow duration-300">
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <TrendingUp className="w-5 h-5 mr-2" />
                    Lịch sử nạp tiền ({depositHistory.length})
                  </CardTitle>
                  <CardDescription>
                    Tất cả giao dịch nạp tiền đã được duyệt
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {depositHistory.length === 0 ? (
                    <div className="text-center py-8">
                      <Wallet className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                      <p className="text-muted-foreground">Chưa có giao dịch nạp tiền nào</p>
                      <Button
                        onClick={() => router.push("/deposit")}
                        className="mt-4"
                      >
                        Nạp tiền ngay
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {depositHistory.map((deposit) => (
                        <div key={deposit.id} className="flex items-center justify-between p-4 border rounded-lg">
                          <div>
                            <p className="font-semibold text-green-600">
                              +{typeof deposit.amount === 'number' ? deposit.amount.toLocaleString('vi-VN') : (typeof deposit.amount === 'string' ? parseFloat(deposit.amount).toLocaleString('vi-VN') : '0')}đ
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {deposit.method} • {deposit.transactionId}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {deposit.approvedTime ? (typeof deposit.approvedTime === 'string' || deposit.approvedTime instanceof Date ? new Date(deposit.approvedTime).toLocaleString('vi-VN') : 'N/A') : 'N/A'}
                            </p>
                          </div>
                          <Badge className="bg-green-100 text-green-800">
                            Đã duyệt
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="withdrawals" className="space-y-4 mt-6 animate-fade-in-up">
              <Card className="liquid-glass-card border-border/50 shadow-lg hover:shadow-xl transition-shadow duration-300">
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <CreditCard className="w-5 h-5 mr-2" />
                    Lịch sử rút tiền ({withdrawHistory.length})
                  </CardTitle>
                  <CardDescription>
                    Tất cả giao dịch rút tiền đã được xử lý
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {withdrawHistory.length === 0 ? (
                    <div className="text-center py-8">
                      <CreditCard className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                      <p className="text-muted-foreground">Chưa có giao dịch rút tiền nào</p>
                      <Button
                        onClick={() => router.push("/withdraw")}
                        className="mt-4"
                      >
                        Rút tiền ngay
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {withdrawHistory.map((withdrawal) => (
                        <div key={withdrawal.id} className="flex items-center justify-between p-4 border rounded-lg">
                          <div>
                            <p className="font-semibold text-red-600">
                              -{withdrawal.amount.toLocaleString('vi-VN')}đ
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {withdrawal.bankName}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {withdrawal.accountNumber} • {withdrawal.accountName}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {withdrawal.approvedTime ? (typeof withdrawal.approvedTime === 'string' || withdrawal.approvedTime instanceof Date ? new Date(withdrawal.approvedTime).toLocaleString('vi-VN') : 'N/A') : 'N/A'}
                            </p>
                          </div>
                          <Badge className="bg-green-100 text-green-800">
                            Đã chuyển
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="activity" className="space-y-4 mt-6 animate-fade-in-up">
              <Card className="liquid-glass-card border-border/50 shadow-lg hover:shadow-xl transition-shadow duration-300">
                <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <CardTitle className="flex items-center">
                      <Activity className="w-5 h-5 mr-2" />
                      Hoạt động gần đây
                    </CardTitle>
                    <CardDescription>
                      Theo dõi mọi giao dịch: mua hàng, nạp, rút và cập nhật tài khoản
                    </CardDescription>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { label: "Tất cả", value: "all" },
                      { label: "Mua hàng", value: "purchase" },
                      { label: "Nạp tiền", value: "deposit" },
                      { label: "Rút tiền", value: "withdraw" },
                    ].map((filter) => (
                      <Button
                        key={filter.value}
                        variant={activityFilter === filter.value ? "default" : "outline"}
                        size="sm"
                        onClick={() => setActivityFilter(filter.value as typeof activityFilter)}
                      >
                        {filter.label}
                      </Button>
                    ))}
                    <Button variant="outline" size="sm" onClick={exportActivityLog}>
                      Xuất log
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {filteredActivity.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      Chưa có hoạt động nào trong nhóm này.
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-[420px] overflow-y-auto pr-2">
                      {filteredActivity.map((item) => (
                        <div key={item.id} className="flex items-start gap-3 p-3 rounded-lg border">
                          <Badge
                            className={
                              item.type === "purchase"
                                ? "bg-blue-100 text-blue-800"
                                : item.type === "deposit"
                                  ? "bg-green-100 text-green-800"
                                  : "bg-orange-100 text-orange-800"
                            }
                          >
                            {item.type === "purchase"
                              ? "Mua hàng"
                              : item.type === "deposit"
                                ? "Nạp tiền"
                                : "Rút tiền"}
                          </Badge>
                          <div className="flex-1">
                            <p className="font-medium">{item.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {item.time ? new Date(item.time).toLocaleString("vi-VN") : "—"}
                            </p>
                          </div>
                          <div className="text-right">
                            <p
                              className={
                                item.type === "withdraw" ? "text-red-600 font-semibold" : "text-green-600 font-semibold"
                              }
                            >
                              {item.type === "withdraw" ? "-" : "+"}
                              {item.amount.toLocaleString("vi-VN")}đ
                            </p>
                            {item.meta && (
                              <p className="text-xs text-muted-foreground">{item.meta}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="notifications" className="space-y-4 mt-6 animate-fade-in-up">
              <NotificationCenter />
            </TabsContent>

            <TabsContent value="chat" className="space-y-4 mt-6 animate-fade-in-up">
              <DashboardChatClient currentUser={currentUser} />
            </TabsContent>

            <TabsContent value="support" className="space-y-4 mt-6 animate-fade-in-up">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="liquid-glass-card border-border/50 shadow-lg hover:shadow-xl transition-shadow duration-300">
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <MessageSquare className="w-5 h-5 mr-2" />
                      Gửi ticket hỗ trợ
                    </CardTitle>
                    <CardDescription>
                      Liên hệ admin khi cần trợ giúp về sản phẩm, thanh toán hoặc tài khoản
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <form className="space-y-4" onSubmit={handleTicketSubmit}>
                      <Input
                        placeholder="Chủ đề"
                        value={ticketForm.subject}
                        onChange={(e) =>
                          setTicketForm((prev) => ({ ...prev, subject: e.target.value }))
                        }
                        required
                      />
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <Label className="text-sm text-muted-foreground mb-1 block">
                            Loại yêu cầu
                          </Label>
                          <select
                            value={ticketForm.category}
                            onChange={(e) =>
                              setTicketForm((prev) => ({ ...prev, category: e.target.value }))
                            }
                            className="px-3 py-2 border rounded-md w-full bg-background text-sm"
                          >
                            <option value="product">Sản phẩm</option>
                            <option value="payment">Thanh toán</option>
                            <option value="account">Tài khoản</option>
                            <option value="other">Khác</option>
                          </select>
                        </div>
                        <div>
                          <Label className="text-sm text-muted-foreground mb-1 block">
                            Mức độ ưu tiên
                          </Label>
                          <select
                            value={ticketForm.priority}
                            onChange={(e) =>
                              setTicketForm((prev) => ({ ...prev, priority: e.target.value }))
                            }
                            className="px-3 py-2 border rounded-md w-full bg-background text-sm"
                          >
                            <option value="low">Thấp</option>
                            <option value="medium">Trung bình</option>
                            <option value="high">Cao</option>
                          </select>
                        </div>
                      </div>
                      <Textarea
                        rows={4}
                        placeholder="Mô tả chi tiết vấn đề bạn gặp phải..."
                        value={ticketForm.message}
                        onChange={(e) =>
                          setTicketForm((prev) => ({ ...prev, message: e.target.value }))
                        }
                        required
                      />
                      <Button type="submit" className="w-full">
                        Gửi yêu cầu
                      </Button>
                    </form>
                  </CardContent>
                </Card>

                <Card className="liquid-glass-card border-border/50 shadow-lg hover:shadow-xl transition-shadow duration-300">
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <span>Lịch sử ticket ({supportTickets.length})</span>
                      <Badge variant="outline">
                        Mở: {supportTickets.filter((t) => t.status === "open").length}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {supportTickets.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        Bạn chưa gửi ticket nào. Hãy mô tả vấn đề ở form bên cạnh để được hỗ trợ.
                      </p>
                    ) : (
                      <div className="space-y-3 max-h-[360px] overflow-y-auto pr-2">
                        {supportTickets.map((ticket) => (
                          <div key={String(ticket.id)} className="border rounded-lg p-3 space-y-2">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="font-medium">{ticket.subject}</p>
                                <p className="text-xs text-muted-foreground">
                                  Gửi ngày {ticket.createdAt ? (typeof ticket.createdAt === 'string' || ticket.createdAt instanceof Date ? new Date(ticket.createdAt).toLocaleString("vi-VN") : 'N/A') : 'N/A'}
                                </p>
                              </div>
                              <select
                                value={ticket.status}
                                onChange={(e) => updateTicketStatus(String(ticket.id), e.target.value)}
                                className="text-xs border rounded px-2 py-1 bg-background"
                              >
                                <option value="open">Mở</option>
                                <option value="in-progress">Đang xử lý</option>
                                <option value="resolved">Đã giải quyết</option>
                              </select>
                            </div>
                            <p className="text-sm text-muted-foreground">{ticket.message}</p>
                            <div className="flex items-center gap-2 text-xs">
                              <Badge variant="secondary">{ticket.category}</Badge>
                              <Badge
                                className={
                                  ticket.priority === "high"
                                    ? "bg-red-100 text-red-800"
                                    : ticket.priority === "medium"
                                      ? "bg-yellow-100 text-yellow-800"
                                      : "bg-blue-100 text-blue-800"
                                }
                              >
                                Ưu tiên: {ticket.priority}
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="profile" className="space-y-4 mt-6 animate-fade-in-up">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className="liquid-glass-card border-border/50 shadow-lg hover:shadow-xl transition-shadow duration-300">
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <UserIcon className="w-5 h-5 mr-2" />
                      Thông tin cá nhân
                    </CardTitle>
                    <CardDescription>Cập nhật avatar, thông tin liên hệ và mạng xã hội.</CardDescription>
                    {profileMessage && (
                      <p
                        className={`text-sm ${profileMessage.type === "success" ? "text-green-600" : "text-red-600"
                          }`}
                      >
                        {profileMessage.text}
                      </p>
                    )}
                  </CardHeader>
                  <CardContent>
                    <form className="space-y-6" onSubmit={handleProfileSubmit}>
                      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                        <div className="flex items-center gap-4">
                          <Avatar className="h-20 w-20 border">
                            <AvatarImage
                              src={avatarPreview || currentUser.avatarUrl || currentUser.image || ""}
                              alt={currentUser.name || currentUser.email}
                            />
                            <AvatarFallback>
                              {(currentUser.name || currentUser.email || "U").slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => avatarInputRef.current?.click()}
                            >
                              <Camera className="w-4 h-4 mr-2" />
                              Đổi avatar
                            </Button>
                            <p className="text-xs text-muted-foreground mt-2">
                              Hỗ trợ PNG/JPG, dung lượng &lt; 2MB
                            </p>
                          </div>
                        </div>
                        <input
                          ref={avatarInputRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={handleAvatarChange}
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="profile-name">Tên hiển thị</Label>
                          <Input
                            id="profile-name"
                            value={profileForm.name}
                            onChange={(e) => handleProfileInputChange("name", e.target.value)}
                            placeholder="Tên hiển thị"
                          />
                        </div>
                        <div>
                          <Label htmlFor="profile-phone">Số điện thoại</Label>
                          <Input
                            id="profile-phone"
                            value={profileForm.phone}
                            onChange={(e) => handleProfileInputChange("phone", e.target.value)}
                            placeholder="+84..."
                          />
                        </div>
                        <div className="md:col-span-2">
                          <Label htmlFor="profile-address">Địa chỉ</Label>
                          <Input
                            id="profile-address"
                            value={profileForm.address}
                            onChange={(e) => handleProfileInputChange("address", e.target.value)}
                            placeholder="Số nhà, đường, phường..."
                          />
                        </div>
                        <div>
                          <Label htmlFor="profile-city">Thành phố</Label>
                          <Input
                            id="profile-city"
                            value={profileForm.city}
                            onChange={(e) => handleProfileInputChange("city", e.target.value)}
                            placeholder="TP. Hồ Chí Minh"
                          />
                        </div>
                        <div>
                          <Label htmlFor="profile-country">Quốc gia</Label>
                          <Input
                            id="profile-country"
                            value={profileForm.country}
                            onChange={(e) => handleProfileInputChange("country", e.target.value)}
                            placeholder="Việt Nam"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <Label htmlFor="social-google">Google</Label>
                          <Input
                            id="social-google"
                            value={profileForm.socialGoogle}
                            onChange={(e) => handleProfileInputChange("socialGoogle", e.target.value)}
                            placeholder="https://profiles.google.com/..."
                          />
                        </div>
                        <div>
                          <Label htmlFor="social-github">GitHub</Label>
                          <Input
                            id="social-github"
                            value={profileForm.socialGithub}
                            onChange={(e) => handleProfileInputChange("socialGithub", e.target.value)}
                            placeholder="https://github.com/..."
                          />
                        </div>
                        <div>
                          <Label htmlFor="social-facebook">Facebook</Label>
                          <Input
                            id="social-facebook"
                            value={profileForm.socialFacebook}
                            onChange={(e) => handleProfileInputChange("socialFacebook", e.target.value)}
                            placeholder="https://facebook.com/..."
                          />
                        </div>
                      </div>

                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <Button type="submit" disabled={isSavingProfile} className="w-full sm:w-auto">
                          {isSavingProfile ? "Đang lưu..." : "Lưu thay đổi"}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => router.push("/dashboard/change-password")}
                        >
                          <Lock className="w-4 h-4 mr-2" />
                          Đổi mật khẩu
                        </Button>
                      </div>
                    </form>
                  </CardContent>
                </Card>

                <Card className="liquid-glass-card border-border/50 shadow-lg hover:shadow-xl transition-shadow duration-300">
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <Settings className="w-5 h-5 mr-2" />
                      Thông tin & thống kê tài khoản
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Email</span>
                      <span className="font-medium text-right break-all">{currentUser.email}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Ngày tham gia</span>
                      <span className="font-medium">
                        {currentUser.created_at ? (typeof currentUser.created_at === 'string' || currentUser.created_at instanceof Date ? new Date(currentUser.created_at).toLocaleDateString("vi-VN") : 'N/A') : 'N/A'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Lần đăng nhập cuối</span>
                      <span className="font-medium text-right">
                        {currentUser.last_login_at ? (typeof currentUser.last_login_at === 'string' || currentUser.last_login_at instanceof Date ? new Date(currentUser.last_login_at).toLocaleString("vi-VN") : 'Chưa có thông tin') : (currentUser.lastActivity ? (typeof currentUser.lastActivity === 'string' || currentUser.lastActivity instanceof Date ? new Date(currentUser.lastActivity).toLocaleString("vi-VN") : 'Chưa có thông tin') : 'Chưa có thông tin')}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">IP hiện tại</span>
                      <span className="font-medium text-xs">
                        {userIP !== "Loading..." ? userIP : currentUser.ipAddress || "Unknown"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Thiết bị</span>
                      <span className="font-medium text-xs">
                        {deviceInfo?.deviceType || "Unknown"}
                      </span>
                    </div>
                    {deviceInfo && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Trình duyệt</span>
                        <span className="font-medium text-xs">
                          {deviceInfo.browser} ({deviceInfo.os})
                        </span>
                      </div>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t">
                      <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20">
                        <p className="text-xs text-muted-foreground uppercase">Trạng thái</p>
                        <p className="font-semibold text-blue-600">
                          {currentUser.status === "active" ? "Hoạt động" : "Tạm khóa"}
                        </p>
                      </div>
                      <div className="p-3 rounded-lg bg-purple-50 dark:bg-purple-900/20">
                        <p className="text-xs text-muted-foreground uppercase">Số lần đăng nhập</p>
                        <p className="font-semibold text-purple-600">{currentUser.loginCount || 1}</p>
                      </div>
                      <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/20">
                        <p className="text-xs text-muted-foreground uppercase">Sản phẩm đã mua</p>
                        <p className="font-semibold text-green-600">{userPurchases.length}</p>
                      </div>
                      <div className="p-3 rounded-lg bg-yellow-50 dark:bg-yellow-900/20">
                        <p className="text-xs text-muted-foreground uppercase">Tổng chi tiêu</p>
                        <p className="font-semibold text-yellow-600">
                          {stats.totalSpent.toLocaleString("vi-VN")}đ
                        </p>
                      </div>
                      <div className="p-3 rounded-lg bg-pink-50 dark:bg-pink-900/20">
                        <p className="text-xs text-muted-foreground uppercase">Tổng lượt tải xuống</p>
                        <p className="font-semibold text-pink-600">
                          {userPurchases.reduce((sum, purchase) => sum + (purchase.downloads || 0), 0)}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="security" className="space-y-4 mt-6 animate-fade-in-up">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className="md:col-span-2 glass-card border-border/50 shadow-lg hover:shadow-xl transition-shadow duration-300">
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <ShieldCheck className="w-5 h-5 mr-2" />
                      Xác thực hai lớp (2FA)
                    </CardTitle>
                    <CardDescription>
                      Bật Google Authenticator để bảo vệ tài khoản. Chỉ hiển thị mã backup khi vừa kích hoạt.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between flex-wrap gap-3">
                      <div>
                        <p className="text-sm text-muted-foreground">Trạng thái</p>
                        <p className="font-semibold">
                          {securityPreferences.twoFactorEnabled ? "Đang bật 2FA" : "Chưa bật 2FA"}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        {securityPreferences.twoFactorEnabled ? (
                          <Button
                            variant="outline"
                            onClick={disableTwoFactor}
                            disabled={isDisablingTwoFactor}
                          >
                            {isDisablingTwoFactor ? "Đang tắt..." : "Tắt 2FA"}
                          </Button>
                        ) : (
                          <Button onClick={startTwoFactorSetup} disabled={isStartingTwoFactor}>
                            {isStartingTwoFactor ? "Đang tạo..." : "Bật 2FA"}
                          </Button>
                        )}
                      </div>
                    </div>

                    {!securityPreferences.twoFactorEnabled && twoFactorSecret && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border rounded-lg p-4">
                        <div className="space-y-3">
                          <p className="font-medium">Quét mã QR bằng Google Authenticator</p>
                          {twoFactorQRCode && (
                            <Image
                              src={twoFactorQRCode}
                              alt="QR Code"
                              width={160}
                              height={160}
                              className="w-40 h-40 border rounded-lg bg-white"
                              unoptimized
                              priority
                            />
                          )}
                          <p className="text-xs text-muted-foreground break-all">
                            Secret: <span className="font-mono">{twoFactorSecret}</span>
                          </p>
                        </div>
                        <div className="space-y-3">
                          <Label htmlFor="twofactor-token">Nhập mã OTP 6 chữ số</Label>
                          <Input
                            id="twofactor-token"
                            value={twoFactorToken}
                            onChange={(e) => setTwoFactorToken(e.target.value)}
                            placeholder="123456"
                          />
                          <Button onClick={verifyTwoFactor} disabled={isVerifyingTwoFactor || !twoFactorToken}>
                            {isVerifyingTwoFactor ? "Đang xác minh..." : "Xác nhận & bật 2FA"}
                          </Button>
                        </div>
                      </div>
                    )}

                    {(twoFactorBackupCodes.length > 0 || securityPreferences.backupCodes?.length > 0) && (
                      <div className="border rounded-lg p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">Mã backup mới</p>
                            <p className="text-sm text-muted-foreground">
                              Lưu trữ ngoại tuyến. Mỗi mã dùng một lần.
                            </p>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-center text-sm font-mono">
                          {(twoFactorBackupCodes.length > 0 ? twoFactorBackupCodes : securityPreferences.backupCodes || []).map(
                            (code) => (
                              <div key={code} className="bg-muted rounded py-2">
                                {code}
                              </div>
                            )
                          )}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="liquid-glass-card border-border/50 shadow-lg hover:shadow-xl transition-shadow duration-300">
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <KeyRound className="w-5 h-5 mr-2" />
                      Cảnh báo đăng nhập & thiết bị
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {[
                      {
                        key: "loginNotifications" as const,
                        title: "Thông báo đăng nhập",
                        description: "Gửi email khi xuất hiện phiên đăng nhập mới.",
                      },
                      {
                        key: "deviceAlerts" as const,
                        title: "Cảnh báo thiết bị lạ",
                        description: "Nhắc nhở khi phát hiện thiết bị chưa tin cậy.",
                      },
                    ].map((item) => (
                      <div key={item.key} className="flex items-start justify-between gap-4">
                        <div>
                          <p className="font-medium">{item.title}</p>
                          <p className="text-sm text-muted-foreground">{item.description}</p>
                        </div>
                        <Switch
                          checked={securityPreferences[item.key]}
                          onCheckedChange={handleSecurityToggle(item.key)}
                        />
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card className="liquid-glass-card border-border/50 shadow-lg hover:shadow-xl transition-shadow duration-300">
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <Smartphone className="w-5 h-5 mr-2" />
                      Thiết bị đang hoạt động
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2 text-sm">
                      <div className="p-3 border rounded-lg flex items-center justify-between">
                        <div>
                          <p className="font-medium">
                            {deviceInfo ? `${deviceInfo.browser} • ${deviceInfo.os}` : "Thiết bị hiện tại"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            IP: {userIP !== "Loading..." ? userIP : "Đang xác định"}
                          </p>
                        </div>
                        <Badge variant="secondary">Hoạt động</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Danh sách chi tiết và đăng xuất từ xa đang được cập nhật trong mục "Thiết bị".
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </main>

      <Footer />
    </div>
  )
}
