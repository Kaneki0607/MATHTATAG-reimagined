/**
 * ============================================================================
 * Test User-Provided Example Data
 * ============================================================================
 * 
 * Tests the validation and repair logic on the specific example provided
 * by the user: E-RVM-0010-R-LQU-0266
 * 
 * Usage:
 * ```
 * npx ts-node scripts/test-user-example.ts
 * ```
 */

import {
    ExerciseResult,
    validateAndRepairExerciseResult
} from '../lib/result-validation-utils';

// ============================================================================
// USER'S EXAMPLE DATA (Exact copy from user's query)
// ============================================================================

const userExampleData: ExerciseResult = {
  "exerciseResultId": "E-RVM-0010-R-LQU-0266",
  "studentId": "LQU",
  "assignedExerciseId": "A-MLX-0012",
  "assignmentMetadata": {
    "acceptLateSubmissions": true,
    "acceptingStatus": "open",
    "assignedAt": "2025-10-17T05:58:42.199Z",
    "assignedExerciseId": "A-MLX-0012",
    "assignmentId": "A-MLX-0012",
    "classId": "C-GDX-0002",
    "deadline": "2025-10-18T05:58:37.077Z",
    "isLateSubmission": false,
    "parentId": "P-PGR-0028"
  } as any,
  "deviceInfo": {
    "appVersion": "1.0.3",
    "buildProfile": "Unknown",
    "deviceInfo": "vivo 1915 (Android 12)",
    "deviceModel": "vivo 1915 (Android 12)",
    "environment": "production",
    "expoVersion": "54.0.0",
    "networkType": "unknown",
    "platform": "android",
    "platformVersion": "31",
    "updateId": "12c34b65-c600-4919-852c-cd98da126491"
  } as any,
  "exerciseInfo": {
    "category": "Counting",
    "description": "Count numbers up to 50",
    "exerciseId": "E-RVM-0010",
    "timeLimitPerItem": 120,
    "title": "Counting Game",
    "totalQuestions": 10
  } as any,
  "exerciseSession": {
    "completedAt": "2025-10-17T23:47:32.869Z",
    "startedAt": "2025-10-17T23:45:46.626Z",
    "timestampSubmitted": 1760744852869,
    "totalDurationSeconds": 108
  } as any,
  "questionResults": [
    {
      "attemptHistory": [
        {
          "attemptNumber": 1,
          "isCorrect": false,
          "selectedAnswer": "D. 30",
          "timeStamp": "2025-10-17T23:45:51.754Z"
        },
        {
          "attemptNumber": 2,
          "isCorrect": false,
          "selectedAnswer": "A. 25",
          "timeStamp": "2025-10-17T23:45:53.234Z"
        },
        {
          "attemptNumber": 3,
          "isCorrect": false,
          "selectedAnswer": "C. 20",
          "timeStamp": "2025-10-17T23:45:54.605Z"
        }
      ],
      "attempts": 3,
      "choices": [
        "A. 25",
        "B. 35",
        "C. 20",
        "D. 30"
      ],
      "correctAnswer": "B. 35",
      "isCorrect": false,
      "questionId": "E-RVM-0010-Q001",
      "questionNumber": 1,
      "questionType": "multiple-choice",
      "questionText": "Alin ang mas malaki, 25 o 35?",
      "studentAnswer": "C. 20",
      "timeSpentSeconds": 9,
      "ttsPlayCount": 0,
      "ttsPlayed": false,
      "interactionTypes": []
    },
    {
      "attemptHistory": [
        {
          "attemptNumber": 1,
          "isCorrect": true,
          "selectedAnswer": "C. 45",
          "timeStamp": "2025-10-17T23:46:07.132Z"
        }
      ],
      "attempts": 1,
      "choices": [
        "A. 23",
        "B. 34",
        "C. 45",
        "D. 12"
      ],
      "correctAnswer": "C. 45",
      "interactionTypes": [
        "option_click",
        "answer_change"
      ],
      "isCorrect": true,
      "questionId": "E-RVM-0010-Q003",
      "questionNumber": 2,
      "questionType": "multiple-choice",
      "questionText": "Alin ang tamang bilang?",
      "studentAnswer": "C. 45",
      "timeSpentSeconds": 11,
      "ttsPlayCount": 0,
      "ttsPlayed": false
    },
    {
      "attemptHistory": [
        {
          "attemptNumber": 1,
          "isCorrect": false,
          "selectedAnswer": "21",
          "timeStamp": "2025-10-17T23:46:14.197Z"
        },
        {
          "attemptNumber": 2,
          "isCorrect": false,
          "selectedAnswer": "212",
          "timeStamp": "2025-10-17T23:46:17.414Z"
        },
        {
          "attemptNumber": 3,
          "isCorrect": false,
          "selectedAnswer": "2123",
          "timeStamp": "2025-10-17T23:46:21.786Z"
        }
      ],
      "attempts": 3,
      "correctAnswer": "42",
      "interactionTypes": [
        "answer_change"
      ],
      "isCorrect": false,
      "questionId": "E-RVM-0010-Q004",
      "questionNumber": 3,
      "questionType": "fill-in-blank",
      "questionText": "Anong numero ang nasa larawan?",
      "studentAnswer": "2123",
      "timeSpentSeconds": 14,
      "ttsPlayCount": 0,
      "ttsPlayed": false
    },
    {
      "attemptHistory": [
        {
          "attemptNumber": 1,
          "isCorrect": true,
          "selectedAnswer": "50",
          "timeStamp": "2025-10-17T23:46:28.145Z"
        }
      ],
      "attempts": 1,
      "correctAnswer": "50",
      "interactionTypes": [
        "answer_change"
      ],
      "isCorrect": true,
      "questionId": "E-RVM-0010-Q006",
      "questionNumber": 4,
      "questionType": "fill-in-blank",
      "questionText": "Anong numero ang susunod sa 49?",
      "studentAnswer": "50",
      "timeSpentSeconds": 5,
      "ttsPlayCount": 0,
      "ttsPlayed": false
    },
    {
      "attemptHistory": [
        {
          "attemptNumber": 1,
          "isCorrect": false,
          "selectedAnswer": "No pairs matched",
          "timeStamp": "2025-10-17T23:46:29.165Z"
        },
        {
          "attemptNumber": 2,
          "isCorrect": false,
          "selectedAnswer": "3 → Lima",
          "timeStamp": "2025-10-17T23:46:32.626Z"
        },
        {
          "attemptNumber": 3,
          "isCorrect": false,
          "selectedAnswer": "5 → Tatlo",
          "timeStamp": "2025-10-17T23:46:34.684Z"
        }
      ],
      "attempts": 3,
      "choices": [
        "A. 3 → Tatlo",
        "B. 5 → Lima",
        "C. 7 → Pito"
      ],
      "correctAnswer": "3 → Tatlo; 5 → Lima; 7 → Pito",
      "interactionTypes": [
        "answer_change"
      ],
      "isCorrect": false,
      "questionId": "E-RVM-0010-Q007",
      "questionNumber": 5,
      "questionType": "matching",
      "questionText": "Pagtabihin ang mga numero at ang kanilang pangalan.",
      "studentAnswer": "7 → Lima",
      "timeSpentSeconds": 8,
      "ttsPlayCount": 0,
      "ttsPlayed": false
    },
    {
      "attemptHistory": [
        {
          "attemptNumber": 1,
          "isCorrect": false,
          "selectedAnswer": "No pairs matched",
          "timeStamp": "2025-10-17T23:46:38.158Z"
        },
        {
          "attemptNumber": 2,
          "isCorrect": true,
          "selectedAnswer": "2 Apples → 2; 4 Candies → 4; 5 Pencils → 5",
          "timeStamp": "2025-10-17T23:46:43.412Z"
        }
      ],
      "attempts": 2,
      "choices": [
        "A. 2 Apples → 2",
        "B. 4 Candies → 4",
        "C. 5 Pencils → 5"
      ],
      "correctAnswer": "2 Apples → 2; 4 Candies → 4; 5 Pencils → 5",
      "interactionTypes": [
        "answer_change"
      ],
      "isCorrect": true,
      "questionId": "E-RVM-0010-Q008",
      "questionNumber": 6,
      "questionType": "matching",
      "questionText": "Pagtabihin ang bilang ng bagay at ang tamang numero.",
      "studentAnswer": "2 Apples → 2; 4 Candies → 4; 5 Pencils → 5",
      "timeSpentSeconds": 5,
      "ttsPlayCount": 0,
      "ttsPlayed": false
    },
    {
      "attemptHistory": [
        {
          "attemptNumber": 1,
          "isCorrect": false,
          "selectedAnswer": "No pairs matched",
          "timeStamp": "2025-10-17T23:46:44.436Z"
        },
        {
          "attemptNumber": 2,
          "isCorrect": false,
          "selectedAnswer": "Sampung Piso → 20",
          "timeStamp": "2025-10-17T23:46:50.813Z"
        },
        {
          "attemptNumber": 3,
          "isCorrect": false,
          "selectedAnswer": "Limampung Piso → 10",
          "timeStamp": "2025-10-17T23:46:52.500Z"
        }
      ],
      "attempts": 3,
      "choices": [
        "A. Sampung Piso → 10",
        "B. Dalawampung Piso → 20",
        "C. Limampung Piso → 50"
      ],
      "correctAnswer": "Sampung Piso → 10; Dalawampung Piso → 20; Limampung Piso → 50",
      "interactionTypes": [
        "answer_change"
      ],
      "isCorrect": false,
      "questionId": "E-RVM-0010-Q009",
      "questionNumber": 7,
      "questionType": "matching",
      "questionText": "Pagtabihin ang halaga ng pera.",
      "studentAnswer": "Dalawampung Piso → 50",
      "timeSpentSeconds": 10,
      "ttsPlayCount": 0,
      "ttsPlayed": false
    },
    {
      "attemptHistory": [
        {
          "attemptNumber": 1,
          "isCorrect": false,
          "selectedAnswer": "assets_images_stockimages_numbers_numbers1100_3 , assets_images_stockimages_numbers_numbers1100_4 , assets_images_stockimages_numbers_numbers1100_8 , assets_images_stockimages_numbers_numbers1100_10",
          "timeStamp": "2025-10-17T23:47:32.613Z"
        }
      ],
      "attempts": 1,
      "choices": [
        "1. assets_images_stockimages_numbers_numbers1100_4",
        "2. assets_images_stockimages_numbers_numbers1100_8",
        "3. assets_images_stockimages_numbers_numbers1100_10",
        "4. assets_images_stockimages_numbers_numbers1100_3"
      ],
      "correctAnswer": "assets_images_stockimages_numbers_numbers1100_3 , assets_images_stockimages_numbers_numbers1100_4 , assets_images_stockimages_numbers_numbers1100_8 , assets_images_stockimages_numbers_numbers1100_10",
      "interactionTypes": [
        "answer_change"
      ],
      "isCorrect": false,
      "questionId": "E-RVM-0010-Q010",
      "questionNumber": 8,
      "questionType": "re-order",
      "questionText": "Ayusin ang mga numero mula sa pinakamaliit hanggang pinakamalaki.",
      "studentAnswer": "assets_images_stockimages_numbers_numbers1100_3 , assets_images_stockimages_numbers_numbers1100_4 , assets_images_stockimages_numbers_numbers1100_8 , assets_images_stockimages_numbers_numbers1100_10",
      "timeSpentSeconds": 9,
      "ttsPlayCount": 0,
      "ttsPlayed": false
    },
    {
      "attemptHistory": [
        {
          "attemptNumber": 1,
          "isCorrect": false,
          "selectedAnswer": "40 pesos , 16 Pesos , 23 Pesos , 27 pesos",
          "timeStamp": "2025-10-17T23:47:11.322Z"
        },
        {
          "attemptNumber": 2,
          "isCorrect": false,
          "selectedAnswer": "40 pesos , 16 Pesos , 27 pesos , 23 Pesos",
          "timeStamp": "2025-10-17T23:47:15.660Z"
        },
        {
          "attemptNumber": 3,
          "isCorrect": false,
          "selectedAnswer": "40 pesos , 23 Pesos , 27 pesos , 16 Pesos",
          "timeStamp": "2025-10-17T23:47:19.566Z"
        }
      ],
      "attempts": 3,
      "choices": [
        "1. 40 pesos",
        "2. 16 Pesos",
        "3. 27 pesos",
        "4. 23 Pesos"
      ],
      "correctAnswer": "16 Pesos , 23 Pesos , 27 pesos , 40 pesos",
      "interactionTypes": [
        "answer_change"
      ],
      "isCorrect": false,
      "questionId": "E-RVM-0010-Q011",
      "questionNumber": 9,
      "questionType": "re-order",
      "questionText": "Ayusin ang pera mula sa pinakamababa hanggang pinakamataas.",
      "studentAnswer": "40 pesos , 23 Pesos , 27 pesos , 16 Pesos",
      "timeSpentSeconds": 18,
      "ttsPlayCount": 0,
      "ttsPlayed": false
    },
    {
      "attemptHistory": [
        {
          "attemptNumber": 1,
          "isCorrect": false,
          "selectedAnswer": "1 Apple , 2 Apples , 3 Apples , 4 Apples",
          "timeStamp": "2025-10-17T23:47:32.613Z"
        }
      ],
      "attempts": 1,
      "choices": [
        "1. 4 Apples",
        "2. 1 Apple",
        "3. 2 Apples",
        "4. 3 Apples"
      ],
      "correctAnswer": "1 Apple , 2 Apples , 3 Apples , 4 Apples",
      "interactionTypes": [
        "answer_change"
      ],
      "isCorrect": false,
      "questionId": "E-RVM-0010-Q012",
      "questionNumber": 10,
      "questionType": "re-order",
      "questionText": "Ayusin ang mga bilang ng mga bagay mula sa pinakakaunti hanggang sa pinakamarami.",
      "studentAnswer": "1 Apple , 2 Apples , 3 Apples , 4 Apples",
      "timeSpentSeconds": 1,
      "ttsPlayCount": 0,
      "ttsPlayed": false
    }
  ],
  "resultsSummary": {
    "meanAttemptsPerItem": 2.1,
    "meanPercentageScore": 30,
    "meanTimePerItemSeconds": 10.8,
    "remarks": "Needs Improvement",
    "score": 3,
    "totalAttempts": 21,
    "totalCorrect": 3,
    "totalIncorrect": 7,
    "totalItems": 10,
    "totalTimeSpentSeconds": 108
  },
  "studentInfo": {
    "gradeSection": "Section LSM",
    "name": "Kobe Lat",
    "sex": "male",
    "studentId": "S-DUL-0028"
  } as any
};

// ============================================================================
// TEST EXECUTION
// ============================================================================

function runTest() {
  console.log('');
  console.log('='.repeat(80));
  console.log('TESTING USER-PROVIDED EXAMPLE: E-RVM-0010-R-LQU-0266');
  console.log('='.repeat(80));
  console.log('');
  
  console.log('BEFORE REPAIR:');
  console.log('-'.repeat(80));
  console.log('Student: LQU (Kobe Lat)');
  console.log(`Exercise: ${userExampleData.exerciseInfo.title}`);
  console.log('');
  
  console.log('Results Summary (ORIGINAL):');
  console.log(`  Total Items: ${userExampleData.resultsSummary.totalItems}`);
  console.log(`  Total Correct: ${userExampleData.resultsSummary.totalCorrect}`);
  console.log(`  Total Incorrect: ${userExampleData.resultsSummary.totalIncorrect}`);
  console.log(`  Total Attempts: ${userExampleData.resultsSummary.totalAttempts}`);
  console.log(`  Mean Percentage Score: ${userExampleData.resultsSummary.meanPercentageScore}%`);
  console.log(`  Remarks: ${userExampleData.resultsSummary.remarks}`);
  console.log('');
  
  console.log('Question Results (ORIGINAL - focusing on problematic ones):');
  
  // Q8 - Should be correct but marked wrong
  const q8 = userExampleData.questionResults[7];
  console.log(`  Q8 (${q8.questionId}):`);
  console.log(`    Type: ${q8.questionType}`);
  console.log(`    isCorrect: ${q8.isCorrect} ❌ (BUG: Should be TRUE)`);
  console.log(`    attempts: ${q8.attempts}`);
  console.log(`    attemptHistory.length: ${q8.attemptHistory.length}`);
  console.log(`    lastAttempt.isCorrect: ${q8.attemptHistory[q8.attemptHistory.length - 1].isCorrect}`);
  console.log(`    studentAnswer === correctAnswer: ${q8.studentAnswer === q8.correctAnswer}`);
  
  // Q10 - Should be correct but marked wrong
  const q10 = userExampleData.questionResults[9];
  console.log(`  Q10 (${q10.questionId}):`);
  console.log(`    Type: ${q10.questionType}`);
  console.log(`    isCorrect: ${q10.isCorrect} ❌ (BUG: Should be TRUE)`);
  console.log(`    attempts: ${q10.attempts}`);
  console.log(`    attemptHistory.length: ${q10.attemptHistory.length}`);
  console.log(`    lastAttempt.isCorrect: ${q10.attemptHistory[q10.attemptHistory.length - 1].isCorrect}`);
  console.log(`    studentAnswer === correctAnswer: ${q10.studentAnswer === q10.correctAnswer}`);
  
  console.log('');
  console.log('='.repeat(80));
  console.log('APPLYING VALIDATION AND REPAIR...');
  console.log('='.repeat(80));
  console.log('');
  
  // Apply validation and repair
  const { result, validation, questionValidations } = validateAndRepairExerciseResult(
    userExampleData,
    { verbose: true }
  );
  
  console.log('VALIDATION REPORT:');
  console.log('-'.repeat(80));
  console.log(`Valid: ${validation.isValid}`);
  console.log(`Errors: ${validation.errors.length}`);
  console.log(`Warnings: ${validation.warnings.length}`);
  console.log(`Corrections Applied: ${validation.correctedFields.length}`);
  console.log('');
  
  if (validation.errors.length > 0) {
    console.log('Errors:');
    validation.errors.forEach(e => console.log(`  - ${e}`));
    console.log('');
  }
  
  if (validation.warnings.length > 0) {
    console.log('Warnings:');
    validation.warnings.forEach(w => console.log(`  - ${w}`));
    console.log('');
  }
  
  if (validation.correctedFields.length > 0) {
    console.log('Corrected Fields:');
    validation.correctedFields.forEach(f => console.log(`  - ${f}`));
    console.log('');
  }
  
  console.log('='.repeat(80));
  console.log('AFTER REPAIR:');
  console.log('='.repeat(80));
  console.log('');
  
  console.log('Results Summary (REPAIRED):');
  console.log(`  Total Items: ${result.resultsSummary.totalItems}`);
  console.log(`  Total Correct: ${result.resultsSummary.totalCorrect} ${result.resultsSummary.totalCorrect !== userExampleData.resultsSummary.totalCorrect ? '✓ FIXED' : ''}`);
  console.log(`  Total Incorrect: ${result.resultsSummary.totalIncorrect} ${result.resultsSummary.totalIncorrect !== userExampleData.resultsSummary.totalIncorrect ? '✓ FIXED' : ''}`);
  console.log(`  Total Attempts: ${result.resultsSummary.totalAttempts} ${result.resultsSummary.totalAttempts !== userExampleData.resultsSummary.totalAttempts ? '✓ FIXED' : ''}`);
  console.log(`  Mean Percentage Score: ${result.resultsSummary.meanPercentageScore}% ${result.resultsSummary.meanPercentageScore !== userExampleData.resultsSummary.meanPercentageScore ? '✓ FIXED' : ''}`);
  console.log(`  Remarks: ${result.resultsSummary.remarks} ${result.resultsSummary.remarks !== userExampleData.resultsSummary.remarks ? '✓ FIXED' : ''}`);
  console.log('');
  
  console.log('Question Results (REPAIRED - focusing on previously problematic ones):');
  
  // Q8 - Now should be correct
  const q8Fixed = result.questionResults[7];
  console.log(`  Q8 (${q8Fixed.questionId}):`);
  console.log(`    isCorrect: ${q8Fixed.isCorrect} ${q8Fixed.isCorrect !== q8.isCorrect ? '✓ FIXED' : ''}`);
  console.log(`    attempts: ${q8Fixed.attempts}`);
  console.log(`    lastAttempt.isCorrect: ${q8Fixed.attemptHistory[q8Fixed.attemptHistory.length - 1].isCorrect}`);
  
  // Q10 - Now should be correct
  const q10Fixed = result.questionResults[9];
  console.log(`  Q10 (${q10Fixed.questionId}):`);
  console.log(`    isCorrect: ${q10Fixed.isCorrect} ${q10Fixed.isCorrect !== q10.isCorrect ? '✓ FIXED' : ''}`);
  console.log(`    attempts: ${q10Fixed.attempts}`);
  console.log(`    lastAttempt.isCorrect: ${q10Fixed.attemptHistory[q10Fixed.attemptHistory.length - 1].isCorrect}`);
  
  console.log('');
  console.log('='.repeat(80));
  console.log('COMPARISON: BEFORE vs AFTER');
  console.log('='.repeat(80));
  console.log('');
  
  console.log('Overall Statistics:');
  console.log(`  Correct Count: ${userExampleData.resultsSummary.totalCorrect} → ${result.resultsSummary.totalCorrect}`);
  console.log(`  Incorrect Count: ${userExampleData.resultsSummary.totalIncorrect} → ${result.resultsSummary.totalIncorrect}`);
  console.log(`  Score: ${userExampleData.resultsSummary.meanPercentageScore}% → ${result.resultsSummary.meanPercentageScore}%`);
  console.log(`  Remarks: ${userExampleData.resultsSummary.remarks} → ${result.resultsSummary.remarks}`);
  console.log('');
  
  console.log('Question-by-Question Breakdown:');
  result.questionResults.forEach((qr, i) => {
    const original = userExampleData.questionResults[i];
    if (qr.isCorrect !== original.isCorrect) {
      console.log(`  Q${qr.questionNumber} (${qr.questionId}): ${original.isCorrect} → ${qr.isCorrect} ✓ FIXED`);
    }
  });
  
  console.log('');
  console.log('='.repeat(80));
  console.log('TEST RESULT: ' + (validation.correctedFields.length > 0 ? '✓ PASSED' : '✗ FAILED'));
  console.log('='.repeat(80));
  console.log('');
  
  // Verify expected fixes
  const expectedCorrectCount = 5; // Based on the data, should be 5 correct (Q2, Q4, Q6, Q8, Q10)
  const actualCorrectCount = result.resultsSummary.totalCorrect;
  
  if (actualCorrectCount === expectedCorrectCount) {
    console.log(`✓ SUCCESS: Correct count fixed to ${expectedCorrectCount}`);
  } else {
    console.log(`✗ ERROR: Expected ${expectedCorrectCount} correct, got ${actualCorrectCount}`);
  }
  
  if (q8Fixed.isCorrect === true) {
    console.log('✓ SUCCESS: Q8 marked as correct');
  } else {
    console.log('✗ ERROR: Q8 still marked as incorrect');
  }
  
  if (q10Fixed.isCorrect === true) {
    console.log('✓ SUCCESS: Q10 marked as correct');
  } else {
    console.log('✗ ERROR: Q10 still marked as incorrect');
  }
  
  console.log('');
  
  return {
    success: actualCorrectCount === expectedCorrectCount && q8Fixed.isCorrect === true && q10Fixed.isCorrect === true,
    result,
    validation
  };
}

// Run if called directly
if (require.main === module) {
  const { success } = runTest();
  process.exit(success ? 0 : 1);
}

export { runTest };

