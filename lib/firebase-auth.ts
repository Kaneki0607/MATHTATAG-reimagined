// firebase-auth.ts

import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  User,
} from 'firebase/auth';
import { auth } from './firebase'; // ✅ not getAuth(app)


// 🔹 Sign in existing user
export const signInUser = async (email: string, password: string) => {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    return { user: userCredential.user, error: null };
  } catch (error: any) {
    return { user: null, error: error.message };
  }
};

// 🔹 Register new user
export const signUpUser = async (email: string, password: string, displayName?: string) => {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // Update profile with display name
    if (displayName) {
      await updateProfile(user, { displayName });
    }

    // Send email verification
    await sendEmailVerification(user);

    return { user, error: null };
  } catch (error: any) {
    return { user: null, error: error.message };
  }
};

// 🔹 Sign out current user
export const signOutUser = async () => {
  try {
    await signOut(auth);
    return { error: null };
  } catch (error: any) {
    return { error: error.message };
  }
};

// 🔹 Send password reset email
export const resetPassword = async (email: string) => {
  try {
    await sendPasswordResetEmail(auth, email);
    return { error: null };
  } catch (error: any) {
    return { error: error.message };
  }
};

// 🔹 Re-send verification email
export const verifyEmail = async () => {
  try {
    const user = auth.currentUser;
    if (user) {
      await sendEmailVerification(user);
      return { error: null };
    }
    return { error: 'No user logged in' };
  } catch (error: any) {
    return { error: error.message };
  }
};

// 🔹 Get current logged in user
export const getCurrentUser = () => {
  return auth.currentUser;
};

// 🔹 Listen for auth state changes
export const onAuthChange = (callback: (user: User | null) => void) => {
  return onAuthStateChanged(auth, callback);
};
