// Browser-safe Firebase Firestore stub.
// This file intentionally exports an optional `firestore` object.
// Code should check for its presence before using.

let firestore: any = null;
let db: any = null;

// Check if Firebase is configured
export function isFirebaseConfigured(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID &&
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY &&
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
  )
}

// Initialize Firebase Firestore (server-side only)
let realtimeDb: any = null;

// Initialize Firebase (server & client)
if (isFirebaseConfigured()) {
  try {
    const { initializeApp, getApps } = require('firebase/app')
    const { getFirestore } = require('firebase/firestore')
    const { getDatabase } = require('firebase/database')
    
    const firebaseConfig = {
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
      databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL
    }
    
    const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0]
    db = getFirestore(app)
    firestore = db
    realtimeDb = getDatabase(app)
  } catch (error) {
    console.warn('Firebase initialization failed:', error)
  }
}

export { firestore, db, realtimeDb };

const firebaseExports = { firestore, db };
export default firebaseExports;
