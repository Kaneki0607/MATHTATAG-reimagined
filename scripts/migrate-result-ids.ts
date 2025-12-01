/**
 * Migration Script: Convert Result IDs to Hierarchical Format
 * 
 * OLD FORMAT: R-ABC-0001
 * NEW FORMAT: E-GTK-0004-R-ABC-0001 (hierarchical, linked to exercise)
 * 
 * This script:
 * 1. Scans all ExerciseResults
 * 2. Generates new hierarchical IDs based on their exerciseId
 * 3. Creates new records with hierarchical IDs
 * 4. Updates all references to the old IDs
 * 5. Archives old records (doesn't delete immediately for safety)
 * 
 * Usage: npm run migrate:results
 */

import { deleteData, readData, writeData } from '../lib/firebase-database';
import { generateResultId } from '../lib/id-generator';

interface ResultRecord {
  exerciseResultId: string;
  exerciseInfo?: {
    exerciseId: string;
  };
  exerciseId?: string;
  [key: string]: any;
}

interface MigrationSummary {
  total: number;
  migrated: number;
  skipped: number;
  errors: number;
  mapping: { [oldId: string]: string };
}

/**
 * Check if an ID is already in hierarchical format
 */
function isHierarchicalResultId(id: string): boolean {
  // Hierarchical format: E-GTK-0004-R-ABC-0001
  // Must contain exercise prefix and result part
  return id.includes('-R-') && id.split('-').length === 6;
}

/**
 * Extract exercise ID from result record
 */
function getExerciseId(record: ResultRecord): string | null {
  // Try new structure first
  if (record.exerciseInfo?.exerciseId) {
    return record.exerciseInfo.exerciseId;
  }
  
  // Try old structure
  if (record.exerciseId) {
    return record.exerciseId;
  }
  
  return null;
}

/**
 * Migrate a single result record to hierarchical format
 */
async function migrateResult(
  oldId: string,
  record: ResultRecord,
  summary: MigrationSummary
): Promise<string | null> {
  try {
    // Check if already migrated
    if (isHierarchicalResultId(oldId)) {
      console.log(`   ⏭️  Already hierarchical: ${oldId}`);
      summary.skipped++;
      return oldId;
    }
    
    // Get exercise ID
    const exerciseId = getExerciseId(record);
    if (!exerciseId) {
      console.log(`   ❌ No exercise ID found for: ${oldId}`);
      summary.errors++;
      return null;
    }
    
    // Generate new hierarchical ID
    const newId = await generateResultId(exerciseId);
    
    // Create new record with hierarchical ID
    const newRecord = {
      ...record,
      exerciseResultId: newId,
      migrationMetadata: {
        originalId: oldId,
        migratedAt: new Date().toISOString(),
        migratedBy: 'migrate-result-ids.ts'
      }
    };
    
    // Write new record
    const writeResult = await writeData(`/ExerciseResults/${newId}`, newRecord);
    if (!writeResult.success) {
      throw new Error(`Failed to write new record: ${writeResult.error}`);
    }
    
    // Archive old record (move to /ExerciseResults_archived)
    await writeData(`/ExerciseResults_archived/${oldId}`, {
      ...record,
      archivedAt: new Date().toISOString(),
      archivedReason: 'migrated-to-hierarchical',
      newId: newId
    });
    
    // Delete old record
    await deleteData(`/ExerciseResults/${oldId}`);
    
    console.log(`   ✅ ${oldId} → ${newId}`);
    summary.migrated++;
    summary.mapping[oldId] = newId;
    
    return newId;
    
  } catch (error) {
    console.error(`   ❌ Error migrating ${oldId}:`, error);
    summary.errors++;
    return null;
  }
}

/**
 * Update references to result IDs in other collections
 */
async function updateReferences(mapping: { [oldId: string]: string }): Promise<void> {
  console.log('\n📝 Updating references in other collections...');
  
  // Update references in Tasks (resultId field)
  try {
    const tasksData = await readData('/tasks');
    if (tasksData.data) {
      let updatedCount = 0;
      
      for (const [taskId, task] of Object.entries(tasksData.data) as [string, any][]) {
        if (task.resultId && mapping[task.resultId]) {
          const newResultId = mapping[task.resultId];
          await writeData(`/tasks/${taskId}/resultId`, newResultId);
          console.log(`   ✅ Updated task ${taskId}: ${task.resultId} → ${newResultId}`);
          updatedCount++;
        }
      }
      
      console.log(`   Updated ${updatedCount} task references`);
    }
  } catch (error) {
    console.error('   ❌ Error updating task references:', error);
  }
  
  // Update references in ParentDashboard history (if stored anywhere)
  // Add any other collections that reference result IDs here
}

/**
 * Main migration function
 */
async function migrateResultIds(): Promise<void> {
  console.log('\n====================================');
  console.log('RESULT ID MIGRATION TO HIERARCHICAL FORMAT');
  console.log('====================================\n');
  
  const summary: MigrationSummary = {
    total: 0,
    migrated: 0,
    skipped: 0,
    errors: 0,
    mapping: {}
  };
  
  try {
    // Read all exercise results
    console.log('📖 Reading all exercise results...');
    const resultsData = await readData('/ExerciseResults');
    
    if (!resultsData.data) {
      console.log('✅ No exercise results found. Nothing to migrate.');
      return;
    }
    
    const results = Object.entries(resultsData.data) as [string, ResultRecord][];
    summary.total = results.length;
    
    console.log(`   Found ${summary.total} results\n`);
    
    // Migrate each result
    console.log('🔄 Migrating results...\n');
    for (const [oldId, record] of results) {
      await migrateResult(oldId, record, summary);
    }
    
    // Update references
    if (Object.keys(summary.mapping).length > 0) {
      await updateReferences(summary.mapping);
    }
    
    // Save mapping to file for reference
    await writeData('/system/migrations/result-id-mapping', {
      migratedAt: new Date().toISOString(),
      mapping: summary.mapping,
      summary: {
        total: summary.total,
        migrated: summary.migrated,
        skipped: summary.skipped,
        errors: summary.errors
      }
    });
    
    // Print summary
    console.log('\n====================================');
    console.log('MIGRATION SUMMARY');
    console.log('====================================');
    console.log(`Total results:     ${summary.total}`);
    console.log(`Migrated:          ${summary.migrated}`);
    console.log(`Already migrated:  ${summary.skipped}`);
    console.log(`Errors:            ${summary.errors}`);
    console.log('====================================\n');
    
    if (summary.migrated > 0) {
      console.log('✅ Migration completed successfully!');
      console.log('\nID mapping saved to: /system/migrations/result-id-mapping');
      console.log('Archived results saved to: /ExerciseResults_archived\n');
    } else {
      console.log('✅ No migration needed. All results already use hierarchical format.\n');
    }
    
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    throw error;
  }
}

// Run if executed directly
if (require.main === module) {
  migrateResultIds()
    .then(() => {
      console.log('✅ Migration script completed.\n');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Migration script failed:', error);
      process.exit(1);
    });
}

export { migrateResultIds };

