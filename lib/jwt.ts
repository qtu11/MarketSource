import { SignJWT, jwtVerify } from 'jose';

let cachedSecret: Uint8Array | null = null;
let cachedSecretKey: string | null = null;

function getSecret(): Uint8Array {
  const secretKey = process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET;

  if (!secretKey || secretKey.length < 32) {
    throw new Error(
      'JWT_SECRET or NEXTAUTH_SECRET must be set in environment variables and must be at least 32 characters long.'
    );
  }

  if (!cachedSecret || cachedSecretKey !== secretKey) {
    cachedSecretKey = secretKey;
    cachedSecret = new TextEncoder().encode(secretKey);
  }

  return cachedSecret;
}

/**
 * Tạo admin JWT token
 */
export async function createAdminToken(userId: string, email: string): Promise<string> {
  const token = await new SignJWT({ userId, email, role: 'admin' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(getSecret());

  return token;
}

// In-memory blacklist for admin tokens
export const adminTokenBlacklist = new Set<string>();

/**
 * Invalidate an admin token (e.g., on logout)
 */
export function invalidateAdminToken(token: string) {
  adminTokenBlacklist.add(token);
  // Auto-cleanup after 24h
  setTimeout(() => adminTokenBlacklist.delete(token), 1000 * 60 * 60 * 24);
}

/**
 * Verify admin JWT token
 */
export async function verifyAdminToken(token: string): Promise<{ userId: string; email: string; role: string } | null> {
  if (adminTokenBlacklist.has(token)) {
    return null;
  }
  try {
    const { payload } = await jwtVerify(token, getSecret());
    
    return {
      userId: payload.userId as string,
      email: payload.email as string,
      role: payload.role as string,
    };
  } catch (error) {
    return null;
  }
}

/**
 * Verify generic JWT token (cho cả user thường và admin)
 * Được sử dụng bởi /api/save-user để verify auth-token cookie
 */
export async function verifyToken(token: string): Promise<{ userId: string; email: string; role: string } | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    
    return {
      userId: payload.userId as string,
      email: payload.email as string,
      role: (payload.role as string) || 'user',
    };
  } catch (error) {
    return null;
  }
}

