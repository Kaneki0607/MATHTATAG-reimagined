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
} from 'firebase/storage';
import { storage } from './firebase';

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

// Helper function to create file from base64
export const createFileFromBase64 = (base64: string, filename: string, mimeType: string) => {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  
  const byteArray = new Uint8Array(byteNumbers);
  return new File([byteArray], filename, { type: mimeType });
};
