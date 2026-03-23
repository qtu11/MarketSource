import { logger } from '../logger';
import { PoolClient, Pool } from 'pg';
import { notificationEmitter, NOTIFICATION_EVENTS } from '../events';
import { hasDownloadCountColumn } from './core';
import { pool, getPool, query, queryOne, withTransaction, getPoolInstance } from "./core";
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
export async function createOrUpdateUser(userData: {
  email: string;
  name?: string;
  username?: string;
  passwordHash?: string;
  avatarUrl?: string;
  ipAddress?: string;
  role?: 'user' | 'admin';
  /** OAuth: email Ä‘Ă£ Ä‘Æ°á»£c provider xĂ¡c minh */
  markEmailVerified?: boolean;
  emailVerificationToken?: string | null;
  emailVerificationExpires?: Date | null;
}) {
  try {
    // Kiá»ƒm tra user Ä‘Ă£ tá»“n táº¡i chÆ°a
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

      // âœ… CRITICAL BUG #3 FIX: Password update pháº£i rĂµ rĂ ng (chá»‘ng ghi Ä‘Ă¨ OAuth)
      if (userData.passwordHash !== undefined && userData.passwordHash !== null) {
        updates.push(`password_hash = $${paramIndex}`);
        params.push(userData.passwordHash);
        paramIndex++;
      }

      if (userData.markEmailVerified) {
        updates.push(`email_verified_at = CURRENT_TIMESTAMP`);
        updates.push(`email_verification_token = NULL`);
        updates.push(`email_verification_expires = NULL`);
      }

      // LuĂ´n cáº­p nháº­t updated_at
      updates.push('updated_at = CURRENT_TIMESTAMP');

      if (updates.length > 1) { // CĂ³ Ă­t nháº¥t 1 update + updated_at
        await pool.query(
          `UPDATE users SET ${updates.join(', ')} WHERE email = $1`,
          params
        );
      }

      return { id: existingUser.id, isNew: false };
    } else {
      // âœ… FIX: Táº¡o user má»›i vá»›i xá»­ lĂ½ duplicate username
      let finalUsername = userData.username || userData.name || `user_${Date.now()}`;

      // Check vĂ  generate unique username náº¿u trĂ¹ng
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
            // Generate unique username báº±ng cĂ¡ch thĂªm sá»‘
            finalUsername = `${userData.username}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
            attemptCount++;
          }
        }

        if (usernameExists) {
          // Náº¿u váº«n trĂ¹ng sau nhiá»u láº§n thá»­, dĂ¹ng email lĂ m username
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

      // Táº¡o user má»›i
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
export async function updateBalance(
  userId: number,
  amount: number,
  type: 'increase' | 'decrease' | 'set',
  client?: PoolClient
): Promise<{ success: boolean; newBalance: number }> {
  const poolOrClient = client || pool;

  try {
    if (!Number.isFinite(amount) || amount < 0) {
      throw new Error('Invalid amount');
    }

    let newBalance = 0;
    
    if (type === 'increase') {
      const updateResult = await poolOrClient.query(
        'UPDATE users SET balance = balance + $1::numeric, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING balance',
        [amount, userId]
      );
      if (updateResult.rows.length === 0) {
        throw new Error('User not found');
      }
      newBalance = parseFloat(updateResult.rows[0].balance);
    } else if (type === 'decrease') {
      const updateResult = await poolOrClient.query(
        'UPDATE users SET balance = balance - $1::numeric, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND balance >= $1::numeric RETURNING balance',
        [amount, userId]
      );
      if (updateResult.rows.length === 0) {
        const exists = await poolOrClient.query('SELECT balance FROM users WHERE id = $1', [userId]);
        if (exists.rows.length === 0) {
          throw new Error('User not found');
        }
        const currentBalance = parseFloat(exists.rows[0].balance || '0');
        throw new Error(`Insufficient balance. Current: ${currentBalance}, Required: ${amount}`);
      }
      newBalance = parseFloat(updateResult.rows[0].balance);
    } else if (type === 'set') {
      const updateResult = await poolOrClient.query(
        'UPDATE users SET balance = $1::numeric, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING balance',
        [amount, userId]
      );
      if (updateResult.rows.length === 0) {
        throw new Error('User not found');
      }
      newBalance = parseFloat(updateResult.rows[0].balance);
    }

    // ✅ Realtime Update
    try {
      const { publishDashboardEvent } = await import('../realtime/events');
      await publishDashboardEvent('users', { id: userId, balance: newBalance, type: 'balance_update' });
    } catch (e) {
      logger.error('Realtime update failed for balance', { userId, error: e instanceof Error ? e.message : String(e) });
    }

    return { success: true, newBalance };
  } catch (error) {
    logger.error('Error updating balance', error, { userId, amount, type });
    throw error;
  }
}
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
    throw new Error("Báº¡n khĂ´ng thá»ƒ tá»± giá»›i thiá»‡u chĂ­nh mĂ¬nh");
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
    // Chá»‰ coi chuá»—i toĂ n sá»‘ lĂ  `users.id` náº¿u vá»«a PostgreSQL int4. UID Firebase dáº¡ng sá»‘ (vd. 117â€¦)
    // khĂ´ng Ä‘Æ°á»£c Ä‘Æ°a vĂ o $3::int â€” sáº½ lá»—i "out of range for type integer".
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

    // Má»™t round-trip: loáº¡i bá» `uid` do table `users` khĂ´ng cĂ³ cá»™t nĂ y (chá»‰ tĂ¬m theo email, username hoáº·c id sá»‘)
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

    return null;
  } catch (error) {
    logger.error('Error normalizing user ID', error, { firebaseUidOrEmail, userEmail });
    return null;
  }
}

/**
 * GAMIFICATION: Hệ thống Rank và tích lũy LOC (Lines of Code)
 */
export const RANKS = [
  { name: 'Script Kiddie', minLOC: 0 },
  { name: 'Apprentice', minLOC: 1000 },      // ~1tr VND
  { name: 'Senior Dev', minLOC: 5000 },      // ~5tr VND
  { name: 'Architect', minLOC: 20000 },     // ~20tr VND
  { name: 'Legendary Hacker', minLOC: 100000 }, // ~100tr VND
];

export async function updateLOC(userId: number, amount: number, client?: PoolClient) {
  const poolOrClient = client || pool;
  try {
    const res = await poolOrClient.query(
      'UPDATE users SET loc_points = loc_points + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING loc_points, rank',
      [Math.floor(amount), userId]
    );
    if (res.rows.length === 0) return;

    const loc = parseInt(res.rows[0].loc_points);
    const currentRank = res.rows[0].rank;

    // Tìm rank cao nhất mà user đạt điều kiện
    let newRank = RANKS[0].name;
    for (const r of RANKS) {
      if (loc >= r.minLOC) newRank = r.name;
    }

    if (newRank !== currentRank) {
      await poolOrClient.query('UPDATE users SET rank = $1 WHERE id = $2', [newRank, userId]);
      
      // ✅ Realtime Alert
      try {
        const { publishDashboardEvent, publishTickerEvent } = await import('../realtime/events');
        await publishDashboardEvent('users', { id: userId, rank: newRank, locPoints: loc, type: 'rank_up' });
        await publishTickerEvent(`ChĂºc má»«ng! User #${userId} vá»«a thÄƒng háº¡ng lĂªn [${newRank.toUpperCase()}]! âš¡âš¡âš¡`, 'achievement');
      } catch (e) { /* ignore */ }
    }
  } catch (error) {
    logger.error('Error updating LOC', error, { userId, amount });
  }
}

