import { NextRequest, NextResponse } from "next/server"
import {
  createOrUpdateUser,
  getUserByEmail,
  getUserById,
  getUserProfileByUserId,
  upsertUserProfile,
} from "@/lib/database"
import { logger } from "@/lib/logger"
import { checkRateLimitAndRespond } from "@/lib/rate-limit"
import { validateRequest, getClientIP } from "@/lib/api-auth"
import { profileUpdateSchema } from "@/lib/validation-schemas"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function buildProfileResponse(user: any, profileRow?: any) {
  const socialLinks = profileRow?.social_links || {}
  return {
    id: user.id,
    email: user.email,
    emailVerified: Boolean(user.email_verified_at),
    name: user.name,
    avatarUrl: user.avatar_url,
    phone: profileRow?.phone || "",
    address: profileRow?.address || "",
    city: profileRow?.city || "",
    country: profileRow?.country || "",
    postalCode: profileRow?.postal_code || "",
    twoFactorEnabled: profileRow?.two_factor_enabled ?? false,
    socialLinks,
    updatedAt: profileRow?.updated_at || user.updated_at,
  }
}

function sanitizeSocialLinks(input?: any) {
  if (!input) return null
  const allowed = ["google", "github", "facebook", "twitter", "website"]
  const cleaned: Record<string, string> = {}
  allowed.forEach((key) => {
    const value = input[key]
    if (typeof value === "string" && value.trim().length > 0) {
      cleaned[key] = value.trim()
    }
  })
  return Object.keys(cleaned).length ? cleaned : null
}

export async function GET(request: NextRequest) {
  try {
    const rateLimitResponse = await checkRateLimitAndRespond(request, 30, 60, 'profile-get');
    if (rateLimitResponse) return rateLimitResponse;

    const { searchParams } = new URL(request.url)
    let email = searchParams.get("email")
    const userIdParam = searchParams.get("userId")

    const { verifyFirebaseToken, requireAdmin } = await import("@/lib/api-auth");
    const authUser = await verifyFirebaseToken(request);
    const isAdmin = await requireAdmin(request).catch(() => false);

    if (!email && !userIdParam) {
      if (authUser?.email) {
        email = authUser.email
      } else {
        return NextResponse.json(
          { success: false, error: "Cần đăng nhập hoặc truyền email/userId" },
          { status: 401 }
        )
      }
    }

    if (!authUser && !isAdmin) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    if (!isAdmin) {
      if (email && email.toLowerCase() !== authUser?.email?.toLowerCase()) {
        return NextResponse.json({ success: false, error: "Forbidden: Access denied" }, { status: 403 });
      }
      if (userIdParam) {
        const currentUserDB = await getUserByEmail(authUser!.email!);
        if (!currentUserDB || currentUserDB.id !== Number(userIdParam)) {
          return NextResponse.json({ success: false, error: "Forbidden: Access denied" }, { status: 403 });
        }
      }
    }

    let user = null
    if (email) {
      user = await getUserByEmail(email)
    } else if (userIdParam) {
      const parsedId = Number(userIdParam)
      if (Number.isNaN(parsedId)) {
        return NextResponse.json({ success: false, error: "userId không hợp lệ" }, { status: 400 })
      }
      user = await getUserById(parsedId)
    }

    if (!user) {
      return NextResponse.json({ success: false, error: "Không tìm thấy người dùng" }, { status: 404 })
    }

    const profileRow = await getUserProfileByUserId(user.id)
    return NextResponse.json({ success: true, profile: buildProfileResponse(user, profileRow) })
  } catch (error: any) {
    logger.error("GET /api/profile failed", error)
    return NextResponse.json(
      { success: false, error: error.message || "Không thể tải profile" },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const rateLimitResponse = await checkRateLimitAndRespond(request, 10, 60, 'profile-put');
    if (rateLimitResponse) return rateLimitResponse;

    const body = await request.json()
    const validation = validateRequest(body, profileUpdateSchema);
    
    if (!validation.valid || !validation.data) {
      return NextResponse.json({ success: false, error: validation.error || "Dữ liệu không hợp lệ" }, { status: 400 });
    }

    const {
      email,
      name,
      avatarUrl,
      phone,
      address,
      city,
      country,
      postalCode,
      socialLinks,
      twoFactorEnabled,
    } = validation.data

    if (!email) {
      return NextResponse.json({ success: false, error: "Thiếu email" }, { status: 400 })
    }

    const { verifyFirebaseToken, requireAdmin, requireEmailVerifiedForUser } = await import("@/lib/api-auth");
    const authUser = await verifyFirebaseToken(request);
    const isAdmin = await requireAdmin(request).catch(() => false);

    if (!authUser && !isAdmin) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    if (authUser && !isAdmin) {
      const ev = await requireEmailVerifiedForUser(authUser);
      if (ev) return ev;
    }

    if (!isAdmin && email.toLowerCase() !== authUser?.email?.toLowerCase()) {
      return NextResponse.json({ success: false, error: "Forbidden: Access denied" }, { status: 403 });
    }

    const user = await getUserByEmail(email)
    if (!user) {
      return NextResponse.json({ success: false, error: "Không tìm thấy người dùng" }, { status: 404 })
    }

    if (name !== undefined || avatarUrl !== undefined) {
      await createOrUpdateUser({
        email,
        name,
        avatarUrl: avatarUrl || undefined,
        ipAddress: getClientIP(request),
      })
    }

    const existingProfile = await getUserProfileByUserId(user.id)
    const mergedProfile = {
      phone: phone !== undefined ? phone : existingProfile?.phone ?? null,
      address: address !== undefined ? address : existingProfile?.address ?? null,
      city: city !== undefined ? city : existingProfile?.city ?? null,
      country: country !== undefined ? country : existingProfile?.country ?? null,
      postalCode: postalCode !== undefined ? postalCode : existingProfile?.postal_code ?? null,
      socialLinks:
        socialLinks !== undefined
          ? sanitizeSocialLinks(socialLinks)
          : existingProfile?.social_links ?? null,
      twoFactorEnabled:
        typeof twoFactorEnabled === "boolean"
          ? twoFactorEnabled
          : existingProfile?.two_factor_enabled ?? false,
    }

    const savedProfile = await upsertUserProfile({
      userId: user.id,
      phone: mergedProfile.phone || undefined,
      address: mergedProfile.address || undefined,
      city: mergedProfile.city || undefined,
      country: mergedProfile.country || undefined,
      postalCode: mergedProfile.postalCode || undefined,
      socialLinks: mergedProfile.socialLinks || undefined,
      twoFactorEnabled: mergedProfile.twoFactorEnabled,
    })

    // Audit log
    try {
      const { logAdminAction, resolveAdminIdForAudit } = await import('@/lib/audit-logger');
      const actorId = isAdmin ? await resolveAdminIdForAudit({ email: (authUser as any)?.email, uid: (authUser as any)?.uid }) : user.id;
      
      await logAdminAction({
        adminId: typeof actorId === 'number' ? actorId : (typeof actorId === 'string' ? 0 : 0),
        adminEmail: authUser?.email || 'system',
        action: isAdmin ? 'ADMIN_UPDATE_USER_PROFILE' : 'USER_UPDATE_PROFILE',
        targetType: 'user',
        targetId: String(user.id),
        details: { fields: Object.keys(body).filter(k => body[k] !== undefined) },
        ipAddress: getClientIP(request),
      });
    } catch { /* ignore log error */ }

    const refreshedUser = await getUserByEmail(email)
    return NextResponse.json({
      success: true,
      profile: buildProfileResponse(refreshedUser || user, savedProfile),
    })
  } catch (error: any) {
    logger.error("PUT /api/profile failed", error)
    return NextResponse.json(
      { success: false, error: error.message || "Không thể cập nhật profile" },
      { status: 500 }
    )
  }
}
