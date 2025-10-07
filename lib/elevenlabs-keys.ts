// ElevenLabs API Keys Management
// This file manages the API keys for ElevenLabs TTS service
// Keys with credits below 300 will be automatically removed
// All keys are now stored in Firebase at /elevenlabsKeys

import { deleteData, pushData, readData, updateData } from './firebase-database';

export interface ApiKeyInfo {
  key: string;
  addedAt: string; // Changed to string for Firebase serialization
  lastUsed?: string; // Changed to string for Firebase serialization
  creditsRemaining?: number;
  status: 'active' | 'low_credits' | 'expired' | 'failed';
}

const FIREBASE_PATH = '/elevenlabsKeys';

// Helper: Get all keys from Firebase
const getAllKeysFromFirebase = async (): Promise<ApiKeyInfo[]> => {
  const result = await readData(FIREBASE_PATH);
  if (!result.data) return [];
  
  const keysData = result.data;
  return Object.keys(keysData).map(id => ({
    id,
    ...keysData[id]
  })) as any[];
};

// Get all active API keys
export const getActiveApiKeys = async (): Promise<string[]> => {
  const allKeys = await getAllKeysFromFirebase();
  const activeKeys = allKeys
    .filter(keyInfo => keyInfo.status === 'active')
    .map(keyInfo => keyInfo.key);
    
  console.log(`🔑 Active API keys available: ${activeKeys.length}/${allKeys.length}`);
  
  // Log status of all keys for debugging
  if (activeKeys.length === 0) {
    console.log('📊 All API key statuses:');
    allKeys.forEach((keyInfo: any, index) => {
      console.log(`  ${index + 1}. ${keyInfo.key.substring(0, 10)}... - Status: ${keyInfo.status}, Credits: ${keyInfo.creditsRemaining || 'unknown'}`);
    });
  }
  
  return activeKeys;
};

// Get API key status
export const getApiKeyStatus = async () => {
  const allKeys = await getAllKeysFromFirebase();
  return {
    totalKeys: allKeys.length,
    activeKeys: allKeys.filter(k => k.status === 'active').length,
    lowCreditKeys: allKeys.filter(k => k.status === 'low_credits').length,
    expiredKeys: allKeys.filter(k => k.status === 'expired').length,
    failedKeys: allKeys.filter(k => k.status === 'failed').length,
    keys: allKeys.map((keyInfo: any, index) => ({
      index: index + 1,
      key: keyInfo.key.substring(0, 10) + '...',
      status: keyInfo.status,
      addedAt: keyInfo.addedAt,
      lastUsed: keyInfo.lastUsed,
      creditsRemaining: keyInfo.creditsRemaining
    }))
  };
};

// Add a new API key
export const addApiKey = async (newKey: string): Promise<boolean> => {
  if (!newKey.startsWith('sk_')) {
    console.warn('⚠️ API key should start with "sk_" for ElevenLabs');
    return false;
  }
  
  // Check if key already exists
  const allKeys = await getAllKeysFromFirebase();
  if (allKeys.some(keyInfo => keyInfo.key === newKey)) {
    console.warn('⚠️ API key already exists in the list');
    return false;
  }
  
  const newKeyData: ApiKeyInfo = {
    key: newKey,
    addedAt: new Date().toISOString(),
    status: 'active'
  };
  
  const result = await pushData(FIREBASE_PATH, newKeyData);
  
  if (result.error) {
    console.error('❌ Failed to add API key:', result.error);
    return false;
  }
  
  console.log(`✅ Added new API key. ID: ${result.key}`);
  return true;
};

// Mark API key as used
export const markApiKeyAsUsed = async (key: string): Promise<void> => {
  const allKeys = await getAllKeysFromFirebase();
  const keyInfo = allKeys.find((k: any) => k.key === key);
  
  if (keyInfo) {
    await updateData(`${FIREBASE_PATH}/${(keyInfo as any).id}`, {
      lastUsed: new Date().toISOString()
    });
  }
};

// Update API key credits and status
export const updateApiKeyCredits = async (key: string, creditsRemaining: number): Promise<void> => {
  const allKeys = await getAllKeysFromFirebase();
  const keyInfo = allKeys.find((k: any) => k.key === key);
  
  if (keyInfo) {
    const previousCredits = keyInfo.creditsRemaining;
    const previousStatus = keyInfo.status;
    
    let newStatus: 'active' | 'low_credits' | 'expired' | 'failed' = 'active';
    
    if (creditsRemaining <= 0) {
      newStatus = 'expired';
      console.log(`💀 API key expired (${creditsRemaining} credits): ${key.substring(0, 10)}...`);
    } else if (creditsRemaining < 300) {
      newStatus = 'low_credits';
      console.log(`🗑️ API key marked as low credits (${creditsRemaining} < 300): ${key.substring(0, 10)}...`);
    } else {
      newStatus = 'active';
      if (previousStatus !== 'active') {
        console.log(`✅ API key restored to active (${creditsRemaining} credits): ${key.substring(0, 10)}...`);
      }
    }
    
    await updateData(`${FIREBASE_PATH}/${(keyInfo as any).id}`, {
      creditsRemaining,
      lastUsed: new Date().toISOString(),
      status: newStatus
    });
    
    // Log credit changes
    if (previousCredits !== undefined && previousCredits !== creditsRemaining) {
      const creditDiff = creditsRemaining - previousCredits;
      console.log(`💰 Credit update for ${key.substring(0, 10)}...: ${previousCredits} → ${creditsRemaining} (${creditDiff >= 0 ? '+' : ''}${creditDiff})`);
    }
  } else {
    console.warn(`⚠️ Attempted to update credits for unknown API key: ${key.substring(0, 10)}...`);
  }
};

// Remove API key with low credits
export const removeLowCreditKeys = async (): Promise<number> => {
  const allKeys = await getAllKeysFromFirebase();
  const initialCount = allKeys.length;
  const beforeRemoval = allKeys.map((k: any) => ({ key: k.key.substring(0, 10), status: k.status, credits: k.creditsRemaining }));
  
  let removedCount = 0;
  
  // Delete keys with low credits, expired, or failed status
  for (const keyInfo of allKeys) {
    if (keyInfo.status === 'low_credits' || keyInfo.status === 'failed' || keyInfo.status === 'expired') {
      await deleteData(`${FIREBASE_PATH}/${(keyInfo as any).id}`);
      removedCount++;
    }
  }
  
  if (removedCount > 0) {
    const afterKeys = await getAllKeysFromFirebase();
    console.log(`🗑️ Removed ${removedCount} API keys with low credits/failed status. Remaining: ${afterKeys.length}`);
    console.log('Before removal:', beforeRemoval);
    console.log('After removal:', afterKeys.map((k: any) => ({ key: k.key.substring(0, 10), status: k.status, credits: k.creditsRemaining })));
  }
  
  return removedCount;
};

// Mark API key as failed
export const markApiKeyAsFailed = async (key: string): Promise<void> => {
  const allKeys = await getAllKeysFromFirebase();
  const keyInfo = allKeys.find((k: any) => k.key === key);
  
  if (keyInfo) {
    await updateData(`${FIREBASE_PATH}/${(keyInfo as any).id}`, {
      status: 'failed'
    });
    console.log(`❌ Marked API key as failed: ${key.substring(0, 10)}...`);
  }
};

// Get next available API key
export const getNextApiKey = async (): Promise<string | null> => {
  const allKeys = await getAllKeysFromFirebase();
  const activeKeys = allKeys.filter(keyInfo => keyInfo.status === 'active');
  
  if (activeKeys.length === 0) {
    console.error('❌ No active API keys available!');
    return null;
  }
  
  // Return the first active key
  return activeKeys[0].key;
};

// Get random API key for better distribution
export const getRandomApiKey = async (): Promise<string | null> => {
  const allKeys = await getAllKeysFromFirebase();
  const activeKeys = allKeys.filter(keyInfo => keyInfo.status === 'active');
  
  if (activeKeys.length === 0) {
    console.error('❌ No active API keys available!');
    return null;
  }
  
  // Return a random active key
  const randomIndex = Math.floor(Math.random() * activeKeys.length);
  return activeKeys[randomIndex].key;
};

// Clean up expired keys (older than 30 days)
export const cleanupExpiredKeys = async (): Promise<number> => {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  const allKeys = await getAllKeysFromFirebase();
  let removedCount = 0;
  
  for (const keyInfo of allKeys) {
    const addedDate = new Date(keyInfo.addedAt);
    if (addedDate < thirtyDaysAgo && keyInfo.status !== 'active') {
      await deleteData(`${FIREBASE_PATH}/${(keyInfo as any).id}`);
      removedCount++;
    }
  }
  
  if (removedCount > 0) {
    console.log(`🧹 Cleaned up ${removedCount} expired API keys`);
  }
  
  return removedCount;
};

// Debug function to check a specific key's status
export const debugKeyStatus = async (key: string) => {
  const allKeys = await getAllKeysFromFirebase();
  const keyInfo = allKeys.find((k: any) => k.key === key);
  
  if (keyInfo) {
    console.log(`🔍 Key Status Debug:`, {
      key: key.substring(0, 10) + '...',
      status: keyInfo.status,
      creditsRemaining: keyInfo.creditsRemaining,
      addedAt: keyInfo.addedAt,
      lastUsed: keyInfo.lastUsed
    });
    return keyInfo;
  } else {
    console.log(`❌ Key not found: ${key.substring(0, 10)}...`);
    return null;
  }
};

// Proactively check credits for all API keys
export const checkAllApiKeyCredits = async (): Promise<void> => {
  console.log('🔄 Checking credits for all API keys...');
  
  const allKeys = await getAllKeysFromFirebase();
  
  for (const keyInfo of allKeys) {
    if (keyInfo.status === 'active') {
      try {
        // Make a minimal API call to check credits
        const response = await fetch('https://api.elevenlabs.io/v1/user', {
          method: 'GET',
          headers: {
            'xi-api-key': keyInfo.key
          }
        });
        
        if (response.ok) {
          const userData = await response.json();
          const creditsRemaining = userData.subscription?.character_count || 0;
          
          console.log(`💰 Key ${keyInfo.key.substring(0, 10)}... has ${creditsRemaining} credits`);
          await updateApiKeyCredits(keyInfo.key, creditsRemaining);
        } else {
          let errorText = '';
          try {
            errorText = await response.text();
          } catch {}
          const messageSnippet = errorText ? ` - ${errorText.substring(0, 200)}` : '';
          console.warn(`⚠️ Failed to check credits for key ${keyInfo.key.substring(0, 10)}...: ${response.status}${messageSnippet}`);
          if (response.status === 401) {
            await markApiKeyAsFailed(keyInfo.key);
          }
        }
      } catch (error) {
        const msg = (error as any)?.message || String(error);
        console.warn(`⚠️ Error checking credits for key ${keyInfo.key.substring(0, 10)}...: ${msg}`);
      }
    }
  }
  
  // Remove any keys that are now low on credits or failed
  await removeLowCreditKeys();
  
  console.log('✅ Credit check completed');
};

// Auto-cleanup function to be called periodically
export const performMaintenanceCleanup = async (): Promise<void> => {
  console.log('🧹 Performing API key maintenance cleanup...');
  
  // Remove expired and failed keys
  const removedCount = await removeLowCreditKeys();
  
  // Clean up old expired keys
  const expiredCount = await cleanupExpiredKeys();
  
  console.log(`🧹 Maintenance completed: removed ${removedCount} low/failed keys, ${expiredCount} expired keys`);
};
