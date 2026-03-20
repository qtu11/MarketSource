/**
 * Environment Variable Validator
 * BUG #37: Kiểm tra các biến môi trường quan trọng trước khi ứng dụng chạy
 */
import { logger } from './logger';

export function validateEnv() {
  const isServer = typeof window === 'undefined';
  if (!isServer) return;

  const requiredEnv = [
    'DATABASE_URL',
    'NEXTAUTH_SECRET',
    'NEXT_PUBLIC_SITE_URL',
    'NEXT_PUBLIC_FIREBASE_API_KEY',
    'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
    'NEXT_PUBLIC_FIREBASE_PROJECT_ID'
  ];

  const missing = requiredEnv.filter(env => !process.env[env]);

  if (missing.length > 0) {
    const message = `Missing essential environment variables: ${missing.join(', ')}`;
    
    if (process.env.NODE_ENV === 'production') {
      logger.error('CRITICAL: ' + message);
      // Trong production, chúng ta có thể muốn throw error để fail-fast
      // throw new Error(message);
    } else {
      logger.warn('WARNING: ' + message);
    }
  } else {
    logger.info('✅ Environment variables validated');
  }

  return { 
    success: missing.length === 0, 
    errors: missing 
  };
}
