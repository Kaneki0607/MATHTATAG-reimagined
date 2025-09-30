# ElevenLabs API Key Management

This system manages multiple ElevenLabs API keys with automatic fallback and credit monitoring.

## Features

- **Automatic Fallback**: Tries multiple API keys in sequence until one succeeds
- **Credit Monitoring**: Tracks remaining credits for each API key
- **Auto-Removal**: Automatically removes keys with credits below 300
- **Status Tracking**: Monitors key status (active, low_credits, expired, failed)
- **Periodic Cleanup**: Automatically cleans up expired and low-credit keys
- **Dynamic Management**: Add/remove keys at runtime

## Usage

### Adding New API Keys

```typescript
import { addApiKey } from '../lib/elevenlabs-keys';

// Add a new API key
addApiKey("sk_your_new_api_key_here");
```

### Checking Key Status

```typescript
import { getApiKeyStatus } from '../lib/elevenlabs-keys';

// Get current status
const status = getApiKeyStatus();
console.log(`Active keys: ${status.activeKeys}/${status.totalKeys}`);
```

### Manual Cleanup

```typescript
import { removeLowCreditKeys, cleanupExpiredKeys } from '../lib/elevenlabs-keys';

// Remove keys with low credits
const removedCount = removeLowCreditKeys();

// Clean up expired keys
const expiredCount = cleanupExpiredKeys();
```

## Key Status Types

- **active**: Key is working and has sufficient credits
- **low_credits**: Key has credits below 300 (will be removed)
- **expired**: Key is older than 30 days and not active
- **failed**: Key failed due to non-credit issues

## Automatic Features

1. **Credit Monitoring**: When a key fails with quota exceeded error, the system checks remaining credits
2. **Auto-Removal**: Keys with credits < 300 are automatically marked as low_credits
3. **Periodic Cleanup**: Every 5 minutes, the system removes low-credit and expired keys
4. **Usage Tracking**: Tracks when each key was last used

## Console Output

The system provides detailed logging:

```
🔄 Trying ElevenLabs API key 1/50 (sk_57b2f7a...)
💰 API Key Credits - Remaining: 243, Required: 399
🗑️ API key marked as low credits (243 < 300)
🔄 Trying ElevenLabs API key 2/50 (sk_44bc79...)
✅ ElevenLabs API key 2 succeeded
🧹 API Key Maintenance: Removed 1 low credit keys, 0 expired keys
```

## File Structure

- `lib/elevenlabs-keys.ts` - Main key management system
- `app/CreateExercise.tsx` - Integration with TTS generation

## Benefits

- **High Availability**: Reduces TTS generation failures
- **Cost Efficiency**: Automatically removes unusable keys
- **Easy Management**: Simple functions to add/check keys
- **Transparent Operation**: Detailed logging for debugging
- **Self-Maintaining**: Automatically cleans up problematic keys
