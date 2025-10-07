/**
 * Migration Script: API Keys to Firebase
 * 
 * This script migrates the hardcoded ElevenLabs API keys to Firebase.
 * Run this ONCE to populate the Firebase database with the initial keys.
 * 
 * Usage:
 * node scripts/migrate-api-keys-to-firebase.js
 */

// Hardcoded API keys that were previously in lib/elevenlabs-keys.ts
const INITIAL_API_KEYS = [
  "sk_44e82946106ad5642716a1374775a1995e831ea8ee85b471",
  "sk_060a58d2fd7ce30e6ca6f29f1c22a2b133c8a88f43820087",
  "sk_557d6899fb94e22d3f552194850e88b1f1fa78775c68bea8",
  "sk_9a6af245215a92c537d242eac1c13b9b353e9cb958dac47d",
  "sk_f9a333489269122ddbd0b4a0792b1a51197318542d6fdf79",
  "sk_22b1f3ceee2145cb2727477501955f17c6d7e4d52b448427",
  "sk_52308985e50b193901cf483f9890f61beb744a59d637d195",
  "sk_f7a0658002d03b76e85746f32928312f472cd0f281d2b539",
  "sk_22fe6fe0bfc1a0f151289a0b4ddcb4ba674bbdd35ce658cb",
  "sk_0280116d56e26349faab53dc47a20897062836d234d5b097",
  "sk_4b624075f8d656663db093c26233d48214d24b0529e326b2",
  "sk_96646b09cee1732d970925dce28aff359d12058ed6ab74bd",
  "sk_cf4978013b49de6081cbefbe5fffc8b5f65e760dec3428ce",
  "sk_e58b058baf46063de7cd1295ca418f365f8a20ff4c1864cd"
];

async function migrateKeysToFirebase() {
  console.log('🚀 Starting API key migration to Firebase...');
  console.log(`📊 Total keys to migrate: ${INITIAL_API_KEYS.length}`);
  
  try {
    // Import the addApiKey function from the refactored file
    const { addApiKey } = require('../lib/elevenlabs-keys');
    
    let successCount = 0;
    let failCount = 0;
    
    for (const key of INITIAL_API_KEYS) {
      console.log(`\n🔑 Migrating key: ${key.substring(0, 10)}...`);
      
      const success = await addApiKey(key);
      
      if (success) {
        successCount++;
        console.log(`  ✅ Successfully migrated`);
      } else {
        failCount++;
        console.log(`  ❌ Failed to migrate (may already exist)`);
      }
    }
    
    console.log('\n' + '='.repeat(50));
    console.log('📈 Migration Summary:');
    console.log(`  ✅ Successful: ${successCount}`);
    console.log(`  ❌ Failed: ${failCount}`);
    console.log(`  📊 Total: ${INITIAL_API_KEYS.length}`);
    console.log('='.repeat(50));
    
    if (successCount === INITIAL_API_KEYS.length) {
      console.log('\n🎉 All API keys successfully migrated to Firebase!');
    } else if (successCount > 0) {
      console.log('\n⚠️ Some keys were not migrated (they may already exist in Firebase)');
    } else {
      console.log('\n❌ No keys were migrated. Check Firebase connection and permissions.');
    }
    
  } catch (error) {
    console.error('❌ Migration failed with error:', error);
    console.error('\nPlease ensure:');
    console.error('  1. Firebase is properly configured');
    console.error('  2. You have write permissions to /elevenlabsKeys');
    console.error('  3. Network connection is available');
    process.exit(1);
  }
}

// Run migration
migrateKeysToFirebase()
  .then(() => {
    console.log('\n✅ Migration script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Migration script failed:', error);
    process.exit(1);
  });

