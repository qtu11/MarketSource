/**
 * LocalStorage Migration Utility
 * BUG #36: Dọn dẹp và chuẩn hóa các key cũ trong localStorage
 */
import { getLocalStorage, setLocalStorage, removeLocalStorage } from './localStorage-utils';
import { logger } from './logger-client';

const MIGRATION_KEY = 'ms_migration_version';
const CURRENT_VERSION = 1;

export function runStorageMigration() {
  if (typeof window === 'undefined') return;

  const lastVersion = parseInt(localStorage.getItem(MIGRATION_KEY) || '0');
  if (lastVersion >= CURRENT_VERSION) return;

  logger.info(`Starting storage migration: v${lastVersion} -> v${CURRENT_VERSION}`);

  try {
    // 1. Chuyển đổi 'currentUser' cũ sang 'ms_user' (nếu cần)
    const legacyUser = localStorage.getItem('currentUser');
    if (legacyUser && !localStorage.getItem('ms_user')) {
      localStorage.setItem('ms_user', legacyUser);
      logger.debug('Migrated currentUser to ms_user');
    }

    // 2. Chuyển đổi 'shoppingCart' sang 'ms_cart'
    const legacyCart = localStorage.getItem('shoppingCart');
    if (legacyCart && !localStorage.getItem('ms_cart')) {
      localStorage.setItem('ms_cart', legacyCart);
      logger.debug('Migrated shoppingCart to ms_cart');
    }

    // 3. Xóa các key rác/quy mô lớn không còn dùng
    const keysToRemove = [
      'temp_product_draft',
      'old_debug_logs',
      'firebase:auth:fake-token',
      'last_checked_timestamp'
    ];

    keysToRemove.forEach(key => {
      if (localStorage.getItem(key)) {
        localStorage.removeItem(key);
        logger.debug(`Removed legacy key: ${key}`);
      }
    });

    // 4. Kiểm tra quota và cleanup nếu cần (đã có trong localStorage-utils but double check here)
    
    localStorage.setItem(MIGRATION_KEY, CURRENT_VERSION.toString());
    logger.info('Storage migration completed successfully');
  } catch (error) {
    logger.error('Storage migration failed', error);
  }
}
