// ElevenLabs API Keys Management
// This file manages the API keys for ElevenLabs TTS service
// Keys with credits below 300 will be automatically removed

export interface ApiKeyInfo {
  key: string;
  addedAt: Date;
  lastUsed?: Date;
  creditsRemaining?: number;
  status: 'active' | 'low_credits' | 'expired' | 'failed';
}

// In-memory storage for API keys
let apiKeys: ApiKeyInfo[] = [
  {
    key: "sk_44e82946106ad5642716a1374775a1995e831ea8ee85b471",
    addedAt: new Date(),
    status: 'active'
  },
  {
    key: "sk_060a58d2fd7ce30e6ca6f29f1c22a2b133c8a88f43820087",
    addedAt: new Date(),
    status: 'active'
  },
  {
    key: "sk_557d6899fb94e22d3f552194850e88b1f1fa78775c68bea8",
    addedAt: new Date(),
    status: 'active'
  },
  {
    key: "sk_9a6af245215a92c537d242eac1c13b9b353e9cb958dac47d",
    addedAt: new Date(),
    status: 'active'
  },
  {
    key: "sk_f9a333489269122ddbd0b4a0792b1a51197318542d6fdf79",
    addedAt: new Date(),
    status: 'active'
  },
  {
    key: "sk_22b1f3ceee2145cb2727477501955f17c6d7e4d52b448427",
    addedAt: new Date(),
    status: 'active'
  },
  {
    key: "sk_52308985e50b193901cf483f9890f61beb744a59d637d195",
    addedAt: new Date(),
    status: 'active'
  },
  {
    key: "sk_f7a0658002d03b76e85746f32928312f472cd0f281d2b539",
    addedAt: new Date(),
    status: 'active'
  },
  {
    key: "sk_22fe6fe0bfc1a0f151289a0b4ddcb4ba674bbdd35ce658cb",
    addedAt: new Date(),
    status: 'active'
  },
  {
    key: "sk_0280116d56e26349faab53dc47a20897062836d234d5b097",
    addedAt: new Date(),
    status: 'active'
  },
  {
    key: "sk_4b624075f8d656663db093c26233d48214d24b0529e326b2",
    addedAt: new Date(),
    status: 'active'
  },
  {
    key: "sk_96646b09cee1732d970925dce28aff359d12058ed6ab74bd",
    addedAt: new Date(),
    status: 'active'
  },
  {
    key: "sk_cf4978013b49de6081cbefbe5fffc8b5f65e760dec3428ce",
    addedAt: new Date(),
    status: 'active'
  },
  {
    key: "sk_e58b058baf46063de7cd1295ca418f365f8a20ff4c1864cd",
    addedAt: new Date(),
    status: 'active'
  }
];

// Get all active API keys
export const getActiveApiKeys = (): string[] => {
  const activeKeys = apiKeys
    .filter(keyInfo => keyInfo.status === 'active')
    .map(keyInfo => keyInfo.key);
    
  console.log(`🔑 Active API keys available: ${activeKeys.length}/${apiKeys.length}`);
  
  // Log status of all keys for debugging
  if (activeKeys.length === 0) {
    console.log('📊 All API key statuses:');
    apiKeys.forEach((keyInfo, index) => {
      console.log(`  ${index + 1}. ${keyInfo.key.substring(0, 10)}... - Status: ${keyInfo.status}, Credits: ${keyInfo.creditsRemaining || 'unknown'}`);
    });
  }
  
  return activeKeys;
};

// Get API key status
export const getApiKeyStatus = () => {
  return {
    totalKeys: apiKeys.length,
    activeKeys: apiKeys.filter(k => k.status === 'active').length,
    lowCreditKeys: apiKeys.filter(k => k.status === 'low_credits').length,
    expiredKeys: apiKeys.filter(k => k.status === 'expired').length,
    failedKeys: apiKeys.filter(k => k.status === 'failed').length,
    keys: apiKeys.map((keyInfo, index) => ({
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
export const addApiKey = (newKey: string): boolean => {
  if (!newKey.startsWith('sk_')) {
    console.warn('⚠️ API key should start with "sk_" for ElevenLabs');
    return false;
  }
  
  // Check if key already exists
  if (apiKeys.some(keyInfo => keyInfo.key === newKey)) {
    console.warn('⚠️ API key already exists in the list');
    return false;
  }
  
  apiKeys.push({
    key: newKey,
    addedAt: new Date(),
    status: 'active'
  });
  
  console.log(`✅ Added new API key. Total keys: ${apiKeys.length}`);
  return true;
};

// Mark API key as used
export const markApiKeyAsUsed = (key: string): void => {
  const keyInfo = apiKeys.find(k => k.key === key);
  if (keyInfo) {
    keyInfo.lastUsed = new Date();
  }
};

// Update API key credits and status
export const updateApiKeyCredits = (key: string, creditsRemaining: number): void => {
  const keyInfo = apiKeys.find(k => k.key === key);
  if (keyInfo) {
    const previousCredits = keyInfo.creditsRemaining;
    const previousStatus = keyInfo.status;
    
    keyInfo.creditsRemaining = creditsRemaining;
    keyInfo.lastUsed = new Date();
    
    if (creditsRemaining <= 0) {
      keyInfo.status = 'expired';
      console.log(`💀 API key expired (${creditsRemaining} credits): ${key.substring(0, 10)}...`);
    } else if (creditsRemaining < 300) {
      keyInfo.status = 'low_credits';
      console.log(`🗑️ API key marked as low credits (${creditsRemaining} < 300): ${key.substring(0, 10)}...`);
    } else {
      keyInfo.status = 'active';
      if (previousStatus !== 'active') {
        console.log(`✅ API key restored to active (${creditsRemaining} credits): ${key.substring(0, 10)}...`);
      }
    }
    
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
export const removeLowCreditKeys = (): number => {
  const initialCount = apiKeys.length;
  const beforeRemoval = apiKeys.map(k => ({ key: k.key.substring(0, 10), status: k.status, credits: k.creditsRemaining }));
  
  // Filter out keys with low credits, expired, or failed status
  const filteredKeys = apiKeys.filter(keyInfo => 
    keyInfo.status !== 'low_credits' && 
    keyInfo.status !== 'failed' && 
    keyInfo.status !== 'expired'
  );
  
  // Update the global array
  apiKeys.length = 0; // Clear the array
  apiKeys.push(...filteredKeys); // Add back only the active keys
  
  const removedCount = initialCount - apiKeys.length;
  
  if (removedCount > 0) {
    console.log(`🗑️ Removed ${removedCount} API keys with low credits/failed status. Remaining: ${apiKeys.length}`);
    console.log('Before removal:', beforeRemoval);
    console.log('After removal:', apiKeys.map(k => ({ key: k.key.substring(0, 10), status: k.status, credits: k.creditsRemaining })));
  }
  
  return removedCount;
};

// Mark API key as failed
export const markApiKeyAsFailed = (key: string): void => {
  const keyInfo = apiKeys.find(k => k.key === key);
  if (keyInfo) {
    keyInfo.status = 'failed';
    console.log(`❌ Marked API key as failed: ${key.substring(0, 10)}...`);
  }
};

// Get next available API key
export const getNextApiKey = (): string | null => {
  const activeKeys = apiKeys.filter(keyInfo => keyInfo.status === 'active');
  if (activeKeys.length === 0) {
    console.error('❌ No active API keys available!');
    return null;
  }
  
  // Return the first active key
  return activeKeys[0].key;
};

// Get random API key for better distribution
export const getRandomApiKey = (): string | null => {
  const activeKeys = apiKeys.filter(keyInfo => keyInfo.status === 'active');
  if (activeKeys.length === 0) {
    console.error('❌ No active API keys available!');
    return null;
  }
  
  // Return a random active key
  const randomIndex = Math.floor(Math.random() * activeKeys.length);
  return activeKeys[randomIndex].key;
};

// Clean up expired keys (older than 30 days)
export const cleanupExpiredKeys = (): number => {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  const initialCount = apiKeys.length;
  apiKeys = apiKeys.filter(keyInfo => {
    if (keyInfo.addedAt < thirtyDaysAgo && keyInfo.status !== 'active') {
      return false;
    }
    return true;
  });
  
  const removedCount = initialCount - apiKeys.length;
  if (removedCount > 0) {
    console.log(`🧹 Cleaned up ${removedCount} expired API keys`);
  }
  
  return removedCount;
};

// Debug function to check a specific key's status
export const debugKeyStatus = (key: string) => {
  const keyInfo = apiKeys.find(k => k.key === key);
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
  
  for (const keyInfo of apiKeys) {
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
          updateApiKeyCredits(keyInfo.key, creditsRemaining);
        } else {
          let errorText = '';
          try {
            errorText = await response.text();
          } catch {}
          const messageSnippet = errorText ? ` - ${errorText.substring(0, 200)}` : '';
          console.warn(`⚠️ Failed to check credits for key ${keyInfo.key.substring(0, 10)}...: ${response.status}${messageSnippet}`);
          if (response.status === 401) {
            markApiKeyAsFailed(keyInfo.key);
          }
        }
      } catch (error) {
        const msg = (error as any)?.message || String(error);
        console.warn(`⚠️ Error checking credits for key ${keyInfo.key.substring(0, 10)}...: ${msg}`);
      }
    }
  }
  
  // Remove any keys that are now low on credits or failed
  removeLowCreditKeys();
  
  console.log('✅ Credit check completed');
};

// Auto-cleanup function to be called periodically
export const performMaintenanceCleanup = (): void => {
  console.log('🧹 Performing API key maintenance cleanup...');
  
  // Remove expired and failed keys
  const removedCount = removeLowCreditKeys();
  
  // Clean up old expired keys
  const expiredCount = cleanupExpiredKeys();
  
  console.log(`🧹 Maintenance completed: removed ${removedCount} low/failed keys, ${expiredCount} expired keys`);
};

/**
 * Delete a specific API key
 * @param keyToDelete - The API key to delete
 * @returns true if deleted, false if not found
 */
export const deleteApiKey = (keyToDelete: string): boolean => {
  const initialLength = apiKeys.length;
  apiKeys = apiKeys.filter(k => k.key !== keyToDelete);
  const deleted = apiKeys.length < initialLength;
  
  if (deleted) {
    console.log(`🗑️ Deleted API key: ${keyToDelete.substring(0, 10)}...`);
  }
  
  return deleted;
};

/**
 * Delete all API keys
 * @returns number of keys deleted
 */
export const deleteAllApiKeys = (): number => {
  const count = apiKeys.length;
  apiKeys = [];
  console.log(`🗑️ Deleted all ${count} API keys`);
  return count;
};