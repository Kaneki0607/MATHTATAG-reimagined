// Re-export all Firebase utilities for easy importing
export * from './firebase';
export * from './firebase-auth';
export * from './firebase-database';
export * from './firebase-storage';

// Common Firebase types and interfaces
export interface FirebaseUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  emailVerified: boolean;
}

export interface AuthResult {
  user: FirebaseUser | null;
  error: string | null;
}

export interface DatabaseResult {
  data: any;
  error: string | null;
}

export interface StorageResult {
  downloadURL: string | null;
  error: string | null;
}

export interface UploadProgress {
  progress: number;
  downloadURL?: string;
  error?: string;
}

// Firebase configuration type
export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId?: string;
}
