import { useState } from 'react';
import { deleteData, pushData, readData } from '../lib/firebase-database';

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
}

export interface AssignedExercise {
  id: string;
  exerciseId: string;
  classId: string;
  deadline: string;
  assignedBy: string;
  createdAt: string;
  exercise?: Exercise;
  className?: string;
}

export const useExercises = (currentUserId: string | null) => {
  const [myExercises, setMyExercises] = useState<Exercise[]>([]);
  const [publicExercises, setPublicExercises] = useState<Exercise[]>([]);
  const [assignedExercises, setAssignedExercises] = useState<AssignedExercise[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadMyExercises = async () => {
    if (!currentUserId) return;
    try {
      setLoading(true);
      setError(null);
      const { data } = await readData('/exercises');
      const exercises = Object.entries(data || {})
        .map(([id, exercise]: any) => ({
          id,
          ...exercise,
        }))
        .filter((exercise: Exercise) => exercise.teacherId === currentUserId);
      setMyExercises(exercises);
    } catch (err) {
      setError('Failed to load your exercises');
      console.error('Error loading my exercises:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadPublicExercises = async () => {
    try {
      setLoading(true);
      setError(null);
      const { data } = await readData('/publicExercises');
      const exercises = Object.entries(data || {}).map(([id, exercise]: any) => ({
        id,
        ...exercise,
      }));
      setPublicExercises(exercises);
    } catch (err) {
      setError('Failed to load public exercises');
      console.error('Error loading public exercises:', err);
    } finally {
      setLoading(false);
    }
  };

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
      
      // Load exercise details for each assignment
      const assignmentsWithExercises = await Promise.all(
        assigned.map(async (assignment) => {
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
      delete copiedExercise.id; // Remove the original ID

      const { key, error } = await pushData('/exercises', copiedExercise);
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

  const assignExercise = async (exerciseId: string, classIds: string[], deadline: string, assignedBy: string) => {
    try {
      const assignments = classIds.map(classId => ({
        exerciseId,
        classId,
        deadline,
        assignedBy,
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

  return {
    myExercises,
    publicExercises,
    assignedExercises,
    loading,
    error,
    loadMyExercises,
    loadPublicExercises,
    loadAssignedExercises,
    copyExercise,
    deleteExercise,
    assignExercise,
    deleteAssignment,
  };
};
