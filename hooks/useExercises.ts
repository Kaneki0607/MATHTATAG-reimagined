import { useState } from 'react';
import { createAssignedExercise, createExercise } from '../lib/entity-helpers';
import { deleteData, readData, writeData } from '../lib/firebase-database';
import { uploadFile } from '../lib/firebase-storage';

export interface Exercise {
  id: string;
  title: string;
  description: string;
  teacherId: string;
  teacherName: string;
  questionCount: number;
  timesUsed: number;
  timesCopied?: number; // Track how many times this exercise has been copied
  isPublic: boolean;
  createdAt: string;
  questions: any[];
  coAuthors?: string[];
  originalAuthor?: string;
  originalExerciseId?: string;
  category?: string;
  timeLimitPerItem?: number; // Time limit in seconds per item, null means no time limit
  resourceUrl?: string; // Optional resource file URL
  maxAttemptsPerItem?: number; // Maximum attempts allowed per item
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
  targetStudentIds?: string[];
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
            const { data: classData } = await readData(`/classes/${assignment.classId}`);
            return {
              ...assignment,
              exercise: exerciseData,
              className: classData?.section || classData?.name || 'Unknown Class',
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
      console.log('[CopyExercise] Starting exercise copy with new ID system...');
      
      // Helper function to check if an image URI is local
      const isLocalImage = (uri: string): boolean => {
        if (!uri) return false;
        
        const localPatterns = [
          'assets/',
          'file://',
          'content://',
          'http://192.168.',
          'http://10.',
          'http://localhost:',
          'http://127.0.0.1:',
          '/static/media/',
        ];
        
        const isLocal = localPatterns.some(pattern => uri.includes(pattern));
        const isFirebaseUrl = uri.includes('firebasestorage.googleapis.com') || 
                             uri.includes('storage.googleapis.com');
        
        return isLocal && !isFirebaseUrl;
      };
      
      // Helper function to upload a single image
      const uploadImageIfLocal = async (imageUri: string, storagePath: string): Promise<string> => {
        if (!isLocalImage(imageUri)) {
          return imageUri; // Already a remote URL
        }
        
        try {
          console.log(`[CopyExercise] Uploading local image: ${imageUri.substring(0, 50)}...`);
          
          // Fetch the local image
          const response = await fetch(imageUri);
          if (!response.ok) {
            throw new Error(`Failed to fetch image: ${response.status}`);
          }
          
          const blob = await response.blob();
          if (blob.size === 0) {
            throw new Error('Image blob is empty');
          }
          
          // Upload to Firebase Storage
          const { downloadURL, error } = await uploadFile(`${storagePath}.png`, blob, {
            contentType: 'image/png',
          });
          
          if (error || !downloadURL) {
            throw new Error(`Upload failed: ${error || 'No download URL'}`);
          }
          
          console.log(`[CopyExercise] Successfully uploaded image to: ${downloadURL}`);
          return downloadURL;
        } catch (error) {
          console.error('[CopyExercise] Failed to upload image:', error);
          return imageUri; // Fallback to original URI
        }
      };
      
      // Generate a unique code for this copied exercise
      const exerciseCode = Math.floor(100000 + Math.random() * 900000).toString();
      
      // Process questions and upload all local images
      const processedQuestions = await Promise.all(
        exercise.questions.map(async (question: any, qIndex: number) => {
          const processedQuestion = { ...question };
          
          // Upload question image if local
          if (processedQuestion.questionImage && isLocalImage(processedQuestion.questionImage)) {
            processedQuestion.questionImage = await uploadImageIfLocal(
              processedQuestion.questionImage,
              `exercises/${exerciseCode}/question-${qIndex}`
            );
          }
          
          // Upload multiple question images if local
          if (processedQuestion.questionImages && Array.isArray(processedQuestion.questionImages)) {
            processedQuestion.questionImages = await Promise.all(
              processedQuestion.questionImages.map(async (imgUri: string, imgIndex: number) => {
                if (isLocalImage(imgUri)) {
                  return await uploadImageIfLocal(
                    imgUri,
                    `exercises/${exerciseCode}/question-${qIndex}-image-${imgIndex}`
                  );
                }
                return imgUri;
              })
            );
          }
          
          // Upload option images if local
          if (processedQuestion.optionImages && Array.isArray(processedQuestion.optionImages)) {
            processedQuestion.optionImages = await Promise.all(
              processedQuestion.optionImages.map(async (imgUri: string | null, optIndex: number) => {
                if (imgUri && isLocalImage(imgUri)) {
                  return await uploadImageIfLocal(
                    imgUri,
                    `exercises/${exerciseCode}/question-${qIndex}/option-${optIndex}`
                  );
                }
                return imgUri;
              })
            );
          }
          
          // Upload pair images if local
          if (processedQuestion.pairs && Array.isArray(processedQuestion.pairs)) {
            processedQuestion.pairs = await Promise.all(
              processedQuestion.pairs.map(async (pair: any, pairIndex: number) => {
                const processedPair = { ...pair };
                
                if (pair.leftImage && isLocalImage(pair.leftImage)) {
                  processedPair.leftImage = await uploadImageIfLocal(
                    pair.leftImage,
                    `exercises/${exerciseCode}/question-${qIndex}/pair-${pairIndex}-left`
                  );
                }
                
                if (pair.rightImage && isLocalImage(pair.rightImage)) {
                  processedPair.rightImage = await uploadImageIfLocal(
                    pair.rightImage,
                    `exercises/${exerciseCode}/question-${qIndex}/pair-${pairIndex}-right`
                  );
                }
                
                return processedPair;
              })
            );
          }
          
          // Upload reorder item images if local
          if (processedQuestion.reorderItems && Array.isArray(processedQuestion.reorderItems)) {
            processedQuestion.reorderItems = await Promise.all(
              processedQuestion.reorderItems.map(async (item: any, itemIndex: number) => {
                const processedItem = { ...item };
                
                if (item.type === 'image' && item.imageUrl && isLocalImage(item.imageUrl)) {
                  processedItem.imageUrl = await uploadImageIfLocal(
                    item.imageUrl,
                    `exercises/${exerciseCode}/question-${qIndex}/reorder-${itemIndex}`
                  );
                  processedItem.content = processedItem.imageUrl;
                }
                
                return processedItem;
              })
            );
          }
          
          return processedQuestion;
        })
      );
      
      // Upload resource file if it's local
      let resourceUrl = exercise.resourceUrl;
      if (resourceUrl && isLocalImage(resourceUrl)) {
        resourceUrl = await uploadImageIfLocal(
          resourceUrl,
          `exercises/${exerciseCode}/resource`
        );
      }
      
      // Create the copied exercise using the new ID system
      const result = await createExercise({
        title: `${exercise.title} (Copy)`,
        description: exercise.description,
        teacherId: currentUserId,
        teacherName: teacherName,
        questions: processedQuestions,
        resourceUrl: resourceUrl || undefined,
        category: exercise.category || 'Mathematics',
        timesUsed: 0,
        isPublic: false,
        timeLimitPerItem: exercise.timeLimitPerItem,
        maxAttemptsPerItem: exercise.maxAttemptsPerItem,
      });
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to copy exercise');
      }
      
      console.log(`[CopyExercise] Successfully copied exercise with new ID: ${result.exerciseId}`);
      
      // Also store metadata about the copy
      if (result.exerciseId) {
        await writeData(`/exercises/${result.exerciseId}/copyMetadata`, {
          originalAuthor: exercise.teacherId,
          originalExerciseId: exercise.id,
          copiedAt: new Date().toISOString(),
          copiedBy: currentUserId,
        });
      }

      // Increment the timesCopied counter for the original exercise
      try {
        const { data: originalExerciseData } = await readData(`/exercises/${exercise.id}`);
        if (originalExerciseData) {
          const currentTimesCopied = originalExerciseData.timesCopied || 0;
          await writeData(`/exercises/${exercise.id}/timesCopied`, currentTimesCopied + 1);
          console.log(`[CopyExercise] Incremented timesCopied for exercise ${exercise.id}: ${currentTimesCopied} -> ${currentTimesCopied + 1}`);
        }
      } catch (incrementErr) {
        console.error('[CopyExercise] Failed to increment timesCopied:', incrementErr);
        // Don't fail the entire operation if we can't increment the counter
      }

      // Reload all exercises to reflect both the new copy and updated counters
      await Promise.all([
        loadMyExercises(),
        loadPublicExercises()
      ]);
      return { success: true, id: result.exerciseId };
    } catch (err) {
      console.error('[CopyExercise] Failed to copy exercise:', err);
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

  const assignExercise = async (exerciseId: string, classIds: string[], deadline: string, assignedBy: string, acceptLateSubmissions: boolean = true, acceptingStatus: 'open' | 'closed' = 'open', quarter?: 'Quarter 1' | 'Quarter 2' | 'Quarter 3' | 'Quarter 4', targetStudentIds?: string[]) => {
    try {
      // Create assigned exercises with readable IDs (ASSIGNED-0001, ASSIGNED-0002, etc.)
      console.log('[AssignExercise] Creating assignments with readable IDs...');
      
      const promises = classIds.map(async (classId) => {
        const result = await createAssignedExercise({
          exerciseId,
          classId,
          assignedBy,
          deadline,
          acceptLateSubmissions,
          acceptingStatus,
          quarter,
          targetStudentIds
        });
        
        if (result.success && result.assignedId) {
          console.log(`[AssignExercise] Created assignment: ${result.assignedId} for class: ${classId}`);
        }
        
        return result;
      });
      
      const results = await Promise.all(promises);
      
      // Check if any failed
      const failed = results.filter(r => !r.success);
      if (failed.length > 0) {
        throw new Error(`Failed to create ${failed.length} assignment(s)`);
      }

      // Increment the timesUsed counter for the exercise
      try {
        console.log(`[AssignExercise] Reading exercise data for: ${exerciseId}`);
        const { data: exerciseData, error: readError } = await readData(`/exercises/${exerciseId}`);
        
        if (readError) {
          console.error(`[AssignExercise] Error reading exercise data:`, readError);
          throw new Error(`Failed to read exercise: ${readError}`);
        }
        
        if (!exerciseData) {
          console.error(`[AssignExercise] Exercise data not found for: ${exerciseId}`);
          throw new Error(`Exercise not found: ${exerciseId}`);
        }
        
        const currentTimesUsed = exerciseData.timesUsed || 0;
        const newTimesUsed = currentTimesUsed + classIds.length;
        
        console.log(`[AssignExercise] Updating timesUsed for exercise ${exerciseId}: ${currentTimesUsed} -> ${newTimesUsed}`);
        const { success: writeSuccess, error: writeError } = await writeData(`/exercises/${exerciseId}/timesUsed`, newTimesUsed);
        
        if (!writeSuccess || writeError) {
          console.error(`[AssignExercise] Error writing timesUsed:`, writeError);
          throw new Error(`Failed to update timesUsed: ${writeError}`);
        }
        
        console.log(`[AssignExercise] Successfully incremented timesUsed for exercise ${exerciseId}`);
      } catch (incrementErr) {
        console.error('[AssignExercise] Failed to increment timesUsed:', incrementErr);
        // Don't fail the entire operation if we can't increment the counter
        // But log the error for debugging
        if (incrementErr instanceof Error) {
          console.error('[AssignExercise] Error details:', incrementErr.message, incrementErr.stack);
        }
      }

      // Reload both assigned exercises and all exercises to reflect the updated counter
      console.log('[AssignExercise] Reloading exercises data...');
      await Promise.all([
        loadAssignedExercises(),
        loadAllExercises()
      ]);
      console.log('[AssignExercise] Exercises data reloaded successfully');
      return { success: true };
    } catch (err) {
      setError('Failed to assign exercise');
      throw err;
    }
  };

  const deleteAssignment = async (assignmentId: string) => {
    try {
      // Get the assignment data before deleting to know which exercise to decrement
      const { data: assignmentData } = await readData(`/assignedExercises/${assignmentId}`);
      const exerciseId = assignmentData?.exerciseId;
      const classId = assignmentData?.classId;
      
      // Delete associated exercise results
      try {
        const { data: allResults } = await readData('/ExerciseResults');
        if (allResults) {
          const resultEntries = Object.entries(allResults as Record<string, any>);
          const toDelete = resultEntries.filter(([id, res]: any) => {
            const assignedId = res.assignedExerciseId || res.assignmentId || res.assignmentID || res.assignment?.id || res.assignmentMetadata?.assignmentId || res.assignmentMetadata?.assignedExerciseId;
            const resExerciseId = res.exerciseId || res.exerciseInfo?.exerciseId;
            const resClassId = res.classId || res.assignmentMetadata?.classId;
            if (assignedId && assignedId === assignmentId) return true;
            if (resExerciseId && resClassId && resExerciseId === exerciseId && resClassId === classId) return true;
            return false;
          });
          for (const [resultId] of toDelete) {
            await deleteData(`/ExerciseResults/${resultId}`);
          }
          if (toDelete.length > 0) {
            console.log(`[DeleteAssignment] Removed ${toDelete.length} related exercise result(s)`);
          }
        }
      } catch (resErr) {
        console.error('[DeleteAssignment] Failed to delete related results:', resErr);
      }

      await deleteData(`/assignedExercises/${assignmentId}`);
      
      // Decrement the timesUsed counter for the exercise
      if (exerciseId) {
        try {
          const { data: exerciseData } = await readData(`/exercises/${exerciseId}`);
          if (exerciseData) {
            const currentTimesUsed = exerciseData.timesUsed || 0;
            const newTimesUsed = Math.max(0, currentTimesUsed - 1); // Ensure it doesn't go negative
            await writeData(`/exercises/${exerciseId}/timesUsed`, newTimesUsed);
            console.log(`[DeleteAssignment] Decremented timesUsed for exercise ${exerciseId}: ${currentTimesUsed} -> ${newTimesUsed}`);
          }
        } catch (decrementErr) {
          console.error('[DeleteAssignment] Failed to decrement timesUsed:', decrementErr);
          // Don't fail the entire operation if we can't decrement the counter
        }
      }
      
      // Reload both assigned exercises and all exercises to reflect the updated counter
      await Promise.all([
        loadAssignedExercises(),
        loadAllExercises()
      ]);
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