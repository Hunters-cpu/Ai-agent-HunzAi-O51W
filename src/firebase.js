import admin from 'firebase-admin';
import { logger } from './logger.js';

let app = null;
let db = null;

export function initFirebase() {
  if (app) return { app, db };

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      'Firebase credentials tidak lengkap. Cek FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY di .env'
    );
  }

  // Fix newline escape
  privateKey = privateKey.replace(/\\n/g, '\n');
  if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
    privateKey = privateKey.slice(1, -1);
  }

  app = admin.initializeApp({
    credential: admin.credential.cert({
      projectId,
      clientEmail,
      privateKey
    })
  });

  db = admin.firestore();
  db.settings({ ignoreUndefinedProperties: true });

  logger.info('✓ Firebase Admin terhubung');
  return { app, db };
}

export function getDb() {
  if (!db) initFirebase();
  return db;
}

export function getFieldValue() {
  return admin.firestore.FieldValue;
}

export function getTimestamp() {
  return admin.firestore.Timestamp;
}
