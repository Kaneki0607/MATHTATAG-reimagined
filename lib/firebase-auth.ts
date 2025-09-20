// Firebase Auth temporarily disabled to prevent initialization errors
// import {
//     createUserWithEmailAndPassword,
//     onAuthStateChanged,
//     sendEmailVerification,
//     sendPasswordResetEmail,
//     signInWithEmailAndPassword,
//     signOut,
//     updateProfile,
//     User,
// } from 'firebase/auth';
// import { auth } from './firebase';

// Auth utility functions (temporarily disabled)
export const signInUser = async (email: string, password: string) => {
  return { user: null, error: 'Auth temporarily disabled' };
};

export const signUpUser = async (email: string, password: string, displayName?: string) => {
  return { user: null, error: 'Auth temporarily disabled' };
};

export const signOutUser = async () => {
  return { error: 'Auth temporarily disabled' };
};

export const resetPassword = async (email: string) => {
  return { error: 'Auth temporarily disabled' };
};

export const verifyEmail = async () => {
  return { error: 'Auth temporarily disabled' };
};

export const getCurrentUser = () => {
  return null;
};

export const onAuthChange = (callback: (user: any) => void) => {
  return () => {};
};
