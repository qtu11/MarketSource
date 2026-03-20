import { NextRequest, NextResponse } from "next/server"
import { getPurchases, createPurchase, getProductById, getUserIdByEmail, normalizeUserIdMySQL, processReferralCommissionMySQL } from "@/lib/database-mysql"
import { verifyFirebaseToken, validateRequest } from "@/lib/api-auth"
import { purchaseSchema } from "@/lib/validation-schemas"
import { notifyPurchaseSuccess, notifyReferralCommission } from "@/lib/notifications"
import { logger } from "@/lib/logger"

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    // ✅ FIX: Thêm rate limiting
    const { checkRateLimitAndRespond } = await import('@/lib/rate-limit');
    const rateLimitResponse = await checkRateLimitAndRespond(request, 20, 10, 'purchases-get');
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    // Verify authentication
    const authUser = await verifyFirebaseToken(request);

    // ✅ FIX: Dùng requireAdmin() thay vì check X-Admin-Auth header
    const { requireAdmin } = await import('@/lib/api-auth');
    const isAdmin = await requireAdmin(request).catch(() => false);

    if (!authUser && !isAdmin) {
      return NextResponse.json({
        success: false,
        error: 'Unauthorized'
      }, { status: 401 });
    }

    // ✅ FIX: Nếu có userId param và không phải admin → verify chính là user đó
    if (userId && authUser && !isAdmin) {
      // userId từ query param có thể là number (PostgreSQL ID) hoặc string (Firebase UID)
      // Cần check bằng cách so sánh email hoặc convert userId sang uid
      const dbUserId = await getUserIdByEmail(authUser.email || '');
      const userIdNum = parseInt(userId);

      // So sánh cả DB ID và Firebase UID
      if (dbUserId !== userIdNum && authUser.uid !== userId) {
        return NextResponse.json({
          success: false,
          error: 'Unauthorized: Can only view your own purchases'
        }, { status: 403 });
      }
    }

    // ✅ SECURITY FIX: Nếu không phải admin, bắt buộc phải lọc theo userId của chính người dùng đó
    let dbUserId: number | undefined = undefined
    if (isAdmin) {
      // Admin có thể xem tất cả hoặc xem theo userId cụ thể nếu có param
      if (userId) {
        if (!isNaN(parseInt(userId))) {
          dbUserId = parseInt(userId)
        } else {
          dbUserId = await getUserIdByEmail(userId) || undefined // Thử search theo email nếu userId là string email
        }
      }
    } else if (authUser) {
      // User thường chỉ được xem của chính mình. 
      // Luôn lấy DB ID từ email của chính token đó để đảm bảo an toàn (IDOR protection)
      dbUserId = await getUserIdByEmail(authUser.email || "") || undefined
      
      if (!dbUserId) {
        return NextResponse.json({ success: false, error: 'User profile not found' }, { status: 404 });
      }
    }

    const purchases = await getPurchases(dbUserId)

    return NextResponse.json({
      success: true,
      purchases: purchases,
      data: purchases, // Keep both for backward compatibility
      error: null
    });
  } catch (error: unknown) {
    const { createErrorResponse, logError } = await import("@/lib/error-handler")
    logError('Purchases GET', error);
    return NextResponse.json(
      createErrorResponse(error, 500),
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // ✅ FIX: Thêm rate limiting để tránh spam purchases
    const { checkRateLimitAndRespond } = await import('@/lib/rate-limit');
    const rateLimitResponse = await checkRateLimitAndRespond(request, 10, 60, 'purchases-post');
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    // Require authentication
    const authUser = await verifyFirebaseToken(request);
    if (!authUser) {
      return NextResponse.json({
        success: false,
        error: 'Unauthorized'
      }, { status: 401 });
    }

    const body = await request.json();

    // Validate với Zod
    const validation = validateRequest(body, purchaseSchema);

    if (!validation.valid || !validation.data) {
      return NextResponse.json({
        success: false,
        error: validation.error || 'Dữ liệu không hợp lệ'
      }, { status: 400 });
    }

    const purchaseData = validation.data;

    // Verify userId matches authenticated user
    // ✅ FIX: So sánh đúng kiểu dữ liệu (string vs number)
    // userId có thể là string (Firebase UID) hoặc number (PostgreSQL ID)
    // Cần check bằng cách so sánh với email hoặc convert sang DB ID
    if (purchaseData.userId) {
      const purchaseUserIdStr = purchaseData.userId.toString();
      // Nếu là number (DB ID), cần convert sang email để so sánh
      if (!isNaN(Number(purchaseData.userId))) {
        // Là DB ID, cần check bằng email
        const { getUserByIdMySQL: getUserById } = await import('@/lib/database-mysql');
        const user = await getUserById(Number(purchaseData.userId));
        if (user && user.email !== authUser.email) {
          return NextResponse.json({
            success: false,
            error: 'Unauthorized: User ID mismatch'
          }, { status: 403 });
        }
      } else {
        // Là string (Firebase UID), so sánh trực tiếp
        if (purchaseUserIdStr !== authUser.uid) {
          return NextResponse.json({
            success: false,
            error: 'Unauthorized: User ID mismatch'
          }, { status: 403 });
        }
      }
    }

    // ✅ FIX: Normalize userId - nếu là string (uid), dùng email để tìm DB ID
    const dbUserId = await normalizeUserIdMySQL(
      purchaseData.userId || authUser.uid,
      authUser.email || undefined,
    )

    if (!dbUserId) {
      return NextResponse.json({
        success: false,
        error: 'Cannot resolve user ID. User may not exist in database.'
      }, { status: 400 });
    }
    const dbUserIdNum = Number(dbUserId);

    // ✅ FIX: Remove duplicate check trước transaction - rely on database constraint và check trong transaction
    // createPurchase đã có check duplicate trong transaction với row locking, đảm bảo atomicity
    const productIdNum = typeof purchaseData.productId === 'number'
      ? purchaseData.productId
      : parseInt(purchaseData.productId.toString(), 10);
    const result = await createPurchase({
      userId: dbUserIdNum, // Dùng DB ID đã normalize
      productId: productIdNum,
      amount: purchaseData.amount,
      userEmail: authUser.email || undefined
    });

    // ✅ FIX: Xử lý hoa hồng giới thiệu (Referral Commission)
    try {
      const commissionResult = await processReferralCommissionMySQL(dbUserIdNum, purchaseData.amount);
      if (commissionResult) {
        // Lấy thông tin người giới thiệu để gửi thông báo chi tiết
        const { getUserByIdMySQL } = await import('@/lib/database-mysql');
        const referrer = await getUserByIdMySQL(commissionResult.referrerId);
        
        await notifyReferralCommission({
          referrerEmail: referrer?.email || 'Admin',
          referrerName: referrer?.username || referrer?.name,
          amount: commissionResult.commissionAmount,
          referredEmail: authUser.email || undefined
        });

        // Tạo thông báo trong DB cho người giới thiệu
        const { createNotificationMySQL } = await import('@/lib/database-mysql');
        await createNotificationMySQL({
          userId: commissionResult.referrerId,
          type: 'referral',
          message: `Bạn vừa nhận được ${commissionResult.commissionAmount.toLocaleString()}đ hoa hồng từ một giao dịch của người bạn giới thiệu!`,
          isRead: false
        });
        
        logger.info('Referral commission processed', { ...commissionResult, referredId: dbUserIdNum });
      }
    } catch (refError) {
      logger.error('Failed to process referral commission', refError);
    }

    const product = await getProductById(productIdNum);
    notifyPurchaseSuccess({
      userName: authUser.email?.split('@')[0],
      userEmail: authUser.email || undefined,
      amount: purchaseData.amount,
      productTitle: product?.title || `Sản phẩm #${productIdNum}`,
    }).catch((error) => {
      logger.warn('Failed to notify purchase success', { error: error?.message });
    });

    // ✅ Gửi tin nhắn qua hệ thống Chat nội bộ của Dashboard
    try {
      const { createChat } = await import('@/lib/database-mysql');
      await createChat({
        userId: dbUserIdNum,
        adminId: null, // Tin nhắn tự động từ hệ thống
        message: `🤖 Chúc mừng bạn đã mua thành công sản phẩm "${product?.title || `Sản phẩm #${productIdNum}`}". Bạn có thể tải mã nguồn cập nhật mới nhất tại mục "Tải xuống" hoặc "Sản phẩm đã mua" trong Dashboard. Cảm ơn bạn đã tin tưởng Hệ Thống QtusDev Market! 🎉`,
        isAdmin: true, // Flag xác định bot account
      });
    } catch (chatError: any) {
      logger.error('Failed to send purchase chat notification', { error: chatError.message });
    }

    // ✅ Gửi mail cám ơn mua hàng thành công
    if (authUser.email) {
      try {
        const { sendPurchaseConfirmationEmail } = await import('@/lib/email');
        await sendPurchaseConfirmationEmail(
          authUser.email, 
          product?.title || `Sản phẩm #${productIdNum}`, 
          purchaseData.amount
        );
      } catch (emailError) {
        logger.error('Failed to send purchase confirmation email', emailError);
      }
    }

    return NextResponse.json({
      success: true,
      purchaseId: result.id,
      newBalance: result.newBalance
    });
  } catch (error: unknown) {
    const { createErrorResponse, logError } = await import('@/lib/error-handler');
    logError('Purchase POST', error);

    // Handle specific errors
    if (error instanceof Error && error.message?.includes('Insufficient balance')) {
      return NextResponse.json({
        success: false,
        error: 'Số dư không đủ để thực hiện giao dịch'
      }, { status: 400 });
    }

    if (error instanceof Error && error.message?.includes('already purchased')) {
      return NextResponse.json({
        success: false,
        error: 'Bạn đã mua sản phẩm này rồi'
      }, { status: 400 });
    }

    return NextResponse.json(
      createErrorResponse(error, 500),
      { status: 500 }
    );
  }
}
