/**
 * Entity Creation Helpers for MATHTATAG Project
 * 
 * Provides simplified functions for creating entities with readable IDs
 */

import { writeData } from './firebase-database';
import { generateLoginCode, generateNextId, generateResultId } from './id-generator';

// Entity creation interfaces
export interface CreateParentParams {
  loginCode?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  mobile?: string;
  profilePictureUrl?: string;
  infoStatus?: 'pending' | 'completed';
}

export interface CreateTeacherParams {
  uid?: string; // Firebase Auth UID (if registering from auth)
  firstName: string;
  lastName: string;
  email: string;
  mobile: string;
  gender: 'male' | 'female';
  profilePictureUrl?: string;
  dateOfBirth?: string;
  address?: string;
  school?: string;
  isVerified?: boolean;
  isBlocked?: boolean;
}

export interface CreateStudentParams {
  classId: string;
  parentId: string;
  firstName: string;
  middleInitial?: string;
  surname: string;
  fullName: string;
  gender: 'male' | 'female';
  gradeSection?: string;
  dateOfBirth?: string;
}

export interface CreateClassParams {
  name: string;
  section: string;
  teacherId: string;
  gradeLevel?: string;
  schoolYear?: string;
}

export interface CreateExerciseParams {
  title: string;
  description: string;
  teacherId: string;
  teacherName: string;
  questions: any[];
  resourceUrl?: string;
  category?: string;
  timesUsed?: number;
  isPublic?: boolean;
  timeLimitPerItem?: number;
  maxAttemptsPerItem?: number;
}

export interface CreateAssignedExerciseParams {
  exerciseId: string;
  classId: string;
  assignedBy: string;
  deadline: string;
  acceptLateSubmissions?: boolean;
  acceptingStatus?: 'open' | 'closed';
  quarter?: 'Quarter 1' | 'Quarter 2' | 'Quarter 3' | 'Quarter 4';
}

export interface CreateAnnouncementParams {
  title: string;
  message: string;
  teacherId: string;
  classIds: string[];
}

export interface CreateTaskParams {
  title: string;
  description: string;
  teacherId: string;
  classIds: string[];
  dueDate: string;
  exerciseId?: string;
}

/**
 * Create a new parent with readable ID
 */
export async function createParent(params: CreateParentParams): Promise<{
  success: boolean;
  parentId?: string;
  loginCode?: string;
  error?: string;
}> {
  try {
    // Generate parent ID
    const parentId = await generateNextId('PARENT', undefined, '/parents');
    
    // Generate or use provided login code
    const loginCode = params.loginCode || await generateLoginCode();
    
    // Create parent data
    const parentData = {
      parentId,
      loginCode,
      firstName: params.firstName || '',
      lastName: params.lastName || '',
      email: params.email || '',
      mobile: params.mobile || '',
      profilePictureUrl: params.profilePictureUrl || '',
      infoStatus: params.infoStatus || 'pending',
      createdAt: new Date().toISOString()
    };
    
    // Write to database
    const result = await writeData(`/parents/${parentId}`, parentData);
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to create parent');
    }
    
    // Map login code to parent ID
    await writeData(`/parentLoginCodes/${loginCode}`, parentId);
    
    console.log(`[EntityHelper] Created parent: ${parentId} with login code: ${loginCode}`);
    
    return {
      success: true,
      parentId,
      loginCode
    };
    
  } catch (error) {
    console.error('[EntityHelper] Failed to create parent:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Create a new teacher with readable ID or custom UID
 * 
 * Note: Teachers can use Firebase Auth UID as their ID (when registering via auth)
 * or can use auto-generated readable IDs (when created by admin)
 */
export async function createTeacher(params: CreateTeacherParams): Promise<{
  success: boolean;
  teacherId?: string;
  error?: string;
}> {
  try {
    // Use provided UID or generate readable ID
    const teacherId = params.uid || await generateNextId('TEACHER', undefined, '/teachers');
    
    // Create teacher data
    const teacherData = {
      teacherId,
      uid: params.uid || teacherId, // Store UID for auth compatibility
      firstName: params.firstName,
      lastName: params.lastName,
      email: params.email,
      mobile: params.mobile,
      phone: params.mobile, // Alias for backward compatibility
      gender: params.gender,
      school: params.school || '',
      profilePictureUrl: params.profilePictureUrl || '',
      dateOfBirth: params.dateOfBirth || '',
      address: params.address || '',
      isVerified: params.isVerified !== undefined ? params.isVerified : false,
      isBlocked: params.isBlocked !== undefined ? params.isBlocked : false,
      emailVerified: params.isVerified !== undefined ? params.isVerified : false,
      createdAt: new Date().toISOString()
    };
    
    // Write to database using the teacher ID (could be UID or readable ID)
    const result = await writeData(`/teachers/${teacherId}`, teacherData);
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to create teacher');
    }
    
    console.log(`[EntityHelper] Created teacher: ${teacherId}${params.uid ? ' (using Firebase Auth UID)' : ' (generated readable ID)'}`);
    
    return {
      success: true,
      teacherId
    };
    
  } catch (error) {
    console.error('[EntityHelper] Failed to create teacher:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Create a new student with readable ID
 */
export async function createStudent(params: CreateStudentParams): Promise<{
  success: boolean;
  studentId?: string;
  error?: string;
}> {
  try {
    // Extract section from gradeSection or classId
    const section = params.gradeSection || 'DEFAULT';
    
    // Generate student ID with section
    const studentId = await generateNextId('STUDENT', section, '/students');
    
    // Create student data
    const studentData = {
      studentId,
      classId: params.classId,
      parentId: params.parentId,
      firstName: params.firstName,
      middleInitial: params.middleInitial || '',
      surname: params.surname,
      fullName: params.fullName,
      gender: params.gender,
      gradeSection: params.gradeSection || '',
      dateOfBirth: params.dateOfBirth || '',
      createdAt: new Date().toISOString()
    };
    
    // Write to database
    const result = await writeData(`/students/${studentId}`, studentData);
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to create student');
    }
    
    console.log(`[EntityHelper] Created student: ${studentId}`);
    
    return {
      success: true,
      studentId
    };
    
  } catch (error) {
    console.error('[EntityHelper] Failed to create student:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Create a new class with readable ID
 */
export async function createClass(params: CreateClassParams): Promise<{
  success: boolean;
  classId?: string;
  error?: string;
}> {
  try {
    // Generate class ID with section
    const classId = await generateNextId('CLASS', params.section, '/classes');
    
    // Create class data
    const classData = {
      classId,
      name: params.name,
      section: params.section,
      teacherId: params.teacherId,
      gradeLevel: params.gradeLevel || '',
      schoolYear: params.schoolYear || '',
      createdAt: new Date().toISOString()
    };
    
    // Write to database
    const result = await writeData(`/classes/${classId}`, classData);
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to create class');
    }
    
    console.log(`[EntityHelper] Created class: ${classId}`);
    
    return {
      success: true,
      classId
    };
    
  } catch (error) {
    console.error('[EntityHelper] Failed to create class:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Create a new exercise with readable ID
 */
export async function createExercise(params: CreateExerciseParams): Promise<{
  success: boolean;
  exerciseId?: string;
  error?: string;
}> {
  try {
    // Generate exercise ID (format: E-ABC-0001)
    const exerciseId = await generateNextId('EXERCISE', undefined, '/exercises');
    
    // Generate question IDs (format: E-ABC-0001-Q001, E-ABC-0001-Q002, etc.)
    const questionsWithIds = params.questions.map((q, index) => ({
      ...q,
      id: `${exerciseId}-Q${String(index + 1).padStart(3, '0')}` // e.g., E-ABC-0001-Q001
    }));
    
    // Create exercise data (only include defined values to avoid Firebase errors)
    const exerciseData: any = {
      exerciseId,
      title: params.title,
      description: params.description,
      teacherId: params.teacherId,
      teacherName: params.teacherName,
      questions: questionsWithIds,
      questionCount: questionsWithIds.length,
      resourceUrl: params.resourceUrl || null,
      category: params.category || 'Mathematics',
      timesUsed: params.timesUsed || 0,
      isPublic: params.isPublic !== undefined ? params.isPublic : false,
      createdAt: new Date().toISOString()
    };
    
    // Only add optional fields if they are defined (Firebase doesn't allow undefined)
    if (params.timeLimitPerItem !== undefined && params.timeLimitPerItem !== null) {
      exerciseData.timeLimitPerItem = params.timeLimitPerItem;
    }
    
    if (params.maxAttemptsPerItem !== undefined && params.maxAttemptsPerItem !== null) {
      exerciseData.maxAttemptsPerItem = params.maxAttemptsPerItem;
    }
    
    // Write to database
    const result = await writeData(`/exercises/${exerciseId}`, exerciseData);
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to create exercise');
    }
    
    console.log(`[EntityHelper] Created exercise: ${exerciseId} with ${questionsWithIds.length} questions`);
    
    return {
      success: true,
      exerciseId
    };
    
  } catch (error) {
    console.error('[EntityHelper] Failed to create exercise:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Create a new assigned exercise with readable ID
 */
export async function createAssignedExercise(params: CreateAssignedExerciseParams): Promise<{
  success: boolean;
  assignedId?: string;
  error?: string;
}> {
  try {
    // Generate assigned exercise ID
    const assignedId = await generateNextId('ASSIGNED', undefined, '/assignedExercises');
    
    // Create assigned exercise data
    const assignedData = {
      assignedExerciseId: assignedId,
      exerciseId: params.exerciseId,
      classId: params.classId,
      assignedBy: params.assignedBy,
      deadline: params.deadline,
      acceptLateSubmissions: params.acceptLateSubmissions !== undefined ? params.acceptLateSubmissions : true,
      acceptingStatus: params.acceptingStatus || 'open',
      quarter: params.quarter,
      createdAt: new Date().toISOString()
    };
    
    // Write to database
    const result = await writeData(`/assignedExercises/${assignedId}`, assignedData);
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to create assigned exercise');
    }
    
    console.log(`[EntityHelper] Created assigned exercise: ${assignedId}`);
    
    return {
      success: true,
      assignedId
    };
    
  } catch (error) {
    console.error('[EntityHelper] Failed to create assigned exercise:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Create an exercise result with hierarchical readable ID
 * 
 * Format: EXERCISE-ID-R-XXX-XXXX (e.g., E-GTK-0004-R-ABC-0001)
 * This clearly shows which exercise the result belongs to
 */
export async function createExerciseResult(
  studentId: string,
  exerciseId: string,
  assignedExerciseId: string,
  resultData: any
): Promise<{
  success: boolean;
  resultId?: string;
  error?: string;
}> {
  try {
    // Generate hierarchical result ID linked to exercise
    // Format: E-GTK-0004-R-ABC-0001
    const resultId = await generateResultId(exerciseId, '/ExerciseResults');
    
    // Create full result data with hierarchical ID
    const fullResultData = {
      ...resultData,
      exerciseResultId: resultId,
      createdAt: new Date().toISOString()
    };
    
    // Write to database
    const result = await writeData(`/ExerciseResults/${resultId}`, fullResultData);
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to create exercise result');
    }
    
    console.log(`[EntityHelper] Created exercise result: ${resultId} (linked to ${exerciseId})`);
    
    return {
      success: true,
      resultId
    };
    
  } catch (error) {
    console.error('[EntityHelper] Failed to create exercise result:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Create an announcement with readable ID
 */
export async function createAnnouncement(params: CreateAnnouncementParams): Promise<{
  success: boolean;
  announcementId?: string;
  error?: string;
}> {
  try {
    // Generate announcement ID
    const announcementId = await generateNextId('ANNOUNCEMENT', undefined, '/announcements');
    
    // Create announcement data
    const announcementData = {
      id: announcementId,
      title: params.title,
      message: params.message,
      teacherId: params.teacherId,
      classIds: params.classIds,
      dateTime: new Date().toISOString(),
      readBy: []
    };
    
    // Write to database
    const result = await writeData(`/announcements/${announcementId}`, announcementData);
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to create announcement');
    }
    
    console.log(`[EntityHelper] Created announcement: ${announcementId}`);
    
    return {
      success: true,
      announcementId
    };
    
  } catch (error) {
    console.error('[EntityHelper] Failed to create announcement:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Create a task with readable ID
 */
export async function createTask(params: CreateTaskParams): Promise<{
  success: boolean;
  taskId?: string;
  error?: string;
}> {
  try {
    // Generate task ID
    const taskId = await generateNextId('TASK', undefined, '/tasks');
    
    // Create task data (only include defined values)
    const taskData: any = {
      id: taskId,
      title: params.title,
      description: params.description,
      teacherId: params.teacherId,
      classIds: params.classIds,
      dueDate: params.dueDate,
      status: 'pending',
      createdAt: new Date().toISOString()
    };
    
    // Only add exerciseId if provided (Firebase doesn't allow undefined)
    if (params.exerciseId !== undefined && params.exerciseId !== null) {
      taskData.exerciseId = params.exerciseId;
    }
    
    // Write to database
    const result = await writeData(`/tasks/${taskId}`, taskData);
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to create task');
    }
    
    console.log(`[EntityHelper] Created task: ${taskId}`);
    
    return {
      success: true,
      taskId
    };
    
  } catch (error) {
    console.error('[EntityHelper] Failed to create task:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

// Export all helper functions
export const EntityHelpers = {
  createParent,
  createTeacher,
  createStudent,
  createClass,
  createExercise,
  createAssignedExercise,
  createExerciseResult,
  createAnnouncement,
  createTask
};

export default EntityHelpers;

