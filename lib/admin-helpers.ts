/**
 * Admin Helper Functions
 * Wrapper functions để tương thích với code cũ từ @/lib/auth
 */

import { userManager } from '@/lib/userManager';
import { apiGet, apiPost, apiPut } from '@/lib/api-client';
import { logger } from './logger';

// ✅ FIX: Cache dữ liệu thực từ database thay vì mock arrays
const cacheDeposits: any[] = [];
const cacheWithdrawals: any[] = [];
const cachePurchases: any[] = [];
let lastDepositsUpdate = 0;
let lastWithdrawalsUpdate = 0;
let lastPurchasesUpdate = 0;
const CACHE_TTL = 5000; // 5 giây

/**
 * Get user data (synchronous - từ cache)
 * Note: Real data should be loaded via API hoặc userManager.getAllUsers()
 * @deprecated Dùng getUsers từ database.ts thay thế
 */
export function getUserData(): any[] {
  // ✅ FIX: Không còn quét localStorage. Admin UI nên dùng userManager.getAllUsers()
  logger.info('admin-helpers.getUserData called. LocalStorage scanning is now disabled for security and consistency.');
  return [];
}

/**
 * Save user data
 * @deprecated Dùng userManager.saveUserData thay thế
 */
export async function saveUserData(userData: any): Promise<void> {
  if (userData.uid) {
    await userManager.saveUserData(userData.uid, userData);
  }
}

/**
 * Get deposits (synchronous - từ cache)
 * Note: Real data should be loaded via loadDepositsAndWithdrawals() first
 */
export function getDeposits(): any[] {
  // ✅ FIX: Trả về cache thực thay vì mock array
  return [...cacheDeposits];
}

/**
 * Get withdrawals (synchronous - từ cache)
 * Note: Real data should be loaded via loadDepositsAndWithdrawals() first
 */
export function getWithdrawals(): any[] {
  // ✅ FIX: Trả về cache thực thay vì mock array
  return [...cacheWithdrawals];
}

/**
 * Save deposit (approve/update or create)
 */
export async function saveDeposit(depositData: any): Promise<void> {
  if (depositData.id) {
    // Update existing (admin approve)
    await apiPut('/api/deposits', {
      depositId: depositData.id,
      status: depositData.status || 'approved',
      approvedBy: depositData.approvedBy,
    });
  } else {
    // Create new (user-like path)
    await apiPost('/api/deposits', {
      userId: depositData.userId || depositData.user_id,
      amount: depositData.amount,
      method: depositData.method || 'unknown',
      transactionId: depositData.transactionId || depositData.transaction_id || '',
    });
  }

  // Reload để có dữ liệu mới nhất
  await loadDepositsAndWithdrawals();
}

/**
 * Save withdrawal (approve/update or create)
 */
export async function saveWithdrawal(withdrawalData: any): Promise<void> {
  if (withdrawalData.id) {
    // Update existing (admin approve)
    await apiPut('/api/withdrawals', {
      withdrawalId: withdrawalData.id,
      status: withdrawalData.status || 'approved',
      approvedBy: withdrawalData.approvedBy,
    });
  } else {
    // Create new
    await apiPost('/api/withdrawals', {
      userId: withdrawalData.userId || withdrawalData.user_id,
      amount: withdrawalData.amount,
      bankName: withdrawalData.bankName || withdrawalData.bank_name || '',
      accountNumber: withdrawalData.accountNumber || withdrawalData.account_number || '',
      accountName: withdrawalData.accountName || withdrawalData.account_name || '',
    });
  }

  // Reload để có dữ liệu mới nhất
  await loadDepositsAndWithdrawals();
}

/**
 * Save notification (via API)
 */
export async function saveNotification(notificationData: any): Promise<any> {
  try {
    const result = await apiPost('/api/save-notification', {
      userId: notificationData.userId || notificationData.user_id,
      userEmail: notificationData.userEmail || notificationData.user_email,
      title: notificationData.title || 'Thông báo',
      message: notificationData.message || notificationData.content || '',
      type: notificationData.type || 'system',
      read: notificationData.read || false,
    });

    return { success: true, id: result.id || result.notificationId };
  } catch (error) {
    logger.error('Error saving notification:', error);
    return { success: false, error };
  }
}

/**
 * ✅ FIX: Real-time change listeners với polling-based updates
 * Polling interval: 5 giây để đảm bảo real-time updates
 */
const pollingIntervals = new Map<string, NodeJS.Timeout>();
const listeners = new Map<string, Set<(data: any[]) => void>>();

function startPolling(key: string, fetchFn: () => Promise<any[]>, interval: number = 5000) {
  if (pollingIntervals.has(key)) {
    return; // Đã có polling rồi
  }

  const intervalId = setInterval(async () => {
    try {
      const data = await fetchFn();
      const callbacks = listeners.get(key);
      if (callbacks) {
        callbacks.forEach(cb => cb(data));
      }
    } catch (error) {
      logger.error(`Error polling ${key}`, error);
    }
  }, interval);

  pollingIntervals.set(key, intervalId);
}

function stopPolling(key: string) {
  const intervalId = pollingIntervals.get(key);
  if (intervalId) {
    clearInterval(intervalId);
    pollingIntervals.delete(key);
  }
}

export function onUsersChange(callback: (users: any[]) => void): () => void {
  const key = 'users';
  if (!listeners.has(key)) {
    listeners.set(key, new Set());
    startPolling(key, async () => {
      const allUsers = await userManager.getAllUsers();
      return allUsers;
    });
  }

  listeners.get(key)!.add(callback);

  // ✅ FIX: Chỉ call immediately nếu cache không có hoặc quá hạn (UserManager đã có cache riêng nên gọi getAllUsers trực tiếp)
  userManager.getAllUsers().then(callback).catch(err => logger.error('Error getting users', err));

  return () => {
    const callbacks = listeners.get(key);
    if (callbacks) {
      callbacks.delete(callback);
      if (callbacks.size === 0) {
        stopPolling(key);
        listeners.delete(key);
      }
    }
  };
}

export function onDepositsChange(callback: (deposits: any[]) => void): () => void {
  const key = 'deposits';
  if (!listeners.has(key)) {
    listeners.set(key, new Set());
    startPolling(key, async () => {
      await loadDepositsAndWithdrawals();
      return cacheDeposits;
    });
  }

  listeners.get(key)!.add(callback);

  // ✅ FIX: Chỉ fetch ngay lập tức nếu cache hết hạn
  const now = Date.now();
  if (now - lastDepositsUpdate < CACHE_TTL && cacheDeposits.length > 0) {
    callback([...cacheDeposits]);
  } else {
    loadDepositsAndWithdrawals().then(() => callback([...cacheDeposits])).catch(err => logger.error('Error getting deposits', err));
  }

  return () => {
    const callbacks = listeners.get(key);
    if (callbacks) {
      callbacks.delete(callback);
      if (callbacks.size === 0) {
        stopPolling(key);
        listeners.delete(key);
      }
    }
  };
}

export function onWithdrawalsChange(callback: (withdrawals: any[]) => void): () => void {
  const key = 'withdrawals';
  if (!listeners.has(key)) {
    listeners.set(key, new Set());
    startPolling(key, async () => {
      await loadDepositsAndWithdrawals();
      return cacheWithdrawals;
    });
  }

  listeners.get(key)!.add(callback);

  // ✅ FIX: Chỉ fetch ngay lập tức nếu cache hết hạn
  const now = Date.now();
  if (now - lastWithdrawalsUpdate < CACHE_TTL && cacheWithdrawals.length > 0) {
    callback([...cacheWithdrawals]);
  } else {
    loadDepositsAndWithdrawals().then(() => callback([...cacheWithdrawals])).catch(err => logger.error('Error getting withdrawals', err));
  }

  return () => {
    const callbacks = listeners.get(key);
    if (callbacks) {
      callbacks.delete(callback);
      if (callbacks.size === 0) {
        stopPolling(key);
        listeners.delete(key);
      }
    }
  };
}

let activePurchasesPromise: Promise<any[]> | null = null;

export function onPurchasesChange(callback: (purchases: any[]) => void): () => void {
  const key = 'purchases';
  if (!listeners.has(key)) {
    listeners.set(key, new Set());
    startPolling(key, async () => {
      try {
        const now = Date.now();
        if (now - lastPurchasesUpdate < CACHE_TTL && cachePurchases.length > 0) {
          return [...cachePurchases];
        }

        if (activePurchasesPromise) {
          return await activePurchasesPromise;
        }

        activePurchasesPromise = (async () => {
          try {
            const result = await apiGet('/api/purchases');
            const data = result.purchases || result.data || [];
            if (data.length > 0) {
              cachePurchases.length = 0;
              cachePurchases.push(...data);
              lastPurchasesUpdate = Date.now();
            }
            return data;
          } finally {
            activePurchasesPromise = null;
          }
        })();

        return await activePurchasesPromise;
      } catch (error) {
        logger.error('Error fetching purchases', error);
        return [...cachePurchases];
      }
    });
  }

  listeners.get(key)!.add(callback);

  // Call immediately với data hiện tại (hoặc từ cache)
  const now = Date.now();
  if (now - lastPurchasesUpdate < CACHE_TTL && cachePurchases.length > 0) {
    callback([...cachePurchases]);
  } else if (activePurchasesPromise) {
    activePurchasesPromise.then(data => callback([...data])).catch(() => callback([...cachePurchases]));
  } else {
    activePurchasesPromise = (async () => {
      try {
        const result = await apiGet('/api/purchases');
        const data = result.purchases || result.data || [];
        if (data.length > 0) {
          cachePurchases.length = 0;
          cachePurchases.push(...data);
          lastPurchasesUpdate = Date.now();
        }
        return data;
      } finally {
        activePurchasesPromise = null;
      }
    })();

    activePurchasesPromise.then(data => callback([...data])).catch(() => callback([...cachePurchases]));
  }

  return () => {
    const callbacks = listeners.get(key);
    if (callbacks) {
      callbacks.delete(callback);
      if (callbacks.size === 0) {
        stopPolling(key);
        listeners.delete(key);
      }
    }
  };
}

/**
 * ✅ FIX: Load deposits và withdrawals từ API và update cache với TTL
 * Thêm cơ chế lock (activePromise) để chống Cache Stampede khi nhiều component gọi cùng lúc
 */
let activeDepositsWithdrawalsPromise: Promise<{ deposits: any[], withdrawals: any[] }> | null = null;

export async function loadDepositsAndWithdrawals(): Promise<{ deposits: any[], withdrawals: any[] }> {
  const now = Date.now();

  // ✅ FIX: Chỉ fetch nếu cache đã hết hạn hoặc chưa có data
  const shouldFetchDeposits = (now - lastDepositsUpdate) > CACHE_TTL || cacheDeposits.length === 0;
  const shouldFetchWithdrawals = (now - lastWithdrawalsUpdate) > CACHE_TTL || cacheWithdrawals.length === 0;

  // Trả về cache nếu còn hạn
  if (!shouldFetchDeposits && !shouldFetchWithdrawals) {
    return { deposits: [...cacheDeposits], withdrawals: [...cacheWithdrawals] };
  }

  // Nếu đang có request fetch thì đợi request đó trả về thay vì tạo request mới (chống Cache Stampede)
  if (activeDepositsWithdrawalsPromise) {
    return activeDepositsWithdrawalsPromise;
  }

  activeDepositsWithdrawalsPromise = (async () => {
    try {
      const promises: Promise<any>[] = [];

      if (shouldFetchDeposits) {
        promises.push(apiGet('/api/deposits').then(result => ({ type: 'deposits', data: result })));
      }

      if (shouldFetchWithdrawals) {
        promises.push(apiGet('/api/withdrawals').then(result => ({ type: 'withdrawals', data: result })));
      }

      if (promises.length === 0) {
        return { deposits: [...cacheDeposits], withdrawals: [...cacheWithdrawals] };
      }

      const results = await Promise.all(promises);

      results.forEach((result: any) => {
        if (result.type === 'deposits') {
          const deposits = (result.data.deposits || []).map((d: any) => ({
            ...d,
            timestamp: d.timestamp || d.created_at,
            user_id: d.user_id,
            userEmail: d.userEmail || d.user_email,
            userName: d.userName || d.user_name,
          }));

          cacheDeposits.length = 0;
          cacheDeposits.push(...deposits);
          lastDepositsUpdate = now;

          const callbacks = listeners.get('deposits');
          if (callbacks) {
            callbacks.forEach(cb => cb([...cacheDeposits]));
          }
        } else if (result.type === 'withdrawals') {
          const withdrawals = (result.data.withdrawals || []).map((w: any) => ({
            ...w,
            timestamp: w.created_at || w.timestamp,
            user_id: w.user_id,
            userEmail: w.userEmail || w.user_email,
            userName: w.userName || w.user_name,
          }));

          cacheWithdrawals.length = 0;
          cacheWithdrawals.push(...withdrawals);
          lastWithdrawalsUpdate = now;

          const callbacks = listeners.get('withdrawals');
          if (callbacks) {
            callbacks.forEach(cb => cb([...cacheWithdrawals]));
          }
        }
      });

      return { deposits: [...cacheDeposits], withdrawals: [...cacheWithdrawals] };
    } catch (error) {
      logger.error('Error loading deposits and withdrawals:', error);
      return { deposits: [...cacheDeposits], withdrawals: [...cacheWithdrawals] };
    } finally {
      activeDepositsWithdrawalsPromise = null;
    }
  })();

  return activeDepositsWithdrawalsPromise;
}

