import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { findValidPasswordResetToken, getUserByEmail } from "@/lib/database-mysql"
import { logger } from "@/lib/logger"

export const runtime = "nodejs"

/**
 * ✅ Verify OTP - Chỉ kiểm tra tính hợp lệ của mã OTP
 * Flow: Nhận { email, otp } → Tìm user → Kiểm tra OTP có đúng và còn hạn không
 */
const verifySchema = z.object({
    email: z.string().email('Email không hợp lệ'),
    otp: z.string().length(6, 'Mã OTP phải có 6 chữ số'),
});

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const validation = verifySchema.safeParse(body);

        if (!validation.success) {
            return NextResponse.json(
                { success: false, error: validation.error.errors[0]?.message || 'Dữ liệu không hợp lệ' },
                { status: 400 }
            );
        }

        let { email, otp } = validation.data;
        email = email.trim().toLowerCase();

        const user = await getUserByEmail(email);
        if (!user) {
            return NextResponse.json(
                { success: false, error: 'Email không tồn tại trong hệ thống.' },
                { status: 400 }
            );
        }

        const tokenRecord = await findValidPasswordResetToken(otp);

        if (!tokenRecord) {
            return NextResponse.json(
                { success: false, error: 'Mã OTP không hợp lệ hoặc đã hết hạn. Vui lòng thử lại.' },
                { status: 400 }
            );
        }

        if (tokenRecord.user_id !== user.id) {
            return NextResponse.json(
                { success: false, error: 'Mã OTP không khớp với email này.' },
                { status: 400 }
            );
        }

        return NextResponse.json({
            success: true,
            message: 'Mã OTP hợp lệ.',
        });
    } catch (error: any) {
        logger.error('Verify OTP API error', error, { endpoint: '/api/verify-otp' });
        return NextResponse.json(
            { success: false, error: error.message || 'Không thể xác minh OTP. Vui lòng thử lại.' },
            { status: 500 }
        );
    }
}
