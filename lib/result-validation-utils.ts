/**
 * ============================================================================
 * ExerciseResult Validation & Repair Utilities
 * ============================================================================
 * 
 * This module provides unified validation, comparison, and repair functions
 * for ExerciseResult data to ensure consistency across:
 * - attemptHistory (single source of truth)
 * - attempts (must equal attemptHistory.length)
 * - isCorrect (must match last attempt's isCorrect)
 * - studentAnswer (must match last attempt's selectedAnswer)
 * - resultsSummary (must match aggregated questionResults)
 * 
 * Key Features:
 * - Unified answer comparison with proper normalization
 * - Support for all question types (multiple-choice, reorder, matching, fill-in-blank)
 * - Automatic correction of inconsistencies
 * - Validation and repair of entire ExerciseResult objects
 * 
 * Usage:
 * ```typescript
 * import { validateAndRepairExerciseResult } from './result-validation-utils';
 * 
 * const repairedResult = validateAndRepairExerciseResult(exerciseResult);
 * ```
 */

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface AttemptHistory {
  attemptNumber: number;
  selectedAnswer: string;
  isCorrect: boolean;
  timeStamp: string;
}

export interface QuestionResult {
  questionId: string;
  questionNumber: number;
  questionText: string;
  questionType: string;
  correctAnswer: string;
  studentAnswer: string;
  isCorrect: boolean;
  attempts: number;
  attemptHistory: AttemptHistory[];
  timeSpentSeconds: number;
  choices?: string[];
  ttsPlayed: boolean;
  ttsPlayCount: number;
  interactionTypes: string[];
  // For identification questions with alternative answers
  altAnswers?: string[];
  caseSensitive?: boolean;
  [key: string]: any;
}

export interface ResultsSummary {
  totalItems: number;
  totalCorrect: number;
  totalIncorrect: number;
  totalAttempts: number;
  meanAttemptsPerItem: number;
  meanPercentageScore: number;
  meanTimePerItemSeconds: number;
  totalTimeSpentSeconds: number;
  score: number;
  remarks: string;
}

export interface ExerciseResult {
  exerciseResultId: string;
  studentId: string;
  questionResults: QuestionResult[];
  resultsSummary: ResultsSummary;
  [key: string]: any;
}

// ============================================================================
// ANSWER NORMALIZATION
// ============================================================================

/**
 * Normalize an answer string for comparison
 * - Converts to lowercase
 * - Removes extra whitespace
 * - Normalizes Unicode characters
 * - Standardizes comma/semicolon delimiters
 */
export function normalizeAnswer(answer: string | null | undefined): string {
  if (!answer) return '';
  
  return answer
    .toString()
    .normalize('NFKC') // Unicode normalization
    .replace(/\s+/g, '') // Remove all whitespace
    .replace(/[;]+/g, ',') // Convert semicolons to commas
    .replace(/,+/g, ',') // Consolidate multiple commas
    .replace(/^,|,$/g, '') // Remove leading/trailing commas
    .toLowerCase();
}

/**
 * Normalize an array-based answer (for reorder questions)
 */
export function normalizeArrayAnswer(answer: string | string[]): string[] {
  if (Array.isArray(answer)) {
    return answer.map(item => normalizeAnswer(item));
  }
  
  // If it's a string, split by common delimiters
  const normalized = normalizeAnswer(answer);
  if (!normalized) return [];
  
  return normalized.split(',').filter(item => item.length > 0);
}

// ============================================================================
// ANSWER COMPARISON
// ============================================================================

/**
 * Compare two answers based on question type
 * Returns true if answers match, false otherwise
 * 
 * @param questionType - Type of question (identification, multiple-choice, etc.)
 * @param studentAnswer - The student's answer
 * @param correctAnswer - The correct answer
 * @param options - Additional options like altAnswers and caseSensitive
 */
export function compareAnswers(
  questionType: string,
  studentAnswer: string,
  correctAnswer: string,
  options?: {
    altAnswers?: string[];
    caseSensitive?: boolean;
  }
): boolean {
  // Handle empty answers
  if (!studentAnswer || studentAnswer.trim() === '') {
    return false;
  }
  
  if (!correctAnswer || correctAnswer.trim() === '') {
    console.warn('[compareAnswers] Correct answer is empty');
    return false;
  }
  
  const type = questionType.toLowerCase();
  const { altAnswers, caseSensitive = false } = options || {};
  
  // For identification/fill-in-blank questions, check altAnswers
  if (type === 'identification' || type === 'fill-in-blank' || type === 'fill') {
    // Normalize function that respects case sensitivity
    const norm = (s: string) => {
      const trimmed = s.trim();
      return caseSensitive ? trimmed : trimmed.toLowerCase();
    };
    
    const normalizedStudent = norm(studentAnswer);
    const normalizedCorrect = norm(correctAnswer);
    
    // Check against main answer first
    if (normalizedStudent === normalizedCorrect) {
      return true;
    }
    
    // Check against alternative answers if provided
    if (altAnswers && altAnswers.length > 0) {
      return altAnswers.some(altAnswer => 
        norm(altAnswer) === normalizedStudent
      );
    }
    
    return false;
  }
  
  // For reorder/sort questions, compare as ordered arrays
  if (type === 'reorder' || type === 're-order' || type === 'sort' || type === 'ordering') {
    const studentArray = normalizeArrayAnswer(studentAnswer);
    const correctArray = normalizeArrayAnswer(correctAnswer);
    
    // Arrays must be same length
    if (studentArray.length !== correctArray.length) {
      return false;
    }
    
    // Compare each element in order
    return studentArray.every((item, index) => item === correctArray[index]);
  }
  
  // For matching questions, compare as sets (order doesn't matter for pairs)
  if (type === 'matching' || type === 'match') {
    // Split by semicolon or newline for matching pairs
    const studentPairs = studentAnswer
      .split(/[;\n]/)
      .map(p => normalizeAnswer(p))
      .filter(p => p.length > 0)
      .sort();
    
    const correctPairs = correctAnswer
      .split(/[;\n]/)
      .map(p => normalizeAnswer(p))
      .filter(p => p.length > 0)
      .sort();
    
    if (studentPairs.length !== correctPairs.length) {
      return false;
    }
    
    return studentPairs.every((pair, index) => pair === correctPairs[index]);
  }
  
  // For all other question types (multiple-choice, etc.)
  // Use simple normalized string comparison
  return normalizeAnswer(studentAnswer) === normalizeAnswer(correctAnswer);
}

// ============================================================================
// QUESTION RESULT VALIDATION
// ============================================================================

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  correctedFields: string[];
}

/**
 * Validate and repair a single QuestionResult
 * Ensures attemptHistory is the single source of truth
 */
export function validateAndRepairQuestionResult(
  questionResult: QuestionResult
): { result: QuestionResult; validation: ValidationResult } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const correctedFields: string[] = [];
  
  const repaired = { 
    ...questionResult,
    // Ensure required fields have defaults
    timeSpentSeconds: questionResult.timeSpentSeconds ?? 0,
    ttsPlayed: questionResult.ttsPlayed ?? false,
    ttsPlayCount: questionResult.ttsPlayCount ?? 0,
    interactionTypes: questionResult.interactionTypes ?? []
  };
  const history = repaired.attemptHistory || [];
  
  // RULE 1: attempts must equal attemptHistory.length
  const expectedAttempts = history.length;
  if (repaired.attempts !== expectedAttempts) {
    warnings.push(
      `attempts mismatch: was ${repaired.attempts}, should be ${expectedAttempts}`
    );
    repaired.attempts = expectedAttempts;
    correctedFields.push('attempts');
  }
  
  // RULE 2: studentAnswer must match last attempt's selectedAnswer
  if (history.length > 0) {
    const lastAttempt = history[history.length - 1];
    const expectedAnswer = lastAttempt.selectedAnswer || '';
    
    if (repaired.studentAnswer !== expectedAnswer) {
      warnings.push(
        `studentAnswer mismatch: was "${repaired.studentAnswer}", should be "${expectedAnswer}"`
      );
      repaired.studentAnswer = expectedAnswer;
      correctedFields.push('studentAnswer');
    }
    
    // RULE 3: Revalidate isCorrect for each attempt in history
    const revalidatedHistory = history.map((attempt, index) => {
      const revalidatedIsCorrect = compareAnswers(
        repaired.questionType,
        attempt.selectedAnswer,
        repaired.correctAnswer,
        {
          altAnswers: repaired.altAnswers,
          caseSensitive: repaired.caseSensitive
        }
      );
      
      if (attempt.isCorrect !== revalidatedIsCorrect) {
        warnings.push(
          `attemptHistory[${index}].isCorrect mismatch: was ${attempt.isCorrect}, should be ${revalidatedIsCorrect}`
        );
        correctedFields.push(`attemptHistory[${index}].isCorrect`);
        return { ...attempt, isCorrect: revalidatedIsCorrect };
      }
      
      return attempt;
    });
    
    repaired.attemptHistory = revalidatedHistory;
    
    // RULE 4: isCorrect must match last attempt's isCorrect
    const lastAttemptIsCorrect = revalidatedHistory[revalidatedHistory.length - 1].isCorrect;
    if (repaired.isCorrect !== lastAttemptIsCorrect) {
      warnings.push(
        `isCorrect mismatch: was ${repaired.isCorrect}, should be ${lastAttemptIsCorrect}`
      );
      repaired.isCorrect = lastAttemptIsCorrect;
      correctedFields.push('isCorrect');
    }
  } else {
    // No attempts - question was not answered
    if (repaired.isCorrect === true) {
      errors.push('Question marked correct but has no attempt history');
      repaired.isCorrect = false;
      correctedFields.push('isCorrect');
    }
    
    if (repaired.studentAnswer && repaired.studentAnswer.trim() !== '') {
      warnings.push('Question has studentAnswer but no attempt history');
    }
  }
  
  // RULE 5: Validate correctAnswer is not empty
  if (!repaired.correctAnswer || repaired.correctAnswer.trim() === '') {
    errors.push('correctAnswer is empty or undefined');
  }
  
  return {
    result: repaired,
    validation: {
      isValid: errors.length === 0,
      errors,
      warnings,
      correctedFields
    }
  };
}

// ============================================================================
// RESULTS SUMMARY VALIDATION
// ============================================================================

/**
 * Calculate remarks based on percentage score
 */
export function calculateRemarks(percentageScore: number): string {
  if (percentageScore >= 90) return 'Excellent';
  if (percentageScore >= 80) return 'Very Good';
  if (percentageScore >= 75) return 'Good';
  if (percentageScore >= 60) return 'Fair';
  if (percentageScore >= 50) return 'Needs Improvement';
  return 'Poor';
}

/**
 * Recalculate resultsSummary from questionResults
 */
export function recalculateResultsSummary(
  questionResults: QuestionResult[],
  existingSummary?: ResultsSummary
): ResultsSummary {
  const totalItems = questionResults.length;
  const totalCorrect = questionResults.filter(qr => qr.isCorrect === true).length;
  const totalIncorrect = questionResults.filter(qr => qr.isCorrect === false).length;
  
  // Calculate from attemptHistory (single source of truth)
  const totalAttempts = questionResults.reduce(
    (sum, qr) => sum + (qr.attemptHistory?.length || 0),
    0
  );
  
  const totalTimeSpentSeconds = questionResults.reduce(
    (sum, qr) => sum + (qr.timeSpentSeconds || 0),
    0
  );
  
  const meanAttemptsPerItem = totalItems > 0 ? totalAttempts / totalItems : 0;
  const meanTimePerItemSeconds = totalItems > 0 ? totalTimeSpentSeconds / totalItems : 0;
  const meanPercentageScore = totalItems > 0 ? Math.round((totalCorrect / totalItems) * 100) : 0;
  const remarks = calculateRemarks(meanPercentageScore);
  
  return {
    totalItems,
    totalCorrect,
    totalIncorrect,
    totalAttempts,
    meanAttemptsPerItem: Math.round(meanAttemptsPerItem * 10) / 10, // Round to 1 decimal
    meanPercentageScore,
    meanTimePerItemSeconds: Math.round(meanTimePerItemSeconds * 10) / 10, // Always return a number
    totalTimeSpentSeconds: totalTimeSpentSeconds, // Always return a number
    score: totalCorrect,
    remarks
  };
}

/**
 * Validate resultsSummary against questionResults
 */
export function validateResultsSummary(
  summary: ResultsSummary,
  questionResults: QuestionResult[]
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const correctedFields: string[] = [];
  
  const expected = recalculateResultsSummary(questionResults, summary);
  
  // Check each field
  if (summary.totalItems !== expected.totalItems) {
    errors.push(`totalItems: ${summary.totalItems} != ${expected.totalItems}`);
    correctedFields.push('totalItems');
  }
  
  if (summary.totalCorrect !== expected.totalCorrect) {
    errors.push(`totalCorrect: ${summary.totalCorrect} != ${expected.totalCorrect}`);
    correctedFields.push('totalCorrect');
  }
  
  if (summary.totalIncorrect !== expected.totalIncorrect) {
    errors.push(`totalIncorrect: ${summary.totalIncorrect} != ${expected.totalIncorrect}`);
    correctedFields.push('totalIncorrect');
  }
  
  if (summary.totalAttempts !== expected.totalAttempts) {
    errors.push(`totalAttempts: ${summary.totalAttempts} != ${expected.totalAttempts}`);
    correctedFields.push('totalAttempts');
  }
  
  if (summary.score !== expected.score) {
    warnings.push(`score: ${summary.score} != ${expected.score}`);
    correctedFields.push('score');
  }
  
  if (summary.meanPercentageScore !== expected.meanPercentageScore) {
    warnings.push(`meanPercentageScore: ${summary.meanPercentageScore} != ${expected.meanPercentageScore}`);
    correctedFields.push('meanPercentageScore');
  }
  
  // Allow small floating point differences for means
  const meanAttemptsDiff = Math.abs(summary.meanAttemptsPerItem - expected.meanAttemptsPerItem);
  if (meanAttemptsDiff > 0.1) {
    warnings.push(`meanAttemptsPerItem: ${summary.meanAttemptsPerItem} != ${expected.meanAttemptsPerItem}`);
    correctedFields.push('meanAttemptsPerItem');
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    correctedFields
  };
}

// ============================================================================
// EXERCISE RESULT VALIDATION
// ============================================================================

/**
 * Validate and repair an entire ExerciseResult
 */
export function validateAndRepairExerciseResult(
  exerciseResult: ExerciseResult,
  options: { verbose?: boolean } = {}
): {
  result: ExerciseResult;
  validation: ValidationResult;
  questionValidations: Map<string, ValidationResult>;
} {
  const { verbose = false } = options;
  
  const allErrors: string[] = [];
  const allWarnings: string[] = [];
  const allCorrectedFields: string[] = [];
  const questionValidations = new Map<string, ValidationResult>();
  
  // Validate and repair each question result
  const repairedQuestionResults = exerciseResult.questionResults.map(qr => {
    const { result, validation } = validateAndRepairQuestionResult(qr);
    
    questionValidations.set(qr.questionId, validation);
    
    if (validation.errors.length > 0) {
      allErrors.push(`Q${qr.questionNumber} (${qr.questionId}): ${validation.errors.join(', ')}`);
    }
    
    if (validation.warnings.length > 0 && verbose) {
      allWarnings.push(`Q${qr.questionNumber} (${qr.questionId}): ${validation.warnings.join(', ')}`);
    }
    
    allCorrectedFields.push(...validation.correctedFields.map(f => `${qr.questionId}.${f}`));
    
    return result;
  });
  
  // Recalculate and validate summary
  const repairedSummary = recalculateResultsSummary(repairedQuestionResults, exerciseResult.resultsSummary);
  const summaryValidation = validateResultsSummary(exerciseResult.resultsSummary, repairedQuestionResults);
  
  if (summaryValidation.errors.length > 0) {
    allErrors.push(`Summary: ${summaryValidation.errors.join(', ')}`);
  }
  
  if (summaryValidation.warnings.length > 0 && verbose) {
    allWarnings.push(`Summary: ${summaryValidation.warnings.join(', ')}`);
  }
  
  allCorrectedFields.push(...summaryValidation.correctedFields.map(f => `resultsSummary.${f}`));
  
  return {
    result: {
      ...exerciseResult,
      questionResults: repairedQuestionResults,
      resultsSummary: repairedSummary
    },
    validation: {
      isValid: allErrors.length === 0,
      errors: allErrors,
      warnings: allWarnings,
      correctedFields: allCorrectedFields
    },
    questionValidations
  };
}

// ============================================================================
// BATCH VALIDATION
// ============================================================================

/**
 * Validate and repair multiple exercise results
 */
export function batchValidateAndRepair(
  exerciseResults: ExerciseResult[],
  options: { verbose?: boolean; stopOnError?: boolean } = {}
): {
  results: ExerciseResult[];
  summary: {
    total: number;
    valid: number;
    repaired: number;
    failed: number;
    totalCorrections: number;
  };
  details: Map<string, ValidationResult>;
} {
  const { verbose = false, stopOnError = false } = options;
  
  const results: ExerciseResult[] = [];
  const details = new Map<string, ValidationResult>();
  
  let valid = 0;
  let repaired = 0;
  let failed = 0;
  let totalCorrections = 0;
  
  for (const exerciseResult of exerciseResults) {
    try {
      const { result, validation } = validateAndRepairExerciseResult(exerciseResult, { verbose });
      
      results.push(result);
      details.set(exerciseResult.exerciseResultId, validation);
      
      if (validation.isValid && validation.correctedFields.length === 0) {
        valid++;
      } else if (validation.correctedFields.length > 0) {
        repaired++;
        totalCorrections += validation.correctedFields.length;
      } else {
        failed++;
      }
    } catch (error) {
      failed++;
      details.set(exerciseResult.exerciseResultId, {
        isValid: false,
        errors: [error instanceof Error ? error.message : String(error)],
        warnings: [],
        correctedFields: []
      });
      
      if (stopOnError) {
        throw error;
      }
      
      // Keep original if repair failed
      results.push(exerciseResult);
    }
  }
  
  return {
    results,
    summary: {
      total: exerciseResults.length,
      valid,
      repaired,
      failed,
      totalCorrections
    },
    details
  };
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Check if an exercise result has any inconsistencies
 */
export function hasInconsistencies(exerciseResult: ExerciseResult): boolean {
  const { validation } = validateAndRepairExerciseResult(exerciseResult, { verbose: false });
  return validation.correctedFields.length > 0 || validation.errors.length > 0;
}

/**
 * Get a summary of inconsistencies in an exercise result
 */
export function getInconsistencySummary(exerciseResult: ExerciseResult): string {
  const { validation, questionValidations } = validateAndRepairExerciseResult(exerciseResult, { verbose: true });
  
  const lines: string[] = [];
  lines.push(`Exercise Result: ${exerciseResult.exerciseResultId}`);
  lines.push(`Student: ${exerciseResult.studentId}`);
  lines.push('');
  
  if (validation.errors.length > 0) {
    lines.push('ERRORS:');
    validation.errors.forEach(e => lines.push(`  - ${e}`));
    lines.push('');
  }
  
  if (validation.warnings.length > 0) {
    lines.push('WARNINGS:');
    validation.warnings.forEach(w => lines.push(`  - ${w}`));
    lines.push('');
  }
  
  if (validation.correctedFields.length > 0) {
    lines.push(`CORRECTIONS: ${validation.correctedFields.length} fields`);
    validation.correctedFields.forEach(f => lines.push(`  - ${f}`));
  }
  
  return lines.join('\n');
}

