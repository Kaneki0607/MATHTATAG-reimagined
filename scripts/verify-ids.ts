/**
 * Database ID Verification Script
 * 
 * Checks the current state of IDs in your database without making any changes.
 * Use this to see what needs to be migrated and verify after migration.
 * 
 * Usage: npx ts-node scripts/verify-ids.ts
 */

import { readData } from '../lib/firebase-database';
import { parseId } from '../lib/id-generator';

interface IDAnalysis {
  entity: string;
  path: string;
  total: number;
  readable: number;
  legacy: number;
  invalid: number;
  examples: {
    readable: string[];
    legacy: string[];
  };
}

async function analyzeEntityIds(entityName: string, path: string): Promise<IDAnalysis> {
  const analysis: IDAnalysis = {
    entity: entityName,
    path,
    total: 0,
    readable: 0,
    legacy: 0,
    invalid: 0,
    examples: {
      readable: [],
      legacy: []
    }
  };
  
  try {
    const result = await readData(path);
    
    if (!result.data) {
      console.log(`⚠️  No data found at ${path}`);
      return analysis;
    }
    
    const ids = Object.keys(result.data);
    analysis.total = ids.length;
    
    ids.forEach(id => {
      const parsed = parseId(id);
      
      // Hierarchical result format: E-GTK-0004-R-ABC-0001
      if (id.match(/^[A-Z]-[A-Z]{3}-[0-9]{4}-R-[A-Z]{3}-[0-9]{4}$/)) {
        analysis.readable++;
        if (analysis.examples.readable.length < 3) {
          analysis.examples.readable.push(id);
        }
      }
      // Hierarchical question format: E-GTK-0004-Q001
      else if (id.match(/^[A-Z]-[A-Z]{3}-[0-9]{4}-Q[0-9]{3}$/)) {
        analysis.readable++;
        if (analysis.examples.readable.length < 3) {
          analysis.examples.readable.push(id);
        }
      }
      // New readable format: PREFIX-XXX-XXXX (e.g., T-ABA-0001, S-XYZ-0023)
      else if (parsed.isValid && id.match(/^[A-Z]-[A-Z]{3}-[0-9]{4}$/)) {
        // New readable format with random code
        analysis.readable++;
        if (analysis.examples.readable.length < 3) {
          analysis.examples.readable.push(id);
        }
      } else if (parsed.isValid && id.match(/^[A-Z]+-([A-Z]+-)?[0-9]{4}$/)) {
        // Old readable format: ENTITY-0001 or ENTITY-SECTION-0001
        analysis.readable++;
        if (analysis.examples.readable.length < 3) {
          analysis.examples.readable.push(id);
        }
      } else if (id.startsWith('-') || id.includes('_')) {
        // Legacy Firebase format
        analysis.legacy++;
        if (analysis.examples.legacy.length < 3) {
          analysis.examples.legacy.push(id);
        }
      } else {
        // Invalid/other format
        analysis.invalid++;
      }
    });
    
  } catch (error) {
    console.error(`Error analyzing ${entityName}:`, error);
  }
  
  return analysis;
}

async function verifyAllIds() {
  console.log('\n====================================');
  console.log('DATABASE ID VERIFICATION');
  console.log('====================================\n');
  
  const entities = [
    { name: 'Teachers', path: '/teachers' },
    { name: 'Classes', path: '/classes' },
    { name: 'Sections', path: '/sections' },
    { name: 'Parents', path: '/parents' },
    { name: 'Students', path: '/students' },
    { name: 'Exercises', path: '/exercises' },
    { name: 'Assigned Exercises', path: '/assignedExercises' },
    { name: 'Exercise Results', path: '/ExerciseResults' },
    { name: 'Announcements', path: '/announcements' },
    { name: 'Tasks', path: '/tasks' },
  ];
  
  const analyses: IDAnalysis[] = [];
  
  for (const entity of entities) {
    const analysis = await analyzeEntityIds(entity.name, entity.path);
    analyses.push(analysis);
  }
  
  // Print results
  console.log('ID Format Analysis:\n');
  
  let totalReadable = 0;
  let totalLegacy = 0;
  let totalRecords = 0;
  
  analyses.forEach(analysis => {
    totalReadable += analysis.readable;
    totalLegacy += analysis.legacy;
    totalRecords += analysis.total;
    
    const status = analysis.legacy === 0 ? '✅' : 
                   analysis.readable === 0 ? '❌' : '⚠️';
    
    console.log(`${status} ${analysis.entity}:`);
    console.log(`   Total: ${analysis.total}`);
    console.log(`   Readable: ${analysis.readable} (${analysis.total > 0 ? Math.round(analysis.readable / analysis.total * 100) : 0}%)`);
    console.log(`   Legacy: ${analysis.legacy} (${analysis.total > 0 ? Math.round(analysis.legacy / analysis.total * 100) : 0}%)`);
    
    if (analysis.examples.readable.length > 0) {
      console.log(`   Examples (readable): ${analysis.examples.readable.join(', ')}`);
    }
    if (analysis.examples.legacy.length > 0) {
      console.log(`   Examples (legacy): ${analysis.examples.legacy.join(', ')}`);
    }
    console.log('');
  });
  
  // Overall summary
  console.log('====================================');
  console.log('OVERALL SUMMARY');
  console.log('====================================\n');
  console.log(`Total Records: ${totalRecords}`);
  console.log(`Readable IDs: ${totalReadable} (${totalRecords > 0 ? Math.round(totalReadable / totalRecords * 100) : 0}%)`);
  console.log(`Legacy IDs: ${totalLegacy} (${totalRecords > 0 ? Math.round(totalLegacy / totalRecords * 100) : 0}%)`);
  
  if (totalLegacy === 0) {
    console.log('\n✅ All IDs are in readable format!');
    console.log('No migration needed.\n');
  } else {
    console.log(`\n⚠️  ${totalLegacy} records need migration.`);
    console.log('Run "npx ts-node scripts/migrate-ids.ts" to migrate.\n');
  }
  
  console.log('====================================\n');
}

// Run if executed directly
if (require.main === module) {
  verifyAllIds()
    .then(() => {
      console.log('✅ Verification complete.\n');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Verification failed:', error);
      process.exit(1);
    });
}

export default verifyAllIds;

