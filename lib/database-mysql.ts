// lib/database-mysql.ts
// Layer kết nối MySQL + một số hàm core (user, deposit, withdrawal, purchase, product).
// Env yêu cầu:
// MYSQL_HOST, MYSQL_PORT, MYSQL_DATABASE, MYSQL_USER, MYSQL_PASSWORD

import mysql from "mysql2/promise"
import { logger } from "./logger"
import * as pg from "./database"

const isServerless =
  process.env.VERCEL === "1" ||
  process.env.AWS_LAMBDA_FUNCTION_NAME ||
  process.env.NETLIFY === "true"

// ✅ BRIDGE MODE: Chuyển hướng sang PostgreSQL nếu thiếu MySQL config
const usePostgresBridge = !process.env.MYSQL_HOST;

type Pool = ReturnType<typeof mysql.createPool>
type PoolConnection = Awaited<ReturnType<Pool['getConnection']>>

// (Removed duplicate let pool definition to fix redeclaration error)

function createPool(): Pool {
  if (usePostgresBridge) {
    logger.info("MySQL host missing, using PostgreSQL bridge mode");

    // Tạo dummy pool proxy để hỗ trợ execute và query
    const bridgePool = {
      query: async (sql: string, params: any[] = []) => {
        const pgSql = convertToPostgresSql(sql);
        const rows = await pg.query(pgSql, params);
        return [rows, []]; // Trả về dạng [rows, fields]
      },
      execute: async (sql: string, params: any[] = []) => {
        const pgSql = convertToPostgresSql(sql);
        const rows = await pg.query(pgSql, params);

        // Giả lập result cho INSERT/UPDATE/DELETE
        const result: any = {
          insertId: rows.length > 0 ? (rows[0] as any).id || 0 : 0,
          affectedRows: rows.length,
          warningStatus: 0,
        };

        return [result, []];
      },
      getConnection: async () => {
        return {
          query: bridgePool.query,
          execute: bridgePool.execute,
          beginTransaction: async () => { },
          commit: async () => { },
          rollback: async () => { },
          release: () => { },
        } as any;
      },
      end: async () => { },
    } as any;

    return bridgePool;
  }

  if (!process.env.MYSQL_DATABASE) throw new Error("MYSQL_DATABASE is required")
  if (!process.env.MYSQL_USER) throw new Error("MYSQL_USER is required")
  if (!process.env.MYSQL_PASSWORD) throw new Error("MYSQL_PASSWORD is required")

  const connectionLimit = isServerless ? 1 : 10

  const newPool = mysql.createPool({
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT || 3306),
    database: process.env.MYSQL_DATABASE,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    connectionLimit,
    waitForConnections: true,
    queueLimit: 0,
  })

  newPool
    .query("SELECT 1")
    .then(() => logger.info("MySQL connection OK"))
    .catch((err: any) => logger.error("MySQL connection test failed", err))

  return newPool
}

// ✅ FIX: Lưu trữ connection pool vào biến globalThis để tránh rò rỉ kết nối khi Hot-Reload
const globalForMysql = global as unknown as {
  mysqlPool: Pool | null;
};

let pool: Pool | null = globalForMysql.mysqlPool || null;

function getPool(): Pool {
  if (!pool) {
    pool = createPool()
    if (process.env.NODE_ENV !== 'production') {
      globalForMysql.mysqlPool = pool;
    }
  }
  return pool
}

/**
 * Chuyển đổi cú pháp SQL từ MySQL sang PostgreSQL
 * - ? → $1, $2...
 * - ON DUPLICATE KEY UPDATE → ON CONFLICT DO UPDATE SET
 * - VALUES(col) → EXCLUDED.col  
 * - INSERT IGNORE → INSERT ... ON CONFLICT DO NOTHING
 */
function convertToPostgresSql(sql: string): string {
  let converted = sql;

  // 0. Convert MySQL backticks (`) to literal double quotes (") for column names
  converted = converted.replace(/`/g, '"');

  // 1. Convert INSERT IGNORE → INSERT ... ON CONFLICT DO NOTHING
  converted = converted.replace(/INSERT\s+IGNORE\s+INTO/gi, 'INSERT INTO');
  // Note: ON CONFLICT DO NOTHING is added by addToWishlistMySQL directly

  // 2. Convert ON DUPLICATE KEY UPDATE → ON CONFLICT DO UPDATE SET
  // Extract INSERT columns to determine conflict target
  const insertMatch = converted.match(/INSERT\s+INTO\s+(\w+)\s*\(([^)]+)\)/i);
  if (insertMatch && converted.includes('ON DUPLICATE KEY UPDATE')) {
    const tableName = insertMatch[1];

    // Determine conflict column based on table
    let conflictCol = 'id';
    if (['users'].includes(tableName)) conflictCol = 'email';
    else if (['user_profiles'].includes(tableName)) conflictCol = 'user_id';
    else if (['reviews'].includes(tableName)) conflictCol = 'user_id, product_id';
    else if (['product_ratings'].includes(tableName)) conflictCol = 'product_id';
    else if (['wishlists'].includes(tableName)) conflictCol = 'user_id, product_id';
    else if (['settings'].includes(tableName)) conflictCol = '"key"';
    else if (['user_coupons'].includes(tableName)) conflictCol = 'user_id, coupon_id';
    else if (['review_votes'].includes(tableName)) conflictCol = 'review_id, user_id';

    // Replace ON DUPLICATE KEY UPDATE → ON CONFLICT (col) DO UPDATE SET
    converted = converted.replace(
      /ON\s+DUPLICATE\s+KEY\s+UPDATE/gi,
      `ON CONFLICT (${conflictCol}) DO UPDATE SET`
    );

    // Replace VALUES(column_name) → EXCLUDED.column_name
    converted = converted.replace(/VALUES\s*\(\s*(\w+)\s*\)/gi, 'EXCLUDED.$1');
  }

  // 3. Convert ? → $1, $2...
  let index = 1;
  converted = converted.replace(/\?/g, () => `$${index++}`);

  // 4. ✅ FIX: Auto-add RETURNING id cho INSERT nếu chưa có (để lấy insertId)
  if (converted.trim().toUpperCase().startsWith('INSERT INTO') && !converted.toUpperCase().includes('RETURNING')) {
    converted = converted.trim() + ' RETURNING id';
  }

  return converted;
}

export async function query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  if (usePostgresBridge) {
    try {
      const pgSql = convertToPostgresSql(sql);
      const result = await pg.query(pgSql, params);

      // ✅ FIX: Nếu là INSERT, bọc kết quả để trả về insertId tương tự MySQL
      if (sql.trim().toUpperCase().startsWith('INSERT INTO')) {
        const rows = result as any[];
        const insertId = rows.length > 0 ? rows[0].id || 0 : 0;
        const affectedRows = rows.length; // PostreSQL bridge returns rows, use length as affectedRows approximation
        const fakeResult: any = {
          insertId,
          affectedRows,
          warningStatus: 0,
        };
        // MySQL .query thường trả về kết quả này thay vì rows array cho INSERT
        return fakeResult as any;
      }

      return result as T[];
    } catch (err: any) {
      logger.error("Bridge PostgreSQL: query error", err, { sql: sql.substring(0, 100) });
      throw err;
    }
  }

  try {
    const [rows] = await getPool().query(sql, params)
    return rows as T[]
  } catch (err: any) {
    logger.error("MySQL: query error", err, { sql: sql.substring(0, 100) })
    throw err
  }
}

export async function queryOne<T = any>(sql: string, params: any[] = []): Promise<T | null> {
  const rows = await query<T>(sql, params)
  return rows[0] ?? null
}

export async function withTransaction<T>(fn: (conn: PoolConnection) => Promise<T>): Promise<T> {
  if (usePostgresBridge) {
    // ✅ FIX: Sử dụng connection thật từ Postgres pool để bọc Transaction an toàn ACID
    const client = await pg.getPool().connect();
    try {
      await client.query('BEGIN');
      const dummyConn = {
        query: async (sql: string, params: any[] = []) => {
          const pgSql = convertToPostgresSql(sql);
          const result = await client.query(pgSql, params);
          return [result.rows, []]; // Giả lập trả về [rows, fields]
        },
        execute: async (sql: string, params: any[] = []) => {
          const pgSql = convertToPostgresSql(sql);
          const result = await client.query(pgSql, params);
          const fakeResult: any = {
            insertId: result.rows.length > 0 ? (result.rows[0] as any).id || 0 : 0,
            affectedRows: result.rowCount || 0,
            warningStatus: 0,
          };
          return [fakeResult, []];
        },
        beginTransaction: async () => { },
        commit: async () => { },
        rollback: async () => { },
        release: () => { },
      } as any;

      const result = await fn(dummyConn);
      await client.query('COMMIT');
      return result;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  const conn = await getPool().getConnection()
  try {
    await conn.beginTransaction()
    const result = await fn(conn)
    await conn.commit()
    return result
  } catch (e) {
    await conn.rollback()
    throw e
  } finally {
    conn.release()
  }
}


// ===================== USER =====================

export async function getUserByIdMySQL(userId: number) {
  try {
    return await queryOne<any>("SELECT * FROM users WHERE id = ? AND deleted_at IS NULL", [userId])
  } catch (err) {
    logger.error("MySQL: getUserById error", err, { userId })
    throw err
  }
}

export async function getUserByEmailMySQL(email: string) {
  try {
    return await queryOne<any>("SELECT * FROM users WHERE email = ? AND deleted_at IS NULL", [email])
  } catch (err) {
    logger.error("MySQL: getUserByEmail error", err, { email })
    throw err
  }
}

export async function getUserIdByEmailMySQL(email: string): Promise<number | null> {
  try {
    const row = await queryOne<any>("SELECT id FROM users WHERE email = ? AND deleted_at IS NULL", [email])
    return row ? Number(row.id) : null
  } catch (err) {
    logger.error("MySQL: getUserIdByEmail error", err, { email })
    return null
  }
}

export async function createOrUpdateUserMySQL(userData: {
  email: string
  name?: string
  username?: string
  passwordHash?: string
  avatarUrl?: string
  ipAddress?: string
  role?: "user" | "admin"
}) {
  try {
    // ✅ Check nếu user đã tồn tại
    const existing = await queryOne<any>("SELECT id, username FROM users WHERE email = ? AND deleted_at IS NULL", [userData.email])

    if (existing) {
      // ✅ FIX CRITICAL: Chỉ UPDATE các field được truyền vào, KHÔNG ghi đè password_hash thành null
      const updates: string[] = []
      const params: any[] = []

      if (userData.name !== undefined) {
        updates.push("name = ?")
        params.push(userData.name)
      }
      if (userData.username !== undefined) {
        updates.push("username = ?")
        params.push(userData.username)
      }
      // ✅ CHỈ update password_hash khi có giá trị cụ thể (không phải undefined/null)
      if (userData.passwordHash) {
        updates.push("password_hash = ?")
        params.push(userData.passwordHash)
      }
      if (userData.avatarUrl !== undefined) {
        updates.push("avatar_url = ?")
        params.push(userData.avatarUrl)
      }
      if (userData.ipAddress) {
        updates.push("ip_address = ?")
        params.push(userData.ipAddress)
      }
      if (userData.role !== undefined) {
        updates.push("role = ?")
        params.push(userData.role)
      }

      updates.push("updated_at = NOW()")
      params.push(existing.id)

      if (updates.length > 1) {
        await query(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`, params)
      }

      return { id: Number(existing.id), isNew: false }
    } else {
      // INSERT user mới
      let finalUsername = userData.username || userData.name || `user_${Date.now()}`

      const existingByUsername = await queryOne<any>(
        "SELECT id FROM users WHERE username = ?",
        [finalUsername],
      )
      if (existingByUsername) {
        finalUsername = `${finalUsername}_${Date.now()}_${Math.floor(Math.random() * 1000)}`
      }

      await query(
        `INSERT INTO users (email, name, username, password_hash, avatar_url, ip_address, role, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          userData.email,
          userData.name || finalUsername,
          finalUsername,
          userData.passwordHash || null,
          userData.avatarUrl || null,
          userData.ipAddress || null,
          userData.role || "user",
        ]
      )

      const row = await queryOne<any>("SELECT id FROM users WHERE email = ?", [userData.email])
      if (!row) throw new Error("Failed to create user")

      return { id: Number(row.id), isNew: true }
    }
  } catch (err) {
    logger.error("MySQL: createOrUpdateUser error", err, { email: userData.email })
    throw err
  }
}

export async function normalizeUserIdMySQL(
  userId: string | number,
  userEmail?: string,
): Promise<number | null> {
  try {
    if (typeof userId === "number") return userId
    if (userEmail) {
      const id = await getUserIdByEmailMySQL(userEmail)
      if (id) return id
    }
    return null
  } catch (err) {
    logger.error("MySQL: normalizeUserId error", err, { userId, userEmail })
    return null
  }
}

// ===================== DEPOSITS =====================

export async function getDepositsMySQL(userId?: number) {
  try {
    let sql = `
      SELECT d.*, u.email, u.username
      FROM deposits d
      LEFT JOIN users u ON d.user_id = u.id
    `
    const params: any[] = []
    if (userId) {
      sql += " WHERE d.user_id = ?"
      params.push(userId)
    }
    sql += " ORDER BY d.timestamp DESC"
    return await query<any>(sql, params)
  } catch (err) {
    logger.error("MySQL: getDeposits error", err, { userId })
    throw err
  }
}

export async function createDepositMySQL(depositData: {
  userId: string | number
  amount: number
  method: string
  transactionId?: string | null
  userEmail?: string
  userName?: string
}) {
  return withTransaction(async (conn) => {
    const dbUserId = await normalizeUserIdMySQL(depositData.userId, depositData.userEmail)
    if (!dbUserId) throw new Error("Cannot resolve user ID")

    let insertId: number;
    const hasTransactionId = !!depositData.transactionId;

    if (usePostgresBridge) {
      if (hasTransactionId) {
        const result = await conn.query(
          `INSERT INTO deposits (user_id, amount, method, transaction_id, user_email, user_name, status, timestamp)
           VALUES (?, ?, ?, ?, ?, ?, 'pending', NOW()) RETURNING id`,
          [
            dbUserId,
            depositData.amount,
            depositData.method,
            depositData.transactionId || null,
            depositData.userEmail || null,
            depositData.userName || null,
          ]
        )
        insertId = (result[0] as any[])[0]?.id;
      } else {
        const result = await conn.query(
          `INSERT INTO deposits (user_id, amount, method, user_email, user_name, status, timestamp)
           VALUES (?, ?, ?, ?, ?, 'pending', NOW()) RETURNING id`,
          [
            dbUserId,
            depositData.amount,
            depositData.method,
            depositData.userEmail || null,
            depositData.userName || null,
          ]
        )
        insertId = (result[0] as any[])[0]?.id;
      }
    } else {
      let result;
      if (hasTransactionId) {
        result = await conn.execute(
          `INSERT INTO deposits (user_id, amount, method, transaction_id, user_email, user_name, status, timestamp)
           VALUES (?, ?, ?, ?, ?, ?, 'pending', NOW())`,
          [
            dbUserId,
            depositData.amount,
            depositData.method,
            depositData.transactionId || null,
            depositData.userEmail || null,
            depositData.userName || null,
          ]
        )
      } else {
        result = await conn.execute(
          `INSERT INTO deposits (user_id, amount, method, user_email, user_name, status, timestamp)
           VALUES (?, ?, ?, ?, ?, 'pending', NOW())`,
          [
            dbUserId,
            depositData.amount,
            depositData.method,
            depositData.userEmail || null,
            depositData.userName || null,
          ]
        )
      }
      insertId = (result[0] as any).insertId;
    }

    return { id: insertId, timestamp: new Date().toISOString() }
  })
}

export async function approveDepositAndUpdateBalanceMySQL(
  depositId: number,
  userId: number,
  amount: number,
  approvedBy: string,
) {
  return withTransaction(async (conn) => {
    const [depRows]: any = await conn.query(
      "SELECT id, user_id, amount, status FROM deposits WHERE id = ? FOR UPDATE",
      [depositId],
    )
    const deposit = depRows[0]
    if (!deposit) throw new Error("Không tìm thấy yêu cầu nạp tiền")
    if (deposit.status === "approved") throw new Error("Yêu cầu nạp tiền này đã được duyệt trước đó")
    if (deposit.status === "rejected") throw new Error("Yêu cầu nạp tiền này đã bị từ chối")
    if (Number(deposit.user_id) !== Number(userId)) throw new Error("User ID không khớp")
    if (Math.abs(Number(deposit.amount) - Number(amount)) > 0.01) throw new Error("Số tiền không khớp với yêu cầu nạp")

    const [userRows]: any = await conn.query(
      "SELECT balance FROM users WHERE id = ? FOR UPDATE",
      [userId],
    )
    const currentBalance = Number(userRows[0]?.balance || 0)
    const newBalance = currentBalance + amount

    await conn.query(
      `UPDATE deposits
       SET status = 'approved',
           approved_time = NOW(),
           approved_by = ?
       WHERE id = ? AND status = 'pending'`,
      [approvedBy, depositId],
    )

    await conn.query(
      "UPDATE users SET balance = ?, updated_at = NOW() WHERE id = ?",
      [newBalance, userId],
    )

    return { success: true, newBalance }
  })
}

export async function updateDepositStatusMySQL(
  depositId: number,
  status: 'pending' | 'approved' | 'rejected',
  approvedBy?: string
) {
  try {
    const updates: string[] = []
    const params: any[] = []

    updates.push('status = ?')
    params.push(status)

    if (status === 'approved' && approvedBy) {
      updates.push('approved_time = NOW()')
      updates.push('approved_by = ?')
      params.push(approvedBy)
    }

    params.push(depositId)

    if (updates.length > 0) {
      await query(
        `UPDATE deposits SET ${updates.join(', ')} WHERE id = ?`,
        params
      )
    }
  } catch (err) {
    logger.error('MySQL: updateDepositStatus error', err, { depositId, status })
    throw err
  }
}

// ===================== WITHDRAWALS =====================

export async function getWithdrawalsMySQL(userId?: number) {
  try {
    let sql = `
      SELECT w.*, u.email, u.username
      FROM withdrawals w
      LEFT JOIN users u ON w.user_id = u.id
    `
    const params: any[] = []
    if (userId) {
      sql += " WHERE w.user_id = ?"
      params.push(userId)
    }
    sql += " ORDER BY w.created_at DESC"
    return await query<any>(sql, params)
  } catch (err) {
    logger.error("MySQL: getWithdrawals error", err, { userId })
    throw err
  }
}

export async function createWithdrawalMySQL(withdrawalData: {
  userId: string | number
  amount: number
  bankName: string
  accountNumber: string
  accountName: string
  userEmail?: string
}) {
  return withTransaction(async (conn) => {
    const dbUserId = await normalizeUserIdMySQL(withdrawalData.userId, withdrawalData.userEmail)
    if (!dbUserId) throw new Error("Cannot resolve user ID")

    const [userRows]: any = await conn.query(
      "SELECT balance FROM users WHERE id = ? FOR UPDATE",
      [dbUserId],
    )
    const currentBalance = Number(userRows[0]?.balance || 0)
    if (currentBalance < withdrawalData.amount) throw new Error("Insufficient balance")

    const [pending]: any = await conn.query(
      "SELECT id FROM withdrawals WHERE user_id = ? AND status = 'pending'",
      [dbUserId],
    )
    if (pending.length > 0) {
      throw new Error("You have a pending withdrawal request. Please wait for approval.")
    }

    // ✅ FIX: Trừ tiền user_balance ngay lập tức atomically
    await conn.query(
      "UPDATE users SET balance = balance - ?, updated_at = NOW() WHERE id = ? AND balance >= ?",
      [withdrawalData.amount, dbUserId, withdrawalData.amount]
    )

    let insertId: number;

    if (usePostgresBridge) {
      const result = await conn.query(
        `INSERT INTO withdrawals (
          user_id, amount, bank_name, account_number, account_name, user_email, status, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, 'pending', NOW()) RETURNING id`,
        [
          dbUserId,
          withdrawalData.amount,
          withdrawalData.bankName,
          withdrawalData.accountNumber,
          withdrawalData.accountName,
          withdrawalData.userEmail || null,
        ]
      )
      insertId = (result[0] as any[])[0]?.id;
    } else {
      const [result]: any = await conn.query(
        `INSERT INTO withdrawals (
          user_id, amount, bank_name, account_number, account_name, user_email, status, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, 'pending', NOW())`,
        [
          dbUserId,
          withdrawalData.amount,
          withdrawalData.bankName,
          withdrawalData.accountNumber,
          withdrawalData.accountName,
          withdrawalData.userEmail || null,
        ]
      )
      insertId = (result as any).insertId;
    }

    return { id: insertId, createdAt: new Date().toISOString() }
  })
}

export async function approveWithdrawalAndUpdateBalanceMySQL(
  withdrawalId: number,
  userId: number,
  amount: number,
  approvedBy: string,
) {
  return withTransaction(async (conn) => {
    const [wRows]: any = await conn.query(
      "SELECT id, user_id, amount, status FROM withdrawals WHERE id = ? FOR UPDATE",
      [withdrawalId],
    )
    const withdrawal = wRows[0]
    if (!withdrawal) throw new Error("Withdrawal not found")
    if (withdrawal.status === "approved") throw new Error("Withdrawal has already been approved")
    if (withdrawal.status === "rejected") throw new Error("Withdrawal has been rejected")
    if (Number(withdrawal.user_id) !== Number(userId)) throw new Error("User ID mismatch with withdrawal")
    // ✅ FIX: So sánh amount với epsilon để tránh sai lệch kiểu decimal/string từ PostgreSQL
    if (Math.abs(Number(withdrawal.amount) - Number(amount)) > 0.01) throw new Error("Amount mismatch with withdrawal")

    const [userRows]: any = await conn.query(
      "SELECT balance FROM users WHERE id = ?",
      [userId],
    )
    const currentBalance = Number(userRows[0]?.balance || 0)

    await conn.query(
      `UPDATE withdrawals
       SET status = 'approved',
           approved_time = NOW(),
           approved_by = ?
       WHERE id = ? AND status = 'pending'`,
      [approvedBy, withdrawalId],
    )

    return { success: true, newBalance: currentBalance }
  })
}

export async function updateWithdrawalStatusMySQL(
  withdrawalId: number,
  status: 'pending' | 'approved' | 'rejected',
  approvedBy?: string
) {
  // ✅ FIX: Dùng transaction để đảm bảo hoàn tiền nếu rejected
  return withTransaction(async (conn) => {
    const [withdrawalRows]: any = await conn.query(
      'SELECT user_id, amount, status FROM withdrawals WHERE id = ? FOR UPDATE',
      [withdrawalId]
    )

    if (withdrawalRows.length === 0) {
      throw new Error('Withdrawal not found')
    }

    const withdrawal = withdrawalRows[0]

    // Không làm gì nếu status không đổi
    if (withdrawal.status === status) return

    // Nếu chuyển từ pending -> rejected, tự động Refund tiền cho User
    if (withdrawal.status === 'pending' && status === 'rejected') {
      await conn.query(
        'UPDATE users SET balance = balance + ?, updated_at = NOW() WHERE id = ?',
        [withdrawal.amount, withdrawal.user_id]
      )
    }

    // Nếu lệnh trước đó đã bị rejected (đã hoàn lại tiền), nay được cập nhật thành pending/approved -> Phải trừ tiền lại
    if (withdrawal.status === 'rejected' && (status === 'pending' || status === 'approved')) {
      // Khóa dòng user để kiểm tra số dư
      const [userRows]: any = await conn.query(
        'SELECT balance FROM users WHERE id = ? FOR UPDATE',
        [withdrawal.user_id]
      )
      const currentBalance = Number(userRows[0]?.balance || 0)
      if (currentBalance < withdrawal.amount) {
        throw new Error('Người dùng không đủ số dư để duyệt lại lệnh rút tiền này')
      }
      await conn.query(
        'UPDATE users SET balance = balance - ?, updated_at = NOW() WHERE id = ?',
        [withdrawal.amount, withdrawal.user_id]
      )
    }

    const updates: string[] = []
    const params: any[] = []

    updates.push('status = ?')
    params.push(status)

    if (status === 'approved' && approvedBy) {
      updates.push('approved_time = NOW()')
      updates.push('approved_by = ?')
      params.push(approvedBy)
    }

    params.push(withdrawalId)

    if (updates.length > 0) {
      await conn.query(
        `UPDATE withdrawals SET ${updates.join(', ')} WHERE id = ?`,
        params
      )
    }
  })
}

// ===================== PURCHASES =====================

export async function getPurchasesMySQL(userId?: number) {
  try {
    let sql = `
      SELECT p.*, pr.title AS product_title, pr.price, u.email, u.username
      FROM purchases p
      LEFT JOIN products pr ON p.product_id = pr.id
      LEFT JOIN users u ON p.user_id = u.id
    `
    const params: any[] = []
    if (userId) {
      sql += " WHERE p.user_id = ?"
      params.push(userId)
    }
    sql += " ORDER BY p.created_at DESC"
    return await query<any>(sql, params)
  } catch (err) {
    logger.error("MySQL: getPurchases error", err, { userId })
    throw err
  }
}

export async function createPurchaseMySQL(purchaseData: {
  userId: string | number
  productId: string | number
  amount: number
  userEmail?: string
}) {
  return withTransaction(async (conn) => {
    const dbUserId = await normalizeUserIdMySQL(purchaseData.userId, purchaseData.userEmail)
    if (!dbUserId) throw new Error("Cannot resolve user ID")

    const productIdNum =
      typeof purchaseData.productId === "number"
        ? purchaseData.productId
        : parseInt(purchaseData.productId.toString(), 10)

    // 1. Lock user row và lấy balance mới nhất
    const [userRows]: any = await conn.query(
      "SELECT id, balance FROM users WHERE id = ? FOR UPDATE",
      [dbUserId],
    )
    const currentBalance = Number(userRows[0]?.balance || 0)

    // 2. Check xem đã mua chưa (Tránh race condition mua trùng)
    const [existingRes]: any = await conn.query(
      "SELECT id FROM purchases WHERE user_id = ? AND product_id = ?",
      [dbUserId, productIdNum]
    );
    if (existingRes && existingRes.length > 0) {
      throw new Error("Bạn đã mua sản phẩm này rồi");
    }

    // 3. Lấy thông tin sản phẩm
    const [prdRows]: any = await conn.query(
      "SELECT id, price, is_active FROM products WHERE id = ? AND deleted_at IS NULL",
      [productIdNum],
    )
    const product = prdRows[0]
    if (!product) throw new Error("Sản phẩm không tồn tại hoặc đã bị xóa")
    if (!product.is_active) throw new Error("Sản phẩm hiện không còn khả dụng")

    const price = Number(product.price)
    const finalPurchasePrice = price

    // 4. Kiểm tra số dư
    if (currentBalance < finalPurchasePrice) {
      throw new Error(`Số dư không đủ. Cần ${finalPurchasePrice.toLocaleString('vi-VN')}đ, hiện có ${currentBalance.toLocaleString('vi-VN')}đ`)
    }

    let purchaseId: number;

    // 5. Tạo bản ghi mua hàng
    if (usePostgresBridge) {
      const result = await conn.query(
        "INSERT INTO purchases (user_id, product_id, amount, created_at) VALUES (?, ?, ?, NOW()) RETURNING id",
        [dbUserId, productIdNum, finalPurchasePrice]
      )
      purchaseId = (result[0] as any[])[0]?.id;
    } else {
      const [pRows]: any = await conn.query(
        "INSERT INTO purchases (user_id, product_id, amount, created_at) VALUES (?, ?, ?, NOW())",
        [dbUserId, productIdNum, finalPurchasePrice],
      )
      purchaseId = (pRows as any).insertId;
    }

    // 6. Cập nhật số dư atomically
    await conn.query(
      "UPDATE users SET balance = balance - ?, updated_at = NOW() WHERE id = ? AND balance >= ?",
      [finalPurchasePrice, dbUserId, finalPurchasePrice],
    )

    const finalBalance = currentBalance - finalPurchasePrice

    return { id: Number(purchaseId), newBalance: finalBalance }
  })
}

// ===================== PRODUCTS (đọc cơ bản) =====================

export async function getProductsMySQL(filters?: {
  category?: string
  isActive?: boolean
  limit?: number
  offset?: number
}) {
  try {
    let sql = `
      SELECT p.*, pr.average_rating, pr.total_ratings,
             COALESCE(p.download_count, 0) AS download_count
      FROM products p
      LEFT JOIN product_ratings pr ON p.id = pr.product_id
      WHERE p.deleted_at IS NULL
    `
    const params: any[] = []

    if (filters?.category) {
      sql += " AND p.category = ?"
      params.push(filters.category)
    }
    if (filters?.isActive !== undefined) {
      sql += " AND p.is_active = ?"
      params.push(filters.isActive)
    }

    sql += " ORDER BY p.created_at DESC"

    if (filters?.limit) {
      sql += " LIMIT ?"
      params.push(filters.limit)
    }
    if (filters?.offset) {
      sql += " OFFSET ?"
      params.push(filters.offset)
    }

    return await query<any>(sql, params)
  } catch (err) {
    logger.error("MySQL: getProducts error", err, { filters })
    throw err
  }
}

export async function getProductByIdMySQL(productId: number) {
  try {
    const sql = `
      SELECT p.*, pr.average_rating, pr.total_ratings,
             COALESCE(p.download_count, 0) AS download_count
      FROM products p
      LEFT JOIN product_ratings pr ON p.id = pr.product_id
      WHERE p.id = ? AND p.deleted_at IS NULL
    `
    return await queryOne<any>(sql, [productId])
  } catch (err) {
    logger.error("MySQL: getProductById error", err, { productId })
    throw err
  }
}

// ===================== ALIASES GIỮ NGUYÊN TÊN HÀM CŨ =====================
// Giúp thay thế lib/database.ts bằng lib/database-mysql.ts mà không phải sửa quá nhiều nơi.

export {
  getUserByIdMySQL as getUserById,
  getUserByEmailMySQL as getUserByEmail,
  getUserIdByEmailMySQL as getUserIdByEmail,
  createOrUpdateUserMySQL as createOrUpdateUser,
  getDepositsMySQL as getDeposits,
  createDepositMySQL as createDeposit,
  updateDepositStatusMySQL as updateDepositStatus,
  approveDepositAndUpdateBalanceMySQL as approveDepositAndUpdateBalance,
  getWithdrawalsMySQL as getWithdrawals,
  createWithdrawalMySQL as createWithdrawal,
  updateWithdrawalStatusMySQL as updateWithdrawalStatus,
  approveWithdrawalAndUpdateBalanceMySQL as approveWithdrawalAndUpdateBalance,
  getPurchasesMySQL as getPurchases,
  createPurchaseMySQL as createPurchase,
  getProductsMySQL as getProducts,
  getProductByIdMySQL as getProductById,
}

// ===================== USER PROFILE =====================

export async function getUserProfileByUserIdMySQL(userId: number) {
  try {
    return await queryOne<any>("SELECT * FROM user_profiles WHERE user_id = ?", [userId])
  } catch (err) {
    logger.error("MySQL: getUserProfileByUserId error", err, { userId })
    throw err
  }
}

export async function getUserProfileByEmailMySQL(email: string) {
  try {
    const user = await getUserByEmailMySQL(email)
    if (!user) return null
    return await getUserProfileByUserIdMySQL(user.id)
  } catch (err) {
    logger.error("MySQL: getUserProfileByEmail error", err, { email })
    throw err
  }
}

export async function upsertUserProfileMySQL(profile: {
  userId: number
  phone?: string | null
  address?: string | null
  city?: string | null
  country?: string | null
  postalCode?: string | null
  socialLinks?: Record<string, string> | null
  twoFactorEnabled?: boolean
  twoFactorSecret?: string | null
  twoFactorBackupCodes?: string | null
}) {
  try {
    const socialLinksJson = profile.socialLinks ? JSON.stringify(profile.socialLinks) : null
    const backupCodesJson = profile.twoFactorBackupCodes ? JSON.stringify(profile.twoFactorBackupCodes) : null

    const [result] = await getPool().execute(
      `INSERT INTO user_profiles (
        user_id, phone, address, city, country, postal_code, 
        social_links, two_factor_enabled, two_factor_secret, two_factor_backup_codes, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
      ON DUPLICATE KEY UPDATE
        phone = VALUES(phone),
        address = VALUES(address),
        city = VALUES(city),
        country = VALUES(country),
        postal_code = VALUES(postal_code),
        social_links = VALUES(social_links),
        two_factor_enabled = VALUES(two_factor_enabled),
        two_factor_secret = VALUES(two_factor_secret),
        two_factor_backup_codes = VALUES(two_factor_backup_codes),
        updated_at = NOW()`,
      [
        profile.userId,
        profile.phone ?? null,
        profile.address ?? null,
        profile.city ?? null,
        profile.country ?? null,
        profile.postalCode ?? null,
        socialLinksJson,
        profile.twoFactorEnabled ?? false,
        profile.twoFactorSecret ?? null,
        backupCodesJson,
      ]
    )

    return await getUserProfileByUserIdMySQL(profile.userId)
  } catch (err) {
    logger.error("MySQL: upsertUserProfile error", err, { userId: profile.userId })
    throw err
  }
}

// ===================== 2FA =====================

export async function saveUserTwoFactorSecretMySQL(
  userId: number,
  secret: string,
  backupCodes: string[]
): Promise<void> {
  try {
    const backupCodesJson = JSON.stringify(backupCodes)
    await query(
      `INSERT INTO user_profiles (user_id, two_factor_enabled, two_factor_secret, two_factor_backup_codes, updated_at)
       VALUES (?, TRUE, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE
         two_factor_enabled = TRUE,
         two_factor_secret = VALUES(two_factor_secret),
         two_factor_backup_codes = VALUES(two_factor_backup_codes),
         updated_at = NOW()`,
      [userId, secret, backupCodesJson]
    )
  } catch (err) {
    logger.error("MySQL: saveUserTwoFactorSecret error", err, { userId })
    throw err
  }
}

export async function disableUserTwoFactorMySQL(userId: number): Promise<void> {
  try {
    await query(
      `INSERT INTO user_profiles (user_id, two_factor_enabled, two_factor_secret, two_factor_backup_codes, updated_at)
       VALUES (?, FALSE, NULL, NULL, NOW())
       ON DUPLICATE KEY UPDATE
         two_factor_enabled = FALSE,
         two_factor_secret = NULL,
         two_factor_backup_codes = NULL,
         updated_at = NOW()`,
      [userId]
    )
  } catch (err) {
    logger.error("MySQL: disableUserTwoFactor error", err, { userId })
    throw err
  }
}

// ===================== PASSWORD RESET =====================

export async function deletePasswordResetTokensMySQL(userId: number) {
  try {
    await query("DELETE FROM password_resets WHERE user_id = ?", [userId])
  } catch (err) {
    logger.error("MySQL: deletePasswordResetTokens error", err, { userId })
    throw err
  }
}

export async function createPasswordResetTokenRecordMySQL(
  userId: number,
  token: string,
  expiresAt: Date
) {
  try {
    await query(
      "INSERT INTO password_resets (user_id, token, expires_at, created_at) VALUES (?, ?, ?, NOW())",
      [userId, token, expiresAt]
    )
  } catch (err) {
    logger.error("MySQL: createPasswordResetTokenRecord error", err, { userId })
    throw err
  }
}

export async function findValidPasswordResetTokenMySQL(token: string) {
  try {
    return await queryOne<any>(
      `SELECT pr.*, u.email, u.id as user_id
       FROM password_resets pr
       JOIN users u ON pr.user_id = u.id
       WHERE pr.token = ? AND pr.expires_at > NOW()`,
      [token]
    )
  } catch (err) {
    logger.error("MySQL: findValidPasswordResetToken error", err, { token })
    throw err
  }
}

export async function consumePasswordResetTokenMySQL(token: string) {
  try {
    await query("DELETE FROM password_resets WHERE token = ?", [token])
  } catch (err) {
    logger.error("MySQL: consumePasswordResetToken error", err, { token })
    throw err
  }
}

export async function updateUserPasswordHashMySQL(userId: number, passwordHash: string) {
  try {
    await query("UPDATE users SET password_hash = ?, updated_at = NOW() WHERE id = ?", [
      passwordHash,
      userId,
    ])
  } catch (err) {
    logger.error("MySQL: updateUserPasswordHash error", err, { userId })
    throw err
  }
}

// ===================== PRODUCTS =====================

export async function updateProductMySQL(
  productId: number,
  productData: {
    title?: string
    description?: string
    price?: number
    category?: string
    demoUrl?: string
    downloadUrl?: string
    imageUrl?: string
    imageUrls?: string[] | null
    detailedDescription?: string | null
    tags?: string[] | null
    isActive?: boolean
    averageRating?: number
    downloadCount?: number
  }
) {
  try {
    const updates: string[] = []
    const params: any[] = []

    if (productData.title !== undefined) {
      updates.push("title = ?")
      params.push(productData.title)
    }
    if (productData.description !== undefined) {
      updates.push("description = ?")
      params.push(productData.description)
    }
    if (productData.price !== undefined) {
      updates.push("price = ?")
      params.push(productData.price)
    }
    if (productData.category !== undefined) {
      updates.push("category = ?")
      params.push(productData.category)
    }
    if (productData.demoUrl !== undefined) {
      updates.push("demo_url = ?")
      params.push(productData.demoUrl || null)
    }
    if (productData.downloadUrl !== undefined) {
      updates.push("download_url = ?")
      params.push(productData.downloadUrl || null)
    }
    if (productData.imageUrl !== undefined) {
      updates.push("image_url = ?")
      params.push(productData.imageUrl || null)
    }
    if (productData.detailedDescription !== undefined) {
      updates.push("detailed_description = ?")
      params.push(productData.detailedDescription || null)
    }
    if (productData.imageUrls !== undefined) {
      updates.push("image_urls = ?")
      params.push(productData.imageUrls ? JSON.stringify(productData.imageUrls) : '[]')
    }
    if (productData.tags !== undefined) {
      // ✅ FIX: Chỉ stringify tags nếu xài MySQL. Nếu là PostgreSQL (Dùng mảng native TEXT[]), truyền thẳng Array
      const tagsValue = usePostgresBridge
        ? (productData.tags || [])
        : (productData.tags ? JSON.stringify(productData.tags) : null);
      updates.push("tags = ?")
      params.push(tagsValue)
    }
    if (productData.isActive !== undefined) {
      updates.push("is_active = ?")
      params.push(productData.isActive)
    }

    // ✅ FIX: Cho phép admin manually set download_count
    if (productData.downloadCount !== undefined) {
      updates.push("download_count = ?")
      params.push(productData.downloadCount)
    }

    updates.push("updated_at = NOW()")
    params.push(productId)

    if (updates.length > 1) {
      await query(`UPDATE products SET ${updates.join(", ")} WHERE id = ?`, params)
    }

    // ✅ FIX: Nếu admin muốn manually set average_rating, update vào product_ratings
    if (productData.averageRating !== undefined) {
      await query(
        `INSERT INTO product_ratings (product_id, average_rating, total_ratings, updated_at)
         VALUES (?, ?, 
           COALESCE((SELECT total_ratings FROM product_ratings WHERE product_id = ?), 0),
           NOW())
         ON DUPLICATE KEY UPDATE
           average_rating = VALUES(average_rating),
           updated_at = NOW()`,
        [productId, productData.averageRating, productId]
      )
    }

    return await getProductByIdMySQL(productId)
  } catch (err) {
    logger.error("MySQL: updateProduct error", err, { productId })
    throw err
  }
}

export async function deleteProductMySQL(productId: number) {
  try {
    const result = await query("DELETE FROM products WHERE id = ?", [productId])
    return result.length > 0 ? { id: productId } : null
  } catch (err) {
    logger.error("MySQL: deleteProduct error", err, { productId })
    throw err
  }
}

export async function trackDownloadMySQL(downloadData: {
  userId: number
  productId: number
  ipAddress?: string
  userAgent?: string
}) {
  try {
    return await withTransaction(async (conn) => {
      // ✅ FIX: Kiểm tra user đã mua sản phẩm chưa
      const [purchaseRows]: any = await conn.execute(
        'SELECT id FROM purchases WHERE user_id = ? AND product_id = ?',
        [downloadData.userId, downloadData.productId]
      )

      if (!purchaseRows || purchaseRows.length === 0) {
        throw new Error('Bạn cần mua sản phẩm trước khi tải xuống')
      }

      // ✅ FIX: Lock product để tránh concurrent updates
      const [productRows]: any = await conn.execute(
        'SELECT id FROM products WHERE id = ? FOR UPDATE',
        [downloadData.productId]
      )

      if (!productRows || productRows.length === 0) {
        throw new Error('Product not found')
      }

      // ✅ FIX: Check existing download với lock để tránh race condition
      const [existingRows]: any = await conn.execute(
        `SELECT id, downloaded_at FROM downloads 
         WHERE user_id = ? AND product_id = ? 
         AND DATE(downloaded_at) = DATE(NOW())
         FOR UPDATE`,
        [downloadData.userId, downloadData.productId]
      )

      let isNewDownload = !existingRows || existingRows.length === 0
      let downloadId: number
      let downloadedAt: Date

      if (isNewDownload) {
        if (usePostgresBridge) {
          const result = await query(
            `INSERT INTO downloads (user_id, product_id, ip_address, user_agent, downloaded_at)
             VALUES (?, ?, ?, ?, NOW()) RETURNING id`,
            [
              downloadData.userId,
              downloadData.productId,
              downloadData.ipAddress || null,
              downloadData.userAgent || null,
            ]
          )
          downloadId = result[0]?.id;
        } else {
          // ✅ FIX: Insert mới và tăng download_count atomically
          const [insertResult]: any = await conn.execute(
            `INSERT INTO downloads (user_id, product_id, ip_address, user_agent, downloaded_at)
             VALUES (?, ?, ?, ?, NOW())`,
            [
              downloadData.userId,
              downloadData.productId,
              downloadData.ipAddress || null,
              downloadData.userAgent || null,
            ]
          )

          downloadId = insertResult.insertId
        }

        // ✅ FIX: Tăng download_count atomically
        await conn.execute(
          'UPDATE products SET download_count = COALESCE(download_count, 0) + 1, updated_at = NOW() WHERE id = ?',
          [downloadData.productId]
        )

        // Get downloaded_at
        const [downloadRow]: any = await conn.execute(
          'SELECT downloaded_at FROM downloads WHERE id = ?',
          [downloadId]
        )
        downloadedAt = downloadRow[0]?.downloaded_at || new Date()
      } else {
        // Update timestamp của download hiện tại
        downloadId = existingRows[0].id
        await conn.execute(
          `UPDATE downloads 
           SET downloaded_at = NOW(),
               ip_address = ?,
               user_agent = ?
           WHERE id = ?`,
          [
            downloadData.ipAddress || null,
            downloadData.userAgent || null,
            downloadId,
          ]
        )

        const [downloadRow]: any = await conn.execute(
          'SELECT downloaded_at FROM downloads WHERE id = ?',
          [downloadId]
        )
        downloadedAt = downloadRow[0]?.downloaded_at || new Date()
      }

      // Get product để trả về download_url
      const [productRows2]: any = await conn.execute(
        'SELECT download_url, file_url FROM products WHERE id = ?',
        [downloadData.productId]
      )

      return {
        id: downloadId,
        downloadedAt,
        downloadUrl: productRows2[0]?.download_url || productRows2[0]?.file_url || null,
      }
    })
  } catch (err) {
    logger.error("MySQL: trackDownload error", err, { downloadData })
    throw err
  }
}

// ===================== NOTIFICATIONS =====================

export async function createNotificationMySQL(notificationData: {
  userId: number
  type: string
  message: string
  isRead?: boolean
}) {
  try {
    let insertId: number;

    if (usePostgresBridge) {
      const result = await query(
        "INSERT INTO notifications (user_id, type, message, is_read, created_at) VALUES (?, ?, ?, ?, NOW()) RETURNING id",
        [notificationData.userId, notificationData.type, notificationData.message, notificationData.isRead || false]
      )
      insertId = result[0]?.id;
    } else {
      const [result]: any = await getPool().execute(
        "INSERT INTO notifications (user_id, type, message, is_read, created_at) VALUES (?, ?, ?, ?, NOW())",
        [notificationData.userId, notificationData.type, notificationData.message, notificationData.isRead || false]
      )
      insertId = result.insertId;
    }

    const row = await queryOne<any>("SELECT id, created_at FROM notifications WHERE id = ?", [insertId])

    return {
      id: row.id,
      createdAt: row.created_at,
    }
  } catch (err) {
    logger.error("MySQL: createNotification error", err, { notificationData })
    throw err
  }
}

export async function getNotificationsMySQL(userId?: number, isRead?: boolean) {
  try {
    let sql = "SELECT * FROM notifications WHERE 1=1"
    const params: any[] = []

    if (userId) {
      sql += " AND user_id = ?"
      params.push(userId)
    }

    if (isRead !== undefined) {
      sql += " AND is_read = ?"
      params.push(isRead)
    }

    sql += " ORDER BY created_at DESC"

    return await query<any>(sql, params)
  } catch (err) {
    logger.error("MySQL: getNotifications error", err, { userId, isRead })
    throw err
  }
}

export async function markNotificationAsReadMySQL(notificationId: number, userId: number) {
  try {
    const result = await query(
      "UPDATE notifications SET is_read = TRUE WHERE id = ? AND user_id = ?",
      [notificationId, userId]
    )
    return result.length > 0 ? { id: notificationId } : null
  } catch (err) {
    logger.error("MySQL: markNotificationAsRead error", err, { notificationId, userId })
    throw err
  }
}

// ===================== CHAT =====================

export async function getChatsMySQL(
  userId?: number,
  adminId?: number,
  limit?: number,
  offset?: number
) {
  try {
    let sql = `SELECT c.*, 
               u.username as user_name,
               u.email as user_email,
               u.avatar_url as user_avatar,
               COALESCE(a.username, 'Admin') as admin_name,
               COALESCE(a.email, '') as admin_email,
               c.is_admin
        FROM chats c
        LEFT JOIN users u ON c.user_id = u.id
        LEFT JOIN users a ON c.admin_id = a.id
        WHERE 1=1`
    const params: any[] = []

    if (userId) {
      sql += " AND c.user_id = ?"
      params.push(userId)
    }

    if (adminId) {
      sql += " AND c.admin_id = ?"
      params.push(adminId)
    }

    sql += " ORDER BY c.created_at ASC"

    if (limit !== undefined) {
      sql += " LIMIT ?"
      params.push(limit)
    }

    if (offset !== undefined) {
      sql += " OFFSET ?"
      params.push(offset)
    }

    const rows = await query<any>(sql, params)

    return rows.map((row: any) => ({
      id: row.id,
      user_id: row.user_id,
      admin_id: row.admin_id,
      message: row.message,
      is_admin: row.is_admin === 1 || row.is_admin === true,
      created_at: row.created_at,
      createdAt: row.created_at,
      user_name: row.user_name,
      user_email: row.user_email,
      user_avatar: row.user_avatar,
      admin_name: row.admin_name,
      admin_email: row.admin_email,
    }))
  } catch (err) {
    logger.error("MySQL: getChats error", err, { userId, adminId })
    throw err
  }
}

export async function createChatMySQL(chatData: {
  userId: number
  adminId: number | null
  message: string
  isAdmin: boolean
}) {
  try {
    let insertId: number;

    if (usePostgresBridge) {
      const result = await query(
        "INSERT INTO chats (user_id, admin_id, message, is_admin, created_at) VALUES (?, ?, ?, ?, NOW()) RETURNING id",
        [chatData.userId, chatData.adminId, chatData.message, chatData.isAdmin]
      )
      insertId = result[0]?.id;
    } else {
      const [result]: any = await getPool().execute(
        "INSERT INTO chats (user_id, admin_id, message, is_admin, created_at) VALUES (?, ?, ?, ?, NOW())",
        [chatData.userId, chatData.adminId, chatData.message, chatData.isAdmin === true ? 1 : 0]
      )
      insertId = result.insertId;
    }

    const row = await queryOne<any>("SELECT id, created_at FROM chats WHERE id = ?", [insertId])

    return {
      id: row.id,
      createdAt: row.created_at,
    }
  } catch (err) {
    logger.error("MySQL: createChat error", err, { chatData })
    throw err
  }
}

// ===================== REVIEWS =====================

export async function getReviewsMySQL(filters?: {
  productId?: number
  userId?: number
  limit?: number
  offset?: number
}) {
  try {
    let sql = `SELECT r.*, 
               u.username, 
               u.email,
               u.avatar_url,
               pr.title as product_title
        FROM reviews r
        JOIN users u ON r.user_id = u.id
        LEFT JOIN products pr ON r.product_id = pr.id
        WHERE 1=1`
    const params: any[] = []

    if (filters?.productId) {
      sql += " AND r.product_id = ?"
      params.push(filters.productId)
    }

    if (filters?.userId) {
      sql += " AND r.user_id = ?"
      params.push(filters.userId)
    }

    sql += " ORDER BY r.created_at DESC"

    if (filters?.limit) {
      sql += " LIMIT ?"
      params.push(filters.limit)
    }

    if (filters?.offset) {
      sql += " OFFSET ?"
      params.push(filters.offset)
    }

    return await query<any>(sql, params)
  } catch (err) {
    logger.error("MySQL: getReviews error", err, { filters })
    throw err
  }
}

export async function getProductAverageRatingMySQL(productId: number) {
  try {
    const row = await queryOne<any>("SELECT * FROM product_ratings WHERE product_id = ?", [
      productId,
    ])

    if (row) {
      return {
        product_id: row.product_id,
        average_rating: parseFloat(row.average_rating || "0"),
        total_ratings: parseInt(row.total_ratings || "0"),
        updated_at: row.updated_at,
      }
    }

    return {
      product_id: productId,
      average_rating: 0,
      total_ratings: 0,
      updated_at: new Date(),
    }
  } catch (err) {
    logger.error("MySQL: getProductAverageRating error", err, { productId })
    throw err
  }
}

export async function createReviewMySQL(reviewData: {
  userId: number
  productId: number
  rating: number
  comment?: string | null
}) {
  try {
    await query(
      `INSERT INTO reviews (user_id, product_id, rating, comment, created_at, updated_at)
       VALUES (?, ?, ?, ?, NOW(), NOW())
       ON DUPLICATE KEY UPDATE
         rating = VALUES(rating),
         comment = VALUES(comment),
         updated_at = NOW()`,
      [reviewData.userId, reviewData.productId, reviewData.rating, reviewData.comment || null]
    )

    const row = await queryOne<any>(
      "SELECT id, created_at, updated_at FROM reviews WHERE user_id = ? AND product_id = ?",
      [reviewData.userId, reviewData.productId]
    )

    return {
      id: row.id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  } catch (err) {
    logger.error("MySQL: createReview error", err, { reviewData })
    throw err
  }
}

// ===================== WISHLIST =====================

export async function getWishlistMySQL(userId: number) {
  try {
    return await query<any>(
      `SELECT w.*, p.title, p.price, p.image_url, p.thumbnail, p.category
       FROM wishlists w
       JOIN products p ON w.product_id = p.id
       WHERE w.user_id = ?
       ORDER BY w.created_at DESC`,
      [userId]
    )
  } catch (err) {
    logger.error("MySQL: getWishlist error", err, { userId })
    throw err
  }
}

export async function addToWishlistMySQL(userId: number, productId: number) {
  try {
    let insertId: number;

    if (usePostgresBridge) {
      const result = await query(
        `INSERT INTO wishlists (user_id, product_id, created_at, updated_at)
         VALUES (?, ?, NOW(), NOW()) ON CONFLICT DO NOTHING RETURNING id`,
        [userId, productId]
      )
      insertId = result[0]?.id || 0; // 0 if already exists
    } else {
      const [result]: any = await getPool().execute(
        `INSERT IGNORE INTO wishlists (user_id, product_id, created_at, updated_at)
         VALUES (?, ?, NOW(), NOW())`,
        [userId, productId]
      )
      insertId = result.insertId;
    }

    return { id: insertId, userId, productId }
  } catch (err) {
    logger.error("MySQL: addToWishlist error", err, { userId, productId })
    throw err
  }
}

export async function removeFromWishlistMySQL(userId: number, productId: number) {
  try {
    await query("DELETE FROM wishlists WHERE user_id = ? AND product_id = ?", [
      userId,
      productId,
    ])
    return { userId, productId }
  } catch (err) {
    logger.error("MySQL: removeFromWishlist error", err, { userId, productId })
    throw err
  }
}

export async function isInWishlistMySQL(userId: number, productId: number): Promise<boolean> {
  try {
    const row = await queryOne<any>(
      "SELECT id FROM wishlists WHERE user_id = ? AND product_id = ?",
      [userId, productId]
    )
    return !!row
  } catch (err) {
    logger.error("MySQL: isInWishlist error", err, { userId, productId })
    return false
  }
}

// ===================== COUPONS =====================

export async function getCouponsMySQL(filters?: {
  isActive?: boolean
  limit?: number
  offset?: number
}) {
  try {
    let sql = "SELECT * FROM coupons WHERE 1=1"
    const params: any[] = []

    if (filters?.isActive !== undefined) {
      sql += " AND is_active = ?"
      params.push(filters.isActive)
    }

    sql += " ORDER BY created_at DESC"

    if (filters?.limit) {
      sql += " LIMIT ?"
      params.push(filters.limit)
    }
    if (filters?.offset) {
      sql += " OFFSET ?"
      params.push(filters.offset)
    }

    return await query<any>(sql, params)
  } catch (err) {
    logger.error("MySQL: getCoupons error", err, { filters })
    throw err
  }
}

export async function getCouponByCodeMySQL(code: string) {
  try {
    return await queryOne<any>(
      `SELECT * FROM coupons
       WHERE code = ? AND is_active = TRUE
         AND (valid_from IS NULL OR valid_from <= NOW())
         AND (valid_until IS NULL OR valid_until >= NOW())`,
      [code]
    )
  } catch (err) {
    logger.error("MySQL: getCouponByCode error", err, { code })
    throw err
  }
}

export async function createCouponMySQL(couponData: {
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
    let insertId: number;

    if (usePostgresBridge) {
      const result = await query(
        `INSERT INTO coupons (code, name, title, description, discount_type, discount_value,
          min_purchase_amount, max_discount_amount, usage_limit, valid_from, valid_until, is_active,
          created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW()) RETURNING id`,
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
          couponData.isActive !== false ? true : false,
        ]
      )
      insertId = result[0]?.id;
    } else {
      const [result]: any = await getPool().execute(
        `INSERT INTO coupons (code, name, title, description, discount_type, discount_value,
          min_purchase_amount, max_discount_amount, usage_limit, valid_from, valid_until, is_active,
          created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
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
          couponData.isActive !== false ? 1 : 0,
        ]
      )
      insertId = result.insertId;
    }

    return await queryOne<any>("SELECT * FROM coupons WHERE id = ?", [insertId])
  } catch (err) {
    logger.error("MySQL: createCoupon error", err, { couponData })
    throw err
  }
}

export async function applyCouponMySQL(userId: number, couponCode: string) {
  try {
    return await withTransaction(async (conn) => {
      // Tìm coupon hợp lệ
      const [couponRows]: any = await conn.execute(
        `SELECT * FROM coupons
         WHERE code = ? AND is_active = TRUE
           AND (valid_from IS NULL OR valid_from <= NOW())
           AND (valid_until IS NULL OR valid_until >= NOW())
         FOR UPDATE`,
        [couponCode]
      )

      if (!couponRows || couponRows.length === 0) {
        throw new Error("Mã coupon không hợp lệ hoặc đã hết hạn")
      }

      const coupon = couponRows[0]

      // Kiểm tra usage limit
      if (coupon.usage_limit !== null) {
        const [usedRows]: any = await conn.execute(
          "SELECT COUNT(*) as cnt FROM user_coupons WHERE coupon_id = ?",
          [coupon.id]
        )
        if (usedRows[0].cnt >= coupon.usage_limit) {
          throw new Error("Mã coupon đã hết lượt sử dụng")
        }
      }

      // Kiểm tra user đã dùng chưa
      const [existingRows]: any = await conn.execute(
        "SELECT id FROM user_coupons WHERE user_id = ? AND coupon_id = ?",
        [userId, coupon.id]
      )
      if (existingRows && existingRows.length > 0) {
        throw new Error("Bạn đã sử dụng mã coupon này rồi")
      }

      // Áp dụng coupon
      await conn.execute(
        "INSERT INTO user_coupons (user_id, coupon_id, used_at, created_at) VALUES (?, ?, NOW(), NOW())",
        [userId, coupon.id]
      )

      return {
        couponId: coupon.id,
        code: coupon.code,
        discountType: coupon.discount_type,
        discountValue: parseFloat(coupon.discount_value),
        maxDiscountAmount: coupon.max_discount_amount
          ? parseFloat(coupon.max_discount_amount)
          : null,
      }
    })
  } catch (err) {
    logger.error("MySQL: applyCoupon error", err, { userId, couponCode })
    throw err
  }
}

// ===================== REFERRALS =====================

export async function getReferralsMySQL(referrerId: number) {
  try {
    return await query<any>(
      `SELECT r.*, u.username, u.email, u.name, u.avatar_url
       FROM referrals r
       JOIN users u ON r.referred_id = u.id
       WHERE r.referrer_id = ?
       ORDER BY r.created_at DESC`,
      [referrerId]
    )
  } catch (err) {
    logger.error("MySQL: getReferrals error", err, { referrerId })
    throw err
  }
}

export async function createReferralMySQL(referrerId: number, referredId: number) {
  try {
    if (Number(referrerId) === Number(referredId)) {
      throw new Error("Bạn không thể tự giới thiệu chính mình");
    }

    let insertId: number;

    if (usePostgresBridge) {
      const result = await query(
        "INSERT INTO referrals (referrer_id, referred_id, status, created_at) VALUES (?, ?, 'pending', NOW()) RETURNING id",
        [referrerId, referredId]
      )
      insertId = result[0]?.id;
    } else {
      const [result]: any = await getPool().execute(
        "INSERT INTO referrals (referrer_id, referred_id, status, created_at) VALUES (?, ?, 'pending', NOW())",
        [referrerId, referredId]
      )
      insertId = result.insertId;
    }

    return { id: insertId, referrerId, referredId }
  } catch (err) {
    logger.error("MySQL: createReferral error", err, { referrerId, referredId })
    throw err
  }
}

export async function getReferralByCodeMySQL(referralCode: string) {
  try {
    return await queryOne<any>(
      "SELECT id, email, username, name, referral_code FROM users WHERE referral_code = ?",
      [referralCode]
    )
  } catch (err) {
    logger.error("MySQL: getReferralByCode error", err, { referralCode })
    throw err
  }
}

// ===================== ANALYTICS =====================

export async function trackAnalyticsEventMySQL(eventData: {
  userId?: number | null
  eventType: string
  eventData?: Record<string, any> | null
  ipAddress?: string | null
  userAgent?: string | null
}) {
  try {
    const [result]: any = await getPool().execute(
      `INSERT INTO analytics_events (user_id, event_type, event_data, ip_address, user_agent, created_at)
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [
        eventData.userId ?? null,
        eventData.eventType,
        eventData.eventData ? JSON.stringify(eventData.eventData) : null,
        eventData.ipAddress ?? null,
        eventData.userAgent ?? null,
      ]
    )
    return { id: result.insertId }
  } catch (err) {
    logger.error("MySQL: trackAnalyticsEvent error", err, { eventData })
    // Non-critical, don't throw
    return null
  }
}

export async function getAnalyticsEventsMySQL(filters?: {
  eventType?: string
  userId?: number
  startDate?: Date
  endDate?: Date
  limit?: number
  offset?: number
}) {
  try {
    let sql = "SELECT * FROM analytics_events WHERE 1=1"
    const params: any[] = []

    if (filters?.eventType) {
      sql += " AND event_type = ?"
      params.push(filters.eventType)
    }
    if (filters?.userId) {
      sql += " AND user_id = ?"
      params.push(filters.userId)
    }
    if (filters?.startDate) {
      sql += " AND created_at >= ?"
      params.push(filters.startDate)
    }
    if (filters?.endDate) {
      sql += " AND created_at <= ?"
      params.push(filters.endDate)
    }

    sql += " ORDER BY created_at DESC"

    if (filters?.limit) {
      sql += " LIMIT ?"
      params.push(filters.limit)
    }
    if (filters?.offset) {
      sql += " OFFSET ?"
      params.push(filters.offset)
    }

    return await query<any>(sql, params)
  } catch (err) {
    logger.error("MySQL: getAnalyticsEvents error", err, { filters })
    throw err
  }
}

// ===================== APP SETTINGS =====================

export async function createAppSettingMySQL(settingData: {
  key: string
  value: string
  description?: string
}) {
  try {
    let insertId: number;

    if (usePostgresBridge) {
      const result = await query(
        "INSERT INTO app_settings (setting_key, setting_value, description, created_at, updated_at) VALUES (?, ?, ?, NOW(), NOW()) RETURNING id",
        [settingData.key, settingData.value, settingData.description || null]
      )
      insertId = result[0]?.id;
    } else {
      const [result]: any = await getPool().execute(
        "INSERT INTO app_settings (setting_key, setting_value, description, created_at, updated_at) VALUES (?, ?, ?, NOW(), NOW())",
        [settingData.key, settingData.value, settingData.description || null]
      )
      insertId = result.insertId;
    }

    return { id: insertId }
  } catch (err) {
    logger.error("MySQL: createAppSetting error", err, { settingData })
    return null
  }
}

// ===================== PRODUCT VIEWS =====================

export async function trackProductViewMySQL(
  productId: number,
  userId?: number | null,
  ipAddress?: string | null
) {
  try {
    const [result]: any = await getPool().execute(
      "INSERT INTO product_views (product_id, user_id, ip_address, viewed_at) VALUES (?, ?, ?, NOW())",
      [productId, userId ?? null, ipAddress ?? null]
    )
    return { id: result.insertId }
  } catch (err) {
    logger.error("MySQL: trackProductView error", err, { productId })
    return null
  }
}

export async function getProductViewCountMySQL(productId: number): Promise<number> {
  try {
    const row = await queryOne<any>(
      "SELECT COUNT(*) as cnt FROM product_views WHERE product_id = ?",
      [productId]
    )
    return row?.cnt || 0
  } catch (err) {
    logger.error("MySQL: getProductViewCount error", err, { productId })
    return 0
  }
}

// ===================== BUNDLES =====================

export async function getBundlesMySQL(activeOnly: boolean = true) {
  try {
    let sql = `
      SELECT b.*,
        (SELECT COUNT(*) FROM bundle_products bp WHERE bp.bundle_id = b.id) as product_count,
        (SELECT SUM(p.price) FROM bundle_products bp JOIN products p ON bp.product_id = p.id WHERE bp.bundle_id = b.id) as original_price
      FROM bundles b
    `
    const params: any[] = []

    if (activeOnly) {
      sql += " WHERE b.is_active = TRUE"
    }

    sql += " ORDER BY b.created_at DESC"

    return await query<any>(sql, params)
  } catch (err) {
    logger.error("MySQL: getBundles error", err)
    throw err
  }
}

export async function getBundleByIdMySQL(bundleId: number) {
  try {
    const bundle = await queryOne<any>(
      `SELECT b.*,
        (SELECT COUNT(*) FROM bundle_products bp WHERE bp.bundle_id = b.id) as product_count,
        (SELECT SUM(p.price) FROM bundle_products bp JOIN products p ON bp.product_id = p.id WHERE bp.bundle_id = b.id) as original_price
       FROM bundles b WHERE b.id = ?`,
      [bundleId]
    )

    if (!bundle) return null

    // Lấy danh sách products trong bundle
    const products = await query<any>(
      `SELECT p.* FROM products p
       JOIN bundle_products bp ON p.id = bp.product_id
       WHERE bp.bundle_id = ?
       ORDER BY p.title ASC`,
      [bundleId]
    )

    return { ...bundle, products }
  } catch (err) {
    logger.error("MySQL: getBundleById error", err, { bundleId })
    throw err
  }
}

// ===================== BANNERS =====================

export async function createBannerMySQL(bannerData: {
  title: string
  imageUrl: string
  linkUrl?: string
  isActive?: boolean
  displayOrder?: number
}) {
  try {
    let insertId: number;

    if (usePostgresBridge) {
      const result = await query(
        `INSERT INTO banners (title, image_url, link_url, is_active, display_order, created_at, updated_at) 
         VALUES (?, ?, ?, ?, ?, NOW(), NOW()) RETURNING id`,
        [
          bannerData.title,
          bannerData.imageUrl,
          bannerData.linkUrl || null,
          bannerData.isActive !== false ? true : false,
          bannerData.displayOrder || 0,
        ]
      )
      insertId = result[0]?.id;
    } else {
      const [result]: any = await getPool().execute(
        `INSERT INTO banners (title, image_url, link_url, is_active, display_order, created_at, updated_at) 
         VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          bannerData.title,
          bannerData.imageUrl,
          bannerData.linkUrl || null,
          bannerData.isActive !== false ? 1 : 0,
          bannerData.displayOrder || 0,
        ]
      )
      insertId = result.insertId;
    }

    return { id: insertId }
  } catch (err) {
    logger.error("MySQL: createBanner error", err, { bannerData })
    return null
  }
}

// ===================== ADMIN ACTIONS (AUDIT LOG) =====================

export async function createAdminActionMySQL(actionData: {
  adminId: number
  actionType: string
  payload?: Record<string, any> | null
}) {
  try {
    const [result]: any = await getPool().execute(
      `INSERT INTO admin_actions (admin_id, action_type, payload, created_at, updated_at)
       VALUES (?, ?, ?, NOW(), NOW())`,
      [
        actionData.adminId,
        actionData.actionType,
        actionData.payload ? JSON.stringify(actionData.payload) : null,
      ]
    )
    return { id: result.insertId }
  } catch (err) {
    logger.error("MySQL: createAdminAction error", err, { actionData })
    return null
  }
}

export async function getAdminActionsMySQL(filters?: {
  adminId?: number
  actionType?: string
  limit?: number
  offset?: number
}) {
  try {
    let sql = `
      SELECT aa.*, u.username as admin_name, u.email as admin_email
      FROM admin_actions aa
      JOIN users u ON aa.admin_id = u.id
      WHERE 1=1
    `
    const params: any[] = []

    if (filters?.adminId) {
      sql += " AND aa.admin_id = ?"
      params.push(filters.adminId)
    }
    if (filters?.actionType) {
      sql += " AND aa.action_type = ?"
      params.push(filters.actionType)
    }

    sql += " ORDER BY aa.created_at DESC"

    if (filters?.limit) {
      sql += " LIMIT ?"
      params.push(filters.limit)
    }
    if (filters?.offset) {
      sql += " OFFSET ?"
      params.push(filters.offset)
    }

    return await query<any>(sql, params)
  } catch (err) {
    logger.error("MySQL: getAdminActions error", err, { filters })
    throw err
  }
}

// ===================== EXPORT ALIASES =====================

export {
  getUserProfileByUserIdMySQL as getUserProfileByUserId,
  getUserProfileByEmailMySQL as getUserProfileByEmail,
  upsertUserProfileMySQL as upsertUserProfile,
  saveUserTwoFactorSecretMySQL as saveUserTwoFactorSecret,
  disableUserTwoFactorMySQL as disableUserTwoFactor,
  deletePasswordResetTokensMySQL as deletePasswordResetTokens,
  createPasswordResetTokenRecordMySQL as createPasswordResetTokenRecord,
  findValidPasswordResetTokenMySQL as findValidPasswordResetToken,
  consumePasswordResetTokenMySQL as consumePasswordResetToken,
  updateUserPasswordHashMySQL as updateUserPasswordHash,
  updateProductMySQL as updateProduct,
  deleteProductMySQL as deleteProduct,
  trackDownloadMySQL as trackDownload,
  createNotificationMySQL as createNotification,
  getNotificationsMySQL as getNotifications,
  markNotificationAsReadMySQL as markNotificationAsRead,
  getChatsMySQL as getChats,
  createChatMySQL as createChat,
  getReviewsMySQL as getReviews,
  getProductAverageRatingMySQL as getProductAverageRating,
  createReviewMySQL as createReview,
  // Wishlist
  getWishlistMySQL as getWishlist,
  addToWishlistMySQL as addToWishlist,
  removeFromWishlistMySQL as removeFromWishlist,
  isInWishlistMySQL as isInWishlist,
  // Coupons
  getCouponsMySQL as getCoupons,
  getCouponByCodeMySQL as getCouponByCode,
  createCouponMySQL as createCoupon,
  applyCouponMySQL as applyCoupon,
  // Referrals
  getReferralsMySQL as getReferrals,
  createReferralMySQL as createReferral,
  getReferralByCodeMySQL as getReferralByCode,
  // Analytics
  trackAnalyticsEventMySQL as trackAnalyticsEvent,
  getAnalyticsEventsMySQL as getAnalyticsEvents,
  // Product Views
  trackProductViewMySQL as trackProductView,
  getProductViewCountMySQL as getProductViewCount,
  // Bundles
  getBundlesMySQL as getBundles,
  getBundleByIdMySQL as getBundleById,
  // Admin Actions
  createAdminActionMySQL as createAdminAction,
  getAdminActionsMySQL as getAdminActions,
}




