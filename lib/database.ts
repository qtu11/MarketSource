/**
 * ============================================================
 * DATABASE CONFIGURATION — PostgreSQL ONLY
 *
 * ✅ Driver:   pg (node-postgres)
 * ❌ Không sử dụng: MySQL / mysql2
 *
 * Connection hierarchy:
 *   1. DATABASE_URL (Supabase, Vercel, production)
 *   2. NETLIFY_DATABASE_URL (Netlify specific)
 *   3. DB_HOST + DB_USER + DB_PASSWORD + DB_NAME (self-hosted)
 *
 * Ports:
 *   - 5432: Direct connection
 *   - 6543: Session Pooler (IPv4 compatibility)
 * ============================================================
 */
import { randomInt } from 'crypto';
import { Pool, PoolClient } from 'pg';
import { logger } from './logger';

// ✅ FIX: Detect Netlify environment (Netlify sets NETLIFY=true during build, CONTEXT during runtime)
const isNetlify = process.env.NETLIFY === 'true' ||
  process.env.CONTEXT === 'production' ||
  process.env.CONTEXT === 'deploy-preview' ||
  process.env.NETLIFY_DEV === 'true';

const shouldSkipDbTest =
  process.env.SKIP_DB_CHECK === 'true' ||
  isNetlify ||
  process.env.VERCEL === '1';

const isNextBuildPhase =
  typeof process.env.NEXT_PHASE === 'string' &&
  process.env.NEXT_PHASE.startsWith('phase-');

const isStaticExportPhase = process.env.NEXT_PHASE === 'phase-export';
const isBuildTime = isNextBuildPhase || isStaticExportPhase || process.env.DOCKER_BUILD === 'true';

// Detect serverless environment
const isServerless = isNetlify || process.env.VERCEL === '1' || process.env.AWS_LAMBDA_FUNCTION_NAME;

// Validate database connection config
function validateDatabaseConfig() {
  const hasDatabaseUrl = !!(
    process.env.DATABASE_URL ||
    process.env.NETLIFY_DATABASE_URL
  );

  const hasDbVars = !!(
    process.env.DB_HOST &&
    process.env.DB_USER &&
    process.env.DB_PASSWORD
  );

  if (!hasDatabaseUrl && !hasDbVars) {
    if (isServerless || shouldSkipDbTest || isBuildTime) {
      logger.warn('Database configuration missing (build/serverless environment)');
      return false;
    }
    throw new Error(
      'Database configuration required. Either set:\n' +
      '  1. DATABASE_URL (or NETLIFY_DATABASE_URL), or\n' +
      '  2. DB_HOST, DB_USER, DB_PASSWORD, DB_NAME'
    );
  }
  return true;
}

// Serverless: giảm max connections, tăng timeout
const poolConfig = isServerless
  ? {
    max: 1, // Serverless chỉ cần 1 connection per function instance
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 20000, // Tăng timeout cho serverless (20s)
    allowExitOnIdle: true, // Cho phép exit khi idle (serverless)
  }
  : {
    max: 20, // Traditional server: nhiều connections
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 20000, // Tăng timeout cho dev cục bộ (20s)
  };

// PostgreSQL Connection Pool với fallback
function createPool(): Pool | null {
  // Validate config trước
  const hasValidConfig = validateDatabaseConfig();
  if (!hasValidConfig) {
    return null;
  }

  // ✅ FIX: Ưu tiên DATABASE_URL, POSTGRES_URL hoặc NETLIFY_DATABASE_URL
  let databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.NETLIFY_DATABASE_URL;

  // ✅ FIX IPv4: Tự động chuyển sang Session Pooler (port 6543) nếu port 5432 - Đã vô hiệu hóa để dùng đúng URL
  // if (databaseUrl && databaseUrl.includes(':5432/') && !databaseUrl.includes('pgbouncer=true')) {
  //   // Thử chuyển sang Session Pooler cho IPv4 compatibility
  //   databaseUrl = databaseUrl.replace(':5432/', ':6543/');
  //   if (!databaseUrl.includes('?')) {
  //     databaseUrl += '?pgbouncer=true';
  //   } else {
  //     databaseUrl += '&pgbouncer=true';
  //   }
  //   logger.info('Auto-switched to Session Pooler (port 6543) for IPv4 compatibility');
  // }

  if (databaseUrl) {
    try {
      const pool = new Pool({
        connectionString: databaseUrl,
        ...poolConfig,
        // ✅ SSL: bật SSL mặc định (phù hợp Supabase / managed Postgres yêu cầu SSL)
        // Có thể tắt bằng cách đặt DB_SSL=disable trong env nếu dùng Postgres local không SSL
        ssl: process.env.DB_SSL === 'disable'
          ? undefined
          : {
            // ✅ FIX: Một số provider (Supabase/Neon) cần rejectUnauthorized: false trên Vercel/Cloudflare
            // trừ khi người dùng cấu hình CA cert thủ công.
            // Nếu không có DB_SSL_STRICT=true, sẽ mặc định là false để tránh lỗi SELF_SIGNED_CERT_IN_CHAIN.
            rejectUnauthorized: process.env.DB_SSL_STRICT === 'true',
          },
      });

      if (shouldSkipDbTest) {
        logger.info('Skipping PostgreSQL connection test via DATABASE_URL (build environment)', {
          isNetlify,
          hasNetlifyDatabaseUrl: !!process.env.NETLIFY_DATABASE_URL
        });
      } else {
        // Test connection async (không block)
        pool
          .query('SELECT NOW()')
          .then(() => {
            logger.info('PostgreSQL connection successful via DATABASE_URL', {
              isNetlify,
              hasNetlifyDatabaseUrl: !!process.env.NETLIFY_DATABASE_URL,
              usingPooler: databaseUrl.includes('6543')
            });
          })
          .catch((err) => {
            logger.warn('DATABASE_URL connection test failed', {
              error: err.message,
              isNetlify,
              code: (err as any)?.code
            });
          });
      }

      return pool;
    } catch (error: any) {
      logger.warn('Failed to parse DATABASE_URL, using individual variables', {
        error: error.message,
        isNetlify
      });
    }
  }

  // Fallback: dùng các biến riêng lẻ
  // ✅ SECURITY FIX: Bắt buộc env vars, không dùng hardcoded values
  if (!process.env.DB_PASSWORD || !process.env.DB_HOST || !process.env.DB_USER) {
    throw new Error('DB_PASSWORD, DB_HOST, and DB_USER environment variables are required. Please set them in your .env file.');
  }

  // ✅ FIX: Chỉ auto-switch port 6543 nếu KHÔNG phải môi trường production hoặc được yêu cầu
  let dbPort = parseInt(process.env.DB_PORT || '5432');
  if (dbPort === 5432 && process.env.NODE_ENV !== 'production' && process.env.AUTO_SWITCH_PORT !== 'false') {
    dbPort = 6543; // Auto-switch to Session Pooler for IPv4 compatibility (mostly for local dev)
    logger.info('Auto-switched DB_PORT to 6543 (Session Pooler) for IPv4 compatibility');
  }

  const config: any = {
    host: process.env.DB_HOST,
    database: process.env.DB_NAME || 'postgres',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD, // Bắt buộc, không có fallback
    port: dbPort,
    ...poolConfig,
    // ✅ SSL fallback: tương tự nhánh DATABASE_URL
    ssl: process.env.DB_SSL === 'disable'
      ? undefined
      : {
        // ✅ FIX: Một số provider (Supabase/Neon) cần rejectUnauthorized: false
        rejectUnauthorized: process.env.DB_SSL_STRICT === 'true',
      },
  };

  logger.info('Using PostgreSQL connection (fallback)', {
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
  });

  const pool = new Pool(config);

  if (shouldSkipDbTest) {
    logger.info('Skipping PostgreSQL connection test via discrete env vars (build environment)');
  } else {
    // Test connection async (không block)
    pool
      .query('SELECT NOW()')
      .then(() => {
        logger.info('PostgreSQL connection successful via individual variables');
      })
      .catch((err) => {
        logger.error('PostgreSQL connection failed', err, {
          host: config.host,
          port: config.port,
          database: config.database,
          user: config.user,
        });
      });
  }

  return pool;
}

// ✅ FIX: Lưu trữ connection pool vào biến globalThis để tránh rò rỉ kết nối khi Hot-Reload trong môi trường Dev (gây lỗi 500 Timeout)
const globalForDb = global as unknown as {
  poolInstance: Pool | null;
};

let poolInstance: Pool | null = globalForDb.poolInstance || null;

function getPoolInstance(): Pool | null {
  if (!poolInstance) {
    try {
      poolInstance = createPool();
      if (process.env.NODE_ENV !== 'production') {
        globalForDb.poolInstance = poolInstance;
      }
      // Error handler - chỉ thêm nếu poolInstance không null
      if (poolInstance) {
        poolInstance.on('error', (err) => {
          logger.error('Unexpected error on idle PostgreSQL client', err, {
            hasDatabaseUrl: !!(process.env.DATABASE_URL || process.env.NETLIFY_DATABASE_URL),
            host: process.env.DB_HOST || 'localhost',
            port: process.env.DB_PORT || '5433',
            database: process.env.DB_NAME || 'qtusdevmarket',
            isServerless,
            isNetlify,
            errorCode: (err as any)?.code,
            errorMessage: err.message,
          });

          // Reset pool instance on error để tạo lại connection
          // (quan trọng cho serverless environment)
          if (isServerless) {
            poolInstance = null;
          }
        });

        // ✅ FIX: Test connection ngay sau khi tạo pool (chỉ trong serverless)
        if (isServerless) {
          poolInstance.query('SELECT 1')
            .then(() => {
              logger.info('Database pool connection test successful (serverless)', {
                isNetlify,
                hasNetlifyDatabaseUrl: !!process.env.NETLIFY_DATABASE_URL
              });
            })
            .catch((err) => {
              logger.warn('Database pool connection test failed (serverless)', {
                error: err.message,
                code: (err as any)?.code,
                isNetlify,
                hasNetlifyDatabaseUrl: !!process.env.NETLIFY_DATABASE_URL
              });
              // Reset pool nếu test fail
              poolInstance = null;
            });
        }
      }
    } catch (error: unknown) {
      // ✅ FIX: Trong serverless, không throw error mà return null để handle gracefully
      if (isServerless) {
        logger.warn('Database pool creation failed in serverless environment', {
          error: error instanceof Error ? error.message : String(error),
          code: (error as any)?.code,
        });
        return null;
      }
      // Nếu không phải serverless, throw error như bình thường
      logger.error('Failed to create database pool', error as Error);
      throw error;
    }
  }
  return poolInstance;
}

/**
 * Executes a function within a database transaction.
 * @param fn The function to execute. It receives a connected PoolClient.
 */
export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Transaction failed, rolled back', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Atomically updates user balance with validation.
 * ✅ FIX: Uses SQL arithmetic (balance + $1) instead of JS float math
 * to prevent DECIMAL precision loss.
 */
export async function updateBalance(
  userId: number,
  amount: number,
  type: 'increase' | 'decrease',
  client?: PoolClient
): Promise<{ success: boolean; newBalance: number }> {
  const poolOrClient = client || pool;

  try {
    if (!Number.isFinite(amount) || amount < 0) {
      throw new Error('Invalid amount');
    }

    // Một câu UPDATE atomic — tránh TOCTOU giữa SELECT và UPDATE khi không có FOR UPDATE
    if (type === 'increase') {
      const updateResult = await poolOrClient.query(
        'UPDATE users SET balance = balance + $1::numeric, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING balance',
        [amount, userId]
      );
      if (updateResult.rows.length === 0) {
        throw new Error('User not found');
      }
      const newBalance = parseFloat(updateResult.rows[0].balance);
      return { success: true, newBalance };
    }

    const updateResult = await poolOrClient.query(
      'UPDATE users SET balance = balance - $1::numeric, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND balance >= $1::numeric RETURNING balance',
      [amount, userId]
    );
    if (updateResult.rows.length > 0) {
      const newBalance = parseFloat(updateResult.rows[0].balance);
      return { success: true, newBalance };
    }

    const exists = await poolOrClient.query('SELECT balance FROM users WHERE id = $1', [userId]);
    if (exists.rows.length === 0) {
      throw new Error('User not found');
    }
    const currentBalance = parseFloat(exists.rows[0].balance || '0');
    throw new Error(`Insufficient balance. Current: ${currentBalance}, Required: ${amount}`);
  } catch (error) {
    logger.error('Error updating balance', error, { userId, amount, type });
    throw error;
  }
}

// Helper function để retry query với exponential backoff
export async function queryWithRetry<T = any>(
  queryText: string,
  params?: any[],
  maxRetries: number = 3
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const result = await pool.query(queryText, params);
      return result as T;
    } catch (error: any) {
      lastError = error;

      // Không retry nếu là lỗi syntax hoặc validation
      if (error.code === '42601' || error.code === '42703' || error.code === '42P01') {
        throw error;
      }

      // Retry với exponential backoff
      if (attempt < maxRetries - 1) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
        logger.warn(`Query failed, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`, {
          error: error.message,
          code: error.code,
        });
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new Error('Query failed after retries');
}

const QUERY_TIMEOUT_MS = 30000; // 30 seconds

export async function query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  try {
    // ✅ FIX: Add timeout to prevent hanging queries
    const result = await Promise.race([
      pool.query(sql, params),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Query timeout after ${QUERY_TIMEOUT_MS}ms: ${sql.substring(0, 50)}...`)),
          QUERY_TIMEOUT_MS
        )
      )
    ]);
    return result.rows as T[];
  } catch (error: any) {
    logger.error('PostgreSQL query error', error, { sql: sql.substring(0, 100) });
    throw error;
  }
}

/**
 * Executes a query and returns the first row.
 */
export async function queryOne<T = any>(sql: string, params: any[] = []): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] || null;
}

export const pool = new Proxy({} as Pool, {
  get(_target, prop, _receiver) {
    const instance = getPoolInstance();
    if (!instance) {
      // ✅ FIX: Nếu pool instance là null (database connection fail), throw error với message rõ ràng
      throw new Error('Database connection failed. Please check environment variables. Pool instance is null.');
    }
    const value = (instance as any)[prop];
    if (typeof value === 'function') {
      return value.bind(instance);
    }
    return value;
  },
}) as Pool;

export function getPool(): Pool {
  const instance = getPoolInstance();
  if (!instance) {
    throw new Error('Database connection failed. Please check environment variables.');
  }
  return instance;
}

// ============================================================
// PROFILE TABLE HELPERS
// ============================================================

type UserProfileRow = {
  id: number;
  user_id: number;
  phone: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  postal_code: string | null;
  social_links: Record<string, string> | null;
  two_factor_enabled: boolean;
  two_factor_secret: string | null;
  two_factor_backup_codes: string[] | null;
  created_at: Date;
  updated_at: Date;
};

type UserProfilePayload = {
  userId: number;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  postalCode?: string | null;
  socialLinks?: Record<string, string | null> | null;
  twoFactorEnabled?: boolean;
  twoFactorSecret?: string | null;
  twoFactorBackupCodes?: string[] | null;
};

let ensureUserProfilesTablePromise: Promise<void> | null = null;
let isEnsuringTable = false;

const ensureUserProfilesTable = async () => {
  // Skip database operations during build time
  if (shouldSkipDbTest) {
    return;
  }

  // Prevent multiple concurrent executions
  if (isEnsuringTable && ensureUserProfilesTablePromise) {
    return ensureUserProfilesTablePromise;
  }

  isEnsuringTable = true;
  ensureUserProfilesTablePromise = (async () => {
    try {
      // Use IF NOT EXISTS to prevent race conditions
      await pool.query(`
      CREATE TABLE IF NOT EXISTS user_profiles (
        id SERIAL PRIMARY KEY,
        user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        phone VARCHAR(50),
        address TEXT,
        city VARCHAR(120),
        country VARCHAR(120),
        postal_code VARCHAR(32),
        social_links JSONB,
        two_factor_enabled BOOLEAN DEFAULT FALSE,
        two_factor_secret TEXT,
        two_factor_backup_codes TEXT[],
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

      // Use IF NOT EXISTS for index to prevent duplicate key errors
      await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id ON user_profiles(user_id);
    `);
    } catch (error: any) {
      // Ignore duplicate key errors during concurrent table creation
      // Also ignore network errors during build time
      if (
        error?.code !== '23505' &&
        error?.code !== '42P07' &&
        error?.code !== 'ENETUNREACH' &&
        !error?.message?.includes('already exists') &&
        !error?.message?.includes('ENETUNREACH')
      ) {
        logger.error('Failed to ensure user_profiles table', error);
      }
    } finally {
      isEnsuringTable = false;
    }
  })();

  return ensureUserProfilesTablePromise;
};

// ============================================================
// USER FUNCTIONS
// ============================================================

export async function getUserById(userId: number) {
  try {
    const instance = getPool();
    const result = await instance.query(
      'SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL',
      [userId]
    );
    return result.rows[0] || null;
  } catch (error) {
    logger.error('Error getting user by ID', error, { userId });
    throw error;
  }
}

export async function getUserByEmail(email: string) {
  try {
    const instance = getPool();
    const result = await instance.query(
      'SELECT * FROM users WHERE email = $1 AND deleted_at IS NULL',
      [email]
    );
    return result.rows[0] || null;
  } catch (error) {
    logger.error('Error getting user by email', error, { email });
    throw error;
  }
}

export async function getUserIdByEmail(email: string): Promise<number | null> {
  try {
    const instance = getPool();
    const result = await instance.query(
      'SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL',
      [email]
    );
    if (result.rows.length === 0) return null;
    const raw = result.rows[0].id;
    const id = typeof raw === 'number' ? raw : Number(raw);
    return Number.isFinite(id) && id > 0 ? id : null;
  } catch (error) {
    logger.error('Error getting user ID by email', error, { email });
    return null;
  }
}

/**
 * Tạo hoặc cập nhật user trong PostgreSQL
 * Lưu đầy đủ thông tin: name, email, avatar_url, ip_address, role
 */
export async function createOrUpdateUser(userData: {
  email: string;
  name?: string;
  username?: string;
  passwordHash?: string;
  avatarUrl?: string;
  ipAddress?: string;
  role?: 'user' | 'admin';
  /** OAuth: email đã được provider xác minh */
  markEmailVerified?: boolean;
  emailVerificationToken?: string | null;
  emailVerificationExpires?: Date | null;
}) {
  try {
    // Kiểm tra user đã tồn tại chưa
    const existingUser = await getUserByEmail(userData.email);

    if (existingUser) {
      // Update existing user
      const updates: string[] = [];
      const params: any[] = [userData.email];
      let paramIndex = 2;

      if (userData.name !== undefined) {
        updates.push(`name = $${paramIndex}`);
        params.push(userData.name);
        paramIndex++;
      }

      if (userData.username !== undefined) {
        updates.push(`username = $${paramIndex}`);
        params.push(userData.username);
        paramIndex++;
      }

      if (userData.avatarUrl !== undefined) {
        updates.push(`avatar_url = $${paramIndex}`);
        params.push(userData.avatarUrl);
        paramIndex++;
      }

      if (userData.ipAddress !== undefined) {
        updates.push(`ip_address = $${paramIndex}`);
        params.push(userData.ipAddress);
        paramIndex++;
      }

      if (userData.role !== undefined) {
        updates.push(`role = $${paramIndex}`);
        params.push(userData.role);
        paramIndex++;
      }

      if (userData.passwordHash !== undefined) {
        updates.push(`password_hash = $${paramIndex}`);
        params.push(userData.passwordHash);
        paramIndex++;
      }

      if (userData.markEmailVerified) {
        updates.push(`email_verified_at = CURRENT_TIMESTAMP`);
        updates.push(`email_verification_token = NULL`);
        updates.push(`email_verification_expires = NULL`);
      }

      // Luôn cập nhật updated_at
      updates.push('updated_at = CURRENT_TIMESTAMP');

      if (updates.length > 1) { // Có ít nhất 1 update + updated_at
        await pool.query(
          `UPDATE users SET ${updates.join(', ')} WHERE email = $1`,
          params
        );
      }

      return { id: existingUser.id, isNew: false };
    } else {
      // ✅ FIX: Tạo user mới với xử lý duplicate username
      let finalUsername = userData.username || userData.name || `user_${Date.now()}`;

      // Check và generate unique username nếu trùng
      if (userData.username) {
        let usernameExists = true;
        let attemptCount = 0;
        const maxAttempts = 10;

        while (usernameExists && attemptCount < maxAttempts) {
          const checkResult = await pool.query(
            'SELECT id FROM users WHERE username = $1',
            [finalUsername]
          );

          if (checkResult.rows.length === 0) {
            usernameExists = false;
          } else {
            // Generate unique username bằng cách thêm số
            finalUsername = `${userData.username}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
            attemptCount++;
          }
        }

        if (usernameExists) {
          // Nếu vẫn trùng sau nhiều lần thử, dùng email làm username
          finalUsername = userData.email.split('@')[0] + `_${Date.now()}`;
        }
      }

      const markV = Boolean(userData.markEmailVerified);
      const evAt = markV ? new Date() : null;
      const evTok =
        !markV && userData.emailVerificationToken
          ? userData.emailVerificationToken
          : null;
      const evExp =
        !markV && userData.emailVerificationExpires
          ? userData.emailVerificationExpires
          : null;

      // Tạo user mới
      const result = await pool.query(
        `INSERT INTO users (
          email, name, username, password_hash, avatar_url, ip_address, role,
          email_verified_at, email_verification_token, email_verification_expires,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id`,
        [
          userData.email,
          userData.name || finalUsername || null,
          finalUsername,
          userData.passwordHash || null,
          userData.avatarUrl || null,
          userData.ipAddress || null,
          userData.role || 'user',
          evAt,
          evTok,
          evExp,
        ]
      );

      if (!result.rows || result.rows.length === 0 || !result.rows[0].id) {
        throw new Error('Failed to create user: No ID returned');
      }

      return { id: result.rows[0].id, isNew: true };
    }
  } catch (error) {
    logger.error('Error creating/updating user', error, { email: userData.email });
    throw error;
  }
}

async function ensureUserProfilesTableReady() {
  await ensureUserProfilesTable();
}

export async function getUserProfileByUserId(userId: number): Promise<UserProfileRow | null> {
  await ensureUserProfilesTableReady();
  const result = await pool.query('SELECT * FROM user_profiles WHERE user_id = $1', [userId]);
  return result.rows[0] || null;
}

export async function getUserProfileByEmail(email: string): Promise<UserProfileRow | null> {
  const user = await getUserByEmail(email);
  if (!user) {
    return null;
  }
  return getUserProfileByUserId(user.id);
}

export async function upsertUserProfile(profile: UserProfilePayload): Promise<UserProfileRow> {
  await ensureUserProfilesTableReady();
  const payload = {
    phone: profile.phone ?? null,
    address: profile.address ?? null,
    city: profile.city ?? null,
    country: profile.country ?? null,
    postalCode: profile.postalCode ?? null,
    socialLinks: profile.socialLinks ? JSON.stringify(profile.socialLinks) : null,
    twoFactor: profile.twoFactorEnabled ?? false,
    twoFactorSecret: profile.twoFactorSecret ?? null,
    twoFactorBackupCodes: profile.twoFactorBackupCodes ?? null,
  };

  const result = await pool.query(
    `
      INSERT INTO user_profiles (
        user_id,
        phone,
        address,
        city,
        country,
        postal_code,
        social_links,
        two_factor_enabled,
        two_factor_secret,
        two_factor_backup_codes,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, CURRENT_TIMESTAMP)
      ON CONFLICT (user_id) DO UPDATE SET
        phone = EXCLUDED.phone,
        address = EXCLUDED.address,
        city = EXCLUDED.city,
        country = EXCLUDED.country,
        postal_code = EXCLUDED.postal_code,
        social_links = EXCLUDED.social_links,
        two_factor_enabled = EXCLUDED.two_factor_enabled,
        two_factor_secret = EXCLUDED.two_factor_secret,
        two_factor_backup_codes = EXCLUDED.two_factor_backup_codes,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *;
    `,
    [
      profile.userId,
      payload.phone,
      payload.address,
      payload.city,
      payload.country,
      payload.postalCode,
      payload.socialLinks,
      payload.twoFactor,
      payload.twoFactorSecret,
      payload.twoFactorBackupCodes,
    ]
  );

  return result.rows[0];
}

export async function saveUserTwoFactorSecret(
  userId: number,
  secret: string,
  backupCodes: string[]
): Promise<void> {
  await ensureUserProfilesTableReady();
  await pool.query(
    `
      INSERT INTO user_profiles (user_id, two_factor_enabled, two_factor_secret, two_factor_backup_codes, updated_at)
      VALUES ($1, TRUE, $2, $3, CURRENT_TIMESTAMP)
      ON CONFLICT (user_id) DO UPDATE SET
        two_factor_enabled = TRUE,
        two_factor_secret = $2,
        two_factor_backup_codes = $3,
        updated_at = CURRENT_TIMESTAMP
    `,
    [userId, secret, backupCodes]
  );
}

export async function disableUserTwoFactor(userId: number): Promise<void> {
  await ensureUserProfilesTableReady();
  await pool.query(
    `
      INSERT INTO user_profiles (user_id, two_factor_enabled, two_factor_secret, two_factor_backup_codes, updated_at)
      VALUES ($1, FALSE, NULL, NULL, CURRENT_TIMESTAMP)
      ON CONFLICT (user_id) DO UPDATE SET
        two_factor_enabled = FALSE,
        two_factor_secret = NULL,
        two_factor_backup_codes = NULL,
        updated_at = CURRENT_TIMESTAMP
    `,
    [userId]
  );
}

/**
 * Normalize user ID: Convert Firebase UID (string), Email, or Username to PostgreSQL ID (number)
 */
export async function normalizeUserId(
  firebaseUidOrEmail: string | number,
  userEmail?: string
): Promise<number | null> {
  try {
    if (typeof firebaseUidOrEmail === 'number') return firebaseUidOrEmail;

    const str = String(firebaseUidOrEmail);
    const emailToSearch =
      typeof firebaseUidOrEmail === 'string' && firebaseUidOrEmail.includes('@')
        ? firebaseUidOrEmail.trim() || null
        : userEmail?.trim() || null;

    let numericId: number | null = null;
    const digitsOnly = str.trim();
    // Chỉ coi chuỗi toàn số là `users.id` nếu vừa PostgreSQL int4. UID Firebase dạng số (vd. 117…)
    // không được đưa vào $3::int — sẽ lỗi "out of range for type integer".
    const PG_INT4_MAX = 2147483647;
    if (/^\d+$/.test(digitsOnly)) {
      try {
        const bi = BigInt(digitsOnly);
        if (bi > 0n && bi <= BigInt(PG_INT4_MAX)) {
          numericId = Number(bi);
        }
      } catch {
        /* ignore invalid bigint */
      }
    }

    // Một round-trip: loại bỏ `uid` do table `users` không có cột này (chỉ tìm theo email, username hoặc id số)
    const result = await pool.query<{ id: string }>(
      `
      SELECT id FROM (
        SELECT id, 1 AS ord FROM users WHERE deleted_at IS NULL AND $2::text IS NOT NULL AND email = $2
        UNION ALL
        SELECT id, 2 AS ord FROM users WHERE deleted_at IS NULL AND username = $1
        UNION ALL
        SELECT id, 3 AS ord FROM users WHERE deleted_at IS NULL AND $3::int IS NOT NULL AND id = $3
      ) ranked
      ORDER BY ord
      LIMIT 1
      `,
      [str, emailToSearch, numericId]
    );

    if (result.rows.length > 0) return Number(result.rows[0].id);

    logger.warn('normalizeUserId: Failed to resolve database ID', { firebaseUidOrEmail, userEmail });
    return null;
  } catch (error) {
    logger.error('Error normalizing user ID', error, { firebaseUidOrEmail, userEmail });
    return null;
  }
}

export async function updateUserPasswordHash(userId: number, passwordHash: string) {
  try {
    await pool.query("UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2", [
      passwordHash,
      userId,
    ]);
  } catch (error) {
    logger.error("Error updating user password hash", error, { userId });
    throw error;
  }
}

// ============================================================
// PASSWORD RESET FUNCTIONS
// ============================================================

export async function deletePasswordResetTokens(userId: number) {
  try {
    await pool.query("DELETE FROM password_resets WHERE user_id = $1", [userId]);
  } catch (error) {
    logger.error("Error deleting password reset tokens", error, { userId });
    throw error;
  }
}

export async function createPasswordResetTokenRecord(
  userId: number,
  token: string,
  expiresAt: Date
) {
  try {
    await pool.query(
      "INSERT INTO password_resets (user_id, token, expires_at, created_at) VALUES ($1, $2, $3, CURRENT_TIMESTAMP)",
      [userId, token, expiresAt]
    );
  } catch (error) {
    logger.error("Error creating password reset token record", error, { userId });
    throw error;
  }
}

export async function findValidPasswordResetToken(token: string) {
  try {
    const result = await pool.query(
      `SELECT pr.*, u.email, u.id as user_id
       FROM password_resets pr
       JOIN users u ON pr.user_id = u.id
       WHERE pr.token = $1 AND pr.expires_at > CURRENT_TIMESTAMP`,
      [token]
    );
    return result.rows[0] || null;
  } catch (error) {
    logger.error("Error finding valid password reset token", error, { token });
    throw error;
  }
}

export async function consumePasswordResetToken(token: string) {
  try {
    await pool.query("DELETE FROM password_resets WHERE token = $1", [token]);
  } catch (error) {
    logger.error("Error consuming password reset token", error, { token });
    throw error;
  }
}

// ============================================================
// MÃ THAM CHIẾU NẠP TIỀN (16 ký tự A-Za-z0-9, unique toàn hệ thống, 1 user = 1 mã)
// ============================================================

const DEPOSIT_REF_CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

let ensureUserDepositRefTablePromise: Promise<void> | null = null;

export async function ensureUserDepositReferenceTable(): Promise<void> {
  // Chỉ bỏ qua DDL lúc `next build` / export — không dùng shouldSkipDbTest (VERCEL=1 trên máy local
  // sẽ khiến bảng không bao giờ được tạo và JOIN deposits lỗi "relation does not exist").
  if (isBuildTime) return;
  if (!ensureUserDepositRefTablePromise) {
    ensureUserDepositRefTablePromise = (async () => {
      try {
        await pool.query(`
          CREATE TABLE IF NOT EXISTS user_deposit_reference_codes (
            user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
            code VARCHAR(16) NOT NULL,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT user_deposit_ref_code_len CHECK (char_length(code) = 16)
          );
        `);
        await pool.query(`
          CREATE UNIQUE INDEX IF NOT EXISTS uq_user_deposit_reference_codes_code
          ON user_deposit_reference_codes (code);
        `);
      } catch (e) {
        ensureUserDepositRefTablePromise = null;
        logger.error('ensureUserDepositReferenceTable failed', e);
        throw e;
      }
    })();
  }
  await ensureUserDepositRefTablePromise;
}

function generateDepositReferenceCode(): string {
  let out = '';
  for (let i = 0; i < 16; i++) {
    out += DEPOSIT_REF_CHARSET[randomInt(DEPOSIT_REF_CHARSET.length)];
  }
  return out;
}

/**
 * Lấy hoặc tạo mã 16 ký tự cố định cho user (không trùng giữa các user).
 */
export async function getOrCreateUserDepositReferenceCode(userId: number): Promise<string> {
  const uid = typeof userId === 'number' ? userId : Number(userId);
  if (!Number.isFinite(uid) || uid <= 0 || !Number.isInteger(uid)) {
    throw new Error('Invalid user id');
  }
  await ensureUserDepositReferenceTable();
  const existing = await queryOne<{ code: string }>(
    'SELECT code FROM user_deposit_reference_codes WHERE user_id = $1',
    [uid]
  );
  if (existing?.code) return existing.code;

  for (let attempt = 0; attempt < 24; attempt++) {
    const code = generateDepositReferenceCode();
    try {
      const inserted = await queryOne<{ code: string }>(
        `INSERT INTO user_deposit_reference_codes (user_id, code) VALUES ($1, $2)
         ON CONFLICT (user_id) DO NOTHING
         RETURNING code`,
        [uid, code]
      );
      if (inserted?.code) return inserted.code;
      const afterRace = await queryOne<{ code: string }>(
        'SELECT code FROM user_deposit_reference_codes WHERE user_id = $1',
        [uid]
      );
      if (afterRace?.code) return afterRace.code;
    } catch (e: any) {
      if (e?.code === '23505') continue;
      throw e;
    }
  }
  throw new Error('Could not allocate unique deposit reference code');
}

// ============================================================
// DEPOSIT FUNCTIONS
// ============================================================

// ✅ BUG-A6 FIX: Cache schema check result
let depositsSchemaCache: boolean | null = null;
export async function getDeposits(userId?: number) {
  try {
    await ensureUserDepositReferenceTable();
    let query = `
      SELECT d.*, u.email, u.username, r.code AS deposit_reference_code
      FROM deposits d
      LEFT JOIN users u ON d.user_id = u.id
      LEFT JOIN user_deposit_reference_codes r ON r.user_id = d.user_id
    `;
    const params: any[] = [];

    if (userId) {
      query += ' WHERE d.user_id = $1';
      params.push(userId);
    }

    query += ' ORDER BY d.timestamp DESC';

    const result = await pool.query(query, params);
    return result.rows;
  } catch (error) {
    logger.error('Error getting deposits', error, { userId });
    throw error;
  }
}

export async function createDeposit(depositData: {
  userId: string | number;
  amount: number;
  method: string;
  transactionId: string;
  userEmail?: string;
  userName?: string;
  ipAddress?: string;
  deviceInfo?: any;
}) {
  try {
    // ✅ FIX: Validate amount
    const amount = Number(depositData.amount);
    if (isNaN(amount) || amount <= 0) {
      throw new Error('Deposit amount must be a positive number');
    }

    // ✅ FIX: Validate method
    const validMethods = ['bank_transfer', 'e_wallet', 'card', 'crypto', 'momo', 'zalopay', 'vnpay'];
    if (depositData.method && !validMethods.includes(depositData.method)) {
      logger.warn('Unknown deposit method', { method: depositData.method });
      // Không throw — cho phép custom methods nhưng log warning
    }

    const dbUserId = await normalizeUserId(depositData.userId, depositData.userEmail);

    if (!dbUserId) {
      throw new Error('Cannot resolve user ID. User may not exist in database.');
    }

    // ✅ FIX BUG-A6: Cache kết quả check schema thay vì query mỗi lần
    let hasTransactionId = depositsSchemaCache;
    if (hasTransactionId === null) {
      try {
        const checkResult = await pool.query(`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_schema = 'public' 
          AND table_name = 'deposits' 
          AND column_name = 'transaction_id'
        `);
        hasTransactionId = checkResult.rows.length > 0;
        depositsSchemaCache = hasTransactionId;
      } catch (checkError) {
        hasTransactionId = false;
      }
    }

    // Insert với hoặc không có transaction_id tùy theo schema
    const ipAddress = depositData.ipAddress || null;
    const deviceInfo = depositData.deviceInfo ? JSON.stringify(depositData.deviceInfo) : null;

    let result;
    if (hasTransactionId) {
      result = await pool.query(
        `INSERT INTO deposits (user_id, amount, method, transaction_id, user_email, user_name, status, ip_address, device_info)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, $8)
         RETURNING id, timestamp`,
        [
          dbUserId,
          depositData.amount,
          depositData.method,
          depositData.transactionId || null,
          depositData.userEmail || null,
          depositData.userName || null,
          ipAddress,
          deviceInfo
        ]
      );
    } else {
      // Schema không có transaction_id, chỉ insert các cột cơ bản
      result = await pool.query(
        `INSERT INTO deposits (user_id, amount, method, user_email, user_name, status, ip_address, device_info)
         VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7)
         RETURNING id, timestamp`,
        [
          dbUserId,
          depositData.amount,
          depositData.method,
          depositData.userEmail || null,
          depositData.userName || null,
          ipAddress,
          deviceInfo
        ]
      );
    }

    return {
      id: result.rows[0].id,
      timestamp: result.rows[0].timestamp,
    };
  } catch (error) {
    logger.error('Error creating deposit', error, {
      userId: depositData.userId,
      amount: depositData.amount
    });
    throw error;
  }
}

export async function updateDepositStatus(
  depositId: number,
  status: 'pending' | 'approved' | 'rejected',
  approvedBy?: string
) {
  try {
    // ✅ FIX: Whitelist updates để tránh SQL injection
    const allowedColumns = ['status', 'approved_time', 'approved_by'];
    const updates: string[] = [];
    const params: any[] = [depositId];
    let paramIndex = 2;

    // Status is always required
    updates.push(`status = $${paramIndex}`);
    params.push(status);
    paramIndex++;

    if (status === 'approved' && approvedBy) {
      updates.push(`approved_time = CURRENT_TIMESTAMP`);
      updates.push(`approved_by = $${paramIndex}`);
      params.push(approvedBy);
      paramIndex++;
    }

    if (updates.length > 0) {
      await pool.query(
        `UPDATE deposits SET ${updates.join(', ')} WHERE id = $1`,
        params
      );
    }
  } catch (error) {
    logger.error('Error updating deposit status', error, { depositId, status });
    throw error;
  }
}

/**
 * Approve deposit và cập nhật balance - TRANSACTION SAFE với row locking
 */
export async function approveDepositAndUpdateBalance(
  depositId: number,
  userId: number,
  amount: number,
  approvedBy: string
) {
  const client: PoolClient = await pool.connect();
  try {
    await client.query('BEGIN');

    // ✅ FIX: Lock deposit row và check status để tránh double approval
    const depositResult = await client.query(
      'SELECT id, user_id, amount, status FROM deposits WHERE id = $1 FOR UPDATE',
      [depositId]
    );

    if (depositResult.rows.length === 0) {
      throw new Error('Deposit not found');
    }

    const deposit = depositResult.rows[0];

    // ✅ FIX: Check deposit đã được approve chưa
    if (deposit.status === 'approved') {
      throw new Error('Deposit has already been approved');
    }

    if (deposit.status === 'rejected') {
      throw new Error('Deposit has been rejected and cannot be approved');
    }

    // ✅ FIX: Validate userId và amount match với deposit
    // ✅ FIX: Ép kiểu cả 2 vế để tránh string vs number mismatch
    if (Number(deposit.user_id) !== Number(userId)) {
      throw new Error('User ID mismatch with deposit');
    }

    // ✅ FIX: So sánh amount với epsilon cho PostgreSQL decimal
    if (Math.abs(parseFloat(deposit.amount) - Number(amount)) > 0.01) {
      throw new Error('Amount mismatch with deposit');
    }

    // Lock user row để tránh race condition
    const userResult = await client.query(
      'SELECT balance FROM users WHERE id = $1 FOR UPDATE',
      [userId]
    );

    if (userResult.rows.length === 0) {
      throw new Error('User not found');
    }

    // Update deposit status
    await client.query(
      `UPDATE deposits 
       SET status = 'approved', 
           approved_time = CURRENT_TIMESTAMP, 
           approved_by = $1 
       WHERE id = $2 AND status = 'pending'`,
      [approvedBy, depositId]
    );

    // ✅ FIX: Use SQL arithmetic to avoid JS float precision loss
    const updateResult = await client.query(
      'UPDATE users SET balance = balance + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING balance',
      [amount, userId]
    );

    const newBalance = parseFloat(updateResult.rows[0].balance);

    await client.query('COMMIT');

    return {
      success: true,
      newBalance,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error approving deposit', error, { depositId, userId, amount });
    throw error;
  } finally {
    client.release();
  }
}

// ============================================================
// WITHDRAWAL FUNCTIONS
// ============================================================

export async function getWithdrawals(userId?: number) {
  try {
    let query = `
      SELECT w.*, u.email, u.username
      FROM withdrawals w
      LEFT JOIN users u ON w.user_id = u.id
    `;
    const params: any[] = [];

    if (userId) {
      query += ' WHERE w.user_id = $1';
      params.push(userId);
    }

    query += ' ORDER BY w.created_at DESC';

    const result = await pool.query(query, params);
    return result.rows;
  } catch (error) {
    logger.error('Error getting withdrawals', error, { userId });
    throw error;
  }
}

export async function createWithdrawal(withdrawalData: {
  userId: string | number;
  amount: number;
  bankName: string;
  accountNumber: string;
  accountName: string;
  userEmail?: string;
  idempotencyKey?: string | null;
  ipAddress?: string;
  deviceInfo?: any;
}) {
  // ✅ FIX: Validate amount trước khi vào transaction
  const WITHDRAWAL_MIN = 5_000; // 5,000 VND minimum

  const amount = Number(withdrawalData.amount);
  if (isNaN(amount) || amount <= 0) {
    throw new Error('Số tiền rút phải lớn hơn 0');
  }
  if (amount < WITHDRAWAL_MIN) {
    throw new Error(`Số tiền rút tối thiểu là ${WITHDRAWAL_MIN.toLocaleString('vi-VN')}đ`);
  }

  // ✅ Validate bank info
  if (!withdrawalData.bankName?.trim()) {
    throw new Error('Tên ngân hàng không được để trống');
  }
  if (!withdrawalData.accountNumber?.trim()) {
    throw new Error('Số tài khoản không được để trống');
  }
  if (!withdrawalData.accountName?.trim()) {
    throw new Error('Tên chủ tài khoản không được để trống');
  }

  const idem = withdrawalData.idempotencyKey?.trim();

  return await withTransaction(async (client) => {
    const dbUserId = await normalizeUserId(withdrawalData.userId, withdrawalData.userEmail);
    if (!dbUserId) {
      throw new Error('Cannot resolve user ID.');
    }

    // 1. Lock user row và check balance
    const userRes = await client.query(
      'SELECT balance FROM users WHERE id = $1 FOR UPDATE',
      [dbUserId]
    );

    if (userRes.rows.length === 0) {
      throw new Error('User not found');
    }

    if (idem) {
      const replay = await client.query(
        `SELECT id, created_at FROM withdrawals WHERE user_id = $1 AND idempotency_key = $2`,
        [dbUserId, idem]
      );
      if (replay.rows.length > 0) {
        return {
          id: replay.rows[0].id,
          createdAt: replay.rows[0].created_at,
          idempotentReplay: true as const,
        };
      }
    }

    const currentBalance = parseFloat(userRes.rows[0].balance || '0');
    if (currentBalance < withdrawalData.amount) {
      throw new Error('Insufficient balance');
    }

    // ✅ FIX BUG #5: Per-transaction & daily withdrawal limits
    const MAX_WITHDRAWAL_PER_TRANSACTION = 10_000_000; // 10M VND
    const DAILY_WITHDRAWAL_LIMIT = 50_000_000; // 50M VND

    if (withdrawalData.amount > MAX_WITHDRAWAL_PER_TRANSACTION) {
      throw new Error(
        `Số tiền rút tối đa mỗi lần là ${MAX_WITHDRAWAL_PER_TRANSACTION.toLocaleString('vi-VN')}đ`
      );
    }

    // Check daily total (last 24h approved + pending withdrawals)
    const dailyTotal = await client.query(
      `SELECT COALESCE(SUM(amount), 0) as total
       FROM withdrawals
       WHERE user_id = $1
         AND status IN ('pending', 'approved')
         AND created_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours'`,
      [dbUserId]
    );
    const todayTotal = parseFloat(dailyTotal.rows[0].total || '0');

    if (todayTotal + withdrawalData.amount > DAILY_WITHDRAWAL_LIMIT) {
      const remaining = Math.max(0, DAILY_WITHDRAWAL_LIMIT - todayTotal);
      throw new Error(
        `Vượt giới hạn rút tiền trong ngày (${DAILY_WITHDRAWAL_LIMIT.toLocaleString('vi-VN')}đ). ` +
        `Đã rút hôm nay: ${todayTotal.toLocaleString('vi-VN')}đ. ` +
        `Còn lại: ${remaining.toLocaleString('vi-VN')}đ`
      );
    }

    // 2. Check pending withdrawal
    const pendingWithdrawals = await client.query(
      'SELECT id FROM withdrawals WHERE user_id = $1 AND status = $2',
      [dbUserId, 'pending']
    );

    if (pendingWithdrawals.rows.length > 0) {
      throw new Error('You have a pending withdrawal request. Please wait for approval.');
    }

    // 3. Trừ tiền user_balance ngay lập tức atomically
    await client.query(
      'UPDATE users SET balance = balance - $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND balance >= $1',
      [withdrawalData.amount, dbUserId]
    );

    // 4. Tạo bản ghi rút tiền
    const hasIdem = Boolean(idem);
    const ipAddress = withdrawalData.ipAddress || null;
    const deviceInfo = withdrawalData.deviceInfo ? JSON.stringify(withdrawalData.deviceInfo) : null;
    
    let result;
    try {
      result = await client.query(
        hasIdem
          ? `INSERT INTO withdrawals (user_id, amount, bank_name, account_number, account_name, user_email, status, idempotency_key, ip_address, device_info)
             VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, $8, $9)
             RETURNING id, created_at`
          : `INSERT INTO withdrawals (user_id, amount, bank_name, account_number, account_name, user_email, status, ip_address, device_info)
             VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, $8)
             RETURNING id, created_at`,
        hasIdem
          ? [
            dbUserId,
            withdrawalData.amount,
            withdrawalData.bankName,
            withdrawalData.accountNumber,
            withdrawalData.accountName,
            withdrawalData.userEmail || null,
            idem,
            ipAddress,
            deviceInfo
          ]
          : [
            dbUserId,
            withdrawalData.amount,
            withdrawalData.bankName,
            withdrawalData.accountNumber,
            withdrawalData.accountName,
            withdrawalData.userEmail || null,
            ipAddress,
            deviceInfo
          ]
      );
    } catch (e: any) {
      if (e?.code === '23505' && idem) {
        await client.query(
          'UPDATE users SET balance = balance + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [withdrawalData.amount, dbUserId]
        );
        const replay = await client.query(
          `SELECT id, created_at FROM withdrawals WHERE user_id = $1 AND idempotency_key = $2`,
          [dbUserId, idem]
        );
        if (replay.rows.length > 0) {
          return {
            id: replay.rows[0].id,
            createdAt: replay.rows[0].created_at,
            idempotentReplay: true as const,
          };
        }
      }
      throw e;
    }

    return {
      id: result.rows[0].id,
      createdAt: result.rows[0].created_at,
      idempotentReplay: false as const,
    };
  });
}

export async function updateWithdrawalStatus(
  withdrawalId: number,
  status: 'pending' | 'approved' | 'rejected',
  approvedBy?: string
) {
  return await withTransaction(async (client) => {
    // 1. Lock withdrawal row
    const withdrawalRows = await client.query(
      'SELECT user_id, amount, status FROM withdrawals WHERE id = $1 FOR UPDATE',
      [withdrawalId]
    );

    if (withdrawalRows.rows.length === 0) {
      throw new Error('Withdrawal not found');
    }

    const withdrawal = withdrawalRows.rows[0];

    // No change needed if status is the same
    if (withdrawal.status === status) return;

    // 2. Handle Refund: Pending -> Rejected
    if (withdrawal.status === 'pending' && status === 'rejected') {
      await client.query(
        'UPDATE users SET balance = balance + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [withdrawal.amount, withdrawal.user_id]
      );
    }

    // 3. Handle Re-deduction: Rejected -> Pending/Approved
    if (withdrawal.status === 'rejected' && (status === 'pending' || status === 'approved')) {
      const userResult = await client.query(
        'SELECT balance FROM users WHERE id = $1 FOR UPDATE',
        [withdrawal.user_id]
      );
      const currentBalance = parseFloat(userResult.rows[0]?.balance || '0');

      if (currentBalance < parseFloat(withdrawal.amount)) {
        throw new Error('User does not have enough balance to re-approve this withdrawal');
      }

      await client.query(
        'UPDATE users SET balance = balance - $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [withdrawal.amount, withdrawal.user_id]
      );
    }

    // 4. Update status
    const updates: string[] = [];
    const params: any[] = [status, withdrawalId];

    updates.push('status = $1');

    if (status === 'approved' && approvedBy) {
      updates.push('approved_time = CURRENT_TIMESTAMP');
      updates.push(`approved_by = $${params.length + 1}`);
      params.push(approvedBy);
    }

    await client.query(
      `UPDATE withdrawals SET ${updates.join(', ')} WHERE id = $2`,
      params
    );
  });
}

/**
 * Approve withdrawal và trừ balance - TRANSACTION SAFE với row locking
 */
export async function approveWithdrawalAndUpdateBalance(
  withdrawalId: number,
  userId: number,
  amount: number,
  approvedBy: string
) {
  return await withTransaction(async (client) => {
    // 1. Lock withdrawal row
    const withdrawalResult = await client.query(
      'SELECT id, user_id, amount, status FROM withdrawals WHERE id = $1 FOR UPDATE',
      [withdrawalId]
    );

    if (withdrawalResult.rows.length === 0) {
      throw new Error('Withdrawal not found');
    }

    const withdrawal = withdrawalResult.rows[0];

    if (withdrawal.status === 'approved') {
      throw new Error('Withdrawal has already been approved');
    }

    if (withdrawal.status === 'rejected') {
      throw new Error('Withdrawal has been rejected and cannot be approved');
    }

    if (Number(withdrawal.user_id) !== Number(userId)) {
      throw new Error('User ID mismatch with withdrawal');
    }

    if (Math.abs(parseFloat(withdrawal.amount) - Number(amount)) > 0.01) {
      throw new Error('Amount mismatch with withdrawal');
    }

    // 2. Lock user row (đã trừ tiền khi create, nên ở đây chỉ verify số dư >= 0 nếu cần)
    const userResult = await client.query(
      'SELECT balance FROM users WHERE id = $1 FOR UPDATE',
      [userId]
    );

    if (userResult.rows.length === 0) {
      throw new Error('User not found');
    }

    const currentBalance = parseFloat(userResult.rows[0].balance || '0');

    // 3. Update withdrawal status
    await client.query(
      `UPDATE withdrawals 
       SET status = 'approved', 
           approved_time = CURRENT_TIMESTAMP, 
           approved_by = $1 
       WHERE id = $2 AND status = 'pending'`,
      [approvedBy, withdrawalId]
    );

    return {
      success: true,
      newBalance: currentBalance,
    };
  });
}

// ============================================================
// PURCHASE FUNCTIONS
// ============================================================

export async function getPurchases(userId?: number) {
  try {
    // JOIN đủ cột sản phẩm để dashboard "Sản phẩm đã mua" có ảnh, danh mục, link tải/demo
    let query = `
      SELECT p.*, 
             pr.title AS product_title, 
             pr.price,
             pr.category,
             pr.description,
             pr.image_url,
             pr.demo_url,
             pr.download_url,
             u.email, 
             u.username
      FROM purchases p
      LEFT JOIN products pr ON p.product_id = pr.id
      LEFT JOIN users u ON p.user_id = u.id
    `;
    const params: any[] = [];

    if (userId) {
      query += ' WHERE p.user_id = $1';
      params.push(userId);
    }

    query += ' ORDER BY p.created_at DESC';

    const result = await pool.query(query, params);
    return result.rows;
  } catch (error) {
    logger.error('Error getting purchases', error, { userId });
    throw error;
  }
}

export async function createPurchase(purchaseData: {
  userId: string | number;
  productId: string | number;
  amount: number;
  userEmail?: string;
}) {
  return await withTransaction(async (client) => {
    const dbUserId = await normalizeUserId(purchaseData.userId, purchaseData.userEmail);
    if (!dbUserId) {
      throw new Error('Cannot resolve user ID.');
    }

    const productIdNum = typeof purchaseData.productId === 'number'
      ? purchaseData.productId
      : parseInt(purchaseData.productId.toString(), 10);

    // 1. Lock user row và check balance
    const userRes = await client.query(
      'SELECT balance FROM users WHERE id = $1 FOR UPDATE',
      [dbUserId]
    );

    if (userRes.rows.length === 0) {
      throw new Error('User not found');
    }

    const currentBalance = parseFloat(userRes.rows[0].balance || '0');

    // 2. Check duplicate purchase
    const existingRes = await client.query(
      'SELECT id FROM purchases WHERE user_id = $1 AND product_id = $2',
      [dbUserId, productIdNum]
    );

    if (existingRes.rows.length > 0) {
      throw new Error('Bạn đã mua sản phẩm này rồi');
    }

    // 3. Get product and check availability
    const productRes = await client.query(
      'SELECT id, price, is_active FROM products WHERE id = $1 AND deleted_at IS NULL FOR UPDATE',
      [productIdNum]
    );

    if (productRes.rows.length === 0) {
      throw new Error('Sản phẩm không tồn tại hoặc đã bị xóa');
    }

    const product = productRes.rows[0];
    if (!product.is_active) {
      throw new Error('Sản phẩm hiện không còn khả dụng');
    }

    const price = parseFloat(product.price);

    // 4. Validate balance
    if (currentBalance < price) {
      throw new Error(`Số dư không đủ. Cần ${price.toLocaleString('vi-VN')}đ, hiện có ${currentBalance.toLocaleString('vi-VN')}đ`);
    }

    // 5. Atomic balance update
    await client.query(
      'UPDATE users SET balance = balance - $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND balance >= $1',
      [price, dbUserId]
    );

    // 6. Create purchase record
    const result = await client.query(
      'INSERT INTO purchases (user_id, product_id, amount) VALUES ($1, $2, $3) RETURNING id',
      [dbUserId, productIdNum, price]
    );

    return {
      id: Number(result.rows[0].id),
      newBalance: currentBalance - price,
      amount: price,
    };
  });
}

/**
 * Hoa hồng giới thiệu: mỗi giao dịch mua, cộng % lên số dư người giới thiệu (theo bảng referrals).
 */
export async function processReferralCommission(
  referredUserId: number,
  purchaseAmount: number
): Promise<{ referrerId: number; commissionAmount: number } | null> {
  if (!purchaseAmount || purchaseAmount <= 0) return null;

  return await withTransaction(async (client) => {
    const refRes = await client.query(
      `SELECT id, referrer_id, commission_percent, status
       FROM referrals
       WHERE referred_id = $1
       FOR UPDATE`,
      [referredUserId]
    );
    if (refRes.rows.length === 0) return null;

    const ref = refRes.rows[0];
    const pct = parseFloat(String(ref.commission_percent ?? 10));
    let commission = Math.round(purchaseAmount * (pct / 100) * 100) / 100;

    // ✅ FIX BUG #4: Cap commission per transaction (fraud prevention)
    const MAX_COMMISSION_PER_TRANSACTION = 500000; // 500,000 VND
    commission = Math.min(commission, MAX_COMMISSION_PER_TRANSACTION);

    if (commission <= 0) return null;

    await client.query(
      `UPDATE users SET balance = balance + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [commission, ref.referrer_id]
    );

    await client.query(
      `UPDATE referrals SET
         total_earnings = COALESCE(total_earnings, 0) + $1::numeric,
         status = CASE WHEN status = 'pending' THEN 'active' ELSE status END,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [commission, ref.id]
    );

    return { referrerId: Number(ref.referrer_id), commissionAmount: commission };
  });
}

/**
 * Bulk purchase items atomically.
 */
export async function createBulkPurchase(purchaseData: {
  userId: string | number;
  items: { id: string | number; quantity: number }[];
  userEmail?: string;
}) {
  return await withTransaction(async (client) => {
    const dbUserId = await normalizeUserId(purchaseData.userId, purchaseData.userEmail);
    if (!dbUserId) {
      throw new Error('Cannot resolve user ID.');
    }

    // 1. Lock user row
    const userRes = await client.query(
      'SELECT balance FROM users WHERE id = $1 FOR UPDATE',
      [dbUserId]
    );
    const currentBalance = parseFloat(userRes.rows[0]?.balance || '0');

    let totalAmount = 0;
    const validatedItems = [];

    // 2. Validate all products and calculate total
    for (const item of purchaseData.items) {
      const productIdNum = typeof item.id === 'number' ? item.id : parseInt(String(item.id), 10);

      const productRes = await client.query(
        'SELECT id, price, is_active, title FROM products WHERE id = $1 AND deleted_at IS NULL FOR UPDATE',
        [productIdNum]
      );

      const product = productRes.rows[0];
      if (!product) throw new Error(`Sản phẩm #${item.id} không tồn tại hoặc đã bị xóa`);
      if (!product.is_active) throw new Error(`Sản phẩm "${product.title}" hiện không khả dụng`);

      // Check duplicate
      const existingRes = await client.query(
        'SELECT id FROM purchases WHERE user_id = $1 AND product_id = $2',
        [dbUserId, productIdNum]
      );
      if (existingRes.rows.length > 0) {
        throw new Error(`Bạn đã mua sản phẩm "${product.title}" rồi`);
      }

      const price = parseFloat(product.price);
      const quantity = Math.max(1, item.quantity);
      const amount = price * quantity;

      totalAmount += amount;
      validatedItems.push({ id: productIdNum, amount });
    }

    // 3. Final balance check
    if (currentBalance < totalAmount) {
      throw new Error(`Số dư không đủ. Cần ${totalAmount.toLocaleString('vi-VN')}đ, hiện có ${currentBalance.toLocaleString('vi-VN')}đ`);
    }

    // 4. Update balance
    await client.query(
      'UPDATE users SET balance = balance - $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND balance >= $1',
      [totalAmount, dbUserId]
    );

    // 5. Create all purchase records
    const purchaseIds = [];
    for (const item of validatedItems) {
      const pRes = await client.query(
        'INSERT INTO purchases (user_id, product_id, amount) VALUES ($1, $2, $3) RETURNING id',
        [dbUserId, item.id, item.amount]
      );
      purchaseIds.push(Number(pRes.rows[0].id));
    }

    return {
      success: true,
      newBalance: currentBalance - totalAmount,
      purchaseIds
    };
  });
}

// ============================================================
// PRODUCT FUNCTIONS
// ============================================================

// ✅ FIX: Helper function để check column existence (cached)
let _hasDownloadCountCache: boolean | null = null;
async function hasDownloadCountColumn(): Promise<boolean> {
  if (_hasDownloadCountCache !== null) {
    return _hasDownloadCountCache;
  }
  try {
    // ✅ FIX: Check pool instance trước khi query
    const instance = getPoolInstance();
    if (!instance) {
      logger.warn('Database pool instance is null, assuming download_count column does not exist');
      _hasDownloadCountCache = false;
      return false;
    }

    const result = await instance.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'products' AND column_name = 'download_count'
      ) as exists
    `);
    const exists = result.rows[0]?.exists || false;
    _hasDownloadCountCache = Boolean(exists);
    return _hasDownloadCountCache;
  } catch (error: any) {
    // ✅ FIX: Log error và assume column không tồn tại
    logger.warn('Error checking download_count column, assuming it does not exist', {
      error: error?.message || String(error),
      code: error?.code
    });
    _hasDownloadCountCache = false;
    return false;
  }
}

export async function getProducts(filters?: {
  category?: string;
  isActive?: boolean;
  limit?: number;
  offset?: number;
}) {
  try {
    // ✅ FIX: Check pool instance trước khi query
    const instance = getPoolInstance();
    if (!instance) {
      throw new Error('Database connection failed. Pool instance is null.');
    }

    // ✅ FIX: Check xem cột download_count có tồn tại không
    const hasDownloadCount = await hasDownloadCountColumn();

    // ✅ FIX: Join với product_ratings để lấy ratings và download_count (nếu có)
    let query = `
      SELECT p.*, 
             pr.average_rating, 
             pr.total_ratings
      ${hasDownloadCount ? ', COALESCE(p.download_count, 0) as download_count' : ', 0 as download_count'}
      FROM products p
      LEFT JOIN product_ratings pr ON p.id = pr.product_id
      WHERE p.deleted_at IS NULL
    `;
    const params: any[] = [];
    let paramIndex = 1;

    if (filters?.category) {
      query += ` AND p.category = $${paramIndex}`;
      params.push(filters.category);
      paramIndex++;
    }

    if (filters?.isActive !== undefined) {
      query += ` AND p.is_active = $${paramIndex}`;
      params.push(filters.isActive);
      paramIndex++;
    }

    query += ' ORDER BY p.created_at DESC';

    if (filters?.limit) {
      query += ` LIMIT $${paramIndex}`;
      params.push(filters.limit);
      paramIndex++;
    }

    if (filters?.offset) {
      query += ` OFFSET $${paramIndex}`;
      params.push(filters.offset);
    }

    const result = await instance.query(query, params);
    return result.rows || [];
  } catch (error: any) {
    logger.error('Error getting products', error, {
      filters,
      hasPool: !!getPoolInstance(),
      errorCode: error?.code,
      errorMessage: error?.message
    });

    // ✅ FIX: Nếu là database connection error, throw với message rõ ràng
    if (error?.message?.includes('Pool instance is null') ||
      error?.message?.includes('Database connection failed') ||
      error?.code === 'ENOTFOUND' ||
      error?.code === 'ECONNREFUSED' ||
      error?.code === 'ETIMEDOUT') {
      const dbError = new Error('Database connection failed. Please check environment variables.');
      (dbError as any).code = error?.code || 'DB_CONNECTION_FAILED';
      throw dbError;
    }

    // ✅ FIX: Nếu là lỗi SQL, log và throw
    if (error?.code === '42P01' || error?.code === '42703') {
      logger.error('SQL error in getProducts - possible schema mismatch', error);
    }

    throw error;
  }
}

export async function getProductById(productId: number) {
  try {
    // ✅ FIX: Check xem cột download_count có tồn tại không
    const hasDownloadCount = await hasDownloadCountColumn();

    // ✅ FIX: Join với product_ratings để lấy ratings và download_count (nếu có)
    const query = `
      SELECT p.*, 
             pr.average_rating, 
             pr.total_ratings
      ${hasDownloadCount ? ', COALESCE(p.download_count, 0) as download_count' : ', 0 as download_count'}
      FROM products p
      LEFT JOIN product_ratings pr ON p.id = pr.product_id
      WHERE p.id = $1 AND p.deleted_at IS NULL
    `;

    const result = await pool.query(query, [productId]);
    return result.rows[0] || null;
  } catch (error) {
    logger.error('Error getting product by ID', error, { productId });
    throw error;
  }
}

/**
 * Create product (admin only)
 */
export async function createProduct(productData: {
  title: string;
  description?: string;
  price: number;
  category?: string;
  demoUrl?: string;
  downloadUrl?: string;
  imageUrl?: string;
  tags?: string[];
  isActive?: boolean;
}) {
  try {
    // ✅ FIX: Check xem cột download_count có tồn tại không
    const hasDownloadCount = await hasDownloadCountColumn();

    const columns = hasDownloadCount
      ? 'title, description, price, category, demo_url, download_url, image_url, tags, is_active, download_count, created_at, updated_at'
      : 'title, description, price, category, demo_url, download_url, image_url, tags, is_active, created_at, updated_at';

    const values = hasDownloadCount
      ? '$1, $2, $3, $4, $5, $6, $7, $8, $9, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP'
      : '$1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP';

    const result = await pool.query(
      `INSERT INTO products (${columns})
      VALUES (${values})
      RETURNING id, created_at`,
      [
        productData.title,
        productData.description || null,
        productData.price,
        productData.category || null,
        productData.demoUrl || null,
        productData.downloadUrl || null,
        productData.imageUrl || null,
        productData.tags || null,
        productData.isActive !== undefined ? productData.isActive : true,
      ]
    );

    return {
      id: result.rows[0].id,
      createdAt: result.rows[0].created_at,
    };
  } catch (error) {
    logger.error('Error creating product', error, { title: productData.title });
    throw error;
  }
}

/**
 * Update product (admin only)
 * Cho phép admin update cả ratings và download_count (manual override)
 */
export async function updateProduct(
  productId: number,
  productData: {
    title?: string;
    description?: string;
    price?: number;
    category?: string;
    demoUrl?: string;
    downloadUrl?: string;
    imageUrl?: string;
    imageUrls?: string[] | null;
    detailedDescription?: string | null;
    tags?: string[];
    isActive?: boolean;
    averageRating?: number; // Manual override
    downloadCount?: number; // Manual override
  }
) {
  try {
    const updates: string[] = [];
    const params: any[] = [productId];
    let paramIndex = 2;

    if (productData.title !== undefined) {
      updates.push(`title = $${paramIndex}`);
      params.push(productData.title);
      paramIndex++;
    }

    if (productData.description !== undefined) {
      updates.push(`description = $${paramIndex}`);
      params.push(productData.description);
      paramIndex++;
    }

    if (productData.price !== undefined) {
      updates.push(`price = $${paramIndex}`);
      params.push(productData.price);
      paramIndex++;
    }

    if (productData.category !== undefined) {
      updates.push(`category = $${paramIndex}`);
      params.push(productData.category);
      paramIndex++;
    }

    if (productData.demoUrl !== undefined) {
      updates.push(`demo_url = $${paramIndex}`);
      params.push(productData.demoUrl || null);
      paramIndex++;
    }

    if (productData.downloadUrl !== undefined) {
      updates.push(`download_url = $${paramIndex}`);
      params.push(productData.downloadUrl || null);
      paramIndex++;
    }

    if (productData.imageUrl !== undefined) {
      updates.push(`image_url = $${paramIndex}`);
      params.push(productData.imageUrl || null);
      paramIndex++;
    }

    if (productData.detailedDescription !== undefined) {
      updates.push(`detailed_description = $${paramIndex}`);
      params.push(productData.detailedDescription || null);
      paramIndex++;
    }

    if (productData.imageUrls !== undefined) {
      updates.push(`image_urls = $${paramIndex}`);
      params.push(productData.imageUrls ? JSON.stringify(productData.imageUrls) : '[]');
      paramIndex++;
    }

    if (productData.tags !== undefined) {
      updates.push(`tags = $${paramIndex}`);
      params.push(productData.tags || null);
      paramIndex++;
    }

    if (productData.isActive !== undefined) {
      updates.push(`is_active = $${paramIndex}`);
      params.push(productData.isActive);
      paramIndex++;
    }

    // ✅ FIX: Cho phép admin manually set download_count (nếu column tồn tại)
    if (productData.downloadCount !== undefined) {
      const hasDownloadCount = await hasDownloadCountColumn();
      if (hasDownloadCount) {
        updates.push(`download_count = $${paramIndex}`);
        params.push(productData.downloadCount);
        paramIndex++;
      }
    }

    // Luôn cập nhật updated_at
    updates.push('updated_at = CURRENT_TIMESTAMP');

    if (updates.length > 1) { // Có ít nhất 1 update + updated_at
      await pool.query(
        `UPDATE products SET ${updates.join(', ')} WHERE id = $1`,
        params
      );
    }

    // ✅ FIX: Nếu admin muốn manually set average_rating, update vào product_ratings
    if (productData.averageRating !== undefined) {
      await pool.query(
        `INSERT INTO product_ratings (product_id, average_rating, total_ratings, updated_at)
         VALUES ($1, $2, 
           COALESCE((SELECT total_ratings FROM product_ratings WHERE product_id = $1), 0),
           CURRENT_TIMESTAMP)
         ON CONFLICT (product_id)
         DO UPDATE SET 
           average_rating = EXCLUDED.average_rating,
           updated_at = EXCLUDED.updated_at`,
        [productId, productData.averageRating]
      );
    }

    return await getProductById(productId);
  } catch (error) {
    logger.error('Error updating product', error, { productId });
    throw error;
  }
}

/**
 * Delete product (admin only)
 */
export async function deleteProduct(productId: number) {
  try {
    const result = await pool.query(
      'DELETE FROM products WHERE id = $1 RETURNING id',
      [productId]
    );
    return result.rows[0] || null;
  } catch (error) {
    logger.error('Error deleting product', error, { productId });
    throw error;
  }
}

// ============================================================
// DOWNLOAD FUNCTIONS
// ============================================================

/**
 * Track download - tăng download_count và lưu lịch sử
 */
export async function trackDownload(downloadData: {
  userId: number;
  productId: number;
  ipAddress?: string;
  userAgent?: string;
}) {
  const client: PoolClient = await pool.connect();
  try {
    await client.query('BEGIN');

    // ✅ FIX: Kiểm tra user đã mua sản phẩm chưa
    const purchaseCheck = await client.query(
      'SELECT id FROM purchases WHERE user_id = $1 AND product_id = $2',
      [downloadData.userId, downloadData.productId]
    );

    if (purchaseCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      throw new Error('Bạn cần mua sản phẩm trước khi tải xuống');
    }

    // ✅ FIX: Race condition prevention - Lock product row và check download atomically
    // Lock product để tránh concurrent updates
    const productLock = await client.query(
      'SELECT id FROM products WHERE id = $1 FOR UPDATE',
      [downloadData.productId]
    );

    if (productLock.rows.length === 0) {
      await client.query('ROLLBACK');
      throw new Error('Product not found');
    }

    // ✅ FIX: Check existing download với lock để tránh race condition
    const existingDownload = await client.query(
      `SELECT id, downloaded_at FROM downloads 
       WHERE user_id = $1 AND product_id = $2 
       AND DATE(downloaded_at AT TIME ZONE 'UTC') = DATE(CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
       FOR UPDATE`,
      [downloadData.userId, downloadData.productId]
    );

    let isNewDownload = existingDownload.rows.length === 0;
    let downloadResult;

    if (isNewDownload) {
      // ✅ FIX: Insert mới và tăng download_count atomically trong cùng transaction
      downloadResult = await client.query(
        `INSERT INTO downloads (user_id, product_id, ip_address, user_agent, downloaded_at)
         VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
         RETURNING id, downloaded_at`,
        [
          downloadData.userId,
          downloadData.productId,
          downloadData.ipAddress || null,
          downloadData.userAgent || null,
        ]
      );

      // ✅ FIX: Tăng download_count atomically (row đã được lock) - chỉ nếu column tồn tại
      const hasDownloadCount = await hasDownloadCountColumn();
      if (hasDownloadCount) {
        await client.query(
          'UPDATE products SET download_count = download_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
          [downloadData.productId]
        );
      } else {
        // Nếu chưa có column, chỉ update updated_at
        await client.query(
          'UPDATE products SET updated_at = CURRENT_TIMESTAMP WHERE id = $1',
          [downloadData.productId]
        );
      }
    } else {
      // Update timestamp của download hiện tại (row đã được lock)
      downloadResult = await client.query(
        `UPDATE downloads 
         SET downloaded_at = CURRENT_TIMESTAMP,
             ip_address = $1,
             user_agent = $2
         WHERE id = $3
         RETURNING id, downloaded_at`,
        [
          downloadData.ipAddress || null,
          downloadData.userAgent || null,
          existingDownload.rows[0].id,
        ]
      );
    }

    // Get product để trả về download_url
    const productResult = await client.query(
      'SELECT download_url, file_url FROM products WHERE id = $1',
      [downloadData.productId]
    );

    await client.query('COMMIT');

    return {
      id: downloadResult.rows[0].id,
      downloadedAt: downloadResult.rows[0].downloaded_at,
      downloadUrl: productResult.rows[0]?.download_url || productResult.rows[0]?.file_url || null,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error tracking download', error, {
      userId: downloadData.userId,
      productId: downloadData.productId
    });
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get downloads history
 */
export async function getDownloads(filters?: {
  userId?: number;
  productId?: number;
  limit?: number;
  offset?: number;
}) {
  try {
    let query = `
      SELECT d.*, 
             u.username, 
             u.email,
             p.title as product_title
      FROM downloads d
      LEFT JOIN users u ON d.user_id = u.id
      LEFT JOIN products p ON d.product_id = p.id
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramIndex = 1;

    if (filters?.userId) {
      query += ` AND d.user_id = $${paramIndex}`;
      params.push(filters.userId);
      paramIndex++;
    }

    if (filters?.productId) {
      query += ` AND d.product_id = $${paramIndex}`;
      params.push(filters.productId);
      paramIndex++;
    }

    query += ' ORDER BY d.downloaded_at DESC';

    if (filters?.limit) {
      query += ` LIMIT $${paramIndex}`;
      params.push(filters.limit);
      paramIndex++;
    }

    if (filters?.offset) {
      query += ` OFFSET $${paramIndex}`;
      params.push(filters.offset);
    }

    const result = await pool.query(query, params);
    return result.rows;
  } catch (error) {
    logger.error('Error getting downloads', error, { filters });
    throw error;
  }
}

// ============================================================
// CHAT FUNCTIONS
// ============================================================

export async function getChats(
  userId?: number,
  adminId?: number,
  limit?: number,
  offset?: number
) {
  try {
    let query = `
      SELECT c.*, 
             u.username as user_name,
             u.email as user_email,
             u.avatar_url as user_avatar,
             COALESCE(a.username, 'Admin') as admin_name,
             COALESCE(a.email, '') as admin_email,
             CASE WHEN c.is_admin = true THEN true ELSE false END as is_admin
      FROM chats c
      LEFT JOIN users u ON c.user_id = u.id
      LEFT JOIN users a ON c.admin_id = a.id
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramIndex = 1;

    if (userId) {
      query += ` AND c.user_id = $${paramIndex}`;
      params.push(userId);
      paramIndex++;
    }

    if (adminId) {
      query += ` AND c.admin_id = $${paramIndex}`;
      params.push(adminId);
      paramIndex++;
    }

    query += ' ORDER BY c.created_at ASC'; // ✅ FIX: ASC để hiển thị tin nhắn cũ trước, mới sau

    // ✅ FIX: Thêm pagination support
    if (limit !== undefined) {
      query += ` LIMIT $${paramIndex}`;
      params.push(limit);
      paramIndex++;
    }

    if (offset !== undefined) {
      query += ` OFFSET $${paramIndex}`;
      params.push(offset);
    }

    const result = await pool.query(query, params);

    // ✅ FIX: Map response để đảm bảo format nhất quán
    return result.rows.map((row: any) => ({
      id: row.id,
      user_id: row.user_id,
      admin_id: row.admin_id,
      message: row.message,
      is_admin: row.is_admin || row.isAdmin || false,
      created_at: row.created_at || row.createdAt,
      createdAt: row.created_at || row.createdAt,
      user_name: row.user_name,
      user_email: row.user_email,
      user_avatar: row.user_avatar,
      admin_name: row.admin_name,
      admin_email: row.admin_email,
    }));
  } catch (error) {
    logger.error('Error getting chats', error, { userId, adminId });
    throw error;
  }
}

export async function createChat(chatData: {
  userId: number;
  adminId: number | null;
  message: string;
  isAdmin: boolean;
}) {
  try {
    const result = await pool.query(
      `INSERT INTO chats (user_id, admin_id, message, is_admin, created_at)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
       RETURNING id, created_at`,
      [
        chatData.userId,
        chatData.adminId,
        chatData.message,
        chatData.isAdmin,
      ]
    );

    return {
      id: result.rows[0].id,
      createdAt: result.rows[0].created_at,
    };
  } catch (error) {
    logger.error('Error creating chat', error, {
      userId: chatData.userId,
      isAdmin: chatData.isAdmin
    });
    throw error;
  }
}

// ============================================================
// REVIEW FUNCTIONS
// ============================================================

export async function getReviews(filters?: {
  productId?: number;
  userId?: number;
  limit?: number;
  offset?: number;
}) {
  try {
    let query = `
      SELECT r.*, 
             u.username, 
             u.email,
             u.avatar_url,
             pr.title as product_title
      FROM reviews r
      JOIN users u ON r.user_id = u.id
      LEFT JOIN products pr ON r.product_id = pr.id
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramIndex = 1;

    if (filters?.productId) {
      query += ` AND r.product_id = $${paramIndex}`;
      params.push(filters.productId);
      paramIndex++;
    }

    if (filters?.userId) {
      query += ` AND r.user_id = $${paramIndex}`;
      params.push(filters.userId);
      paramIndex++;
    }

    query += ' ORDER BY r.created_at DESC';

    if (filters?.limit) {
      query += ` LIMIT $${paramIndex}`;
      params.push(filters.limit);
      paramIndex++;
    }

    if (filters?.offset) {
      query += ` OFFSET $${paramIndex}`;
      params.push(filters.offset);
    }

    const result = await pool.query(query, params);
    return result.rows;
  } catch (error) {
    logger.error('Error getting reviews', error, { filters });
    throw error;
  }
}

export async function getProductAverageRating(productId: number) {
  try {
    const result = await pool.query(
      'SELECT * FROM product_ratings WHERE product_id = $1',
      [productId]
    );

    if (result.rows.length > 0) {
      return {
        product_id: result.rows[0].product_id,
        average_rating: parseFloat(result.rows[0].average_rating || '0'),
        total_ratings: parseInt(result.rows[0].total_ratings || '0'),
        updated_at: result.rows[0].updated_at,
      };
    }

    // Return default nếu chưa có rating
    return {
      product_id: productId,
      average_rating: 0,
      total_ratings: 0,
      updated_at: new Date(),
    };
  } catch (error) {
    logger.error('Error getting product average rating', error, { productId });
    throw error;
  }
}

export async function createReview(reviewData: {
  userId: number;
  productId: number;
  rating: number;
  comment?: string | null;
}) {
  try {
    const result = await pool.query(
      `INSERT INTO reviews (user_id, product_id, rating, comment)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, product_id)
       DO UPDATE SET 
         rating = EXCLUDED.rating, 
         comment = EXCLUDED.comment, 
         updated_at = CURRENT_TIMESTAMP
       RETURNING id, created_at, updated_at`,
      [
        reviewData.userId,
        reviewData.productId,
        reviewData.rating,
        reviewData.comment || null,
      ]
    );

    return {
      id: result.rows[0].id,
      createdAt: result.rows[0].created_at,
      updatedAt: result.rows[0].updated_at,
    };
  } catch (error) {
    logger.error('Error creating review', error, {
      userId: reviewData.userId,
      productId: reviewData.productId
    });
    throw error;
  }
}

// ============================================================
// WISHLIST FUNCTIONS
// ============================================================

export async function getWishlist(userId: number) {
  try {
    const result = await pool.query(
      `SELECT w.*, p.*, 
              COALESCE(pr.average_rating, 0) as avg_rating,
              COALESCE(pr.total_ratings, 0) as review_count
       FROM wishlists w
       JOIN products p ON w.product_id = p.id
       LEFT JOIN product_ratings pr ON p.id = pr.product_id
       WHERE w.user_id = $1
       ORDER BY w.created_at DESC`,
      [userId]
    );
    return result.rows;
  } catch (error) {
    logger.error("Error getting wishlist", error, { userId });
    throw error;
  }
}

export async function addToWishlist(userId: number, productId: number) {
  try {
    const result = await pool.query(
      `INSERT INTO wishlists (user_id, product_id, created_at, updated_at)
       VALUES ($1, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) 
       ON CONFLICT (user_id, product_id) DO NOTHING 
       RETURNING id`,
      [userId, productId]
    );
    return { id: result.rows[0]?.id || 0, userId, productId };
  } catch (error) {
    logger.error("Error adding to wishlist", error, { userId, productId });
    throw error;
  }
}

export async function removeFromWishlist(userId: number, productId: number) {
  try {
    await pool.query("DELETE FROM wishlists WHERE user_id = $1 AND product_id = $2", [
      userId,
      productId,
    ]);
    return { userId, productId };
  } catch (error) {
    logger.error("Error removing from wishlist", error, { userId, productId });
    throw error;
  }
}

export async function isInWishlist(userId: number, productId: number): Promise<boolean> {
  try {
    const result = await pool.query(
      "SELECT id FROM wishlists WHERE user_id = $1 AND product_id = $2",
      [userId, productId]
    );
    return result.rows.length > 0;
  } catch (error) {
    logger.error("Error checking wishlist status", error, { userId, productId });
    return false;
  }
}

// ============================================================
// PRODUCT SEARCH (Full-Text Search)
// ============================================================

export async function searchProducts(query: string, filters?: {
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  minRating?: number;
  limit?: number;
  offset?: number;
}) {
  try {
    // PostgreSQL Full-Text Search using websearch_to_tsquery for better UX
    let sql = `
      SELECT p.*,
             pr.average_rating as avg_rating,
             pr.total_ratings as review_count,
             ts_rank(to_tsvector('english', p.title || ' ' || COALESCE(p.description, '')), websearch_to_tsquery('english', $1)) as rank
      FROM products p
      LEFT JOIN product_ratings pr ON p.id = pr.product_id
      WHERE p.deleted_at IS NULL AND p.is_active = TRUE
        AND (
          to_tsvector('english', p.title || ' ' || COALESCE(p.description, '')) @@ websearch_to_tsquery('english', $1)
          OR p.title ILIKE $2
          OR p.tags::text ILIKE $2
        )
    `;
    const params: any[] = [query, `%${query}%`];
    let paramIndex = 3;

    if (filters?.category) {
      sql += ` AND p.category = $${paramIndex}`;
      params.push(filters.category);
      paramIndex++;
    }

    if (filters?.minPrice !== undefined) {
      sql += ` AND p.price >= $${paramIndex}`;
      params.push(filters.minPrice);
      paramIndex++;
    }

    if (filters?.maxPrice !== undefined) {
      sql += ` AND p.price <= $${paramIndex}`;
      params.push(filters.maxPrice);
      paramIndex++;
    }

    if (filters?.minRating !== undefined) {
      sql += ` AND (pr.average_rating >= $${paramIndex} OR pr.average_rating IS NULL)`;
      params.push(filters.minRating);
      paramIndex++;
    }

    sql += ` ORDER BY rank DESC, p.created_at DESC`;

    if (filters?.limit) {
      sql += ` LIMIT $${paramIndex}`;
      params.push(filters.limit);
      paramIndex++;
    }

    if (filters?.offset) {
      sql += ` OFFSET $${paramIndex}`;
      params.push(filters.offset);
    }

    const result = await pool.query(sql, params);
    return result.rows;
  } catch (error) {
    logger.error('Error searching products (Postgres)', error, { query, filters });
    throw error;
  }
}

// ============================================================
// COUPON FUNCTIONS
// ============================================================

export async function getCoupons(filters?: {
  isActive?: boolean
  limit?: number
  offset?: number
}) {
  try {
    let sql = "SELECT * FROM coupons WHERE 1=1"
    const params: any[] = []
    let paramIndex = 1;

    if (filters?.isActive !== undefined) {
      sql += ` AND is_active = $${paramIndex}`
      params.push(filters.isActive)
      paramIndex++;
    }

    sql += " ORDER BY created_at DESC"

    if (filters?.limit) {
      sql += ` LIMIT $${paramIndex}`
      params.push(filters.limit)
      paramIndex++;
    }
    if (filters?.offset) {
      sql += ` OFFSET $${paramIndex}`
      params.push(filters.offset)
    }

    const result = await pool.query(sql, params);
    return result.rows;
  } catch (error) {
    logger.error("Error getting coupons", error, { filters });
    throw error;
  }
}

export async function getCouponByCode(code: string) {
  try {
    const result = await pool.query(
      `SELECT * FROM coupons
       WHERE code = $1 AND is_active = TRUE
         AND (valid_from IS NULL OR valid_from <= CURRENT_TIMESTAMP)
         AND (valid_until IS NULL OR valid_until >= CURRENT_TIMESTAMP)`,
      [code]
    );
    return result.rows[0] || null;
  } catch (error) {
    logger.error("Error getting coupon by code", error, { code });
    throw error;
  }
}

export async function createCoupon(couponData: {
  code: string
  name?: string
  title?: string
  description?: string
  discountType?: "percentage" | "fixed"
  discountValue: number
  minPurchaseAmount?: number
  maxDiscountAmount?: number | null
  usageLimit?: number | null
  validFrom?: Date | null
  validUntil?: Date | null
  isActive?: boolean
}) {
  try {
    const result = await pool.query(
      `INSERT INTO coupons (code, name, title, description, discount_type, discount_value,
        min_purchase_amount, max_discount_amount, usage_limit, valid_from, valid_until, is_active,
        created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) 
       RETURNING *`,
      [
        couponData.code,
        couponData.name ?? null,
        couponData.title ?? null,
        couponData.description ?? null,
        couponData.discountType ?? "percentage",
        couponData.discountValue,
        couponData.minPurchaseAmount ?? 0,
        couponData.maxDiscountAmount ?? null,
        couponData.usageLimit ?? null,
        couponData.validFrom ?? null,
        couponData.validUntil ?? null,
        couponData.isActive !== false,
      ]
    );
    return result.rows[0];
  } catch (error) {
    logger.error("Error creating coupon", error, { couponData });
    throw error;
  }
}

export async function applyCoupon(userId: number, couponCode: string) {
  const client: PoolClient = await pool.connect();
  try {
    await client.query('BEGIN');

    const couponResult = await client.query(
      `SELECT * FROM coupons
       WHERE code = $1 AND is_active = TRUE
         AND (valid_from IS NULL OR valid_from <= CURRENT_TIMESTAMP)
         AND (valid_until IS NULL OR valid_until >= CURRENT_TIMESTAMP)
       FOR UPDATE`,
      [couponCode]
    );

    if (couponResult.rows.length === 0) {
      throw new Error("Mã coupon không hợp lệ hoặc đã hết hạn");
    }

    const coupon = couponResult.rows[0];

    if (coupon.usage_limit !== null) {
      const usedResult = await client.query(
        "SELECT COUNT(*) as cnt FROM user_coupons WHERE coupon_id = $1",
        [coupon.id]
      );
      if (parseInt(usedResult.rows[0].cnt) >= coupon.usage_limit) {
        throw new Error("Mã coupon đã hết lượt sử dụng");
      }
    }

    const existingResult = await client.query(
      "SELECT id FROM user_coupons WHERE user_id = $1 AND coupon_id = $2",
      [userId, coupon.id]
    );
    if (existingResult.rows.length > 0) {
      throw new Error("Bạn đã sử dụng mã coupon này rồi");
    }

    await client.query(
      "INSERT INTO user_coupons (user_id, coupon_id, used_at, created_at) VALUES ($1, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
      [userId, coupon.id]
    );

    await client.query('COMMIT');
    return {
      couponId: coupon.id,
      code: coupon.code,
      discountType: coupon.discount_type,
      discountValue: parseFloat(coupon.discount_value),
      maxDiscountAmount: coupon.max_discount_amount ? parseFloat(coupon.max_discount_amount) : null,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error("Error applying coupon", error, { userId, couponCode });
    throw error;
  } finally {
    client.release();
  }
}

// ============================================================
// REFERRAL FUNCTIONS
// ============================================================

export async function getReferrals(referrerId: number) {
  try {
    const result = await pool.query(
      `SELECT r.*, u.username, u.email, u.name, u.avatar_url
       FROM referrals r
       JOIN users u ON r.referred_id = u.id
       WHERE r.referrer_id = $1
       ORDER BY r.created_at DESC`,
      [referrerId]
    );
    return result.rows;
  } catch (error) {
    logger.error("Error getting referrals", error, { referrerId });
    throw error;
  }
}

export async function createReferral(referrerId: number, referredId: number) {
  if (Number(referrerId) === Number(referredId)) {
    throw new Error("Bạn không thể tự giới thiệu chính mình");
  }
  try {
    const result = await pool.query(
      "INSERT INTO referrals (referrer_id, referred_id, status, created_at) VALUES ($1, $2, 'pending', CURRENT_TIMESTAMP) RETURNING id",
      [referrerId, referredId]
    );
    return { id: result.rows[0].id, referrerId, referredId };
  } catch (error) {
    logger.error("Error creating referral", error, { referrerId, referredId });
    throw error;
  }
}

// ============================================================
// ANALYTICS & APP SETTINGS
// ============================================================

export async function trackAnalyticsEvent(eventData: {
  userId?: number | null
  eventType: string
  eventData?: Record<string, any> | null
  ipAddress?: string | null
  userAgent?: string | null
}) {
  try {
    const result = await pool.query(
      `INSERT INTO analytics_events (user_id, event_type, event_data, ip_address, user_agent, created_at)
       VALUES ($1, $2, $3::jsonb, $4, $5, CURRENT_TIMESTAMP) RETURNING id`,
      [
        eventData.userId ?? null,
        eventData.eventType,
        eventData.eventData || null,
        eventData.ipAddress ?? null,
        eventData.userAgent ?? null,
      ]
    );
    return { id: result.rows[0].id };
  } catch (error) {
    logger.error("Error tracking analytics event", error, { eventData });
    return null;
  }
}

export async function createAppSetting(settingData: {
  key: string
  value: string
  description?: string
}) {
  try {
    const result = await pool.query(
      "INSERT INTO app_settings (setting_key, setting_value, description, created_at, updated_at) VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) RETURNING id",
      [settingData.key, settingData.value, settingData.description || null]
    );
    return { id: result.rows[0].id };
  } catch (error) {
    logger.error("Error creating app setting", error, { settingData });
    return null;
  }
}

export async function trackProductView(productId: number, ipAddress?: string) {
  try {
    await pool.query(
      `INSERT INTO product_views (product_id, ip_address, viewed_at)
       VALUES ($1, $2, CURRENT_TIMESTAMP)`,
      [productId, ipAddress || null]
    );
  } catch (error) {
    logger.error("Error tracking product view", error, { productId });
  }
}

export async function getProductViewCount(productId: number): Promise<number> {
  try {
    const result = await pool.query(
      "SELECT COUNT(*) as count FROM product_views WHERE product_id = $1",
      [productId]
    );
    return parseInt(result.rows[0].count);
  } catch (error) {
    logger.error("Error getting product view count", error, { productId });
    return 0;
  }
}

// ============================================================
// BUNDLE FUNCTIONS
// ============================================================

export async function getBundles(isActive?: boolean) {
  try {
    let query = `
      SELECT b.*,
             COUNT(bp.product_id) as product_count
      FROM bundles b
      LEFT JOIN bundle_products bp ON b.id = bp.bundle_id
    `;
    const params: any[] = [];

    if (isActive !== undefined) {
      query += ' WHERE b.is_active = $1';
      params.push(isActive);
    }

    query += ' GROUP BY b.id ORDER BY b.created_at DESC';

    const result = await pool.query(query, params);
    return result.rows;
  } catch (error) {
    logger.error("Error getting bundles", error);
    throw error;
  }
}

export async function getBundleById(bundleId: number) {
  try {
    const result = await pool.query(
      "SELECT * FROM bundles WHERE id = $1",
      [bundleId]
    );
    return result.rows[0] || null;
  } catch (error) {
    logger.error("Error getting bundle by ID", error, { bundleId });
    throw error;
  }
}

export async function getBundleWithProducts(bundleId: number) {
  try {
    const bundleRes = await pool.query(
      'SELECT * FROM bundles WHERE id = $1',
      [bundleId]
    );

    if (bundleRes.rows.length === 0) return null;

    const productRes = await pool.query(
      `SELECT p.*
       FROM products p
       JOIN bundle_products bp ON p.id = bp.product_id
       WHERE bp.bundle_id = $1 AND p.deleted_at IS NULL`,
      [bundleId]
    );

    return {
      ...bundleRes.rows[0],
      products: productRes.rows,
    };
  } catch (error) {
    logger.error('Error getting bundle with products', error, { bundleId });
    throw error;
  }
}

// ============================================================
// REVIEW VOTES FUNCTIONS
// ============================================================

export async function voteReview(reviewId: number, userId: number, isHelpful: boolean) {
  return await withTransaction(async (client) => {
    await client.query(
      `INSERT INTO review_votes (review_id, user_id, is_helpful)
       VALUES ($1, $2, $3)
       ON CONFLICT (review_id, user_id) 
       DO UPDATE SET is_helpful = EXCLUDED.is_helpful, updated_at = CURRENT_TIMESTAMP`,
      [reviewId, userId, isHelpful]
    );

    // Sync helpful_count to reviews table
    await client.query(
      `UPDATE reviews 
       SET helpful_count = (
         SELECT COUNT(*) FROM review_votes 
         WHERE review_id = $1 AND is_helpful = true
       )
       WHERE id = $1`,
      [reviewId]
    );

    const checkRes = await client.query(
      'SELECT id FROM review_votes WHERE review_id = $1 AND user_id = $2',
      [reviewId, userId]
    );
    return checkRes.rows[0] || null;
  });
}

// ============================================================
// BANNER FUNCTIONS
// ============================================================

export async function createBanner(bannerData: {
  title: string
  imageUrl: string
  link?: string
  isActive?: boolean
}) {
  try {
    const result = await pool.query(
      `INSERT INTO banners (title, image_url, link, is_active, created_at)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP) RETURNING id`,
      [
        bannerData.title,
        bannerData.imageUrl,
        bannerData.link || null,
        bannerData.isActive !== false,
      ]
    );
    return { id: result.rows[0].id };
  } catch (error) {
    logger.error("Error creating banner", error, { bannerData });
    throw error;
  }
}

// ============================================================
// ADMIN ACTION FUNCTIONS
// ============================================================

export async function createAdminAction(actionData: {
  adminId: number
  action: string
  targetType?: string
  targetId?: string
  details?: Record<string, any>
}) {
  try {
    const result = await pool.query(
      `INSERT INTO admin_actions (admin_id, action, target_type, target_id, details, created_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, CURRENT_TIMESTAMP) RETURNING id`,
      [
        actionData.adminId,
        actionData.action,
        actionData.targetType || null,
        actionData.targetId || null,
        actionData.details || null,
      ]
    );
    return { id: result.rows[0].id };
  } catch (error) {
    logger.error("Error creating admin action", error, { actionData });
    throw error;
  }
}

export async function getAdminActions(limit: number = 50) {
  try {
    const result = await pool.query(
      `SELECT aa.*, u.username as admin_name, u.email as admin_email
       FROM admin_actions aa
       JOIN users u ON aa.admin_id = u.id
       ORDER BY aa.created_at DESC LIMIT $1`,
      [limit]
    );
    return result.rows;
  } catch (error) {
    logger.error("Error getting admin actions", error);
    throw error;
  }
}

// ============================================================
// NOTIFICATION FUNCTIONS
// ============================================================

export async function createNotification(data: {
  userId: number;
  type: string;
  message: string;
  isRead?: boolean;
}) {
  try {
    const result = await pool.query(
      `INSERT INTO notifications (user_id, type, message, is_read, created_at)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
       RETURNING *`,
      [data.userId, data.type, data.message, data.isRead ?? false]
    );
    return result.rows[0];
  } catch (error) {
    logger.error("Error creating notification", error, data);
    throw error;
  }
}

export async function getNotifications(userId: number, limit: number = 20) {
  try {
    const result = await pool.query(
      `SELECT * FROM notifications 
       WHERE user_id = $1 
       ORDER BY created_at DESC 
       LIMIT $2`,
      [userId, limit]
    );
    return result.rows;
  } catch (error) {
    logger.error("Error getting notifications", error, { userId });
    throw error;
  }
}

// ============================================================
// SUBSCRIPTION FUNCTIONS
// ============================================================

export async function getUserSubscription(userId: number) {
  try {
    const result = await pool.query(
      `SELECT s.*, sb.*
       FROM subscriptions s
       LEFT JOIN subscription_benefits sb ON s.plan = sb.plan
       WHERE s.user_id = $1 AND s.status = 'active'
       ORDER BY s.start_date DESC
       LIMIT 1`,
      [userId]
    );
    return result.rows[0] || null;
  } catch (error) {
    logger.error('Error getting user subscription', error, { userId });
    throw error;
  }
}

export async function getSubscriptionDiscount(userId: number): Promise<number> {
  try {
    const sub = await getUserSubscription(userId);
    return sub ? parseFloat(sub.discount_percent || '0') : 0;
  } catch (error) {
    return 0;
  }
}
