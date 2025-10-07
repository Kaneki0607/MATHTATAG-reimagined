# ElevenLabs API Keys Management - Firebase Edition

## Overview

The ElevenLabs API keys are now stored in **Firebase Realtime Database** instead of in-memory storage. This provides:

- ✅ **Persistent storage** - Keys survive app restarts
- ✅ **Centralized management** - Manage keys from anywhere
- ✅ **Real-time updates** - Changes sync across all instances
- ✅ **Better scalability** - No need to redeploy for key updates

## Firebase Structure

All API keys are stored at the following path in Firebase Realtime Database:

```
/elevenlabsKeys
  ├── {auto-generated-id-1}
  │   ├── key: "sk_..."
  │   ├── addedAt: "2025-10-07T12:34:56.789Z"
  │   ├── lastUsed: "2025-10-07T13:45:00.000Z"
  │   ├── creditsRemaining: 5000
  │   └── status: "active"
  ├── {auto-generated-id-2}
  │   ├── key: "sk_..."
  │   └── ...
  └── ...
```

## Migration from In-Memory to Firebase

### One-Time Migration

Run the migration script to populate Firebase with the initial API keys:

```bash
node scripts/migrate-api-keys-to-firebase.js
```

This script will:
1. Read the hardcoded keys from the migration file
2. Add each key to Firebase at `/elevenlabsKeys`
3. Skip keys that already exist
4. Display a summary of successful/failed migrations

### Manual Migration (Alternative)

You can also manually add keys to Firebase:

1. Open Firebase Console
2. Go to Realtime Database
3. Navigate to `/elevenlabsKeys`
4. Click "+" to add a new child
5. Add the key data:
   ```json
   {
     "key": "sk_your_api_key_here",
     "addedAt": "2025-10-07T12:00:00.000Z",
     "status": "active"
   }
   ```

## Usage

All functions are now **async** and return **Promises**. Update your code accordingly:

### Before (In-Memory)
```typescript
const keys = getActiveApiKeys(); // Synchronous
const key = getRandomApiKey(); // Synchronous
addApiKey('sk_new_key'); // Synchronous
```

### After (Firebase)
```typescript
const keys = await getActiveApiKeys(); // Async
const key = await getRandomApiKey(); // Async
await addApiKey('sk_new_key'); // Async
```

## Available Functions

### 1. Get Active API Keys
```typescript
const activeKeys = await getActiveApiKeys();
// Returns: string[] - Array of active API key strings
```

### 2. Get API Key Status
```typescript
const status = await getApiKeyStatus();
// Returns: { totalKeys, activeKeys, lowCreditKeys, expiredKeys, failedKeys, keys[] }
```

### 3. Add New API Key
```typescript
const success = await addApiKey('sk_new_api_key_here');
// Returns: boolean - true if added, false if already exists or invalid
```

### 4. Mark API Key as Used
```typescript
await markApiKeyAsUsed('sk_api_key_here');
// Updates lastUsed timestamp in Firebase
```

### 5. Update API Key Credits
```typescript
await updateApiKeyCredits('sk_api_key_here', 5000);
// Updates credits and auto-adjusts status (active/low_credits/expired)
```

### 6. Get Next Available Key
```typescript
const nextKey = await getNextApiKey();
// Returns: string | null - First active key or null if none available
```

### 7. Get Random Key (Recommended)
```typescript
const randomKey = await getRandomApiKey();
// Returns: string | null - Random active key for better distribution
```

### 8. Remove Low Credit Keys
```typescript
const removedCount = await removeLowCreditKeys();
// Deletes keys with low_credits, expired, or failed status
```

### 9. Mark Key as Failed
```typescript
await markApiKeyAsFailed('sk_api_key_here');
// Sets status to 'failed' (e.g., when API returns 401)
```

### 10. Debug Key Status
```typescript
const keyInfo = await debugKeyStatus('sk_api_key_here');
// Logs and returns detailed info about a specific key
```

### 11. Check All Key Credits
```typescript
await checkAllApiKeyCredits();
// Fetches current credits from ElevenLabs API for all active keys
// Auto-updates status and removes low-credit keys
```

### 12. Perform Maintenance Cleanup
```typescript
await performMaintenanceCleanup();
// Removes low/failed/expired keys
// Call this periodically (e.g., daily)
```

## API Key Status Types

| Status | Description | Behavior |
|--------|-------------|----------|
| `active` | Key has ≥300 credits | Will be used for TTS |
| `low_credits` | Key has <300 credits | Excluded from usage, marked for removal |
| `expired` | Key has ≤0 credits | Excluded from usage, marked for removal |
| `failed` | API returned error (e.g., 401) | Excluded from usage, marked for removal |

## Best Practices

### 1. Use Random Key Distribution
```typescript
// ✅ Good - Distributes load across keys
const key = await getRandomApiKey();

// ❌ Avoid - Always uses first key
const key = await getNextApiKey();
```

### 2. Check Credits Periodically
```typescript
// Run this daily or weekly
setInterval(async () => {
  await checkAllApiKeyCredits();
  await performMaintenanceCleanup();
}, 24 * 60 * 60 * 1000); // 24 hours
```

### 3. Handle Null Keys
```typescript
const key = await getRandomApiKey();
if (!key) {
  console.error('No API keys available!');
  // Handle error appropriately
  return;
}
// Use key for TTS
```

### 4. Update Credits After Usage
```typescript
const key = await getRandomApiKey();
if (key) {
  await markApiKeyAsUsed(key);
  
  // After making API call, update credits
  const userData = await fetchUserData(key);
  await updateApiKeyCredits(key, userData.creditsRemaining);
}
```

## Monitoring

### View Keys in SuperAdmin Dashboard

The Super Admin Dashboard (`app/SuperAdminDashboard.tsx`) displays all ElevenLabs keys with their:
- Partial key (first 10 characters)
- Status (active, low_credits, etc.)
- Credits remaining

### Add Keys via Firebase Console

1. Go to Firebase Console → Realtime Database
2. Navigate to `/elevenlabsKeys`
3. Click "+" to add new key
4. Enter key data (key, addedAt, status)

## Security Notes

⚠️ **Important Security Considerations:**

1. **Secure Firebase Rules**: Ensure `/elevenlabsKeys` has proper read/write rules
2. **Environment Variables**: For production, consider storing keys encrypted
3. **Access Control**: Only super admins should have write access to keys
4. **Key Rotation**: Regularly rotate API keys and remove old ones

## Troubleshooting

### No Keys Available
```
❌ No active API keys available!
```
**Solution:** 
- Run migration script: `node scripts/migrate-api-keys-to-firebase.js`
- Or manually add keys via Firebase Console

### Firebase Permission Denied
```
❌ Failed to add API key: Permission denied
```
**Solution:**
- Check Firebase Realtime Database rules
- Ensure authenticated user has write permission to `/elevenlabsKeys`

### Keys Not Syncing
**Solution:**
- Check Firebase connection
- Verify network connectivity
- Check browser console for Firebase errors

## Migration Checklist

- [ ] Run migration script: `node scripts/migrate-api-keys-to-firebase.js`
- [ ] Verify keys in Firebase Console
- [ ] Update all code using key functions to use `await`
- [ ] Test key retrieval: `await getRandomApiKey()`
- [ ] Test key addition: `await addApiKey('sk_test')`
- [ ] Set up periodic credit checks
- [ ] Configure Firebase security rules
- [ ] Remove old hardcoded keys from codebase ✅ (Already done!)

## Questions?

If you encounter issues or have questions about the Firebase-based key management system, please refer to:
- Firebase Realtime Database documentation
- `lib/elevenlabs-keys.ts` source code
- `scripts/migrate-api-keys-to-firebase.js` migration script
