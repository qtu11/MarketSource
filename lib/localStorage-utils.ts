/**
 * localStorage Utilities
 * ✅ FIX: Safe localStorage operations với error handling
 */

import { logger } from './logger';

/**
 * Safe get từ localStorage với error handling
 */
export function getLocalStorage<T>(key: string, defaultValue: T): T {
  try {
    if (typeof window === 'undefined') {
      return defaultValue; // SSR
    }
    
    const item = localStorage.getItem(key);
    if (item === null) {
      return defaultValue;
    }
    
    try {
    return JSON.parse(item) as T;
    } catch {
      // Fallback for legacy string values that weren't JSON-encoded
      return (item as unknown) as T;
    }
  } catch (error) {
    logger.warn('localStorage read failed', { key, error });
    return defaultValue;
  }
}

/**
 * Safe set vào localStorage với error handling
 */
export function setLocalStorage<T>(key: string, value: T): boolean {
  try {
    if (typeof window === 'undefined') {
      return false; // SSR
    }
    
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    logger.warn('localStorage write failed', { key, error });
    
    // Nếu quota exceeded, try to clear old data
    if (error instanceof Error && error.name === 'QuotaExceededError') {
      logger.error('localStorage quota exceeded', error, { key });
      
      // ✅ BUG #35 FIX: Cleanup strategy
      // List các key không thiết yếu hoặc đã có trong DB
      const lowPriorityKeys = ['adminNotifications', 'uploadedProducts', 'temp_purchases', 'debug_logs'];
      lowPriorityKeys.forEach(k => localStorage.removeItem(k));
      
      // Thử lại 1 lần cuối sau khi dọn dẹp
      try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch (retryError) {
        logger.error('localStorage write failed even after cleanup', retryError);
      }
    }
    
    return false;
  }
}

/**
 * Safe remove từ localStorage
 */
export function removeLocalStorage(key: string): boolean {
  try {
    if (typeof window === 'undefined') {
      return false; // SSR
    }
    
    localStorage.removeItem(key);
    return true;
  } catch (error) {
    logger.warn('localStorage remove failed', { key, error });
    return false;
  }
}

/**
 * Clear all localStorage (use with caution)
 */
export function clearLocalStorage(): boolean {
  try {
    if (typeof window === 'undefined') {
      return false; // SSR
    }
    
    localStorage.clear();
    return true;
  } catch (error) {
    logger.warn('localStorage clear failed', { error });
    return false;
  }
}

