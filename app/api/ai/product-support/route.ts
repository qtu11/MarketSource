import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/api-auth';
import { getProducts, getProductById } from '@/lib/database-mysql';
import { logger } from '@/lib/logger';
import { z } from 'zod';

export const runtime = 'nodejs'

const supportSchema = z.object({
  question: z.string().min(1).max(1000),
  productId: z.number().int().positive().optional(),
  productName: z.string().optional(),
});

/**
 * POST /api/ai/product-support
 * AI hỗ trợ trả lời câu hỏi về sản phẩm
 */
export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const { checkRateLimitAndRespond } = await import('@/lib/rate-limit');
    const rateLimitResponse = await checkRateLimitAndRespond(request, 10, 60, 'ai-product-support');
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    // Optional authentication (có thể cho phép cả user chưa đăng nhập)
    const authUser = await verifyFirebaseToken(request).catch(() => null);

    const body = await request.json();
    const validation = supportSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({
        success: false,
        error: validation.error.errors[0]?.message || 'Dữ liệu không hợp lệ'
      }, { status: 400 });
    }

    const { question, productId, productName } = validation.data;

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({
        success: false,
        error: 'AI service not configured. Please set GEMINI_API_KEY in environment variables.'
      }, { status: 503 });
    }

    // Lấy thông tin sản phẩm nếu có
    let productInfo = null;
    if (productId) {
      productInfo = await getProductById(productId);
    } else if (productName) {
      // Tìm sản phẩm theo tên
      const products = await getProducts({ limit: 10 });
      productInfo = products.find(p =>
        p.title?.toLowerCase().includes(productName.toLowerCase())
      );
    }

    // Generate AI response với thông tin sản phẩm
    const aiResponse = await generateProductSupportResponse(question, productInfo);

    return NextResponse.json({
      success: true,
      answer: aiResponse.answer,
      product: productInfo ? {
        id: productInfo.id,
        title: productInfo.title,
        price: productInfo.price,
        category: productInfo.category
      } : null,
      suggestions: aiResponse.suggestions || []
    });
  } catch (error: any) {
    logger.error('AI Product Support error', error, { endpoint: '/api/ai/product-support' });
    return NextResponse.json({
      success: false,
      error: error.message || 'Internal server error'
    }, { status: 500 });
  }
}

/**
 * Generate AI response với thông tin sản phẩm
 */
async function generateProductSupportResponse(
  question: string,
  productInfo: any
): Promise<{ answer: string; suggestions?: string[] }> {
  try {
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const apiKey = process.env.GEMINI_API_KEY;
    const genAI = new GoogleGenerativeAI(apiKey!);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    // Lấy danh sách sản phẩm phổ biến để suggest
    const popularProducts = await getProducts({ limit: 5 });

    // Build product context
    let productContext = '';
    if (productInfo) {
      productContext = `
THÔNG TIN SẢN PHẨM:
- Tên: ${productInfo.title || 'N/A'}
- Mô tả: ${productInfo.description || 'Chưa có mô tả'}
- Giá: ${productInfo.price ? `${productInfo.price.toLocaleString('vi-VN')}đ` : 'Liên hệ'}
- Danh mục: ${productInfo.category || 'N/A'}
- Trạng thái: ${productInfo.is_active ? 'Đang bán' : 'Tạm ngừng'}
${productInfo.tags ? `- Tags: ${Array.isArray(productInfo.tags) ? productInfo.tags.join(', ') : productInfo.tags}` : ''}
${productInfo.demo_url ? `- Demo: ${productInfo.demo_url}` : ''}
`;
    }

    const popularProductsList = popularProducts
      .slice(0, 5)
      .map((p, i) => `${i + 1}. ${p.title} - ${p.price ? `${p.price.toLocaleString('vi-VN')}đ` : 'Liên hệ'}`)
      .join('\n');

    const prompt = `Bạn là trợ lý AI chuyên nghiệp của một website bán source code. Nhiệm vụ của bạn là trả lời câu hỏi của khách hàng về sản phẩm một cách chính xác, thân thiện và hữu ích.

${productContext ? `THÔNG TIN SẢN PHẨM ĐƯỢC HỎI:\n${productContext}` : 'Khách hàng chưa chỉ định sản phẩm cụ thể.'}

SẢN PHẨM PHỔ BIẾN HIỆN CÓ:
${popularProductsList || 'Chưa có sản phẩm'}

CÂU HỎI CỦA KHÁCH HÀNG: "${question}"

YÊU CẦU TRẢ LỜI:
1. Trả lời bằng tiếng Việt, thân thiện và chuyên nghiệp
2. Nếu có thông tin sản phẩm, hãy sử dụng thông tin đó để trả lời chính xác
3. Nếu không có thông tin sản phẩm, hãy gợi ý các sản phẩm phù hợp từ danh sách trên
4. Ngắn gọn, rõ ràng (tối đa 300 từ)
5. Nếu câu hỏi về giá, hãy đề cập đến giá trong thông tin sản phẩm
6. Nếu câu hỏi về tính năng, hãy dựa vào mô tả sản phẩm
7. Nếu không chắc chắn, hãy đề nghị khách hàng liên hệ admin qua chat
8. Không tự ý hứa hẹn về thời gian giao hàng, hỗ trợ nếu không chắc chắn

Trả lời theo format JSON:
{
  "answer": "Câu trả lời chi tiết",
  "suggestions": ["Gợi ý 1", "Gợi ý 2"] (tùy chọn, chỉ khi phù hợp)
}`;

    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text().trim();

    // Parse JSON response
    try {
      // Extract JSON from markdown code blocks if present
      const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/```\s*([\s\S]*?)\s*```/);
      const jsonText = jsonMatch ? jsonMatch[1] : text;
      const parsed = JSON.parse(jsonText);

      return {
        answer: parsed.answer || text,
        suggestions: parsed.suggestions || []
      };
    } catch {
      // If not JSON, return as plain text answer
      return {
        answer: text,
        suggestions: []
      };
    }
  } catch (error) {
    logger.error('Gemini product support error', error);
    return {
      answer: 'Xin lỗi, tôi không thể trả lời câu hỏi này lúc này. Vui lòng liên hệ admin qua chat để được hỗ trợ.',
      suggestions: []
    };
  }
}
