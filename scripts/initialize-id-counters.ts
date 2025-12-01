/**
 * Initialize ID Counters Script
 * 
 * Sets up the ID counter system in Firebase.
 * Run this ONCE before using the new ID system.
 * 
 * What it does:
 * - Scans existing database records
 * - Finds the highest ID number for each entity type
 * - Initializes counters to start from highest + 1
 * - Ensures no ID collisions occur
 * 
 * Usage: npx ts-node scripts/initialize-id-counters.ts
 */

import { readData, writeData } from '../lib/firebase-database';
import { EntityType, parseId } from '../lib/id-generator';

interface InitResult {
  entityType: string;
  existingRecords: number;
  highestNumber: number;
  counterSet: number;
  status: 'success' | 'warning' | 'error';
}

async function initializeCounter(
  entityType: EntityType,
  databasePath: string
): Promise<InitResult> {
  console.log(`\nInitializing ${entityType} counter...`);
  
  const result: InitResult = {
    entityType,
    existingRecords: 0,
    highestNumber: 0,
    counterSet: 0,
    status: 'success'
  };
  
  try {
    // Read all existing records
    const data = await readData(databasePath);
    
    if (!data.data) {
      console.log(`  No existing records found at ${databasePath}`);
      result.status = 'warning';
      result.counterSet = 0;
      
      // Set counter to 0
      await writeData(`/system/idCounters/${entityType}`, {
        count: 0,
        lastUpdated: new Date().toISOString(),
        initializedAt: new Date().toISOString()
      });
      
      return result;
    }
    
    const ids = Object.keys(data.data);
    result.existingRecords = ids.length;
    
    // Find highest ID number
    const numbers = ids
      .map(id => {
        // Try to parse as new format
        const parsed = parseId(id);
        if (parsed.isValid && parsed.type === entityType) {
          return parsed.number;
        }
        return 0;
      })
      .filter(num => num > 0);
    
    if (numbers.length > 0) {
      result.highestNumber = Math.max(...numbers);
      result.counterSet = result.highestNumber; // Next ID will be highestNumber + 1
    } else {
      // No readable IDs found - this is normal for unmigrated databases
      result.counterSet = 0;
    }
    
    // Set counter in Firebase
    await writeData(`/system/idCounters/${entityType}`, {
      count: result.counterSet,
      lastUpdated: new Date().toISOString(),
      initializedAt: new Date().toISOString(),
      existingRecordsFound: result.existingRecords,
      readableIdsFound: numbers.length
    });
    
    console.log(`  ✅ Counter set to ${result.counterSet}`);
    console.log(`     Existing records: ${result.existingRecords}`);
    console.log(`     Readable IDs found: ${numbers.length}`);
    
  } catch (error) {
    console.error(`  ❌ Error initializing ${entityType}:`, error);
    result.status = 'error';
  }
  
  return result;
}

async function initializeAllCounters() {
  console.log('\n====================================');
  console.log('ID COUNTER INITIALIZATION');
  console.log('====================================');
  
  const entities: Array<{ type: EntityType; path: string }> = [
    { type: 'PARENT', path: '/parents' },
    { type: 'TEACHER', path: '/teachers' },
    { type: 'CLASS', path: '/classes' },
    { type: 'STUDENT', path: '/students' },
    { type: 'EXERCISE', path: '/exercises' },
    { type: 'ASSIGNED', path: '/assignedExercises' },
    { type: 'RESULT', path: '/ExerciseResults' },
    { type: 'ANNOUNCEMENT', path: '/announcements' },
    { type: 'TASK', path: '/tasks' },
  ];
  
  const results: InitResult[] = [];
  
  for (const entity of entities) {
    const result = await initializeCounter(entity.type, entity.path);
    results.push(result);
  }
  
  // Print summary
  console.log('\n====================================');
  console.log('INITIALIZATION SUMMARY');
  console.log('====================================\n');
  
  results.forEach(result => {
    const statusIcon = result.status === 'success' ? '✅' :
                      result.status === 'warning' ? '⚠️' : '❌';
    
    console.log(`${statusIcon} ${result.entityType}:`);
    console.log(`   Existing Records: ${result.existingRecords}`);
    console.log(`   Highest ID: ${result.highestNumber}`);
    console.log(`   Counter Set To: ${result.counterSet}`);
  });
  
  const allSuccess = results.every(r => r.status !== 'error');
  
  if (allSuccess) {
    console.log('\n✅ All counters initialized successfully!');
    console.log('\nNext steps:');
    console.log('1. Create new records to test ID generation');
    console.log('2. Run "npx ts-node scripts/test-id-system.ts" to verify');
    console.log('3. When ready, run "npx ts-node scripts/migrate-ids.ts" to migrate old IDs\n');
  } else {
    console.log('\n⚠️  Some counters failed to initialize.');
    console.log('Review the errors above and try again.\n');
  }
}

// Run if executed directly
if (require.main === module) {
  initializeAllCounters()
    .then(() => {
      console.log('✅ Initialization complete.\n');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Initialization failed:', error);
      process.exit(1);
    });
}

export default initializeAllCounters;

