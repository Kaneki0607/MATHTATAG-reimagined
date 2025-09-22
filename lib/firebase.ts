// firebase.ts
import { getApp, getApps, initializeApp } from 'firebase/app';
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
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Only initialize non-auth services here (safe during route discovery)
const database = getDatabase(app);
const storage = getStorage(app);

export { app, database, storage };

