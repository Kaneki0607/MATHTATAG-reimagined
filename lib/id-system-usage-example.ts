/**
 * ID System Usage Examples
 * 
 * This file demonstrates how to use the new readable ID system.
 * These are just examples - not meant to be run directly.
 */

import {
    createAnnouncement,
    createAssignedExercise,
    createClass,
    createExercise,
    createExerciseResult,
    createParent,
    createStudent,
    createTeacher
} from './entity-helpers';

import {
    isValidId,
    parseId
} from './id-generator';

import { migrateDatabaseIds } from './id-migration-utility';

// ============================================
// EXAMPLE 1: Creating a Parent
// ============================================
async function exampleCreateParent() {
  const result = await createParent({
    loginCode: 'ABCD-1234', // Optional: provide custom code or let system generate
    infoStatus: 'pending'
  });
  
  if (result.success) {
    console.log(`Created parent: ${result.parentId}`); // Output: P-ABC-0001 (random code)
    console.log(`Login code: ${result.loginCode}`);
  }
}

// ============================================
// EXAMPLE 2: Creating a Teacher
// ============================================
async function exampleCreateTeacher() {
  // Option A: Create with auto-generated ID
  const result1 = await createTeacher({
    firstName: 'John',
    lastName: 'Doe',
    email: 'john@example.com',
    mobile: '123456789',
    gender: 'male',
    school: 'Test School'
  });
  // Output: T-ABC-0001 (random 3-letter code prevents collisions)
  
  // Option B: Create with Firebase Auth UID
  const result2 = await createTeacher({
    uid: 'firebase-uid-xyz', // Use Firebase Auth UID
    firstName: 'Jane',
    lastName: 'Smith',
    email: 'jane@example.com',
    mobile: '987654321',
    gender: 'female',
    school: 'Test School',
    isVerified: true
  });
  // Output: firebase-uid-xyz (uses provided UID for auth compatibility)
}

// ============================================
// EXAMPLE 3: Creating a Student
// ============================================
async function exampleCreateStudent() {
  const result = await createStudent({
    classId: 'C-ABC-0001',
    parentId: 'P-XYZ-0001',
    firstName: 'Alice',
    middleInitial: 'B',
    surname: 'Johnson',
    fullName: 'Alice B Johnson',
    gender: 'female',
    gradeSection: 'Grade 1-A'
  });
  
  if (result.success) {
    console.log(`Created student: ${result.studentId}`); // Output: S-FKZ-0001 (random code)
  }
}

// ============================================
// EXAMPLE 4: Creating a Class
// ============================================
async function exampleCreateClass() {
  const result = await createClass({
    name: 'Grade 1-A',
    section: 'Grade 1-A',
    teacherId: 'TEACHER-0001',
    gradeLevel: '1',
    schoolYear: '20252026'
  });
  
  if (result.success) {
    console.log(`Created class: ${result.classId}`); // Output: CLASS-GRADE1A-0001
  }
}

// ============================================
// EXAMPLE 5: Creating an Exercise
// ============================================
async function exampleCreateExercise() {
  const result = await createExercise({
    title: 'Addition Practice',
    description: 'Basic addition for Grade 1',
    teacherId: 'TEACHER-0001',
    teacherName: 'John Doe',
    questions: [
      {
        type: 'multiple-choice',
        question: 'What is 2 + 2?',
        answer: '4',
        options: ['3', '4', '5', '6']
      }
    ],
    category: 'Mathematics',
    timeLimitPerItem: 30,
    maxAttemptsPerItem: 3
  });
  
  if (result.success) {
    console.log(`Created exercise: ${result.exerciseId}`); // Output: EXERCISE-0001
    // Questions will have IDs like: EXERCISE-0001-Q001, EXERCISE-0001-Q002, etc.
  }
}

// ============================================
// EXAMPLE 6: Assigning an Exercise
// ============================================
async function exampleAssignExercise() {
  const result = await createAssignedExercise({
    exerciseId: 'EXERCISE-0001',
    classId: 'CLASS-GRADE1A-0001',
    assignedBy: 'TEACHER-0001',
    deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days from now
    acceptLateSubmissions: true,
    acceptingStatus: 'open',
    quarter: 'Quarter 1'
  });
  
  if (result.success) {
    console.log(`Created assignment: ${result.assignedId}`); // Output: ASSIGNED-0001
  }
}

// ============================================
// EXAMPLE 7: Creating a Result
// ============================================
async function exampleCreateResult() {
  const resultData = {
    studentInfo: {
      studentId: 'STUDENT-GRADE1A-0001',
      name: 'Alice B Johnson',
      gradeSection: 'Grade 1-A',
      sex: 'female'
    },
    exerciseInfo: {
      exerciseId: 'EXERCISE-0001',
      title: 'Addition Practice',
      category: 'Mathematics',
      description: 'Basic addition',
      totalQuestions: 5
    },
    assignmentMetadata: {
      assignmentId: 'ASSIGNED-0001',
      classId: 'CLASS-GRADE1A-0001',
      parentId: 'PARENT-0001',
      assignedAt: new Date().toISOString(),
      deadline: new Date().toISOString(),
      acceptLateSubmissions: true,
      acceptingStatus: 'open',
      isLateSubmission: false
    },
    resultsSummary: {
      totalItems: 5,
      totalCorrect: 5,
      totalIncorrect: 0,
      totalAttempts: 5,
      totalTimeSpentSeconds: 120,
      meanPercentageScore: 100,
      meanAttemptsPerItem: 1,
      meanTimePerItemSeconds: 24,
      score: 5,
      remarks: 'Excellent'
    },
    questionResults: [],
    deviceInfo: {},
    exerciseSession: {}
  };
  
  const result = await createExerciseResult(
    'S-ABC-0001',  // Student ID
    'E-GTK-0004',  // Exercise ID
    'A-DEF-0001',  // Assigned Exercise ID
    resultData
  );
  
  if (result.success) {
    // Output: E-GTK-0004-R-ABC-0001 (hierarchical format linking to exercise)
    console.log(`Created result: ${result.resultId}`); 
    console.log(`This result is clearly linked to exercise: E-GTK-0004`);
  }
}

// ============================================
// EXAMPLE 8: Creating an Announcement
// ============================================
async function exampleCreateAnnouncement() {
  const result = await createAnnouncement({
    title: 'Important Notice',
    message: 'Classes will resume on Monday.',
    teacherId: 'TEACHER-0001',
    classIds: ['CLASS-GRADE1A-0001', 'CLASS-GRADE1B-0001']
  });
  
  if (result.success) {
    console.log(`Created announcement: ${result.announcementId}`); // Output: ANNOUNCEMENT-0001
  }
}

// ============================================
// EXAMPLE 9: Parsing and Validating IDs
// ============================================
function exampleParseAndValidate() {
  // Parse an ID
  const parsed = parseId('STUDENT-GRADE1A-0023');
  console.log(parsed);
  // Output: { type: 'STUDENT', section: 'GRADE1A', number: 23, isValid: true }
  
  // Validate an ID
  const valid = isValidId('TEACHER-0001', 'TEACHER');
  console.log(valid); // Output: true
  
  const invalid = isValidId('INVALID-FORMAT');
  console.log(invalid); // Output: false
}

// ============================================
// EXAMPLE 10: Running Migration (ONE-TIME)
// ============================================
async function exampleRunMigration() {
  console.log('⚠️  This should only be run ONCE to migrate existing data!');
  console.log('⚠️  BACKUP YOUR DATABASE FIRST!');
  
  const result = await migrateDatabaseIds();
  
  console.log('Migration complete:');
  console.log(`- ${result.summaries.length} entity types migrated`);
  console.log(`- ${result.foreignKeyUpdates} foreign keys updated`);
  console.log(`- ${Object.keys(result.idMapping).length} IDs converted`);
}

// ============================================
// EXPECTED ID FORMATS
// ============================================
/*
NEW FORMAT (with collision prevention):
PREFIX-XXX-XXXX

Where:
- PREFIX: Single letter (P, T, S, E, A, R, N, K, C, M)
- XXX: Random 3-letter code
- XXXX: Sequential number (zero-padded to 4 digits)

Examples:
P-ABA-0001, P-XYZ-0002 (Parents)
T-LHB-0001, T-QWE-0002 (Teachers)
S-FKZ-0001, S-GHJ-0002 (Students)
C-SXA-0001, C-TYU-0002 (Classes)
E-SNH-0001, E-VBN-0002 (Exercises)
A-FXM-0001, A-KLP-0002 (Assigned Exercises)
R-ABC-0001, R-DEF-0002 (Results)
N-TUJ-0001, N-MKL-0002 (Announcements)
K-BRW-0001, K-PLM-0002 (Tasks)

Questions within exercises:
E-SNH-0001-Q001, E-SNH-0001-Q002, ... (questions in exercise E-SNH-0001)
E-VBN-0002-Q001, E-VBN-0002-Q002, ... (questions in exercise E-VBN-0002)

BENEFITS:
- Random code prevents collisions when 2+ users create records simultaneously
- Still readable and traceable
- Compact format (shorter than full word prefixes)
- Entity type visible from first letter
*/

// ============================================
// BACKWARD COMPATIBILITY
// ============================================
/*
The system maintains backward compatibility:
- Login codes still work as before
- Teachers can use Firebase Auth UIDs
- Old random IDs will still function (until migration)
- All queries work with both ID formats
- Foreign key relationships preserved
*/

export const Examples = {
  exampleCreateParent,
  exampleCreateTeacher,
  exampleCreateStudent,
  exampleCreateClass,
  exampleCreateExercise,
  exampleAssignExercise,
  exampleCreateResult,
  exampleCreateAnnouncement,
  exampleParseAndValidate,
  exampleRunMigration
};

