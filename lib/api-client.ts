/**
 * API Client Helper
 * Hỗ trợ gọi API với Firebase authentication token
 * ✅ FIX: Sử dụng fetchWithTimeout để tránh hang requests
 */

import { getAuth } from 'firebase/auth';
import { initializeApp, getApps } from 'firebase/app';
import { fetchWithTimeout } from './fetch-with-timeout';
import { getLocalStorage } from './localStorage-utils';
import { logger } from './logger-client';

let firebaseApp: any = null;

// Initialize Firebase nếu chưa có
async function getFirebaseApp() {
  if (firebaseApp) {
    return firebaseApp;
  }

  try {
    const { initializeApp } = await import('firebase/app');
    const { getAuth } = await import('firebase/auth');

    if (getApps().length === 0) {
      // Initialize with environment variables
      const config = {
        apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
        authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      };

      firebaseApp = initializeApp(config);
    } else {
      firebaseApp = getApps()[0];
    }

    return firebaseApp;
  } catch (error) {
    logger.error('Error initializing Firebase:', error);
    return null;
  }
}

/**
 * Lấy Firebase authentication token
 */
export async function getAuthToken(): Promise<string | null> {
  // Check if running in browser
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    // Check if user is logged in
    const isLoggedIn = getLocalStorage<string>('isLoggedIn', 'false') === 'true';
    if (!isLoggedIn) {
      return null;
    }

    await getFirebaseApp();
    const { getAuth } = await import('firebase/auth');
    const auth = getAuth();

    // Wait for auth state to be ready
    let user = auth.currentUser;
    if (!user) {
      // Try to get user from auth state
      await new Promise((resolve) => {
        const unsubscribe = auth.onAuthStateChanged((authUser) => {
          unsubscribe();
          user = authUser;
          resolve(undefined);
        });
        // Timeout after 2 seconds
        setTimeout(() => {
          unsubscribe();
          resolve(undefined);
        }, 2000);
      });
    }

    if (!user) {
      // Check localStorage as fallback
      try {
        const savedUser = getLocalStorage<unknown>('currentUser', null);
        if (savedUser) {
          // User exists in localStorage but not in Firebase Auth
          // This can happen with OAuth or if Firebase hasn't initialized
          // Return null - backend should handle this case
          logger.warn('User in localStorage but not in Firebase Auth');
          return null;
        }
      } catch (storageError) {
        logger.warn('localStorage not available', { error: storageError });
      }
      return null;
    }

    const token = await user.getIdToken(true); // Force refresh
    return token;
  } catch (error) {
    logger.error('Error getting auth token:', error);
    return null;
  }
}

/**
 * Tạo headers với authentication token
 * ✅ FIX: Thêm fallback email header nếu không có Firebase token
 */
export async function getAuthHeaders(): Promise<HeadersInit> {
  const token = await getAuthToken();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  // ✅ FIX: Luôn thử lấy email từ localStorage để gửi header X-User-Email
  // Ngay cả khi có token, vẫn gửi email để backup
  try {
    const isLoggedIn = typeof window !== 'undefined' && localStorage.getItem('isLoggedIn') === 'true';
    if (isLoggedIn) {
      // Thử nhiều key để tìm user data
      let savedUser: string | null = null;

      // Thử currentUser trước
      const currentUserData = getLocalStorage<unknown>('currentUser', null);
      savedUser = currentUserData ? JSON.stringify(currentUserData) : null;

      // Nếu không có, thử qtusdev_user
      if (!savedUser) {
        const qtusdevUserData = getLocalStorage<unknown>('qtusdev_user', null);
        savedUser = qtusdevUserData ? JSON.stringify(qtusdevUserData) : null;
      }

      // Nếu vẫn không có, tìm user_* keys
      if (!savedUser && typeof window !== 'undefined') {
        try {
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('user_')) {
              const userData = localStorage.getItem(key);
              if (userData) {
                savedUser = userData;
                break;
              }
            }
          }
        } catch (loopError) {
          logger.warn('Error looping localStorage', { error: loopError });
        }
      }

      if (savedUser) {
        try {
          const user = JSON.parse(savedUser);
          // Đảm bảo email có giá trị hợp lệ
          if (user.email && typeof user.email === 'string' && user.email.includes('@')) {
            headers['X-User-Email'] = user.email;
            // ✅ SECURITY FIX: Không gửi Email Auth Secret từ client
            // Secret chỉ được verify server-side qua NextAuth session
            if (!token) {
              logger.debug('Using email-based auth (no token)', { email: user.email });
            }
          } else {
            logger.warn('User email not found or invalid in localStorage', { user });
          }
        } catch (parseError) {
          logger.warn('Failed to parse user from localStorage', { error: parseError });
        }
      } else {
        if (!token) {
          logger.warn('No user data found in localStorage for email-based auth');
        }
      }
    }
  } catch (storageError) {
    logger.warn('localStorage error', { error: storageError });
  }

  // Nếu có token, thêm Authorization header
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return headers;
}

/**
 * Gọi API với authentication
 * ✅ FIX: Thêm CSRF token cho admin routes
 */
export async function apiRequest(
  endpoint: string,
  options: RequestInit = {}
): Promise<any> {
  try {
    const headers = await getAuthHeaders();

    // ✅ SECURITY FIX: Thêm CSRF token cho admin routes
    if (typeof window !== 'undefined' && endpoint.includes('/admin')) {
      // ✅ FIX: Get token directly because JSON.parse in getLocalStorage fails on raw string tokens
      let csrfToken = window.localStorage.getItem('csrf-token');
      if (csrfToken) {
        // Remove surrounding quotes if they exist (backward compatibility with setLocalStorage)
        if (csrfToken.startsWith('"') && csrfToken.endsWith('"') && csrfToken.length >= 2) {
          csrfToken = csrfToken.slice(1, -1);
        }
        (headers as Record<string, string>)['X-CSRF-Token'] = csrfToken;
      }
    }

    // Log headers để debug (không log token nếu có) - chỉ chạy ở development
    if (process.env.NODE_ENV === 'development') {
      const logHeaders: Record<string, string> = {};
      const redactHeader = (key: string, value: string) => {
        if (key.toLowerCase() === 'authorization') {
          return 'Bearer ***';
        }
        if (key.toLowerCase() === 'x-user-email') {
          return '***@***';
        }
        return value;
      };

      if (headers instanceof Headers) {
        headers.forEach((value, key) => {
          logHeaders[key] = redactHeader(key, value);
        });
      } else if (Array.isArray(headers)) {
        headers.forEach(([key, value]) => {
          logHeaders[key] = redactHeader(key, value);
        });
      } else {
        Object.entries(headers).forEach(([key, value]) => {
          logHeaders[key] = redactHeader(key, String(value));
        });
      }

      logger.debug('API Request', {
        endpoint,
        method: options.method || 'GET',
        headers: logHeaders
      });
    }

    // ✅ FIX: Sử dụng fetchWithTimeout để tránh hang requests, thêm credentials để gửi kèm cookie
    const response = await fetchWithTimeout(endpoint, {
      ...options,
      credentials: options.credentials || 'include',
      headers: {
        ...headers,
        ...options.headers,
      },
      timeout: 30000, // 30 seconds timeout
    });

    if (!response.ok) {
      // Handle 401 - Unauthorized
      if (response.status === 401) {
        const errorData = await response.json().catch(() => ({}));
        // Check if user is logged in
        const isLoggedIn = typeof window !== 'undefined' && getLocalStorage<string>('isLoggedIn', 'false') === 'true';
        if (isLoggedIn) {
          // Log chi tiết để debug
          const currentUser = getLocalStorage<unknown>('currentUser', null);
          const qtusdevUser = getLocalStorage<unknown>('qtusdev_user', null);
          const savedUser = currentUser ? JSON.stringify(currentUser) : (qtusdevUser ? JSON.stringify(qtusdevUser) : null);
          let userEmail: string | null = null;
          if (savedUser) {
            try {
              const user = JSON.parse(savedUser);
              userEmail = user.email || null;
            } catch {
              userEmail = 'parse_error';
            }
          }
          logger.warn('401 Unauthorized - User may need to re-login', {
            endpoint,
            hasUser: !!savedUser,
            userEmail
          });
        }
        throw new Error(
          errorData.error || errorData.message || 'Unauthorized: Please login again'
        );
      }

      // Handle 429 - Rate limited
      if (response.status === 429) {
        throw new Error('Too many requests. Please wait a moment and try again.');
      }

      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.error || errorData.message || `API error: ${response.statusText}`
      );
    }

    return await response.json();
  } catch (error: any) {
    logger.error('API request error:', error);
    throw error;
  }
}

/**
 * GET request
 */
export async function apiGet(endpoint: string, params?: Record<string, any>) {
  // Check if running in browser
  if (typeof window === 'undefined') {
    throw new Error('apiGet can only be called in browser environment');
  }

  const url = new URL(endpoint, window.location.origin);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.append(key, String(value));
      }
    });
  }

  return apiRequest(url.toString(), {
    method: 'GET',
    credentials: 'include',
  });
}

/**
 * POST request
 */
export async function apiPost(endpoint: string, data: any, options?: RequestInit) {
  return apiRequest(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) },
    body: JSON.stringify(data),
    credentials: 'include',
    ...options
  });
}

/**
 * PUT request
 */
export async function apiPut(endpoint: string, data: any, options?: RequestInit) {
  return apiRequest(endpoint, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) },
    body: JSON.stringify(data),
    credentials: 'include',
    ...options
  });
}

/**
 * DELETE request
 */
export async function apiDelete(endpoint: string, options?: RequestInit) {
  return apiRequest(endpoint, {
    method: 'DELETE',
    credentials: 'include',
    ...options
  });
}

