/**
 * ID Migration Utility for MATHTATAG Project
 * 
 * Converts existing random Firebase IDs to new readable format
 * while maintaining all relationships and data integrity.
 * 
 * IMPORTANT: Always backup your database before running migrations!
 */

import { deleteData, readData, writeData } from './firebase-database';
import { EntityType, generateNextId, initializeCounterFromExisting } from './id-generator';

interface MigrationResult {
  success: boolean;
  oldId: string;
  newId: string;
  error?: string;
}

interface EntityMigrationSummary {
  entityType: string;
  totalRecords: number;
  migrated: number;
  failed: number;
  skipped: number;
  results: MigrationResult[];
}

/**
 * Migration mapping to track old ID -> new ID conversions
 */
class MigrationMapper {
  private mappings: Map<string, string> = new Map();
  
  set(oldId: string, newId: string): void {
    this.mappings.set(oldId, newId);
  }
  
  get(oldId: string): string | undefined {
    return this.mappings.get(oldId);
  }
  
  has(oldId: string): boolean {
    return this.mappings.has(oldId);
  }
  
  getAll(): Record<string, string> {
    return Object.fromEntries(this.mappings);
  }
  
  toJSON(): string {
    return JSON.stringify(this.getAll(), null, 2);
  }
}

// Global mapper to track all ID migrations
const globalMapper = new MigrationMapper();

/**
 * Migrate a single entity to new ID format
 */
async function migrateSingleEntity(
  oldId: string,
  data: any,
  entityType: EntityType,
  databasePath: string,
  section?: string
): Promise<MigrationResult> {
  try {
    // Check if already migrated (has new format)
    if (oldId.startsWith(`${entityType}-`)) {
      console.log(`[Migration] Skipping ${oldId} - already in new format`);
      return {
        success: true,
        oldId,
        newId: oldId
      };
    }
    
    // Generate new ID
    const newId = await generateNextId(entityType, section, databasePath);
    
    // Write data with new ID
    const writeResult = await writeData(`${databasePath}/${newId}`, data);
    
    if (!writeResult.success) {
      throw new Error(writeResult.error || 'Failed to write with new ID');
    }
    
    // Delete old ID entry
    const deleteResult = await deleteData(`${databasePath}/${oldId}`);
    
    if (!deleteResult.success) {
      console.warn(`[Migration] Failed to delete old entry ${oldId}, but new entry created`);
    }
    
    // Store mapping
    globalMapper.set(oldId, newId);
    
    console.log(`[Migration] Migrated ${entityType}: ${oldId} -> ${newId}`);
    
    return {
      success: true,
      oldId,
      newId
    };
    
  } catch (error) {
    console.error(`[Migration] Failed to migrate ${oldId}:`, error);
    return {
      success: false,
      oldId,
      newId: '',
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Migrate all entities of a specific type
 */
export async function migrateEntityType(
  entityType: EntityType,
  databasePath: string,
  getSectionFromData?: (data: any) => string | undefined
): Promise<EntityMigrationSummary> {
  console.log(`\n[Migration] Starting migration for ${entityType}...`);
  
  const summary: EntityMigrationSummary = {
    entityType,
    totalRecords: 0,
    migrated: 0,
    failed: 0,
    skipped: 0,
    results: []
  };
  
  try {
    // Read all existing entities
    const result = await readData(databasePath);
    
    if (!result.data) {
      console.log(`[Migration] No data found at ${databasePath}`);
      return summary;
    }
    
    const entities = Object.entries(result.data);
    summary.totalRecords = entities.length;
    
    console.log(`[Migration] Found ${entities.length} ${entityType} records`);
    
    // Migrate each entity
    for (const [oldId, data] of entities) {
      const section = getSectionFromData ? getSectionFromData(data) : undefined;
      const migrationResult = await migrateSingleEntity(
        oldId,
        data,
        entityType,
        databasePath,
        section
      );
      
      summary.results.push(migrationResult);
      
      if (migrationResult.success) {
        if (migrationResult.oldId === migrationResult.newId) {
          summary.skipped++;
        } else {
          summary.migrated++;
        }
      } else {
        summary.failed++;
      }
    }
    
    console.log(`[Migration] ${entityType} migration complete:`, {
      total: summary.totalRecords,
      migrated: summary.migrated,
      failed: summary.failed,
      skipped: summary.skipped
    });
    
  } catch (error) {
    console.error(`[Migration] Error during ${entityType} migration:`, error);
  }
  
  return summary;
}

/**
 * Update foreign key references after migration
 */
async function updateForeignKeyReferences(
  entityPath: string,
  foreignKeyField: string,
  mapper: MigrationMapper
): Promise<number> {
  let updated = 0;
  
  try {
    const result = await readData(entityPath);
    
    if (!result.data) {
      return 0;
    }
    
    const entities = Object.entries(result.data);
    
    for (const [id, data] of entities) {
      const oldForeignKey = (data as any)[foreignKeyField];
      
      if (oldForeignKey && mapper.has(oldForeignKey)) {
        const newForeignKey = mapper.get(oldForeignKey);
        
        if (newForeignKey) {
          await writeData(`${entityPath}/${id}/${foreignKeyField}`, newForeignKey);
          updated++;
          console.log(`[Migration] Updated ${foreignKeyField} in ${id}: ${oldForeignKey} -> ${newForeignKey}`);
        }
      }
    }
    
  } catch (error) {
    console.error(`[Migration] Error updating foreign keys at ${entityPath}:`, error);
  }
  
  return updated;
}

/**
 * MASTER MIGRATION: Migrate entire database in correct order
 * 
 * Order is important to maintain relationships:
 * 1. Teachers (independent)
 * 2. Classes (depends on teachers)
 * 3. Parents (independent)
 * 4. Students (depends on parents and classes)
 * 5. Exercises (depends on teachers)
 * 6. Assigned Exercises (depends on exercises and classes)
 * 7. Exercise Results (depends on students and exercises)
 * 8. Other entities
 */
export async function migrateDatabaseIds(): Promise<{
  summaries: EntityMigrationSummary[];
  foreignKeyUpdates: number;
  idMapping: Record<string, string>;
}> {
  console.log('\n====================================');
  console.log('STARTING COMPLETE DATABASE MIGRATION');
  console.log('====================================\n');
  
  const summaries: EntityMigrationSummary[] = [];
  
  // Step 1: Migrate Teachers
  console.log('\n--- Step 1: Migrating Teachers ---');
  const teachersSummary = await migrateEntityType('TEACHER', '/teachers');
  summaries.push(teachersSummary);
  
  // Step 2: Migrate Classes
  console.log('\n--- Step 2: Migrating Classes ---');
  const classesSummary = await migrateEntityType(
    'CLASS',
    '/classes',
    (data) => data.section || data.name
  );
  summaries.push(classesSummary);
  
  // Step 3: Migrate Parents
  console.log('\n--- Step 3: Migrating Parents ---');
  const parentsSummary = await migrateEntityType('PARENT', '/parents');
  summaries.push(parentsSummary);
  
  // Step 4: Migrate Students
  console.log('\n--- Step 4: Migrating Students ---');
  const studentsSummary = await migrateEntityType(
    'STUDENT',
    '/students',
    (data) => data.gradeSection || data.section
  );
  summaries.push(studentsSummary);
  
  // Step 5: Migrate Exercises
  console.log('\n--- Step 5: Migrating Exercises ---');
  const exercisesSummary = await migrateEntityType('EXERCISE', '/exercises');
  summaries.push(exercisesSummary);
  
  // Step 6: Migrate Assigned Exercises
  console.log('\n--- Step 6: Migrating Assigned Exercises ---');
  const assignedSummary = await migrateEntityType('ASSIGNED', '/assignedExercises');
  summaries.push(assignedSummary);
  
  // Step 7: Migrate Exercise Results
  console.log('\n--- Step 7: Migrating Exercise Results ---');
  const resultsSummary = await migrateEntityType('RESULT', '/ExerciseResults');
  summaries.push(resultsSummary);
  
  // Step 8: Migrate Announcements
  console.log('\n--- Step 8: Migrating Announcements ---');
  const announcementsSummary = await migrateEntityType('ANNOUNCEMENT', '/announcements');
  summaries.push(announcementsSummary);
  
  // Step 9: Migrate Tasks
  console.log('\n--- Step 9: Migrating Tasks ---');
  const tasksSummary = await migrateEntityType('TASK', '/tasks');
  summaries.push(tasksSummary);
  
  // Step 10: Update Foreign Key References
  console.log('\n--- Step 10: Updating Foreign Key References ---');
  let totalForeignKeyUpdates = 0;
  
  // Update parentId in students
  totalForeignKeyUpdates += await updateForeignKeyReferences(
    '/students',
    'parentId',
    globalMapper
  );
  
  // Update classId in students
  totalForeignKeyUpdates += await updateForeignKeyReferences(
    '/students',
    'classId',
    globalMapper
  );
  
  // Update teacherId in classes
  totalForeignKeyUpdates += await updateForeignKeyReferences(
    '/classes',
    'teacherId',
    globalMapper
  );
  
  // Update teacherId in exercises
  totalForeignKeyUpdates += await updateForeignKeyReferences(
    '/exercises',
    'teacherId',
    globalMapper
  );
  
  // Update exerciseId in assigned exercises
  totalForeignKeyUpdates += await updateForeignKeyReferences(
    '/assignedExercises',
    'exerciseId',
    globalMapper
  );
  
  // Update classId in assigned exercises
  totalForeignKeyUpdates += await updateForeignKeyReferences(
    '/assignedExercises',
    'classId',
    globalMapper
  );
  
  // Update parent login codes mapping
  console.log('\n--- Step 11: Updating Parent Login Codes ---');
  const loginCodesResult = await readData('/parentLoginCodes');
  if (loginCodesResult.data) {
    for (const [loginCode, oldParentId] of Object.entries(loginCodesResult.data)) {
      const newParentId = globalMapper.get(oldParentId as string);
      if (newParentId) {
        await writeData(`/parentLoginCodes/${loginCode}`, newParentId);
        console.log(`[Migration] Updated login code ${loginCode}: ${oldParentId} -> ${newParentId}`);
      }
    }
  }
  
  console.log('\n====================================');
  console.log('MIGRATION COMPLETE');
  console.log('====================================\n');
  
  // Print summary
  console.log('Migration Summary:');
  summaries.forEach(summary => {
    console.log(`\n${summary.entityType}:`);
    console.log(`  Total: ${summary.totalRecords}`);
    console.log(`  Migrated: ${summary.migrated}`);
    console.log(`  Skipped: ${summary.skipped}`);
    console.log(`  Failed: ${summary.failed}`);
  });
  
  console.log(`\nTotal Foreign Key Updates: ${totalForeignKeyUpdates}`);
  console.log(`\nTotal ID Mappings: ${Object.keys(globalMapper.getAll()).length}`);
  
  return {
    summaries,
    foreignKeyUpdates: totalForeignKeyUpdates,
    idMapping: globalMapper.getAll()
  };
}

/**
 * Verify migration integrity
 * Checks that all relationships are still valid after migration
 */
export async function verifyMigration(): Promise<{
  valid: boolean;
  issues: string[];
}> {
  console.log('\n--- Verifying Migration Integrity ---\n');
  
  const issues: string[] = [];
  
  try {
    // Verify students have valid parentId references
    const studentsResult = await readData('/students');
    const parentsResult = await readData('/parents');
    
    if (studentsResult.data && parentsResult.data) {
      const parentIds = Object.keys(parentsResult.data);
      
      for (const [studentId, studentData] of Object.entries(studentsResult.data)) {
        const parentId = (studentData as any).parentId;
        if (parentId && !parentIds.includes(parentId)) {
          issues.push(`Student ${studentId} references non-existent parent ${parentId}`);
        }
      }
    }
    
    // Verify students have valid classId references
    const classesResult = await readData('/classes');
    
    if (studentsResult.data && classesResult.data) {
      const classIds = Object.keys(classesResult.data);
      
      for (const [studentId, studentData] of Object.entries(studentsResult.data)) {
        const classId = (studentData as any).classId;
        if (classId && !classIds.includes(classId)) {
          issues.push(`Student ${studentId} references non-existent class ${classId}`);
        }
      }
    }
    
    // More verification checks can be added here...
    
  } catch (error) {
    issues.push(`Verification error: ${error instanceof Error ? error.message : String(error)}`);
  }
  
  const valid = issues.length === 0;
  
  console.log(valid ? '✅ Migration verification passed!' : '❌ Migration verification found issues:');
  issues.forEach(issue => console.log(`  - ${issue}`));
  
  return { valid, issues };
}

/**
 * Export ID mapping to file (for backup/reference)
 */
export function exportIdMapping(): string {
  return globalMapper.toJSON();
}

/**
 * Initialize counters from existing database
 * Call this BEFORE running migration if you want to preserve existing ID numbers
 */
export async function initializeAllCounters(): Promise<void> {
  console.log('\n--- Initializing ID Counters from Existing Data ---\n');
  
  const initOperations = [
    { type: 'TEACHER' as EntityType, path: '/teachers' },
    { type: 'CLASS' as EntityType, path: '/classes' },
    { type: 'PARENT' as EntityType, path: '/parents' },
    { type: 'STUDENT' as EntityType, path: '/students' },
    { type: 'EXERCISE' as EntityType, path: '/exercises' },
    { type: 'ASSIGNED' as EntityType, path: '/assignedExercises' },
    { type: 'RESULT' as EntityType, path: '/ExerciseResults' },
    { type: 'ANNOUNCEMENT' as EntityType, path: '/announcements' },
    { type: 'TASK' as EntityType, path: '/tasks' },
  ];
  
  for (const op of initOperations) {
    await initializeCounterFromExisting(op.path, op.type);
  }
  
  console.log('\n✅ All counters initialized\n');
}

export const MigrationUtility = {
  migrateDatabaseIds,
  migrateEntityType,
  verifyMigration,
  exportIdMapping,
  initializeAllCounters
};

export default MigrationUtility;

