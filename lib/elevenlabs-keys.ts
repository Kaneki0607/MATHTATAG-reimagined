// ElevenLabs API Keys Management
// This file manages the API keys for ElevenLabs TTS service
// Keys with credits below 300 will be automatically removed
// All keys are now stored in Firebase at /elevenlabsKeys

import Constants from 'expo-constants';
import { deleteData, pushData, readData, updateData } from './firebase-database';

export interface ApiKeyInfo {
  key: string;
  addedAt: string; // Changed to string for Firebase serialization
  lastUsed?: string; // Changed to string for Firebase serialization
  creditsRemaining?: number;
  status: 'active' | 'low_credits' | 'expired' | 'failed';
  usageCount?: number; // Track number of successful uses
  totalTtsTimeMs?: number; // Track total TTS generation time in milliseconds
}

const FIREBASE_PATH = '/elevenlabskeys';

/** Default voice for app TTS (Create Exercise, AI questions). Maria - fil-PH */
export const ELEVENLABS_TTS_VOICE_ID = '4RLeKvASM0Zt73Htf5GF';
export const ELEVENLABS_TTS_MODEL_ID = 'eleven_turbo_v2_5';
export const ELEVENLABS_TTS_DEBUG = __DEV__;

/** Maria voice defaults from ElevenLabs voice metadata */
export const ELEVENLABS_TTS_VOICE_SETTINGS = {
  stability: 0.5,
  similarity_boost: 0.75,
  style: 0,
  speed: 1.08,
  use_speaker_boost: true,
};

// Used only when validating new keys in Super Admin
const VALIDATION_VOICE_ID = ELEVENLABS_TTS_VOICE_ID;
const VALIDATION_MODEL_ID = ELEVENLABS_TTS_MODEL_ID;

export const maskElevenLabsApiKey = (key: string) => `${key.substring(0, 10)}...`;

export const parseElevenLabsErrorMessage = (errorText: string): string => {
  try {
    const data = JSON.parse(errorText);
    const detail = data?.detail;
    if (typeof detail === 'string') return detail;
    if (detail?.message) return String(detail.message);
    if (detail?.status) return String(detail.status);
  } catch {
    // not JSON
  }
  return errorText.trim().slice(0, 240);
};

export const buildElevenLabsTtsUrl = (
  voiceId: string = ELEVENLABS_TTS_VOICE_ID,
  outputFormat?: string
) =>
  outputFormat
    ? `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=${outputFormat}`
    : `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;

export const buildElevenLabsTtsPayload = (text: string) => ({
  text,
  model_id: ELEVENLABS_TTS_MODEL_ID,
  voice_settings: ELEVENLABS_TTS_VOICE_SETTINGS,
  language_code: 'fil',
});

export const logElevenLabsTtsRequest = (
  context: string,
  details: {
    url: string;
    apiKey: string;
    voiceId: string;
    modelId: string;
    textPreview: string;
    textLength: number;
  }
) => {
  if (!ELEVENLABS_TTS_DEBUG) return;
  console.log('📤 [ElevenLabs TTS REQUEST]', context, {
    method: 'POST',
    url: details.url,
    apiKey: maskElevenLabsApiKey(details.apiKey),
    voiceId: details.voiceId,
    modelId: details.modelId,
    languageCode: 'fil',
    textLength: details.textLength,
    textPreview: details.textPreview.slice(0, 120),
    voiceSettings: ELEVENLABS_TTS_VOICE_SETTINGS,
    headers: {
      Accept: 'audio/mpeg',
      'Content-Type': 'application/json',
      'xi-api-key': '[masked]',
    },
  });
};

export const logElevenLabsTtsResponse = (
  context: string,
  response: Response,
  durationMs: number,
  errorText?: string | null
) => {
  const logPayload: Record<string, unknown> = {
    context,
    status: response.status,
    ok: response.ok,
    durationMs,
    contentType: response.headers?.get?.('content-type') ?? 'unknown',
  };

  if (errorText) {
    logPayload.errorRaw = errorText.slice(0, 800);
    logPayload.errorMessage = parseElevenLabsErrorMessage(errorText);
    try {
      logPayload.errorJson = JSON.parse(errorText);
    } catch {
      // not JSON
    }
  }

  if (response.ok) {
    if (ELEVENLABS_TTS_DEBUG) {
      console.log('📥 [ElevenLabs TTS RESPONSE OK]', logPayload);
    }
  } else {
    console.error('📥 [ElevenLabs TTS RESPONSE ERROR]', logPayload);
  }
};

/** Pull sk_* keys from pasted text (one per line or embedded in a blob). */
export const extractElevenLabsKeysFromText = (text: string): string[] => {
  const fromLines = text
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^["']|["']$/g, ''))
    .filter((line) => line.startsWith('sk_'));
  const fromRegex = text.match(/sk_[a-zA-Z0-9_-]{20,}/g) || [];
  return Array.from(new Set([...fromLines, ...fromRegex].map((k) => k.trim())));
};

const getEnvElevenLabsKey = (): string | null => {
  const key = (Constants.expoConfig?.extra?.elevenLabsApiKey as string | undefined)?.trim();
  return key && key.startsWith('sk_') ? key : null;
};

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
  const firebaseActiveKeys = allKeys
    .filter(keyInfo => keyInfo.status === 'active')
    .map(keyInfo => keyInfo.key);

  const envKey = getEnvElevenLabsKey();
  const activeKeys = envKey
    ? [envKey, ...firebaseActiveKeys.filter(key => key !== envKey)]
    : firebaseActiveKeys;
    
  console.log(`🔑 Active API keys available: ${activeKeys.length}/${allKeys.length}${envKey ? ' (includes .env key)' : ''}`);
  
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
      id: keyInfo.id,
      index: index + 1,
      key: keyInfo.key,
      status: keyInfo.status,
      addedAt: keyInfo.addedAt,
      lastUsed: keyInfo.lastUsed,
      creditsRemaining: keyInfo.creditsRemaining,
      usageCount: keyInfo.usageCount || 0,
      totalTtsTimeMs: keyInfo.totalTtsTimeMs || 0
    }))
  };
};

// Add a new API key (validates Text-to-Speech permission first)
export const validateElevenLabsTtsKey = async (
  key: string
): Promise<{ valid: boolean; error?: string; warning?: string }> => {
  try {
    const url = buildElevenLabsTtsUrl(VALIDATION_VOICE_ID, 'mp3_44100_128');
    const payload = buildElevenLabsTtsPayload('test');
    logElevenLabsTtsRequest('validateElevenLabsTtsKey', {
      url,
      apiKey: key,
      voiceId: VALIDATION_VOICE_ID,
      modelId: VALIDATION_MODEL_ID,
      textPreview: payload.text,
      textLength: payload.text.length,
    });
    const started = Date.now();
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': key,
      },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      logElevenLabsTtsResponse('validateElevenLabsTtsKey', response, Date.now() - started);
      return { valid: true };
    }

    const errorText = await response.text();
    logElevenLabsTtsResponse('validateElevenLabsTtsKey', response, Date.now() - started, errorText);
    const message = parseElevenLabsErrorMessage(errorText);
    console.warn(
      `⚠️ ElevenLabs key validation (${key.substring(0, 10)}...): ${response.status} — ${message}`
    );

    if (
      errorText.includes('missing_permissions') ||
      errorText.includes('text_to_speech')
    ) {
      return {
        valid: false,
        error:
          'This key is missing the Text-to-Speech permission. In ElevenLabs → API Keys → Edit key, enable "Text to Speech" (and "Voices Read" if listed).',
      };
    }

    if (response.status === 401 || errorText.includes('invalid_api_key')) {
      return { valid: false, error: 'Invalid or unauthorized API key. Copy the full key right after creating it.' };
    }

    if (
      errorText.includes('detected_unusual_activity') ||
      errorText.includes('Unusual activity detected') ||
      errorText.includes('Free Tier usage disabled')
    ) {
      return {
        valid: false,
        error:
          'ElevenLabs blocked this account (unusual activity). Try another network, disable VPN, or contact ElevenLabs support.',
      };
    }

    if (
      errorText.includes('quota_exceeded') ||
      errorText.includes('exceeds your quota') ||
      response.status === 429
    ) {
      return {
        valid: false,
        error: 'No ElevenLabs credits left on this account. Add credits or wait for your quota to reset.',
      };
    }

    if (
      response.status === 402 ||
      errorText.includes('payment_required') ||
      errorText.includes('paid_plan_required') ||
      errorText.includes('free_users_not_allowed')
    ) {
      return {
        valid: false,
        error:
          message ||
          'This voice requires a paid ElevenLabs plan for API use (library/professional voices are blocked on free tier).',
      };
    }

    if (
      errorText.includes('voice_not_found') ||
      errorText.includes('creator tier')
    ) {
      return {
        valid: false,
        error: message || 'Voice not available for this API key or plan.',
      };
    }

    return {
      valid: false,
      error: message
        ? `ElevenLabs rejected the test: ${message}`
        : `Key validation failed (${response.status}).`,
    };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Network error during key validation.',
    };
  }
};

export const addApiKey = async (newKey: string): Promise<{ ok: boolean; error?: string }> => {
  if (!newKey.startsWith('sk_')) {
    return { ok: false, error: 'Key must start with "sk_".' };
  }
  
  // Check if key already exists
  const allKeys = await getAllKeysFromFirebase();
  if (allKeys.some(keyInfo => keyInfo.key === newKey)) {
    return { ok: false, error: 'This key is already in the list.' };
  }
  
  const newKeyData: ApiKeyInfo = {
    key: newKey,
    addedAt: new Date().toISOString(),
    status: 'active'
  };
  
  const result = await pushData(FIREBASE_PATH, newKeyData);
  
  if (result.error) {
    console.error('❌ Failed to add API key:', result.error);
    return { ok: false, error: `Could not save to database: ${result.error}` };
  }
  
  console.log(`✅ Added new API key. ID: ${result.key}`);
  return { ok: true };
};

// Mark API key as used and increment usage count
export const markApiKeyAsUsed = async (key: string, ttsTimeMs?: number): Promise<void> => {
  const allKeys = await getAllKeysFromFirebase();
  const keyInfo = allKeys.find((k: any) => k.key === key);
  
  if (keyInfo) {
    const currentUsageCount = keyInfo.usageCount || 0;
  
    
    await updateData(`${FIREBASE_PATH}/${(keyInfo as any).id}`, {
      lastUsed: new Date().toISOString(),
      usageCount: currentUsageCount + 1,
    });
    
    console.log(`📊 API key usage incremented: ${key.substring(0, 10)}... (${currentUsageCount + 1} uses`);
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

// Remove API key with low credits (only remove truly expired keys, keep failed keys for tracking)
export const removeLowCreditKeys = async (): Promise<number> => {
  const allKeys = await getAllKeysFromFirebase();
  const initialCount = allKeys.length;
  const beforeRemoval = allKeys.map((k: any) => ({ key: k.key.substring(0, 10), status: k.status, credits: k.creditsRemaining }));
  
  let removedCount = 0;
  
  // Only delete keys that are truly expired (0 credits) - keep failed and low_credits for tracking
  for (const keyInfo of allKeys) {
    if (keyInfo.status === 'expired' && (keyInfo.creditsRemaining === 0 || keyInfo.creditsRemaining === undefined)) {
      await deleteData(`${FIREBASE_PATH}/${(keyInfo as any).id}`);
      removedCount++;
      console.log(`🗑️ Removed expired key: ${keyInfo.key.substring(0, 10)}... (0 credits)`);
    }
  }
  
  if (removedCount > 0) {
    const afterKeys = await getAllKeysFromFirebase();
    console.log(`🗑️ Removed ${removedCount} truly expired API keys. Remaining: ${afterKeys.length}`);
    console.log('Before removal:', beforeRemoval);
    console.log('After removal:', afterKeys.map((k: any) => ({ key: k.key.substring(0, 10), status: k.status, credits: k.creditsRemaining })));
  } else {
    console.log(`📊 No expired keys to remove. Keeping failed/low_credits keys for tracking.`);
  }
  
  return removedCount;
};

// Mark API key as failed
export const markApiKeyAsFailed = async (key: string): Promise<void> => {
  console.log(`🔍 Attempting to mark API key as failed: ${key.substring(0, 10)}...`);
  const allKeys = await getAllKeysFromFirebase();
  console.log(`🔍 Found ${allKeys.length} total keys in database`);
  
  const keyInfo = allKeys.find((k: any) => k.key === key);
  
  if (keyInfo) {
    console.log(`🔍 Found key info:`, {
      id: (keyInfo as any).id,
      key: keyInfo.key.substring(0, 10) + '...',
      currentStatus: keyInfo.status
    });
    
    const updatePath = `${FIREBASE_PATH}/${(keyInfo as any).id}`;
    console.log(`🔍 Updating path: ${updatePath}`);
    
    const result = await updateData(updatePath, {
      status: 'failed'
    });
    
    if (result.error) {
      console.error(`❌ Failed to update API key status:`, result.error);
    } else {
      console.log(`✅ Successfully marked API key as failed: ${key.substring(0, 10)}...`);
    }
  } else {
    console.warn(`⚠️ API key not found in database: ${key.substring(0, 10)}...`);
    console.log(`🔍 Available keys:`, allKeys.map((k: any) => ({
      id: k.id,
      key: k.key.substring(0, 10) + '...',
      status: k.status
    })));
  }
};

// Immediately remove API key that triggered unusual activity
export const removeUnusualActivityKey = async (key: string): Promise<void> => {
  console.log(`🗑️ Immediately removing API key due to unusual activity: ${key.substring(0, 10)}...`);
  const allKeys = await getAllKeysFromFirebase();
  const keyInfo = allKeys.find((k: any) => k.key === key);
  
  if (keyInfo) {
    const deletePath = `${FIREBASE_PATH}/${(keyInfo as any).id}`;
    console.log(`🗑️ Deleting key at path: ${deletePath}`);
    
    const result = await deleteData(deletePath);
    
    if (result.error) {
      console.error(`❌ Failed to delete API key:`, result.error);
    } else {
      console.log(`✅ Successfully removed API key due to unusual activity: ${key.substring(0, 10)}...`);
    }
  } else {
    console.warn(`⚠️ API key not found for deletion: ${key.substring(0, 10)}...`);
  }
};

// Delete a specific API key
export const deleteApiKey = async (key: string): Promise<boolean> => {
  const allKeys = await getAllKeysFromFirebase();
  const keyInfo = allKeys.find((k: any) => k.key === key);
  
  if (keyInfo) {
    const result = await deleteData(`${FIREBASE_PATH}/${(keyInfo as any).id}`);
    if (result.error) {
      console.error('❌ Failed to delete API key:', result.error);
      return false;
    }
    console.log(`🗑️ Deleted API key: ${key.substring(0, 10)}...`);
    return true;
  } else {
    console.warn(`⚠️ API key not found for deletion: ${key.substring(0, 10)}...`);
    return false;
  }
};

// Delete all API keys
export const deleteAllApiKeys = async (): Promise<number> => {
  const allKeys = await getAllKeysFromFirebase();
  let deletedCount = 0;
  
  for (const keyInfo of allKeys) {
    const result = await deleteData(`${FIREBASE_PATH}/${(keyInfo as any).id}`);
    if (!result.error) {
      deletedCount++;
    }
  }
  
  console.log(`🗑️ Deleted ${deletedCount} API keys`);
  return deletedCount;
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
          
          // Check for unusual activity error
          if (errorText.includes('missing_permissions')) {
            console.log(`🔑 Missing TTS permission for key ${keyInfo.key.substring(0, 10)}... - marking as failed`);
            await markApiKeyAsFailed(keyInfo.key);
          } else if (errorText.includes('detected_unusual_activity') ||
              errorText.includes('Unusual activity detected') ||
              errorText.includes('Free Tier usage disabled')) {
            console.log(`🚫 Unusual activity detected for key ${keyInfo.key.substring(0, 10)}... - marking as failed`);
            await markApiKeyAsFailed(keyInfo.key);
          } else if (response.status === 401) {
            console.log(`🔑 Unauthorized access for key ${keyInfo.key.substring(0, 10)}... - marking as failed`);
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

// Test function to manually mark a key as failed (for debugging)
export const testMarkKeyAsFailed = async (key: string): Promise<void> => {
  console.log(`🧪 TEST: Attempting to mark key as failed: ${key.substring(0, 10)}...`);
  await markApiKeyAsFailed(key);
  
  // Wait a moment and then check the status
  setTimeout(async () => {
    const status = await getApiKeyStatus();
    console.log(`🧪 TEST: Current key statuses:`, status.keys.map(k => ({
      key: k.key,
      status: k.status
    })));
  }, 2000);
};