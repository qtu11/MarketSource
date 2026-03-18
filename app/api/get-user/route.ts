import { NextRequest, NextResponse } from 'next/server';
import { getUserByEmail, getUserIdByEmail } from '@/lib/database-mysql';
import { requireAuth, verifyFirebaseToken } from '@/lib/api-auth';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs'

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  let uid: string | null = null;
  try {
    // ✅ FIX: Thêm rate limiting
    const { checkRateLimitAndRespond } = await import('@/lib/rate-limit');
    const rateLimitResponse = await checkRateLimitAndRespond(request, 30, 10, 'get-user');
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    // Get uid from query param hoặc header
    const { searchParams } = new URL(request.url);
    uid = searchParams.get('uid') || request.headers.get('X-User-ID');

    if (!uid) {
      return NextResponse.json(
        { error: 'User ID (uid) is required' },
        { status: 400 }
      );
    }

    // Verify authentication (optional cho admin, required cho self-access)
    const authUser = await verifyFirebaseToken(request);

    // ✅ FIX: Dùng requireAdmin() thay vì check X-Admin-Auth header
    const { requireAdmin } = await import('@/lib/api-auth');
    const isAdmin = await requireAdmin(request).catch(() => false);

    if (!authUser && !isAdmin) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    if (authUser && !isAdmin && authUser.uid !== uid && authUser.email !== uid) {
      return NextResponse.json(
        { error: 'Unauthorized: Can only access your own data' },
        { status: 403 }
      );
    }

    // Fallback to PostgreSQL
    // uid có thể là email, numeric ID hoặc Firebase UID với prefix 'email_'
    let result = null;

    // Try as email first
    if (uid.includes('@')) {
      result = await getUserByEmail(uid);
    } else if (uid.startsWith('email_')) {
      // ✅ BUG #8 FIX: Firebase UID dạng 'email_<dbId>' được tạo bởi email auth fallback
      const numericPart = uid.replace('email_', '');
      const userIdNum = parseInt(numericPart);
      if (!isNaN(userIdNum)) {
        const { getUserById } = await import('@/lib/database-mysql');
        result = await getUserById(userIdNum);
      }
    } else {
      // Try as numeric ID
      const userIdNum = parseInt(uid);
      if (!isNaN(userIdNum)) {
        const { getUserById } = await import('@/lib/database-mysql');
        result = await getUserById(userIdNum);
      } else {
        // ✅ BUG #8 FIX: Firebase UID thuần (string dài) - thử tìm qua email nếu authUser đã biết email
        if (authUser?.email) {
          result = await getUserByEmail(authUser.email);
        }
      }
    }


    if (!result) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Convert to expected format
    return NextResponse.json({
      data: {
        uid: result.id.toString(),
        id: result.id,
        email: result.email,
        name: result.name,
        username: result.username,
        avatar_url: result.avatar_url,
        balance: result.balance ? parseFloat(String(result.balance)) : 0,
        role: result.role || 'user',
      },
      error: null
    });
  } catch (error: any) {
    logger.error('API get user error', error, { uid });

    if (error.message?.includes('Unauthorized')) {
      return NextResponse.json(
        { error: error.message },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: error.message || 'Failed to fetch user' },
      { status: 500 }
    );
  }
}
