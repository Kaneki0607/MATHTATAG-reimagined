import { useState } from 'react';
import { deleteData, pushData, readData, writeData } from '../lib/firebase-database';

export interface Exercise {
  id: string;
  title: string;
  description: string;
  teacherId: string;
  teacherName: string;
  questionCount: number;
  timesUsed: number;
  isPublic: boolean;
  createdAt: string;
  questions: any[];
  coAuthors?: string[];
  originalAuthor?: string;
  originalExerciseId?: string;
  category?: string;
  timeLimitPerItem?: number; // Time limit in seconds per item, null means no time limit
}

export interface AssignedExercise {
  id: string;
  exerciseId: string;
  classId: string;
  deadline: string;
  assignedBy: string;
  createdAt: string;
  acceptLateSubmissions?: boolean;
  acceptingStatus?: 'open' | 'closed';
  manuallyUpdated?: boolean;
  exercise?: Exercise;
  className?: string;
  quarter?: 'Quarter 1' | 'Quarter 2' | 'Quarter 3' | 'Quarter 4';
}

export const useExercises = (currentUserId: string | null) => {
  const [allExercises, setAllExercises] = useState<Exercise[]>([]);
  const [assignedExercises, setAssignedExercises] = useState<AssignedExercise[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Computed values based on allExercises
  const myExercises = allExercises.filter(exercise => exercise.teacherId === currentUserId);
  const publicExercises = allExercises.filter(exercise => exercise.isPublic);

  const loadAllExercises = async () => {
    try {
      setLoading(true);
      setError(null);
      const { data } = await readData('/exercises');
      const exercises = Object.entries(data || {})
        .map(([id, exercise]: any) => ({
          id,
          ...exercise,
        }));
      setAllExercises(exercises);
    } catch (err) {
      setError('Failed to load exercises');
      console.error('Error loading exercises:', err);
    } finally {
      setLoading(false);
    }
  };

  // Keep these for backward compatibility but they now use loadAllExercises
  const loadMyExercises = loadAllExercises;
  const loadPublicExercises = loadAllExercises;

  const loadAssignedExercises = async () => {
    if (!currentUserId) return;
    try {
      setLoading(true);
      setError(null);
      const { data } = await readData('/assignedExercises');
      const assigned = Object.entries(data || {})
        .map(([id, assignment]: any) => ({
          id,
          ...assignment,
        }))
        .filter((assignment: AssignedExercise) => assignment.assignedBy === currentUserId);
      
      // Update status based on deadline and acceptLateSubmissions
      const updatedAssignments = await Promise.all(
        assigned.map(async (assignment) => {
          const now = new Date();
          const deadline = new Date(assignment.deadline);
          const isOverdue = now > deadline;
          
          // Determine if status should be updated
          let shouldUpdateStatus = false;
          let newStatus = assignment.acceptingStatus;
          
          if (isOverdue) {
            // If overdue and not accepting late submissions, should be closed
            // But only if it wasn't manually updated (respect manual overrides)
            // Default to true (accept late submissions) if undefined
            if (!(assignment.acceptLateSubmissions ?? true) && 
                assignment.acceptingStatus === 'open' && 
                !assignment.manuallyUpdated) {
              newStatus = 'closed';
              shouldUpdateStatus = true;
            }
          } else {
            // If not overdue and was manually closed, keep it closed (don't auto-reopen)
            // Only auto-close, don't auto-reopen
          }
          
          // Update status in database if needed
          if (shouldUpdateStatus) {
            try {
              const updatedAssignment = {
                ...assignment,
                acceptingStatus: newStatus,
                updatedAt: new Date().toISOString(),
              };
              await writeData(`/assignedExercises/${assignment.id}`, updatedAssignment);
              console.log(`Auto-updated status for assignment ${assignment.id} to ${newStatus}`);
            } catch (err) {
              console.error('Failed to update assignment status:', err);
            }
          }
          
          return {
            ...assignment,
            acceptingStatus: newStatus,
          };
        })
      );
      
      // Load exercise details for each assignment
      const assignmentsWithExercises = await Promise.all(
        updatedAssignments.map(async (assignment) => {
          try {
            const { data: exerciseData } = await readData(`/exercises/${assignment.exerciseId}`);
            const { data: classData } = await readData(`/sections/${assignment.classId}`);
            return {
              ...assignment,
              exercise: exerciseData,
              className: classData?.name || 'Unknown Class',
            };
          } catch (err) {
            return assignment;
          }
        })
      );
      
      setAssignedExercises(assignmentsWithExercises);
    } catch (err) {
      setError('Failed to load assigned exercises');
      console.error('Error loading assigned exercises:', err);
    } finally {
      setLoading(false);
    }
  };

  const copyExercise = async (exercise: Exercise, currentUserId: string, teacherName: string) => {
    try {
      const copiedExercise = {
        ...exercise,
        title: `${exercise.title} (Copy)`,
        teacherId: currentUserId,
        teacherName: teacherName,
        isPublic: false, // Default to private
        createdAt: new Date().toISOString(),
        timesUsed: 0,
        coAuthors: exercise.coAuthors ? [...exercise.coAuthors, exercise.teacherId] : [exercise.teacherId],
        originalAuthor: exercise.teacherId,
        originalExerciseId: exercise.id,
      };
      const { id, ...copiedExerciseWithoutId } = copiedExercise;

      const { key, error } = await pushData('/exercises', copiedExerciseWithoutId);
      if (error) {
        throw new Error('Failed to copy exercise');
      }

      // Reload my exercises
      await loadMyExercises();
      return { success: true, id: key };
    } catch (err) {
      setError('Failed to copy exercise');
      throw err;
    }
  };

  const deleteExercise = async (exerciseId: string) => {
    try {
      await deleteData(`/exercises/${exerciseId}`);
      await deleteData(`/publicExercises/${exerciseId}`);
      await loadMyExercises();
      await loadPublicExercises();
      return { success: true };
    } catch (err) {
      setError('Failed to delete exercise');
      throw err;
    }
  };

  const assignExercise = async (exerciseId: string, classIds: string[], deadline: string, assignedBy: string, acceptLateSubmissions: boolean = true, acceptingStatus: 'open' | 'closed' = 'open', quarter?: 'Quarter 1' | 'Quarter 2' | 'Quarter 3' | 'Quarter 4') => {
    try {
      const assignments = classIds.map(classId => ({
        exerciseId,
        classId,
        deadline,
        assignedBy,
        acceptLateSubmissions,
        acceptingStatus,
        quarter,
        createdAt: new Date().toISOString(),
      }));

      const promises = assignments.map(assignment => pushData('/assignedExercises', assignment));
      await Promise.all(promises);

      await loadAssignedExercises();
      return { success: true };
    } catch (err) {
      setError('Failed to assign exercise');
      throw err;
    }
  };

  const deleteAssignment = async (assignmentId: string) => {
    try {
      await deleteData(`/assignedExercises/${assignmentId}`);
      await loadAssignedExercises();
      return { success: true };
    } catch (err) {
      setError('Failed to delete assignment');
      throw err;
    }
  };

  const updateAssignmentStatus = async (assignmentId: string, acceptingStatus: 'open' | 'closed') => {
    try {
      const { data: currentAssignment } = await readData(`/assignedExercises/${assignmentId}`);
      if (!currentAssignment) {
        throw new Error('Assignment not found');
      }

      const updatedAssignment = {
        ...currentAssignment,
        acceptingStatus,
        manuallyUpdated: true, // Flag to indicate manual status change
        updatedAt: new Date().toISOString(),
      };

      const { success, error } = await writeData(`/assignedExercises/${assignmentId}`, updatedAssignment);
      if (error) {
        throw new Error('Failed to update assignment status');
      }

      await loadAssignedExercises();
      return { success: true };
    } catch (err) {
      setError('Failed to update assignment status');
      throw err;
    }
  };

  return {
    myExercises,
    publicExercises,
    allExercises,
    assignedExercises,
    loading,
    error,
    loadMyExercises,
    loadPublicExercises,
    loadAllExercises,
    loadAssignedExercises,
    copyExercise,
    deleteExercise,
    assignExercise,
    deleteAssignment,
    updateAssignmentStatus,
  };
};
