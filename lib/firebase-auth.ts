// firebase-auth.ts
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import { Platform } from 'react-native';
import { app } from './firebase';

// Lazy, platform-safe Auth initializer
let _auth: import('firebase/auth').Auth | null = null;
export const getAuthInstance = () => {
  if (_auth) return _auth;
  if (Platform.OS === 'web') {
    // Web
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getAuth } = require('firebase/auth');
    _auth = getAuth(app);
    return _auth;
  }
  // React Native
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { initializeAuth, getReactNativePersistence } = require('firebase/auth/react-native');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    _auth = initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
  } catch {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getAuth } = require('firebase/auth');
    _auth = getAuth(app);
  }
  return _auth!;
};

export const signInUser = async (email: string, password: string) => {
  try {
    const auth = getAuthInstance();
    const { user } = await signInWithEmailAndPassword(auth, email, password);
    return { user, error: null };
  } catch (e: any) {
    return { user: null, error: e.message };
  }
};

export const signUpUser = async (email: string, password: string, displayName?: string) => {
  try {
    const auth = getAuthInstance();
    const { user } = await createUserWithEmailAndPassword(auth, email, password);
    if (displayName) await updateProfile(user, { displayName });
    await sendEmailVerification(user);
    return { user, error: null };
  } catch (e: any) {
    return { user: null, error: e.message };
  }
};

export const signOutUser = async () => {
  try {
    const auth = getAuthInstance();
    await signOut(auth);
    return { error: null };
  } catch (e: any) {
    return { error: e.message };
  }
};

export const resetPassword = async (email: string) => {
  try {
    const auth = getAuthInstance();
    await sendPasswordResetEmail(auth, email);
    return { error: null };
  } catch (e: any) {
    return { error: e.message };
  }
};

export const verifyEmail = async () => {
  try {
    const auth = getAuthInstance();
    const user = auth.currentUser;
    if (!user) return { error: 'No user logged in' };
    await sendEmailVerification(user);
    return { error: null };
  } catch (e: any) {
    return { error: e.message };
  }
};

export const getCurrentUser = () => {
  const auth = getAuthInstance();
  return auth.currentUser;
};

export const onAuthChange = (callback: (user: User | null) => void) => {
  const auth = getAuthInstance();
  return onAuthStateChanged(auth, callback);
};
