// firebase.ts
import { getApp, getApps, initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';
import { getStorage } from 'firebase/storage';
import Constants from 'expo-constants';

// Load Firebase config from environment variables via Expo Constants
// These values are set in .env file and loaded through app.config.js
const firebaseConfig = {
  apiKey: Constants.expoConfig?.extra?.firebaseApiKey as string,
  authDomain: Constants.expoConfig?.extra?.firebaseAuthDomain as string,
  databaseURL: Constants.expoConfig?.extra?.firebaseDatabaseURL as string,
  projectId: Constants.expoConfig?.extra?.firebaseProjectId as string,
  storageBucket: Constants.expoConfig?.extra?.firebaseStorageBucket as string,
  messagingSenderId: Constants.expoConfig?.extra?.firebaseMessagingSenderId as string,
  appId: Constants.expoConfig?.extra?.firebaseAppId as string,
  measurementId: Constants.expoConfig?.extra?.firebaseMeasurementId as string,
};

// Validate that all required Firebase config values are present
if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
  throw new Error(
    'Firebase configuration is incomplete. Please check your .env file and ensure all FIREBASE_* variables are set.'
  );
}

// Initialize Firebase app
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Only initialize non-auth services here (safe during route discovery)
// Auth is initialized separately in firebase-auth.ts to avoid the AsyncStorage warning
const database = getDatabase(app);
const storage = getStorage(app);

export { app, database, storage };

