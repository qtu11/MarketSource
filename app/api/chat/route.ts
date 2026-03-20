import { NextRequest, NextResponse } from 'next/server';
import { getClientIP } from '@/lib/api-auth';
import { query, queryOne, getUserIdByEmail, createChat, getChats } from '@/lib/database-mysql';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import { Product } from '@/types/product';
import { cookies } from 'next/headers';
import DOMPurify from 'isomorphic-dompurify';

export const runtime = 'nodejs'

const MAX_MESSAGE_LENGTH = 5000;

// ✅ FIX: Sanitize message để tránh XSS triệt để bằng HTML Entities
function sanitizeMessage(message: string): string {
  if (!message) return '';
  // ✅ BUG #10 FIX: Trực tiếp cắt chuỗi nếu quá dài trước khi sanitize
  const truncated = message.length > MAX_MESSAGE_LENGTH ? message.substring(0, MAX_MESSAGE_LENGTH) : message;
  
  // ✅ BUG #5 FIX: Triệt để loại bỏ HTML tags (XSS Protection)
  const plainText = truncated.replace(/<[^>]*>/g, '').trim();
  
  return DOMPurify.sanitize(plainText, {
    ALLOWED_TAGS: [], // No HTML allowed in chat
    ALLOWED_ATTR: []
  });
}

const messageSchema = z.object({
  receiverId: z.number().int().positive().optional(),
  message: z.string().min(1).max(MAX_MESSAGE_LENGTH),
});

/**
 * ✅ FIX: Verify user từ JWT hoặc localStorage user data
 * Thống nhất auth với login flow (không yêu cầu Firebase)
 */
async function verifyAuthUser(request: NextRequest): Promise<{ email: string; uid?: string } | null> {
  try {
    // Cách 1: JWT token trong cookie
    const cookieStore = await cookies();
    const tokenCookie = cookieStore.get('auth-token') || cookieStore.get('next-auth.session-token');
    if (tokenCookie) {
      try {
        const jwt = await import('@/lib/jwt');
        const payload = await (jwt as any).verifyToken?.(tokenCookie.value);
        if (payload?.email) {
          return { email: payload.email, uid: payload.uid || payload.sub };
        }
      } catch { /* JWT verify failed, try other methods */ }
    }

    // ✅ SECURITY FIX: Cách 2 (x-user-email header) ĐÃ BỊ XÓA — Có thể bị mạo danh
    // Chỉ tin cậy JWT cookie, NextAuth session, hoặc Firebase token

    // Cách 3: Firebase token (backward compatible)
    try {
      const { verifyFirebaseToken } = await import('@/lib/api-auth');
      const firebaseUser = await verifyFirebaseToken(request);
      if (firebaseUser?.email) return { email: firebaseUser.email, uid: firebaseUser.uid };
    } catch { /* Firebase not configured */ }

    return null;
  } catch (error) {
    logger.error('Auth verification error', error);
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    // ✅ Rate limiting
    const { checkRateLimitAndRespond } = await import('@/lib/rate-limit');
    const rateLimitResponse = await checkRateLimitAndRespond(request, 15, 60, 'chat-post');
    if (rateLimitResponse) return rateLimitResponse;

    const authUser = await verifyAuthUser(request);
    if (!authUser) {
      return NextResponse.json({ success: false, error: 'Vui lòng đăng nhập' }, { status: 401 });
    }

    const body = await request.json();
    const validation = messageSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ success: false, error: validation.error.errors[0]?.message }, { status: 400 });
    }

    const { receiverId, message } = validation.data;
    const sanitizedMessage = sanitizeMessage(message);

    if (!sanitizedMessage) {
      return NextResponse.json({ success: false, error: 'Tin nhắn không hợp lệ' }, { status: 400 });
    }

    // Lấy thông tin sender từ database
    const sender = await queryOne<any>(
      "SELECT id, role FROM users WHERE email = ?",
      [authUser.email]
    );

    if (!sender) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    // Kiểm tra quyền admin một cách tuyệt đối
    const isAdmin = sender.role === 'admin';
    const senderId = sender.id;

    let targetUserId: number;
    let targetAdminId: number | null;

    if (isAdmin) {
      // Admin đang reply cho một user cụ thể
      if (!receiverId) {
        return NextResponse.json({ success: false, error: 'Admin cần chọn khách hàng để gửi tin' }, { status: 400 });
      }
      targetUserId = receiverId;
      targetAdminId = senderId;
    } else {
      // Khách hàng gửi cho admin
      targetUserId = senderId;
      // Tìm admin ID chính thức (nếu có)
      const adminUser = await queryOne<any>("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
      targetAdminId = adminUser?.id || null;
    }

    // Lưu tin nhắn
    const result = await createChat({
      userId: targetUserId, // Đây là "session ID" của hội thoại
      adminId: targetAdminId,
      message: sanitizedMessage,
      isAdmin: isAdmin // Flag này xác định tin nhắn này của ai (true = của admin/ai, false = của khách)
    });

    // ✅ Gemini Auto-Reply - Chỉ khi KHÁCH gửi tin nhắn (không phải admin)
    // Và không có admin nào đang login để trả lời realtime (optional logic)
    let autoReplyMessage: any = null;
    if (!isAdmin && (process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY) && process.env.ENABLE_AUTO_REPLY === 'true') {
      try {
        autoReplyMessage = await generateAutoReply(sanitizedMessage, targetUserId);

        if (autoReplyMessage) {
          // Lưu AI reply
          await createChat({
            userId: targetUserId,
            adminId: targetAdminId,
            message: `🤖 ${autoReplyMessage}`,
            isAdmin: true, // Tin nhắn AI tính là phía Admin
          });
        }
      } catch (autoReplyError) {
        logger.warn('Auto-reply failed', { targetUserId, error: autoReplyError });
      }
    }

    return NextResponse.json({
      success: true,
      message: {
        id: result.id,
        userId: targetUserId,
        adminId: targetAdminId,
        message: sanitizedMessage,
        isAdmin,
        createdAt: result.createdAt
      }
    });

  } catch (error: any) {
    logger.error('Chat POST error', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    // ✅ FIX: Thêm rate limiting
    const { checkRateLimitAndRespond } = await import('@/lib/rate-limit');
    const rateLimitResponse = await checkRateLimitAndRespond(request, 30, 10, 'chat-get');
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const authUser = await verifyAuthUser(request);
    if (!authUser) {
      return NextResponse.json({ success: false, error: 'Vui lòng đăng nhập để xem tin nhắn' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const userIdParam = searchParams.get('userId');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    // Get current user_id
    const currentUserId = await getUserIdByEmail(authUser.email || '');

    if (!currentUserId) {
      return NextResponse.json({ success: false, error: 'User not found in database' }, { status: 404 });
    }

    // ✅ Check if admin - kiểm tra cả admin table và users.role
    const adminCheck = await query<any>(
      `SELECT a.id 
       FROM admin a
       WHERE a.user_id = ?
       UNION
       SELECT u.id
       FROM users u
       WHERE u.id = ? AND u.role = 'admin'`,
      [currentUserId, currentUserId]
    );
    const isAdmin = adminCheck.length > 0;

    // Get chats với pagination ở database level
    let chats;
    if (isAdmin) {
      // Admin có thể xem chat với user cụ thể hoặc tất cả
      if (userIdParam) {
        chats = await getChats(parseInt(userIdParam), currentUserId, limit, offset);
      } else {
        chats = await getChats(undefined, currentUserId, limit, offset);
      }
    } else {
      // User chỉ xem chat của mình với admin
      chats = await getChats(currentUserId, undefined, limit, offset);
    }

    // ✅ FIX: Thêm senderType cho client dễ phân biệt AI (bot) vs Admin vs User
    const paginatedChats = chats.map((chat: any) => {
      let senderType = 'user';
      let messageContent = chat.message || '';

      if (chat.is_admin) {
        if (messageContent.startsWith('🤖 ')) {
          senderType = 'ai';
          messageContent = messageContent.substring(2).trim(); // Remove icon
        } else {
          senderType = 'admin';
        }
      }

      return {
        ...chat,
        message: messageContent,
        senderType
      };
    });

    return NextResponse.json({
      success: true,
      messages: paginatedChats,
      pagination: {
        limit,
        offset,
        total: chats.length
      }
    });
  } catch (error: any) {
    logger.error('Chat GET error', error, { endpoint: '/api/chat' });
    return NextResponse.json({ success: false, error: error.message || 'Internal server error' }, { status: 500 });
  }
}

/**
 * ✅ NEW: Generate auto-reply using Gemini AI
 */
async function generateAutoReply(userMessage: string, userId: number): Promise<string | null> {
  try {
    const apiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    if (!apiKey) {
      return getSmartFallbackReply(userMessage);
    }

    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    // Lấy lịch sử chat gần đây để context
    let chatHistory = '';
    try {
      const recentChats = await getChats(userId, undefined, 5, 0);
      chatHistory = recentChats
        .slice(-5)
        .map(chat => `${chat.is_admin ? 'Admin' : 'Khách hàng'}: ${chat.message}`)
        .join('\n');
    } catch { chatHistory = ''; }

    // ✅ FIX: Wrap getProducts trong try-catch riêng để tránh crash toàn bộ
    let productsList = '';
    let popularProducts: any[] = [];
    try {
      const { getProducts } = await import('@/lib/database-mysql');
      popularProducts = await getProducts({ isActive: true, limit: 5 });
      productsList = popularProducts
        .map((p: any, i: number) => `${i + 1}. ${p.title} - ${p.price ? `${Number(p.price).toLocaleString('vi-VN')}đ` : 'Liên hệ'}${p.category ? ` (${p.category})` : ''}`)
        .join('\n');
    } catch (e) {
      logger.warn('Failed to load products for AI context', { error: e instanceof Error ? e.message : String(e) });
      productsList = 'Không tải được danh sách sản phẩm';
    }

    // Tìm sản phẩm được đề cập trong câu hỏi
    const mentionedProduct = findMentionedProduct(userMessage, popularProducts);

    const prompt = `Bạn là trợ lý AI chuyên nghiệp của website QtusDev Market - chuyên bán source code. Trả lời ngắn gọn, thân thiện, chuyên nghiệp bằng tiếng Việt (tối đa 150 từ).

Lịch sử chat: ${chatHistory || 'Chưa có'}

${mentionedProduct ? `SẢN PHẨM ĐƯỢC ĐỀ CẬP: ${mentionedProduct.title} - ${mentionedProduct.price ? `${Number(mentionedProduct.price).toLocaleString('vi-VN')}đ` : 'Liên hệ'} - ${mentionedProduct.description || ''}` : ''}

SẢN PHẨM HIỆN CÓ:
${productsList || 'Chưa có sản phẩm'}

Câu hỏi khách hàng: "${userMessage}"

Yêu cầu: Trả lời bằng tiếng Việt, ngắn gọn, thân thiện. Nếu không chắc → đề nghị liên hệ admin.`;

    const result = await model.generateContent(prompt);
    const response = result.response;
    const reply = response.text().trim();

    const sanitizedReply = sanitizeMessage(reply);
    if (!sanitizedReply || sanitizedReply.length === 0) {
      return getSmartFallbackReply(userMessage);
    }

    logger.info('Auto-reply generated', { userId, messageLength: sanitizedReply.length });
    return sanitizedReply;
  } catch (error: any) {
    logger.error('Gemini auto-reply error', { userId, error: error.message });
    // ✅ FIX: Trả lời thông minh thay vì "đang bảo trì"
    return getSmartFallbackReply(userMessage);
  }
}

/**
 * ✅ NEW: Smart fallback reply khi Gemini không hoạt động
 * Phân tích keyword trong tin nhắn để trả lời cơ bản
 */
function getSmartFallbackReply(message: string): string {
  const lower = message.toLowerCase();

  if (lower.includes('giá') || lower.includes('bao nhiêu') || lower.includes('ưu đãi') || lower.includes('khuyến mãi')) {
    return 'Giá hiển thị trên trang Sản phẩm. Cần tư vấn thêm? Admin sẽ hỗ trợ ngay!';
  }

  if (lower.includes('nạp') || lower.includes('thanh toán') || lower.includes('chuyển khoản')) {
    return 'Vào Dashboard → Nạp tiền → Chuyển khoản → Nhập mã giao dịch. Admin sẽ duyệt sớm nhất!';
  }

  if (lower.includes('rút') || lower.includes('rút tiền')) {
    return 'Vào Dashboard → Rút tiền, nhập ngân hàng + số tiền. Admin xử lý trong 24h.';
  }

  if (lower.includes('sản phẩm') || lower.includes('source') || lower.includes('code') || lower.includes('mã nguồn')) {
    return 'Xem sản phẩm tại trang Sản phẩm. Cần tư vấn? Admin hỗ trợ ngay!';
  }

  if (lower.includes('hỗ trợ') || lower.includes('giúp') || lower.includes('help')) {
    return 'Mô tả vấn đề cụ thể hơn nhé! Admin phản hồi trong 5-30 phút.';
  }

  if (lower.includes('bảo hành') || lower.includes('hoàn tiền') || lower.includes('chính sách')) {
    return 'Bảo hành trọn đời, cài đặt miễn phí, hoàn tiền 7 ngày. Xem chi tiết tại trang Chính sách.';
  }

  if (lower.includes('hi') || lower.includes('hello') || lower.includes('xin chào') || lower.includes('chào')) {
    return 'Xin chào! 👋 Bạn cần hỗ trợ gì? Tôi có thể giúp tìm sản phẩm, nạp tiền, hoặc giải đáp thắc mắc.';
  }

  return 'Tin nhắn đã ghi nhận! Admin phản hồi trong 5-30 phút. 🙏';
}

/**
 * ✅ NEW: Tìm sản phẩm được đề cập trong câu hỏi
 */
function findMentionedProduct(message: string, products: Product[]): Product | null {
  if (!products || products.length === 0) return null;

  const lowerMessage = message.toLowerCase();

  // Tìm sản phẩm có tên xuất hiện trong câu hỏi
  for (const product of products) {
    if (product.title) {
      const productTitle = product.title.toLowerCase();
      // Kiểm tra nếu tên sản phẩm hoặc từ khóa chính xuất hiện trong câu hỏi
      const titleWords = productTitle.split(/\s+/).filter((w: string) => w.length > 3);
      if (titleWords.some((word: string) => lowerMessage.includes(word)) || lowerMessage.includes(productTitle)) {
        return product;
      }
    }
  }

  return null;
}
