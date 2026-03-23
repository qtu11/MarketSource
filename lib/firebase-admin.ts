import * as admin from 'firebase-admin';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getDatabase } from 'firebase-admin/database';
import { logger } from './logger';

/**
 * Centralized Firebase Admin initialization.
 * Uses environment variables for configuration.
 */
let hasWarned = false;

export async function getFirebaseAdmin() {
  try {
    const apps = getApps();
    
    if (apps.length === 0) {
      const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
      const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
      const privateKey = process.env.FIREBASE_PRIVATE_KEY;

      if (!projectId || !clientEmail || !privateKey) {
        if (!hasWarned) {
          const msg = 'Missing Firebase Admin environment variables (PROJECT_ID, CLIENT_EMAIL, or PRIVATE_KEY)';
          logger.warn(msg + '. Firebase features will be disabled.');
          hasWarned = true;
        }
        return null;
      }

      initializeApp({
        credential: cert({
          projectId,
          clientEmail,
          privateKey: privateKey.replace(/\\n/g, '\n'),
        }),
        databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL || process.env.FIREBASE_DATABASE_URL,
      });
    }

    return {
      auth: getAuth(),
      db: getDatabase(),
    };
  } catch (error) {
    logger.error('Error initializing Firebase Admin', error);
    return null;
  }
}

/**
 * Helper to get Realtime Database reference
 */
export async function getRealtimeDB() {
  const admin = await getFirebaseAdmin();
  return admin?.db || null;
}
