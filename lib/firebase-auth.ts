// firebase-auth.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createUserWithEmailAndPassword,
  getAuth,
  initializeAuth,
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

let _auth: import('firebase/auth').Auth | null = null;
export const getAuthInstance = (): import('firebase/auth').Auth => {
  if (_auth) return _auth;
  
  if (Platform.OS === 'web') {
    // Web - use standard getAuth
    _auth = getAuth(app);
    return _auth!;
  }
  
  // React Native - use initializeAuth with AsyncStorage persistence
  try {
    // Use the exact syntax suggested by the Firebase warning
    const { getReactNativePersistence } = require('firebase/auth');
    _auth = initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage)
    });
  } catch (error) {
    // If initializeAuth fails (e.g., already initialized), fall back to getAuth
    _auth = getAuth(app);
  }
  return _auth!;
};

export const signInUser = async (email: string, password: string) => {
  try {
    const auth = getAuthInstance();
    const { user } = await signInWithEmailAndPassword(auth, email, password);

    // Always reload to get the freshest verification status after email link click
    try {
      await user.reload();
    } catch {}

    // If now verified, sync flags in the database and allow login
    if (user.emailVerified) {
      try {
        const { writeData } = await import('./firebase-database');
        // Mark emailVerified true and clear pendingVerification if present
        await writeData(`/teachers/${user.uid}/emailVerified`, true);
        await writeData(`/teachers/${user.uid}/pendingVerification`, false);
      } catch {}
      return { user, error: null, emailNotVerified: false };
    }

    // Still not verified – bubble up for UI to handle
    return { user: null, error: 'EMAIL_NOT_VERIFIED', emailNotVerified: true, unverifiedUser: user };
  } catch (e: any) {
    return { user: null, error: e.message, emailNotVerified: false };
  }
};

export const signUpUser = async (email: string, password: string, displayName?: string) => {
  try {
    const auth = getAuthInstance();
    const { user } = await createUserWithEmailAndPassword(auth, email, password);
    if (displayName) await updateProfile(user, { displayName });
    
    // Send verification email with custom action URL
    const actionCodeSettings = {
      url: 'https://mathtatag-capstone-app.firebaseapp.com/', // Redirect URL after verification
      handleCodeInApp: true,
    };
    
    await sendEmailVerification(user, actionCodeSettings);
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

export const resendVerificationEmail = async (user?: User) => {
  try {
    const auth = getAuthInstance();
    const targetUser = user || auth.currentUser;
    if (!targetUser) return { error: 'No user logged in' };
    
    // Check if email is already verified
    await targetUser.reload();
    if (targetUser.emailVerified) {
      return { error: null, alreadyVerified: true };
    }
    
    // Send verification email with custom action URL
    const actionCodeSettings = {
      url: 'https://mathtatag-capstone-app.firebaseapp.com/',
      handleCodeInApp: true,
    };
    
    await sendEmailVerification(targetUser, actionCodeSettings);
    return { error: null, alreadyVerified: false };
  } catch (e: any) {
    return { error: e.message, alreadyVerified: false };
  }
};

export const verifyEmail = async () => {
  try {
    const auth = getAuthInstance();
    const user = auth.currentUser;
    if (!user) return { error: 'No user logged in' };
    
    const actionCodeSettings = {
      url: 'https://mathtatag-capstone-app.firebaseapp.com/',
      handleCodeInApp: true,
    };
    
    await sendEmailVerification(user, actionCodeSettings);
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

export const handleEmailVerification = async (user: User) => {
  try {
    // Reload user to get latest email verification status
    await user.reload();
    
    if (user.emailVerified) {
      // Update database to mark email as verified
      const { writeData } = await import('./firebase-database');
      const { success, error } = await writeData(`/teachers/${user.uid}/emailVerified`, true);
      
      if (success) {
        return { success: true, error: null };
      } else {
        return { success: false, error: error || 'Failed to update email verification status' };
      }
    }
    
    return { success: false, error: 'Email not verified' };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
};