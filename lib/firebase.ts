// firebase.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getReactNativePersistence, initializeAuth } from 'firebase/auth/react-native';
import { getDatabase } from 'firebase/database';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: 'AIzaSyCa8VPUo61L6MIGptW3fRoSUN13xPFzqdI',
  authDomain: 'mathtatag-capstone-app.firebaseapp.com',
  databaseURL: 'https://mathtatag-capstone-app-default-rtdb.firebaseio.com',
  projectId: 'mathtatag-capstone-app',
  storageBucket: 'mathtatag-capstone-app.firebasestorage.app',
  messagingSenderId: '974540125959',
  appId: '1:974540125959:web:5abf2650be3502993cb7a2',
  measurementId: 'G-RKEVRP1200',
};

// Initialize Firebase app
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

// ✅ Initialize auth only once
let auth;
try {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} catch (e) {
  auth = getAuth(app);
}

const database = getDatabase(app);
const storage = getStorage(app);

export { app, auth, database, storage };

