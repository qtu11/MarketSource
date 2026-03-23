import { logger } from '../logger';
import { PoolClient, Pool } from 'pg';
import { pool, getPool, query, queryOne, withTransaction, getPoolInstance, ensureDepositsSchema, generateDepositReferenceCode, hasDownloadCountColumn } from "./core";
import { normalizeUserId } from "./users";
import { createNotification } from "./admin";
export async function getPurchases(userId?: number) {
  try {
    const hasDownloadCount = await hasDownloadCountColumn();
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
             ${hasDownloadCount ? 'COALESCE(pr.download_count, 0)' : '0'} as downloads,
             COALESCE(rt.average_rating, 0) as rating,
             u.email AS "userEmail", 
             COALESCE(u.username, u.name, u.email) AS "userName"
      FROM purchases p
      LEFT JOIN products pr ON p.product_id = pr.id
      LEFT JOIN users u ON p.user_id = u.id
      LEFT JOIN product_ratings rt ON pr.id = rt.product_id
    `;
    const params: any[] = [];

    if (userId) {
      query += ' WHERE p.user_id = $1';
      params.push(userId);
    }

    query += ' ORDER BY p.created_at DESC';

    const result = await pool.query(query, params);
    return result.rows.map(row => ({
      ...row,
      downloads: Number(row.downloads || 0),
      rating: Number(row.rating || 0)
    }));
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

    // 1. Lock user row vĂ  check balance
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
      throw new Error('Báº¡n Ä‘Ă£ mua sáº£n pháº©m nĂ y rá»“i');
    }

    // 3. Get product and check availability
    const productRes = await client.query(
      'SELECT id, price, is_active FROM products WHERE id = $1 AND deleted_at IS NULL FOR UPDATE',
      [productIdNum]
    );

    if (productRes.rows.length === 0) {
      throw new Error('Sáº£n pháº©m khĂ´ng tá»“n táº¡i hoáº·c Ä‘Ă£ bá»‹ xĂ³a');
    }

    const product = productRes.rows[0];
    if (!product.is_active) {
      throw new Error('Sáº£n pháº©m hiá»‡n khĂ´ng cĂ²n kháº£ dá»¥ng');
    }

    const price = parseFloat(product.price);

    // 4. Validate balance
    if (currentBalance < price) {
      throw new Error(`Sá»‘ dÆ° khĂ´ng Ä‘á»§. Cáº§n ${price.toLocaleString('vi-VN')}Ä‘, hiá»‡n cĂ³ ${currentBalance.toLocaleString('vi-VN')}Ä‘`);
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

    // âœ… NEW: ThĂ´ng bĂ¡o real-time khi mua sáº£n pháº©m thĂ nh cĂ´ng
    try {
      // 1. Cho User
      await createNotification({
        userId: Number(dbUserId),
        type: 'purchase_success',
        message: `Báº¡n Ä‘Ă£ mua thĂ nh cĂ´ng sáº£n pháº©m #${productIdNum} vá»›i giĂ¡ ${price.toLocaleString('vi-VN')}Ä‘.`
      });

      // 2. Cho Admin
      await createNotification({
        userId: Number(dbUserId), // ID ngÆ°á»i mua Ä‘á»ƒ admin biáº¿t ai mua
        type: 'order_created',
        message: `ÄÆ¡n hĂ ng má»›i: Sáº£n pháº©m #${productIdNum} vá»«a Ä‘Æ°á»£c bĂ¡n cho ${purchaseData.userEmail || 'User #' + dbUserId}`
      });
    } catch (err) {
      logger.warn('Failed to create notification for purchase', { dbUserId, productIdNum });
    }

    // ✅ NEW: Tích lũy LOC và Ticker Event
    try {
      const { updateLOC } = await import('./users');
      const { publishTickerEvent } = await import('../realtime/events');
      
      const locEarned = Math.floor(price / 1000);
      if (locEarned > 0) {
        await updateLOC(Number(dbUserId), locEarned, client);
      }

      // Ẩn email để bảo mật: a***@gmail.com
      const maskedEmail = purchaseData.userEmail 
        ? purchaseData.userEmail.replace(/(.{1}).+(@.+)/, "$1***$2")
        : `User #${dbUserId}`;

      await publishTickerEvent(`User [${maskedEmail}] vá»«a mua thĂ nh cĂ´ng sáº£n pháº©m má»›i! ðŸ›’`, 'purchase');
    } catch (err) {
      logger.error('Failed to process gamification for purchase', err);
    }

    return {
      id: Number(result.rows[0].id),
      newBalance: currentBalance - price,
      amount: price,
    };
  });
}
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
      if (!product) throw new Error(`Sáº£n pháº©m #${item.id} khĂ´ng tá»“n táº¡i hoáº·c Ä‘Ă£ bá»‹ xĂ³a`);
      if (!product.is_active) throw new Error(`Sáº£n pháº©m "${product.title}" hiá»‡n khĂ´ng kháº£ dá»¥ng`);

      // Check duplicate
      const existingRes = await client.query(
        'SELECT id FROM purchases WHERE user_id = $1 AND product_id = $2',
        [dbUserId, productIdNum]
      );
      if (existingRes.rows.length > 0) {
        throw new Error(`Báº¡n Ä‘Ă£ mua sáº£n pháº©m "${product.title}" rá»“i`);
      }

      const price = parseFloat(product.price);
      const quantity = Math.max(1, item.quantity);
      const amount = price * quantity;

      totalAmount += amount;
      validatedItems.push({ id: productIdNum, amount });
    }

    // 3. Final balance check
    if (currentBalance < totalAmount) {
      throw new Error(`Sá»‘ dÆ° khĂ´ng Ä‘á»§. Cáº§n ${totalAmount.toLocaleString('vi-VN')}Ä‘, hiá»‡n cĂ³ ${currentBalance.toLocaleString('vi-VN')}Ä‘`);
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

    // 6. Send notification for real-time celebration
    try {
      await createNotification({
        userId: dbUserId,
        type: 'purchase_success',
        message: `ChĂºc má»«ng! Báº¡n Ä‘Ă£ mua thĂ nh cĂ´ng ${validatedItems.length} sáº£n pháº©m.`
      });
    } catch (notifyError) {
      logger.error('Failed to send purchase notification', notifyError);
    }

    // ✅ NEW: Tích lũy LOC và Ticker Event
    try {
      const { updateLOC } = await import('./users');
      const { publishTickerEvent } = await import('../realtime/events');
      
      const locEarned = Math.floor(totalAmount / 1000);
      if (locEarned > 0) {
        await updateLOC(Number(dbUserId), locEarned, client);
      }

      const maskedEmail = purchaseData.userEmail 
        ? purchaseData.userEmail.replace(/(.{1}).+(@.+)/, "$1***$2")
        : `User #${dbUserId}`;

      await publishTickerEvent(`User [${maskedEmail}] vá»«a bá»‘t ${validatedItems.length} sáº£n pháº©m cĂ¹ng lĂºc! ðŸ”¥`, 'purchase');
    } catch (err) {
      logger.error('Failed to process gamification for bulk purchase', err);
    }

    return {
      success: true,
      newBalance: currentBalance - totalAmount,
      purchaseIds
    };
  });
}
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
    // Normalize inputs to 2 decimals for consistent NUMERIC(15,2) writes.
    const purchaseAmt = Math.round(purchaseAmount * 100) / 100;
    let commission = Math.round(purchaseAmt * (pct / 100) * 100) / 100;

    // FIX BUG #4: Cap commission per transaction + daily total (fraud prevention)
    const MAX_COMMISSION_PER_TRANSACTION = 500_000; // 500,000 VND
    const MAX_DAILY_COMMISSION = 5_000_000; // 5M VND/day

    commission = Math.min(commission, MAX_COMMISSION_PER_TRANSACTION);
    if (commission <= 0) return null;

    // Serialize credits per referrer to prevent daily-cap bypass via concurrency.
    await client.query(
      `SELECT id FROM users WHERE id = $1 FOR UPDATE`,
      [ref.referrer_id]
    );

    // Guard: if referral_transactions table wasn't migrated, fail closed and skip commission.
    let dailyTotalRes;
    try {
      dailyTotalRes = await client.query(
        `SELECT COALESCE(SUM(commission_amount), 0) as total
         FROM referral_transactions
         WHERE referrer_id = $1
           AND created_at >= CURRENT_DATE
           AND created_at < (CURRENT_DATE + INTERVAL '1 day')`,
        [ref.referrer_id]
      );
    } catch (e: any) {
      if (e?.code === '42P01') {
        logger.warn('referral_transactions table missing; skipping commission credit', {
          referrerId: ref.referrer_id,
        });
        return null;
      }
      throw e;
    }
    const dailyTotal = parseFloat(dailyTotalRes.rows[0]?.total || '0');

    const remainingToday = MAX_DAILY_COMMISSION - dailyTotal;
    if (remainingToday <= 0) return null;

    // If we're close to the cap, only credit the remaining amount.
    const credited = Math.round(Math.min(commission, remainingToday) * 100) / 100;
    if (credited <= 0) return null;

    // Record the commission transaction for auditability + daily cap.
    try {
      await client.query(
        `INSERT INTO referral_transactions
           (referrer_id, referred_id, referral_id, purchase_amount, commission_amount)
         VALUES ($1, $2, $3, $4, $5)`,
        [ref.referrer_id, referredUserId, ref.id, purchaseAmt, credited]
      );
    } catch (e: any) {
      if (e?.code === '42P01') {
        logger.warn('referral_transactions table missing; skipping commission credit', {
          referrerId: ref.referrer_id,
        });
        return null;
      }
      throw e;
    }

    await client.query(
      `UPDATE users SET balance = balance + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [credited, ref.referrer_id]
    );

    await client.query(
      `UPDATE referrals SET
         total_earnings = COALESCE(total_earnings, 0) + $1::numeric,
         status = CASE WHEN status = 'pending' THEN 'active' ELSE status END,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [credited, ref.id]
    );

    // ✅ NEW: Ticker Event cho hoa hồng
    try {
      const { publishTickerEvent } = await import('../realtime/events');
      await publishTickerEvent(`Há»‡ thá»‘ng vá»«a thanh toĂ¡n ${credited.toLocaleString('vi-VN')}Ä‘ hoa há»“ng cho cá»™ng tĂ¡c viĂªn! ðŸ’¸`, 'commission');
    } catch (e) { /* ignore */ }

    return { referrerId: Number(ref.referrer_id), commissionAmount: credited };
  });
}

let depositsSchemaCache: boolean | null = null;

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
    // âœ… FIX: Validate amount
    const amountInput = Number(depositData.amount);
    if (isNaN(amountInput) || amountInput <= 0) {
      throw new Error('Deposit amount must be a positive number');
    }
    // FIX BUG #6: normalize to 2 decimals to match DECIMAL(15,2)
    const amount = Math.round(amountInput * 100) / 100;
    if (amount <= 0) {
      throw new Error('Deposit amount must be a positive number');
    }

    // âœ… FIX: Validate method
    const validMethods = ['bank_transfer', 'e_wallet', 'card', 'crypto', 'momo', 'zalopay', 'vnpay'];
    if (depositData.method && !validMethods.includes(depositData.method)) {
      logger.warn('Unknown deposit method', { method: depositData.method });
      // KhĂ´ng throw â€” cho phĂ©p custom methods nhÆ°ng log warning
    }

    await ensureDepositsSchema();

    const dbUserId = await normalizeUserId(depositData.userId, depositData.userEmail);
    if (!dbUserId) {
      throw new Error('Cannot resolve user ID. User may not exist in database.');
    }

    // âœ… FIX BUG-A6: Check schema for transaction_id
    let hasTransactionId = depositsSchemaCache;
    if (hasTransactionId === null) {
      try {
        const checkResult = await pool.query(`
          SELECT column_name FROM information_schema.columns 
          WHERE table_name = 'deposits' AND column_name = 'transaction_id'
        `);
        hasTransactionId = checkResult.rows.length > 0;
        depositsSchemaCache = hasTransactionId;
      } catch { hasTransactionId = false; }
    }

    // Sinh mĂ£ transaction_code duy nháº¥t 16 kĂ½ tá»±
    let transactionCode = '';
    for (let attempt = 0; attempt < 10; attempt++) {
      const candidate = generateDepositReferenceCode();
      const existing = await queryOne('SELECT id FROM deposits WHERE transaction_code = $1', [candidate]);
      if (!existing) {
        transactionCode = candidate;
        break;
      }
    }
    if (!transactionCode) transactionCode = generateDepositReferenceCode(); // Fallback if collisions somehow persist

    // Insert vá»›i hoáº·c khĂ´ng cĂ³ transaction_id tĂ¹y theo schema
    const ipAddress = depositData.ipAddress || null;
    const deviceInfo = depositData.deviceInfo ? JSON.stringify(depositData.deviceInfo) : null;

    let result;
    if (hasTransactionId) {
      result = await pool.query(
        `INSERT INTO deposits (user_id, amount, method, transaction_id, transaction_code, user_email, user_name, status, ip_address, device_info)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8, $9)
         RETURNING id, timestamp, transaction_code`,
        [
          dbUserId,
          amount,
          depositData.method,
          depositData.transactionId || null,
          transactionCode,
          depositData.userEmail || null,
          depositData.userName || null,
          ipAddress,
          deviceInfo
        ]
      );
    } else {
      // Schema khĂ´ng cĂ³ transaction_id, chá»‰ insert cĂ¡c cá»™t cÆ¡ báº£n
      result = await pool.query(
        `INSERT INTO deposits (user_id, amount, method, transaction_code, user_email, user_name, status, ip_address, device_info)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, $8)
         RETURNING id, timestamp, transaction_code`,
        [
          dbUserId,
          amount,
          depositData.method,
          transactionCode,
          depositData.userEmail || null,
          depositData.userName || null,
          ipAddress,
          deviceInfo
        ]
      );
    }

    // âœ… NEW: Táº¡o thĂ´ng bĂ¡o real-time cho Admin khi cĂ³ yĂªu cáº§u náº¡p má»›i
    try {
      await createNotification({
        userId: dbUserId,
        type: 'deposit_created',
        message: `CĂ³ yĂªu cáº§u náº¡p tiá»n má»›i: ${amount.toLocaleString('vi-VN')}Ä‘ tá»« ${depositData.userEmail || 'User #' + dbUserId}`
      })
    } catch (err) {
      logger.warn('Failed to create notification for new deposit', { userId: dbUserId })
    }

    return {
      id: result.rows[0].id,
      timestamp: result.rows[0].timestamp,
      transactionCode: result.rows[0].transaction_code
    };
  } catch (error) {
    logger.error('Error creating deposit', error, {
      userId: depositData.userId,
      amount: depositData.amount
    });
    throw error;
  }
}
export async function getWithdrawals(userId?: number) {
  try {
    let query = `
      SELECT w.*, 
             u.email AS "userEmail", 
             COALESCE(u.username, u.name, u.email) AS "userName"
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
  // âœ… FIX: Validate amount trÆ°á»›c khi vĂ o transaction
  const WITHDRAWAL_MIN = 5_000; // 5,000 VND minimum

  const amount = Number(withdrawalData.amount);
  if (isNaN(amount) || amount <= 0) {
    throw new Error('Sá»‘ tiá»n rĂºt pháº£i lá»›n hÆ¡n 0');
  }
  // Normalize to 2 decimals to match DECIMAL(15,2) behavior in DB.
  const roundedAmount = Math.round(amount * 100) / 100;
  if (roundedAmount < WITHDRAWAL_MIN) {
    throw new Error(`Sá»‘ tiá»n rĂºt tá»‘i thiá»ƒu lĂ  ${WITHDRAWAL_MIN.toLocaleString('vi-VN')}Ä‘`);
  }

  // âœ… Validate bank info
  if (!withdrawalData.bankName?.trim()) {
    throw new Error('TĂªn ngĂ¢n hĂ ng khĂ´ng Ä‘Æ°á»£c Ä‘á»ƒ trá»‘ng');
  }
  if (!withdrawalData.accountNumber?.trim()) {
    throw new Error('Sá»‘ tĂ i khoáº£n khĂ´ng Ä‘Æ°á»£c Ä‘á»ƒ trá»‘ng');
  }
  if (!withdrawalData.accountName?.trim()) {
    throw new Error('TĂªn chá»§ tĂ i khoáº£n khĂ´ng Ä‘Æ°á»£c Ä‘á»ƒ trá»‘ng');
  }

  const idem = withdrawalData.idempotencyKey?.trim();

  return await withTransaction(async (client) => {
    const dbUserId = await normalizeUserId(withdrawalData.userId, withdrawalData.userEmail);
    if (!dbUserId) {
      throw new Error('Cannot resolve user ID.');
    }

    // 1. Lock user row vĂ  check balance
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
    if (currentBalance < roundedAmount) {
      throw new Error('Insufficient balance');
    }

    // âœ… FIX BUG #5: Per-transaction & daily withdrawal limits
    const MAX_WITHDRAWAL_PER_TRANSACTION = 10_000_000; // 10M VND
    const DAILY_WITHDRAWAL_LIMIT = 50_000_000; // 50M VND

    if (roundedAmount > MAX_WITHDRAWAL_PER_TRANSACTION) {
      throw new Error(
        `Sá»‘ tiá»n rĂºt tá»‘i Ä‘a má»—i láº§n lĂ  ${MAX_WITHDRAWAL_PER_TRANSACTION.toLocaleString('vi-VN')}Ä‘`
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

    if (todayTotal + roundedAmount > DAILY_WITHDRAWAL_LIMIT) {
      const remaining = Math.max(0, DAILY_WITHDRAWAL_LIMIT - todayTotal);
      throw new Error(
        `VÆ°á»£t giá»›i háº¡n rĂºt tiá»n trong ngĂ y (${DAILY_WITHDRAWAL_LIMIT.toLocaleString('vi-VN')}Ä‘). ` +
        `ÄĂ£ rĂºt hĂ´m nay: ${todayTotal.toLocaleString('vi-VN')}Ä‘. ` +
        `CĂ²n láº¡i: ${remaining.toLocaleString('vi-VN')}Ä‘`
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

    // 3. Trá»« tiá»n user_balance ngay láº­p tá»©c atomically
    await client.query(
      'UPDATE users SET balance = balance - $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND balance >= $1',
      [roundedAmount, dbUserId]
    );

    // 4. Táº¡o báº£n ghi rĂºt tiá»n
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
            roundedAmount,
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
            roundedAmount,
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
          [roundedAmount, dbUserId]
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

    const withdrawalResult = {
      id: result.rows[0].id,
      createdAt: result.rows[0].created_at,
      idempotentReplay: false as const,
    };

    // âœ… NEW: ThĂ´ng bĂ¡o real-time cho Admin khi cĂ³ yĂªu cáº§u rĂºt tiá»n má»›i
    // Gá»i ngoĂ i transaction logic (hoáº·c sau commit) Ä‘á»ƒ an toĂ n
    try {
      await createNotification({
        userId: dbUserId,
        type: 'withdrawal_created',
        message: `CĂ³ yĂªu cáº§u rĂºt tiá»n má»›i: ${roundedAmount.toLocaleString('vi-VN')}Ä‘ tá»« ${withdrawalData.userEmail || 'User #' + dbUserId}`
      })
    } catch (err) {
      logger.warn('Failed to create notification for new withdrawal', { userId: dbUserId })
    }

    return withdrawalResult;
  });
}
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

    // 2. Lock user row (Ä‘Ă£ trá»« tiá»n khi create, nĂªn á»Ÿ Ä‘Ă¢y chá»‰ verify sá»‘ dÆ° >= 0 náº¿u cáº§n)
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

    // âœ… NEW: ThĂ´ng bĂ¡o real-time khi duyá»‡t rĂºt tiá»n
    try {
      await createNotification({
        userId,
        type: 'withdrawal_approved',
        message: `YĂªu cáº§u rĂºt ${amount.toLocaleString('vi-VN')}Ä‘ cá»§a báº¡n Ä‘Ă£ Ä‘Æ°á»£c duyá»‡t!`
      });
    } catch (err) {
      logger.warn('Failed to notify withdrawal approval', { withdrawalId });
    }

    return {
      success: true,
      newBalance: currentBalance,
    };
  });
}

