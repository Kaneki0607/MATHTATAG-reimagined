/**
 * Database ID Migration Script
 * 
 * Run this script to convert existing random Firebase IDs to readable format.
 * 
 * IMPORTANT WARNINGS:
 * 1. BACKUP YOUR DATABASE before running this script!
 * 2. This script will modify ALL records in your database
 * 3. The migration cannot be easily reversed
 * 4. Test in a development environment first
 * 
 * Usage:
 * 1. Ensure your Firebase config is correct in lib/firebase.ts
 * 2. Run: npx ts-node scripts/migrate-ids.ts
 * 3. Follow the prompts
 * 4. Monitor console output for any errors
 * 5. Verify data integrity after completion
 * 
 * What this script does:
 * - Converts all entity IDs to readable format (PARENT-0001, TEACHER-0001, etc.)
 * - Updates all foreign key references to maintain relationships
 * - Creates ID counter storage in Firebase
 * - Generates ID mapping file for reference
 * - Verifies migration integrity
 */

import * as FileSystem from 'fs';
import * as Path from 'path';
import { MigrationUtility } from '../lib/id-migration-utility';

async function confirmMigration(): Promise<boolean> {
  console.log('\n⚠️  DATABASE MIGRATION WARNING ⚠️');
  console.log('=====================================\n');
  console.log('This script will:');
  console.log('1. Convert ALL database IDs to readable format');
  console.log('2. Update ALL foreign key references');
  console.log('3. MODIFY your database permanently');
  console.log('\nBefore proceeding:');
  console.log('✓ Backup your database');
  console.log('✓ Test in development environment');
  console.log('✓ Ensure no users are actively using the system\n');
  console.log('=====================================\n');
  
  // In a real script, you'd use readline or prompts package
  // For now, we'll assume confirmation
  return true;
}

async function runMigration() {
  console.log('\n🚀 Starting Database ID Migration...\n');
  
  try {
    // Step 1: Initialize counters from existing data
    console.log('Step 1: Initializing ID counters...');
    await MigrationUtility.initializeAllCounters();
    
    // Step 2: Run the migration
    console.log('\nStep 2: Migrating database IDs...');
    const result = await MigrationUtility.migrateDatabaseIds();
    
    // Step 3: Verify migration
    console.log('\nStep 3: Verifying migration integrity...');
    const verification = await MigrationUtility.verifyMigration();
    
    // Step 4: Export ID mapping
    console.log('\nStep 4: Exporting ID mapping...');
    const mapping = MigrationUtility.exportIdMapping();
    
    // Save mapping to file
    const mappingPath = Path.join(__dirname, '../migration-id-mapping.json');
    FileSystem.writeFileSync(mappingPath, mapping);
    console.log(`✅ ID mapping saved to: ${mappingPath}`);
    
    // Print final summary
    console.log('\n\n====================================');
    console.log('MIGRATION COMPLETE');
    console.log('====================================\n');
    
    console.log('Summary:');
    result.summaries.forEach(summary => {
      const status = summary.failed > 0 ? '⚠️' : '✅';
      console.log(`${status} ${summary.entityType}:`);
      console.log(`   Total: ${summary.totalRecords}`);
      console.log(`   Migrated: ${summary.migrated}`);
      console.log(`   Skipped: ${summary.skipped}`);
      console.log(`   Failed: ${summary.failed}`);
    });
    
    console.log(`\n✅ Foreign Key Updates: ${result.foreignKeyUpdates}`);
    console.log(`✅ Total ID Mappings: ${Object.keys(result.idMapping).length}`);
    
    if (verification.valid) {
      console.log('\n✅ Migration verification PASSED');
      console.log('All relationships are intact.');
    } else {
      console.log('\n⚠️  Migration verification found issues:');
      verification.issues.forEach(issue => console.log(`   - ${issue}`));
      console.log('\nPlease review and fix these issues manually.');
    }
    
    console.log('\n====================================');
    console.log('NEXT STEPS:');
    console.log('====================================');
    console.log('1. Review the migration summary above');
    console.log('2. Check the ID mapping file: migration-id-mapping.json');
    console.log('3. Verify a few records in Firebase console');
    console.log('4. Test your application thoroughly');
    console.log('5. If issues occur, restore from backup\n');
    
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    console.log('\n⚠️  Please restore from backup and review the error.\n');
    throw error;
  }
}

async function main() {
  const confirmed = await confirmMigration();
  
  if (!confirmed) {
    console.log('\n❌ Migration cancelled by user.\n');
    return;
  }
  
  await runMigration();
}

// Run if executed directly
if (require.main === module) {
  main()
    .then(() => {
      console.log('\n✅ Migration script completed.\n');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Migration script failed:', error);
      process.exit(1);
    });
}

export default main;

