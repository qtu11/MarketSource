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

// Thêm function để validate database connection
function validateDatabaseConfig() {
  if (!process.env.DATABASE_URL && !process.env.DB_PASSWORD) {
    if (isServerless || shouldSkipDbTest || isBuildTime) {
      // Trong serverless/build, log warning nhưng không throw để build không fail
      logger.warn('Database configuration missing. Skipping PostgreSQL connection initialization during build/serverless environment.');
      return false;
    }
    throw new Error('Database configuration is required. Please set DATABASE_URL or DB_* environment variables.');
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

  // ✅ FIX: Ưu tiên DATABASE_URL hoặc NETLIFY_DATABASE_URL (Netlify specific)
  let databaseUrl = process.env.DATABASE_URL || process.env.NETLIFY_DATABASE_URL;

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
            rejectUnauthorized: false,
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
  if (!process.env.DB_PASSWORD) {
    throw new Error('DB_PASSWORD environment variable is required. Please set it in your .env file.');
  }

  // ✅ FIX IPv4: Tự động dùng port 6543 (Session Pooler) nếu port 5432
  let dbPort = parseInt(process.env.DB_PORT || '5432');
  if (dbPort === 5432) {
    dbPort = 6543; // Auto-switch to Session Pooler for IPv4
    logger.info('Auto-switched DB_PORT to 6543 (Session Pooler) for IPv4 compatibility');
  }

  const config: any = {
    host: process.env.DB_HOST || 'db.qrozeqsmqvkqxqenhike.supabase.co',
    database: process.env.DB_NAME || 'postgres',
    user: process.env.DB_USER || 'qtusdev',
    password: process.env.DB_PASSWORD, // Bắt buộc, không có fallback
    port: dbPort,
    ...poolConfig,
    // ✅ SSL fallback: tương tự nhánh DATABASE_URL
    ssl: process.env.DB_SSL === 'disable'
      ? undefined
      : {
        rejectUnauthorized: false,
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

export async function query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  try {
    const result = await pool.query(sql, params);
    return result.rows as T[];
  } catch (error: any) {
    logger.error('PostgreSQL query error', error, { sql: sql.substring(0, 100) });
    throw error;
  }
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
    return result.rows.length > 0 ? result.rows[0].id : null;
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

      // Tạo user mới
      const result = await pool.query(
        `INSERT INTO users (
          email, name, username, password_hash, avatar_url, ip_address, role, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id`,
        [
          userData.email,
          userData.name || finalUsername || null,
          finalUsername,
          userData.passwordHash || null,
          userData.avatarUrl || null,
          userData.ipAddress || null,
          userData.role || 'user',
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
 * Normalize user ID: Convert Firebase UID (string) to PostgreSQL ID (number)
 * Nếu userId là number, trả về ngay
 * Nếu userId là string (uid), tìm trong database hoặc tạo mới
 */
export async function normalizeUserId(
  userId: string | number,
  userEmail?: string
): Promise<number | null> {
  try {
    // Nếu đã là number, trả về ngay
    if (typeof userId === 'number') {
      return userId;
    }

    // Nếu là string (Firebase UID), tìm trong database qua email
    if (userEmail) {
      const dbUserId = await getUserIdByEmail(userEmail);
      if (dbUserId) {
        return dbUserId;
      }
    }

    // Nếu không tìm thấy, return null (user chưa tồn tại trong PostgreSQL)
    return null;
  } catch (error) {
    logger.error('Error normalizing user ID', error, { userId, userEmail });
    return null;
  }
}

// ============================================================
// DEPOSIT FUNCTIONS
// ============================================================

export async function getDeposits(userId?: number) {
  try {
    let query = `
      SELECT d.*, u.email, u.username
      FROM deposits d
      LEFT JOIN users u ON d.user_id = u.id
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
}) {
  try {
    const dbUserId = await normalizeUserId(depositData.userId, depositData.userEmail);

    if (!dbUserId) {
      throw new Error('Cannot resolve user ID. User may not exist in database.');
    }

    // ✅ FIX: Kiểm tra xem cột transaction_id có tồn tại không
    // Nếu không có, chỉ insert các cột cơ bản
    let hasTransactionId = false;
    try {
      const checkResult = await pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'deposits' 
        AND column_name = 'transaction_id'
      `);
      hasTransactionId = checkResult.rows.length > 0;
    } catch (checkError) {
      // Nếu không check được, giả định không có cột này
      hasTransactionId = false;
    }

    // Insert với hoặc không có transaction_id tùy theo schema
    let result;
    if (hasTransactionId) {
      result = await pool.query(
        `INSERT INTO deposits (user_id, amount, method, transaction_id, user_email, user_name, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending')
         RETURNING id, timestamp`,
        [
          dbUserId,
          depositData.amount,
          depositData.method,
          depositData.transactionId || null,
          depositData.userEmail || null,
          depositData.userName || null,
        ]
      );
    } else {
      // Schema không có transaction_id, chỉ insert các cột cơ bản
      result = await pool.query(
        `INSERT INTO deposits (user_id, amount, method, user_email, user_name, status)
         VALUES ($1, $2, $3, $4, $5, 'pending')
         RETURNING id, timestamp`,
        [
          dbUserId,
          depositData.amount,
          depositData.method,
          depositData.userEmail || null,
          depositData.userName || null,
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

    const currentBalance = parseFloat(userResult.rows[0].balance || '0');
    const newBalance = currentBalance + amount;

    // Update deposit status
    await client.query(
      `UPDATE deposits 
       SET status = 'approved', 
           approved_time = CURRENT_TIMESTAMP, 
           approved_by = $1 
       WHERE id = $2 AND status = 'pending'`,
      [approvedBy, depositId]
    );

    // Update user balance
    await client.query(
      'UPDATE users SET balance = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [newBalance, userId]
    );

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
}) {
  const client: PoolClient = await pool.connect();
  try {
    const dbUserId = await normalizeUserId(withdrawalData.userId, withdrawalData.userEmail);

    if (!dbUserId) {
      throw new Error('Cannot resolve user ID.');
    }

    await client.query('BEGIN');

    // ✅ FIX: Lock user row để tránh race condition khi check balance
    const userResult = await client.query(
      'SELECT balance FROM users WHERE id = $1 FOR UPDATE',
      [dbUserId]
    );

    if (userResult.rows.length === 0) {
      throw new Error('User not found');
    }

    const currentBalance = parseFloat(userResult.rows[0].balance || '0');

    if (currentBalance < withdrawalData.amount) {
      await client.query('ROLLBACK');
      throw new Error('Insufficient balance');
    }

    // ✅ FIX: Check có withdrawal pending nào không (optional - tùy business logic)
    const pendingWithdrawals = await client.query(
      'SELECT id FROM withdrawals WHERE user_id = $1 AND status = $2',
      [dbUserId, 'pending']
    );

    if (pendingWithdrawals.rows.length > 0) {
      await client.query('ROLLBACK');
      throw new Error('You have a pending withdrawal request. Please wait for approval.');
    }

    // Insert withdrawal trong cùng transaction
    const result = await client.query(
      `INSERT INTO withdrawals (user_id, amount, bank_name, account_number, account_name, user_email, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending')
       RETURNING id, created_at`,
      [
        dbUserId,
        withdrawalData.amount,
        withdrawalData.bankName,
        withdrawalData.accountNumber,
        withdrawalData.accountName,
        withdrawalData.userEmail || null,
      ]
    );

    await client.query('COMMIT');

    return {
      id: result.rows[0].id,
      createdAt: result.rows[0].created_at,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error creating withdrawal', error, {
      userId: withdrawalData.userId,
      amount: withdrawalData.amount
    });
    throw error;
  } finally {
    client.release();
  }
}

export async function updateWithdrawalStatus(
  withdrawalId: number,
  status: 'pending' | 'approved' | 'rejected',
  approvedBy?: string
) {
  try {
    // ✅ FIX: Whitelist updates để tránh SQL injection
    const updates: string[] = [];
    const params: any[] = [withdrawalId];
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
        `UPDATE withdrawals SET ${updates.join(', ')} WHERE id = $1`,
        params
      );
    }
  } catch (error) {
    logger.error('Error updating withdrawal status', error, { withdrawalId, status });
    throw error;
  }
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
  const client: PoolClient = await pool.connect();
  try {
    await client.query('BEGIN');

    // ✅ FIX: Lock withdrawal row và check status để tránh double approval
    const withdrawalResult = await client.query(
      'SELECT id, user_id, amount, status FROM withdrawals WHERE id = $1 FOR UPDATE',
      [withdrawalId]
    );

    if (withdrawalResult.rows.length === 0) {
      throw new Error('Withdrawal not found');
    }

    const withdrawal = withdrawalResult.rows[0];

    // ✅ FIX: Check withdrawal đã được approve chưa
    if (withdrawal.status === 'approved') {
      throw new Error('Withdrawal has already been approved');
    }

    if (withdrawal.status === 'rejected') {
      throw new Error('Withdrawal has been rejected and cannot be approved');
    }

    // ✅ FIX: Validate userId và amount match với withdrawal
    if (withdrawal.user_id !== userId) {
      throw new Error('User ID mismatch with withdrawal');
    }

    // ✅ FIX: So sánh amount với epsilon cho PostgreSQL decimal
    if (Math.abs(parseFloat(withdrawal.amount) - Number(amount)) > 0.01) {
      throw new Error('Amount mismatch with withdrawal');
    }

    // Lock user row
    const userResult = await client.query(
      'SELECT balance FROM users WHERE id = $1 FOR UPDATE',
      [userId]
    );

    if (userResult.rows.length === 0) {
      throw new Error('User not found');
    }

    const currentBalance = parseFloat(userResult.rows[0].balance || '0');

    if (currentBalance < amount) {
      throw new Error('Insufficient balance');
    }

    const newBalance = currentBalance - amount;

    // Update withdrawal status
    await client.query(
      `UPDATE withdrawals 
       SET status = 'approved', 
           approved_time = CURRENT_TIMESTAMP, 
           approved_by = $1 
       WHERE id = $2 AND status = 'pending'`,
      [approvedBy, withdrawalId]
    );

    // Update user balance
    await client.query(
      'UPDATE users SET balance = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [newBalance, userId]
    );

    await client.query('COMMIT');

    return {
      success: true,
      newBalance,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error approving withdrawal', error, { withdrawalId, userId, amount });
    throw error;
  } finally {
    client.release();
  }
}

// ============================================================
// PURCHASE FUNCTIONS
// ============================================================

export async function getPurchases(userId?: number) {
  try {
    let query = `
      SELECT p.*, pr.title as product_title, pr.price, u.email, u.username
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
  const client: PoolClient = await pool.connect();
  try {
    const dbUserId = await normalizeUserId(purchaseData.userId, purchaseData.userEmail);
    const productIdNum = typeof purchaseData.productId === 'number'
      ? purchaseData.productId
      : parseInt(purchaseData.productId.toString(), 10);

    if (!dbUserId) {
      throw new Error('Cannot resolve user ID.');
    }

    await client.query('BEGIN');

    // 1. Lock user row để tránh race condition tài chính và mua trùng
    const userResult = await client.query(
      'SELECT balance FROM users WHERE id = $1 FOR UPDATE',
      [dbUserId]
    );

    if (userResult.rows.length === 0) {
      throw new Error('User not found');
    }

    const currentBalance = parseFloat(userResult.rows[0].balance || '0');

    // 2. Check xem đã mua sản phẩm này chưa (Tránh race condition mua trùng)
    const existingPurchase = await client.query(
      'SELECT id FROM purchases WHERE user_id = $1 AND product_id = $2',
      [dbUserId, productIdNum]
    );

    if (existingPurchase.rows.length > 0) {
      throw new Error('Bạn đã mua sản phẩm này rồi');
    }

    // 3. Lấy thông tin sản phẩm
    const productResult = await client.query(
      'SELECT id, price, is_active FROM products WHERE id = $1 AND deleted_at IS NULL',
      [productIdNum]
    );

    if (productResult.rows.length === 0) {
      throw new Error('Sản phẩm không tồn tại hoặc đã bị xóa');
    }

    const product = productResult.rows[0];

    if (!product.is_active) {
      throw new Error('Sản phẩm hiện không còn khả dụng');
    }

    const price = parseFloat(product.price);
    const finalPurchasePrice = price; // Mặc định mua 1 bản

    // 4. Kiểm tra số dư
    if (currentBalance < finalPurchasePrice) {
      throw new Error(`Số dư không đủ. Cần ${finalPurchasePrice.toLocaleString('vi-VN')}đ, hiện có ${currentBalance.toLocaleString('vi-VN')}đ`);
    }

    const newBalance = currentBalance - finalPurchasePrice;

    // 5. Tạo bản ghi mua hàng
    const purchaseResult = await client.query(
      'INSERT INTO purchases (user_id, product_id, amount) VALUES ($1, $2, $3) RETURNING id',
      [dbUserId, productIdNum, finalPurchasePrice]
    );

    // 6. Cập nhật số dư atomically
    await client.query(
      'UPDATE users SET balance = balance - $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND balance >= $1',
      [finalPurchasePrice, dbUserId]
    );

    await client.query('COMMIT');

    return {
      id: Number(purchaseResult.rows[0].id),
      newBalance: newBalance,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error creating purchase', error, {
      userId: purchaseData.userId,
      productId: purchaseData.productId,
      amount: purchaseData.amount
    });
    throw error;
  } finally {
    client.release();
  }
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
// NOTIFICATION FUNCTIONS
// ============================================================

export async function createNotification(notificationData: {
  userId: number;
  type: string;
  message: string;
  isRead?: boolean;
}) {
  try {
    const result = await pool.query(
      `INSERT INTO notifications (user_id, type, message, is_read, created_at)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
       RETURNING id, created_at`,
      [
        notificationData.userId,
        notificationData.type,
        notificationData.message,
        notificationData.isRead || false,
      ]
    );

    return {
      id: result.rows[0].id,
      createdAt: result.rows[0].created_at,
    };
  } catch (error) {
    logger.error('Error creating notification', error, {
      userId: notificationData.userId,
      type: notificationData.type
    });
    throw error;
  }
}

export async function getNotifications(userId?: number, isRead?: boolean) {
  try {
    let query = 'SELECT * FROM notifications WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;

    if (userId) {
      query += ` AND user_id = $${paramIndex}`;
      params.push(userId);
      paramIndex++;
    }

    if (isRead !== undefined) {
      query += ` AND is_read = $${paramIndex}`;
      params.push(isRead);
      paramIndex++;
    }

    query += ' ORDER BY created_at DESC';

    const result = await pool.query(query, params);
    return result.rows;
  } catch (error) {
    logger.error('Error getting notifications', error, { userId, isRead });
    throw error;
  }
}

export async function markNotificationAsRead(notificationId: number, userId: number) {
  try {
    const result = await pool.query(
      'UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2 RETURNING id',
      [notificationId, userId]
    );
    return result.rows[0] || null;
  } catch (error) {
    logger.error('Error marking notification as read', error, { notificationId, userId });
    throw error;
  }
}

// ============================================================
// PASSWORD RESET FUNCTIONS
// ============================================================

export async function deletePasswordResetTokens(userId: number) {
  try {
    await pool.query('DELETE FROM password_resets WHERE user_id = $1', [userId]);
  } catch (error) {
    logger.error('Error deleting password reset tokens', error, { userId });
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
      `INSERT INTO password_resets (user_id, token, expires_at, created_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)`,
      [userId, token, expiresAt]
    );
  } catch (error) {
    logger.error('Error creating password reset token', error, { userId });
    throw error;
  }
}

export async function findValidPasswordResetToken(token: string) {
  try {
    const result = await pool.query(
      `SELECT pr.*, u.email, u.id as user_id
       FROM password_resets pr
       JOIN users u ON pr.user_id = u.id
       WHERE pr.token = $1
         AND pr.expires_at > NOW()`,
      [token]
    );
    return result.rows[0] || null;
  } catch (error) {
    logger.error('Error finding password reset token', error, { token });
    throw error;
  }
}

export async function consumePasswordResetToken(token: string) {
  try {
    await pool.query('DELETE FROM password_resets WHERE token = $1', [token]);
  } catch (error) {
    logger.error('Error consuming password reset token', error, { token });
    throw error;
  }
}

export async function updateUserPasswordHash(userId: number, passwordHash: string) {
  try {
    await pool.query(
      'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [passwordHash, userId]
    );
  } catch (error) {
    logger.error('Error updating user password', error, { userId });
    throw error;
  }
}

