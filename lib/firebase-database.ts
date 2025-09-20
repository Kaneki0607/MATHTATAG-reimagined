import {
    endAt,
    equalTo,
    get,
    limitToFirst,
    limitToLast,
    off,
    onValue,
    orderByChild,
    orderByKey,
    orderByValue,
    push,
    query,
    ref,
    remove,
    set,
    startAt,
    update,
} from 'firebase/database';
import { database } from './firebase';

// Database utility functions
export const writeData = async (path: string, data: any) => {
  try {
    const dataRef = ref(database, path);
    await set(dataRef, data);
    return { success: true, error: null };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
};

export const readData = async (path: string) => {
  try {
    const dataRef = ref(database, path);
    const snapshot = await get(dataRef);
    return { data: snapshot.val(), error: null };
  } catch (error: any) {
    return { data: null, error: error.message };
  }
};

export const pushData = async (path: string, data: any) => {
  try {
    const dataRef = ref(database, path);
    const newRef = await push(dataRef, data);
    return { key: newRef.key, error: null };
  } catch (error: any) {
    return { key: null, error: error.message };
  }
};

export const updateData = async (path: string, data: any) => {
  try {
    const dataRef = ref(database, path);
    await update(dataRef, data);
    return { success: true, error: null };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
};

export const deleteData = async (path: string) => {
  try {
    const dataRef = ref(database, path);
    await remove(dataRef);
    return { success: true, error: null };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
};

export const listenToData = (path: string, callback: (data: any) => void) => {
  const dataRef = ref(database, path);
  
  const unsubscribe = onValue(dataRef, (snapshot) => {
    callback(snapshot.val());
  });
  
  return unsubscribe;
};

export const stopListening = (path: string) => {
  const dataRef = ref(database, path);
  off(dataRef);
};

// Query helpers
export const queryData = {
  orderByChild: (path: string, child: string) => {
    const dataRef = ref(database, path);
    return query(dataRef, orderByChild(child));
  },
  
  orderByKey: (path: string) => {
    const dataRef = ref(database, path);
    return query(dataRef, orderByKey());
  },
  
  orderByValue: (path: string) => {
    const dataRef = ref(database, path);
    return query(dataRef, orderByValue());
  },
  
  limitToLast: (path: string, limit: number) => {
    const dataRef = ref(database, path);
    return query(dataRef, limitToLast(limit));
  },
  
  limitToFirst: (path: string, limit: number) => {
    const dataRef = ref(database, path);
    return query(dataRef, limitToFirst(limit));
  },
  
  startAt: (path: string, value: any) => {
    const dataRef = ref(database, path);
    return query(dataRef, startAt(value));
  },
  
  endAt: (path: string, value: any) => {
    const dataRef = ref(database, path);
    return query(dataRef, endAt(value));
  },
  
  equalTo: (path: string, value: any) => {
    const dataRef = ref(database, path);
    return query(dataRef, equalTo(value));
  },
};
