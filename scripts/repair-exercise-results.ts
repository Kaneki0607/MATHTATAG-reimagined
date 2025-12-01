/**
 * ============================================================================
 * ExerciseResult Data Repair Script
 * ============================================================================
 * 
 * This script repairs inconsistencies in existing ExerciseResult records
 * by applying the unified validation and repair utilities.
 * 
 * Features:
 * - Scans all ExerciseResults in the database
 * - Identifies records with inconsistencies
 * - Repairs and updates broken records
 * - Generates detailed reports
 * - Supports dry-run mode (preview without saving)
 * - Can target specific students or exercises
 * 
 * Usage:
 * ```
 * # Dry run (no changes, just report)
 * npx ts-node scripts/repair-exercise-results.ts --dry-run
 * 
 * # Repair all records
 * npx ts-node scripts/repair-exercise-results.ts --apply
 * 
 * # Repair specific student
 * npx ts-node scripts/repair-exercise-results.ts --apply --student S-ABC-0001
 * 
 * # Repair specific exercise
 * npx ts-node scripts/repair-exercise-results.ts --apply --exercise E-XYZ-0001
 * 
 * # Verbose output
 * npx ts-node scripts/repair-exercise-results.ts --dry-run --verbose
 * ```
 */

import { readData, writeData } from '../lib/firebase-database';
import {
    ExerciseResult,
    getInconsistencySummary,
    validateAndRepairExerciseResult
} from '../lib/result-validation-utils';

// ============================================================================
// CONFIGURATION
// ============================================================================

interface RepairOptions {
  dryRun: boolean;
  verbose: boolean;
  studentId?: string;
  exerciseId?: string;
  limit?: number;
  outputFile?: string;
}

// ============================================================================
// COMMAND-LINE ARGUMENT PARSING
// ============================================================================

function parseArgs(): RepairOptions {
  const args = process.argv.slice(2);
  
  const options: RepairOptions = {
    dryRun: true,
    verbose: false
  };
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    switch (arg) {
      case '--apply':
        options.dryRun = false;
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--verbose':
      case '-v':
        options.verbose = true;
        break;
      case '--student':
        options.studentId = args[++i];
        break;
      case '--exercise':
        options.exerciseId = args[++i];
        break;
      case '--limit':
        options.limit = parseInt(args[++i], 10);
        break;
      case '--output':
      case '-o':
        options.outputFile = args[++i];
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
        break;
      default:
        console.error(`Unknown argument: ${arg}`);
        printHelp();
        process.exit(1);
    }
  }
  
  return options;
}

function printHelp() {
  console.log(`
ExerciseResult Data Repair Script

Usage:
  npx ts-node scripts/repair-exercise-results.ts [options]

Options:
  --dry-run         Preview changes without applying them (default)
  --apply           Apply repairs to the database
  --verbose, -v     Show detailed output
  --student ID      Only repair results for specific student
  --exercise ID     Only repair results for specific exercise
  --limit N         Limit number of records to process
  --output FILE     Write report to file
  --help, -h        Show this help message

Examples:
  # Preview all inconsistencies
  npx ts-node scripts/repair-exercise-results.ts --dry-run --verbose

  # Repair all records
  npx ts-node scripts/repair-exercise-results.ts --apply

  # Repair specific student's results
  npx ts-node scripts/repair-exercise-results.ts --apply --student S-ABC-0001

  # Repair and save report
  npx ts-node scripts/repair-exercise-results.ts --apply --output report.txt
`);
}

// ============================================================================
// DATA FETCHING
// ============================================================================

async function fetchExerciseResults(options: RepairOptions): Promise<ExerciseResult[]> {
  console.log('Fetching exercise results from database...');
  
  const result = await readData('/ExerciseResults');
  
  if (!result.success || !result.data) {
    throw new Error('Failed to fetch exercise results: ' + result.error);
  }
  
  const allResults = Object.values(result.data) as ExerciseResult[];
  console.log(`Found ${allResults.length} total exercise results`);
  
  // Apply filters
  let filtered = allResults;
  
  if (options.studentId) {
    filtered = filtered.filter(r => r.studentId === options.studentId);
    console.log(`Filtered to ${filtered.length} results for student ${options.studentId}`);
  }
  
  if (options.exerciseId) {
    filtered = filtered.filter(r => 
      r.exerciseResultId.includes(options.exerciseId!) ||
      (r as any).exerciseInfo?.exerciseId === options.exerciseId
    );
    console.log(`Filtered to ${filtered.length} results for exercise ${options.exerciseId}`);
  }
  
  if (options.limit) {
    filtered = filtered.slice(0, options.limit);
    console.log(`Limited to ${filtered.length} results`);
  }
  
  return filtered;
}

// ============================================================================
// REPAIR LOGIC
// ============================================================================

async function repairSingleResult(
  result: ExerciseResult,
  options: RepairOptions
): Promise<{
  success: boolean;
  hadIssues: boolean;
  correctionCount: number;
  error?: string;
}> {
  try {
    const { result: repaired, validation } = validateAndRepairExerciseResult(result, {
      verbose: options.verbose
    });
    
    const hadIssues = validation.correctedFields.length > 0 || validation.errors.length > 0;
    const correctionCount = validation.correctedFields.length;
    
    if (hadIssues) {
      if (options.verbose) {
        console.log(`\n${getInconsistencySummary(result)}\n`);
      }
      
      if (!options.dryRun) {
        // Write repaired data back to database
        const writeResult = await writeData(
          `/ExerciseResults/${result.exerciseResultId}`,
          repaired
        );
        
        if (!writeResult.success) {
          return {
            success: false,
            hadIssues: true,
            correctionCount,
            error: writeResult.error
          };
        }
        
        console.log(`✓ Repaired ${result.exerciseResultId} (${correctionCount} corrections)`);
      } else {
        console.log(`○ Would repair ${result.exerciseResultId} (${correctionCount} corrections)`);
      }
    }
    
    return {
      success: true,
      hadIssues,
      correctionCount
    };
  } catch (error) {
    return {
      success: false,
      hadIssues: true,
      correctionCount: 0,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function repairAllResults(
  results: ExerciseResult[],
  options: RepairOptions
): Promise<RepairReport> {
  const report: RepairReport = {
    totalProcessed: 0,
    totalWithIssues: 0,
    totalCorrected: 0,
    totalFailed: 0,
    totalCorrections: 0,
    details: [],
    startTime: new Date(),
    endTime: new Date(),
    dryRun: options.dryRun
  };
  
  console.log('\n' + '='.repeat(80));
  console.log(options.dryRun ? 'DRY RUN - No changes will be made' : 'REPAIR MODE - Changes will be applied');
  console.log('='.repeat(80) + '\n');
  
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    report.totalProcessed++;
    
    if (!options.verbose) {
      // Progress indicator
      if (report.totalProcessed % 10 === 0 || report.totalProcessed === results.length) {
        process.stdout.write(`\rProgress: ${report.totalProcessed}/${results.length}`);
      }
    }
    
    const repairResult = await repairSingleResult(result, options);
    
    if (repairResult.hadIssues) {
      report.totalWithIssues++;
    }
    
    if (repairResult.success && repairResult.hadIssues) {
      report.totalCorrected++;
      report.totalCorrections += repairResult.correctionCount;
    } else if (!repairResult.success) {
      report.totalFailed++;
    }
    
    report.details.push({
      resultId: result.exerciseResultId,
      studentId: result.studentId,
      hadIssues: repairResult.hadIssues,
      correctionCount: repairResult.correctionCount,
      success: repairResult.success,
      error: repairResult.error
    });
  }
  
  report.endTime = new Date();
  
  if (!options.verbose) {
    process.stdout.write('\n'); // Clear progress line
  }
  
  return report;
}

// ============================================================================
// REPORTING
// ============================================================================

interface RepairReport {
  totalProcessed: number;
  totalWithIssues: number;
  totalCorrected: number;
  totalFailed: number;
  totalCorrections: number;
  details: Array<{
    resultId: string;
    studentId: string;
    hadIssues: boolean;
    correctionCount: number;
    success: boolean;
    error?: string;
  }>;
  startTime: Date;
  endTime: Date;
  dryRun: boolean;
}

function printReport(report: RepairReport, options: RepairOptions): string {
  const duration = (report.endTime.getTime() - report.startTime.getTime()) / 1000;
  
  const lines: string[] = [];
  
  lines.push('');
  lines.push('='.repeat(80));
  lines.push('REPAIR REPORT');
  lines.push('='.repeat(80));
  lines.push('');
  lines.push(`Mode: ${report.dryRun ? 'DRY RUN (no changes made)' : 'REPAIR (changes applied)'}`);
  lines.push(`Start time: ${report.startTime.toISOString()}`);
  lines.push(`End time: ${report.endTime.toISOString()}`);
  lines.push(`Duration: ${duration.toFixed(2)}s`);
  lines.push('');
  lines.push('SUMMARY:');
  lines.push(`  Total processed: ${report.totalProcessed}`);
  lines.push(`  Records with issues: ${report.totalWithIssues}`);
  lines.push(`  Records corrected: ${report.totalCorrected}`);
  lines.push(`  Failed to repair: ${report.totalFailed}`);
  lines.push(`  Total corrections applied: ${report.totalCorrections}`);
  lines.push('');
  
  const cleanRecords = report.totalProcessed - report.totalWithIssues;
  const successRate = report.totalProcessed > 0 
    ? ((cleanRecords + report.totalCorrected) / report.totalProcessed * 100).toFixed(1)
    : '0.0';
  
  lines.push('QUALITY METRICS:');
  lines.push(`  Clean records (no issues): ${cleanRecords} (${(cleanRecords / report.totalProcessed * 100).toFixed(1)}%)`);
  lines.push(`  Success rate: ${successRate}%`);
  lines.push('');
  
  if (report.totalFailed > 0) {
    lines.push('FAILED REPAIRS:');
    report.details
      .filter(d => !d.success)
      .forEach(d => {
        lines.push(`  - ${d.resultId} (${d.studentId}): ${d.error}`);
      });
    lines.push('');
  }
  
  if (options.verbose && report.totalWithIssues > 0) {
    lines.push('DETAILED RESULTS:');
    report.details
      .filter(d => d.hadIssues)
      .forEach(d => {
        const status = d.success ? '✓' : '✗';
        lines.push(`  ${status} ${d.resultId} - ${d.correctionCount} corrections`);
      });
    lines.push('');
  }
  
  lines.push('='.repeat(80));
  lines.push('');
  
  return lines.join('\n');
}

async function saveReport(report: RepairReport, options: RepairOptions, filename: string) {
  const fs = require('fs');
  const reportText = printReport(report, options);
  
  fs.writeFileSync(filename, reportText, 'utf8');
  console.log(`Report saved to: ${filename}`);
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function main() {
  console.log('ExerciseResult Data Repair Script');
  console.log('==================================\n');
  
  try {
    const options = parseArgs();
    
    console.log('Configuration:');
    console.log(`  Mode: ${options.dryRun ? 'Dry Run (preview only)' : 'Apply (will modify data)'}`);
    console.log(`  Verbose: ${options.verbose}`);
    if (options.studentId) console.log(`  Student filter: ${options.studentId}`);
    if (options.exerciseId) console.log(`  Exercise filter: ${options.exerciseId}`);
    if (options.limit) console.log(`  Limit: ${options.limit}`);
    if (options.outputFile) console.log(`  Output file: ${options.outputFile}`);
    console.log('');
    
    // Fetch data
    const results = await fetchExerciseResults(options);
    
    if (results.length === 0) {
      console.log('No exercise results found matching the criteria.');
      return;
    }
    
    // Repair
    const report = await repairAllResults(results, options);
    
    // Print report
    const reportText = printReport(report, options);
    console.log(reportText);
    
    // Save report if requested
    if (options.outputFile) {
      await saveReport(report, options, options.outputFile);
    }
    
    // Exit with appropriate code
    if (report.totalFailed > 0) {
      console.error(`\n⚠️  ${report.totalFailed} record(s) failed to repair`);
      process.exit(1);
    } else if (report.totalWithIssues > 0 && options.dryRun) {
      console.log(`\n✓ Found ${report.totalWithIssues} record(s) with issues`);
      console.log('Run with --apply to fix them');
      process.exit(0);
    } else if (report.totalCorrected > 0) {
      console.log(`\n✓ Successfully repaired ${report.totalCorrected} record(s)`);
      process.exit(0);
    } else {
      console.log('\n✓ All records are clean - no repairs needed');
      process.exit(0);
    }
    
  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    if (error instanceof Error) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

export { main as repairExerciseResults };

