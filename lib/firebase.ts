// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";
import { getStorage } from "firebase/storage";

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCa8VPUo61L6MIGptW3fRoSUN13xPFzqdI",
  authDomain: "mathtatag-capstone-app.firebaseapp.com",
  databaseURL: "https://mathtatag-capstone-app-default-rtdb.firebaseio.com",
  projectId: "mathtatag-capstone-app",
  storageBucket: "mathtatag-capstone-app.firebasestorage.app",
  messagingSenderId: "974540125959",
  appId: "1:974540125959:web:5abf2650be3502993cb7a2",
  measurementId: "G-RKEVRP1200"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase services
export const database = getDatabase(app);
export const storage = getStorage(app);

export default app;
