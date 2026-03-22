"use client"

import useSWR from "swr"
import type { UserData } from "@/lib/userManager"
import { useEffect } from "react"
import { getLocalStorage, setLocalStorage } from "@/lib/localStorage-utils"

const fetcher = async (url: string) => {
  const res = await fetch(url, { credentials: "include" })
  if (!res.ok) throw new Error("Failed to load user profile")
  const data = await res.json()
  if (!data?.success || !data?.profile) return null
  
  const p = data.profile
  const user: UserData = {
    uid: String(p.id),
    id: p.id,
    email: p.email,
    name: p.name,
    displayName: p.name,
    avatar: p.avatarUrl,
    avatar_url: p.avatarUrl,
    balance: p.balance,
  }
  
  // Đồng bộ với localStorage cho các components legacy
  setLocalStorage("currentUser", user)
  return user
}

export function useCurrentUser() {
  const { data: user, mutate } = useSWR<UserData | null>(
    "/api/profile",
    fetcher,
    {
      revalidateOnFocus: true, // Auto reload balance khi user chuyển tab lại
      refreshInterval: 0, // Không cần thiết reload vòng lặp (giảm tải), focus là đủ
      fallbackData: getLocalStorage<UserData | null>("currentUser", null),
    }
  )

  useEffect(() => {
    const handleUserUpdated = () => {
      mutate() // Re-fetch data from API
    }

    // Vẫn lắng nghe event để có thể trigger thủ công từ components khác (ví dụ checkout thành công)
    window.addEventListener("userUpdated", handleUserUpdated)

    return () => {
      window.removeEventListener("userUpdated", handleUserUpdated)
    }
  }, [mutate])

  return user || null
}

