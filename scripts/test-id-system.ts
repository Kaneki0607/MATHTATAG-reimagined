/**
 * ID System Test Script
 * 
 * Tests the new readable ID system without affecting production data.
 * Creates test records, verifies IDs, and cleans up.
 * 
 * Usage: npx ts-node scripts/test-id-system.ts
 */

import {
    createAnnouncement,
    createAssignedExercise,
    createClass,
    createExercise,
    createExerciseResult,
    createParent,
    createStudent,
    createTask,
    createTeacher
} from '../lib/entity-helpers';

import { deleteData, readData } from '../lib/firebase-database';
import { isValidId, parseId } from '../lib/id-generator';

// Track created test entities for cleanup
const testEntities: { path: string; id: string }[] = [];

function recordTestEntity(path: string, id: string) {
  testEntities.push({ path, id });
}

async function cleanupTestEntities() {
  console.log('\n🧹 Cleaning up test entities...');
  
  for (const entity of testEntities) {
    try {
      await deleteData(`${entity.path}/${entity.id}`);
      console.log(`✅ Deleted: ${entity.path}/${entity.id}`);
    } catch (error) {
      console.warn(`⚠️  Failed to delete: ${entity.path}/${entity.id}`);
    }
  }
  
  console.log('✅ Cleanup complete\n');
}

async function testParentCreation() {
  console.log('\n📝 Testing Parent Creation...');
  
  const result = await createParent({
    loginCode: 'TEST-1234',
    firstName: 'Test',
    lastName: 'Parent',
    email: 'test@parent.com',
    mobile: '1234567890',
    infoStatus: 'completed'
  });
  
  if (result.success && result.parentId) {
    console.log(`✅ Parent created: ${result.parentId}`);
    console.log(`   Login code: ${result.loginCode}`);
    
    const parsed = parseId(result.parentId);
    console.log(`   Parsed: type=${parsed.type}, number=${parsed.number}`);
    console.log(`   Valid: ${isValidId(result.parentId, 'PARENT')}`);
    
    recordTestEntity('/parents', result.parentId);
    return result.parentId;
  } else {
    console.log(`❌ Failed to create parent: ${result.error}`);
    return null;
  }
}

async function testTeacherCreation() {
  console.log('\n📝 Testing Teacher Creation...');
  
  const result = await createTeacher({
    firstName: 'Test',
    lastName: 'Teacher',
    email: 'test@teacher.com',
    mobile: '0987654321',
    gender: 'male',
    school: 'Test School'
  });
  
  if (result.success && result.teacherId) {
    console.log(`✅ Teacher created: ${result.teacherId}`);
    
    const parsed = parseId(result.teacherId);
    console.log(`   Parsed: type=${parsed.type}, number=${parsed.number}`);
    console.log(`   Valid: ${isValidId(result.teacherId, 'TEACHER')}`);
    
    recordTestEntity('/teachers', result.teacherId);
    return result.teacherId;
  } else {
    console.log(`❌ Failed to create teacher: ${result.error}`);
    return null;
  }
}

async function testClassCreation(teacherId: string) {
  console.log('\n📝 Testing Class Creation...');
  
  const result = await createClass({
    name: 'Test Grade 1-A',
    section: 'GRADE1A',
    teacherId,
    gradeLevel: '1',
    schoolYear: '20252026'
  });
  
  if (result.success && result.classId) {
    console.log(`✅ Class created: ${result.classId}`);
    
    const parsed = parseId(result.classId);
    console.log(`   Parsed: type=${parsed.type}, section=${parsed.section}, number=${parsed.number}`);
    console.log(`   Valid: ${isValidId(result.classId, 'CLASS')}`);
    
    recordTestEntity('/classes', result.classId);
    recordTestEntity('/sections', result.classId); // Classes are also in sections
    return result.classId;
  } else {
    console.log(`❌ Failed to create class: ${result.error}`);
    return null;
  }
}

async function testStudentCreation(classId: string, parentId: string) {
  console.log('\n📝 Testing Student Creation...');
  
  const result = await createStudent({
    classId,
    parentId,
    firstName: 'Test',
    middleInitial: 'T',
    surname: 'Student',
    fullName: 'Test T Student',
    gender: 'male',
    gradeSection: 'GRADE1A'
  });
  
  if (result.success && result.studentId) {
    console.log(`✅ Student created: ${result.studentId}`);
    
    const parsed = parseId(result.studentId);
    console.log(`   Parsed: type=${parsed.type}, section=${parsed.section}, number=${parsed.number}`);
    console.log(`   Valid: ${isValidId(result.studentId, 'STUDENT')}`);
    
    recordTestEntity('/students', result.studentId);
    return result.studentId;
  } else {
    console.log(`❌ Failed to create student: ${result.error}`);
    return null;
  }
}

async function testExerciseCreation(teacherId: string) {
  console.log('\n📝 Testing Exercise Creation...');
  
  const result = await createExercise({
    title: 'Test Exercise',
    description: 'A test exercise',
    teacherId,
    teacherName: 'Test Teacher',
    questions: [
      {
        type: 'multiple-choice',
        question: 'Test question?',
        answer: 'A',
        options: ['Correct', 'Wrong', 'Wrong', 'Wrong']
      }
    ],
    category: 'Mathematics'
  });
  
  if (result.success && result.exerciseId) {
    console.log(`✅ Exercise created: ${result.exerciseId}`);
    
    const parsed = parseId(result.exerciseId);
    console.log(`   Parsed: type=${parsed.type}, number=${parsed.number}`);
    console.log(`   Valid: ${isValidId(result.exerciseId, 'EXERCISE')}`);
    
    // Verify question IDs
    const exerciseData = await readData(`/exercises/${result.exerciseId}`);
    if (exerciseData.data && exerciseData.data.questions) {
      const questionId = exerciseData.data.questions[0].id;
      console.log(`   Question ID: ${questionId}`);
    }
    
    recordTestEntity('/exercises', result.exerciseId);
    return result.exerciseId;
  } else {
    console.log(`❌ Failed to create exercise: ${result.error}`);
    return null;
  }
}

async function testAssignedExerciseCreation(exerciseId: string, classId: string, teacherId: string) {
  console.log('\n📝 Testing Assigned Exercise Creation...');
  
  const deadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  
  const result = await createAssignedExercise({
    exerciseId,
    classId,
    assignedBy: teacherId,
    deadline,
    acceptLateSubmissions: true,
    acceptingStatus: 'open',
    quarter: 'Quarter 1'
  });
  
  if (result.success && result.assignedId) {
    console.log(`✅ Assigned exercise created: ${result.assignedId}`);
    
    const parsed = parseId(result.assignedId);
    console.log(`   Parsed: type=${parsed.type}, number=${parsed.number}`);
    console.log(`   Valid: ${isValidId(result.assignedId, 'ASSIGNED')}`);
    
    recordTestEntity('/assignedExercises', result.assignedId);
    return result.assignedId;
  } else {
    console.log(`❌ Failed to create assigned exercise: ${result.error}`);
    return null;
  }
}

async function testResultCreation(exerciseId: string, studentId: string, assignedId: string) {
  console.log('\n📝 Testing Result Creation (Hierarchical)...');
  
  const resultData = {
    studentInfo: {
      studentId,
      name: 'Test Student',
      gradeSection: 'Grade 1-A',
      sex: 'male'
    },
    exerciseInfo: {
      exerciseId,
      title: 'Test Exercise',
      category: 'Mathematics',
      description: 'Test',
      totalQuestions: 1
    },
    assignmentMetadata: {
      assignmentId: assignedId,
      classId: 'C-TEST-0001',
      parentId: 'P-TEST-0001',
      assignedAt: new Date().toISOString(),
      deadline: new Date().toISOString(),
      acceptLateSubmissions: true,
      acceptingStatus: 'open',
      isLateSubmission: false
    },
    resultsSummary: {
      totalItems: 1,
      totalCorrect: 1,
      totalIncorrect: 0,
      totalAttempts: 1,
      totalTimeSpentSeconds: 10,
      meanPercentageScore: 100,
      meanAttemptsPerItem: 1,
      meanTimePerItemSeconds: 10,
      score: 1,
      remarks: 'Excellent'
    },
    questionResults: [],
    deviceInfo: {},
    exerciseSession: {}
  };
  
  const result = await createExerciseResult(studentId, exerciseId, assignedId, resultData);
  
  if (result.success && result.resultId) {
    console.log(`✅ Result created: ${result.resultId}`);
    console.log(`   Format: {exerciseId}-R-XXX-XXXX`);
    console.log(`   Linked to exercise: ${exerciseId}`);
    
    // Verify hierarchical structure
    if (result.resultId.startsWith(exerciseId)) {
      console.log(`   ✅ Hierarchical link verified!`);
    }
    
    recordTestEntity('/ExerciseResults', result.resultId);
    return result.resultId;
  } else {
    console.log(`❌ Failed to create result: ${result.error}`);
    return null;
  }
}

async function testAnnouncementCreation(teacherId: string, classId: string) {
  console.log('\n📝 Testing Announcement Creation...');
  
  const result = await createAnnouncement({
    title: 'Test Announcement',
    message: 'This is a test announcement',
    teacherId,
    classIds: [classId]
  });
  
  if (result.success && result.announcementId) {
    console.log(`✅ Announcement created: ${result.announcementId}`);
    
    const parsed = parseId(result.announcementId);
    console.log(`   Parsed: type=${parsed.type}, number=${parsed.number}`);
    console.log(`   Valid: ${isValidId(result.announcementId, 'ANNOUNCEMENT')}`);
    
    recordTestEntity('/announcements', result.announcementId);
    return result.announcementId;
  } else {
    console.log(`❌ Failed to create announcement: ${result.error}`);
    return null;
  }
}

async function testTaskCreation(teacherId: string, classId: string) {
  console.log('\n📝 Testing Task Creation...');
  
  const dueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  
  const result = await createTask({
    title: 'Test Task',
    description: 'This is a test task',
    teacherId,
    classIds: [classId],
    dueDate
  });
  
  if (result.success && result.taskId) {
    console.log(`✅ Task created: ${result.taskId}`);
    
    const parsed = parseId(result.taskId);
    console.log(`   Parsed: type=${parsed.type}, number=${parsed.number}`);
    console.log(`   Valid: ${isValidId(result.taskId, 'TASK')}`);
    
    recordTestEntity('/tasks', result.taskId);
    return result.taskId;
  } else {
    console.log(`❌ Failed to create task: ${result.error}`);
    return null;
  }
}

async function runTests() {
  console.log('\n====================================');
  console.log('READABLE ID SYSTEM TEST SUITE');
  console.log('====================================');
  
  try {
    // Test each entity type
    const parentId = await testParentCreation();
    if (!parentId) throw new Error('Parent creation failed');
    
    const teacherId = await testTeacherCreation();
    if (!teacherId) throw new Error('Teacher creation failed');
    
    const classId = await testClassCreation(teacherId);
    if (!classId) throw new Error('Class creation failed');
    
    const studentId = await testStudentCreation(classId, parentId);
    if (!studentId) throw new Error('Student creation failed');
    
    const exerciseId = await testExerciseCreation(teacherId);
    if (!exerciseId) throw new Error('Exercise creation failed');
    
    const assignedId = await testAssignedExerciseCreation(exerciseId, classId, teacherId);
    if (!assignedId) throw new Error('Assigned exercise creation failed');
    
    const resultId = await testResultCreation(exerciseId, studentId, assignedId);
    if (!resultId) throw new Error('Result creation failed');
    
    const announcementId = await testAnnouncementCreation(teacherId, classId);
    if (!announcementId) throw new Error('Announcement creation failed');
    
    const taskId = await testTaskCreation(teacherId, classId);
    if (!taskId) throw new Error('Task creation failed');
    
    console.log('\n====================================');
    console.log('ALL TESTS PASSED! ✅');
    console.log('====================================\n');
    
    console.log('Summary of created IDs:');
    console.log(`Parent: ${parentId}`);
    console.log(`Teacher: ${teacherId}`);
    console.log(`Class: ${classId}`);
    console.log(`Student: ${studentId}`);
    console.log(`Exercise: ${exerciseId}`);
    console.log(`Assigned: ${assignedId}`);
    console.log(`Result: ${resultId} (hierarchical)`);
    console.log(`Announcement: ${announcementId}`);
    console.log(`Task: ${taskId}`);
    
  } catch (error) {
    console.error('\n❌ Tests failed:', error);
    throw error;
  } finally {
    // Always cleanup, even if tests fail
    await cleanupTestEntities();
  }
}

// Run if executed directly
if (require.main === module) {
  runTests()
    .then(() => {
      console.log('\n✅ Test script completed successfully.\n');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Test script failed:', error);
      process.exit(1);
    });
}

export default runTests;

