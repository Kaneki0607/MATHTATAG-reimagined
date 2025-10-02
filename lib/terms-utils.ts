import AsyncStorage from '@react-native-async-storage/async-storage';
import { readData, writeData } from './firebase-database';

// Storage keys for terms agreement
const PARENT_TERMS_KEY = 'parentAgreedToTerms';
const TEACHER_TERMS_KEY = 'teacherAgreedToTerms';

export interface TermsAgreement {
  hasAgreed: boolean;
  agreedAt?: string;
  version?: string;
}

/**
 * Check if parent has agreed to terms
 */
export async function hasParentAgreedToTerms(parentId?: string): Promise<boolean> {
  try {
    // First check AsyncStorage for quick access
    const localAgreement = await AsyncStorage.getItem(PARENT_TERMS_KEY);
    if (localAgreement === 'true') {
      return true;
    }

    // If we have a parentId, check Firebase for persistent storage
    if (parentId) {
      const { data } = await readData(`/parents/${parentId}/termsAgreement`);
      if (data && data.hasAgreed) {
        // Update local storage for faster future checks
        await AsyncStorage.setItem(PARENT_TERMS_KEY, 'true');
        return true;
      }
    }

    return false;
  } catch (error) {
    console.error('Error checking parent terms agreement:', error);
    return false;
  }
}

/**
 * Check if teacher has agreed to terms
 */
export async function hasTeacherAgreedToTerms(teacherId?: string): Promise<boolean> {
  try {
    // First check AsyncStorage for quick access
    const localAgreement = await AsyncStorage.getItem(TEACHER_TERMS_KEY);
    if (localAgreement === 'true') {
      return true;
    }

    // If we have a teacherId, check Firebase for persistent storage
    if (teacherId) {
      const { data } = await readData(`/teachers/${teacherId}/termsAgreement`);
      if (data && data.hasAgreed) {
        // Update local storage for faster future checks
        await AsyncStorage.setItem(TEACHER_TERMS_KEY, 'true');
        return true;
      }
    }

    return false;
  } catch (error) {
    console.error('Error checking teacher terms agreement:', error);
    return false;
  }
}

/**
 * Record parent terms agreement
 */
export async function recordParentTermsAgreement(parentId?: string): Promise<void> {
  try {
    const agreement: TermsAgreement = {
      hasAgreed: true,
      agreedAt: new Date().toISOString(),
      version: '1.0'
    };

    // Save to AsyncStorage for quick access
    await AsyncStorage.setItem(PARENT_TERMS_KEY, 'true');

    // If we have a parentId, also save to Firebase for persistence
    if (parentId) {
      await writeData(`/parents/${parentId}/termsAgreement`, agreement);
    }
  } catch (error) {
    console.error('Error recording parent terms agreement:', error);
  }
}

/**
 * Record teacher terms agreement
 */
export async function recordTeacherTermsAgreement(teacherId?: string): Promise<void> {
  try {
    const agreement: TermsAgreement = {
      hasAgreed: true,
      agreedAt: new Date().toISOString(),
      version: '1.0'
    };

    // Save to AsyncStorage for quick access
    await AsyncStorage.setItem(TEACHER_TERMS_KEY, 'true');

    // If we have a teacherId, also save to Firebase for persistence
    if (teacherId) {
      await writeData(`/teachers/${teacherId}/termsAgreement`, agreement);
    }
  } catch (error) {
    console.error('Error recording teacher terms agreement:', error);
  }
}

/**
 * Clear terms agreement (useful for testing or logout)
 */
export async function clearParentTermsAgreement(): Promise<void> {
  try {
    await AsyncStorage.removeItem(PARENT_TERMS_KEY);
  } catch (error) {
    console.error('Error clearing parent terms agreement:', error);
  }
}

/**
 * Clear teacher terms agreement (useful for testing or logout)
 */
export async function clearTeacherTermsAgreement(): Promise<void> {
  try {
    await AsyncStorage.removeItem(TEACHER_TERMS_KEY);
  } catch (error) {
    console.error('Error clearing teacher terms agreement:', error);
  }
}

