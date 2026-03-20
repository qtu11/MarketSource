export const runtime = 'nodejs'

// /app/api/check-deposits-schema/route.ts
import { NextResponse, NextRequest } from "next/server";
import { query } from "@/lib/database-mysql";
import { requireAdmin } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  try {
    // ✅ BUG #2 FIX: Require admin to prevent database information disclosure
    await requireAdmin(request);

    // Kiểm tra schema của bảng deposits (MySQL)
    const columnsResult = await query<any>(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'deposits'
      ORDER BY ordinal_position;
    `);

    return NextResponse.json({
      success: true,
      columns: columnsResult,
      columnNames: columnsResult.map((r: any) => r.column_name),
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}
