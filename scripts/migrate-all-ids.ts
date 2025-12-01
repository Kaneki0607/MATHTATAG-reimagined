/**
 * COMPLETE ID MIGRATION SCRIPT
 * 
 * This script handles ALL ID migrations in one go:
 * 1. Migrates old readable format (ENTITY-0001) to new format (E-ABC-0001)
 * 2. Migrates legacy Firebase IDs to new format
 * 3. Converts result IDs to hierarchical format (E-GTK-0004-R-ABC-0001)
 * 4. Updates all foreign key references
 * 
 * Usage: npm run migrate:all
 */

import { deleteData, readData, writeData } from '../lib/firebase-database';
import { generateNextId, generateResultId } from '../lib/id-generator';

interface MigrationResult {
  entity: string;
  total: number;
  migrated: number;
  skipped: number;
  errors: number;
  mapping: { [oldId: string]: string };
}

interface EntityConfig {
  name: string;
  type: 'PARENT' | 'TEACHER' | 'STUDENT' | 'CLASS' | 'EXERCISE' | 'ASSIGNED' | 'ANNOUNCEMENT' | 'TASK';
  path: string;
  idField?: string;  // Field name for the ID (default: same as type lowercase + 'Id')
}

/**
 * Check if ID needs migration
 */
function needsMigration(id: string): boolean {
  // New format: PREFIX-XXX-XXXX (single letter prefix with random code)
  const newFormat = /^[A-Z]-[A-Z]{3}-[0-9]{4}$/;
  
  // Hierarchical result format: E-GTK-0004-R-ABC-0001
  const hierarchicalResult = /^[A-Z]-[A-Z]{3}-[0-9]{4}-R-[A-Z]{3}-[0-9]{4}$/;
  
  // Hierarchical question format: E-GTK-0004-Q001
  const hierarchicalQuestion = /^[A-Z]-[A-Z]{3}-[0-9]{4}-Q[0-9]{3}$/;
  
  // If it matches any new format, skip migration
  if (newFormat.test(id) || hierarchicalResult.test(id) || hierarchicalQuestion.test(id)) {
    return false;
  }
  
  return true;
}

/**
 * Migrate a single entity
 */
async function migrateEntity(
  oldId: string,
  entityType: string,
  path: string,
  record: any,
  result: MigrationResult
): Promise<string | null> {
  try {
    // Skip if already in new format
    if (!needsMigration(oldId)) {
      console.log(`   ⏭️  Already migrated: ${oldId}`);
      result.skipped++;
      return oldId;
    }
    
    // Generate new ID
    const newId = await generateNextId(
      entityType as any,
      undefined,
      path
    );
    
    // Update the record with new ID
    const updatedRecord = {
      ...record,
      [result.entity.toLowerCase() + 'Id']: newId,
      migrationMetadata: {
        originalId: oldId,
        migratedAt: new Date().toISOString(),
        migratedBy: 'migrate-all-ids.ts'
      }
    };
    
    // Handle special ID fields
    if (entityType === 'TEACHER' && record.uid) {
      updatedRecord.uid = newId;
    }
    if (entityType === 'CLASS' && record.id) {
      updatedRecord.id = newId;
    }
    if (entityType === 'ASSIGNED' && record.id) {
      updatedRecord.id = newId;
    }
    
    // Write new record
    const writeResult = await writeData(`${path}/${newId}`, updatedRecord);
    if (!writeResult.success) {
      throw new Error(`Failed to write new record: ${writeResult.error}`);
    }
    
    // Archive old record
    await writeData(`${path}_archived/${oldId}`, {
      ...record,
      archivedAt: new Date().toISOString(),
      archivedReason: 'migrated-to-new-format',
      newId: newId
    });
    
    // Delete old record
    await deleteData(`${path}/${oldId}`);
    
    console.log(`   ✅ ${oldId} → ${newId}`);
    result.migrated++;
    result.mapping[oldId] = newId;
    
    return newId;
    
  } catch (error) {
    console.error(`   ❌ Error migrating ${oldId}:`, error);
    result.errors++;
    return null;
  }
}

/**
 * Migrate results to hierarchical format
 */
async function migrateResultsToHierarchical(
  result: MigrationResult
): Promise<void> {
  console.log('\n🔄 Migrating Results to Hierarchical Format...\n');
  
  try {
    const resultsData = await readData('/ExerciseResults');
    
    if (!resultsData.data) {
      console.log('   No results found to migrate');
      return;
    }
    
    const results = Object.entries(resultsData.data) as [string, any][];
    
    for (const [oldId, record] of results) {
      try {
        // Check if already hierarchical
        if (oldId.match(/^[A-Z]-[A-Z]{3}-[0-9]{4}-R-[A-Z]{3}-[0-9]{4}$/)) {
          console.log(`   ⏭️  Already hierarchical: ${oldId}`);
          result.skipped++;
          continue;
        }
        
        // Get exercise ID
        const exerciseId = record.exerciseInfo?.exerciseId || record.exerciseId;
        if (!exerciseId) {
          console.log(`   ⚠️  No exercise ID for ${oldId}, skipping`);
          result.errors++;
          continue;
        }
        
        // Generate hierarchical ID
        const newId = await generateResultId(exerciseId, '/ExerciseResults');
        
        // Update record
        const updatedRecord = {
          ...record,
          exerciseResultId: newId,
          migrationMetadata: {
            originalId: oldId,
            migratedAt: new Date().toISOString(),
            migratedBy: 'migrate-all-ids.ts (hierarchical)'
          }
        };
        
        // Write new record
        const writeResult = await writeData(`/ExerciseResults/${newId}`, updatedRecord);
        if (!writeResult.success) {
          throw new Error(`Failed to write: ${writeResult.error}`);
        }
        
        // Archive old
        await writeData(`/ExerciseResults_archived/${oldId}`, {
          ...record,
          archivedAt: new Date().toISOString(),
          newId: newId
        });
        
        // Delete old
        await deleteData(`/ExerciseResults/${oldId}`);
        
        console.log(`   ✅ ${oldId} → ${newId}`);
        result.migrated++;
        result.mapping[oldId] = newId;
        
      } catch (error) {
        console.error(`   ❌ Error migrating ${oldId}:`, error);
        result.errors++;
      }
    }
    
  } catch (error) {
    console.error('Error in results migration:', error);
  }
}

/**
 * Update all foreign key references
 */
async function updateAllReferences(results: MigrationResult[]): Promise<void> {
  console.log('\n📝 Updating Foreign Key References...\n');
  
  // Build combined mapping from all migrations
  const allMappings: { [oldId: string]: string } = {};
  results.forEach(r => {
    Object.assign(allMappings, r.mapping);
  });
  
  if (Object.keys(allMappings).length === 0) {
    console.log('   No mappings to apply');
    return;
  }
  
  // Update students (parentId, classId)
  await updateReferences('/students', allMappings, ['parentId', 'classId']);
  
  // Update classes (teacherId)
  await updateReferences('/classes', allMappings, ['teacherId']);
  await updateReferences('/sections', allMappings, ['teacherId']);
  
  // Update exercises (teacherId)
  await updateReferences('/exercises', allMappings, ['teacherId']);
  
  // Update assigned exercises (exerciseId, classId, assignedBy)
  await updateReferences('/assignedExercises', allMappings, ['exerciseId', 'classId', 'assignedBy']);
  
  // Update tasks (teacherId, exerciseId, resultId, classIds array)
  await updateReferences('/tasks', allMappings, ['teacherId', 'exerciseId', 'resultId'], ['classIds']);
  
  // Update announcements (teacherId, classIds array)
  await updateReferences('/announcements', allMappings, ['teacherId'], ['classIds']);
  
  console.log('✅ All references updated');
}

async function updateReferences(
  path: string,
  mapping: { [oldId: string]: string },
  fields: string[],
  arrayFields: string[] = []
): Promise<void> {
  try {
    const data = await readData(path);
    if (!data.data) return;
    
    let updated = 0;
    
    for (const [id, record] of Object.entries(data.data) as [string, any][]) {
      let hasChanges = false;
      const updates: any = {};
      
      // Update single-value fields
      for (const field of fields) {
        if (record[field] && mapping[record[field]]) {
          updates[field] = mapping[record[field]];
          hasChanges = true;
        }
      }
      
      // Update array fields
      for (const field of arrayFields) {
        if (record[field] && Array.isArray(record[field])) {
          const updatedArray = record[field].map((val: string) => mapping[val] || val);
          if (JSON.stringify(updatedArray) !== JSON.stringify(record[field])) {
            updates[field] = updatedArray;
            hasChanges = true;
          }
        }
      }
      
      // Apply updates
      if (hasChanges) {
        await writeData(`${path}/${id}`, { ...record, ...updates });
        updated++;
        console.log(`   ✅ Updated ${path}/${id}`);
      }
    }
    
    if (updated > 0) {
      console.log(`   Updated ${updated} records in ${path}`);
    }
    
  } catch (error) {
    console.error(`Error updating references in ${path}:`, error);
  }
}

/**
 * Main migration function
 */
async function migrateAllIds(): Promise<void> {
  console.log('\n====================================');
  console.log('COMPLETE ID MIGRATION');
  console.log('====================================\n');
  
  const results: MigrationResult[] = [];
  
  // Define all entities to migrate
  const entities: EntityConfig[] = [
    { name: 'Parents', type: 'PARENT', path: '/parents' },
    { name: 'Teachers', type: 'TEACHER', path: '/teachers' },
    { name: 'Classes', type: 'CLASS', path: '/classes' },
    { name: 'Sections', type: 'CLASS', path: '/sections' },
    { name: 'Students', type: 'STUDENT', path: '/students' },
    { name: 'Exercises', type: 'EXERCISE', path: '/exercises' },
    { name: 'Assigned Exercises', type: 'ASSIGNED', path: '/assignedExercises' },
    { name: 'Announcements', type: 'ANNOUNCEMENT', path: '/announcements' },
    { name: 'Tasks', type: 'TASK', path: '/tasks' },
  ];
  
  // Migrate each entity type
  for (const entity of entities) {
    console.log(`\n🔄 Migrating ${entity.name}...\n`);
    
    const migrationResult: MigrationResult = {
      entity: entity.name,
      total: 0,
      migrated: 0,
      skipped: 0,
      errors: 0,
      mapping: {}
    };
    
    try {
      const data = await readData(entity.path);
      
      if (!data.data) {
        console.log(`   No data found at ${entity.path}`);
        continue;
      }
      
      const records = Object.entries(data.data) as [string, any][];
      migrationResult.total = records.length;
      
      for (const [oldId, record] of records) {
        await migrateEntity(oldId, entity.type, entity.path, record, migrationResult);
      }
      
      results.push(migrationResult);
      
    } catch (error) {
      console.error(`Error migrating ${entity.name}:`, error);
    }
  }
  
  // Special handling for Results (hierarchical format)
  console.log('\n🔄 Migrating Results to Hierarchical Format...\n');
  const resultMigration: MigrationResult = {
    entity: 'Results',
    total: 0,
    migrated: 0,
    skipped: 0,
    errors: 0,
    mapping: {}
  };
  
  try {
    const resultsData = await readData('/ExerciseResults');
    if (resultsData.data) {
      const records = Object.entries(resultsData.data) as [string, any][];
      resultMigration.total = records.length;
      
      for (const [oldId, record] of records) {
        try {
          // Check if already hierarchical
          if (oldId.match(/^[A-Z]-[A-Z]{3}-[0-9]{4}-R-[A-Z]{3}-[0-9]{4}$/)) {
            console.log(`   ⏭️  Already hierarchical: ${oldId}`);
            resultMigration.skipped++;
            continue;
          }
          
          // Get exercise ID
          const exerciseId = record.exerciseInfo?.exerciseId || record.exerciseId;
          if (!exerciseId) {
            console.log(`   ⚠️  No exercise ID for ${oldId}, skipping`);
            resultMigration.errors++;
            continue;
          }
          
          // If exerciseId also needs migration, use the new format
          let finalExerciseId = exerciseId;
          const exerciseMapping = results.find(r => r.entity === 'Exercises')?.mapping;
          if (exerciseMapping && exerciseMapping[exerciseId]) {
            finalExerciseId = exerciseMapping[exerciseId];
            console.log(`   📝 Using migrated exercise ID: ${finalExerciseId}`);
          }
          
          // Generate hierarchical ID
          const newId = await generateResultId(finalExerciseId, '/ExerciseResults');
          
          // Update record with new IDs
          const updatedRecord = {
            ...record,
            exerciseResultId: newId,
            migrationMetadata: {
              originalId: oldId,
              migratedAt: new Date().toISOString()
            }
          };
          
          // Update nested exerciseId if needed
          if (updatedRecord.exerciseInfo) {
            updatedRecord.exerciseInfo.exerciseId = finalExerciseId;
          }
          if (updatedRecord.exerciseId) {
            updatedRecord.exerciseId = finalExerciseId;
          }
          
          // Write new record
          await writeData(`/ExerciseResults/${newId}`, updatedRecord);
          
          // Archive old
          await writeData(`/ExerciseResults_archived/${oldId}`, {
            ...record,
            archivedAt: new Date().toISOString(),
            newId: newId
          });
          
          // Delete old
          await deleteData(`/ExerciseResults/${oldId}`);
          
          console.log(`   ✅ ${oldId} → ${newId}`);
          resultMigration.migrated++;
          resultMigration.mapping[oldId] = newId;
          
        } catch (error) {
          console.error(`   ❌ Error migrating ${oldId}:`, error);
          resultMigration.errors++;
        }
      }
    }
    
    results.push(resultMigration);
    
  } catch (error) {
    console.error('Error migrating results:', error);
  }
  
  // Update all foreign key references
  await updateAllReferences(results);
  
  // Save comprehensive migration log
  await writeData('/system/migrations/complete-id-migration', {
    migratedAt: new Date().toISOString(),
    results: results.map(r => ({
      entity: r.entity,
      total: r.total,
      migrated: r.migrated,
      skipped: r.skipped,
      errors: r.errors
    })),
    mappings: results.reduce((acc, r) => ({ ...acc, ...r.mapping }), {})
  });
  
  // Print summary
  console.log('\n====================================');
  console.log('MIGRATION SUMMARY');
  console.log('====================================\n');
  
  results.forEach(r => {
    console.log(`${r.entity}:`);
    console.log(`  Total: ${r.total}`);
    console.log(`  Migrated: ${r.migrated}`);
    console.log(`  Already migrated: ${r.skipped}`);
    console.log(`  Errors: ${r.errors}`);
    console.log('');
  });
  
  const totalMigrated = results.reduce((sum, r) => sum + r.migrated, 0);
  const totalErrors = results.reduce((sum, r) => sum + r.errors, 0);
  
  console.log('====================================');
  console.log(`Total Migrated: ${totalMigrated}`);
  console.log(`Total Errors: ${totalErrors}`);
  console.log('====================================\n');
  
  if (totalMigrated > 0) {
    console.log('✅ Migration completed successfully!');
    console.log('\nNext steps:');
    console.log('1. Run: npm run id:verify');
    console.log('2. Run: npm run id:test');
    console.log('3. Test app functionality\n');
  } else {
    console.log('✅ No migration needed. All IDs already in new format.\n');
  }
}

// Run if executed directly
if (require.main === module) {
  migrateAllIds()
    .then(() => {
      console.log('✅ Migration script completed.\n');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Migration script failed:', error);
      process.exit(1);
    });
}

export { migrateAllIds };

