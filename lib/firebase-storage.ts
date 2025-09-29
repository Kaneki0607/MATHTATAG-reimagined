import {
    deleteObject,
    getBlob,
    getDownloadURL,
    getMetadata,
    listAll,
    ref,
    updateMetadata,
    uploadBytes,
    uploadBytesResumable,
    uploadString,
} from 'firebase/storage';
import { storage } from './firebase';

// Polyfill for atob in React Native
const atob = (str: string) => {
  try {
    return global.atob ? global.atob(str) : Buffer.from(str, 'base64').toString('binary');
  } catch (e) {
    // Fallback for environments where neither global.atob nor Buffer is available
    return str;
  }
};

// Storage utility functions
export const uploadFile = async (path: string, file: File | Blob, metadata?: any) => {
  try {
    const storageRef = ref(storage, path);
    const snapshot = await uploadBytes(storageRef, file, metadata);
    const downloadURL = await getDownloadURL(snapshot.ref);
    return { downloadURL, error: null };
  } catch (error: any) {
    return { downloadURL: null, error: error.message };
  }
};

export const uploadFileWithProgress = (
  path: string,
  file: File | Blob,
  onProgress?: (progress: number) => void,
  onComplete?: (downloadURL: string) => void,
  onError?: (error: string) => void,
  metadata?: any
) => {
  const storageRef = ref(storage, path);
  const uploadTask = uploadBytesResumable(storageRef, file, metadata);

  uploadTask.on(
    'state_changed',
    (snapshot) => {
      const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
      onProgress?.(progress);
    },
    (error) => {
      onError?.(error.message);
    },
    async () => {
      try {
        const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
        onComplete?.(downloadURL);
      } catch (error: any) {
        onError?.(error.message);
      }
    }
  );

  return uploadTask;
};

export const getFileURL = async (path: string) => {
  try {
    const storageRef = ref(storage, path);
    const downloadURL = await getDownloadURL(storageRef);
    return { downloadURL, error: null };
  } catch (error: any) {
    return { downloadURL: null, error: error.message };
  }
};

export const deleteFile = async (path: string) => {
  try {
    const storageRef = ref(storage, path);
    await deleteObject(storageRef);
    return { success: true, error: null };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
};

export const getFileMetadata = async (path: string) => {
  try {
    const storageRef = ref(storage, path);
    const metadata = await getMetadata(storageRef);
    return { metadata, error: null };
  } catch (error: any) {
    return { metadata: null, error: error.message };
  }
};

export const updateFileMetadata = async (path: string, metadata: any) => {
  try {
    const storageRef = ref(storage, path);
    await updateMetadata(storageRef, metadata);
    return { success: true, error: null };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
};

export const listFiles = async (path: string) => {
  try {
    const storageRef = ref(storage, path);
    const result = await listAll(storageRef);
    return { files: result.items, folders: result.prefixes, error: null };
  } catch (error: any) {
    return { files: [], folders: [], error: error.message };
  }
};

export const downloadFileAsBlob = async (path: string) => {
  try {
    const storageRef = ref(storage, path);
    const blob = await getBlob(storageRef);
    return { blob, error: null };
  } catch (error: any) {
    return { blob: null, error: error.message };
  }
};

// Helper function to create blob from base64 (for TTS audio upload)
export const createFileFromBase64 = (base64: string, filename: string, mimeType: string) => {
  // For React Native, we need to use a different approach
  // Convert base64 to binary string format that React Native Blob can handle
  const base64Data = base64.includes(',') ? base64.split(',')[1] : base64;
  
  // Convert base64 to binary string
  const binaryString = atob(base64Data);
  
  // Create a Blob using the binary string
  // React Native Blob constructor accepts strings
  return new Blob([binaryString], { type: mimeType });
};

// Alternative upload function specifically for base64 data
export const uploadBase64File = async (path: string, base64: string, mimeType: string, metadata?: any) => {
  try {
    const storageRef = ref(storage, path);
    
    // Clean the base64 data
    const base64Data = base64.includes(',') ? base64.split(',')[1] : base64;
    
    // Use uploadString with base64 format - this is the React Native compatible way
    const snapshot = await uploadString(storageRef, base64Data, 'base64', {
      ...metadata,
      contentType: mimeType
    });
    
    const downloadURL = await getDownloadURL(snapshot.ref);
    return { downloadURL, error: null };
  } catch (error: any) {
    return { downloadURL: null, error: error.message };
  }
};
