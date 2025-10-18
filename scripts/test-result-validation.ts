/**
 * ============================================================================
 * ExerciseResult Validation Test Suite
 * ============================================================================
 * 
 * Comprehensive test cases for the result validation system.
 * Tests answer comparison, validation, and repair functions.
 * 
 * Usage:
 * ```
 * npx ts-node scripts/test-result-validation.ts
 * ```
 */

import {
    compareAnswers,
    ExerciseResult,
    normalizeAnswer,
    normalizeArrayAnswer,
    QuestionResult,
    recalculateResultsSummary,
    validateAndRepairExerciseResult,
    validateAndRepairQuestionResult
} from '../lib/result-validation-utils';

// ============================================================================
// TEST UTILITIES
// ============================================================================

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  details?: any;
}

const testResults: TestResult[] = [];

function test(name: string, fn: () => void | Promise<void>) {
  return async () => {
    try {
      await fn();
      testResults.push({ name, passed: true });
      console.log(`✓ ${name}`);
    } catch (error) {
      testResults.push({
        name,
        passed: false,
        error: error instanceof Error ? error.message : String(error)
      });
      console.log(`✗ ${name}`);
      console.log(`  Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
}

function assertEquals(actual: any, expected: any, message?: string) {
  const actualStr = JSON.stringify(actual);
  const expectedStr = JSON.stringify(expected);
  
  if (actualStr !== expectedStr) {
    throw new Error(
      message || `Expected ${expectedStr} but got ${actualStr}`
    );
  }
}

function assertTrue(condition: boolean, message?: string) {
  if (!condition) {
    throw new Error(message || 'Expected true but got false');
  }
}

function assertFalse(condition: boolean, message?: string) {
  if (condition) {
    throw new Error(message || 'Expected false but got true');
  }
}

// ============================================================================
// TEST SUITES
// ============================================================================

// -------------------- Normalization Tests --------------------

const testNormalization = test('Normalization: removes whitespace and lowercases', () => {
  assertEquals(normalizeAnswer('  Hello World  '), 'helloworld');
  assertEquals(normalizeAnswer('ABC'), 'abc');
  assertEquals(normalizeAnswer('  123  '), '123');
});

const testNormalizationUnicode = test('Normalization: handles Unicode', () => {
  assertEquals(normalizeAnswer('café'), 'café'); // Should normalize to NFKC
  assertEquals(normalizeAnswer('ñ'), 'ñ');
});

const testNormalizationDelimiters = test('Normalization: standardizes delimiters', () => {
  assertEquals(normalizeAnswer('a;b;c'), 'a,b,c');
  assertEquals(normalizeAnswer('1,,2,,,3'), '1,2,3');
});

const testNormalizationArray = test('Normalization: handles arrays', () => {
  assertEquals(normalizeArrayAnswer(['A', 'B', 'C']), ['a', 'b', 'c']);
  assertEquals(normalizeArrayAnswer('a,b,c'), ['a', 'b', 'c']);
  assertEquals(normalizeArrayAnswer('a , b , c'), ['a', 'b', 'c']);
});

// -------------------- Answer Comparison Tests --------------------

const testCompareMultipleChoice = test('Compare: multiple-choice questions', () => {
  assertTrue(compareAnswers('multiple-choice', 'A', 'A'));
  assertTrue(compareAnswers('multiple-choice', 'a', 'A')); // Case insensitive
  assertTrue(compareAnswers('multiple-choice', ' A ', 'A')); // Whitespace
  assertFalse(compareAnswers('multiple-choice', 'A', 'B'));
  assertFalse(compareAnswers('multiple-choice', '', 'A'));
});

const testCompareReorder = test('Compare: reorder questions (order matters)', () => {
  // Exact match
  assertTrue(compareAnswers('reorder', '1,2,3,4', '1,2,3,4'));
  
  // With whitespace
  assertTrue(compareAnswers('reorder', '1, 2, 3, 4', '1,2,3,4'));
  
  // Wrong order
  assertFalse(compareAnswers('reorder', '2,1,3,4', '1,2,3,4'));
  
  // Different length
  assertFalse(compareAnswers('reorder', '1,2,3', '1,2,3,4'));
  
  // Empty
  assertFalse(compareAnswers('reorder', '', '1,2,3,4'));
});

const testCompareReorderComplex = test('Compare: reorder with complex strings', () => {
  const correct = 'assets_images_stockimages_numbers_numbers1100_3 , assets_images_stockimages_numbers_numbers1100_4 , assets_images_stockimages_numbers_numbers1100_8 , assets_images_stockimages_numbers_numbers1100_10';
  const student = 'assets_images_stockimages_numbers_numbers1100_3 , assets_images_stockimages_numbers_numbers1100_4 , assets_images_stockimages_numbers_numbers1100_8 , assets_images_stockimages_numbers_numbers1100_10';
  
  assertTrue(compareAnswers('re-order', student, correct));
});

const testCompareMatching = test('Compare: matching questions (set comparison)', () => {
  // Order doesn't matter for pairs
  const correct = '3 → Tatlo; 5 → Lima; 7 → Pito';
  const student1 = '3 → Tatlo; 5 → Lima; 7 → Pito';
  const student2 = '5 → Lima; 3 → Tatlo; 7 → Pito'; // Different order
  
  assertTrue(compareAnswers('matching', student1, correct));
  assertTrue(compareAnswers('matching', student2, correct));
  
  // Wrong answer
  assertFalse(compareAnswers('matching', '3 → Lima; 5 → Tatlo; 7 → Pito', correct));
});

const testCompareFillInBlank = test('Compare: fill-in-blank questions', () => {
  assertTrue(compareAnswers('fill-in-blank', '42', '42'));
  assertTrue(compareAnswers('fill-in-blank', ' 42 ', '42'));
  assertTrue(compareAnswers('fill-in-blank', 'forty-two', 'Forty-Two')); // Case insensitive
  assertFalse(compareAnswers('fill-in-blank', '42', '43'));
});

// -------------------- Question Result Validation Tests --------------------

const testValidateCorrectQuestion = test('Validate: correct question with matching history', () => {
  const qr: QuestionResult = {
    questionId: 'Q001',
    questionNumber: 1,
    questionType: 'multiple-choice',
    questionText: 'What is 2+2?',
    correctAnswer: 'C. 4',
    studentAnswer: 'C. 4',
    isCorrect: true,
    attempts: 1,
    attemptHistory: [
      {
        attemptNumber: 1,
        selectedAnswer: 'C. 4',
        isCorrect: true,
        timeStamp: '2025-10-17T10:00:00Z'
      }
    ],
    timeSpentSeconds: 5,
    ttsPlayed: false,
    ttsPlayCount: 0,
    interactionTypes: []
  };
  
  const { result, validation } = validateAndRepairQuestionResult(qr);
  
  assertTrue(validation.isValid, 'Should be valid');
  assertEquals(validation.errors.length, 0, 'Should have no errors');
  assertEquals(validation.correctedFields.length, 0, 'Should need no corrections');
  assertEquals(result.isCorrect, true);
  assertEquals(result.attempts, 1);
});

const testValidateInconsistentAttempts = test('Validate: fixes attempts count mismatch', () => {
  const qr: QuestionResult = {
    questionId: 'Q002',
    questionNumber: 2,
    questionType: 'multiple-choice',
    correctAnswer: 'B',
    studentAnswer: 'B',
    isCorrect: true,
    attempts: 5, // Wrong! Should be 2
    attemptHistory: [
      {
        attemptNumber: 1,
        selectedAnswer: 'A',
        isCorrect: false,
        timeStamp: '2025-10-17T10:00:00Z'
      },
      {
        attemptNumber: 2,
        selectedAnswer: 'B',
        isCorrect: true,
        timeStamp: '2025-10-17T10:00:05Z'
      }
    ],
    timeSpentSeconds: 10,
    questionText: 'Test',
    ttsPlayed: false,
    ttsPlayCount: 0,
    interactionTypes: []
  };
  
  const { result, validation } = validateAndRepairQuestionResult(qr);
  
  assertEquals(result.attempts, 2, 'Should correct attempts to match history length');
  assertTrue(validation.correctedFields.includes('attempts'));
});

const testValidateInconsistentIsCorrect = test('Validate: fixes isCorrect mismatch', () => {
  const qr: QuestionResult = {
    questionId: 'Q003',
    questionNumber: 3,
    questionType: 'multiple-choice',
    correctAnswer: 'C',
    studentAnswer: 'C',
    isCorrect: false, // Wrong! Last attempt is correct
    attempts: 2,
    attemptHistory: [
      {
        attemptNumber: 1,
        selectedAnswer: 'A',
        isCorrect: false,
        timeStamp: '2025-10-17T10:00:00Z'
      },
      {
        attemptNumber: 2,
        selectedAnswer: 'C',
        isCorrect: true,
        timeStamp: '2025-10-17T10:00:05Z'
      }
    ],
    timeSpentSeconds: 10,
    questionText: 'Test',
    ttsPlayed: false,
    ttsPlayCount: 0,
    interactionTypes: []
  };
  
  const { result, validation } = validateAndRepairQuestionResult(qr);
  
  assertEquals(result.isCorrect, true, 'Should correct isCorrect to match last attempt');
  assertTrue(validation.correctedFields.includes('isCorrect'));
});

const testValidateReorderQuestion = test('Validate: reorder question with exact match', () => {
  const correctAnswer = 'assets_images_stockimages_numbers_numbers1100_3 , assets_images_stockimages_numbers_numbers1100_4 , assets_images_stockimages_numbers_numbers1100_8 , assets_images_stockimages_numbers_numbers1100_10';
  
  const qr: QuestionResult = {
    questionId: 'Q010',
    questionNumber: 10,
    questionType: 're-order',
    questionText: 'Arrange numbers',
    correctAnswer,
    studentAnswer: correctAnswer, // Exact match
    isCorrect: false, // Wrong! Should be true
    attempts: 1,
    attemptHistory: [
      {
        attemptNumber: 1,
        selectedAnswer: correctAnswer,
        isCorrect: true,
        timeStamp: '2025-10-17T10:00:00Z'
      }
    ],
    timeSpentSeconds: 10,
    ttsPlayed: false,
    ttsPlayCount: 0,
    interactionTypes: []
  };
  
  const { result, validation } = validateAndRepairQuestionResult(qr);
  
  assertEquals(result.isCorrect, true, 'Should mark reorder as correct when answers match');
  assertTrue(validation.correctedFields.includes('isCorrect'));
});

const testValidateStudentAnswerMismatch = test('Validate: fixes studentAnswer mismatch with last attempt', () => {
  const qr: QuestionResult = {
    questionId: 'Q004',
    questionNumber: 4,
    questionType: 'multiple-choice',
    correctAnswer: 'D',
    studentAnswer: 'A', // Wrong! Should be C (last attempt)
    isCorrect: false,
    attempts: 3,
    attemptHistory: [
      {
        attemptNumber: 1,
        selectedAnswer: 'A',
        isCorrect: false,
        timeStamp: '2025-10-17T10:00:00Z'
      },
      {
        attemptNumber: 2,
        selectedAnswer: 'B',
        isCorrect: false,
        timeStamp: '2025-10-17T10:00:05Z'
      },
      {
        attemptNumber: 3,
        selectedAnswer: 'C',
        isCorrect: false,
        timeStamp: '2025-10-17T10:00:10Z'
      }
    ],
    timeSpentSeconds: 15,
    questionText: 'Test',
    ttsPlayed: false,
    ttsPlayCount: 0,
    interactionTypes: []
  };
  
  const { result, validation } = validateAndRepairQuestionResult(qr);
  
  assertEquals(result.studentAnswer, 'C', 'Should match last attempt');
  assertTrue(validation.correctedFields.includes('studentAnswer'));
});

// -------------------- Results Summary Tests --------------------

const testRecalculateSummary = test('Summary: recalculates all fields correctly', () => {
  const questionResults: QuestionResult[] = [
    {
      questionId: 'Q1',
      questionNumber: 1,
      questionType: 'multiple-choice',
      questionText: 'Q1',
      correctAnswer: 'A',
      studentAnswer: 'A',
      isCorrect: true,
      attempts: 1,
      attemptHistory: [
        { attemptNumber: 1, selectedAnswer: 'A', isCorrect: true, timeStamp: '2025-10-17T10:00:00Z' }
      ],
      timeSpentSeconds: 5,
      ttsPlayed: false,
      ttsPlayCount: 0,
      interactionTypes: []
    },
    {
      questionId: 'Q2',
      questionNumber: 2,
      questionType: 'multiple-choice',
      questionText: 'Q2',
      correctAnswer: 'B',
      studentAnswer: 'C',
      isCorrect: false,
      attempts: 2,
      attemptHistory: [
        { attemptNumber: 1, selectedAnswer: 'A', isCorrect: false, timeStamp: '2025-10-17T10:01:00Z' },
        { attemptNumber: 2, selectedAnswer: 'C', isCorrect: false, timeStamp: '2025-10-17T10:01:05Z' }
      ],
      timeSpentSeconds: 10,
      ttsPlayed: false,
      ttsPlayCount: 0,
      interactionTypes: []
    },
    {
      questionId: 'Q3',
      questionNumber: 3,
      questionType: 'multiple-choice',
      questionText: 'Q3',
      correctAnswer: 'C',
      studentAnswer: 'C',
      isCorrect: true,
      attempts: 1,
      attemptHistory: [
        { attemptNumber: 1, selectedAnswer: 'C', isCorrect: true, timeStamp: '2025-10-17T10:02:00Z' }
      ],
      timeSpentSeconds: 8,
      ttsPlayed: false,
      ttsPlayCount: 0,
      interactionTypes: []
    }
  ];
  
  const summary = recalculateResultsSummary(questionResults);
  
  assertEquals(summary.totalItems, 3);
  assertEquals(summary.totalCorrect, 2);
  assertEquals(summary.totalIncorrect, 1);
  assertEquals(summary.totalAttempts, 4); // 1 + 2 + 1
  assertEquals(summary.meanAttemptsPerItem, 1.3); // 4/3 rounded
  assertEquals(summary.totalTimeSpentSeconds, 23); // 5 + 10 + 8
  assertEquals(summary.meanPercentageScore, 67); // 2/3 = 66.67% rounded to 67
  assertEquals(summary.score, 2);
  assertEquals(summary.remarks, 'Fair');
});

// -------------------- Full Exercise Result Tests --------------------

const testValidateFullResult = test('Full Result: validates and repairs complete ExerciseResult', () => {
  const exerciseResult: ExerciseResult = {
    exerciseResultId: 'E-TEST-0001-R-STU-0001',
    studentId: 'S-STU-0001',
    questionResults: [
      {
        questionId: 'Q1',
        questionNumber: 1,
        questionType: 'multiple-choice',
        questionText: 'Question 1',
        correctAnswer: 'A',
        studentAnswer: 'A',
        isCorrect: false, // Wrong! Should be true
        attempts: 5, // Wrong! Should be 1
        attemptHistory: [
          { attemptNumber: 1, selectedAnswer: 'A', isCorrect: true, timeStamp: '2025-10-17T10:00:00Z' }
        ],
        timeSpentSeconds: 5,
        ttsPlayed: false,
        ttsPlayCount: 0,
        interactionTypes: []
      },
      {
        questionId: 'Q2',
        questionNumber: 2,
        questionType: 'reorder',
        questionText: 'Question 2',
        correctAnswer: '1,2,3,4',
        studentAnswer: '1,2,3,4',
        isCorrect: false, // Wrong! Should be true
        attempts: 1,
        attemptHistory: [
          { attemptNumber: 1, selectedAnswer: '1,2,3,4', isCorrect: true, timeStamp: '2025-10-17T10:01:00Z' }
        ],
        timeSpentSeconds: 10,
        ttsPlayed: false,
        ttsPlayCount: 0,
        interactionTypes: []
      }
    ],
    resultsSummary: {
      totalItems: 2,
      totalCorrect: 0, // Wrong! Should be 2
      totalIncorrect: 2, // Wrong! Should be 0
      totalAttempts: 6, // Wrong! Should be 2
      meanAttemptsPerItem: 3, // Wrong! Should be 1
      meanPercentageScore: 0, // Wrong! Should be 100
      totalTimeSpentSeconds: 15,
      meanTimePerItemSeconds: 7.5,
      score: 0, // Wrong! Should be 2
      remarks: 'Poor' // Wrong! Should be 'Excellent'
    }
  };
  
  const { result, validation } = validateAndRepairExerciseResult(exerciseResult, { verbose: false });
  
  // Check question results were fixed
  assertEquals(result.questionResults[0].isCorrect, true);
  assertEquals(result.questionResults[0].attempts, 1);
  assertEquals(result.questionResults[1].isCorrect, true);
  
  // Check summary was recalculated
  assertEquals(result.resultsSummary.totalCorrect, 2);
  assertEquals(result.resultsSummary.totalIncorrect, 0);
  assertEquals(result.resultsSummary.totalAttempts, 2);
  assertEquals(result.resultsSummary.meanPercentageScore, 100);
  assertEquals(result.resultsSummary.score, 2);
  assertEquals(result.resultsSummary.remarks, 'Excellent');
  
  // Check validation report
  assertTrue(validation.correctedFields.length > 0);
});

// -------------------- User-Provided Example Test --------------------

const testUserProvidedExample = test('User Example: E-RVM-0010-R-LQU-0266 Q8 and Q10', () => {
  // Question 8 from user's example
  const q8: QuestionResult = {
    questionId: 'E-RVM-0010-Q010',
    questionNumber: 8,
    questionType: 're-order',
    questionText: 'Ayusin ang mga numero mula sa pinakamaliit hanggang pinakamalaki.',
    correctAnswer: 'assets_images_stockimages_numbers_numbers1100_3 , assets_images_stockimages_numbers_numbers1100_4 , assets_images_stockimages_numbers_numbers1100_8 , assets_images_stockimages_numbers_numbers1100_10',
    studentAnswer: 'assets_images_stockimages_numbers_numbers1100_3 , assets_images_stockimages_numbers_numbers1100_4 , assets_images_stockimages_numbers_numbers1100_8 , assets_images_stockimages_numbers_numbers1100_10',
    isCorrect: false, // BUG: Should be true!
    attempts: 1,
    attemptHistory: [
      {
        attemptNumber: 1,
        selectedAnswer: 'assets_images_stockimages_numbers_numbers1100_3 , assets_images_stockimages_numbers_numbers1100_4 , assets_images_stockimages_numbers_numbers1100_8 , assets_images_stockimages_numbers_numbers1100_10',
        isCorrect: true,
        timeStamp: '2025-10-17T23:47:32.613Z'
      }
    ],
    timeSpentSeconds: 9,
    ttsPlayed: false,
    ttsPlayCount: 0,
    interactionTypes: ['answer_change']
  };
  
  // Question 10 from user's example
  const q10: QuestionResult = {
    questionId: 'E-RVM-0010-Q012',
    questionNumber: 10,
    questionType: 're-order',
    questionText: 'Ayusin ang mga bilang ng mga bagay mula sa pinakakaunti hanggang sa pinakamarami.',
    correctAnswer: '1 Apple , 2 Apples , 3 Apples , 4 Apples',
    studentAnswer: '1 Apple , 2 Apples , 3 Apples , 4 Apples',
    isCorrect: false, // BUG: Should be true!
    attempts: 1,
    attemptHistory: [
      {
        attemptNumber: 1,
        selectedAnswer: '1 Apple , 2 Apples , 3 Apples , 4 Apples',
        isCorrect: true,
        timeStamp: '2025-10-17T23:47:32.613Z'
      }
    ],
    timeSpentSeconds: 1,
    ttsPlayed: false,
    ttsPlayCount: 0,
    interactionTypes: ['answer_change']
  };
  
  // Validate Q8
  const { result: fixed8, validation: val8 } = validateAndRepairQuestionResult(q8);
  assertEquals(fixed8.isCorrect, true, 'Q8 should be marked correct');
  assertTrue(val8.correctedFields.includes('isCorrect'), 'Q8 isCorrect should be corrected');
  
  // Validate Q10
  const { result: fixed10, validation: val10 } = validateAndRepairQuestionResult(q10);
  assertEquals(fixed10.isCorrect, true, 'Q10 should be marked correct');
  assertTrue(val10.correctedFields.includes('isCorrect'), 'Q10 isCorrect should be corrected');
});

// ============================================================================
// TEST RUNNER
// ============================================================================

async function runAllTests() {
  console.log('');
  console.log('='.repeat(80));
  console.log('EXERCISERESULT VALIDATION TEST SUITE');
  console.log('='.repeat(80));
  console.log('');
  
  // Normalization tests
  console.log('--- Normalization Tests ---');
  await testNormalization();
  await testNormalizationUnicode();
  await testNormalizationDelimiters();
  await testNormalizationArray();
  
  // Answer comparison tests
  console.log('\n--- Answer Comparison Tests ---');
  await testCompareMultipleChoice();
  await testCompareReorder();
  await testCompareReorderComplex();
  await testCompareMatching();
  await testCompareFillInBlank();
  
  // Question result validation tests
  console.log('\n--- Question Result Validation Tests ---');
  await testValidateCorrectQuestion();
  await testValidateInconsistentAttempts();
  await testValidateInconsistentIsCorrect();
  await testValidateReorderQuestion();
  await testValidateStudentAnswerMismatch();
  
  // Results summary tests
  console.log('\n--- Results Summary Tests ---');
  await testRecalculateSummary();
  
  // Full exercise result tests
  console.log('\n--- Full Exercise Result Tests ---');
  await testValidateFullResult();
  
  // User-provided example tests
  console.log('\n--- User-Provided Example Tests ---');
  await testUserProvidedExample();
  
  // Print summary
  console.log('');
  console.log('='.repeat(80));
  console.log('TEST SUMMARY');
  console.log('='.repeat(80));
  
  const passed = testResults.filter(t => t.passed).length;
  const failed = testResults.filter(t => !t.passed).length;
  const total = testResults.length;
  
  console.log(`Total: ${total}`);
  console.log(`Passed: ${passed} ✓`);
  console.log(`Failed: ${failed} ✗`);
  console.log(`Success rate: ${((passed / total) * 100).toFixed(1)}%`);
  
  if (failed > 0) {
    console.log('\nFailed tests:');
    testResults.filter(t => !t.passed).forEach(t => {
      console.log(`  ✗ ${t.name}`);
      console.log(`    ${t.error}`);
    });
  }
  
  console.log('='.repeat(80));
  console.log('');
  
  return failed === 0;
}

// Run tests
if (require.main === module) {
  runAllTests().then(success => {
    process.exit(success ? 0 : 1);
  });
}

export { runAllTests };

