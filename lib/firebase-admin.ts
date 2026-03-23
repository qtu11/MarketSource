import * as admin from 'firebase-admin';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getDatabase } from 'firebase-admin/database';
import { logger } from './logger';

/**
 * Centralized Firebase Admin initialization.
 * Uses environment variables for configuration.
 */
export async function getFirebaseAdmin() {
  try {
    const apps = getApps();
    
    if (apps.length === 0) {
      if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PRIVATE_KEY) {
        throw new Error('Missing Firebase Admin environment variables');
      }

      initializeApp({
        credential: cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
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
