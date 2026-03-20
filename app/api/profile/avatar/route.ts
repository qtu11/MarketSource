import { NextRequest, NextResponse } from "next/server"
import { uploadAvatarFile } from "@/lib/storage/avatar"
import { createOrUpdateUser } from "@/lib/database-mysql"
import { logger } from "@/lib/logger"
import { verifyFirebaseToken } from "@/lib/api-auth"

export const runtime = "nodejs"
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const authUser = await verifyFirebaseToken(request)
    if (!authUser?.email) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get("file")
    const email = formData.get("email")

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ success: false, error: "Thiếu file upload" }, { status: 400 })
    }

    if (email && typeof email !== "string") {
      return NextResponse.json({ success: false, error: "Email khong hop le" }, { status: 400 })
    }

    const targetEmail = authUser.email.toLowerCase()
    if (typeof email === "string" && email.trim().toLowerCase() !== targetEmail) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 })
    }

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const mimeType = file.type || "image/png"
    const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"])

    if (!allowedMimeTypes.has(mimeType)) {
      return NextResponse.json(
        { success: false, error: "Dinh dang anh khong duoc ho tro" },
        { status: 400 }
      )
    }

    if (buffer.length > 2 * 1024 * 1024) {
      return NextResponse.json(
        { success: false, error: "Avatar vượt quá giới hạn 2MB" },
        { status: 400 }
      )
    }

    const avatarUrl = await uploadAvatarFile(buffer, mimeType)

    await createOrUpdateUser({
      email: targetEmail,
      avatarUrl,
    })

    return NextResponse.json({ success: true, avatarUrl })
  } catch (error: any) {
    logger.error("Avatar upload failed", error)
    return NextResponse.json(
      { success: false, error: error.message || "Không thể upload avatar" },
      { status: 500 }
    )
  }
}
