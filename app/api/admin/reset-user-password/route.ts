import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, validateRequest } from "@/lib/api-auth";
import { query } from "@/lib/database-mysql";
import bcrypt from "bcryptjs";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
    try {
        // Bảo vệ CSRF cho tác vụ nhạy cảm Admin
        const { csrfProtection } = await import('@/lib/csrf');
        const csrfCheck = csrfProtection(request);
        if (!csrfCheck.valid) {
            return NextResponse.json(
                { success: false, error: csrfCheck.error || 'CSRF validation failed' },
                { status: 403 }
            );
        }

        // Yêu cầu quyền Admin
        await requireAdmin(request);

        // Lấy Payload
        const body = await request.json();
        const validation = validateRequest(body, { required: ['userId', 'newPassword'] });

        if (!validation.valid) {
            return NextResponse.json(
                { success: false, error: validation.error || 'Missing fields' },
                { status: 400 }
            );
        }

        const { userId, newPassword } = validation.data as { userId: string, newPassword: string };

        // Validate password
        if (newPassword.length < 6) {
            return NextResponse.json(
                { success: false, error: 'Mật khẩu phải dài ít nhất 6 ký tự' },
                { status: 400 }
            );
        }

        // Hash mật khẩu mới
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        // Cập nhật CSDL
        let normalizedId = parseInt(userId);
        if (isNaN(normalizedId)) {
            // Trong trường hợp ID được Firebase render (chuỗi)
            const { getUserIdByEmailMySQL } = await import('@/lib/database-mysql');
            if (body.userEmail) {
                const mysqlId = await getUserIdByEmailMySQL(body.userEmail);
                if (mysqlId) normalizedId = mysqlId;
            }
        }

        await query(
            "UPDATE users SET password_hash = ? WHERE id = ?",
            [hashedPassword, normalizedId]
        );

        const { logger } = await import('@/lib/logger');
        logger.info(`Admin reset password for user`, { targetUserId: normalizedId });

        return NextResponse.json({
            success: true,
            message: "Cập nhật mật khẩu thành công"
        });
    } catch (error: any) {
        const { logger } = await import('@/lib/logger');
        logger.error("Admin reset user password error", error);
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}
