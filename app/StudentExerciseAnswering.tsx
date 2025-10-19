import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useIsFocused } from '@react-navigation/native';
import { AudioSource, AudioStatus, createAudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { Image as ExpoImage } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Speech from 'expo-speech';
// Note: expo-device and expo-network may need to be installed
// import * as Device from 'expo-device';
// import * as Network from 'expo-network';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Animated,
    Dimensions,
    Easing,
    Image,
    ImageBackground,
    LayoutAnimation,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { collectAppMetadata } from '../lib/app-metadata';
import { logErrorWithStack } from '../lib/error-logger';
import { readData, writeData } from '../lib/firebase-database';
import { generateResultId } from '../lib/id-generator';
import {
    validateAndRepairExerciseResult
} from '../lib/result-validation-utils';

// Structured logging helpers (toggleable)
const LOG = {
  media: true,
  preload: true,
  tts: true,
  reorder: true,
};
const log = {
  media: (...args: any[]) => LOG.media && console.log('[Media]', ...args),
  mediaWarn: (...args: any[]) => LOG.media && console.warn('[Media]', ...args),
  preload: (...args: any[]) => LOG.preload && console.log('[Preload]', ...args),
  preloadWarn: (...args: any[]) => LOG.preload && console.warn('[Preload]', ...args),
  tts: (...args: any[]) => LOG.tts && console.log('[TTS]', ...args),
  ttsWarn: (...args: any[]) => LOG.tts && console.warn('[TTS]', ...args),
  reorder: (...args: any[]) => LOG.reorder && console.log('[Reorder]', ...args),
};

// Lightweight log gating to reduce noise while keeping useful diagnostics
// Levels: none < error < warn < info < debug
const LOG_LEVEL: 'none' | 'error' | 'warn' | 'info' | 'debug' = __DEV__ ? 'info' : 'warn';
const LEVEL_ORDER: Record<'none' | 'error' | 'warn' | 'info' | 'debug', number> = {
  none: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
};

// Tag switches - enable only what we need by default
const ENABLED_TAGS: Record<string, boolean> = {
  Submission: true, // keep succinct submission milestones
  Reorder: false,
  AttemptHistory: false,
  ResultCreation: false,
  ResultsUI: false,
  LoadExercise: false,
  Matching: false,
  Media: false,
  Preload: false,
  TTS: false,
  HandleNext: false,
  UpdateAnswers: false,
};

const originalConsole = {
  log: console.log,
  warn: console.warn,
  error: console.error,
};

function allowedByLevel(level: 'error' | 'warn' | 'info' | 'debug') {
  return LEVEL_ORDER[LOG_LEVEL] >= LEVEL_ORDER[level];
}

function shouldAllow(tag: string, level: 'error' | 'warn' | 'info' | 'debug', firstArg: string): boolean {
  if (!allowedByLevel(level)) return false;
  // Errors always pass through
  if (level === 'error') return true;
  const enabled = ENABLED_TAGS[tag];
  if (enabled) return true;
  // Special minimal allowlist for Submission info logs to avoid spam
  if (tag === 'Submission' && level === 'info') {
    const keepSnippets = [
      'SAVE SUCCESSFUL',
      'Saved Data Summary',
      'FINAL VERIFICATION (VALIDATED DATA)',
      'Result ID:',
      'Database path used:',
    ];
    return keepSnippets.some(s => firstArg.includes(s));
  }
  return false;
}

// Intercept console calls and filter bracket-tagged logs like "[Submission] ..."
console.log = (...args: any[]) => {
  if (args.length > 0 && typeof args[0] === 'string') {
    const first = String(args[0]);
    const m = first.match(/^\[([^\]]+)\]/);
    if (m) {
      const tag = m[1];
      if (!shouldAllow(tag, 'info', first)) return;
    } else if (!allowedByLevel('info')) {
      return;
    }
  } else if (!allowedByLevel('info')) {
    return;
  }
  originalConsole.log(...args);
};

console.warn = (...args: any[]) => {
  if (args.length > 0 && typeof args[0] === 'string') {
    const first = String(args[0]);
    const m = first.match(/^\[([^\]]+)\]/);
    if (m) {
      const tag = m[1];
      if (!shouldAllow(tag, 'warn', first)) return;
    } else if (!allowedByLevel('warn')) {
      return;
    }
  } else if (!allowedByLevel('warn')) {
    return;
  }
  originalConsole.warn(...args);
};

console.error = (...args: any[]) => {
  // Always allow errors, but still respect minimal level 'error'
  if (!allowedByLevel('error')) return;
  originalConsole.error(...args);
};

// Standalone component for Re-order interaction to keep hooks valid
const ReorderQuestion = React.memo(({
  question,
  initialAnswer,
  onChange,
  onComplete,
  onAttempt,
  currentAttempts = 0,
  maxAttempts = null,
}: {
  question: Question;
  initialAnswer: ReorderItem[];
  onChange: (ordered: ReorderItem[]) => void;
  onComplete?: (isCorrect: boolean, finalAnswer: string[]) => void;
  onAttempt?: (attemptSequence: string[]) => void;
  currentAttempts?: number;
  maxAttempts?: number | null;
}) => {
  /**
   * ============================================================
   * RE-ORDER EXERCISE COMPONENT - FIXED & STABLE VERSION
   * ============================================================
   * 
   * STATE STRUCTURE (Single Source of Truth):
   * - slots: (ReorderItem | null)[] - holds items in each slot
   * - pool: ReorderItem[] - unassigned items available for dragging
   * - lockedSlots: Set<number> - indices of slots with correct items
   * - correctSequence: string[] - IDs of items in correct order
   * 
   * KEY FEATURES:
   * ✅ Auto-validates when all slots filled
   * ✅ Locks correct items, returns only wrong items to pool
   * ✅ Prevents dragging from/to locked slots
   * ✅ Prevents duplicate items in pool
   * ✅ Proper attempt tracking and max attempts handling
   * ✅ Lock indicator shows for correct items (green lock icon)
   * ✅ Status indicators (✓/✗) for validation results
   * ✅ No ghost items or visual desyncs
   * ✅ Correct items NEVER disappear during validation
   * 
   * VALIDATION FLOW:
   * 1. Student fills all slots → Auto-validation triggers
   * 2. System validates each slot against correctSequence
   * 3. CORRECT items → Lock in place, stay in slots permanently
   * 4. WRONG items → Clear from slots, return to pool
   * 5. Attempt counter increments by 1
   * 6. Continue until all correct OR max attempts reached
   * 
   * COMPLETION BEHAVIOR:
   * - All correct before max attempts → Mark as correct, auto-advance
   * - Max attempts reached → Lock all slots, show state for 2s, mark as wrong, advance
   * - No premature completion - always respects attempt limits
   * 
   * 
   * LOCKING BEHAVIOR:
   * - Correct items cannot be dragged or removed
   * - Locked slots reject all drops
   * - Green lock indicator displays on correct items
   * - Locked state persists until question completion
   * ============================================================
   */

  const items: ReorderItem[] = useMemo(() => {
    const originalItems = (question.reorderItems || []).map((it) => ({ ...it }));
    // Items are already shuffled during validation, so use them as-is
    console.log('[Reorder] Using validated items:', originalItems.map(item => item.id));
    return originalItems;
  }, [question.id]);
  const slotsCount = items.length;
  // CRITICAL: correctSequence should be based on the original order before validation shuffling
  // We need to determine the correct order based on the question's intended sequence
  const correctSequence = useMemo(() => {
    // For reorder questions, the correct sequence is typically the order they should be arranged
    // Since we shuffled during validation, we need to reconstruct the original correct order
    const originalItems = question.reorderItems || [];
    
    // If there's an explicit order specified, use that
    if (question.order && question.order.length > 0) {
      return question.order as string[];
    }
    
    // Otherwise, use the original order of reorderItems
    return originalItems.map(item => item.id);
  }, [question.reorderItems, question.order]);
  
  // Store original order for consistent return behavior
  const originalOrderRef = useRef<ReorderItem[]>([]);

  // Helper function to restore pool to original order
  const restorePoolToOriginalOrder = useCallback((currentPool: ReorderItem[]) => {
    if (originalOrderRef.current.length === 0) {
      console.warn('[Reorder] No original order stored, returning current pool');
      return currentPool;
    }
    
    // Create a map of current pool items for quick lookup
    const poolItemMap = new Map(currentPool.map(item => [item.id, item]));
    
    // Reconstruct pool maintaining exact original order
    const orderedPool = originalOrderRef.current.filter(item => poolItemMap.has(item.id));
    
    console.log('[Reorder] Restored pool to original order:', orderedPool.map(item => item.id));
    return orderedPool;
  }, []);

  const [slotLayouts, setSlotLayouts] = useState<{ x: number; y: number; width: number; height: number }[]>(
    Array(slotsCount).fill(null)
  );
  const slotLayoutsRef = useRef<{ x: number; y: number; width: number; height: number }[]>(
    Array(slotsCount).fill(null)
  );
  const [slots, setSlots] = useState<(ReorderItem | null)[]>(Array(slotsCount).fill(null));
  const [pool, setPool] = useState<ReorderItem[]>([]);
  const [lockedSlots, setLockedSlots] = useState<Set<number>>(new Set());
  const panRespondersRef = useRef<Map<string, any>>(new Map());
  const slotRefs = useRef<Record<number, any>>({});
  const lastNotifiedRef = useRef<string>('');
  const [isValidating, setIsValidating] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const isValidatingRef = useRef(false);
  const isCompletedRef = useRef(false);
  const isDraggingRef = useRef(false);
  const currentAttemptsRef = useRef(currentAttempts);
  const draggedItemRef = useRef<{item: ReorderItem, fromPool: boolean, fromSlot?: number} | null>(null);
  const hasCalledOnCompleteRef = useRef(false);
  const isClearingWrongItemsRef = useRef(false);
  // Validation cycle identifier to ensure exactly-once attempt handling per validation
  const validationIdRef = useRef(0);
  // Single-submit guard to avoid overlapping validations/popups/increments
  const isSubmittingRef = useRef(false);
  // Per-validation once-only gates
  const attemptGateRef = useRef<number | null>(null);
  const completeGateRef = useRef<number | null>(null);

  // Keep currentAttemptsRef in sync with prop
  useEffect(() => {
    console.log('[Reorder] Attempt count prop updated from', currentAttemptsRef.current, 'to', currentAttempts);
    currentAttemptsRef.current = currentAttempts;
  }, [currentAttempts]);

  // Reset function to clear all slots and return items to pool
  const resetToInitialState = useCallback(() => {
    console.log('[Reorder] Resetting to initial state - clearing all slots and returning items to pool');
    
    // Clear all slots
    setSlots(Array(slotsCount).fill(null));
    
    // Return all items to pool
    setPool([...items]);
    
    // Clear locked slots
    setLockedSlots(new Set());
    
    // Reset validation and completion states
    setIsValidating(false);
    setIsCompleted(false);
    isValidatingRef.current = false;
    isCompletedRef.current = false;
    isClearingWrongItemsRef.current = false;
    hasCalledOnCompleteRef.current = false;
    
    // Clear dragged item
    draggedItemRef.current = null;
    
    console.log('[Reorder] Reset complete - all items returned to pool');
  }, [items, slotsCount]);

  // CRITICAL FIX: Reset component completely when question changes
  useEffect(() => {
    
    // Clear all pan responders
    panRespondersRef.current.clear();
    
    // Reset layouts
    setSlotLayouts(Array(slotsCount).fill(null));
    slotLayoutsRef.current = Array(slotsCount).fill(null);
    
    // Reset validation and completion states
    setIsValidating(false);
    setIsCompleted(false);
    isValidatingRef.current = false;
    isCompletedRef.current = false;
    isDraggingRef.current = false;
    isClearingWrongItemsRef.current = false;
    draggedItemRef.current = null;
    lastNotifiedRef.current = '';
    currentAttemptsRef.current = currentAttempts;
    hasCalledOnCompleteRef.current = false;
    // Reset validation cycle id
    validationIdRef.current = 0;
    
    // Reset locked slots
    setLockedSlots(new Set());
    
    // CRITICAL FIX: Validate that initialAnswer items belong to this question
    // Create a Set of valid item IDs for this question
    const validItemIds = new Set(items.map(it => it.id));
    
    // Filter initialAnswer to only include items that belong to this question
    const validInitialAnswer = (initialAnswer && initialAnswer.length > 0)
      ? initialAnswer.filter(it => validItemIds.has(it.id))
      : [];
    
    console.log('[Reorder-Reset] Question changed to:', question.id);
    console.log('[Reorder-Reset] Valid item IDs for this question:', Array.from(validItemIds));
    console.log('[Reorder-Reset] Initial answer provided:', initialAnswer?.map(it => it.id));
    console.log('[Reorder-Reset] Valid initial answer (filtered):', validInitialAnswer.map(it => it.id));
    
    // ENHANCED FIX: Always start with a clean state for each question
    // Don't carry over any previous question's state
    // Keep original order instead of shuffling for better UX
    const originalOrderItems = [...items];
    
    // Store the original order for consistent return behavior
    originalOrderRef.current = originalOrderItems;
    
    console.log('[Reorder-Reset] Starting with original order items for question:', question.id);
    console.log('[Reorder-Reset] Original order items:', originalOrderItems.map(it => it.id));
    
    // CRITICAL FIX: Always start with original order, ignore any previous state
    // This ensures no items from previous questions carry over
    console.log('[Reorder-Reset] Fresh start - all items in original order:', originalOrderItems.length);
    setSlots(Array(slotsCount).fill(null));
    setPool(originalOrderItems);
  }, [question.id, items]); // CRITICAL: Reset when question ID or items change, NOT on attempt changes

  // Notify parent of changes ONLY when slots actually change (debounced)
  useEffect(() => {
    // CRITICAL: Don't process if already completed, validating, dragging, or clearing wrong items
    if (isCompletedRef.current || isValidatingRef.current || isDraggingRef.current || isClearingWrongItemsRef.current) {
      console.log('[Reorder] Skipping effect - completed:', isCompletedRef.current, 'validating:', isValidatingRef.current, 'dragging:', isDraggingRef.current, 'clearing:', isClearingWrongItemsRef.current);
      return;
    }
    
    const ordered = slots.filter(Boolean) as ReorderItem[];
    const serialized = JSON.stringify(ordered.map(s => s.id));
    
    // Only notify parent if the actual order changed AND not in any blocking state
    if (serialized !== lastNotifiedRef.current && !isCompletedRef.current && !isValidatingRef.current && !isClearingWrongItemsRef.current) {
      console.log('[Reorder] Slots changed - serialized:', serialized, 'previous:', lastNotifiedRef.current);
      lastNotifiedRef.current = serialized;
      onChange(ordered);
      
      // Auto-validate when all slots are filled and not already validating or completed
      const allFilled = slots.every(s => s !== null);
      if (allFilled && !isValidatingRef.current && !isCompletedRef.current) {
        // Prevent overlapping validations within a short window
        if (isSubmittingRef.current) {
          console.log('[Reorder] Validation suppressed: submit in progress');
          return;
        }
        console.log('[Reorder] ✓ All slots filled (', ordered.length, '/', slotsCount, '), starting validation...');
        console.log('[Reorder] Current attempt count before validation:', currentAttemptsRef.current);
        console.log('[Reorder] Validation will fire in 300ms...');
        setIsValidating(true);
        isValidatingRef.current = true;
        isSubmittingRef.current = true;
        // Start a new validation cycle
        const thisValidationId = ++validationIdRef.current;
        // Reset per-validation gates
        attemptGateRef.current = thisValidationId;
        completeGateRef.current = thisValidationId;
        console.log('[Reorder] Set isSubmittingRef=true, validationId=', thisValidationId);
        
        setTimeout(() => {
          // CRITICAL: Double-check completion AND validation status before validating
          if (isCompletedRef.current || !isValidatingRef.current || validationIdRef.current !== thisValidationId) {
            console.log('[Reorder] Aborting validation - completed:', isCompletedRef.current, 'validating:', isValidatingRef.current);
            setIsValidating(false);
            isValidatingRef.current = false;
            isSubmittingRef.current = false;
            console.log('[Reorder] Cleared isSubmittingRef due to abort for validationId=', thisValidationId);
            return;
          }
          // Prevent duplicate validation cycles
          if (attemptGateRef.current === null || isSubmittingRef.current === false) {
            console.log('[Reorder] Duplicate or stale validation prevented.');
            setIsValidating(false);
            return;
          }
          
          // Validate against exact slot positions to avoid index compression issues
          const isCorrect = slots.every((slotItem, idx) => slotItem && slotItem.id === correctSequence[idx]);
          
          console.log('[Reorder] ========== VALIDATION START ==========');
          console.log('[Reorder] Validation result:', isCorrect ? 'CORRECT' : 'WRONG');
          console.log('[Reorder] Current attempts BEFORE processing:', currentAttemptsRef.current);
          console.log('[Reorder] Current slots state:', slots.map(item => item ? item.id : null));
          console.log('[Reorder] Expected sequence:', correctSequence);
          console.log('[Reorder] Timestamp:', new Date().toISOString());
          console.log('[Reorder] validationId=', thisValidationId, 'attemptGateRef=', attemptGateRef.current, 'completeGateRef=', completeGateRef.current, 'isSubmittingRef=', isSubmittingRef.current);
          
          // CRITICAL FIX: Only increment attempt counter when answer is WRONG
          // Correct answers should NOT increment attempts
          let newAttemptCount = currentAttemptsRef.current || 0;
          let hasReachedLimit = false;
          
          if (!isCorrect) {
            // WRONG ANSWER - Always record this validation as a single attempt
            if (onAttempt && attemptGateRef.current === thisValidationId) {
              console.log('[Reorder] Wrong answer - calling onAttempt (once), validationId=', thisValidationId);
              onAttempt(ordered.map(item => item.id));
              console.log('[Reorder] onAttempt triggered once for validationId:', thisValidationId);
              // Close the gate to prevent duplicate attempt logging
              attemptGateRef.current = null;
              // Optional: delayed ensure-close in case of batched renders
              setTimeout(() => { attemptGateRef.current = null; }, 500);
            } else {
              console.log('[Reorder] Skipping onAttempt - gate closed or validationId mismatch');
            }
            
            // CRITICAL FIX: Use ref value for stable count during validation cycle
            // The ref is synced at component mount and via useEffect, so it's reliable
            // Calculate what the count WILL BE after this attempt
            const currentCount = currentAttemptsRef.current || 0;
            newAttemptCount = currentCount + 1;
            
            // Check if we've reached the attempt limit AFTER this attempt
            hasReachedLimit = maxAttempts !== null && newAttemptCount >= maxAttempts;
            
            console.log('[Reorder] Attempt limit check:');
            console.log('[Reorder] Current attempts (from ref):', currentCount);
            console.log('[Reorder] After this wrong attempt will be:', newAttemptCount);
            console.log('[Reorder] Max attempts allowed:', maxAttempts);
            console.log('[Reorder] Has reached limit?', hasReachedLimit);
            console.log('[Reorder] Logic: ' + newAttemptCount + ' >= ' + maxAttempts + ' = ' + hasReachedLimit);
            
            if (!hasReachedLimit) {
              const attemptsLeft = maxAttempts !== null ? (maxAttempts - newAttemptCount) : 'unlimited';
              console.log('[Reorder] Attempts remaining:', attemptsLeft);
            }
          } else {
            // CORRECT ANSWER - Don't increment attempts
            console.log('[Reorder] Correct answer - NO attempt increment');
          }
          
          if (isCorrect) {
            console.log('[Reorder] ✅ All correct! Marking as completed.');
            
            // CRITICAL: Set completion flags IMMEDIATELY to prevent re-validation
            setIsCompleted(true);
            isCompletedRef.current = true;
            setIsValidating(false);
            isValidatingRef.current = false;
            
            // Lock all slots
            const allIndices = new Set(Array.from({ length: slotsCount }, (_, i) => i));
            setLockedSlots(allIndices);
            
            // Do not trigger correct feedback here; parent handles it once
            
            // Notify parent that the answer is correct and complete (only once)
            if (onComplete && completeGateRef.current === thisValidationId && !hasCalledOnCompleteRef.current) {
              hasCalledOnCompleteRef.current = true;
              // Close the completion gate for this validation
              completeGateRef.current = null;
              setTimeout(() => {
                console.log('[Reorder] Calling onComplete(true) - all correct, validationId=', thisValidationId);
                onComplete(true, ordered.map(item => item.id));
              }, 500);
            } else {
              console.log('[Reorder] Skipping onComplete(true) - gate closed or already called');
            }
          } else if (hasReachedLimit) {
            console.log('[Reorder] ========== MAX ATTEMPTS REACHED ==========');
            console.log('[Reorder] ❌ Attempt limit exhausted');
            console.log('[Reorder] Final attempt count:', newAttemptCount);
            console.log('[Reorder] Max attempts allowed:', maxAttempts);
            console.log('[Reorder] Current answer state:', ordered.map(item => item.id));
            console.log('[Reorder] =======================================');
            
            // CRITICAL: Set completion flags FIRST to prevent any further validation or state changes
            setIsCompleted(true);
            isCompletedRef.current = true;
            setIsValidating(false);
            isValidatingRef.current = false;
            
            // Keep current state visible (don't clear slots) so user can see what they had
            // Lock ALL slots to prevent further changes
            const allIndices = new Set(Array.from({ length: slotsCount }, (_, i) => i));
            setLockedSlots(allIndices);
            console.log('[Reorder] All slots locked - no more changes allowed');
            
            // Do not trigger wrong feedback here; it was already shown in onAttempt
            
            // DON'T call onChange here - it will trigger a re-render and validation loop
            // The parent already has the answer from previous onChange calls
            console.log('[Reorder] Max attempts exhausted, NOT calling onChange to prevent loop');
            
            // CRITICAL FIX: Call onComplete(false) with a delay so user sees the locked state (only once)
            // This will mark the question as incorrect and trigger advancement
            if (onComplete && completeGateRef.current === thisValidationId && !hasCalledOnCompleteRef.current) {
              hasCalledOnCompleteRef.current = true;
              completeGateRef.current = null;
              console.log('[Reorder] Scheduling onComplete(false) call after 2s delay, validationId=', thisValidationId);
              console.log('[Reorder] This will mark question as WRONG and auto-advance');
              setTimeout(() => {
                console.log('[Reorder] Calling onComplete(false) after max attempts, validationId=', thisValidationId);
                onComplete(false, ordered.map(item => item.id));
              }, 2000);
            } else if (hasCalledOnCompleteRef.current) {
              console.log('[Reorder] Already called onComplete, preventing duplicate call');
            } else {
              console.log('[Reorder] Skipping onComplete(false) - gate closed or validationId mismatch');
            }
          } else {
            // Some items wrong, return them to pool and let student try again
            const attemptsLeft = maxAttempts !== null ? (maxAttempts - newAttemptCount) : 'unlimited';
            console.log('[Reorder] ❌ Some items wrong. Keeping correct ones, returning wrong ones to pool.');
            console.log('[Reorder] Attempts remaining:', attemptsLeft);
            // Haptic handled once in triggerWrongFeedback
            
            // CRITICAL: Set clearing flag IMMEDIATELY to block effect from running during state updates
            isClearingWrongItemsRef.current = true;
            console.log('[Reorder] Set clearing flag to prevent validation loops');
            
            // Return incorrect items to pool after a short delay, but KEEP correct items locked in place
            setTimeout(() => {
              try {
                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              } catch {}
              const wrongIndices: number[] = [];
              const wrongItems: ReorderItem[] = [];
              const correctIndices: number[] = [];
              
              // Compare by actual slot index; do not compress nulls
              slots.forEach((slotItem, idx) => {
                if (!slotItem) return;
                if (slotItem.id !== correctSequence[idx]) {
                  wrongIndices.push(idx);
                  wrongItems.push(slotItem);
                  console.log('[Reorder] Item', slotItem.id, 'at slot', idx, 'is WRONG - will return to pool');
                } else {
                  correctIndices.push(idx);
                  console.log('[Reorder] Item', slotItem.id, 'at slot', idx, 'is CORRECT - locking it');
                }
              });
              
              // Lock the correct slots
              if (correctIndices.length > 0) {
                setLockedSlots((prev) => {
                  const next = new Set(prev);
                  correctIndices.forEach(idx => next.add(idx));
                  console.log('[Reorder] Locked slots:', Array.from(next));
                  return next;
                });
              }
              
              if (wrongItems.length > 0) {
                console.log('[Reorder] Returning', wrongItems.length, 'wrong items to pool:', wrongItems.map(i => i.id));
                console.log('[Reorder] Keeping', correctIndices.length, 'correct items in slots:', correctIndices);
                
                // CRITICAL: Batch state updates to prevent multiple re-renders
                // Use functional updates to ensure we're working with latest state
                
                // Step 1: Clear wrong slots (preserving correct ones)
                setSlots((prev) => {
                  const next = [...prev];
                  wrongIndices.forEach(idx => {
                    // Double-check we're not clearing a correct slot
                    if (!correctIndices.includes(idx)) {
                      console.log('[Reorder] Clearing slot', idx, '(wrong item)');
                      next[idx] = null;
                    } else {
                      console.error('[Reorder] ERROR: Attempted to clear correct slot', idx, '- preventing!');
                    }
                  });
                  
                  // Log final state for debugging
                  const filledCount = next.filter(Boolean).length;
                  console.log('[Reorder] After clearing wrong slots:', filledCount, 'items remain in slots');
                  return next;
                });
                
                // Step 2: Add wrong items back to pool maintaining original order
                setPool((prevPool) => {
                  console.log('[Reorder] Adding', wrongItems.length, 'items back to pool');
                  
                  // Add wrong items to current pool
                  const combinedPool = [...prevPool, ...wrongItems];
                  
                  // Restore to original order using helper function
                  return restorePoolToOriginalOrder(combinedPool);
                });
              } else {
                console.log('[Reorder] All items in their correct positions!');
              }
              
              // Reset ALL flags after returning items - critical to do this last
              console.log('[Reorder] Resetting validation and clearing flags, ready for next attempt');
              setIsValidating(false);
              isValidatingRef.current = false;
              isClearingWrongItemsRef.current = false;
              
              // CRITICAL FIX: Reset lastNotifiedRef to allow fresh validation on next fill
              // This ensures the effect will trigger onChange when slots are refilled
              lastNotifiedRef.current = '';
              console.log('[Reorder] Reset lastNotifiedRef to allow next validation');
              console.log('[Reorder] ========== READY FOR NEXT ATTEMPT ==========');
            }, 800);
          }
          // Reset submission guard at the end of the validation timeout
          isSubmittingRef.current = false;
          console.log('[Reorder] Cleared isSubmittingRef at end of validation timeout, validationId=', thisValidationId);
        }, 300);
      }
    }
  }, [slots, slotsCount, correctSequence, onChange, onAttempt, onComplete, maxAttempts]);

  // Place item into slot (FIXED: no nested setState calls)
  const placeIntoSlot = useCallback((item: ReorderItem, slotIndex: number) => {
    // Don't allow placing if validating or completed (use refs for immediate check)
    if (isValidatingRef.current || isCompletedRef.current || lockedSlots.has(slotIndex)) {
      console.log('[Reorder] Cannot place - validating, completed, or slot is locked');
      return false;
    }
    
    // Validate slot index
    if (slotIndex < 0 || slotIndex >= slotsCount) {
      console.log('[Reorder] Invalid slot index:', slotIndex);
      return false;
    }
    
    console.log('[Reorder] Placing item', item.id, 'into slot', slotIndex);
    
    // Get previous item before state updates
    const currentSlots = slots;
    const prevAtSlot = currentSlots[slotIndex];
    
    // Check if item is already in this slot
    if (prevAtSlot && prevAtSlot.id === item.id) {
      console.log('[Reorder] Item already in this slot - no change needed');
      return true;
    }
    
    // Animate layout change for smooth placement
    try {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    } catch {}
    
    // Update slots: place new item
    setSlots((prev) => {
      const next = [...prev];
      next[slotIndex] = item;
      console.log('[Reorder] Slot', slotIndex, 'updated with item', item.id);
      return next;
    });
    
    // Update pool: remove placed item and optionally add swapped item maintaining original order
    setPool((p) => {
      // Remove the item being placed
      let newPool = p.filter((x) => x.id !== item.id);
      
      // Add the previous slot item if it exists and is different
      if (prevAtSlot && prevAtSlot.id !== item.id) {
        // Check for duplicates before adding
        if (!newPool.some(poolItem => poolItem.id === prevAtSlot.id)) {
          newPool = [...newPool, prevAtSlot];
        }
      }
      
      // Restore to original order using helper function
      return restorePoolToOriginalOrder(newPool);
    });
    
    return true;
  }, [slots, lockedSlots, slotsCount, restorePoolToOriginalOrder]);

  // Remove item from slot when dragging starts
  const removeFromSlotForDrag = useCallback((slotIndex: number) => {
    if (lockedSlots.has(slotIndex)) {
      console.log('[Reorder] Cannot drag - slot is locked');
      return false;
    }
    setSlots((prev) => {
      const next = [...prev];
      next[slotIndex] = null;
      return next;
    });
    return true;
  }, [lockedSlots]);
  

  // Create or get pan responder for an item in the pool - STABLE VERSION WITH FIXED RETURN LOGIC
  const getPanResponder = useCallback((item: ReorderItem, fromSlotIndex?: number) => {
    const key = fromSlotIndex !== undefined ? `${item.id}-slot-${fromSlotIndex}` : item.id;
    
    if (panRespondersRef.current.has(key)) {
      return panRespondersRef.current.get(key)!;
    }

    const position = new Animated.ValueXY();
    const PanResponder = require('react-native').PanResponder;
    
    const responder = PanResponder.create({
      onStartShouldSetPanResponder: () => {
        // Don't allow dragging if validating or completed
        return !isValidatingRef.current && !isCompletedRef.current;
      },
      onMoveShouldSetPanResponder: () => {
        // Don't allow dragging if validating or completed
        return !isValidatingRef.current && !isCompletedRef.current;
      },
      onPanResponderGrant: () => {
        // Set dragging flag to prevent validation
        isDraggingRef.current = true;
        
        // Track what item is being dragged and where from
        draggedItemRef.current = {
          item,
          fromPool: fromSlotIndex === undefined,
          fromSlot: fromSlotIndex
        };
        
        console.log('[Drag] Starting drag:', draggedItemRef.current);
        
        // Haptic feedback when starting drag
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        
        // If dragging from a slot, remove it from that slot first
        if (fromSlotIndex !== undefined) {
          console.log('[Drag] Removing from slot', fromSlotIndex, 'for drag');
          removeFromSlotForDrag(fromSlotIndex);
        }
        // If dragging from pool, DON'T remove it - let it stay visible during drag
        // It will be removed only when successfully placed in a slot
        
        position.setOffset({
          x: (position.x as any)._value,
          y: (position.y as any)._value,
        });
        position.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: Animated.event(
        [null, { dx: position.x, dy: position.y }],
        { useNativeDriver: false }
      ),
      onPanResponderRelease: (_: any, gesture: any) => {
        position.flattenOffset();
        
        const dropX = gesture.moveX;
        const dropY = gesture.moveY;
        const wasFromPool = draggedItemRef.current?.fromPool || false;
        const wasFromSlot = draggedItemRef.current?.fromSlot;
        
        console.log('[Drag] Release at:', { dropX, dropY, wasFromPool, wasFromSlot });
        
        let targetSlot = -1;
        let bestDistance = Infinity;
        
        // Improved drop zone detection with better accuracy
        slotLayoutsRef.current.forEach((layout, idx) => {
          if (!layout || lockedSlots.has(idx)) {
            console.log(`[Drag] Slot ${idx} skipped - no layout or locked`);
            return;
          }
          
          // Calculate center point of the slot for more accurate detection
          const centerX = layout.x + layout.width / 2;
          const centerY = layout.y + layout.height / 2;
          
          // Check if drop point is within slot bounds with some tolerance
          const tolerance = 20; // pixels of tolerance for easier dropping
          const within = 
            dropX >= layout.x - tolerance && 
            dropX <= layout.x + layout.width + tolerance && 
            dropY >= layout.y - tolerance && 
            dropY <= layout.y + layout.height + tolerance;
          
          if (within) {
            // Calculate distance to center for better accuracy
            const distance = Math.sqrt(
              Math.pow(dropX - centerX, 2) + Math.pow(dropY - centerY, 2)
            );
            
            console.log(`[Drag] Checking slot ${idx}:`, { 
              layout, 
              within,
              dropX, 
              dropY,
              centerX,
              centerY,
              distance,
              isLocked: lockedSlots.has(idx)
            });
            
            // Choose the closest slot if multiple are within range
            if (distance < bestDistance) {
              targetSlot = idx;
              bestDistance = distance;
            }
          }
        });
        
        console.log('[Drag] Target slot:', targetSlot, 'Distance:', bestDistance);
        
        if (targetSlot >= 0) {
          // Item was dropped in a valid slot
          console.log('[Drag] ✅ Placing into slot:', targetSlot);
          
          // Haptic feedback for successful placement
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          
          placeIntoSlot(item, targetSlot);
          
          // Animate to center of slot for better visual feedback
          const targetLayout = slotLayoutsRef.current[targetSlot];
          if (targetLayout) {
            const centerX = targetLayout.x + targetLayout.width / 2;
            const centerY = targetLayout.y + targetLayout.height / 2;
            
            Animated.spring(position, {
              toValue: { x: centerX - dropX, y: centerY - dropY },
              useNativeDriver: false,
              friction: 8,
              tension: 100,
            }).start(() => {
              // Reset position after animation
              position.setValue({ x: 0, y: 0 });
            });
          }
        } else {
          // Item was NOT dropped in any valid slot - return to original position
          console.log('[Drag] ❌ No valid slot found - returning to original position');
          
          // Haptic feedback for failed placement
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          
          if (wasFromPool) {
            // Item was from pool and not placed - return to pool maintaining original order
            console.log('[Drag] ℹ️ Item from pool not placed - returning to pool');
            
            setPool((prev) => {
              // Safety check: only add if not already in pool
              const alreadyInPool = prev.some(p => p.id === item.id);
              if (alreadyInPool) {
                console.log('[Drag] Item already in pool, not adding duplicate');
                return prev;
              }
              console.log('[Drag] Adding item back to pool maintaining original order');
              
              // Add item to current pool
              const newPool = [...prev, item];
              
              // Restore to original order using helper function
              return restorePoolToOriginalOrder(newPool);
            });
          } else if (wasFromSlot !== undefined) {
            // Item was from a slot and not placed - return to pool maintaining original order
            console.log('[Drag] ⚠️ Item from slot not placed - returning to pool');
            setPool((prev) => {
              // Safety check: only add if not already in pool
              const alreadyInPool = prev.some(p => p.id === item.id);
              if (alreadyInPool) {
                console.log('[Drag] Item already in pool, not adding duplicate');
                return prev;
              }
              console.log('[Drag] Adding item back to pool maintaining original order');
              
              // Add item to current pool
              const newPool = [...prev, item];
              
              // Restore to original order using helper function
              return restorePoolToOriginalOrder(newPool);
            });
          }
          
          // Smooth animation back to original position
          Animated.spring(position, {
            toValue: { x: 0, y: 0 },
            useNativeDriver: false,
            friction: 6,
            tension: 120,
          }).start();
        }
        
        // Clear dragged item ref
        draggedItemRef.current = null;
        
        // Reset dragging flag after a small delay to allow state updates
        setTimeout(() => {
          isDraggingRef.current = false;
        }, 150);
      },
    });

    const panResponderData = { position, responder };
    panRespondersRef.current.set(key, panResponderData);
    return panResponderData;
  }, [placeIntoSlot, removeFromSlotForDrag, restorePoolToOriginalOrder]);

  const Slot = ({ index }: { index: number }) => {
    const item = slots[index];
    const isComplete = slots.filter(Boolean).length === slotsCount;
    const isCorrect = isComplete && item?.id === correctSequence[index];
    const isIncorrect = isComplete && item && !isCorrect;
    const isLocked = lockedSlots.has(index);
    
    // Get pan responder for item in slot (if it exists and not completed or validating)
    // Use state values here so component re-renders when these change
    const pan = item && !isCompleted && !isValidating && !isLocked ? getPanResponder(item, index) : null;
    
    return (
      <View
        ref={(ref) => {
          if (ref) slotRefs.current[index] = ref;
        }}
        onLayout={() => {
          const ref = slotRefs.current[index];
          if (ref && typeof ref.measureInWindow === 'function') {
            ref.measureInWindow((px: number, py: number, width: number, height: number) => {
              const layout = { x: px, y: py, width, height };
              slotLayoutsRef.current[index] = layout;
              setSlotLayouts((prev) => {
                const next = [...prev];
                next[index] = layout;
                return next;
              });
            });
          }
        }}
        style={[
          styles.reorderSlot,
          // Enhanced visual states for better user feedback
          isCorrect && { 
            borderColor: '#22c55e', 
            shadowColor: '#22c55e', 
            backgroundColor: 'rgba(240, 253, 244, 0.95)',
            borderWidth: 3,
            shadowOffset: { width: 0, height: 3 },
            shadowOpacity: 0.2,
            shadowRadius: 4,
            elevation: 4
          },
          isIncorrect && { 
            borderColor: '#ef4444', 
            shadowColor: '#ef4444', 
            backgroundColor: 'rgba(254, 242, 242, 0.95)',
            borderWidth: 3,
            shadowOffset: { width: 0, height: 3 },
            shadowOpacity: 0.2,
            shadowRadius: 4,
            elevation: 4
          },
          // Visual feedback for locked slots
          isLocked && { 
            borderColor: '#10b981', 
            backgroundColor: 'rgba(236, 253, 245, 0.8)',
            borderWidth: 2
          },
          // Visual feedback for empty slots (drop zones)
          !item && !isLocked && {
            borderColor: '#f59e0b',
            borderStyle: 'dashed',
            backgroundColor: 'rgba(255, 251, 235, 0.3)'
          }
        ]}
      >
        {item ? (
          pan ? (
            <Animated.View
              key={`slot-content-${item.id}`}
              style={[
                styles.slotFilledCard,
                isCorrect && { borderColor: '#22c55e' },
                isIncorrect && { borderColor: '#ef4444' },
                {
                  transform: [
                    { translateX: pan.position.x },
                    { translateY: pan.position.y },
                  ],
                },
              ]}
              pointerEvents="box-none"
            >
              {/* Draggable area - the content */}
              <View 
                {...pan.responder.panHandlers}
                style={{ flex: 1, width: '100%', height: '100%' }}
              >
                {item.type === 'image' && item.imageUrl ? (
                  <View pointerEvents="none" style={{ width: '100%', height: '100%' }}>
                    <Image
                      source={{ uri: item.imageUrl }}
                      style={styles.reorderChoiceImage}
                      resizeMode="contain"
                      fadeDuration={0}
                    />
                  </View>
                ) : (
                  <Text style={[
                    styles.reorderChoiceText,
                    isCorrect && { color: '#22c55e' },
                    isIncorrect && { color: '#ef4444' }
                  ]}
                    pointerEvents="none"
                  >
                    {item.content}
                  </Text>
                )}
              </View>
              
            </Animated.View>
          ) : (
            <View 
              key={`slot-content-${item.id}`}
              style={[
                styles.slotFilledCard,
                isCorrect && { borderColor: '#22c55e' },
                isIncorrect && { borderColor: '#ef4444' }
              ]}
              pointerEvents="box-none"
            >
              {item.type === 'image' && item.imageUrl ? (
                <View pointerEvents="none" style={{ width: '100%', height: '100%' }}>
                  <Image
                    source={{ uri: item.imageUrl }}
                    style={styles.reorderChoiceImage}
                    resizeMode="contain"
                    fadeDuration={0}
                  />
                </View>
              ) : (
                <Text style={[
                  styles.reorderChoiceText,
                  isCorrect && { color: '#22c55e' },
                  isIncorrect && { color: '#ef4444' }
                ]}
                  pointerEvents="none"
                >
                  {item.content}
                </Text>
              )}
              {isCorrect && (
                <View style={styles.statusIndicator}>
                  <MaterialCommunityIcons 
                    name="check-circle"
                    size={18} 
                    color="#22c55e" 
                  />
                </View>
              )}
              {isIncorrect && (
                <View style={styles.statusIndicator}>
                  <MaterialCommunityIcons 
                    name="close-circle"
                    size={18} 
                    color="#ef4444" 
                  />
                </View>
              )}
            </View>
          )
        ) : (
          <View style={[
            styles.slotPlaceholder,
            // Enhanced visual feedback for empty drop zones
            !isLocked && {
              backgroundColor: 'rgba(255, 251, 235, 0.5)',
              borderColor: '#f59e0b',
              borderWidth: 2,
              borderStyle: 'dashed'
            }
          ]}>
            <MaterialCommunityIcons 
              name="plus-circle-outline" 
              size={24} 
              color={isLocked ? "#cbd5e0" : "#f59e0b"} 
              style={{ marginBottom: 4 }}
            />
            <Text style={[
              styles.slotPlaceholderText,
              { color: isLocked ? "#cbd5e0" : "#f59e0b" }
            ]}>
              {isLocked ? "Locked" : "Drop here"}
            </Text>
          </View>
        )}
        {/* Lock indicator for correct items */}
        {isLocked && (
          <View style={styles.lockIndicator}>
            <MaterialCommunityIcons name="lock" size={20} color="#10b981" />
          </View>
        )}
      </View>
    );
  };

  // Memoize ChoiceCard rendering with duplicate prevention and enhanced visual feedback
  const renderChoiceCards = useMemo(() => {
    // Remove duplicates from pool before rendering (safety check)
    const uniquePool = pool.filter((item, index, self) => 
      index === self.findIndex((t) => t.id === item.id)
    );
    
    return uniquePool.map((choice, index) => {
      const pan = getPanResponder(choice);
      
      return (
        <Animated.View
          key={`choice-${question.id}-${choice.id}`}
          style={[
            styles.reorderChoice,
            {
              transform: [
                { translateX: pan.position.x },
                { translateY: pan.position.y }
              ],
              // Add subtle shadow and border for better visual feedback
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.1,
              shadowRadius: 3,
              elevation: 2,
            }
          ]}
          {...pan.responder.panHandlers}
        >
          <View style={{ width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' }} pointerEvents="none">
            {choice.type === 'image' && choice.imageUrl ? (
              <Image
                key={`pool-img-${choice.id}`}
                source={{ uri: choice.imageUrl }}
                style={styles.reorderChoiceImage}
                resizeMode="contain"
                fadeDuration={0}
              />
            ) : (
              <Text style={styles.reorderChoiceText} pointerEvents="none">{choice.content}</Text>
            )}
          </View>
        </Animated.View>
      );
    });
  }, [pool, question.id, getPanResponder]);

  // Reset function to return all items to original position
  const resetItems = useCallback(() => {
    console.log('[Reorder] Reset button pressed - returning all items to original position');
    
    // Haptic feedback
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    // Animate the reset
    try {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    } catch {}
    
    // Clear all slots
    setSlots(Array(slotsCount).fill(null));
    
    // Reset pool to original order
    setPool([...items]);
    
    // Clear locked slots
    setLockedSlots(new Set());
    
    // Reset validation and completion states
    setIsValidating(false);
    setIsCompleted(false);
    isValidatingRef.current = false;
    isCompletedRef.current = false;
    isDraggingRef.current = false;
    isClearingWrongItemsRef.current = false;
    draggedItemRef.current = null;
    lastNotifiedRef.current = '';
    hasCalledOnCompleteRef.current = false;
    
    console.log('[Reorder] Reset complete - all items returned to original position');
  }, [items, slotsCount]);

  return (
    <View style={{ width: '100%', paddingHorizontal: 0 }}>
      {/* Reset Button */}
      <View style={styles.resetButtonContainer}>
        <TouchableOpacity 
          style={styles.resetButton}
          onPress={resetItems}
          disabled={isValidating || isCompleted}
        >
          <MaterialCommunityIcons 
            name="refresh" 
            size={20} 
            color="#ffffff" 
          />
          <Text style={styles.resetButtonText}>Reset</Text>
        </TouchableOpacity>
      </View>
      
      {/* Drop Slots - Full Width */}
      <View style={styles.reorderSlotsRow}>
        {Array.from({ length: slotsCount }).map((_, i) => (
          <Slot key={`slot-${question.id}-${i}`} index={i} />
        ))}
      </View>
      
      {/* Choice Pool - Full Width */}
      <View style={styles.reorderChoicesRow}>
        {renderChoiceCards}
      </View>
    </View>
  );
});

interface ReorderItem {
  id: string;
  type: 'text' | 'image';
  content: string;
  imageUrl?: string;
}
interface Question {
  id: string;
  type: 'identification' | 'multiple-choice' | 'matching' | 're-order' | 'reading-passage';
  question: string;
  answer: string | string[];
  options?: string[];
  optionImages?: (string | null)[];
  pairs?: { left: string; right: string; leftImage?: string | null; rightImage?: string | null }[];
  order?: string[];
  reorderItems?: ReorderItem[];
  passage?: string;
  subQuestions?: Omit<Question, 'subQuestions'>[];
  multiAnswer?: boolean;
  reorderDirection?: 'asc' | 'desc';
  questionImage?: string | string[] | null;
  questionImages?: string[];
  fillSettings?: {
    caseSensitive: boolean;
    showBoxes: boolean;
    altAnswers?: string[];
    hint?: string;
    ignoreAccents?: boolean;
    allowShowWork?: boolean;
  };
  // Optional saved TTS audio URL for this question
  ttsAudioUrl?: string;
}
interface Exercise {
  id: string;
  title: string;
  description: string;
  teacherId: string;
  teacherName: string;
  questionCount: number;
  timesUsed: number;
  isPublic: boolean;
  createdAt: string;
  questions: Question[];
  coAuthors?: string[];
  originalAuthor?: string;
  originalExerciseId?: string;
  timeLimitPerItem?: number; // Time limit in seconds per question
  maxAttemptsPerItem?: number | null; // Maximum attempts per question (null = unlimited)
}
interface StudentAnswer {
  questionId: string;
  answer: string | string[] | {[key: string]: any};
  isCorrect?: boolean;
  timeSpent?: number;
}
// New interfaces for the restructured database format
interface AssignmentMetadata {
  assignmentId: string;
  classId: string;
  assignedAt: string;
  deadline: string;
  acceptLateSubmissions: boolean;
  acceptingStatus: string;
  isLateSubmission: boolean;
}

interface ExerciseInfo {
  exerciseId: string;
  title: string;
  category: string;
  description: string;
  totalQuestions: number;
  timeLimitPerItem?: number;
}

interface StudentInfo {
  studentId: string;
  name: string;
  gradeSection: string;
  sex: string;
}
interface DeviceInfo {
  platform: string;
  appVersion: string;
  deviceModel: string;
  networkType: string;
  // Enhanced metadata fields
  updateId?: string | null;
  runtimeVersion?: string | null;
  platformVersion?: string;
  deviceInfo?: string;
  environment?: string;
  buildProfile?: string;
  expoVersion?: string;
}

interface ExerciseSession {
  startedAt: string;
  completedAt: string;
  totalDurationSeconds: number;
  timestampSubmitted: number;
}

interface ResultsSummary {
  totalItems: number;
  totalAttempts: number;
  totalCorrect: number;
  totalIncorrect: number;
  totalTimeSpentSeconds: number;
  meanPercentageScore: number;
  meanAttemptsPerItem: number;
  meanTimePerItemSeconds: number;
  score: number;
  remarks: string;
}

interface AttemptHistory {
  attemptNumber: number;
  selectedAnswer: string;
  isCorrect: boolean;
  timeStamp: string;
}

interface QuestionResult {
  questionNumber: number;
  questionId: string;
  questionType: string;
  questionText: string;
  choices?: string[];
  correctAnswer: string;
  studentAnswer: string;
  isCorrect: boolean;
  attempts: number;
  timeSpentSeconds: number;
  ttsPlayed: boolean;
  ttsPlayCount: number;
  interactionTypes: string[];
  attemptHistory: AttemptHistory[];
}

interface ExerciseResultData {
  exerciseResultId: string;
  assignedExerciseId: string;
  assignmentMetadata: AssignmentMetadata;
  exerciseInfo: ExerciseInfo;
  studentInfo: StudentInfo;
  deviceInfo: DeviceInfo;
  exerciseSession: ExerciseSession;
  resultsSummary: ResultsSummary;
  questionResults: QuestionResult[];
}

// Resource preloading interfaces
interface ResourceItem {
  url: string;
  type: 'image' | 'audio';
  priority: 'high' | 'medium' | 'low';
  questionId?: string;
}

interface PreloadResult {
  success: boolean;
  url: string;
  error?: string;
  loadTime: number;
}

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

// Responsive design helpers
const isTablet = screenWidth >= 768;
const isSmallScreen = screenWidth < 375;
const isLargeScreen = screenWidth >= 1024;

// Dynamic sizing based on screen dimensions
const getResponsiveSize = (baseSize: number, scaleFactor: number = 1) => {
  const scale = Math.min(screenWidth / 375, screenHeight / 667); // Base on iPhone 6/7/8
  return Math.max(baseSize * scale * scaleFactor, baseSize * 0.8); // Minimum 80% of base size
};

const getResponsiveFontSize = (baseSize: number) => {
  const scale = Math.min(screenWidth / 375, screenHeight / 667);
  return Math.max(baseSize * scale, baseSize * 0.85);
};

const getResponsivePadding = (basePadding: number) => {
  const scale = Math.min(screenWidth / 375, 1.2);
  return Math.max(basePadding * scale, basePadding * 0.8);
};

// Validation functions to ensure fair question layouts
const validateMatchingQuestion = (question: Question): boolean => {
  if (question.type !== 'matching' || !question.pairs) return true;
  
  const pairs = question.pairs;
  // Check if any pair has the same index (left[i] matches right[i])
  for (let i = 0; i < pairs.length; i++) {
    if (pairs[i].left === pairs[i].right) {
      console.warn(`[Validation] Matching question ${question.id} has aligned pair at index ${i}: "${pairs[i].left}"`);
      return false;
    }
  }
  return true;
};

const validateReorderQuestion = (question: Question): boolean => {
  if (question.type !== 're-order' || !question.reorderItems) return true;
  
  const items = question.reorderItems;
  const correctSequence = items.map(item => item.id);
  
  // Check if items are already in correct order
  const isAlreadyCorrect = items.every((item, index) => {
    // For ascending order (default)
    if (!question.reorderDirection || question.reorderDirection === 'asc') {
      return item.id === correctSequence[index];
    }
    // For descending order
    return item.id === correctSequence[correctSequence.length - 1 - index];
  });
  
  if (isAlreadyCorrect) {
    console.warn(`[Validation] Reorder question ${question.id} has items already in correct order`);
    return false;
  }
  
  return true;
};

const shuffleArray = (array: any[]): any[] => {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

const fixMatchingQuestion = (question: Question): Question => {
  if (question.type !== 'matching' || !question.pairs) return question;
  
  const pairs = question.pairs;
  const leftItems = pairs.map(p => p.left);
  const rightItems = pairs.map(p => p.right);
  
  // Shuffle right items until no alignment occurs
  let shuffledRight = shuffleArray(rightItems);
  let attempts = 0;
  const maxAttempts = 100; // Prevent infinite loop
  
  while (attempts < maxAttempts) {
    let hasAlignment = false;
    for (let i = 0; i < leftItems.length; i++) {
      if (leftItems[i] === shuffledRight[i]) {
        hasAlignment = true;
        break;
      }
    }
    
    if (!hasAlignment) break;
    
    shuffledRight = shuffleArray(rightItems);
    attempts++;
  }
  
  if (attempts >= maxAttempts) {
    console.warn(`[Validation] Could not fix matching question ${question.id} after ${maxAttempts} attempts`);
    return question;
  }
  
  // Create new pairs with shuffled right items
  const fixedPairs = pairs.map((pair, index) => ({
    ...pair,
    right: shuffledRight[index]
  }));
  
  console.log(`[Validation] Fixed matching question ${question.id}:`, {
    original: pairs.map(p => `${p.left} → ${p.right}`),
    fixed: fixedPairs.map(p => `${p.left} → ${p.right}`)
  });
  
  return {
    ...question,
    pairs: fixedPairs
  };
};

const fixReorderQuestion = (question: Question): Question => {
  if (question.type !== 're-order' || !question.reorderItems) return question;
  
  const items = question.reorderItems;
  const correctSequence = items.map(item => item.id);
  
  // Shuffle items until they're not in correct order
  let shuffledItems = shuffleArray(items);
  let attempts = 0;
  const maxAttempts = 100; // Prevent infinite loop
  
  while (attempts < maxAttempts) {
    const shuffledSequence = shuffledItems.map(item => item.id);
    
    // Check if shuffled sequence matches correct order
    const isCorrectOrder = shuffledSequence.every((id, index) => {
      if (!question.reorderDirection || question.reorderDirection === 'asc') {
        return id === correctSequence[index];
      }
      return id === correctSequence[correctSequence.length - 1 - index];
    });
    
    if (!isCorrectOrder) break;
    
    shuffledItems = shuffleArray(items);
    attempts++;
  }
  
  if (attempts >= maxAttempts) {
    console.warn(`[Validation] Could not fix reorder question ${question.id} after ${maxAttempts} attempts`);
    return question;
  }
  
  console.log(`[Validation] Fixed reorder question ${question.id}:`, {
    original: correctSequence,
    shuffled: shuffledItems.map(item => item.id),
    direction: question.reorderDirection || 'asc'
  });
  
  // Store the original correct order in the question.order field
  return {
    ...question,
    reorderItems: shuffledItems,
    order: correctSequence // Store the correct order for validation
  };
};

// Animated touchable for shake feedback
const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

export default function StudentExerciseAnswering() {
  const router = useRouter();
  const { exerciseId, questionIndex, assignedExerciseId } = useLocalSearchParams();
  const isFocused = useIsFocused();
  
  // State
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [assignedExercise, setAssignedExercise] = useState<any>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<StudentAnswer[]>([]);
  // CRITICAL FIX: Use ref to track answers synchronously for accurate submission
  const answersRef = useRef<StudentAnswer[]>([]);
  const [currentAnswer, setCurrentAnswer] = useState<string | string[] | {[key: string]: any}>('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false); // CRITICAL: Ref to prevent duplicate submissions
  const isAdvancingRef = useRef(false); // CRITICAL: Ref to prevent duplicate advancement calls
  const [startTime, setStartTime] = useState<number>(Date.now());
  const [elapsedTime, setElapsedTime] = useState<number>(0);
  const [timerInterval, setTimerInterval] = useState<NodeJS.Timeout | null>(null);
  const [questionStartTime, setQuestionStartTime] = useState<number>(Date.now());
  const [questionElapsed, setQuestionElapsed] = useState<number>(0);
  const [timeLimitMs, setTimeLimitMs] = useState<number | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const questionElapsedRef = useRef<number>(0);
  const frozenElapsedRef = useRef<number | null>(null);
  const [backgroundImage, setBackgroundImage] = useState<string>('map1.1.png');
  const [showSettings, setShowSettings] = useState(false);
  const [matchingSelections, setMatchingSelections] = useState<{[key: string]: {[key: string]: string}}>({});
  // FIXED: New state for proper matching - stores which right index each left item is paired with
  const [matchingPairs, setMatchingPairs] = useState<{[questionId: string]: {[leftIndex: string]: number}}>({});
  const [matchingSelectedLeft, setMatchingSelectedLeft] = useState<{[questionId: string]: number | null}>({});
  const [reorderAnswers, setReorderAnswers] = useState<{[key: string]: ReorderItem[]}>({});
  const [shuffledPairsCache, setShuffledPairsCache] = useState<{[key: string]: {left: number[]; right: number[]}}>({});
  const prevQuestionIndexRef = useRef<number>(0);
  // Map-level play state (only for direct exercise access, not assigned exercises)
  const levelMode = typeof questionIndex !== 'undefined' && !assignedExerciseId;
  const levelIndex = levelMode ? Math.max(0, parseInt(String(questionIndex as any), 10) || 0) : 0;
  // Attempts and correctness tracking for try-again assessment
  const [attemptCounts, setAttemptCounts] = useState<{[questionId: string]: number}>({});
  const [correctQuestions, setCorrectQuestions] = useState<{[questionId: string]: boolean}>({});
  // CRITICAL FIX: Use refs to track counts synchronously for accurate submission data
  const attemptCountsRef = useRef<{[questionId: string]: number}>({});
  const correctQuestionsRef = useRef<{[questionId: string]: boolean}>({});
  
  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const cardScaleAnim = useRef(new Animated.Value(1)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const [lastShakeKey, setLastShakeKey] = useState<string | null>(null);
  const [showResults, setShowResults] = useState(false);
  const [showCorrect, setShowCorrect] = useState(false);
  const correctAnim = useRef(new Animated.Value(0)).current;
  const [showWrong, setShowWrong] = useState(false);
  const wrongAnim = useRef(new Animated.Value(0)).current;
  // Guards to prevent duplicate popups/overlays
  const correctFeedbackActiveRef = useRef(false);
  const wrongFeedbackActiveRef = useRef(false);
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [alertConfig, setAlertConfig] = useState({title: '', message: '', type: 'warning', onConfirm: () => {}});
  const alertAnim = useRef(new Animated.Value(0)).current;
  const [attemptLogs, setAttemptLogs] = useState<{[questionId: string]: Array<{answer: string, timeSpent: number, timestamp: number, attemptType: string, hesitationTime: number, isSignificantChange: boolean, questionPhase: string, confidence: string}>}>({});
  // CRITICAL FIX: Use ref to track attempts synchronously for immediate access during submission
  const attemptLogsRef = useRef<{[questionId: string]: Array<{answer: string, timeSpent: number, timestamp: number, attemptType: string, hesitationTime: number, isSignificantChange: boolean, questionPhase: string, confidence: string}>}>({});
  
  // CRITICAL FIX: Store saved question results for accurate UI display after submission
  const [savedQuestionResults, setSavedQuestionResults] = useState<QuestionResult[]>([]);
  // CRITICAL FIX: Store saved results summary for accurate aggregate display
  const [savedResultsSummary, setSavedResultsSummary] = useState<ResultsSummary | null>(null);
  
  // Enhanced interaction tracking
  const [interactionLogs, setInteractionLogs] = useState<{[questionId: string]: Array<{
    type: 'option_hover' | 'option_click' | 'help_used' | 'navigation' | 'answer_change',
    target: string,
    timestamp: number,
    duration?: number
  }>}>({});
  const [optionHoverTimes, setOptionHoverTimes] = useState<{[questionId: string]: {[optionKey: string]: number}}>({});
  const [helpUsage, setHelpUsage] = useState<{[questionId: string]: {ttsCount: number, helpButtonClicks: number}}>({});
  
  // TTS playback state
  const [isPlayingTTS, setIsPlayingTTS] = useState(false);
  const [isLoadingTTS, setIsLoadingTTS] = useState(false);
  const [currentAudioPlayer, setCurrentAudioPlayer] = useState<any | null>(null);
  const [currentAudioUri, setCurrentAudioUri] = useState<string | null>(null);
  const lastAutoPlayedQuestionIdRef = useRef<string | null>(null);
  const currentTTSRef = useRef<any | null>(null);
  
  // TTS audio player cache for instant playback (no loading delay)
  const audioPlayerCacheRef = useRef<Map<string, any>>(new Map());
  const [ttsPreloadComplete, setTtsPreloadComplete] = useState(false);

  // Session and device tracking for new database format
  const [sessionStartTime, setSessionStartTime] = useState<string>('');
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);
  const [studentInfo, setStudentInfo] = useState<StudentInfo | null>(null);

  // Resource preloading state
  const [isPreloadingResources, setIsPreloadingResources] = useState(false);
  const [preloadProgress, setPreloadProgress] = useState(0);
  const [animatedProgress, setAnimatedProgress] = useState(0);
  const [preloadStatus, setPreloadStatus] = useState('');
  const [preloadError, setPreloadError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [loadedResources, setLoadedResources] = useState<Set<string>>(new Set());
  const [failedResources, setFailedResources] = useState<Set<string>>(new Set());
  const [resourcesReady, setResourcesReady] = useState(false);
  const [exerciseStarted, setExerciseStarted] = useState(false);
  const [officialStartTime, setOfficialStartTime] = useState<number | null>(null);

  // Smooth progress animation effect
  useEffect(() => {
    const duration = 300; // Animation duration in ms
    const startValue = animatedProgress;
    const endValue = preloadProgress;
    const startTime = Date.now();
    
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Easing function for smooth animation
      const easeOutCubic = 1 - Math.pow(1 - progress, 3);
      const currentValue = startValue + (endValue - startValue) * easeOutCubic;
      
      setAnimatedProgress(currentValue);
      
      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };
    
    if (preloadProgress !== animatedProgress) {
      requestAnimationFrame(animate);
    }
  }, [preloadProgress]);

  // Animation states for loading screen
  const [bounceAnim] = useState(new Animated.Value(0));
  const [pulseAnim] = useState(new Animated.Value(1));
  const [rotateAnim] = useState(new Animated.Value(0));

  // Start loading screen animations
  useEffect(() => {
    // Bouncing animation
    const bounceAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(bounceAnim, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(bounceAnim, {
          toValue: 0,
          duration: 600,
          useNativeDriver: true,
        }),
      ])
    );

    // Pulse animation
    const pulseAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.2,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    );

    // Rotate animation
    const rotateAnimation = Animated.loop(
      Animated.timing(rotateAnim, {
        toValue: 1,
        duration: 2000,
        useNativeDriver: true,
      })
    );

    // Slide animation
    const slideAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(slideAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );

    bounceAnimation.start();
    pulseAnimation.start();
    rotateAnimation.start();
    slideAnimation.start();

    return () => {
      bounceAnimation.stop();
      pulseAnimation.stop();
      rotateAnimation.stop();
      slideAnimation.stop();
    };
  }, []);

  // Layout transitions will be handled by React Native automatically
  
  // Initialize session and device information
  useEffect(() => {
    const initializeSessionData = async () => {
      const now = new Date().toISOString();
      setSessionStartTime(now);
      
      // Collect comprehensive device and app metadata
      try {
        const metadata = await collectAppMetadata();
        console.log('[DeviceInfo] Collected comprehensive metadata:', metadata);
        
        const deviceData: DeviceInfo = {
          platform: metadata.platform,
          appVersion: metadata.appVersion,
          deviceModel: metadata.deviceInfo || `${metadata.platform} ${metadata.platformVersion}`,
          networkType: 'unknown', // Network detection would require additional setup
          // Enhanced metadata
          updateId: metadata.updateId,
          runtimeVersion: metadata.runtimeVersion,
          platformVersion: metadata.platformVersion,
          deviceInfo: metadata.deviceInfo,
          environment: metadata.environment,
          buildProfile: metadata.buildProfile,
          expoVersion: metadata.expoVersion,
        };
        
        console.log('[DeviceInfo] Enhanced device data set:', deviceData);
        setDeviceInfo(deviceData);
      } catch (error) {
        console.error('[DeviceInfo] Failed to collect metadata, using fallback:', error);
        // Fallback to basic device info
        const deviceData: DeviceInfo = {
          platform: Platform.OS,
          appVersion: '1.0.0',
          deviceModel: Platform.OS === 'android' ? `Android ${Platform.Version}` : `iOS ${Platform.Version}`,
          networkType: 'unknown'
        };
        setDeviceInfo(deviceData);
      }
      
      // Load student information
      try {
        const loginCode = await AsyncStorage.getItem('parent_key');
        console.log('[StudentInfo] Login code from AsyncStorage:', loginCode);
        
        if (loginCode) {
          // CRITICAL FIX: Resolve login code to actual parent ID first
          const parentIdResult = await readData(`/parentLoginCodes/${loginCode}`);
          console.log('[StudentInfo] Parent ID resolution result:', parentIdResult);
          
          if (parentIdResult.data) {
            const actualParentId = parentIdResult.data;
            console.log('[StudentInfo] Resolved actual parent ID:', actualParentId);
            
            // Now find the student using the actual parent ID
            const studentsData = await readData('/students');
            if (studentsData.data) {
              // Search for student by parentId (the ACTUAL parent ID, not login code)
              const student = Object.values(studentsData.data).find((s: any) => s.parentId === actualParentId) as any;
              console.log('[StudentInfo] Found student:', student);
              
              if (student) {
                const studentData = {
                  studentId: student.studentId,
                  name: student.fullName || 'Unknown Student',
                  gradeSection: student.gradeSection || 'Unknown Grade',
                  sex: student.gender || 'Unknown'
                };
                
                setStudentInfo(studentData);
                console.log('[StudentInfo] Student info set successfully:', studentData);
                
                // Store student ID for future use
                if (student.studentId) {
                  await AsyncStorage.setItem('student_id', student.studentId);
                  console.log('[StudentInfo] Student ID stored in AsyncStorage:', student.studentId);
                }
              } else {
                console.warn('[StudentInfo] No student found with parentId:', actualParentId);
              }
            } else {
              console.warn('[StudentInfo] No students data available');
            }
          } else {
            console.warn('[StudentInfo] Could not resolve login code to parent ID');
          }
        } else {
          console.warn('[StudentInfo] No login code found in AsyncStorage');
        }
      } catch (error) {
        console.error('[StudentInfo] Failed to load student information:', error);
        if (error instanceof Error) {
          logErrorWithStack(error, 'error', 'StudentExerciseAnswering', 'Failed to load student info');
        }
      }
    };
    
    initializeSessionData();
  }, []);

  // Load exercise data
  useEffect(() => {
    loadExercise();
  }, [exerciseId, assignedExerciseId]);
  
  // Timer effect (requestAnimationFrame for smoother and accurate updates)
  useEffect(() => {
    if (!exercise || submitting || !exerciseStarted || showResults) { // Don't start timer until exercise is officially started or when results are shown
      if (timerInterval) {
        clearInterval(timerInterval);
        setTimerInterval(null);
      }
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      return;
    }
    
    // Set time limit when exercise loads or question changes
    const currentTimeLimit = exercise.timeLimitPerItem ? exercise.timeLimitPerItem * 1000 : null;
    setTimeLimitMs(currentTimeLimit);
    
    const tick = () => {
      const now = Date.now();
      setElapsedTime(now - startTime);
      setQuestionElapsed(now - questionStartTime);
      
      // Calculate remaining time if there's a time limit
      if (currentTimeLimit) {
        const remaining = Math.max(0, currentTimeLimit - (now - questionStartTime));
        setTimeRemaining(remaining);
        
        // Auto-submit when time runs out
        if (remaining === 0 && !submittingRef.current && !isAdvancingRef.current) {
          // CRITICAL: Stop the timer immediately to prevent multiple triggers
          if (rafIdRef.current) {
            cancelAnimationFrame(rafIdRef.current);
            rafIdRef.current = null;
          }
          
          // Set flag to prevent multiple timeout triggers
          isAdvancingRef.current = true;
          
          // Mark current question as failed due to timeout
          const currentQuestion = exercise.questions[currentQuestionIndex];
          if (currentQuestion) {
            // CRITICAL: Ensure timeout answer is always marked as incorrect
            const timeoutAnswer: StudentAnswer = {
              questionId: currentQuestion.id,
              answer: currentAnswer || '', // Use current answer if any (or empty string)
              isCorrect: false, // ALWAYS false for timeout
              timeSpent: questionElapsedRef.current,
            };
            
            console.log('[Timeout] Creating timeout answer:', {
              questionId: currentQuestion.id,
              hasAnswer: !!(currentAnswer && currentAnswer !== ''),
              isCorrect: timeoutAnswer.isCorrect,
              timeSpent: timeoutAnswer.timeSpent
            });
            
            // CRITICAL FIX: Use updateAnswers to update both state and ref
            updateAnswers(prev => {
              const existingIndex = prev.findIndex(a => a.questionId === currentQuestion.id);
              if (existingIndex >= 0) {
                const updated = [...prev];
                updated[existingIndex] = timeoutAnswer;
                return updated;
              } else {
                return [...prev, timeoutAnswer];
              }
            });
            
            // Log the timeout as a final attempt with special marker
            logAttempt(currentQuestion, currentAnswer || '', 'final');
            
            // Mark as incorrect and increment attempt count for timeout
            setQuestionCorrect(currentQuestion.id, false);
            incrementAttemptCount(currentQuestion.id);
            
            console.log('[Timeout] Time limit reached - marking question as incorrect', {
              questionId: currentQuestion.id,
              timeLimit: exercise.timeLimitPerItem,
              attempts: (attemptCountsRef.current[currentQuestion.id] || 0) + 1
            });
          }
          
          // Show clear "Times Up" alert before advancing (no visual flash, just alert)
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          
          showCustomAlert(
            'Time\'s Up! ⏰',
            `The time limit has been reached. This question will be marked as incorrect and we'll move to the next one.`,
            () => {
              // CRITICAL FIX: Reset the flag and advance with small delay for smooth transition
              isAdvancingRef.current = false;
              console.log('[Timeout] User clicked OK, advancing to next question');
              
              // Small delay to ensure smooth state transition
              setTimeout(() => {
                advanceToNextOrFinish();
              }, 100);
            },
            'warning'
          );
          
          // Exit early to prevent further timer ticks
          return;
        }
      } else {
        setTimeRemaining(null);
      }
      
      rafIdRef.current = requestAnimationFrame(tick);
    };
    rafIdRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, [exercise, startTime, submitting, questionStartTime, exerciseStarted, showResults]);

  // Keep a ref of the latest per-question elapsed to avoid race conditions during index changes
  useEffect(() => {
    questionElapsedRef.current = questionElapsed;
  }, [questionElapsed]);
  
  // Cleanup timer and cached audio on unmount
  useEffect(() => {
    return () => {
      if (timerInterval) {
        clearInterval(timerInterval);
      }
      
      // Stop any TTS audio on unmount - ensure complete cleanup
      try {
        // Stop expo-speech if running
        Speech.stop();
      } catch (error) {
        console.warn('[Cleanup] Error stopping speech on unmount:', error);
      }
      
      try {
        // Stop current player
        if (currentTTSRef.current) {
          currentTTSRef.current.pause();
          currentTTSRef.current.remove();
        }
        if (currentAudioPlayer) {
          currentAudioPlayer.remove();
        }
      } catch (error) {
        console.warn('[Cleanup] Error stopping current audio player:', error);
      }
      
      // CRITICAL: Clean up ALL cached audio players on unmount
      try {
        console.log(`[Cleanup] Disposing ${audioPlayerCacheRef.current.size} cached audio players`);
        audioPlayerCacheRef.current.forEach((player, url) => {
          try {
            player.pause();
            player.remove();
          } catch (e) {
            console.warn('[Cleanup] Error disposing cached player:', url, e);
          }
        });
        audioPlayerCacheRef.current.clear();
      } catch (error) {
        console.warn('[Cleanup] Error cleaning up audio cache:', error);
      }
    };
  }, [timerInterval]);
  
  // Animation on question change
  useEffect(() => {
    // CRITICAL: Stop TTS immediately when question changes
    stopCurrentTTS();
    
    // Reset animations
    fadeAnim.setValue(0);
    slideAnim.setValue(50);
    cardScaleAnim.setValue(0.95);
    
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 400,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(cardScaleAnim, {
        toValue: 1,
        tension: 100,
        friction: 8,
        useNativeDriver: true,
      }),
    ]).start();
    
    // Update progress
    Animated.timing(progressAnim, {
      toValue: (currentQuestionIndex + 1) / (exercise?.questions.length || 1),
      duration: 600,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
    // Note: Resource preloading is now handled comprehensively in loadExercise()
  }, [currentQuestionIndex, exercise]);

  // Reset question timer when index changes
  useEffect(() => {
    // CRITICAL: Stop TTS when question index changes
    stopCurrentTTS();
    
    // Accumulate time for the previous question, then reset timer for the new one
    if (exercise) {
      const now = Date.now();
      const prevIndex = prevQuestionIndexRef.current;
      if (prevIndex !== currentQuestionIndex && prevIndex >= 0 && prevIndex < exercise.questions.length) {
        const prevQid = exercise.questions[prevIndex].id;
        // Use frozen UI timer value captured at correctness if present, else latest UI timer value
        const delta = (frozenElapsedRef.current ?? questionElapsedRef.current);
        // CRITICAL FIX: Use updateAnswers to update both state and ref
        updateAnswers(prev => prev.map(a => a.questionId === prevQid ? { ...a, timeSpent: (a.timeSpent || 0) + delta } : a));
        frozenElapsedRef.current = null;
      }
      prevQuestionIndexRef.current = currentQuestionIndex;
    }
    setQuestionStartTime(Date.now());
    setQuestionElapsed(0);
    
    // CRITICAL FIX: Reset attempts counter for the new question
    // This ensures attempts start at 0 for each new question
    if (exercise && currentQuestionIndex >= 0 && currentQuestionIndex < exercise.questions.length) {
      const currentQid = exercise.questions[currentQuestionIndex].id;
      console.log('[QuestionChange] Resetting attempts for question:', currentQid);
      
      // CRITICAL FIX: Reset both state and ref immediately to prevent stale values
      const newAttemptCounts = { ...attemptCounts };
      newAttemptCounts[currentQid] = 0; // Reset to 0 for the new question
      attemptCountsRef.current = { ...attemptCountsRef.current, [currentQid]: 0 };
      setAttemptCounts(newAttemptCounts);
      
      // CRITICAL FIX: Clear reorder answers for the new question to prevent duplicate options
      setReorderAnswers(prev => {
        const newAnswers = { ...prev };
        newAnswers[currentQid] = []; // Clear any previous reorder state
        return newAnswers;
      });
      
      console.log('[QuestionChange] Attempt count reset complete for question:', currentQid, 'attempts:', 0);
    }
    
    // Log initial attempt when question is displayed (only if there's an existing answer)
    if (exercise && exercise.questions[currentQuestionIndex]) {
      const currentQuestion = exercise.questions[currentQuestionIndex];
      const existingAnswer = answers.find(a => a.questionId === currentQuestion.id);
      
      // FIXED: Initialize matching state for matching questions
      if (currentQuestion.type === 'matching') {
        const matchingAnswer = existingAnswer?.answer;
        if (matchingAnswer && typeof matchingAnswer === 'object' && !Array.isArray(matchingAnswer)) {
          setMatchingPairs(prev => ({ ...prev, [currentQuestion.id]: matchingAnswer }));
        }
        // Reset selected left item when changing questions
        setMatchingSelectedLeft(prev => ({ ...prev, [currentQuestion.id]: null }));
      }
      
      // Only log if there's an actual answer, not empty
      if (existingAnswer?.answer && existingAnswer.answer !== '') {
        // CRITICAL FIX: Don't log empty objects for matching/reorder questions
        const isEmptyObject = typeof existingAnswer.answer === 'object' && 
                             !Array.isArray(existingAnswer.answer) && 
                             Object.keys(existingAnswer.answer).length === 0;
        const isEmptyArray = Array.isArray(existingAnswer.answer) && 
                            existingAnswer.answer.length === 0;
        
        if (!isEmptyObject && !isEmptyArray) {
          logAttempt(currentQuestion, existingAnswer.answer, 'initial');
        }
      }
    }
  }, [currentQuestionIndex]);
  
  const getRandomBackground = () => {
    const mapImages = [
      'map1.1.png',
      'map2.2.png',
      'map3.3.png',
      'map4.4.png',
      'map5.5.png',
      'map6.6.png',
      'map7.7.png',
      'map8.8.png',
      'map9.9.png',
      'map10.10.png',
      'map11.11.png',
      'map12.12.png'
    ];
    const randomIndex = Math.floor(Math.random() * mapImages.length);
    return mapImages[randomIndex];
  };

  const getBackgroundSource = (imageName: string) => {
    switch (imageName) {
      case 'map1.1.png':
        return require('../assets/images/Maps/map1.1.png');
      case 'map2.2.png':
        return require('../assets/images/Maps/map2.2.png');
      case 'map3.3.png':
        return require('../assets/images/Maps/map3.3.png');
      case 'map4.4.png':
        return require('../assets/images/Maps/map4.4.png');
      case 'map5.5.png':
        return require('../assets/images/Maps/map5.5.png');
      case 'map6.6.png':
        return require('../assets/images/Maps/map6.6.png');
      case 'map7.7.png':
        return require('../assets/images/Maps/map7.7.png');
      case 'map8.8.png':
        return require('../assets/images/Maps/map8.8.png');
      case 'map9.9.png':
        return require('../assets/images/Maps/map9.9.png');
      case 'map10.10.png':
        return require('../assets/images/Maps/map10.10.png');
      case 'map11.11.png':
        return require('../assets/images/Maps/map11.11.png');
      case 'map12.12.png':
        return require('../assets/images/Maps/map12.12.png');
      default:
        return require('../assets/images/Maps/map1.1.png');
    }
  };

  // Enhanced resource collection and preloading system - OPTIMIZED
  const collectAllResources = (exercise: Exercise): ResourceItem[] => {
    const resources: ResourceItem[] = [];
    
    console.log(`[CollectResources] Starting collection for ${exercise.questions.length} questions`);
    
    exercise.questions.forEach((question, questionIndex) => {
      // OPTIMIZATION: Priority system for efficient loading
      const priority: 'high' | 'medium' | 'low' = 
        questionIndex < 3 ? 'high' :    // First 3 questions - load first
        questionIndex < 7 ? 'medium' :  // Next 4 questions - load second
        'low';                          // Last questions - load last
      
      console.log(`[CollectResources] Q${questionIndex + 1} (${question.id}): priority=${priority}`);
      
      // Collect question images
      let questionResourceCount = 0;
      if (question.questionImage) {
        if (Array.isArray(question.questionImage)) {
          question.questionImage.filter(Boolean).forEach(url => {
            resources.push({ url, type: 'image', priority, questionId: question.id });
            questionResourceCount++;
          });
        } else {
          resources.push({ url: question.questionImage, type: 'image', priority, questionId: question.id });
          questionResourceCount++;
        }
      }
      
      if (question.questionImages && question.questionImages.length) {
        question.questionImages.filter(Boolean).forEach(url => {
          resources.push({ url, type: 'image', priority, questionId: question.id });
          questionResourceCount++;
        });
      }
      
      // Collect option images
      if (question.optionImages && question.optionImages.length) {
        question.optionImages.filter(Boolean).forEach(url => {
          resources.push({ url: url!, type: 'image', priority, questionId: question.id });
          questionResourceCount++;
        });
      }
      
      console.log(`[CollectResources] Q${questionIndex + 1}: Added ${questionResourceCount} image resources`);
      
      // Collect reorder item images
      if (question.reorderItems && question.reorderItems.length) {
        question.reorderItems.forEach(item => {
          if (item.imageUrl) {
            resources.push({ url: item.imageUrl, type: 'image', priority, questionId: question.id });
          }
        });
      }
      
      // Collect pair images
      if (question.pairs && question.pairs.length) {
        question.pairs.forEach(pair => {
          if (pair.leftImage) {
            resources.push({ url: pair.leftImage, type: 'image', priority, questionId: question.id });
          }
          if (pair.rightImage) {
            resources.push({ url: pair.rightImage, type: 'image', priority, questionId: question.id });
          }
        });
      }
      
      // Collect TTS audio files for preloading
      if (question.ttsAudioUrl) {
        resources.push({ url: question.ttsAudioUrl, type: 'audio', priority, questionId: question.id });
        console.log(`[CollectResources] Q${questionIndex + 1}: Added TTS audio resource`);
      }
      
      // Collect sub-question resources
      if (question.subQuestions && question.subQuestions.length) {
        question.subQuestions.forEach(subQ => {
          const subResources = collectAllResources({ ...exercise, questions: [subQ] });
          resources.push(...subResources);
        });
      }
    });
    
    log.preload(`Collection complete: ${resources.length} total resources`, {
      byType: {
        images: resources.filter(r => r.type === 'image').length,
        audio: resources.filter(r => r.type === 'audio').length
      },
      byPriority: {
        high: resources.filter(r => r.priority === 'high').length,
        medium: resources.filter(r => r.priority === 'medium').length,
        low: resources.filter(r => r.priority === 'low').length
      }
    });
    
    return resources;
  };
  const preloadResource = async (resource: ResourceItem): Promise<PreloadResult> => {
    const startTime = Date.now();
    
    try {
      if (resource.type === 'image') {
        // CRITICAL FIX: Only preload HTTP/HTTPS URLs
        // Asset paths and require() references will be handled by ExpoImage on-demand
        if (!resource.url.startsWith('http://') && !resource.url.startsWith('https://')) {
          const loadTime = Date.now() - startTime;
          log.preload(`Skipping non-HTTP image (on-demand): ${resource.url.substring(0, 50)}`);
          return { 
            success: true, // Mark as success since ExpoImage will handle it
            url: resource.url, 
            loadTime 
          };
        }
        
        // OPTIMIZATION: Add timeout to prevent hanging on slow images (15 seconds)
        const timeoutPromise = new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Timeout after 15s')), 15000)
        );
        
        // Prefetch using Expo Image cache (aligns with ExpoImage renderer) with retry
        const prefetchOnce = async () => {
          await Promise.race([
            (ExpoImage as any).prefetch ? (ExpoImage as any).prefetch(resource.url) : Image.prefetch(resource.url),
            timeoutPromise
          ]);
        };
        try {
          await prefetchOnce();
        } catch (e1) {
          log.preloadWarn('First prefetch attempt failed, retrying once…', resource.url);
          await new Promise(r => setTimeout(r, 250));
          await prefetchOnce();
        }
        
        const loadTime = Date.now() - startTime;
        const filename = resource.url.substring(resource.url.lastIndexOf('/') + 1, resource.url.indexOf('?') > 0 ? resource.url.indexOf('?') : resource.url.length);
        log.preload(`Image loaded (${loadTime}ms): ${filename}`);
        return { success: true, url: resource.url, loadTime };
      } else if (resource.type === 'audio') {
        // CRITICAL: Preload TTS audio files with proper caching for instant playback
        const timeoutPromise = new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Audio preload timeout after 10s')), 10000)
        );
        
        // Create and cache audio player for instant reuse
        const source: AudioSource = { uri: resource.url };
        const player = createAudioPlayer(source);
        
        // Wait for player to be ready (with proper state listener)
        let isReady = false;
        const readyPromise = new Promise<void>((resolve) => {
          player.addListener('playbackStatusUpdate', (status: AudioStatus) => {
            if ('isLoaded' in status && status.isLoaded && !isReady) {
              isReady = true;
              log.tts(`Audio player ready: ${resource.url.substring(0, 50)}`);
              resolve();
            }
          });
          
          // Fallback: resolve after short delay if listener doesn't fire
          setTimeout(() => {
            if (!isReady) {
              log.tts(`Audio player timeout fallback: ${resource.url.substring(0, 50)}`);
              resolve();
            }
          }, 2000);
        });
        
        await Promise.race([readyPromise, timeoutPromise]);
        
        // CRITICAL: Cache the loaded player for instant reuse
        audioPlayerCacheRef.current.set(resource.url, player);
        
        const loadTime = Date.now() - startTime;
        const filename = resource.url.substring(resource.url.lastIndexOf('/') + 1, resource.url.indexOf('?') > 0 ? resource.url.indexOf('?') : resource.url.length);
        log.tts(`Audio cached for instant playback (${loadTime}ms): ${filename}`);
        return { success: true, url: resource.url, loadTime };
      }
      
      const loadTime = Date.now() - startTime;
      return { success: true, url: resource.url, loadTime };
    } catch (error) {
      const loadTime = Date.now() - startTime;
      // Log but don't fail - images will load on-demand via ExpoImage
      log.preloadWarn(`Failed to preload (on-demand): ${resource.url.substring(0, 60)} err=${error instanceof Error ? error.message : 'Unknown'}`, loadTime);
      return { 
        success: false, 
        url: resource.url, 
        error: error instanceof Error ? error.message : 'Unknown error',
        loadTime 
      };
    }
  };
  const preloadResourcesWithProgress = async (resources: ResourceItem[]): Promise<PreloadResult[]> => {
    const results: PreloadResult[] = [];
    const totalResources = resources.length;
    
    // Sort resources by priority
    const sortedResources = resources.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
    
    // CRITICAL FIX: Smaller batches for smoother progress bar animation
    const batchSize = 3;
    const batches = [];
    for (let i = 0; i < sortedResources.length; i += batchSize) {
      batches.push(sortedResources.slice(i, i + batchSize));
    }
    
    log.preload(`Processing ${totalResources} resources in ${batches.length} batches (max ${batchSize}/batch)`);
    
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      const batchStart = results.length + 1;
      const batchEnd = Math.min(results.length + batch.length, totalResources);
      
      setPreloadStatus(`Loading resources ${batchStart}-${batchEnd} of ${totalResources}...`);
      log.preload(`Batch ${batchIndex + 1}/${batches.length}: Loading ${batch.length} resources`);
      
      // CRITICAL FIX: Process resources sequentially for smooth progress animation
      // Sequential processing ensures progress updates are visible and smooth
      const batchResults: PreloadResult[] = [];
      for (let resourceIndex = 0; resourceIndex < batch.length; resourceIndex++) {
        const resource = batch[resourceIndex];
        const result = await preloadResource(resource);
        batchResults.push(result);
        
        // Update loaded/failed resources
        if (result.success) {
          setLoadedResources(prev => new Set([...prev, resource.url]));
        } else {
          setFailedResources(prev => new Set([...prev, resource.url]));
        }
        
        // Update progress after each individual resource for smoother animation
        const completedResources = results.length + resourceIndex + 1;
        const currentProgress = Math.round((completedResources / totalResources) * 100);
        setPreloadProgress(currentProgress);
        
        // CRITICAL FIX: Longer delay for smooth progress animation (100-180ms jitter per resource)
        // This ensures the progress bar animates smoothly and is visible to users
        // Even skipped resources get this delay for consistent animation
        const jitter = 100 + Math.floor(Math.random() * 80);
        await new Promise(resolve => setTimeout(resolve, jitter));
      }
      
      results.push(...batchResults);
      
      log.preload(`Batch ${batchIndex + 1} completed: ${results.length}/${totalResources} resources loaded`);
      
      // No delay between batches since we already have 150ms delay per resource
    }
    
    return results;
  };
  const retryFailedResources = async (): Promise<void> => {
    if (failedResources.size === 0) return;
    
    setRetryCount(prev => prev + 1);
    setPreloadError(null);
    setIsPreloadingResources(true);
    setPreloadStatus(`Retrying failed resources (attempt ${retryCount + 1})...`);
    
    try {
      const failedUrls = Array.from(failedResources);
      const retryResources: ResourceItem[] = failedUrls.map(url => ({
        url,
        type: url.includes('.mp3') || url.includes('.wav') || url.includes('.m4a') ? 'audio' : 'image',
        priority: 'high'
      }));
      
      const retryResults = await preloadResourcesWithProgress(retryResources);
      const successCount = retryResults.filter(r => r.success).length;
      
      if (successCount > 0) {
        setPreloadStatus(`Retry successful! ${successCount} resources loaded.`);
        // Remove successfully retried resources from failed set
        const successfulUrls = retryResults.filter(r => r.success).map(r => r.url);
        setFailedResources(prev => {
          const newSet = new Set(prev);
          successfulUrls.forEach(url => newSet.delete(url));
          return newSet;
        });
      } else {
        setPreloadStatus(`Retry failed. ${failedResources.size} resources still unavailable.`);
      }
    } catch (error) {
      console.error('Retry failed:', error);
      setPreloadError(error instanceof Error ? error.message : 'Retry failed');
    } finally {
      setIsPreloadingResources(false);
    }
  };

  const handleStartExercise = () => {
    const startTime = Date.now();
    setOfficialStartTime(startTime);
    setExerciseStarted(true);
    setStartTime(startTime); // Update the main start time
    setSessionStartTime(new Date(startTime).toISOString());
    
    // Reset question start time to now
    setQuestionStartTime(startTime);
    
    // Start the timer
    const interval = setInterval(() => {
      setElapsedTime(Date.now() - startTime);
    }, 100);
    setTimerInterval(interval as any);
    
    console.log('Exercise officially started at:', new Date(startTime).toISOString());
  };

  // Helpers to present correct answers for all question types
  const subQuestionsLabel = (index: number): string => String(index + 1);
  const getReorderItemLabel = (item?: ReorderItem | null) => {
    if (!item) return '';
    if (item.type === 'image') return item.content || '[image]';
    return item.content;
  };

  // TTS helpers - OPTIMIZED for instant playback with cached players
  const playTTS = async (audioUrl?: string | null) => {
    try {
      if (!audioUrl) return;
      
      // CRITICAL: Always stop any existing TTS before starting new one
      stopCurrentTTS();
      
      // Small delay to ensure previous audio stops cleanly
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // OPTIMIZATION: Check if we have a cached player ready (instant playback!)
      const cachedPlayer = audioPlayerCacheRef.current.get(audioUrl);
      
      if (cachedPlayer) {
        console.log('[TTS-Play] ✓ Using cached player - instant playback!');
        
        // Use cached player - NO loading delay!
        currentTTSRef.current = cachedPlayer;
        setCurrentAudioPlayer(cachedPlayer);
        setCurrentAudioUri(audioUrl);
        setIsPlayingTTS(true);
        setIsLoadingTTS(false); // Already loaded!
        
        // CRITICAL: Remove all existing listeners to prevent accumulation
        try {
          cachedPlayer.removeAllListeners('playbackStatusUpdate');
        } catch (e) {
          console.warn('[TTS-Play] Failed to remove old listeners:', e);
        }
        
        // Set up fresh listener for playback completion
        cachedPlayer.addListener('playbackStatusUpdate', (status: AudioStatus) => {
          if ('isLoaded' in status && status.isLoaded) {
            if (status.playing) {
              setIsPlayingTTS(true);
              setIsLoadingTTS(false);
            }
            if (status.didJustFinish) {
              setIsPlayingTTS(false);
              setIsLoadingTTS(false);
              // Reset player to beginning for next play
              try {
                cachedPlayer.seekTo(0);
              } catch (e) {
                console.warn('[TTS-Play] Failed to reset player:', e);
              }
            }
          } else if ('error' in status) {
            console.error('[TTS-Play] Cached player error:', status.error);
            setIsPlayingTTS(false);
            setIsLoadingTTS(false);
            // Remove from cache if errored
            audioPlayerCacheRef.current.delete(audioUrl);
          }
        });
        
        // Start playback immediately
        cachedPlayer.play();
        return;
      }
      
      // Fallback: Create new player if not cached (loading will show)
      console.log('[TTS-Play] ⚠ No cached player, creating new one (will show loading)');
      setIsLoadingTTS(true);
      const source: AudioSource = { uri: audioUrl };
      const player = createAudioPlayer(source);
      
      // Store in both ref and state
      currentTTSRef.current = player;
      setCurrentAudioPlayer(player);
      setCurrentAudioUri(audioUrl);
      
      // Cache this player for future use
      audioPlayerCacheRef.current.set(audioUrl, player);
      
      player.addListener('playbackStatusUpdate', (status: AudioStatus) => {
        if ('isLoaded' in status && status.isLoaded) {
          if (status.playing) {
            setIsPlayingTTS(true);
            setIsLoadingTTS(false);
          }
          if (status.didJustFinish) {
            setIsPlayingTTS(false);
            setIsLoadingTTS(false);
            // Reset player to beginning for next play
            try {
              player.seekTo(0);
            } catch (e) {
              console.warn('[TTS-Play] Failed to reset player:', e);
            }
          }
        } else if ('error' in status) {
          console.error('[TTS-Play] Playback error:', status.error);
          setIsPlayingTTS(false);
          setIsLoadingTTS(false);
          // Remove from cache if errored
          audioPlayerCacheRef.current.delete(audioUrl);
          currentTTSRef.current = null;
          setCurrentAudioPlayer(null);
          setCurrentAudioUri(null);
        }
      });
      
      player.play();
    } catch (error) {
      console.error('[TTS-Play] Error:', error);
      setIsPlayingTTS(false);
      setIsLoadingTTS(false);
      currentTTSRef.current = null;
      setCurrentAudioPlayer(null);
      setCurrentAudioUri(null);
    }
  };

  const stopTTS = () => {
    try {
      // Stop expo-speech if it's running
      Speech.stop();
    } catch (error) {
      console.warn('[TTS-Stop] Error stopping speech:', error);
    }

    // OPTIMIZATION: Pause cached player instead of removing it
    if (currentTTSRef.current) {
      try {
        currentTTSRef.current.pause();
        // Reset to beginning for next play
        currentTTSRef.current.seekTo(0);
        // DON'T remove - keep in cache for reuse!
        console.log('[TTS-Stop] Paused cached player (keeping in cache)');
      } catch (error) {
        console.warn('[TTS-Stop] Error pausing audio player:', error);
      }
      currentTTSRef.current = null;
    }
  
    // Reset playback states
    setIsPlayingTTS(false);
    setIsLoadingTTS(false);
    setCurrentAudioPlayer(null);
    setCurrentAudioUri(null);
    lastAutoPlayedQuestionIdRef.current = null;
  };

  const stopCurrentTTS = () => {
    // small wrapper for clarity
    stopTTS();
  };

  const renderTTSButton = (audioUrl?: string | null) => {
    if (!audioUrl) return null;
    const isActive = isPlayingTTS && currentAudioUri === audioUrl;
    return (
      <TouchableOpacity
        onPress={isActive ? stopTTS : () => playTTS(audioUrl)} // Simplified - no attempt parameter needed
        style={styles.ttsButton}
        activeOpacity={0.8}
      >
        <MaterialIcons name={isActive ? 'stop-circle' : (isLoadingTTS ? 'hourglass-bottom' : 'volume-up')} size={18} color={'#ffffff'} />
        <Text style={styles.ttsButtonText}>{isActive ? 'Stop' : (isLoadingTTS ? 'Loading…' : 'Listen')}</Text>
      </TouchableOpacity>
    );
  };

  // Auto-play TTS on question change when available - OPTIMIZED for cached audio
  useEffect(() => {
    if (!exercise) return;
    if (loading || isPreloadingResources || !exerciseStarted) return; // Don't auto-play during loading or before start
    const q = exercise.questions[currentQuestionIndex];
    if (!q) return;
    
    // CRITICAL: Stop any previous audio IMMEDIATELY
    stopCurrentTTS();
    
    if (!isFocused) return; // only auto-play when screen is focused
    if (lastAutoPlayedQuestionIdRef.current === q.id) return;
    
    // Always set the last played question ID regardless of whether TTS exists
    lastAutoPlayedQuestionIdRef.current = q.id;
    
    if (q.ttsAudioUrl) {
      // OPTIMIZATION: Check if audio is cached - if so, play instantly!
      const isCached = audioPlayerCacheRef.current.has(q.ttsAudioUrl);
      const delay = isCached ? 200 : 600; // Much shorter delay for cached audio
      
      console.log(`[TTS-AutoPlay] Audio ${isCached ? 'CACHED' : 'NOT cached'} - delay: ${delay}ms`);
      
      setTimeout(() => {
        playTTS(q.ttsAudioUrl!);
      }, delay);
    }
  }, [exercise, currentQuestionIndex, isFocused, loading, isPreloadingResources, exerciseStarted]);

  // Stop any TTS if screen loses focus
  useEffect(() => {
    if (!isFocused) {
      stopCurrentTTS();
    }
  }, [isFocused]);

  const formatCorrectAnswer = (question: Question): string | string[] => {
    if (question.type === 'multiple-choice') {
      // CRITICAL: Check if this is an image-based question
      const hasOptionImages = question.optionImages && question.optionImages.length > 0 && question.optionImages.some(img => img);
      const hasEmptyOptions = (question.options || []).every(opt => !opt || opt.trim() === '');
      
      // CRITICAL: For image-based questions with empty text, just use the letter directly
      if (hasOptionImages && hasEmptyOptions) {
        if (Array.isArray(question.answer)) {
          return (question.answer as string[]).join(', ');
        }
        return String(question.answer ?? '');
      }
      
      // For text-based questions, use the full mapping logic
      if (Array.isArray(question.answer)) {
        const values = (question.answer as string[]).map(t => mapAnswerTokenToOptionValue(question, String(t)));
        const labeled = values.map(v => {
          const letter = getOptionLetterForValue(question, v);
          // CRITICAL: Extract filename if v is a URL
          const displayValue = extractFileName(v);
          return letter ? `${letter}. ${displayValue}` : displayValue;
        });
        return labeled.join(', ');
      }
      const v = mapAnswerTokenToOptionValue(question, String(question.answer ?? ''));
      const letter = getOptionLetterForValue(question, v);
      // CRITICAL: Extract filename if v is a URL
      const displayValue = extractFileName(v);
      return letter ? `${letter}. ${displayValue}` : displayValue;
    }
    if (question.type === 'identification') {
      if (Array.isArray(question.answer)) {
        // For multiple blanks, show numbered answers for clarity
        const answers = question.answer as string[];
        if (answers.length > 1) {
          return answers.map((x, idx) => `[${idx + 1}] ${extractFileName(String(x))}`).join('  ');
        }
        return answers.map(x => extractFileName(String(x))).join(', ');
      }
      return extractFileName(String(question.answer ?? ''));
    }
    if (question.type === 'matching') {
      const pairs = question.pairs || [];
      return pairs.map(p => {
        // CRITICAL: Extract filenames if these are URLs
        const leftDisplay = extractFileName(p.left);
        const rightDisplay = extractFileName(p.right);
        return `${leftDisplay} → ${rightDisplay}`;
      }).join('; ');
    }
    if (question.type === 're-order') {
      const baseIds: string[] = (question.order && question.order.length)
        ? (question.order as string[])
        : (question.reorderItems || []).map(it => it.id);
      if (!baseIds.length) return '';
      // Apply direction if specified
      const ids = question.reorderDirection === 'desc' ? [...baseIds].reverse() : baseIds;
      const map = new Map((question.reorderItems || []).map(it => [it.id, it] as const));
      const labels = ids.map(id => {
        const label = getReorderItemLabel(map.get(id) || null);
        // CRITICAL: Extract filename if this is a URL
        return extractFileName(label);
      });
      return labels.join(' , ');
    }
    if (question.type === 'reading-passage') {
      const subs = question.subQuestions || [];
      const lines = subs.map((sq, i) => {
        const ans = formatCorrectAnswer(sq);
        return `Q${i + 1}: ${Array.isArray(ans) ? ans.join(', ') : ans}`;
      });
      return lines.join(' | ');
    }
    return '';
  };

  // Serialize student's answer for attempt logging and summary display
  const serializeAnswer = (question: Question, ans: any): string => {
    try {
      if (question.type === 'multiple-choice') {
        // CRITICAL: Check if this is an image-based question
        const hasOptionImages = question.optionImages && question.optionImages.length > 0 && question.optionImages.some(img => img);
        const hasEmptyOptions = (question.options || []).every(opt => !opt || opt.trim() === '');
        
        // CRITICAL: For image-based questions with empty text, just use the letter directly
        if (hasOptionImages && hasEmptyOptions) {
          const arr = (Array.isArray(ans) ? ans : [ans]).filter(Boolean).map(x => String(x));
          if (arr.length === 0) return '';
          // Just return the letters as-is (e.g., "A", "B", "C")
          return arr.join(', ');
        }
        
        // For text-based questions, use the full mapping logic
        const arr = (Array.isArray(ans) ? ans : [ans]).filter(Boolean).map(x => String(x));
        
        if (arr.length === 0) {
          console.warn('[SerializeAnswer] Empty answer array after filtering!', {
            questionId: question.id,
            originalAnswer: ans
          });
          return '';
        }
        
        const labeled = arr.map(v => {
          const valueText = mapAnswerTokenToOptionValue(question, v);
          const letter = getOptionLetterForValue(question, valueText) || v.toUpperCase();
          // CRITICAL: Extract filename if valueText is a URL
          const displayText = extractFileName(valueText);
          return `${letter}. ${displayText}`;
        });
        return labeled.join(', ');
      }
      if (question.type === 'identification') {
        if (Array.isArray(ans)) {
          // For multiple blanks, show numbered answers for clarity
          if (ans.length > 1) {
            return ans.map((x, idx) => `[${idx + 1}] ${extractFileName(String(x))}`).join('  ');
          }
          return ans.map((x) => extractFileName(String(x))).join(', ');
        }
        return extractFileName(String(ans ?? ''));
      }
      if (question.type === 're-order') {
        const ids = Array.isArray(ans) ? ans as string[] : [];
        const map = new Map((question.reorderItems || []).map(it => [it.id, it] as const));
        const labels = ids.map(id => {
          const item = map.get(id);
          if (!item) return '';
          const label = getReorderItemLabel(item);
          // CRITICAL: Extract filename if this is a URL
          return extractFileName(label);
        });
        return labels.join(' , ');
      }
      if (question.type === 'matching') {
        // FIXED: Format matching pairs in a readable way
        if (!ans || typeof ans !== 'object') return 'No pairs matched';
        
        const pairs = question.pairs || [];
        const studentPairs = ans as {[leftIndex: string]: number};
        const pairedItems: string[] = [];
        
        // Build list of matched pairs
        for (let i = 0; i < pairs.length; i++) {
          const leftKey = `left-${i}`;
          const rightIndex = studentPairs[leftKey];
          
          if (rightIndex !== undefined && rightIndex !== null && pairs[rightIndex]) {
            const leftText = pairs[i].left || `Item ${i + 1}`;
            const rightText = pairs[rightIndex].right || `Item ${rightIndex + 1}`;
            // CRITICAL: Extract filenames if these are URLs
            const leftDisplay = extractFileName(leftText);
            const rightDisplay = extractFileName(rightText);
            pairedItems.push(`${leftDisplay} → ${rightDisplay}`);
          }
        }
        
        return pairedItems.length > 0 ? pairedItems.join('; ') : 'No pairs matched';
      }
      if (question.type === 'reading-passage') {
        return ans && typeof ans === 'object' ? JSON.stringify(ans) : String(ans ?? '');
      }
      return String(ans ?? '');
    } catch {
      return String(ans ?? '');
    }
  };

  // Helper function to determine question phase
  const getQuestionPhase = (question: Question, ans: any): 'reading' | 'thinking' | 'answering' | 'reviewing' => {
    if (!ans || ans === '' || ans === null) return 'reading';
    if (question.type === 'multiple-choice' && Array.isArray(ans) && ans.length === 0) return 'thinking';
    if (question.type === 're-order' && Array.isArray(ans) && ans.length < (question.reorderItems?.length || 0)) return 'answering';
    return 'reviewing';
  };

  // Helper function to estimate confidence based on behavior patterns
  const estimateConfidence = (question: Question, ans: any, timeSpent: number, attemptNumber: number): 'high' | 'medium' | 'low' => {
    const timePerAttempt = timeSpent / attemptNumber;
    const isQuickAnswer = timePerAttempt < 5000; // Less than 5 seconds per attempt
    const isSlowAnswer = timePerAttempt > 15000; // More than 15 seconds per attempt
    
    if (attemptNumber === 1 && isQuickAnswer) return 'high';
    if (attemptNumber > 2 || isSlowAnswer) return 'low';
    return 'medium';
  };

  // Helper function to extract question metadata and difficulty
  const getQuestionMetadata = (question: Question) => {
    const metadata = {
      difficulty: 'medium' as 'easy' | 'medium' | 'hard',
      topicTags: [] as string[],
      learningObjectives: [] as string[],
      cognitiveLoad: 'medium' as 'low' | 'medium' | 'high',
      questionComplexity: 'medium' as 'simple' | 'medium' | 'complex'
    };

    // Analyze question text for difficulty indicators
    const questionText = question.question?.toLowerCase() || '';
    const hasImage = !!question.questionImage;
    const hasMultipleSteps = questionText.includes('step') || questionText.includes('first') || questionText.includes('then');
    const hasWordProblem = questionText.includes('has') || questionText.includes('bought') || questionText.includes('gave');
    
    // Determine difficulty based on content
    if (question.type === 'multiple-choice' && question.options?.length === 2) {
      metadata.difficulty = 'easy';
    } else if (hasWordProblem || hasMultipleSteps || question.type === 're-order') {
      metadata.difficulty = 'hard';
    } else if (hasImage || question.type === 'matching') {
      metadata.difficulty = 'medium';
    }

    // Extract topic tags based on question content
    if (questionText.includes('add') || questionText.includes('plus') || questionText.includes('+')) {
      metadata.topicTags.push('addition');
    }
    if (questionText.includes('subtract') || questionText.includes('minus') || questionText.includes('-')) {
      metadata.topicTags.push('subtraction');
    }
    if (questionText.includes('count') || questionText.includes('number')) {
      metadata.topicTags.push('counting');
    }
    if (questionText.includes('shape') || questionText.includes('circle') || questionText.includes('square')) {
      metadata.topicTags.push('geometry');
    }
    if (questionText.includes('bigger') || questionText.includes('smaller') || questionText.includes('compare')) {
      metadata.topicTags.push('comparison');
    }

    // Determine cognitive load
    if (hasImage && hasWordProblem) {
      metadata.cognitiveLoad = 'high';
    } else if (hasImage || hasWordProblem) {
      metadata.cognitiveLoad = 'medium';
    } else {
      metadata.cognitiveLoad = 'low';
    }

    // Determine question complexity
    if (question.type === 're-order' || hasMultipleSteps) {
      metadata.questionComplexity = 'complex';
    } else if (question.type === 'matching' || hasImage) {
      metadata.questionComplexity = 'medium';
    } else {
      metadata.questionComplexity = 'simple';
    }

    return metadata;
  };

  // Helper function to log interactions
  const logInteraction = (questionId: string, type: 'option_hover' | 'option_click' | 'help_used' | 'navigation' | 'answer_change', target: string, duration?: number) => {
    const interaction = {
      type,
      target,
      timestamp: Date.now(),
      duration: duration || 0 // Ensure duration is never undefined
    };
    
    setInteractionLogs(prev => ({
      ...prev,
      [questionId]: [...(prev[questionId] || []), interaction]
    }));
  };

  // Helper function to track option hover times
  const trackOptionHover = (questionId: string, optionKey: string, startTime: number) => {
    setOptionHoverTimes(prev => ({
      ...prev,
      [questionId]: {
        ...(prev[questionId] || {}),
        [optionKey]: startTime
      }
    }));
  };

  // Helper function to track help usage (only for user-initiated help actions)
  const trackHelpUsage = (questionId: string, type: 'help_button') => {
    setHelpUsage(prev => ({
      ...prev,
      [questionId]: {
        ...(prev[questionId] || {ttsCount: 0, helpButtonClicks: 0}),
        helpButtonClicks: (prev[questionId]?.helpButtonClicks || 0) + 1
      }
    }));
    logInteraction(questionId, 'help_used', type, 0);
  };

  // CRITICAL FIX: Helper functions to update both state and ref synchronously
  const updateAnswers = (updater: (prev: StudentAnswer[]) => StudentAnswer[]) => {
    setAnswers(prev => {
      const updated = updater(prev);
      
      // CRITICAL: Validate and auto-fix questionable answers (e.g., timeout with no answer)
      const validated = updated.map((ans, idx) => {
        if (ans.isCorrect === true && (!ans.answer || ans.answer === '')) {
          console.warn('[UpdateAnswers] Auto-fixing: Question marked correct with empty answer (likely timeout)', {
            index: idx,
            questionId: ans.questionId,
            answer: ans.answer
          });
          // Auto-fix: Force to incorrect if no answer
          return { ...ans, isCorrect: false };
        }
        return ans;
      });
      
      answersRef.current = validated; // Update ref synchronously
      return validated;
    });
  };
  
  const updateAttemptCount = (questionId: string, count: number) => {
    attemptCountsRef.current = { ...attemptCountsRef.current, [questionId]: count };
    setAttemptCounts(prev => ({ ...prev, [questionId]: count }));
  };
  
  const incrementAttemptCount = (questionId: string) => {
    const newCount = (attemptCountsRef.current[questionId] || 0) + 1;
    attemptCountsRef.current = { ...attemptCountsRef.current, [questionId]: newCount };
    setAttemptCounts(prev => ({ ...prev, [questionId]: newCount }));
    return newCount;
  };
  
  const setQuestionCorrect = (questionId: string, isCorrect: boolean) => {
    correctQuestionsRef.current = { ...correctQuestionsRef.current, [questionId]: isCorrect };
    setCorrectQuestions(prev => ({ ...prev, [questionId]: isCorrect }));
  };

  // CRITICAL FIX: Single source of truth for attempt counting
  // Always count ALL attempts from attemptHistory - no filtering or deduplication
  const getQuestionAttemptCount = (questionId: string): number => {
    const attempts = attemptLogsRef.current[questionId] || [];
    
    // Simply return the total count of all attempts
    // This matches what gets saved to database as attemptHistory.length
    return attempts.length;
  };

  const getTotalAttemptCount = (): number => {
    if (!exercise) return 0;
    return exercise.questions.reduce((sum, q) => sum + getQuestionAttemptCount(q.id), 0);
  };

  const logAttempt = (question: Question, ans: any, attemptType: 'initial' | 'change' | 'final' = 'change') => {
    const text = serializeAnswer(question, ans);
    
    // Don't log empty answers unless it's a final attempt (timeout case)
    if (!text || text.trim() === '') {
      if (attemptType !== 'final') {
        return; // Skip logging empty answers for initial/change attempts
      }
    }
    
    const currentTime = Date.now();
    const timeSpent = currentTime - questionStartTime;
    
    // CRITICAL FIX: Use ref for synchronous access to previous attempts
    const previousAttempts = attemptLogsRef.current[question.id] || [];
    const lastAttemptTime = previousAttempts.length > 0 ? previousAttempts[previousAttempts.length - 1].timestamp : questionStartTime;
    const hesitationTime = currentTime - lastAttemptTime;
    
    // Determine if this is a significant change or just a minor adjustment
    const isSignificantChange = previousAttempts.length === 0 || 
      (previousAttempts.length > 0 && previousAttempts[previousAttempts.length - 1].answer !== text);
    
    const newAttempt = {
      answer: text,
      timeSpent: timeSpent,
      timestamp: currentTime,
      attemptType: attemptType,
      hesitationTime: hesitationTime,
      isSignificantChange: isSignificantChange,
      questionPhase: getQuestionPhase(question, ans), // 'reading', 'thinking', 'answering', 'reviewing'
      confidence: estimateConfidence(question, ans, timeSpent, previousAttempts.length + 1)
    };
    
    // CRITICAL FIX: Update ref synchronously first, then state
    attemptLogsRef.current = {
      ...attemptLogsRef.current,
      [question.id]: [...(attemptLogsRef.current[question.id] || []), newAttempt]
    };
    
    console.log(`[LogAttempt] Logged attempt for ${question.id}:`, {
      attemptType,
      answer: text,
      totalAttempts: attemptLogsRef.current[question.id].length,
      attemptNumber: attemptLogsRef.current[question.id].length
    });
    
    // Update state for UI (but we'll use ref for submission)
    setAttemptLogs(prev => ({
      ...prev,
      [question.id]: [...(prev[question.id] || []), newAttempt],
    }));
  };

  // Keep attemptCounts in sync with attemptLogsRef length (authoritative)
  const syncAttemptCount = (questionId: string) => {
    const len = (attemptLogsRef.current[questionId] || []).length;
    updateAttemptCount(questionId, len);
  };
  const loadExercise = async () => {
    try {
      setLoading(true);
      
      // Set random background
      setBackgroundImage(getRandomBackground());
      
      // Always enable TTS autoplay for all contexts
      
      // Get parent ID and find associated student ID
      let parentId: string | null = null;
      let studentId: string | null = null;
      try {
        const loginCode = await AsyncStorage.getItem('parent_key');
        console.log('[LoadExercise] Login code from AsyncStorage:', loginCode);
        
        if (loginCode) {
          // CRITICAL FIX: Resolve login code to actual parent ID
          const parentIdResult = await readData(`/parentLoginCodes/${loginCode}`);
          console.log('[LoadExercise] Parent ID resolution result:', parentIdResult);
          
          if (parentIdResult.data) {
            parentId = parentIdResult.data;
            console.log('[LoadExercise] Resolved actual parentId:', parentId);
            
            // Find the student associated with this actual parent ID
            const studentsData = await readData('/students');
            if (studentsData.data) {
              const student = Object.values(studentsData.data).find((s: any) => s.parentId === parentId) as any;
              console.log('[LoadExercise] Found student:', student);
              
              if (student && student.studentId) {
                studentId = student.studentId;
                console.log('[LoadExercise] Final studentId:', studentId);
                
                // Store student ID in AsyncStorage for future use
                if (studentId) {
                  await AsyncStorage.setItem('student_id', studentId);
                  console.log('[LoadExercise] Student ID stored in AsyncStorage');
                }
              } else {
                console.warn('[LoadExercise] No student found with parentId:', parentId);
              }
            } else {
              console.warn('[LoadExercise] No students data available');
            }
          } else {
            console.warn('[LoadExercise] No parent ID found for login code:', loginCode);
          }
        } else {
          console.warn('[LoadExercise] No login code found in AsyncStorage');
        }
      } catch (error) {
        console.error('[LoadExercise] Failed to get parent key or student ID:', error);
        if (error instanceof Error) {
          logErrorWithStack(error, 'error', 'StudentExerciseAnswering', 'Failed to resolve parent/student IDs');
        }
      }
      
      // If assignedExerciseId is provided, load assigned exercise data first
      if (assignedExerciseId) {
        console.log('Loading assigned exercise:', assignedExerciseId);
        const assignedExerciseResult = await readData(`/assignedExercises/${assignedExerciseId}`);
        
        if (!assignedExerciseResult.data) {
          showCustomAlert('Error', 'Assigned exercise not found', () => router.back(), 'error');
          return;
        }
        
        const assignedData = assignedExerciseResult.data;
        setAssignedExercise(assignedData);
        
        // Validate assigned exercise data structure
        if (!assignedData.exerciseId) {
          showCustomAlert('Error', 'Invalid assigned exercise data - missing exercise reference', () => router.back(), 'error');
          return;
        }
        
        // Check if assignment is still accepting submissions
        if (assignedData.acceptingStatus !== 'open') {
          showCustomAlert('Assignment Closed', 'This assignment is no longer accepting submissions.', () => router.back(), 'warning');
          return;
        }
        
        // Check deadline
        const now = new Date();
        let deadline: Date;
        try {
          deadline = new Date(assignedData.deadline);
          if (isNaN(deadline.getTime())) {
            throw new Error('Invalid deadline date');
          }
        } catch (error) {
          console.error('Invalid deadline date:', assignedData.deadline);
          showCustomAlert('Error', 'Invalid assignment deadline date', () => router.back(), 'error');
          return;
        }
        
        if (now > deadline) {
          // Check if late submissions are allowed
          if (!assignedData.acceptLateSubmissions) {
            showCustomAlert('Deadline Passed', 'The deadline for this assignment has passed and late submissions are not allowed.', () => router.back(), 'warning');
            return;
          } else {
            // Show warning but allow submission
            showCustomAlert('Late Submission', 'The deadline has passed, but late submissions are allowed for this assignment.', undefined, 'warning');
          }
        }
        
        // Use the exerciseId from the assigned exercise (override the URL parameter)
        const actualExerciseId = assignedData.exerciseId;
        console.log('Loading exercise from assignment:', actualExerciseId);
        
        const result = await readData(`/exercises/${actualExerciseId}`);
        if (result.data) {
          // Validate exercise data structure
          if (!result.data.questions || !Array.isArray(result.data.questions) || result.data.questions.length === 0) {
            showCustomAlert('Error', 'Invalid exercise data - no questions found', () => router.back(), 'error');
            return;
          }
          
          // CRITICAL: Validate multiple choice questions have valid options
          const invalidQuestions: string[] = [];
          result.data.questions.forEach((q: Question, idx: number) => {
            if (q.type === 'multiple-choice') {
              // Check if this question uses images as options
              const hasOptionImages = q.optionImages && q.optionImages.length > 0 && q.optionImages.some(img => img);
              
              if (hasOptionImages) {
                // Image-based options: validate that we have at least some images
                const validImageCount = q.optionImages?.filter(img => img && typeof img === 'string' && img.trim() !== '').length || 0;
                if (validImageCount === 0) {
                  invalidQuestions.push(`Question ${idx + 1}: No valid option images`);
                  console.error('[LoadExercise] Invalid MC question - no images:', {
                    questionId: q.id,
                    questionNumber: idx + 1,
                    optionImages: q.optionImages
                  });
                }
              } else {
                // Text-based options: validate text options
                const validOptions = (q.options || []).filter(opt => opt && typeof opt === 'string' && opt.trim() !== '');
                if (validOptions.length === 0) {
                  invalidQuestions.push(`Question ${idx + 1}: No valid options`);
                  console.error('[LoadExercise] Invalid MC question - no text options:', {
                    questionId: q.id,
                    questionNumber: idx + 1,
                    options: q.options
                  });
                } else if (validOptions.length < (q.options?.length || 0)) {
                  console.warn('[LoadExercise] MC question has some invalid options:', {
                    questionId: q.id,
                    questionNumber: idx + 1,
                    totalOptions: q.options?.length,
                    validOptions: validOptions.length
                  });
                }
              }
            }
          });
          
          if (invalidQuestions.length > 0) {
            showCustomAlert(
              'Invalid Exercise Data', 
              `This exercise has questions with missing or invalid answer options:\n\n${invalidQuestions.join('\n')}\n\nPlease contact your teacher to fix this exercise.`,
              () => router.back(),
              'error'
            );
            return;
          }
          
          const exerciseData = {
            ...result.data,
            id: actualExerciseId,
          };
          
          // Validate and fix question fairness before setting exercise
          console.log('[Validation] Validating exercise questions for fairness...');
          const validatedQuestions = exerciseData.questions.map((question: Question) => {
            if (question.type === 'matching') {
              if (!validateMatchingQuestion(question)) {
                console.log(`[Validation] Fixing matching question ${question.id}`);
                return fixMatchingQuestion(question);
              }
            } else if (question.type === 're-order') {
              if (!validateReorderQuestion(question)) {
                console.log(`[Validation] Fixing reorder question ${question.id}`);
                return fixReorderQuestion(question);
              }
            }
            return question;
          });
          
          const validatedExerciseData = {
            ...exerciseData,
            questions: validatedQuestions
          };
          
          setExercise(validatedExerciseData);
          
          // Start comprehensive resource preloading
          setIsPreloadingResources(true);
          setPreloadProgress(0);
          setAnimatedProgress(0);
          setPreloadStatus('Preparing resources...');
          setPreloadError(null);
          
          try {
            const allResources = collectAllResources(validatedExerciseData);
            console.log(`[Preload] Found ${allResources.length} resources to preload:`, {
              images: allResources.filter(r => r.type === 'image').length,
              audio: allResources.filter(r => r.type === 'audio').length,
              highPriority: allResources.filter(r => r.priority === 'high').length,
              mediumPriority: allResources.filter(r => r.priority === 'medium').length,
              lowPriority: allResources.filter(r => r.priority === 'low').length
            });
            
              if (allResources.length > 0) {
              const preloadResults = await preloadResourcesWithProgress(allResources);
              
              const successCount = preloadResults.filter(r => r.success).length;
              const failCount = preloadResults.filter(r => !r.success).length;
              const audioCount = allResources.filter(r => r.type === 'audio').length;
              const audioSuccessCount = preloadResults.filter((r, i) => r.success && allResources[i].type === 'audio').length;
              
              console.log(`[Preload] Completed: ${successCount} successful, ${failCount} failed (will load on-demand)`);
              console.log(`[Preload] TTS Audio: ${audioSuccessCount}/${audioCount} cached for instant playback`);
              
              if (failCount > 0) {
                console.log(`[Preload] ${failCount} resources will load on-demand (optimized for speed)`);
              }
              
              // Mark TTS preload as complete
              setTtsPreloadComplete(audioSuccessCount > 0);
              
              setPreloadStatus(`Ready! Loaded ${successCount} essential resources (${audioSuccessCount} TTS audio cached). 🚀`);
              setResourcesReady(true);
            } else {
              setPreloadStatus('Ready to start! 🎉');
              setResourcesReady(true);
            }
          } catch (error) {
            console.error('Resource preloading failed:', error);
            setPreloadError(error instanceof Error ? error.message : 'Failed to preload resources');
            setResourcesReady(true); // Still allow starting even if preloading fails
          } finally {
            setIsPreloadingResources(false);
            setPreloadProgress(100);
          }
          if (levelMode) {
            setCurrentQuestionIndex(levelIndex);
          }
          // Initialize answers array (including nested sub-answers for reading-passage)
          const initialAnswers = result.data.questions.map((q: Question) => ({
            questionId: q.id,
            answer:
              q.type === 'multiple-choice' ? [] :
              q.type === 'matching' ? {} :
              q.type === 're-order' ? [] :
              q.type === 'reading-passage'
                ? (q.subQuestions || []).reduce((acc: {[key: string]: any}, sq: Question) => {
                    acc[sq.id] =
                      sq.type === 'multiple-choice' ? [] :
                      sq.type === 'matching' ? {} :
                      sq.type === 're-order' ? [] :
                      '';
                    return acc;
                  }, {})
                : '',
            timeSpent: 0,
          }));
          // CRITICAL FIX: Initialize ref and state
          answersRef.current = initialAnswers;
          setAnswers(initialAnswers);
          // Initialize attempts and correctness maps
          const initAttempts: {[id: string]: number} = {};
          const initCorrect: {[id: string]: boolean} = {};
          (result.data.questions as Question[]).forEach((q: Question) => {
            initAttempts[q.id] = 0;
            initCorrect[q.id] = false;
            // Also initialize for sub-questions in reading-passage
            if (q.type === 'reading-passage' && q.subQuestions) {
              q.subQuestions.forEach((sq) => {
                initAttempts[sq.id] = 0;
                initCorrect[sq.id] = false;
              });
            }
          });
          // CRITICAL FIX: Initialize both state and ref
          attemptCountsRef.current = initAttempts;
          correctQuestionsRef.current = initCorrect;
          setAttemptCounts(initAttempts);
          setCorrectQuestions(initCorrect);
        } else {
          showCustomAlert('Error', 'Exercise not found', () => router.back(), 'error');
        }
      } else {
        // Fallback to direct exercise loading (existing behavior)
        if (!exerciseId) {
          showCustomAlert('Error', 'No exercise ID provided', () => router.back(), 'error');
          return;
        }
        
        const result = await readData(`/exercises/${exerciseId}`);
        if (result.data) {
          // Validate exercise data structure
          if (!result.data.questions || !Array.isArray(result.data.questions) || result.data.questions.length === 0) {
            showCustomAlert('Error', 'Invalid exercise data - no questions found', () => router.back(), 'error');
            return;
          }
          
          // CRITICAL: Validate multiple choice questions have valid options
          const invalidQuestions: string[] = [];
          result.data.questions.forEach((q: Question, idx: number) => {
            if (q.type === 'multiple-choice') {
              // Check if this question uses images as options
              const hasOptionImages = q.optionImages && q.optionImages.length > 0 && q.optionImages.some(img => img);
              
              if (hasOptionImages) {
                // Image-based options: validate that we have at least some images
                const validImageCount = q.optionImages?.filter(img => img && typeof img === 'string' && img.trim() !== '').length || 0;
                if (validImageCount === 0) {
                  invalidQuestions.push(`Question ${idx + 1}: No valid option images`);
                  console.error('[LoadExercise] Invalid MC question - no images:', {
                    questionId: q.id,
                    questionNumber: idx + 1,
                    optionImages: q.optionImages
                  });
                }
              } else {
                // Text-based options: validate text options
                const validOptions = (q.options || []).filter(opt => opt && typeof opt === 'string' && opt.trim() !== '');
                if (validOptions.length === 0) {
                  invalidQuestions.push(`Question ${idx + 1}: No valid options`);
                  console.error('[LoadExercise] Invalid MC question - no text options:', {
                    questionId: q.id,
                    questionNumber: idx + 1,
                    options: q.options
                  });
                } else if (validOptions.length < (q.options?.length || 0)) {
                  console.warn('[LoadExercise] MC question has some invalid options:', {
                    questionId: q.id,
                    questionNumber: idx + 1,
                    totalOptions: q.options?.length,
                    validOptions: validOptions.length
                  });
                }
              }
            }
          });
          
          if (invalidQuestions.length > 0) {
            showCustomAlert(
              'Invalid Exercise Data', 
              `This exercise has questions with missing or invalid answer options:\n\n${invalidQuestions.join('\n')}\n\nPlease contact your teacher to fix this exercise.`,
              () => router.back(),
              'error'
            );
            return;
          }
          
          setExercise({
            ...result.data,
            id: exerciseId as string,
          });
          // Warm cache for first questions (current and next two)
          if (levelMode) {
            setCurrentQuestionIndex(levelIndex);
          }
          // Initialize answers array (including nested sub-answers for reading-passage)
          const initialAnswers = result.data.questions.map((q: Question) => ({
            questionId: q.id,
            answer:
              q.type === 'multiple-choice' ? [] :
              q.type === 'matching' ? {} :
              q.type === 're-order' ? [] :
              q.type === 'reading-passage'
                ? (q.subQuestions || []).reduce((acc: {[key: string]: any}, sq: Question) => {
                    acc[sq.id] =
                      sq.type === 'multiple-choice' ? [] :
                      sq.type === 'matching' ? {} :
                      sq.type === 're-order' ? [] :
                      '';
                    return acc;
                  }, {})
                : '',
            timeSpent: 0,
          }));
          // CRITICAL FIX: Initialize ref and state
          answersRef.current = initialAnswers;
          setAnswers(initialAnswers);
          // Initialize attempts and correctness maps
          const initAttempts: {[id: string]: number} = {};
          const initCorrect: {[id: string]: boolean} = {};
          (result.data.questions as Question[]).forEach((q: Question) => {
            initAttempts[q.id] = 0;
            initCorrect[q.id] = false;
            // Also initialize for sub-questions in reading-passage
            if (q.type === 'reading-passage' && q.subQuestions) {
              q.subQuestions.forEach((sq) => {
                initAttempts[sq.id] = 0;
                initCorrect[sq.id] = false;
              });
            }
          });
          // CRITICAL FIX: Initialize both state and ref
          attemptCountsRef.current = initAttempts;
          correctQuestionsRef.current = initCorrect;
          setAttemptCounts(initAttempts);
          setCorrectQuestions(initCorrect);
        } else {
          showCustomAlert('Error', 'Exercise not found', () => router.back(), 'error');
        }
      }
    } catch (error) {
      console.error('Failed to load exercise:', error);
      showCustomAlert('Error', 'Failed to load exercise', () => router.back(), 'error');
    } finally {
      setLoading(false);
    }
  };
  
  const handleAnswerChange = (answer: string | string[] | {[key: string]: any}) => {
    setCurrentAnswer(answer);
    
    // Track answer change interaction
    if (exercise && exercise.questions[currentQuestionIndex]) {
      const currentQuestion = exercise.questions[currentQuestionIndex];
      logInteraction(currentQuestion.id, 'answer_change', 'user_input', 0);
    }
    
    // CRITICAL FIX: Update answers array using helper that updates both state and ref
    updateAnswers(prev => prev.map(a => 
      a.questionId === exercise?.questions[currentQuestionIndex].id 
        ? { ...a, answer }
        : a
    ));
  };

  // Helpers for reading-passage sub-answers
  const getSubAnswer = (parentId: string, subId: string): any => {
    const parent = answers.find(a => a.questionId === parentId);
    if (!parent) return undefined;
    const container = parent.answer;
    if (container && typeof container === 'object' && !Array.isArray(container)) {
      return (container as {[key: string]: any})[subId];
    }
    return undefined;
  };

  const setSubAnswer = (parentId: string, subId: string, value: any) => {
    updateAnswers(prev => prev.map(a => {
      if (a.questionId !== parentId) return a;
      const base = (a.answer && typeof a.answer === 'object' && !Array.isArray(a.answer)) ? { ...(a.answer as {[key: string]: any}) } : {};
      base[subId] = value;
      return { ...a, answer: base };
    }));
  };
  
  const handleNext = () => {
    if (!exercise) return;
    const q = exercise.questions[currentQuestionIndex];
    const currentAns = answers.find(a => a.questionId === q.id)?.answer;
    const correct = isAnswerCorrect(q, currentAns);
    const currentAttempts = attemptCounts[q.id] || 0;
    const maxAttempts = exercise?.maxAttemptsPerItem;
    
    console.log('[HandleNext] Processing answer:', {
      questionId: q.id,
      questionType: q.type,
      currentAnswer: currentAns,
      isCorrect: correct,
      currentAttempts,
      maxAttempts
    });
    
    // CRITICAL FIX: Only increment attempt count on WRONG answers
    if (!correct) {
      const newAttemptCount = currentAttempts + 1;
      updateAttemptCount(q.id, newAttemptCount);
      console.log('[HandleNext-Wrong] Incorrect answer, attempt:', newAttemptCount);
    
      // Save the wrong answer to the answers array
      updateAnswers(prev => {
        const updated = prev.map(a => 
          a.questionId === q.id ? { ...a, answer: currentAns || '', isCorrect: false } : a
        );
        console.log('[HandleNext] Updated answers array with wrong answer');
        return updated;
      });
      
      // Check if attempt limit is reached after wrong answer
      if (maxAttempts !== null && maxAttempts !== undefined && newAttemptCount >= maxAttempts) {
        console.log('[HandleNext] Max attempts reached, advancing automatically');
        setQuestionCorrect(q.id, false);
        logAttempt(q, currentAns, 'final');
        
        showCustomAlert(
          'Attempt Limit Reached', 
          `You have reached the maximum number of attempts (${maxAttempts}) for this question.`,
          () => {
            advanceToNextOrFinish();
          },
          'warning'
        );
        return;
      }
      
      // Log attempt and show feedback for wrong answer
      logAttempt(q, currentAns, 'change');
      
      // CRITICAL FIX: Mark the last attempt as 'final' when manually advancing
      // This ensures the final answer is properly categorized in attempt history
      const attempts = attemptLogsRef.current[q.id] || [];
      if (attempts.length > 0) {
        const lastAttempt = attempts[attempts.length - 1];
        if (lastAttempt.attemptType === 'change') {
          // Update the last attempt to be 'final' instead of creating a duplicate
          lastAttempt.attemptType = 'final';
          console.log('[HandleNext] Updated last attempt to final type for manual advancement');
        }
      }
      
      // Show remaining attempts if limit is set
      const remainingAttempts = maxAttempts !== null && maxAttempts !== undefined ? maxAttempts - newAttemptCount : null;
      const attemptMessage = remainingAttempts 
        ? `That is not correct yet. You have ${remainingAttempts} attempt${remainingAttempts > 1 ? 's' : ''} remaining.`
        : 'That is not correct yet. Please try again.';
      
      // Trigger global shake for non-selectable types
      Animated.sequence([
        Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 6, duration: 50, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: -6, duration: 50, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
      ]).start();
      triggerWrongFeedback();
      showCustomAlert('Try again', attemptMessage, undefined, 'warning');
      return;
    }
    
    // CORRECT ANSWER - Don't increment attempts
    // Stop TTS immediately when answer is correct
    stopCurrentTTS();
    
    console.log('[HandleNext-Correct] Correct answer, NO attempt increment, advancing');
    
    // Save the correct answer to the answers array
    updateAnswers(prev => {
      const updated = prev.map(a => 
        a.questionId === q.id ? { ...a, answer: currentAns || '', isCorrect: true } : a
      );
      console.log('[HandleNext] Updated answers array with correct answer');
      return updated;
    });
    
    setQuestionCorrect(q.id, true);
    logAttempt(q, currentAns, 'final');
    triggerCorrectFeedback(() => advanceToNextOrFinish());
  };

  const advanceToNextOrFinish = async () => {
    if (!exercise) {
      console.error('[AdvanceToNextOrFinish] No exercise loaded');
      return;
    }
    
    // CRITICAL: Prevent duplicate calls
    if (isAdvancingRef.current) {
      console.log('[AdvanceToNextOrFinish] Already advancing, skipping duplicate call');
      return;
    }
    
    isAdvancingRef.current = true;
    
    try {
      // Do not accumulate here; index-change effect handles accumulation centrally
      // Stop TTS if playing when moving forward
      stopCurrentTTS();
      
      // FIXED: Validate currentQuestionIndex is within bounds
      if (currentQuestionIndex < 0 || currentQuestionIndex >= exercise.questions.length) {
        console.error('[AdvanceToNextOrFinish] Invalid question index:', currentQuestionIndex);
        isAdvancingRef.current = false;
        return;
      }
      
      if (currentQuestionIndex < exercise.questions.length - 1) {
        const nextIndex = currentQuestionIndex + 1;
        setCurrentQuestionIndex(nextIndex);
        const nextQuestion = exercise.questions[nextIndex];
        if (nextQuestion) {
          const existingAnswer = answers.find(a => a.questionId === nextQuestion.id);
          // FIXED: Initialize currentAnswer with proper structure for each question type
        const initialAnswer = existingAnswer?.answer || 
          (nextQuestion.type === 'multiple-choice' ? [] : 
           nextQuestion.type === 'matching' ? {} : 
           nextQuestion.type === 're-order' ? [] : '');
        setCurrentAnswer(initialAnswer);
        
        // FIXED: Initialize matchingPairs state for matching questions
        if (nextQuestion.type === 'matching' && typeof initialAnswer === 'object' && !Array.isArray(initialAnswer)) {
          setMatchingPairs(prev => ({ ...prev, [nextQuestion.id]: initialAnswer }));
        }
        }
        
        // Reset time remaining for fresh start on new question
        if (exercise.timeLimitPerItem) {
          setTimeRemaining(exercise.timeLimitPerItem * 1000);
        }
        
        // Reset the advancing flag after moving to next question
        isAdvancingRef.current = false;
      } else {
        // FIXED: Last question - ensure proper cleanup and submission
        console.log('[AdvanceToNextOrFinish] Reached last question, preparing to finish...');
        
        // Accumulate the current question's elapsed time before stopping
        const qid = exercise.questions[currentQuestionIndex].id;
        const delta = (frozenElapsedRef.current ?? questionElapsedRef.current);
        
        // CRITICAL FIX: Use updateAnswers helper to update both state and ref
        updateAnswers(prev => {
          const updated = prev.map(a => a.questionId === qid ? { ...a, timeSpent: (a.timeSpent || 0) + delta } : a);
          console.log('[AdvanceToFinish] Final question time accumulated:', {
            questionId: qid,
            delta,
            updatedAnswer: updated.find(a => a.questionId === qid)
          });
          return updated;
        });
        
        frozenElapsedRef.current = null;
        if (timerInterval) {
          clearInterval(timerInterval);
          setTimerInterval(null);
        }
        
        // CRITICAL FIX: Wait for React state to commit before submission
        // This ensures all state updates (especially isCorrect flags and answers) are committed
        // Increased delay to handle slower devices and ensure all async state updates complete
        await new Promise(resolve => setTimeout(resolve, 250));
        
        // Auto-submit before showing results
        await autoSubmitResults();
        // Note: isAdvancingRef will be reset in autoSubmitResults after completion
      }
    } catch (error) {
      console.error('[AdvanceToNextOrFinish] Error:', error);
      isAdvancingRef.current = false;
      showCustomAlert('Error', 'An error occurred. Please try again.', undefined, 'error');
    }
  };
  
  const autoSubmitResults = async () => {
    // CRITICAL: Prevent duplicate submissions
    if (submittingRef.current) {
      console.log('[AutoSubmit] Already submitting, skipping duplicate call');
      return;
    }
    
    submittingRef.current = true;
    
    try {
      setSubmitting(true);
      await handleFinalSubmission();
    } catch (error) {
      console.error('Auto-submit failed:', error);
      // Still show results even if submission fails
      setShowResults(true);
    } finally {
      setSubmitting(false);
      submittingRef.current = false;
      isAdvancingRef.current = false;
    }
  };

  const triggerCorrectFeedback = (onComplete?: () => void) => {
    if (correctFeedbackActiveRef.current) {
      console.log('[Feedback] Correct feedback already active, skipping');
      return;
    }
    correctFeedbackActiveRef.current = true;
    // CRITICAL: Stop TTS immediately when answer is correct
    stopCurrentTTS();
    
    // Trigger haptic feedback for correct answer
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    
    // Freeze UI timer at the moment of correctness; used when recording
    frozenElapsedRef.current = questionElapsedRef.current;
    setShowCorrect(true);
    correctAnim.setValue(0);
    Animated.timing(correctAnim, { toValue: 1, duration: 180, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(() => {
      setTimeout(() => {
        Animated.timing(correctAnim, { toValue: 0, duration: 180, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(() => {
          setShowCorrect(false);
          correctFeedbackActiveRef.current = false;
          onComplete && onComplete();
        });
      }, 500);
    });
  };
  
  const triggerWrongFeedback = () => {
    if (wrongFeedbackActiveRef.current) {
      console.log('[Feedback] Wrong feedback already active, skipping');
      return;
    }
    wrongFeedbackActiveRef.current = true;
    // Trigger haptic feedback for wrong answer
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    
    setShowWrong(true);
    wrongAnim.setValue(0);
    Animated.timing(wrongAnim, { toValue: 1, duration: 180, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(() => {
      setTimeout(() => {
        Animated.timing(wrongAnim, { toValue: 0, duration: 180, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(() => {
          setShowWrong(false);
          wrongFeedbackActiveRef.current = false;
        });
      }, 500);
    });
  };

  // Custom alert function
  const showCustomAlert = (title: string, message: string, onConfirm?: () => void, type: 'warning' | 'error' | 'success' = 'warning') => {
    setAlertConfig({
      title,
      message,
      type,
      onConfirm: onConfirm || (() => {})
    });
    setShowAlertModal(true);
    
    // Animate modal in
    alertAnim.setValue(0);
    Animated.parallel([
      Animated.timing(alertAnim, {
        toValue: 1,
        duration: 200,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(cardScaleAnim, {
        toValue: 0.98,
        duration: 200,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
  };

  const hideCustomAlert = () => {
    Animated.parallel([
      Animated.timing(alertAnim, {
        toValue: 0,
        duration: 150,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(cardScaleAnim, {
        toValue: 1,
        duration: 150,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start(() => {
      setShowAlertModal(false);
      alertConfig.onConfirm();
    });
  };
  
  const handlePrevious = () => {
    if (currentQuestionIndex > 0) {
      // Accumulation handled by index-change effect; just move index
      // Stop TTS on navigation
      stopCurrentTTS();
      setCurrentQuestionIndex(prev => prev - 1);
      const prevQuestion = exercise?.questions[currentQuestionIndex - 1];
      if (prevQuestion) {
        const existingAnswer = answers.find(a => a.questionId === prevQuestion.id);
        setCurrentAnswer(existingAnswer?.answer || (prevQuestion.type === 'multiple-choice' ? [] : prevQuestion.type === 'matching' ? {} : prevQuestion.type === 're-order' ? [] : ''));
      }
    }
  };
  
  const formatTime = (milliseconds: number) => {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    
    // Show countdown format when time is running low (under 60 seconds)
    if (totalSeconds < 60) {
      return `${seconds}s`;
    }
    
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };
  
  // Time helpers for summary display
  const getTimeMsForQuestion = (q: Question): number => {
    const ans = answers.find(a => a.questionId === q.id);
    return ans?.timeSpent || 0;
  };
  const getTimeMsForSubQuestion = (parent: Question, _sub: Question): number => {
    const total = getTimeMsForQuestion(parent);
    const count = Math.max(1, parent.subQuestions?.length || 1);
    return Math.floor(total / count);
  };
  
  const unlockNextLevel = async () => {
    if (!exercise) return;
    const total = exercise.questions.length;
    const key = `progress:${exercise.id}`;
    const stored = await AsyncStorage.getItem(key);
    const currentUnlocked = stored ? Math.max(1, Number(stored)) : 1;
    const nextLevelNumber = levelIndex + 2;
    const newUnlocked = Math.max(currentUnlocked, Math.min(nextLevelNumber, total));
    await AsyncStorage.setItem(key, String(newUnlocked));
  };

  // Normalization helpers for comparisons
  const normalize = (s: any, caseSensitive = false) => {
    const str = String(s ?? '').trim();
    return caseSensitive ? str : str.toLowerCase();
  };
  const stripAccents = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const normalizeWithSettings = (s: any, settings?: Question['fillSettings']) => {
    let out = normalize(s, !!settings?.caseSensitive);
    if (settings?.ignoreAccents) out = stripAccents(out);
    return out;
  };
  
  // CRITICAL UTILITY: Extract filename from URL for consistent comparison
  // URLs with different tokens should be treated as the same if they point to the same file
  const extractFileName = (value: any): string => {
    if (!value) return '';
    const str = String(value).trim();
    
    // Check if this is a URL
    if (str.startsWith('http://') || str.startsWith('https://')) {
      try {
        // Extract filename from URL: everything after last '/' and before '?'
        const parts = str.split('/');
        const lastPart = parts[parts.length - 1];
        const filename = lastPart.split('?')[0];
        console.log('[ExtractFileName] URL detected, extracted:', { original: str.substring(0, 80) + '...', filename });
        return filename;
      } catch (error) {
        console.warn('[ExtractFileName] Failed to extract filename from URL:', str);
        return str;
      }
    }
    
    // Not a URL, return as-is
    return str;
  };
  
  // Helper to normalize value (extract filename if URL, then normalize)
  const normalizeValue = (value: any, caseSensitive = false): string => {
    const extracted = extractFileName(value);
    return normalize(extracted, caseSensitive);
  };
  // Helper: strip leading option letters like "C. 34" → "34" for robust comparisons
  const stripLeadingLetterPrefix = (text: string): string => {
    if (!text) return '';
    const trimmed = String(text).trim();
    const match = trimmed.match(/^([A-Z])\s*\.\s*(.*)$/i);
    return match ? match[2] : trimmed;
  };
  const letterToIndex = (letter: string) => {
    const upper = letter.trim().toUpperCase();
    if (upper.length !== 1) return -1;
    const code = upper.charCodeAt(0) - 65; // 'A' -> 0
    return code >= 0 && code <= 25 ? code : -1;
  };
  const mapAnswerTokenToOptionValue = (question: Question, token: string) => {
    if (!question.options || !question.options.length) return token;
    const idx = letterToIndex(token);
    if (idx >= 0 && idx < question.options.length) return question.options[idx];
    return token;
  };

  const indexToLetter = (index: number) => String.fromCharCode(65 + index);
  const getOptionLetterForValue = (question: Question, value: string): string => {
    if (!question.options || !question.options.length) return '';
    // CRITICAL: Extract filename before comparing
    const normValue = normalizeValue(value);
    const idx = question.options.findIndex(opt => normalizeValue(opt) === normValue);
    return idx >= 0 ? indexToLetter(idx) : '';
  };
  const isOptionCorrect = (question: Question, optionValue: string): boolean => {
    // CRITICAL: Check if this is an image-based question
    const hasOptionImages = question.optionImages && question.optionImages.length > 0 && question.optionImages.some(img => img);
    const hasEmptyOptions = (question.options || []).every(opt => !opt || opt.trim() === '');
    
    // CRITICAL: For image-based questions, compare letters directly
    if (hasOptionImages && hasEmptyOptions) {
      const expectedRaw = question.answer;
      if (Array.isArray(expectedRaw)) {
        return (expectedRaw as string[]).map(v => normalizeValue(v)).includes(normalizeValue(optionValue));
      }
      return normalizeValue(optionValue) === normalizeValue(String(expectedRaw));
    }
    
    // For text-based questions, use the mapping logic
    const expectedRaw = question.answer;
    if (Array.isArray(expectedRaw)) {
      const expectedValues = (expectedRaw as string[]).map(t => mapAnswerTokenToOptionValue(question, String(t)));
      // CRITICAL: Extract filenames before comparing and strip letter prefixes from optionValue
      const normExpectedSet = new Set(expectedValues.map(v => normalizeValue(v)));
      const normalizedCandidate = normalizeValue(stripLeadingLetterPrefix(optionValue));
      return normExpectedSet.has(normalizedCandidate);
    }
    const expectedValue = mapAnswerTokenToOptionValue(question, String(expectedRaw));
    // CRITICAL: Extract filenames before comparing and strip letter prefix from optionValue
    return normalizeValue(stripLeadingLetterPrefix(optionValue)) === normalizeValue(expectedValue);
  };

  const isAnswerCorrect = (question: Question, ans: any): boolean => {
    try {
      if (question.type === 'multiple-choice') {
        // CRITICAL: Check if this is an image-based question
        const hasOptionImages = question.optionImages && question.optionImages.length > 0 && question.optionImages.some(img => img);
        const hasEmptyOptions = (question.options || []).every(opt => !opt || opt.trim() === '');
        
        // CRITICAL: For image-based questions, compare letters directly without mapping
        if (hasOptionImages && hasEmptyOptions) {
          const expectedRaw = question.answer;
          if (Array.isArray(expectedRaw)) {
            const givenValues = (Array.isArray(ans) ? ans : [ans]).map(v => normalizeValue(v));
            const normExpected = (expectedRaw as string[]).map(v => normalizeValue(v));
            normExpected.sort();
            givenValues.sort();
            return normExpected.length === givenValues.length && normExpected.every((v, i) => v === givenValues[i]);
          }
          return normalizeValue(String(ans)) === normalizeValue(String(expectedRaw));
        }
        
        // For text-based questions, use the mapping logic
        const expectedRaw = question.answer;
        
        if (Array.isArray(expectedRaw)) {
          const expectedValues = (expectedRaw as string[]).map(t => mapAnswerTokenToOptionValue(question, String(t)));
          const givenValues = (Array.isArray(ans) ? ans : [ans])
            .map(t => stripLeadingLetterPrefix(String(t)))
            .map(t => mapAnswerTokenToOptionValue(question, String(t)));
          // CRITICAL: Extract filenames before normalizing for comparison, support letter-prefixed inputs
          const normExpected = expectedValues.map(v => normalizeValue(v));
          const normGiven = givenValues.map(v => normalizeValue(v));
          normExpected.sort();
          normGiven.sort();
          return normExpected.length === normGiven.length && normExpected.every((v, i) => v === normGiven[i]);
        }
        const expectedValue = mapAnswerTokenToOptionValue(question, String(expectedRaw));
        const givenValue = mapAnswerTokenToOptionValue(question, String(stripLeadingLetterPrefix(String(ans))));
        // CRITICAL: Extract filenames before comparing
        return normalizeValue(givenValue) === normalizeValue(expectedValue);
      }
      if (question.type === 'identification') {
        // CRITICAL: Extract filenames from URLs before normalizing
        const norm = (s: any) => {
          const extracted = extractFileName(s);
          return normalizeWithSettings(extracted, question.fillSettings);
        };
        
        if (Array.isArray(question.answer)) {
          const arr = Array.isArray(ans) ? ans : [];
          return (question.answer as string[]).every((v, i) => norm(String(arr[i] || '')) === norm(String(v || '')));
        }
        
        // Check against main answer
        const studentAnswer = norm(String(ans || ''));
        const mainAnswer = norm(String(question.answer || ''));
        
        if (studentAnswer === mainAnswer) {
          return true;
        }
        
        // Check against alternative answers if they exist
        if (question.fillSettings?.altAnswers && question.fillSettings.altAnswers.length > 0) {
          return question.fillSettings.altAnswers.some(altAnswer => 
            norm(String(altAnswer || '')) === studentAnswer
          );
        }
        
        return false;
      }
      if (question.type === 're-order') {
        // CRITICAL FIX: Compare serialized answers instead of raw IDs
        // This ensures consistency with how answers are displayed and stored
        
        // Get the expected order from reorderItems (this is the correct sequence)
        const expectedItems = question.reorderItems || [];
        const expected: string[] = expectedItems.map(it => it.id);
        
        // Apply direction if specified
        const finalExpected = question.reorderDirection === 'desc' 
          ? [...expected].reverse() 
          : expected;
        
        // Handle different answer formats
        let given: string[] = [];
        if (Array.isArray(ans)) {
          // If ans is array of strings (item IDs)
          given = ans;
        } else if (Array.isArray(ans) && ans.length > 0 && typeof ans[0] === 'object') {
          // If ans is array of ReorderItem objects
          given = ans.map((item: any) => item.id);
        }
        
        console.log('[Re-order] Answer validation details:', {
          questionId: question.id,
          expectedItems: expectedItems.map(it => ({ id: it.id, content: it.content })),
          finalExpected,
          given,
          ans,
          isArray: Array.isArray(ans),
          ansLength: Array.isArray(ans) ? ans.length : 0
        });
        
        // Return false if not all items are placed
        if (given.length === 0 || given.length < finalExpected.length) {
          console.log('[Re-order] Incomplete answer:', {
            questionId: question.id,
            expectedLength: finalExpected.length,
            givenLength: given.length,
            finalExpected,
            given
          });
          return false;
        }
        
        // CRITICAL FIX: Compare serialized answers for consistency
        const expectedSerialized = serializeAnswer(question, finalExpected);
        const givenSerialized = serializeAnswer(question, given);
        
        // Normalize both answers for comparison (case-insensitive, trimmed)
        const normalizedExpected = normalizeValue(expectedSerialized);
        const normalizedGiven = normalizeValue(givenSerialized);
        
        const isCorrect = normalizedExpected === normalizedGiven;
        
        console.log('[Re-order] Final validation result:', {
          questionId: question.id,
          expected: finalExpected,
          given,
          expectedSerialized,
          givenSerialized,
          normalizedExpected,
          normalizedGiven,
          isCorrect,
          direction: question.reorderDirection || 'asc'
        });
        
        return isCorrect;
      }
      if (question.type === 'matching') {
        // CRITICAL FIX: Handle both object format (during quiz) and serialized string format (in attempt history)
        const pairs = question.pairs || [];
        if (pairs.length === 0) return false;
        
        // If ans is a string (serialized format from attempt history), compare directly
        if (typeof ans === 'string') {
          const correctAnswerSerialized = formatCorrectAnswer(question);
          console.log('[Matching] String comparison:', {
            studentAnswer: ans,
            correctAnswer: correctAnswerSerialized,
            exactMatch: ans === correctAnswerSerialized
          });
          
          // Direct string comparison first
          if (ans === correctAnswerSerialized) {
            return true;
          }
          
          // Try normalizing whitespace
          const normalizedStudent = String(ans).replace(/\s+/g, ' ').trim();
          const normalizedCorrect = String(correctAnswerSerialized).replace(/\s+/g, ' ').trim();
          const normalizedMatch = normalizedStudent === normalizedCorrect;
          
          console.log('[Matching] After normalization:', {
            normalizedStudent,
            normalizedCorrect,
            normalizedMatch
          });
          
          return normalizedMatch;
        }
        
        // If ans is an object (during quiz), validate the pairing logic
        const studentPairs = ans && typeof ans === 'object' ? ans as {[leftIndex: string]: number} : {};
        
        // Check if all pairs are matched
        if (Object.keys(studentPairs).length !== pairs.length) {
          return false;
        }
        
        // Validate each pair - student must match left[i] to right[i]
        for (let i = 0; i < pairs.length; i++) {
          const leftKey = `left-${i}`;
          const matchedRightIndex = studentPairs[leftKey];
          
          // Check if this left item is paired with the correct right item
          if (matchedRightIndex !== i) {
            return false;
          }
        }
        
        return true;
      }
      return true;
    } catch {
      return false;
    }
  };

  // Handle final submission when Done is clicked
  const handleFinalSubmission = async () => {
    // Prevent double submission
    if (submitting) {
      console.log('Submission already in progress, ignoring duplicate call');
      return;
    }
    
    try {
      setSubmitting(true);
      
      // Get parent ID and student ID from storage
      let parentId: string | null = null;
      let studentId: string | null = null;
      let actualParentId: string | null = null;
      
      try {
        const loginCode = await AsyncStorage.getItem('parent_key');
        console.log('[Submission] Login code from AsyncStorage:', loginCode);
        
        if (loginCode) {
          // CRITICAL FIX: Resolve login code to actual parent ID
          const parentIdResult = await readData(`/parentLoginCodes/${loginCode}`);
          if (parentIdResult.data) {
            actualParentId = parentIdResult.data;
            parentId = loginCode; // Keep login code for backward compatibility
            console.log('[Submission] Resolved actual parent ID:', actualParentId);
          }
        }
        
        studentId = await AsyncStorage.getItem('student_id');
        console.log('[Submission] Student ID from AsyncStorage:', studentId);
        
        // If student ID is not found, try to find it using actual parent ID
        if (!studentId && actualParentId) {
          const studentsData = await readData('/students');
          if (studentsData.data) {
            const student = Object.values(studentsData.data).find((s: any) => s.parentId === actualParentId) as any;
            if (student && student.studentId) {
              studentId = student.studentId;
              console.log('[Submission] Found student ID from database:', studentId);
              if (studentId) {
                await AsyncStorage.setItem('student_id', studentId);
              }
            }
          }
        }
        
        if (!studentId) {
          console.error('[Submission] CRITICAL: No student ID available for result submission');
        }
      } catch (error) {
        console.error('[Submission] Failed to get parent key or student ID from storage:', error);
      }

      // CRITICAL FIX: Ensure all questions have attempts logged before final submission
      // This handles cases where students complete quickly or auto-advance skips logging
      if (exercise) {
        console.log('[Submission] Pre-submission attempt logging starting...');
        console.log('[Submission] Current attemptLogsRef:', Object.keys(attemptLogsRef.current).map(qId => ({
          qId,
          attemptCount: attemptLogsRef.current[qId]?.length || 0
        })));
        
        // CRITICAL FIX: Use answersRef.current instead of answers state for synchronous access
        // Log any missing attempts using synchronous ref access
        exercise.questions.forEach((q) => {
          const questionAttempts = attemptLogsRef.current[q.id] || [];
          const answerData = answersRef.current.find(a => a.questionId === q.id); // FIX: Use ref instead of state
          
          // If no attempts logged but there's an answer, log it now as a final attempt
          if (questionAttempts.length === 0 && answerData?.answer) {
            console.log(`[Submission] Logging missing final attempt for question ${q.id}`, {
              answer: answerData.answer,
              isCorrect: answerData.isCorrect
            });
            logAttempt(q, answerData.answer, 'final');
          }
        });
        
        // CRITICAL: Wait longer to ensure ALL attempt logs are written to refs
        // This is essential for fast submissions where state might not have settled
        await new Promise(resolve => setTimeout(resolve, 200));
        
        console.log('[Submission] After logging, attemptLogsRef:', Object.keys(attemptLogsRef.current).map(qId => ({
          qId,
          attemptCount: attemptLogsRef.current[qId]?.length || 0,
          lastAnswer: attemptLogsRef.current[qId]?.[attemptLogsRef.current[qId].length - 1]?.answer,
          allAttempts: attemptLogsRef.current[qId]?.map((attempt, idx) => ({
            attemptNumber: idx + 1,
            type: attempt.attemptType,
            answer: attempt.answer,
            timestamp: attempt.timestamp
          }))
        })));
      }

      // CRITICAL FIX: Use answersRef.current for most up-to-date data, add current question time
      console.log('[Submission] Reading answers from ref (most up-to-date)...');
      let finalAnswers = answersRef.current;
      
      if (exercise) {
        const currentQid = exercise.questions[currentQuestionIndex].id;
        const currentDelta = Date.now() - questionStartTime;
        
        // Update the ref directly with final time
        finalAnswers = answersRef.current.map(a => ({
          ...a,
          timeSpent: a.questionId === currentQid ? (a.timeSpent || 0) + currentDelta : (a.timeSpent || 0),
        }));
        
        // Update ref with final time data
        answersRef.current = finalAnswers;
        
        // Debug logging to see what answers we have
        console.log('[Submission] Final answers being saved (from ref):', finalAnswers.map(a => ({
          questionId: a.questionId,
          hasAnswer: !!a.answer,
          answerType: typeof a.answer,
          answerValue: a.answer,
          isCorrect: a.isCorrect,
          timeSpent: Math.floor((a.timeSpent || 0) / 1000)
        })));
      }

      // Calculate results
      const correctAnswers = finalAnswers.filter(answer => answer.isCorrect === true).length;
      const incorrectAnswers = finalAnswers.filter(answer => answer.isCorrect === false).length;
      const totalQuestions = exercise?.questions.length || 0;
      const scorePercentage = totalQuestions > 0 ? Math.round((correctAnswers / totalQuestions) * 100) : 0;
      // CRITICAL FIX: Calculate total attempts from attemptHistory (source of truth)
      // Sum up the actual logged attempts, not the counter values which can drift
      const totalAttempts = exercise?.questions.reduce((sum, q) => {
        const questionAttempts = attemptLogsRef.current[q.id]?.length || 0;
        return sum + questionAttempts;
      }, 0) || 0;
      
      console.log('[Submission] Total Attempts Calculation:', {
        totalAttempts,
        breakdown: exercise?.questions.map(q => ({
          questionId: q.id,
          attemptHistoryLength: attemptLogsRef.current[q.id]?.length || 0,
          attemptCountsValue: attemptCounts[q.id] || 0
        }))
      });
      
      // CRITICAL FIX: Calculate total time from individual question times for accuracy
      const totalTimeSpentSeconds = finalAnswers.reduce((total, answer) => {
        const questionTime = Math.floor((answer.timeSpent || 0) / 1000);
        return total + questionTime;
      }, 0);
      
      console.log('[Submission] Time Calculation:', {
        elapsedTimeFromSession: Math.floor(elapsedTime / 1000),
        totalTimeFromQuestions: totalTimeSpentSeconds,
        individualQuestionTimes: finalAnswers.map(a => ({
          questionId: a.questionId,
          timeSpentMs: a.timeSpent || 0,
          timeSpentSeconds: Math.floor((a.timeSpent || 0) / 1000)
        }))
      });
      
      console.log('[Submission] Score Calculation:', {
        correctAnswers,
        incorrectAnswers,
        totalQuestions,
        scorePercentage,
        answersWithCorrectFlag: finalAnswers.filter(a => a.isCorrect === true).map(a => a.questionId),
        answersWithWrongFlag: finalAnswers.filter(a => a.isCorrect === false).map(a => a.questionId),
        answersWithUndefinedFlag: finalAnswers.filter(a => a.isCorrect === undefined).map(a => a.questionId)
      });
      
      // Get current timestamp for submission
      const completedAt = new Date().toISOString();
      const timestampSubmitted = Date.now();
      
      // CRITICAL FIX: Generate hierarchical result ID linked to exercise
      // Format: E-GTK-0004-R-ABC-0001 (shows which exercise this result belongs to)
      const currentExerciseId = exercise?.id || exerciseId as string;
      console.log('[Submission] Generating result ID for exercise:', currentExerciseId);
      console.log('[Submission] Exercise ID type:', typeof currentExerciseId);
      console.log('[Submission] Exercise ID length:', currentExerciseId?.length);
      console.log('[Submission] Exercise ID format check:', currentExerciseId?.match(/^E-[A-Z]{3}-\d{4}$/));
      
      let exerciseResultId: string;
      try {
        exerciseResultId = await generateResultId(currentExerciseId, '/ExerciseResults');
        console.log('[Submission] Successfully generated hierarchical result ID:', exerciseResultId);
      } catch (error) {
        console.error('[Submission] Failed to generate hierarchical result ID:', error);
        // Fallback to simple ID generation if hierarchical fails
        const fallbackId = `${currentExerciseId}-R-${Date.now()}`;
        console.warn('[Submission] Using fallback ID:', fallbackId);
        exerciseResultId = fallbackId;
      }
      
      console.log('[Submission] Final result ID:', exerciseResultId);
      console.log('[Submission] Result linked to exercise:', currentExerciseId);
      
      // CRITICAL FIX: Check for existing result to prevent duplicates
      if (assignedExerciseId && studentId) {
        try {
          const existingResults = await readData('/ExerciseResults');
          if (existingResults.data) {
            const duplicate = Object.values(existingResults.data).find((result: any) => {
              const resultStudentId = result.studentInfo?.studentId || result.studentId;
              const resultAssignmentId = result.assignmentMetadata?.assignmentId || result.assignedExerciseId;
              return resultStudentId === studentId && resultAssignmentId === assignedExerciseId;
            });
            
            if (duplicate) {
              console.warn('[Submission] Duplicate result detected - student already submitted this assignment');
              showCustomAlert(
                'Already Submitted',
                'You have already submitted this exercise. Your previous submission will be kept.',
                () => {
                  setShowResults(true);
                },
                'warning'
              );
              return;
            }
          }
        } catch (error) {
          console.warn('[Submission] Could not check for duplicate results:', error);
          // Continue with submission even if check fails
        }
      }
      
      // Calculate session duration
      const sessionDurationSeconds = sessionStartTime ? 
        Math.floor((new Date(completedAt).getTime() - new Date(sessionStartTime).getTime()) / 1000) : 
        totalTimeSpentSeconds;
      
      // Determine remarks based on score
      const getRemarks = (score: number): string => {
        if (score >= 90) return 'Excellent';
        if (score >= 80) return 'Good';
        if (score >= 70) return 'Satisfactory';
        if (score >= 60) return 'Needs Improvement';
        return 'Needs Improvement';
      };
      
      // Create assignment metadata with actual parent ID
      const assignmentMetadata: AssignmentMetadata = assignedExercise ? {
        assignmentId: assignedExerciseId as string,
        classId: assignedExercise.classId || '',
        assignedAt: assignedExercise.createdAt || '',
        deadline: assignedExercise.deadline || '',
        acceptLateSubmissions: assignedExercise.acceptLateSubmissions || false,
        acceptingStatus: assignedExercise.acceptingStatus || 'open',
        isLateSubmission: assignedExercise.deadline ? (() => {
          try {
            const deadlineDate = new Date(assignedExercise.deadline);
            return !isNaN(deadlineDate.getTime()) && new Date() > deadlineDate;
          } catch {
            return false;
          }
        })() : false
      } : {
        assignmentId: '',
        classId: '',
        assignedAt: '',
        deadline: '',
        acceptLateSubmissions: false,
        acceptingStatus: 'open',
        isLateSubmission: false
      };
      
      // CRITICAL FIX: Store both assignmentId and assignedExerciseId for compatibility
      // Also store actual parent ID in metadata for proper result tracking
      if (assignedExerciseId) {
        (assignmentMetadata as any).assignedExerciseId = assignedExerciseId as string;
        console.log('[Submission] Storing assignedExerciseId for backward compatibility:', assignedExerciseId);
      }
      if (actualParentId) {
        (assignmentMetadata as any).parentId = actualParentId;
        console.log('[Submission] Storing actual parent ID in metadata:', actualParentId);
      }
      
      // Fetch exercise data to get category information
      let exerciseData: any = null;
      try {
        const exerciseResult = await readData(`/exercises/${exercise?.id || exerciseId}`);
        if (exerciseResult.data) {
          exerciseData = exerciseResult.data;
        }
      } catch (error) {
        console.warn('Could not fetch exercise data for category:', error);
      }
      
      // Create exercise info
      const exerciseInfo: ExerciseInfo = {
        exerciseId: exercise?.id || exerciseId as string,
        title: exercise?.title || exerciseData?.title || 'Unknown Exercise',
        category: exerciseData?.category || 'Unknown Category',
        description: exercise?.description || exerciseData?.description || '',
        totalQuestions: totalQuestions,
        timeLimitPerItem: exercise?.timeLimitPerItem || exerciseData?.timeLimitPerItem
      };
      
      // Create student info (use state or fallback)
      const studentInfoData: StudentInfo = studentInfo || {
        studentId: studentId || 'unknown',
        name: 'Unknown Student',
        gradeSection: 'Unknown Grade',
        sex: 'Unknown'
      };
      
      // Create device info (use state or collect fresh if not available)
      let deviceInfoData: DeviceInfo;
      if (deviceInfo) {
        deviceInfoData = deviceInfo;
      } else {
        // Collect metadata if not already available
        try {
          const metadata = await collectAppMetadata();
          deviceInfoData = {
            platform: metadata.platform,
            appVersion: metadata.appVersion,
            deviceModel: metadata.deviceInfo || `${metadata.platform} ${metadata.platformVersion}`,
            networkType: 'unknown',
            updateId: metadata.updateId,
            runtimeVersion: metadata.runtimeVersion,
            platformVersion: metadata.platformVersion,
            deviceInfo: metadata.deviceInfo,
            environment: metadata.environment,
            buildProfile: metadata.buildProfile,
            expoVersion: metadata.expoVersion,
          };
        } catch (error) {
          console.warn('[Submission] Failed to collect device metadata, using fallback');
          deviceInfoData = {
            platform: Platform.OS,
            appVersion: '1.0.0',
            deviceModel: `${Platform.OS} ${Platform.Version}`,
            networkType: 'unknown'
          };
        }
      }
      
      // Create exercise session
      const exerciseSession: ExerciseSession = {
        startedAt: officialStartTime ? new Date(officialStartTime).toISOString() : sessionStartTime || completedAt,
        completedAt: completedAt,
        totalDurationSeconds: officialStartTime ? Math.floor((Date.now() - officialStartTime) / 1000) : sessionDurationSeconds,
        timestampSubmitted: timestampSubmitted
      };
      
      // Create results summary
      const resultsSummary: ResultsSummary = {
        totalItems: totalQuestions,
        totalAttempts: totalAttempts,
        totalCorrect: correctAnswers,
        totalIncorrect: totalQuestions - correctAnswers,
        totalTimeSpentSeconds: totalTimeSpentSeconds,
        meanPercentageScore: scorePercentage,
        meanAttemptsPerItem: totalQuestions > 0 ? totalAttempts / totalQuestions : 0,
        meanTimePerItemSeconds: totalQuestions > 0 ? totalTimeSpentSeconds / totalQuestions : 0,
        score: correctAnswers,
        remarks: getRemarks(scorePercentage)
      };
      
      // CRITICAL: Log the final state from refs before creating results
      console.log('[Submission] Creating questionResults from refs...');
      console.log('[Submission] answersRef.current:', answersRef.current.map(a => ({
        qId: a.questionId,
        answer: a.answer,
        answerType: typeof a.answer,
        hasAnswer: !!(a.answer && a.answer !== ''),
        isCorrect: a.isCorrect,
        timeSpent: Math.floor((a.timeSpent || 0) / 1000)
      })));
      
      // CRITICAL: Verify all questions have answers (even if wrong)
      const questionsWithoutAnswers = answersRef.current.filter(a => {
        const hasNoAnswer = !a.answer || a.answer === '' || (Array.isArray(a.answer) && a.answer.length === 0);
        return hasNoAnswer && a.isCorrect; // Questions marked correct but no answer - suspicious!
      });
      
      if (questionsWithoutAnswers.length > 0) {
        console.error('[Submission] CRITICAL ERROR: Questions marked correct but have no answer!', 
          questionsWithoutAnswers.map(a => a.questionId));
      }
      
      // CRITICAL FIX: Create question results with accurate attempt tracking
      const questionResults: QuestionResult[] = exercise?.questions.map((q, idx) => {
        console.log(`[ResultCreation] Processing Q${idx + 1}/${exercise.questions.length} - ${q.id}`);
        
        // CRITICAL FIX: Use attemptLogsRef.current for synchronous access to latest attempts
        const questionAttempts = attemptLogsRef.current[q.id] || [];
        console.log(`[ResultCreation] Q${idx + 1} - Found ${questionAttempts.length} attempts in ref`);
        
        // CRITICAL FIX: Get student answer and correctness from finalAnswers (which is from answersRef.current)
        // Don't recalculate correctness - use the already validated isCorrect flag
        const answerData = finalAnswers.find(a => a.questionId === q.id);
        console.log(`[ResultCreation] Q${idx + 1} - Answer data from finalAnswers:`, {
          found: !!answerData,
          hasAnswer: answerData?.answer !== undefined,
          answerValue: answerData?.answer,
          isCorrect: answerData?.isCorrect
        });
        
        // CRITICAL FIX: Serialize the student answer properly (don't use raw value)
        // Use serializeAnswer() to format it correctly just like we do for logging
        // Handle both correct AND incorrect answers
        const studentAnswer = answerData?.answer ? serializeAnswer(q, answerData.answer) : '';
        console.log(`[ResultCreation] Q${idx + 1} - Serialized answer: "${studentAnswer}"`);
        
        // CRITICAL: Use the isCorrect flag from answers state, NOT recalculated
        // The answer was already validated in handleNext when it was marked correct
        // Default to false if not explicitly set to true
        const isCorrect = answerData?.isCorrect === true;
        
        // VALIDATION: Log warning if answer exists but isCorrect is undefined
        if (studentAnswer && answerData?.isCorrect === undefined) {
          console.warn(`[ResultCreation] Q${idx + 1} has answer but isCorrect is undefined - defaulting to false`, {
            studentAnswer,
            answerData
          });
        }
        
        const correctAnswer = formatCorrectAnswer(q);
        // CRITICAL FIX: Use attemptHistory.length as source of truth, not attemptCounts
        // attemptHistory is the actual record of what happened
        let attempts = 0; // Will be set from attemptHistory after it's created
        let timeSpentSeconds = Math.floor(getTimeMsForQuestion(q) / 1000);
        const ttsPlayed = helpUsage[q.id]?.ttsCount > 0;
        const ttsPlayCount = helpUsage[q.id]?.ttsCount || 0;
        
        console.log(`[ResultCreation] Question ${idx + 1} (${q.id}) - Summary:`, {
          rawAnswer: answerData?.answer,
          serializedAnswer: studentAnswer,
          isCorrect,
          fromAnswersState: !!answerData,
          answerDataIsCorrect: answerData?.isCorrect,
          hasAttemptLogs: questionAttempts.length > 0,
          attemptCountFromRef: attemptCountsRef.current[q.id],
          attemptCountUsed: attempts,
          timeSpent: timeSpentSeconds
        });
        
        // Get interaction types
        const interactions = interactionLogs[q.id] || [];
        const interactionTypes = interactions.map(i => i.type).filter((value, index, self) => self.indexOf(value) === index);
        
        // Create attempt history
        // CRITICAL FIX: Cap attempts at maxAttemptsPerItem to prevent overflow display
        const maxAttemptsForThisQuestion = exercise?.maxAttemptsPerItem || null;
        const cappedAttempts = maxAttemptsForThisQuestion !== null && maxAttemptsForThisQuestion !== undefined
          ? questionAttempts.slice(0, maxAttemptsForThisQuestion)
          : questionAttempts;
        
        // CRITICAL FIX: Build attempt history with proper correctness validation
        let attemptHistory: AttemptHistory[] = cappedAttempts.map((attempt, attemptIdx) => {
          // CRITICAL FIX: For attempt history, deserialize display format answers properly
          let rawAnswer = attempt.answer;
          let attemptIsCorrect = false;
          
          console.log(`[AttemptHistory] Q${idx + 1} Attempt ${attemptIdx + 1} Processing:`, {
            questionType: q.type,
            attemptType: attempt.attemptType,
            rawAnswer: attempt.answer
          });
          
          // Parse display format answers (e.g., "C. 5") back to raw format for validation
          if (typeof rawAnswer === 'string' && rawAnswer.includes('. ')) {
            const parts = rawAnswer.split('. ');
            if (parts.length >= 2) {
              // Extract the letter and convert back to raw format
              const letter = parts[0];
              const value = parts.slice(1).join('. ');
              // Convert letter back to raw answer format if it's a multiple choice
              if (q.type === 'multiple-choice') {
                const letterIndex = letterToIndex(letter);
                if (letterIndex >= 0 && q.options && q.options[letterIndex]) {
                  rawAnswer = q.options[letterIndex];
                  console.log(`[AttemptHistory] Converted MC display format "${attempt.answer}" to raw "${rawAnswer}"`);
                }
              }
            }
          }
          
          // CRITICAL FIX: For all question types, use the centralized isAnswerCorrect function
          // This ensures consistent validation logic across all contexts
          try {
            attemptIsCorrect = isAnswerCorrect(q, rawAnswer);
            console.log(`[AttemptHistory] Q${idx + 1} Attempt ${attemptIdx + 1} Validation result:`, {
              questionType: q.type,
              rawAnswer,
              isCorrect: attemptIsCorrect
            });
          } catch (error) {
            console.warn(`[AttemptHistory] Q${idx + 1} Attempt ${attemptIdx + 1}: Failed to validate:`, error);
            attemptIsCorrect = false;
          }
          
          // All validation is now handled by the centralized isAnswerCorrect function above
          
        console.log(`[AttemptHistory] Q${idx + 1} Attempt ${attemptIdx + 1} RESULT:`, {
          rawAnswer,
          displayAnswer: attempt.answer,
          isCorrect: attemptIsCorrect,
          attemptType: attempt.attemptType,
          validationMethod: q.type,
          questionId: q.id,
          correctAnswer: q.type === 'matching' ? formatCorrectAnswer(q) : q.answer
        });
          
          return {
            attemptNumber: attemptIdx + 1,
            selectedAnswer: attempt.answer || '',
            isCorrect: attemptIsCorrect,
            timeStamp: new Date(attempt.timestamp).toISOString()
          };
        });
        
        // CRITICAL FIX: If no attempts were logged but we have an answer, create a fallback attempt entry
        // This ensures every question has at least one attempt record for proper tracking
        if (attemptHistory.length === 0 && studentAnswer && studentAnswer.trim() !== '') {
          console.log(`[ResultCreation] Creating fallback attempt for Question ${idx + 1} - no attempts logged but has answer`, {
            studentAnswer,
            isCorrect,
            hasAnswerData: !!answerData
          });
          
          // Use the already serialized studentAnswer (not raw answer)
          attemptHistory = [{
            attemptNumber: 1,
            selectedAnswer: studentAnswer, // Already serialized above
            isCorrect: isCorrect, // Use validated isCorrect value
            timeStamp: new Date().toISOString()
          }];
        } else if (attemptHistory.length === 0) {
          // Question was never answered (no attempts, no answer)
          console.log(`[ResultCreation] Q${idx + 1} has NO attempts and NO answer - marking as unanswered`);
        }

        // CRITICAL FIX: Determine final correctness from LAST attempt in history
        // The last attempt is the final answer that determines correctness
        const lastAttempt = attemptHistory.length > 0 ? attemptHistory[attemptHistory.length - 1] : undefined;
        const derivedStudentAnswer = studentAnswer || (lastAttempt?.selectedAnswer ?? '');
        
        // CRITICAL FIX: Use LAST attempt's correctness as the final result
        // If we have attempt history, the last attempt determines correctness
        // Otherwise, use the isCorrect flag from answerData
        let derivedIsCorrect = lastAttempt ? lastAttempt.isCorrect : isCorrect;
        
        console.log(`[ResultCreation] Q${idx + 1} Final Derivation:`, {
          originalIsCorrect: isCorrect,
          derivedIsCorrect,
          lastAttemptIsCorrect: lastAttempt?.isCorrect,
          studentAnswer: derivedStudentAnswer,
          attemptHistoryLength: attemptHistory.length
        });
        
        // CRITICAL FIX: Use attemptHistory.length as the ONLY source of truth for attempts
        // This ensures the "attempts" field always matches the actual recorded history
        attempts = attemptHistory.length;
        
        // CRITICAL FIX: Final isCorrect is determined ONLY by the last attempt in history
        // This ensures consistency: the last thing the student did determines the result
        if (attemptHistory.length > 0) {
          const lastAttemptInHistory = attemptHistory[attemptHistory.length - 1];
          derivedIsCorrect = lastAttemptInHistory.isCorrect;
          console.log(`[ResultCreation] Q${idx + 1} - isCorrect from LAST attempt:`, {
            lastAttemptNumber: lastAttemptInHistory.attemptNumber,
            lastAttemptAnswer: lastAttemptInHistory.selectedAnswer,
            lastAttemptIsCorrect: lastAttemptInHistory.isCorrect,
            overridingPrevious: derivedIsCorrect !== isCorrect
          });
        }
        
        console.log(`[ResultCreation] Q${idx + 1} - Attempts set from history:`, {
          attemptHistoryLength: attemptHistory.length,
          attemptCountsValue: attemptCountsRef.current[q.id],
          finalAttempts: attempts,
          finalIsCorrect: derivedIsCorrect
        });
        
        // CRITICAL FIX: Ensure timeSpent is at least 1 second if question was answered
        if (derivedStudentAnswer && timeSpentSeconds === 0) {
          timeSpentSeconds = 1; // Minimum 1 second if answered
          console.log(`[ResultCreation] Q${idx + 1}: Set minimum timeSpent to 1 second (was 0)`);
        }
        
        // Format choices for multiple choice and matching questions - ensure no undefined values
        let choices: string[] | undefined = undefined;
        if (q.type === 'multiple-choice' && q.options && Array.isArray(q.options)) {
          // Filter out null, undefined, and empty string options, then map to formatted choices
          const validOptions = q.options.filter(option => 
            option != null && 
            option !== undefined && 
            option !== '' && 
            typeof option === 'string'
          );
          
          if (validOptions.length > 0) {
            choices = validOptions.map((option, optIdx) => `${String.fromCharCode(65 + optIdx)}. ${option}`);
          }
          
          // Debug logging for choices
          console.log(`[ResultCreation] Q${idx + 1} Choices processing:`, {
            originalOptions: q.options,
            validOptions,
            finalChoices: choices
          });
        } else if (q.type === 'matching' && q.pairs && Array.isArray(q.pairs)) {
          // Format matching pairs as choices
          const validPairs = q.pairs.filter(pair => 
            pair && 
            pair.left && 
            pair.right && 
            typeof pair.left === 'string' && 
            typeof pair.right === 'string' &&
            pair.left.trim() !== '' &&
            pair.right.trim() !== ''
          );
          
          if (validPairs.length > 0) {
            choices = validPairs.map((pair, pairIdx) => `${String.fromCharCode(65 + pairIdx)}. ${pair.left} → ${pair.right}`);
          }
          
          // Debug logging for matching choices
          console.log(`[ResultCreation] Q${idx + 1} Matching Choices processing:`, {
            originalPairs: q.pairs,
            validPairs,
            finalChoices: choices
          });
        } else if (q.type === 're-order' && q.reorderItems && Array.isArray(q.reorderItems)) {
          // Format reorder items as choices
          const validItems = q.reorderItems.filter(item => 
            item && 
            item.content && 
            typeof item.content === 'string' &&
            item.content.trim() !== ''
          );
          
          if (validItems.length > 0) {
            choices = validItems.map((item, itemIdx) => `${itemIdx + 1}. ${item.content}`);
          }
          
          // Debug logging for reorder choices
          console.log(`[ResultCreation] Q${idx + 1} Reorder Choices processing:`, {
            originalItems: q.reorderItems,
            validItems,
            finalChoices: choices
          });
        }
        
        // FINAL VALIDATION: Ensure studentAnswer is never empty string if we have a real answer
        const finalStudentAnswer = Array.isArray(derivedStudentAnswer) ? 
          derivedStudentAnswer.join(', ') : 
          String(derivedStudentAnswer || '');
        
        // CRITICAL FIX: Final isCorrect is ALWAYS based on the last attempt in history
        // No need to recompute - attemptHistory already contains validated attempts
        let finalIsCorrect = derivedIsCorrect;
        
        // Safety check: If no answer provided, force to incorrect
        if (!finalStudentAnswer || finalStudentAnswer.trim() === '') {
          if (finalIsCorrect) {
            console.warn(`[ResultCreation] Q${idx + 1}: No answer provided but marked correct - forcing to incorrect`);
            finalIsCorrect = false;
          }
        }
        
        console.log(`[ResultCreation] Q${idx + 1} Final Result:`, {
          studentAnswer: finalStudentAnswer,
          isCorrect: finalIsCorrect,
          hasAnswer: !!(finalStudentAnswer && finalStudentAnswer.trim() !== ''),
          attemptCount: attempts,
          attemptHistoryCount: attemptHistory.length,
          lastAttemptCorrect: attemptHistory.length > 0 ? attemptHistory[attemptHistory.length - 1].isCorrect : 'N/A'
        });
        
        return {
          questionNumber: idx + 1,
          questionId: q.id,
          questionType: q.type || 'unknown', // Add question type for validation
          questionText: q.question || '',
          choices: choices || [],
          correctAnswer: Array.isArray(correctAnswer) ? correctAnswer.join(', ') : String(correctAnswer),
          studentAnswer: finalStudentAnswer,
          isCorrect: finalIsCorrect,
          attempts: attempts,
          timeSpentSeconds: timeSpentSeconds,
          ttsPlayed: ttsPlayed,
          ttsPlayCount: ttsPlayCount,
          interactionTypes: interactionTypes,
          attemptHistory: attemptHistory,
          // Include fillSettings for identification questions to support altAnswers validation
          ...(q.type === 'identification' && q.fillSettings && {
            altAnswers: q.fillSettings.altAnswers || [],
            caseSensitive: q.fillSettings.caseSensitive || false
          })
        };
      }) || [];
      
      // CRITICAL: Verify ALL questions from exercise are in results
      console.log('[Submission] Final questionResults count check:', {
        exerciseQuestions: exercise?.questions.length || 0,
        questionResults: questionResults.length,
        match: questionResults.length === (exercise?.questions.length || 0)
      });
      // CRITICAL: Final validation - ensure no undefined values in choices arrays
      questionResults.forEach((result, idx) => {
        if (result.choices && Array.isArray(result.choices)) {
          const hasUndefinedChoices = result.choices.some(choice => choice === undefined || choice === null);
          if (hasUndefinedChoices) {
            console.error(`[Submission] CRITICAL: Question ${idx + 1} has undefined choices!`, {
              questionId: result.questionId,
              choices: result.choices,
              hasUndefined: result.choices.map((choice, i) => ({ index: i, value: choice, isUndefined: choice === undefined }))
            });
            
            // Clean the choices array by filtering out undefined values
            result.choices = result.choices.filter(choice => choice !== undefined && choice !== null);
            console.log(`[Submission] Cleaned choices for Question ${idx + 1}:`, result.choices);
          }
        }
      });
      
      // Create the complete result data
      const resultData: ExerciseResultData = {
        exerciseResultId,
        assignedExerciseId: assignedExerciseId as string || '',
        assignmentMetadata,
        exerciseInfo,
        studentInfo: studentInfoData,
        deviceInfo: deviceInfoData,
        exerciseSession,
        resultsSummary,
        questionResults
      };
      
      // CRITICAL: Comprehensive pre-submission logging to verify all data
      console.log('[Submission] ========== FINAL RESULT DATA VERIFICATION ==========');
      console.log('[Submission] Recording exercise result with:', {
        exerciseResultId,
        loginCode: parentId,
        actualParentId,
        studentId,
        exerciseId: exercise?.id || exerciseId,
        assignedExerciseId,
        studentName: studentInfoData.name,
        correctAnswers,
        totalQuestions,
        scorePercentage
      });
      
      // CRITICAL: Verify we have data for ALL questions
      console.log('[Submission] VERIFICATION - Total questions:', totalQuestions);
      console.log('[Submission] VERIFICATION - Question results count:', questionResults.length);
      if (questionResults.length !== totalQuestions) {
        console.error('[Submission] ERROR: Mismatch between total questions and results!', {
          expected: totalQuestions,
          actual: questionResults.length
        });
      }
      
      console.log('[Submission] Question Results Summary:');
      questionResults.forEach((qr, idx) => {
        const hasAnswer = qr.studentAnswer && qr.studentAnswer.trim() !== '';
        const hasAttempts = qr.attemptHistory && qr.attemptHistory.length > 0;
        
        console.log(`  Q${idx + 1}:`, {
          questionId: qr.questionId,
          studentAnswer: qr.studentAnswer,
          hasAnswer,
          isCorrect: qr.isCorrect,
          attempts: qr.attempts,
          timeSpent: qr.timeSpentSeconds,
          attemptHistoryCount: qr.attemptHistory.length,
          hasAttempts,
          attemptHistory: qr.attemptHistory.map(ah => ({
            attemptNum: ah.attemptNumber,
            answer: ah.selectedAnswer,
            correct: ah.isCorrect
          }))
        });
        
        // CRITICAL: Warn if question is missing critical data
        if (!hasAnswer && qr.isCorrect) {
          console.warn(`  [WARNING] Q${idx + 1} marked correct but has no answer!`);
        }
        if (!hasAttempts) {
          console.warn(`  [WARNING] Q${idx + 1} has no attempt history!`);
        }
      });
      
      console.log('[Submission] Results Summary:', {
        totalItems: resultsSummary.totalItems,
        totalCorrect: resultsSummary.totalCorrect,
        totalIncorrect: resultsSummary.totalIncorrect,
        score: resultsSummary.score,
        meanPercentageScore: resultsSummary.meanPercentageScore,
        remarks: resultsSummary.remarks
      });
      console.log('[Submission] ===================================================');
      
      if (!studentId) {
        console.error('[Submission] CRITICAL: No studentId - result will have unknown student!');
      }
      if (!actualParentId && !parentId) {
        console.warn('[Submission] WARNING: No parentId - exercise result may not be properly tracked');
      }
      
      // CRITICAL: Final validation before saving to database
      // Ensure all questions have at least minimal data
      console.log('[Submission] ========== FINAL VALIDATION ==========');
      
      const invalidQuestions = questionResults.filter((qr, idx) => {
        const hasNoAnswer = !qr.studentAnswer || qr.studentAnswer.trim() === '';
        const hasNoAttempts = !qr.attemptHistory || qr.attemptHistory.length === 0;
        
        if (hasNoAnswer || hasNoAttempts) {
          console.warn(`[Submission] VALIDATION WARNING - Q${idx + 1} missing data:`, {
            questionId: qr.questionId,
            studentAnswer: qr.studentAnswer,
            hasNoAnswer,
            hasNoAttempts,
            isCorrect: qr.isCorrect,
            attempts: qr.attempts
          });
        }
        
        return hasNoAnswer && hasNoAttempts;
      });
      
      if (invalidQuestions.length > 0) {
        console.error('[Submission] CRITICAL: Some questions have no data!', {
          invalidCount: invalidQuestions.length,
          totalQuestions: questionResults.length,
          invalidQuestionIds: invalidQuestions.map(q => q.questionId)
        });
      }
      
      // Additional validation: Check for questions marked correct without answers
      const suspiciousQuestions = questionResults.filter(qr => {
        const hasNoAnswer = !qr.studentAnswer || qr.studentAnswer.trim() === '';
        return qr.isCorrect && hasNoAnswer;
      });
      
      if (suspiciousQuestions.length > 0) {
        console.error('[Submission] CRITICAL ERROR: Questions marked CORRECT but have NO ANSWER!', {
          count: suspiciousQuestions.length,
          questionIds: suspiciousQuestions.map(q => ({ id: q.questionId, isCorrect: q.isCorrect, studentAnswer: q.studentAnswer }))
        });
        
        // FIX: Force these questions to be marked incorrect
        suspiciousQuestions.forEach(qr => {
          qr.isCorrect = false;
          console.log(`[Submission] Fixed Q${qr.questionNumber}: Changed isCorrect to false (no answer provided)`);
        });
      }
      
      console.log('[Submission] ========================================');
      
      // CRITICAL FIX: Recalculate ALL summary fields from finalized questionResults
      const finalCorrectCount = questionResults.filter(qr => qr.isCorrect === true).length;
      const finalIncorrectCount = questionResults.filter(qr => qr.isCorrect === false).length;
      const finalScorePercentage = totalQuestions > 0 ? Math.round((finalCorrectCount / totalQuestions) * 100) : 0;
      
      // CRITICAL FIX: Recalculate total attempts from attemptHistory (source of truth)
      const finalTotalAttempts = questionResults.reduce((sum, qr) => sum + qr.attemptHistory.length, 0);
      
      // Update resultsSummary with final validated counts
      resultsSummary.totalCorrect = finalCorrectCount;
      resultsSummary.totalIncorrect = finalIncorrectCount;
      resultsSummary.meanPercentageScore = finalScorePercentage;
      resultsSummary.score = finalCorrectCount;
      resultsSummary.remarks = getRemarks(finalScorePercentage);
      resultsSummary.totalAttempts = finalTotalAttempts; // CRITICAL FIX: Use recalculated value
      resultsSummary.meanAttemptsPerItem = totalQuestions > 0 ? finalTotalAttempts / totalQuestions : 0;
      
      console.log('[Submission] Final Validated Summary:', {
        totalCorrect: finalCorrectCount,
        totalIncorrect: finalIncorrectCount,
        scorePercentage: finalScorePercentage,
        totalAttempts: finalTotalAttempts,
        meanAttemptsPerItem: resultsSummary.meanAttemptsPerItem,
        remarks: resultsSummary.remarks
      });
      
      // MOVED: State update will happen AFTER validation to ensure UI shows validated data
      
      // CRITICAL FIX: Verify totals match across all data sources
      console.log('[Submission] ========== VERIFICATION CHECK ==========');
      console.log('[Submission] Verifying data consistency:');
      console.log('  Total Questions:', totalQuestions);
      console.log('  Question Results Count:', questionResults.length);
      console.log('  Summary Total Items:', resultsSummary.totalItems);
      console.log('  Match:', totalQuestions === questionResults.length && questionResults.length === resultsSummary.totalItems ? '✓' : '✗');
      console.log('');
      console.log('  Correct Count from questionResults:', finalCorrectCount);
      console.log('  Correct Count in Summary:', resultsSummary.totalCorrect);
      console.log('  Match:', finalCorrectCount === resultsSummary.totalCorrect ? '✓' : '✗');
      console.log('');
      console.log('  Total Attempts from History:', finalTotalAttempts);
      console.log('  Total Attempts in Summary:', resultsSummary.totalAttempts);
      console.log('  Match:', finalTotalAttempts === resultsSummary.totalAttempts ? '✓' : '✗');
      console.log('');
      console.log('  Individual Question Breakdown:');
      questionResults.forEach((qr, i) => {
        console.log(`    Q${i + 1}: attempts=${qr.attempts}, history=${qr.attemptHistory.length}, correct=${qr.isCorrect}, lastAttempt=${qr.attemptHistory[qr.attemptHistory.length - 1]?.isCorrect}`);
      });
      console.log('[Submission] =======================================');
      
      // Save to ExerciseResults table
      console.log('[Submission] ========== DATABASE WRITE ==========');
      console.log('[Submission] Path: /ExerciseResults/' + exerciseResultId);
      console.log('[Submission] Total Questions:', questionResults.length);
      console.log('[Submission] Correct Answers:', finalCorrectCount);
      console.log('[Submission] Incorrect Answers:', finalIncorrectCount);
      console.log('[Submission] Score:', finalScorePercentage + '%');
      console.log('[Submission] Total Attempts (Summary):', resultsSummary.totalAttempts);
      console.log('[Submission] Question Details Being Saved:');
      
      // CRITICAL VALIDATION: Verify attempts match history
      let calculatedTotalAttempts = 0;
      questionResults.forEach((qr, idx) => {
        calculatedTotalAttempts += qr.attemptHistory.length;
        
        // Warn if attempts field doesn't match history length
        if (qr.attempts !== qr.attemptHistory.length) {
          console.warn(`  [MISMATCH] Q${idx + 1}: attempts=${qr.attempts} but history length=${qr.attemptHistory.length}`);
        }
        
        console.log(`  Q${idx + 1}:`, {
          id: qr.questionId,
          studentAnswer: qr.studentAnswer,
          correctAnswer: qr.correctAnswer,
          isCorrect: qr.isCorrect,
          attempts: qr.attempts,
          attemptHistoryLength: qr.attemptHistory.length,
          match: qr.attempts === qr.attemptHistory.length ? '✓' : '✗ MISMATCH'
        });
      });
      
      console.log('[Submission] Calculated Total Attempts from History:', calculatedTotalAttempts);
      console.log('[Submission] Summary Total Attempts:', resultsSummary.totalAttempts);
      console.log('[Submission] Match:', calculatedTotalAttempts === resultsSummary.totalAttempts ? '✓ CORRECT' : '✗ MISMATCH');
      console.log('[Submission] =====================================');
      console.log('[Submission] About to save with result ID:', exerciseResultId);
      console.log('[Submission] Full database path:', `/ExerciseResults/${exerciseResultId}`);
      
      // CRITICAL FIX: Apply unified validation and repair before saving
      console.log('[Submission] ========== APPLYING UNIFIED VALIDATION ==========');
      const { result: validatedResultData, validation: validationReport } = validateAndRepairExerciseResult(
        resultData as any,
        { verbose: true }
      );
      
      if (validationReport.correctedFields.length > 0) {
        console.log('[Submission] Validation applied corrections:', {
          correctedFieldsCount: validationReport.correctedFields.length,
          fields: validationReport.correctedFields
        });
      }
      
      // Downgrade summary-only validation errors to warnings since they are auto-corrected
      if (validationReport.errors.length > 0) {
        const summaryOnly = validationReport.errors.every(e => String(e).startsWith('Summary:'));
        if (summaryOnly) {
          console.warn('[Submission] Validation summary mismatches (auto-corrected):', validationReport.errors);
        } else {
          console.error('[Submission] Validation found errors:', validationReport.errors);
        }
      }
      
      if (validationReport.warnings.length > 0) {
        console.warn('[Submission] Validation warnings:', validationReport.warnings);
      }
      
      console.log('[Submission] Validation complete:', {
        isValid: validationReport.isValid,
        errorsCount: validationReport.errors.length,
        warningsCount: validationReport.warnings.length,
        correctionsApplied: validationReport.correctedFields.length
      });
      console.log('[Submission] ====================================================');
      
      // Use the validated data for saving
      const finalResultData = validatedResultData;
      
      // CRITICAL FIX: Store VALIDATED questionResults and summary in state for accurate UI display
      // This ensures UI reads from the same data that was saved to database
      setSavedQuestionResults(validatedResultData.questionResults);
      setSavedResultsSummary(validatedResultData.resultsSummary);
      console.log('[Submission] Stored VALIDATED questionResults and resultsSummary in state for UI display');
      console.log('[Submission] UI will now show:', {
        totalCorrect: validatedResultData.resultsSummary.totalCorrect,
        meanPercentageScore: validatedResultData.resultsSummary.meanPercentageScore,
        remarks: validatedResultData.resultsSummary.remarks
      });
      
      const exerciseResult = await writeData(`/ExerciseResults/${exerciseResultId}`, finalResultData);
      if (!exerciseResult.success) {
        throw new Error(`Failed to save exercise result: ${exerciseResult.error}`);
      }
      
      console.log('[Submission] ========== SAVE SUCCESSFUL ==========');
      console.log('[Submission] Result ID:', exerciseResultId);
      console.log('[Submission] Database path used:', `/ExerciseResults/${exerciseResultId}`);
      console.log('[Submission] Saved Data Summary (VALIDATED):');
      console.log('  - Student:', studentInfoData.name);
      console.log('  - Exercise:', exerciseInfo.title);
      console.log('  - Total Questions:', validatedResultData.resultsSummary.totalItems);
      console.log('  - Correct:', validatedResultData.resultsSummary.totalCorrect);
      console.log('  - Incorrect:', validatedResultData.resultsSummary.totalIncorrect);
      console.log('  - Total Attempts:', validatedResultData.resultsSummary.totalAttempts);
      console.log('  - Mean Attempts/Item:', validatedResultData.resultsSummary.meanAttemptsPerItem.toFixed(2));
      console.log('  - Score:', validatedResultData.resultsSummary.meanPercentageScore + '%');
      console.log('  - Remarks:', validatedResultData.resultsSummary.remarks);
      console.log('[Submission] All question results saved with:');
      validatedResultData.questionResults.forEach((qr, idx) => {
        const status = qr.isCorrect ? '✓ CORRECT' : '✗ WRONG';
        const answerPreview = qr.studentAnswer.substring(0, 30) + (qr.studentAnswer.length > 30 ? '...' : '');
        console.log(`  Q${idx + 1} ${status}: "${answerPreview}" (${qr.attempts} attempts, ${qr.attemptHistory.length} in history)`);
      });
      console.log('[Submission] FINAL VERIFICATION (VALIDATED DATA):');
      console.log('  Total Attempts (Summary):', validatedResultData.resultsSummary.totalAttempts);
      console.log('  Total Attempts (Calculated):', validatedResultData.questionResults.reduce((sum, qr) => sum + qr.attempts, 0));
      console.log('  Total Attempts (History):', validatedResultData.questionResults.reduce((sum, qr) => sum + qr.attemptHistory.length, 0));
      console.log('  All Match:', validatedResultData.resultsSummary.totalAttempts === validatedResultData.questionResults.reduce((sum, qr) => sum + qr.attempts, 0) && validatedResultData.questionResults.reduce((sum, qr) => sum + qr.attempts, 0) === validatedResultData.questionResults.reduce((sum, qr) => sum + qr.attemptHistory.length, 0) ? '✓ YES' : '✗ NO');
      console.log('');
      console.log('  Detailed Question-by-Question Validation:');
      validatedResultData.questionResults.forEach((qr, i) => {
        const allAttemptsCorrect = qr.attemptHistory.every(a => a.isCorrect);
        const anyAttemptCorrect = qr.attemptHistory.some(a => a.isCorrect);
        const lastAttempt = qr.attemptHistory[qr.attemptHistory.length - 1];
        
        console.log(`    Q${i + 1} (${qr.questionId}):`);
        console.log(`      Final isCorrect: ${qr.isCorrect}`);
        console.log(`      Total Attempts: ${qr.attempts}`);
        console.log(`      History Length: ${qr.attemptHistory.length}`);
        console.log(`      Match: ${qr.attempts === qr.attemptHistory.length ? '✓' : '✗'}`);
        console.log(`      Student Answer: "${qr.studentAnswer}"`);
        console.log(`      Correct Answer: "${qr.correctAnswer}"`);
        console.log(`      Last Attempt isCorrect: ${lastAttempt?.isCorrect}`);
        console.log(`      All Attempts Correct: ${allAttemptsCorrect}`);
        console.log(`      Any Attempt Correct: ${anyAttemptCorrect}`);
        console.log(`      Attempt History:`);
        qr.attemptHistory.forEach((ah, ahIdx) => {
          console.log(`        ${ahIdx + 1}. ${ah.isCorrect ? '✓' : '✗'} "${ah.selectedAnswer}"`);
        });
      });
      console.log('[Submission] =====================================');
      
      // Show results panel instead of navigating back
      setShowResults(true);
      
    } catch (error: any) {
      console.error('Failed to submit final answers:', error);
      showCustomAlert('Error', `Failed to submit answers: ${error.message || error}. Please try again.`, undefined, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    // CRITICAL: Prevent duplicate submissions
    if (submittingRef.current) {
      console.log('[HandleSubmit] Already submitting, skipping duplicate call');
      return;
    }
    
    submittingRef.current = true;
    
    try {
      setSubmitting(true);
      
      // Stop timer
      if (timerInterval) {
        clearInterval(timerInterval);
        setTimerInterval(null);
      }
      // Stop any TTS during submit
      stopCurrentTTS();
      
      // Validate last question on submit (try-again basis)
      if (exercise) {
        const q = exercise.questions[currentQuestionIndex];
        const currentAns = answers.find(a => a.questionId === q.id)?.answer;
        const correct = isAnswerCorrect(q, currentAns);
        const currentAttempts = attemptCounts[q.id] || 0;
        const maxAttempts = exercise?.maxAttemptsPerItem;
        
        // FIXED: Safeguard to prevent exceeding max attempts on submit
        if (maxAttempts !== null && maxAttempts !== undefined && currentAttempts >= maxAttempts) {
          console.warn('[HandleSubmit] Already at max attempts, forcing finish');
          setQuestionCorrect(q.id, false);
          setShowResults(true);
          setSubmitting(false);
          submittingRef.current = false;
          return;
        }
        
        if (!correct) {
          // WRONG ANSWER - Increment attempts
          const newAttemptCount = currentAttempts + 1;
          
          // CRITICAL FIX: Save the wrong answer to the answers array
          console.log('[HandleSubmit-Wrong] Saving wrong answer:', {
            questionId: q.id,
            answer: currentAns,
            attemptCount: newAttemptCount
          });
          
          updateAnswers(prev => {
            const updated = prev.map(a => 
              a.questionId === q.id ? { ...a, answer: currentAns || '', isCorrect: false } : a
            );
            console.log('[HandleSubmit-Wrong] Updated answers array');
            return updated;
          });
          
          // Increment attempt counter for wrong answer
          // Check if attempt limit is reached
          if (maxAttempts !== null && maxAttempts !== undefined && newAttemptCount >= maxAttempts) {
            logAttempt(q, currentAns, 'final'); // Log as final attempt
            syncAttemptCount(q.id);
            
            // Mark question as completed (with wrong answer)
            setQuestionCorrect(q.id, false);
            
            // Show attempt limit reached message
            showCustomAlert(
              'Attempt Limit Reached', 
              `You have reached the maximum number of attempts (${maxAttempts}) for this question. The correct answer will be shown.`,
              () => {
                setShowResults(true);
              },
              'warning'
            );
            setSubmitting(false);
            submittingRef.current = false;
            return;
          }
          
          logAttempt(q, currentAns, 'change');
          syncAttemptCount(q.id);
          
          // Show remaining attempts if limit is set
          const remainingAttempts = maxAttempts !== null && maxAttempts !== undefined ? maxAttempts - newAttemptCount : null;
          const attemptMessage = remainingAttempts 
            ? `Your current answer is not correct yet. You have ${remainingAttempts} attempt${remainingAttempts > 1 ? 's' : ''} remaining.`
            : 'Your current answer is not correct yet. Please try again.';
          
          // Shake on submit when wrong
          Animated.sequence([
            Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: 6, duration: 50, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: -6, duration: 50, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
          ]).start();
          triggerWrongFeedback();
          showCustomAlert('Try again', attemptMessage, undefined, 'warning');
          setSubmitting(false);
          submittingRef.current = false;
          return;
        } else {
          // CORRECT ANSWER - Don't increment attempts
          console.log('[HandleSubmit-Correct] Correct answer - NO attempt increment');
          
          // Update the answer with isCorrect: true
          updateAnswers(prev => prev.map(a => 
            a.questionId === q.id ? { ...a, answer: currentAns || a.answer, isCorrect: true } : a
          ));
          // FIXED: Don't increment attempts on correct answer
          // Log a final correct attempt for history consistency
          logAttempt(q, currentAns, 'final');
          syncAttemptCount(q.id);
        }
        setQuestionCorrect(q.id, true);
      }

      // No need to update assignedExercises - completion status is determined by ExerciseResults existence
      
      // Show results panel - database saving will happen when Done is clicked
      setShowResults(true);
    } catch (error: any) {
      console.error('Failed to submit answers:', error);
      showCustomAlert('Error', `Failed to submit answers: ${error.message || error}. Please try again.`, undefined, 'error');
    } finally {
      setSubmitting(false);
      submittingRef.current = false;
    }
  };

  const handleLevelComplete = async () => {
    if (!exercise) return;
    // Stop TTS when finishing a level
    stopCurrentTTS();
    const q = exercise.questions[currentQuestionIndex];
    const currentAns = answers.find(a => a.questionId === q.id)?.answer;
    const correct = isAnswerCorrect(q, currentAns);
    if (correct) {
      // CORRECT ANSWER - Don't increment attempts
      console.log('[LevelComplete-Correct] Correct answer - NO attempt increment');
      
      // Accumulate time for the level question
      const delta = Date.now() - questionStartTime;
      updateAnswers(prev => prev.map(a => a.questionId === q.id ? { ...a, timeSpent: (a.timeSpent || 0) + delta, isCorrect: true } : a));
      setQuestionCorrect(q.id, true);
      // FIXED: Don't increment attempts on correct answer
      await unlockNextLevel();
      showCustomAlert('Great job!', 'Level cleared!', () => router.replace({ pathname: '/Homepage', params: { exerciseId: exercise.id, session: String(Date.now()) } } as any), 'success');
    } else {
      // WRONG ANSWER - Increment attempts
      incrementAttemptCount(q.id);
      console.log('[LevelComplete-Wrong] Wrong answer - attempt incremented');
      showCustomAlert('Not yet correct', 'Try again!', undefined, 'warning');
    }
  };
  const renderMultipleChoice = (question: Question) => {
    const selectedAnswers = Array.isArray(currentAnswer) ? currentAnswer : [];
    
    // Check if this question uses images as options
    const hasOptionImages = question.optionImages && question.optionImages.length > 0 && question.optionImages.some(img => img);
    
    if (hasOptionImages) {
      // Image-based options: validate images
      const validImageCount = question.optionImages?.filter(img => img && typeof img === 'string' && img.trim() !== '').length || 0;
      
      if (validImageCount === 0) {
        console.error('[MC-Render] Question has NO valid option images!', {
          questionId: question.id,
          optionImages: question.optionImages
        });
        return (
          <View style={styles.questionContainer}>
            <View style={styles.questionTextContainer}>
              <Text style={styles.questionText}>{question.question}</Text>
            </View>
            <View style={[styles.questionTextContainer, { backgroundColor: '#fee2e2', borderColor: '#ef4444' }]}>
              <Text style={[styles.questionText, { color: '#dc2626', fontSize: 16 }]}>
                ⚠️ Error: This question has no valid answer option images. Please contact your teacher.
              </Text>
            </View>
          </View>
        );
      }
    } else {
      // Text-based options: validate text
      const validOptions = (question.options || []).filter(opt => opt && typeof opt === 'string' && opt.trim() !== '');
      
      if (validOptions.length === 0) {
        console.error('[MC-Render] Question has NO valid text options!', {
          questionId: question.id,
          originalOptions: question.options
        });
        return (
          <View style={styles.questionContainer}>
            <View style={styles.questionTextContainer}>
              <Text style={styles.questionText}>{question.question}</Text>
            </View>
            <View style={[styles.questionTextContainer, { backgroundColor: '#fee2e2', borderColor: '#ef4444' }]}>
              <Text style={[styles.questionText, { color: '#dc2626', fontSize: 16 }]}>
                ⚠️ Error: This question has no valid answer options. Please contact your teacher.
              </Text>
            </View>
          </View>
        );
      }
      
      if (validOptions.length < (question.options?.length || 0)) {
        console.warn('[MC-Render] Some options were invalid and filtered out', {
          questionId: question.id,
          originalCount: question.options?.length,
          validCount: validOptions.length
        });
      }
    }
    
    // Check if all options have images
    const hasAllImages = question.options?.every((_, index) => question.optionImages?.[index]);
    const useGridLayout = hasAllImages && question.options && question.options.length <= 4;
    
    return (
      <View style={styles.questionContainer}>
        {/* Question Image */}
        {(question.questionImage || (question.questionImages && question.questionImages.length)) && (
          <View style={styles.questionImageContainer}>
            {Array.isArray(question.questionImage) ? (
              (question.questionImage.length <= 3 ? (
                <View style={[
                  styles.questionImagesRow,
                  question.questionImage.length === 1 ? styles.imageRowCenter : styles.imageRowLeft,
                ]}> 
                  {question.questionImage.map((img, idx) => (
                  <ExpoImage 
                      key={`qi-${idx}`} 
                      source={{ uri: img }} 
                      style={styles.questionImageAuto} 
                      contentFit="contain" 
                      transition={150} 
                      cachePolicy="memory-disk" 
                      priority="high"
                    onError={(e) => log.mediaWarn('questionImage array item failed', { url: img, error: String(e) })}
                      recyclingKey={`qi-${question.id}-${idx}`}
                    />
                  ))}
                </View>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ width: '100%' }} contentContainerStyle={styles.questionImagesRow}>
                  {question.questionImage.map((img, idx) => (
                    <ExpoImage 
                      key={`qi-${idx}`} 
                      source={{ uri: img }} 
                      style={styles.questionImageSmall} 
                      contentFit="contain" 
                      transition={150} 
                      cachePolicy="memory-disk" 
                      priority="high"
                      recyclingKey={`qi-${question.id}-${idx}`}
                    />
                  ))}
                </ScrollView>
              ))
            ) : question.questionImage ? (
              <ExpoImage 
                source={{ uri: question.questionImage }} 
                style={[styles.questionImage, styles.singleImageCentered]} 
                contentFit="contain" 
                transition={150} 
                cachePolicy="memory-disk" 
                priority="high"
                onError={(e) => log.mediaWarn('questionImage single failed', { url: question.questionImage, error: String(e) })}
                recyclingKey={`qi-${question.id}`}
              />
            ) : null}
            {question.questionImages && question.questionImages.length ? (
              question.questionImages.length <= 3 ? (
                <View style={[
                  styles.questionImagesRow,
                  question.questionImages.length === 1 ? styles.imageRowCenter : styles.imageRowLeft,
                  { marginTop: 8 },
                ]}> 
                  {question.questionImages.map((img, idx) => (
                  <ExpoImage 
                      key={`qis-${idx}`} 
                      source={{ uri: img }} 
                      style={styles.questionImageAuto} 
                      contentFit="cover" 
                      transition={120} 
                      cachePolicy="memory-disk"
                    priority="high"
                    onError={(e) => log.mediaWarn('questionImages small failed', { url: img, error: String(e) })}
                      recyclingKey={`qis-${question.id}-${idx}`}
                    />
                  ))}
                </View>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ width: '100%', marginTop: 8 }} contentContainerStyle={styles.questionImagesRow}>
                  {question.questionImages.map((img, idx) => (
                    <ExpoImage 
                      key={`qis-${idx}`} 
                      source={{ uri: img }} 
                      style={styles.questionImageThumb} 
                      contentFit="cover" 
                      transition={120} 
                      cachePolicy="memory-disk"
                      priority="high"
                      onError={(e) => log.mediaWarn('questionImages thumb failed', { url: img, error: String(e) })}
                      recyclingKey={`qis-${question.id}-${idx}`}
                    />
                  ))}
                </ScrollView>
              )
            ) : null}
          </View>
        )}
        
        {typeof question.question === 'string' && question.question.trim().length > 0 && (
          <View style={styles.questionTextContainer}>
            <Text style={styles.questionText}>{question.question}</Text>
            {renderTTSButton(question.ttsAudioUrl)}
          </View>
        )}
        
        {useGridLayout ? (
          <View style={styles.optionsGridContainer}>
            {question.options?.map((option, index) => {
              // CRITICAL: For image-based questions, use image index as option value if text is empty
              const hasImage = question.optionImages?.[index];
              const optionValue = (hasImage && (!option || option.trim() === '')) 
                ? String.fromCharCode(65 + index) // Use "A", "B", "C", "D" for image options
                : option;
              
              // Skip if both option text and image are invalid
              if (!hasImage && (!optionValue || typeof optionValue !== 'string' || optionValue.trim() === '')) {
                console.error('[MC-Grid] Invalid option at index', index, '- no text or image');
                return null;
              }
              
              const isSelected = selectedAnswers.includes(optionValue);
              const optionLabel = String.fromCharCode(65 + index); // A, B, C, D
              
              const optionKey = `mc-${question.id}-${index}`;
              const shakeStyle = lastShakeKey === optionKey ? { transform: [{ translateX: shakeAnim }] } : undefined;
              return (
                <AnimatedTouchable
                  key={index}
                  style={[
                    styles.multipleChoiceGridOption,
                    isSelected && styles.selectedMultipleChoiceGridOption
                  , shakeStyle as any
                  ]}
                  onPress={() => {
                    // CRITICAL: Check correctness at press time, not render time
                    const isCorrect = isOptionCorrect(question, optionValue);
                    console.log('[MC-Grid] Option pressed:', {
                      option: optionValue,
                      isCorrect,
                      questionId: question.id,
                      hasImage: !!hasImage
                    });
                    
                    // Single answer immediate validation and feedback
                    if (!question.multiAnswer) {
                      if (!isCorrect) {
                        const newAttemptCount = (attemptCounts[question.id] || 0) + 1;
                        const maxAttempts = exercise?.maxAttemptsPerItem;
                        
                        // CRITICAL FIX: Save the wrong answer to the answers array
                        console.log('[MC-Grid-Wrong] Saving wrong answer:', {
                          questionId: question.id,
                          selectedOption: optionValue,
                          attemptCount: newAttemptCount
                        });
                        
                        updateAnswers(prev => {
                          const updated = prev.map(a => 
                            a.questionId === question.id ? { ...a, answer: optionValue, isCorrect: false } : a
                          );
                          console.log('[MC-Grid-Wrong] Answer saved to array');
                          return updated;
                        });
                        
                        // Check if attempt limit is reached
                        if (maxAttempts !== null && maxAttempts !== undefined && newAttemptCount >= maxAttempts) {
                          updateAttemptCount(question.id, newAttemptCount);
                          logAttempt(question, optionValue, 'final');
                          
                          // Mark as failed and advance
                          setQuestionCorrect(question.id, false);
                          
                          // Show attempt limit reached message briefly
                          showCustomAlert(
                            'Attempt Limit Reached', 
                            `You have reached the maximum number of attempts (${maxAttempts}) for this question.`,
                            () => advanceToNextOrFinish(),
                            'warning'
                          );
                          return;
                        }
                        
                        setLastShakeKey(optionKey);
                        logAttempt(question, optionValue, 'change');
                        syncAttemptCount(question.id);
                        Animated.sequence([
                          Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
                          Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
                          Animated.timing(shakeAnim, { toValue: 6, duration: 50, useNativeDriver: true }),
                          Animated.timing(shakeAnim, { toValue: -6, duration: 50, useNativeDriver: true }),
                          Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
                        ]).start(() => setLastShakeKey(null));
                        triggerWrongFeedback();
                        return;
                      }
                      // Correct -> set answer and move next (NO attempt increment on correct)
                      // Stop TTS immediately when correct answer is selected
                      stopCurrentTTS();
                      logInteraction(question.id, 'option_click', optionValue, 0);
                      handleAnswerChange(optionValue);
                      
                      // CRITICAL FIX: Update the answer with isCorrect: true and log for debugging
                      updateAnswers(prev => {
                        const updated = prev.map(a => 
                          a.questionId === question.id ? { ...a, answer: optionValue, isCorrect: true } : a
                        );
                        console.log('[MC-Grid-Correct] Updated answers state - NO attempt increment:', updated.map(a => ({
                          qId: a.questionId,
                          hasAnswer: !!a.answer,
                          isCorrect: a.isCorrect
                        })));
                        return updated;
                      });
                      
                      // Use helper functions to update both state and ref
                      setQuestionCorrect(question.id, true);
                      // Log a final correct attempt for history consistency
                      logAttempt(question, optionValue, 'final');
                      syncAttemptCount(question.id);
                      // FIXED: Don't increment attempts on correct answer
                      console.log('[MC-Grid-Correct] Answer correct on first try - no attempt logged');
                      logAttempt(question, optionValue, 'final');
                      triggerCorrectFeedback(() => advanceToNextOrFinish());
                      return;
                    }
                    // Multi-answer behaves as selection accumulation
                    const newAnswers = isSelected 
                      ? selectedAnswers.filter(a => a !== optionValue)
                      : [...selectedAnswers, optionValue];
                    logInteraction(question.id, 'option_click', optionValue, 0);
                    handleAnswerChange(newAnswers);
                  }}
                   activeOpacity={0.7}
                >
                          {hasImage && (
                            <ExpoImage 
                              source={{ uri: hasImage }} 
                              style={styles.gridOptionImage}
                              contentFit="contain"
                              transition={120}
                              cachePolicy="memory-disk"
                              priority="high"
                              recyclingKey={`opt-${question.id}-${index}`}
                            />
                          )}
                  
                  {isSelected && (
                    <View style={styles.gridCheckIconContainer}>
                      <MaterialIcons name="check-circle" size={28} color="#4a90e2" />
                    </View>
                  )}
                  
                  <View style={styles.gridOptionLabelContainer}>
                    <Text style={styles.gridOptionLabel}>
                      {optionLabel}
                    </Text>
                  </View>
                </AnimatedTouchable>
              );
            })}
          </View>
        ) : (
          <View style={styles.optionsContainer}>
            {question.options?.map((option, index) => {
              // CRITICAL: For image-based questions, use image index as option value if text is empty
              const hasImage = question.optionImages?.[index];
              const optionValue = (hasImage && (!option || option.trim() === '')) 
                ? String.fromCharCode(65 + index) // Use "A", "B", "C", "D" for image options
                : option;
              
              // Skip if both option text and image are invalid
              if (!hasImage && (!optionValue || typeof optionValue !== 'string' || optionValue.trim() === '')) {
                console.error('[MC-List] Invalid option at index', index, '- no text or image');
                return null;
              }
              
              const isSelected = selectedAnswers.includes(optionValue);
              const optionLabel = String.fromCharCode(65 + index); // A, B, C, D
              
              const optionKey = `mc-${question.id}-${index}`;
              const shakeStyle = lastShakeKey === optionKey ? { transform: [{ translateX: shakeAnim }] } : undefined;
              return (
                <AnimatedTouchable
                  key={index}
                  style={[
                    styles.multipleChoiceOption,
                    isSelected && styles.selectedMultipleChoiceOption,
                    shakeStyle as any
                  ]}
                  onPress={() => {
                    // CRITICAL: Check correctness at press time, not render time
                    const isCorrect = isOptionCorrect(question, optionValue);
                    console.log('[MC-List] Option pressed:', {
                      option: optionValue,
                      isCorrect,
                      questionId: question.id,
                      hasImage: !!hasImage
                    });
                    
                    if (!question.multiAnswer) {
                      if (!isCorrect) {
                        const newAttemptCount = (attemptCounts[question.id] || 0) + 1;
                        const maxAttempts = exercise?.maxAttemptsPerItem;
                        
                        // CRITICAL FIX: Save the wrong answer to the answers array
                        console.log('[MC-List-Wrong] Saving wrong answer:', {
                          questionId: question.id,
                          selectedOption: optionValue,
                          attemptCount: newAttemptCount
                        });
                        
                        updateAnswers(prev => {
                          const updated = prev.map(a => 
                            a.questionId === question.id ? { ...a, answer: optionValue, isCorrect: false } : a
                          );
                          console.log('[MC-List-Wrong] Answer saved to array');
                          return updated;
                        });
                        
                        // Check if attempt limit is reached
                        if (maxAttempts !== null && maxAttempts !== undefined && newAttemptCount >= maxAttempts) {
                          updateAttemptCount(question.id, newAttemptCount);
                          logAttempt(question, optionValue, 'final');
                          
                          // Mark as failed and advance
                          setQuestionCorrect(question.id, false);
                          
                          // Show attempt limit reached message briefly
                          showCustomAlert(
                            'Attempt Limit Reached', 
                            `You have reached the maximum number of attempts (${maxAttempts}) for this question.`,
                            () => advanceToNextOrFinish(),
                            'warning'
                          );
                          return;
                        }
                        
                        setLastShakeKey(optionKey);
                        updateAttemptCount(question.id, newAttemptCount);
                        logAttempt(question, optionValue, 'change');
                        Animated.sequence([
                          Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
                          Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
                          Animated.timing(shakeAnim, { toValue: 6, duration: 50, useNativeDriver: true }),
                          Animated.timing(shakeAnim, { toValue: -6, duration: 50, useNativeDriver: true }),
                          Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
                        ]).start(() => setLastShakeKey(null));
                        triggerWrongFeedback();
                        return;
                      }
                      // CORRECT ANSWER - Don't increment attempts
                      // Stop TTS immediately when correct answer is selected
                      stopCurrentTTS();
                      handleAnswerChange(optionValue);
                      
                      // CRITICAL FIX: Update the answer with isCorrect: true and ensure answer is set
                      updateAnswers(prev => {
                        const updated = prev.map(a => 
                          a.questionId === question.id ? { ...a, answer: optionValue, isCorrect: true } : a
                        );
                        console.log('[MC-List-Correct] Updated answers state - NO attempt increment:', updated.map(a => ({
                          qId: a.questionId,
                          hasAnswer: !!a.answer,
                          isCorrect: a.isCorrect
                        })));
                        return updated;
                      });
                      
                      // Use helper functions to update both state and ref
                      setQuestionCorrect(question.id, true);
                      // FIXED: Don't increment attempts on correct answer
                      console.log('[MC-List-Correct] Answer correct on first try - no attempt logged');
                      logAttempt(question, optionValue, 'final');
                      triggerCorrectFeedback(() => advanceToNextOrFinish());
                      return;
                    }
                    const newAnswers = isSelected 
                      ? selectedAnswers.filter(a => a !== optionValue)
                      : [...selectedAnswers, optionValue];
                    handleAnswerChange(newAnswers);
                  }}
                   activeOpacity={0.7}
                >
                  <View style={styles.optionContent}>
                    <View style={styles.optionLabelContainer}>
                      <Text style={[
                        styles.optionLabel,
                        isSelected && styles.selectedOptionLabel
                      ]}>
                        {optionLabel}.
                      </Text>
                    </View>
                    
                      {hasImage && (
                      <ExpoImage 
                        source={{ uri: hasImage }} 
                        style={styles.optionImage}
                        contentFit="contain"
                        transition={120}
                        cachePolicy="memory-disk"
                        priority="high"
                        recyclingKey={`opt-${question.id}-${index}`}
                      />
                    )}
                    
                    <Text style={[
                      styles.optionText,
                      isSelected && styles.selectedOptionText
                    ]}>
                      {option}
                    </Text>
                  </View>
                  
                  {isSelected && (
                    <View style={styles.checkIconContainer}>
                      <MaterialIcons name="check-circle" size={24} color="#ffffff" />
                    </View>
                  )}
                </AnimatedTouchable>
              );
            })}
          </View>
        )}
      </View>
    );
  };
  
  // Helper function to calculate dynamic font size based on question length
  const getDynamicFontSize = (questionText: string): number => {
    const textLength = questionText.length;
    
    // Base sizing logic
    if (textLength <= 20) return 24;        // Short questions - large font
    if (textLength <= 40) return 22;       // Medium-short questions
    if (textLength <= 60) return 20;       // Medium questions  
    if (textLength <= 100) return 18;      // Long questions
    if (textLength <= 150) return 16;      // Very long questions
    return 14;                             // Extremely long questions - small font
  };

  const renderIdentification = (question: Question) => {
    // Check if question has separate boxes (blanks) or single input field
    const hasBlanks = question.fillSettings?.showBoxes;
    const dynamicFontSize = getDynamicFontSize(question.question);
    
    if (hasBlanks) {
      // Render separate input boxes for each blank
      return (
        <View style={styles.identificationContainer}>
          {/* Question Image */}
          {(question.questionImage || (question.questionImages && question.questionImages.length)) && (
            <View style={[
              styles.questionImageContainer,
              // Center single images, auto-adjust for multiple
              Array.isArray(question.questionImage) || (question.questionImages && question.questionImages.length > 1) 
                ? styles.questionImageContainerMultiple 
                : styles.questionImageContainerSingle
            ]}>
              {Array.isArray(question.questionImage) ? (
                question.questionImage.map((img, idx) => (
                  <ExpoImage 
                    key={`qi-${idx}`} 
                    source={{ uri: img }} 
                    style={styles.questionImage} 
                    contentFit="contain" 
                    transition={150} 
                    cachePolicy="memory-disk" 
                    priority="high"
                    onLoad={() => console.log('[ImageLoad] ident questionImage array item loaded:', img)}
                    onError={(e) => log.mediaWarn('ident questionImage array item failed', { url: img, error: String(e) })}
                    recyclingKey={`qi-ident-${question.id}-${idx}`}
                  />
                ))
              ) : question.questionImage ? (
                <ExpoImage 
                  source={{ uri: question.questionImage }} 
                  style={styles.questionImage} 
                  contentFit="contain" 
                  transition={150} 
                  cachePolicy="memory-disk" 
                  priority="high"
                  onLoad={() => console.log('[ImageLoad] ident questionImage single loaded:', question.questionImage)}
                  onError={(e) => log.mediaWarn('ident questionImage single failed', { url: question.questionImage, error: String(e) })}
                  recyclingKey={`qi-ident-${question.id}`}
                />
              ) : null}
            {question.questionImages && question.questionImages.length ? (
              <View style={styles.questionImagesGrid}>
                {question.questionImages.map((img, idx) => (
                  <ExpoImage 
                    key={`qis-${idx}`} 
                    source={{ uri: img }} 
                    style={styles.questionImageThumb} 
                    contentFit="cover" 
                    transition={120} 
                    cachePolicy="memory-disk"
                    priority="high"
                    onLoad={() => console.log('[ImageLoad] ident questionImages thumb loaded:', img)}
                    onError={(e) => log.mediaWarn('ident questionImages thumb failed', { url: img, error: String(e) })}
                    recyclingKey={`qis-ident-${question.id}-${idx}`}
                  />
                ))}
              </View>
            ) : null}
            </View>
          )}
          
          <View style={styles.questionTextContainer}>
            <Text style={[styles.fillBlankQuestionText, { fontSize: dynamicFontSize }]}>{question.question}</Text>
          {renderTTSButton(question.ttsAudioUrl)}
          </View>
          <View style={styles.adaptiveBoxesRow}>
            {Array.isArray(question.answer) ? question.answer.map((expected, index) => {
              const expectedText = String(expected || '');
              const expectedLength = Math.max(expectedText.length, 1);
              const minWidth = 56; // base width for very short answers
              const charWidth = 12; // approximate width per character
              const horizontalPadding = 24; // padding inside the input
              const computedWidth = Math.min(Math.max(expectedLength * charWidth + horizontalPadding, minWidth), Math.floor(screenWidth * 0.8));
              const maxLen = expectedLength > 0 ? expectedLength : undefined;
              const valueArray = Array.isArray(currentAnswer) ? currentAnswer : [];
              const value = Array.isArray(currentAnswer) ? (valueArray[index] || '') : '';
              return (
                <TextInput
                  key={index}
                  style={[styles.blankBoxInput, { width: computedWidth }]}
                  value={value}
                  onChangeText={(text) => {
                    const newAnswer = Array.isArray(currentAnswer) ? [...currentAnswer] : [];
                    newAnswer[index] = maxLen ? text.slice(0, maxLen) : text;
                    handleAnswerChange(newAnswer);
                  }}
                  maxLength={maxLen}
                  placeholder=""
                  autoCorrect={false}
                  numberOfLines={1}
                />
              );
            }) : (
              <TextInput
                style={[styles.blankBoxInput, { width: Math.min(Math.max((typeof question.answer === 'string' ? question.answer.length : 6) * 12 + 24, 56), Math.floor(screenWidth * 0.8)) }]}
                value={typeof currentAnswer === 'string' ? currentAnswer : ''}
                onChangeText={handleAnswerChange}
                placeholder=""
                autoCorrect={false}
                numberOfLines={1}
              />
            )}
          </View>
          {question.fillSettings?.hint && (
            <Text style={styles.hintText}>
              💡 Hint: {question.fillSettings.hint}
            </Text>
          )}
        </View>
      );
    } else {
      // Render single input field
      return (
        <View style={styles.identificationContainer}>
          {/* Question Images */}
          {(question.questionImage || (question.questionImages && question.questionImages.length)) && (
            <View style={[
              styles.questionImageContainer,
              // Center single images, auto-adjust for multiple
              Array.isArray(question.questionImage) || (question.questionImages && question.questionImages.length > 1) 
                ? styles.questionImageContainerMultiple 
                : styles.questionImageContainerSingle
            ]}>
              {Array.isArray(question.questionImage) ? (
                question.questionImage.map((img, idx) => (
                  <ExpoImage 
                    key={`qi-${idx}`} 
                    source={{ uri: img }} 
                    style={styles.questionImage} 
                    contentFit="contain" 
                    transition={150} 
                    cachePolicy="memory-disk" 
                    priority="high"
                    recyclingKey={`qi-ident2-${question.id}-${idx}`}
                  />
                ))
              ) : question.questionImage ? (
                <ExpoImage 
                  source={{ uri: question.questionImage }} 
                  style={styles.questionImage} 
                  contentFit="contain" 
                  transition={150} 
                  cachePolicy="memory-disk" 
                  priority="high"
                  recyclingKey={`qi-ident2-${question.id}`}
                />
              ) : null}
              {question.questionImages && question.questionImages.length ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                  {question.questionImages.map((img, idx) => (
                    <ExpoImage 
                      key={`qis-${idx}`} 
                      source={{ uri: img }} 
                      style={{ width: 100, height: 100, borderRadius: 8, marginRight: 8 }} 
                      contentFit="cover" 
                      transition={120} 
                      cachePolicy="memory-disk"
                      priority="high"
                      recyclingKey={`qis-ident2-${question.id}-${idx}`}
                    />
                  ))}
                </ScrollView>
              ) : null}
            </View>
          )}
          
          <View style={styles.questionTextContainer}>
            <Text style={[styles.fillBlankQuestionText, { fontSize: dynamicFontSize }]}>{question.question}</Text>
            {renderTTSButton(question.ttsAudioUrl)}
          </View>
          <TextInput
            style={styles.identificationInput}
            value={typeof currentAnswer === 'string' ? currentAnswer : ''}
            onChangeText={handleAnswerChange}
            placeholder="Type your answer..."
            placeholderTextColor="#6b7280"
            multiline
          />
          {question.fillSettings?.hint && (
            <Text style={styles.hintText}>
              💡 Hint: {question.fillSettings.hint}
            </Text>
          )}
        </View>
      );
    }
  };
  const renderMatching = (question: Question) => {
    // FIXED: Use new pairing state instead of old selections
    const currentPairs = matchingPairs[question.id] || {};
    const selectedLeft = matchingSelectedLeft[question.id] ?? null;
    
    // Create persistent shuffled orders per question
    const pairCount = question.pairs?.length || 0;
    const cached = shuffledPairsCache[question.id];
    const makeOrder = (n: number) => Array.from({ length: n }, (_, i) => i).sort(() => Math.random() - 0.5);
    const leftOrder = cached?.left || makeOrder(pairCount);
    const rightOrder = cached?.right || makeOrder(pairCount);
    if (!cached && pairCount > 0) {
      setShuffledPairsCache(prev => ({ ...prev, [question.id]: { left: leftOrder, right: rightOrder } }));
    }
    
    // Color palette for pairs - 12 distinct colors
    const pairColors = [
      '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', 
      '#06b6d4', '#ec4899', '#14b8a6', '#f97316', '#6366f1',
      '#84cc16', '#f43f5e'
    ];
    
    // Helper to get color for a specific paired index
    const getPairColor = (leftIndex: number, rightIndex: number | null | undefined): string | null => {
      if (rightIndex === null || rightIndex === undefined) return null;
      
      // Find which pair this belongs to
      for (let i = 0; i < pairCount; i++) {
        const key = `left-${i}`;
        if (currentPairs[key] === rightIndex && i === leftIndex) {
          return pairColors[i % pairColors.length];
        }
      }
      return null;
    };
    
    // Helper to check if a match is correct (left[i] should match with right[i])
    const isMatchCorrect = (leftIndex: number, rightIndex: number): boolean => {
      return leftIndex === rightIndex;
    };
    
    // Helper to check if a right item is already paired
    const isRightItemPaired = (rightIndex: number): boolean => {
      return Object.values(currentPairs).includes(rightIndex);
    };
    
    // Helper to find which left item a right item is paired with
    const getLeftIndexForRight = (rightIndex: number): number | null => {
      for (const [leftKey, pairedRightIndex] of Object.entries(currentPairs)) {
        if (pairedRightIndex === rightIndex) {
          return parseInt(leftKey.split('-')[1]);
        }
      }
      return null;
    };
    
    return (
      <View style={styles.questionContainer}>
        {/* Question Image */}
        {(question.questionImage || (question.questionImages && question.questionImages.length)) && (
          <View style={styles.questionImageContainer}>
            {Array.isArray(question.questionImage) ? (
              question.questionImage.map((img, idx) => (
                <ExpoImage 
                  key={`qi-${idx}`} 
                  source={{ uri: img }} 
                  style={styles.questionImage} 
                  contentFit="contain" 
                  transition={150} 
                  cachePolicy="memory-disk" 
                  priority="high"
                  recyclingKey={`qi-matching-${question.id}-${idx}`}
                />
              ))
            ) : question.questionImage ? (
              <ExpoImage 
                source={{ uri: question.questionImage }} 
                style={styles.questionImage} 
                contentFit="contain" 
                transition={150} 
                cachePolicy="memory-disk" 
                priority="high"
                recyclingKey={`qi-matching-${question.id}`}
              />
            ) : null}
            {question.questionImages && question.questionImages.length ? (
              <View style={styles.questionImagesGrid}>
                {question.questionImages.map((img, idx) => (
                  <ExpoImage 
                    key={`qis-${idx}`} 
                    source={{ uri: img }} 
                    style={styles.questionImageThumb} 
                    contentFit="cover" 
                    transition={120} 
                    cachePolicy="memory-disk"
                    priority="high"
                    recyclingKey={`qis-matching-${question.id}-${idx}`}
                  />
                ))}
              </View>
            ) : null}
          </View>
        )}
        
        <View style={styles.questionTextContainer}>
          <Text style={styles.questionText}>{question.question}</Text>
          {renderTTSButton(question.ttsAudioUrl)}
        </View>
        
        {/* Instructions */}
        <View style={styles.matchingInstructions}>
          <Text style={styles.matchingInstructionsText}>
            {selectedLeft === null 
              ? '👆 Tap an item from Column A first'
              : '👉 Now tap an item from Column B to create a pair'}
          </Text>
        </View>
        
        <View style={styles.matchingGameContainer}>
          {/* Left Column */}
          <View style={styles.matchingColumn}>
            <View style={styles.columnHeaderSimple}>
              <Text style={styles.matchingColumnTitle}>Column A</Text>
            </View>
            {leftOrder.map((mappedIndex) => {
              const pair = question.pairs![mappedIndex];
              const idx = mappedIndex;
              const pairedRightIndex = currentPairs[`left-${idx}`];
              const pairColor = getPairColor(idx, pairedRightIndex);
              const isSelected = selectedLeft === idx;
              const isPaired = pairedRightIndex !== undefined && pairedRightIndex !== null;
              
              return (
                <TouchableOpacity
                  key={`left-${idx}`}
                  style={[
                    styles.gameMatchingItem,
                    styles.matchingLeft,
                    isSelected && styles.matchingLeftSelected,
                    // Show solid color when correctly paired
                    isPaired && pairColor && { 
                      backgroundColor: pairColor,
                      borderColor: pairColor,
                      borderWidth: 3
                    }
                  ]}
                  onPress={() => {
                    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                    
                    if (isPaired) {
                      // Unpair - remove the connection
                      const newPairs = { ...currentPairs };
                      delete newPairs[`left-${idx}`];
                      setMatchingPairs(prev => ({ ...prev, [question.id]: newPairs }));
                      setMatchingSelectedLeft(prev => ({ ...prev, [question.id]: null }));
                      handleAnswerChange(newPairs);
                    } else {
                      // Select this left item
                      setMatchingSelectedLeft(prev => ({ ...prev, [question.id]: idx }));
                    }
                  }}
                  activeOpacity={0.7}
                >
                  {pair.leftImage ? (
                    <ExpoImage 
                      source={{ uri: pair.leftImage }} 
                      style={styles.gameMatchingImage} 
                      contentFit="contain" 
                      transition={120} 
                      cachePolicy="memory-disk"
                      priority="high"
                      recyclingKey={`left-${question.id}-${idx}`}
                    />
                  ) : (
                    <View style={styles.gameItemContent}>
                      <Text 
                        style={[
                          styles.gameMatchingText,
                          isPaired && { color: '#ffffff', fontWeight: '700' }
                        ]}
                        numberOfLines={3}
                        ellipsizeMode="tail"
                      >
                        {pair.left}
                      </Text>
                    </View>
                  )}
                  {isPaired && (
                    <View style={styles.matchingPairBadge}>
                      <MaterialCommunityIcons name="check" size={16} color="#ffffff" />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
          
          {/* Right Column */}
          <View style={styles.matchingColumn}>
            <View style={styles.columnHeaderSimple}>
              <Text style={styles.matchingColumnTitle}>Column B</Text>
            </View>
            {rightOrder.map((mappedIndex) => {
              const pair = question.pairs![mappedIndex];
              const idx = mappedIndex;
              const leftIndexForThis = getLeftIndexForRight(idx);
              const pairColor = leftIndexForThis !== null ? getPairColor(leftIndexForThis, idx) : null;
              const isPaired = isRightItemPaired(idx);
              
              return (
                <TouchableOpacity
                  key={`right-${idx}`}
                  style={[
                    styles.gameMatchingItem,
                    styles.matchingRight,
                    // Show solid color when correctly paired
                    isPaired && pairColor && { 
                      backgroundColor: pairColor,
                      borderColor: pairColor,
                      borderWidth: 3
                    }
                  ]}
                  onPress={() => {
                    if (selectedLeft === null) {
                      // No left item selected, show hint
                      showCustomAlert('Select from Column A', 'Please select an item from Column A first, then select from Column B to create a pair.', undefined, 'warning');
                      return;
                    }
                    
                    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                    
                    if (isPaired && leftIndexForThis === selectedLeft) {
                      // Unpair if clicking on the paired item
                      const newPairs = { ...currentPairs };
                      delete newPairs[`left-${selectedLeft}`];
                      setMatchingPairs(prev => ({ ...prev, [question.id]: newPairs }));
                      setMatchingSelectedLeft(prev => ({ ...prev, [question.id]: null }));
                      handleAnswerChange(newPairs);
                    } else if (!isPaired) {
                      // Create new pair
                      const newPairs = { ...currentPairs, [`left-${selectedLeft}`]: idx };
                      
                      // Check if the match is correct
                      if (isMatchCorrect(selectedLeft, idx)) {
                        // Correct match - keep the pair
                        setMatchingPairs(prev => ({ ...prev, [question.id]: newPairs }));
                        setMatchingSelectedLeft(prev => ({ ...prev, [question.id]: null }));
                        handleAnswerChange(newPairs);
                        
                        // Haptic feedback for successful pairing
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                        
                        // Check if all pairs are now correctly matched
                        const allPairsMatched = Object.keys(newPairs).length === pairCount;
                        if (allPairsMatched) {
                          // All pairs matched correctly - show green flash and auto advance
                          console.log('[Matching] All pairs matched correctly, showing success feedback...');
                          console.log('[Matching] Final pairs state:', newPairs);
                          
                          // CRITICAL FIX: Log the final CORRECT attempt
                          // Only log when ALL pairs are complete, not for individual pairs
                          console.log('[Matching] Logging final CORRECT attempt for all pairs');
                          logAttempt(question, newPairs, 'final');
                          
                          // Mark the question as correct and save the answer
                          setQuestionCorrect(question.id, true);
                          updateAnswers(prev => prev.map(a => 
                            a.questionId === question.id ? { ...a, answer: newPairs, isCorrect: true } : a
                          ));
                          
                          // FIXED: Don't increment attempts on correct completion
                          const currentAttempts = attemptCounts[question.id] || 0;
                          console.log('[Matching] All pairs correct - NO attempt increment, current attempts:', currentAttempts);
                          
                          // Trigger correct feedback with green flash animation
                          triggerCorrectFeedback(() => {
                            if (levelMode) {
                              handleLevelComplete();
                            } else {
                              advanceToNextOrFinish();
                            }
                          });
                        } else {
                          // Not all pairs matched yet - just show success feedback for this pair
                          console.log('[Matching] Correct pair made (' + Object.keys(newPairs).length + '/' + pairCount + '), no attempt logged');
                          // No feedback needed for partial progress
                        }
                      } else {
                        // Incorrect match - track attempt
                        const currentAttemptCount = attemptCounts[question.id] || 0;
                        const maxAttempts = exercise?.maxAttemptsPerItem;
                        
                        console.log('[Matching] Wrong pair detected:', {
                          questionId: question.id,
                          selectedLeft,
                          selectedRight: idx,
                          currentPairs: Object.keys(currentPairs).length,
                          totalPairs: pairCount,
                          currentAttempts: currentAttemptCount
                        });
                        
                        // Trigger shake animation and red flash
                        Animated.sequence([
                          Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
                          Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
                          Animated.timing(shakeAnim, { toValue: 6, duration: 50, useNativeDriver: true }),
                          Animated.timing(shakeAnim, { toValue: -6, duration: 50, useNativeDriver: true }),
                          Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
                        ]).start();
                        triggerWrongFeedback();
                        
                        // Error haptic feedback
                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                        
                        // CRITICAL FIX: Increment attempt count AFTER feedback
                        const newAttemptCount = currentAttemptCount + 1;
                        // CRITICAL: We do not trust local counter; sync after logging from attemptLogsRef
                        
                        // CRITICAL FIX: Log attempt with current correct pairs (before wrong pair is added)
                        // This ensures we track the attempt without polluting the answer with wrong data
                        console.log('[Matching] Logging incorrect attempt #' + newAttemptCount + ':', {
                          questionId: question.id,
                          attemptCount: newAttemptCount,
                          wrongPairAttempted: `left-${selectedLeft} → right-${idx}`,
                          currentCorrectPairs: Object.keys(currentPairs).length
                        });
                        
                        // Log the attempt with just current pairs (excluding the wrong one)
                        logAttempt(question, currentPairs, 'change');
                        syncAttemptCount(question.id);
                        
                        // Check if attempt limit is reached
                        if (maxAttempts !== null && maxAttempts !== undefined && newAttemptCount >= maxAttempts) {
                          // Mark as failed with current progress
                          handleAnswerChange(currentPairs);
                          
                          console.log('[Matching] Max attempts reached, logging final state:', {
                            questionId: question.id,
                            attemptCount: newAttemptCount,
                            finalPairs: currentPairs,
                            pairsMatched: Object.keys(currentPairs).length + '/' + pairCount
                          });
                          
                          logAttempt(question, currentPairs, 'final');
                          syncAttemptCount(question.id);
                          setQuestionCorrect(question.id, false);
                          
                          // Show attempt limit reached message briefly
                          showCustomAlert(
                            'Attempt Limit Reached', 
                            `You have reached the maximum number of attempts (${maxAttempts}) for this question.`,
                            () => advanceToNextOrFinish(),
                            'warning'
                          );
                        } else {
                          // Continue allowing more attempts
                          console.log('[Matching] Wrong pair rejected, attempts remaining:', maxAttempts ? (maxAttempts - newAttemptCount) : 'unlimited');
                        }
                      }
                    } else {
                      // Right item already paired with a different left item
                      showCustomAlert('Already Paired', 'This item is already paired. Tap the paired item in Column A to unpair it first.', undefined, 'warning');
                    }
                  }}
                  activeOpacity={0.7}
                >
                  {pair.rightImage ? (
                    <ExpoImage 
                      source={{ uri: pair.rightImage }} 
                      style={styles.gameMatchingImage} 
                      contentFit="contain" 
                      transition={120} 
                      cachePolicy="memory-disk"
                      priority="high"
                      recyclingKey={`right-${question.id}-${idx}`}
                    />
                  ) : (
                    <View style={styles.gameItemContent}>
                      <Text 
                        style={[
                          styles.gameMatchingText,
                          isPaired && { color: '#ffffff', fontWeight: '700' }
                        ]}
                        numberOfLines={3}
                        ellipsizeMode="tail"
                      >
                        {pair.right}
                      </Text>
                    </View>
                  )}
                  {isPaired && (
                    <View style={styles.matchingPairBadge}>
                      <MaterialCommunityIcons name="link" size={16} color="#ffffff" />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
        
        {/* Pair progress indicator */}
        <View style={styles.matchingProgressContainer}>
          <Text style={styles.matchingProgressText}>
            Pairs matched: {Object.keys(currentPairs).length} / {pairCount}
          </Text>
          {Object.keys(currentPairs).length === pairCount && (
            <View style={styles.matchingCompleteContainer}>
              <MaterialCommunityIcons name="check-circle" size={24} color="#10b981" />
              <Text style={styles.matchingCompleteText}>All pairs matched! 🎉</Text>
            </View>
          )}
        </View>
      </View>
    );
  };

  const renderReorder = (question: Question) => {
    // CRITICAL FIX: Always start with empty initial answer for each question
    // Don't carry over previous question's reorder answers
    const initial: ReorderItem[] | undefined = [];
    
    return (
      <View style={styles.questionContainer}>
        {/* Question Images - Support both single and multiple images */}
        {(question.questionImage || (question.questionImages && question.questionImages.length)) && (
          <View style={styles.questionImageContainer}>
            {Array.isArray(question.questionImage) ? (
              question.questionImage.map((img, idx) => (
                <ExpoImage 
                  key={`qi-${idx}`} 
                  source={{ uri: img }} 
                  style={styles.questionImage} 
                  contentFit="contain" 
                  transition={150} 
                  cachePolicy="memory-disk" 
                  priority="high"
                  recyclingKey={`qi-reorder-${question.id}-${idx}`}
                />
              ))
            ) : question.questionImage ? (
              <ExpoImage 
                source={{ uri: question.questionImage }} 
                style={styles.questionImage} 
                contentFit="contain" 
                transition={150} 
                cachePolicy="memory-disk" 
                priority="high"
                recyclingKey={`qi-reorder-${question.id}`}
              />
            ) : null}
            {question.questionImages && question.questionImages.length ? (
              <View style={styles.questionImagesGrid}>
                {question.questionImages.map((img, idx) => (
                  <ExpoImage 
                    key={`qis-${idx}`} 
                    source={{ uri: img }} 
                    style={styles.questionImageThumb} 
                    contentFit="cover" 
                    transition={120} 
                    cachePolicy="memory-disk"
                    priority="high"
                    recyclingKey={`qis-reorder-${question.id}-${idx}`}
                  />
                ))}
              </View>
            ) : null}
          </View>
        )}
        
        <View style={styles.questionTextContainer}>
          <Text style={styles.questionText}>{question.question}</Text>
          {renderTTSButton(question.ttsAudioUrl)}
        </View>
        <ReorderQuestion
          key={question.id} // CRITICAL FIX: Force remount when question changes to ensure clean state
          question={question}
          initialAnswer={initial || []}
          currentAttempts={attemptCounts[question.id] || 0}
          maxAttempts={exercise?.maxAttemptsPerItem || null}
          onChange={(ordered) => {
            setReorderAnswers((prev) => ({ ...prev, [question.id]: ordered }));
            handleAnswerChange(ordered.map((o) => o.id));
          }}
          onAttempt={(attemptSequence) => {
            // Single point of attempt recording - avoid duplicates
            incrementAttemptCount(question.id);
            logAttempt(question, attemptSequence, 'change');
            console.log('[Reorder] Attempt recorded for', question.id, 'sequence:', attemptSequence);
            // Show single wrong feedback per attempt (guarded internally)
            triggerWrongFeedback();
          }}
          onComplete={(isCorrect, finalAnswer) => {
            console.log('[Reorder] Complete callback received, isCorrect:', isCorrect, 'finalAnswer:', finalAnswer);
            
            if (isCorrect) {
              // Mark question as correct
              setQuestionCorrect(question.id, true);
              
              // Resolve final answer IDs
              const finalIds = Array.isArray(finalAnswer)
                ? finalAnswer.map((x: any) => (typeof x === 'string' ? x : x?.id)).filter(Boolean)
                : (reorderAnswers[question.id]?.map((o: any) => o.id) || []);
              
              // Update answer with correct status and final sequence
              updateAnswers(prev => prev.map(a => 
                a.questionId === question.id ? { ...a, answer: finalIds, isCorrect: true } : a
              ));
              
              // Log the final correct attempt to close the history properly
              logAttempt(question, finalIds, 'final');
              
              // Show correct feedback animation
              triggerCorrectFeedback(() => {
                advanceToNextOrFinish();
              });
          } else {
            // Max attempts reached without completing correctly
            console.log('[Reorder] Max attempts reached, marking as incorrect');
            
            // Ensure the last logged attempt is marked as 'final' (no duplicate log)
            const attempts = attemptLogsRef.current[question.id] || [];
            if (attempts.length > 0) {
              const lastAttempt = attempts[attempts.length - 1];
              if (lastAttempt.attemptType === 'change') {
                lastAttempt.attemptType = 'final';
                console.log('[Reorder] Marked last attempt as final before advancing');
              }
            }
            
            // Wrong feedback already shown in onAttempt - skip duplicate
            console.log('[Reorder] Wrong feedback already shown in onAttempt - skipping duplicate feedback');
            
            setQuestionCorrect(question.id, false);
            
            // Update answer with incorrect status
            updateAnswers(prev => prev.map(a => 
              a.questionId === question.id ? { ...a, isCorrect: false } : a
            ));
            
            // Auto-advance to next question after showing locked state
            setTimeout(() => {
              advanceToNextOrFinish();
            }, 1500); // Slightly longer delay to show feedback
          }
          }}
        />
      </View>
    );
  };
  const renderReadingPassage = (question: Question) => {
    return (
      <View style={styles.questionContainer}>
          {/* Question Images */}
          {(question.questionImage || (question.questionImages && question.questionImages.length)) && (
            <View style={styles.questionImageContainer}>
              {Array.isArray(question.questionImage) ? (
                question.questionImage.map((img, idx) => (
                  <ExpoImage 
                    key={`qi-${idx}`} 
                    source={{ uri: img }} 
                    style={styles.questionImage} 
                    contentFit="contain" 
                    transition={150} 
                    cachePolicy="memory-disk" 
                    priority="high"
                    recyclingKey={`qi-passage-${question.id}-${idx}`}
                  />
                ))
              ) : question.questionImage ? (
                <ExpoImage 
                  source={{ uri: question.questionImage }} 
                  style={styles.questionImage} 
                  contentFit="contain" 
                  transition={150} 
                  cachePolicy="memory-disk" 
                  priority="high"
                  recyclingKey={`qi-passage-${question.id}`}
                />
              ) : null}
              {question.questionImages && question.questionImages.length ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                  {question.questionImages.map((img, idx) => (
                    <ExpoImage 
                      key={`qis-${idx}`} 
                      source={{ uri: img }} 
                      style={{ width: 100, height: 100, borderRadius: 8, marginRight: 8 }} 
                      contentFit="cover" 
                      transition={120} 
                      cachePolicy="memory-disk"
                      priority="high"
                      recyclingKey={`qis-passage-${question.id}-${idx}`}
                    />
                  ))}
                </ScrollView>
              ) : null}
            </View>
          )}
        
        <View style={styles.passageContainer}>
          <Text style={styles.passageText}>{question.passage}</Text>
        </View>
        
        {question.subQuestions?.map((subQuestion, index) => (
          <View key={subQuestion.id} style={styles.subQuestionContainer}>
            <View style={index === 0 ? undefined : styles.subQuestionCard}>
              <Text style={styles.subQuestionTitle}>
                Question {index + 1}
              </Text>
              {/* Sub-question Image */}
              {subQuestion.questionImage && (
                <View style={index === 0 ? styles.subQuestionImageContainer : styles.questionImageContainer}>
                  {Array.isArray(subQuestion.questionImage) ? (
                    subQuestion.questionImage.map((img, idx2) => (
                      <ExpoImage 
                        key={idx2} 
                        source={{ uri: img }} 
                        style={styles.questionImage} 
                        contentFit="contain" 
                        transition={150} 
                        cachePolicy="memory-disk" 
                        priority="high"
                        recyclingKey={`sub-${question.id}-${subQuestion.id}-${idx2}`}
                      />
                    ))
                  ) : (
                    <ExpoImage 
                      source={{ uri: subQuestion.questionImage }} 
                      style={styles.questionImage} 
                      contentFit="contain" 
                      transition={150} 
                      cachePolicy="memory-disk" 
                      priority="high"
                      recyclingKey={`sub-${question.id}-${subQuestion.id}`}
                    />
                  )}
                </View>
              )}

              {/* Sub-question Text container */}
              <View style={index === 0 ? styles.subQuestionTextContainer : styles.questionTextContainer}>
                <Text style={styles.questionText}>{subQuestion.question}</Text>
                {renderTTSButton((subQuestion as any).ttsAudioUrl)}
              </View>

              {subQuestion.type === 'multiple-choice' && (() => {
                const hasAllImages = subQuestion.options?.every((_, idx) => subQuestion.optionImages?.[idx]);
                const useGridLayout = hasAllImages && subQuestion.options && subQuestion.options.length <= 4;
                const parentId = question.id;
                const subId = subQuestion.id;
                const current = getSubAnswer(parentId, subId);
                const selectedArray = Array.isArray(current) ? current : (subQuestion.multiAnswer ? [] : []);

                if (useGridLayout) {
                  return (
                    <View style={styles.optionsGridContainer}>
                      {subQuestion.options?.map((option, optionIndex) => {
                        const isSelected = subQuestion.multiAnswer ? selectedArray.includes(option) : current === option;
                        const hasImage = subQuestion.optionImages?.[optionIndex];
                        const optionLabel = String.fromCharCode(65 + optionIndex);
                        return (
                          <TouchableOpacity
                            key={optionIndex}
                            style={[
                              styles.multipleChoiceGridOption,
                              isSelected && styles.selectedMultipleChoiceGridOption
                            ]}
                            onPress={() => {
                              if (subQuestion.multiAnswer) {
                                const next = isSelected
                                  ? selectedArray.filter((a: string) => a !== option)
                                  : [...selectedArray, option!];
                                setSubAnswer(parentId, subId, next);
                              } else {
                                setSubAnswer(parentId, subId, option);
                              }
                            }}
                            activeOpacity={0.7}
                          >
                            {hasImage && (
                              <ExpoImage 
                                source={{ uri: hasImage }} 
                                style={styles.gridOptionImage}
                                contentFit="contain"
                                transition={120}
                                cachePolicy="memory-disk"
                                priority="high"
                                recyclingKey={`sub-opt-${question.id}-${subQuestion.id}-${optionIndex}`}
                              />
                            )}
                            {isSelected && (
                              <View style={styles.gridCheckIconContainer}>
                                <MaterialIcons name="check-circle" size={28} color="#4a90e2" />
                              </View>
                            )}
                            <View style={styles.gridOptionLabelContainer}>
                              <Text style={styles.gridOptionLabel}>{optionLabel}</Text>
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  );
                }

                return (
                  <View style={styles.optionsContainer}>
                    {subQuestion.options?.map((option, optionIndex) => {
                    const parentId = question.id;
                    const subId = subQuestion.id;
                    const isSelected = subQuestion.multiAnswer ? selectedArray.includes(option) : current === option;
                    const optionLabel = String.fromCharCode(65 + optionIndex);
                    const hasImage = subQuestion.optionImages?.[optionIndex];
                    return (
                      <TouchableOpacity
                        key={optionIndex}
                        style={[
                          styles.multipleChoiceOption,
                          isSelected && styles.selectedMultipleChoiceOption
                        ]}
                        onPress={() => {
                          if (subQuestion.multiAnswer) {
                            const next = isSelected
                              ? selectedArray.filter((a: string) => a !== option)
                              : [...selectedArray, option!];
                            setSubAnswer(parentId, subId, next);
                          } else {
                            setSubAnswer(parentId, subId, option);
                          }
                        }}
                        activeOpacity={0.7}
                      >
                        <View style={styles.optionContent}>
                          <View style={styles.optionLabelContainer}>
                            <Text style={[styles.optionLabel, isSelected && styles.selectedOptionLabel]}>
                              {optionLabel}
                            </Text>
                          </View>
                          {hasImage && (
                            <ExpoImage 
                              source={{ uri: hasImage }} 
                              style={styles.optionImage} 
                              contentFit="contain" 
                              transition={120} 
                              cachePolicy="memory-disk"
                              priority="high"
                              recyclingKey={`sub-opt2-${question.id}-${subQuestion.id}-${optionIndex}`}
                            />
                          )}
                          <Text style={[styles.optionText, isSelected && styles.selectedOptionText]}>
                            {option}
                          </Text>
                        </View>
                        {isSelected && (
                          <View style={styles.checkIconContainer}>
                            <MaterialIcons name="check-circle" size={24} color="#ffffff" />
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                    })}
                  </View>
                );
              })()}

              {subQuestion.type === 'identification' && (() => {
                const parentId = question.id;
                const subId = subQuestion.id;
                const hasBlanks = subQuestion.fillSettings?.showBoxes;
                if (hasBlanks) {
                  return (
                    <View style={styles.identificationContainer}>
                      <View style={index === 0 ? styles.subQuestionTextContainer : styles.questionTextContainer}>
                        <Text style={[styles.fillBlankQuestionText, { fontSize: getDynamicFontSize(subQuestion.question) }]}>{subQuestion.question}</Text>
                      </View>
                      <View style={styles.adaptiveBoxesRow}>
                        {Array.isArray(subQuestion.answer) ? subQuestion.answer.map((expected, idx) => {
                          const expectedText = String(expected || '');
                          const expectedLength = Math.max(expectedText.length, 1);
                          const minWidth = 56;
                          const charWidth = 12;
                          const horizontalPadding = 24;
                          const computedWidth = Math.min(Math.max(expectedLength * charWidth + horizontalPadding, minWidth), Math.floor(screenWidth * 0.8));
                          const maxLen = expectedLength > 0 ? expectedLength : undefined;
                          const curr = getSubAnswer(parentId, subId) || [];
                          const value = Array.isArray(curr) ? (curr[idx] || '') : '';
                          return (
                            <TextInput
                              key={idx}
                              style={[styles.blankBoxInput, { width: computedWidth }]}
                              value={value}
                              onChangeText={(text) => {
                                const next = Array.isArray(curr) ? [...curr] : [];
                                next[idx] = maxLen ? text.slice(0, maxLen) : text;
                                setSubAnswer(parentId, subId, next);
                              }}
                              maxLength={maxLen}
                              placeholder=""
                              autoCorrect={false}
                              numberOfLines={1}
                            />
                          );
                        }) : null}
                      </View>
                      {subQuestion.fillSettings?.hint && (
                        <Text style={styles.hintText}>💡 Hint: {subQuestion.fillSettings.hint}</Text>
                      )}
                    </View>
                  );
                }
                const value = getSubAnswer(parentId, subId) || '';
                return (
                  <>
                    <View style={index === 0 ? styles.subQuestionTextContainer : styles.questionTextContainer}>
                      <Text style={[styles.fillBlankQuestionText, { fontSize: getDynamicFontSize(subQuestion.question) }]}>{subQuestion.question}</Text>
                    </View>
                    <TextInput
                      style={styles.identificationInput}
                      value={typeof value === 'string' ? value : ''}
                      onChangeText={(text) => setSubAnswer(parentId, subId, text)}
                      placeholder="Type your answer..."
                      placeholderTextColor="#6b7280"
                      multiline
                    />
                    {subQuestion.fillSettings?.hint && (
                      <Text style={styles.hintText}>💡 Hint: {subQuestion.fillSettings.hint}</Text>
                    )}
                  </>
                );
              })()}

              {subQuestion.type === 'matching' && (() => {
                const parentId = question.id;
                const subId = subQuestion.id;
                const pairCount = subQuestion.pairs?.length || 0;
                const selectionsKey = subId;
                
                // FIXED: Use new pairing state for sub-questions
                const currentPairs = matchingPairs[selectionsKey] || {};
                const selectedLeft = matchingSelectedLeft[selectionsKey] ?? null;
                
                const makeOrder = (n: number) => Array.from({ length: n }, (_, i) => i).sort(() => Math.random() - 0.5);
                const cached = shuffledPairsCache[selectionsKey];
                const leftOrder = cached?.left || makeOrder(pairCount);
                const rightOrder = cached?.right || makeOrder(pairCount);
                if (!cached && pairCount > 0) {
                  setShuffledPairsCache(prev => ({ ...prev, [selectionsKey]: { left: leftOrder, right: rightOrder } }));
                }
                
                // Color palette for pairs
                const pairColors = [
                  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', 
                  '#06b6d4', '#ec4899', '#14b8a6', '#f97316', '#6366f1',
                  '#84cc16', '#f43f5e'
                ];
                
                const getPairColor = (leftIndex: number, rightIndex: number | null | undefined): string | null => {
                  if (rightIndex === null || rightIndex === undefined) return null;
                  for (let i = 0; i < pairCount; i++) {
                    const key = `left-${i}`;
                    if (currentPairs[key] === rightIndex && i === leftIndex) {
                      return pairColors[i % pairColors.length];
                    }
                  }
                  return null;
                };
                
                const isRightItemPaired = (rightIndex: number): boolean => {
                  return Object.values(currentPairs).includes(rightIndex);
                };
                
                const getLeftIndexForRight = (rightIndex: number): number | null => {
                  for (const [leftKey, pairedRightIndex] of Object.entries(currentPairs)) {
                    if (pairedRightIndex === rightIndex) {
                      return parseInt(leftKey.split('-')[1]);
                    }
                  }
                  return null;
                };
                
                return (
                  <>
                    <View style={styles.matchingInstructions}>
                      <Text style={styles.matchingInstructionsText}>
                        {selectedLeft === null 
                          ? '👆 Tap an item from Column A first'
                          : '👉 Now tap an item from Column B to create a pair'}
                      </Text>
                    </View>
                    <View style={styles.matchingGameContainer}>
                      <View style={styles.matchingColumn}>
                        <View style={styles.columnHeaderSimple}>
                          <Text style={styles.matchingColumnTitle}>Column A</Text>
                        </View>
                        {leftOrder.map((mappedIndex) => {
                          const pair = subQuestion.pairs![mappedIndex];
                          const idx = mappedIndex;
                          const pairedRightIndex = currentPairs[`left-${idx}`];
                          const pairColor = getPairColor(idx, pairedRightIndex);
                          const isSelected = selectedLeft === idx;
                          const isPaired = pairedRightIndex !== undefined && pairedRightIndex !== null;
                          
                          return (
                            <TouchableOpacity
                              key={`left-${idx}`}
                              style={[
                                styles.gameMatchingItem,
                                styles.matchingLeft,
                                isSelected && styles.matchingLeftSelected,
                                isPaired && pairColor && { 
                                  backgroundColor: pairColor,
                                  borderColor: pairColor,
                                  borderWidth: 3
                                }
                              ]}
                              onPress={() => {
                                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                                
                                if (isPaired) {
                                  const newPairs = { ...currentPairs };
                                  delete newPairs[`left-${idx}`];
                                  setMatchingPairs(prev => ({ ...prev, [selectionsKey]: newPairs }));
                                  setMatchingSelectedLeft(prev => ({ ...prev, [selectionsKey]: null }));
                                  setSubAnswer(parentId, subId, newPairs);
                                } else {
                                  setMatchingSelectedLeft(prev => ({ ...prev, [selectionsKey]: idx }));
                                }
                              }}
                              activeOpacity={0.7}
                            >
                              {pair.leftImage ? (
                                <ExpoImage source={{ uri: pair.leftImage }} style={styles.gameMatchingImage} contentFit="contain" transition={120} cachePolicy="disk" />
                              ) : (
                                <View style={styles.gameItemContent}>
                                  <Text 
                                    style={[
                                      styles.gameMatchingText,
                                      isPaired && { color: '#ffffff', fontWeight: '700' }
                                    ]}
                                    numberOfLines={3}
                                    ellipsizeMode="tail"
                                  >
                                    {pair.left}
                                  </Text>
                                </View>
                              )}
                              {isPaired && (
                                <View style={styles.matchingPairBadge}>
                                  <MaterialCommunityIcons name="check" size={16} color="#ffffff" />
                                </View>
                              )}
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                      <View style={styles.matchingColumn}>
                        <View style={styles.columnHeaderSimple}>
                          <Text style={styles.matchingColumnTitle}>Column B</Text>
                        </View>
                        {rightOrder.map((mappedIndex) => {
                          const pair = subQuestion.pairs![mappedIndex];
                          const idx = mappedIndex;
                          const leftIndexForThis = getLeftIndexForRight(idx);
                          const pairColor = leftIndexForThis !== null ? getPairColor(leftIndexForThis, idx) : null;
                          const isPaired = isRightItemPaired(idx);
                          
                          return (
                            <TouchableOpacity
                              key={`right-${idx}`}
                              style={[
                                styles.gameMatchingItem,
                                styles.matchingRight,
                                isPaired && pairColor && { 
                                  backgroundColor: pairColor,
                                  borderColor: pairColor,
                                  borderWidth: 3
                                }
                              ]}
                              onPress={() => {
                                if (selectedLeft === null) {
                                  showCustomAlert('Select from Column A', 'Please select an item from Column A first.', undefined, 'warning');
                                  return;
                                }
                                
                                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                                
                                if (isPaired && leftIndexForThis === selectedLeft) {
                                  const newPairs = { ...currentPairs };
                                  delete newPairs[`left-${selectedLeft}`];
                                  setMatchingPairs(prev => ({ ...prev, [selectionsKey]: newPairs }));
                                  setMatchingSelectedLeft(prev => ({ ...prev, [selectionsKey]: null }));
                                  setSubAnswer(parentId, subId, newPairs);
                                } else if (!isPaired) {
                                  const newPairs = { ...currentPairs, [`left-${selectedLeft}`]: idx };
                                  setMatchingPairs(prev => ({ ...prev, [selectionsKey]: newPairs }));
                                  setMatchingSelectedLeft(prev => ({ ...prev, [selectionsKey]: null }));
                                  setSubAnswer(parentId, subId, newPairs);
                                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                                } else {
                                  showCustomAlert('Already Paired', 'This item is already paired. Tap the paired item in Column A to unpair it first.', undefined, 'warning');
                                }
                              }}
                              activeOpacity={0.7}
                            >
                              {pair.rightImage ? (
                                <ExpoImage source={{ uri: pair.rightImage }} style={styles.gameMatchingImage} contentFit="contain" transition={120} cachePolicy="disk" />
                              ) : (
                                <View style={styles.gameItemContent}>
                                  <Text 
                                    style={[
                                      styles.gameMatchingText,
                                      isPaired && { color: '#ffffff', fontWeight: '700' }
                                    ]}
                                    numberOfLines={3}
                                    ellipsizeMode="tail"
                                  >
                                    {pair.right}
                                  </Text>
                                </View>
                              )}
                              {isPaired && (
                                <View style={styles.matchingPairBadge}>
                                  <MaterialCommunityIcons name="link" size={16} color="#ffffff" />
                                </View>
                              )}
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                    <View style={styles.matchingProgressContainer}>
                      <Text style={styles.matchingProgressText}>
                        Pairs matched: {Object.keys(currentPairs).length} / {pairCount}
                      </Text>
                    </View>
                  </>
                );
              })()}

              {subQuestion.type === 're-order' && (() => {
                const parentId = question.id;
                const subId = subQuestion.id;
                const storedOrder = getSubAnswer(parentId, subId) as string[] | undefined;
                const initialItems = (() => {
                  const all = subQuestion.reorderItems || [];
                  if (storedOrder && storedOrder.length) {
                    const map = new Map(all.map(it => [it.id, it]));
                    return storedOrder.map(id => map.get(id)).filter(Boolean) as ReorderItem[];
                  }
                  return [] as ReorderItem[];
                })();
                return (
                  <>
                    <View style={index === 0 ? styles.subQuestionTextContainer : styles.questionTextContainer}>
                      <Text style={styles.questionText}>{subQuestion.question}</Text>
                    </View>
                    <ReorderQuestion
                      question={subQuestion as any}
                      initialAnswer={initialItems}
                      onChange={(ordered) => {
                        setReorderAnswers(prev => ({ ...prev, [subId]: ordered }));
                        setSubAnswer(parentId, subId, ordered.map(o => o.id));
                      }}
                    />
                  </>
                );
              })()}
            </View>
          </View>
        ))}
      </View>
    );
  };
  
  const renderLoadingScreen = () => {
    const bounceTranslateY = bounceAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [0, -20],
    });

    const rotateInterpolate = rotateAnim.interpolate({
      inputRange: [0, 1],
      outputRange: ['0deg', '360deg'],
    });

    const slideTranslateX = slideAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [-50, 50],
    });

    return (
      <View style={styles.container}>
        {/* Background Image with Blur Overlay */}
        <ImageBackground
          source={getBackgroundSource(backgroundImage)}
          style={styles.backgroundImage}
          blurRadius={0.5}
        >
          {/* Dark Overlay */}
          <View style={styles.overlay} />
          
          {/* Interactive Loading Content */}
          <View style={styles.interactiveLoadingContainer}>
            {/* Floating Math Elements */}
            <View style={styles.floatingMathElements}>
              <Animated.View 
                style={[
                  styles.mathElement,
                  styles.mathElement1,
                  { 
                    transform: [
                      { translateY: bounceTranslateY },
                      { scale: pulseAnim }
                    ]
                  }
                ]}
              >
                <Text style={styles.mathElementText}>🔢</Text>
              </Animated.View>
              
              <Animated.View 
                style={[
                  styles.mathElement,
                  styles.mathElement2,
                  { 
                    transform: [
                      { rotate: rotateInterpolate },
                      { scale: pulseAnim }
                    ]
                  }
                ]}
              >
                <Text style={styles.mathElementText}>📚</Text>
              </Animated.View>
              
              <Animated.View 
                style={[
                  styles.mathElement,
                  styles.mathElement3,
                  { 
                    transform: [
                      { translateX: slideTranslateX },
                      { scale: pulseAnim }
                    ]
                  }
                ]}
              >
                <Text style={styles.mathElementText}>✨</Text>
              </Animated.View>

              <Animated.View 
                style={[
                  styles.mathElement,
                  styles.mathElement4,
                  { 
                    transform: [
                      { translateY: bounceTranslateY },
                      { rotate: rotateInterpolate }
                    ]
                  }
                ]}
              >
                <Text style={styles.mathElementText}>🎯</Text>
              </Animated.View>

              <Animated.View 
                style={[
                  styles.mathElement,
                  styles.mathElement5,
                  { 
                    transform: [
                      { translateX: slideTranslateX },
                      { scale: pulseAnim }
                    ]
                  }
                ]}
              >
                <Text style={styles.mathElementText}>🧮</Text>
              </Animated.View>
            </View>

            {/* Main Loading Card */}
            <View style={styles.loadingCard}>
              {/* Header */}
              <View style={styles.loadingHeader}>
                <Animated.View 
                  style={[
                    styles.loadingIcon,
                    { 
                      transform: [
                        { scale: pulseAnim },
                        { rotate: rotateInterpolate }
                      ]
                    }
                  ]}
                >
                  <Text style={styles.loadingIconEmoji}>🚀</Text>
                </Animated.View>
                
                <View style={styles.loadingTitleContainer}>
                  <Text style={styles.loadingTitle}>
                    {loading ? 'Loading Exercise...' : 'Getting Ready!'}
                  </Text>
                  <Text style={styles.loadingSubtitle}>
                    {loading ? 'Preparing your math adventure...' : 'Loading your math adventure...'}
                  </Text>
                </View>
              </View>

              {/* Progress Section */}
              <View style={styles.progressSection}>
                <View style={styles.progressHeader}>
                  <Text style={styles.progressTitle}>Progress</Text>
                  <Text style={styles.progressPercentage}>
                    {loading ? '...' : `${Math.round(animatedProgress)}%`}
                  </Text>
                </View>
                
                <View style={styles.loadingProgressBarContainer}>
                  <View style={styles.loadingProgressBarBackground}>
                    <Animated.View 
                      style={[
                        styles.loadingProgressBarFill, 
                        { width: `${loading ? 0 : Math.round(animatedProgress)}%` }
                      ]} 
                    />
                  </View>
                </View>
                
                <Text style={styles.progressStatus}>
                  {loading ? 'Please wait while we prepare everything...' : preloadStatus}
                </Text>
              </View>

              {/* Interactive Elements */}
              <View style={styles.interactiveElements}>
                {/* Loading Dots */}
                <View style={styles.loadingDotsContainer}>
                  <Animated.View style={[styles.loadingDot, { opacity: pulseAnim }]} />
                  <Animated.View style={[styles.loadingDot, { opacity: pulseAnim }]} />
                  <Animated.View style={[styles.loadingDot, { opacity: pulseAnim }]} />
                </View>

                {/* TTS Cache Status Indicator */}
                {ttsPreloadComplete && (
                  <View style={styles.ttsCacheStatusContainer}>
                    <MaterialIcons name="volume-up" size={16} color="#10b981" />
                    <Text style={styles.ttsCacheStatusText}>
                      🎤 Audio cached - instant playback ready!
                    </Text>
                  </View>
                )}

                {/* Fun Math Facts */}
                <View style={styles.mathFactsContainer}>
                  <Text style={styles.mathFactText}>
                    💡 Did you know? Math is everywhere around us!
                  </Text>
                </View>
              </View>

              {/* START NOW Button - Only show when resources are ready */}
              {resourcesReady && !exerciseStarted && (
                <TouchableOpacity 
                  style={styles.startNowButton}
                  onPress={handleStartExercise}
                  activeOpacity={0.8}
                >
                  <Animated.View 
                    style={[
                      styles.startNowButtonContent,
                      { 
                        transform: [
                          { scale: pulseAnim }
                        ]
                      }
                    ]}
                  >
                    <Text style={styles.startNowEmoji}>🚀</Text>
                    <Text style={styles.startNowText}>START NOW!</Text>
                    <Text style={styles.startNowSubtext}>Ready to begin your math adventure!</Text>
                  </Animated.View>
                </TouchableOpacity>
              )}

              {/* Error Display */}
              {preloadError && (
                <View style={styles.loadingErrorContainer}>
                  <Text style={styles.loadingErrorText}>😟 Oops! Something went wrong</Text>
                  <Text style={styles.errorSubtext}>{preloadError}</Text>
                  {failedResources.size > 0 && (
                    <TouchableOpacity 
                      style={styles.retryButton}
                      onPress={retryFailedResources}
                      disabled={isPreloadingResources}
                    >
                      <Text style={styles.retryButtonText}>
                        🔄 Try Again ({failedResources.size} items)
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
              
            </View>
          </View>
        </ImageBackground>
      </View>
    );
  };
  // Media readiness gate: require current question's primary images and TTS (if present) to be ready
  const isQuestionMediaReady = (q: Question): boolean => {
    const urls: string[] = [];
    if (q.questionImage) {
      if (Array.isArray(q.questionImage)) urls.push(...q.questionImage.filter(Boolean));
      else urls.push(q.questionImage);
    }
    if (q.questionImages && q.questionImages.length) urls.push(...q.questionImages.filter(Boolean));
    if (q.type === 'multiple-choice' && q.optionImages && q.optionImages.length) urls.push(...q.optionImages.filter(Boolean) as string[]);
    if (q.type === 'matching' && q.pairs && q.pairs.length) {
      q.pairs.forEach(p => {
        if (p.leftImage) urls.push(p.leftImage);
        if (p.rightImage) urls.push(p.rightImage);
      });
    }
    // TTS readiness is required when present: require cached audio for instant playback
    const ttsOk = !q.ttsAudioUrl || audioPlayerCacheRef.current.has(q.ttsAudioUrl);
    // Images considered ready if each URL either loaded or already attempted (loadedResources or failedResources)
    const allImagesKnown = urls.every(u => loadedResources.has(u) || failedResources.has(u));
    return allImagesKnown && ttsOk;
  };

  const renderQuestion = () => {
    if (!exercise) return null;
    
    const question = exercise.questions[currentQuestionIndex];
    const isLastQuestion = currentQuestionIndex === exercise.questions.length - 1;
    const mediaReady = isQuestionMediaReady(question);
    
    return (
      <Animated.View 
        style={[
          styles.questionWrapper,
          {
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }]
          }
        ]}
      >
        {/* Question Type Label */}
        <View style={styles.questionTypeLabel}>
          <Text style={styles.questionTypeText}>
            {question.type === 'multiple-choice' ? 'Multiple Choice' :
             question.type === 'identification' ? 'Fill in the Blank' :
             question.type === 'matching' ? 'Matching' :
             question.type === 're-order' ? 'Re-order' :
             question.type === 'reading-passage' ? 'Reading Passage' : 'Question'}
          </Text>
        </View>
        
        {/* Question Type Specific Rendering */}
        {!mediaReady ? (
          <View style={{ padding: 16, alignItems: 'center' }}>
            <Text style={{ color: '#64748b' }}>Preparing media…</Text>
          </View>
        ) : (
          <>
            {question.type === 'multiple-choice' && renderMultipleChoice(question)}
            {question.type === 'identification' && renderIdentification(question)}
            {question.type === 'matching' && renderMatching(question)}
            {question.type === 're-order' && renderReorder(question)}
            {question.type === 'reading-passage' && renderReadingPassage(question)}
          </>
        )}
        
        {/* Check Answer Button for non-auto-advancing question types */}
        {question.type !== 'multiple-choice' && question.type !== 'matching' && question.type !== 're-order' && (
          <View style={styles.navigationContainer}>
            <TouchableOpacity 
              style={[styles.checkAnswerButton]} 
              onPress={levelMode ? handleLevelComplete : handleNext} 
              activeOpacity={0.85}
            >
              <MaterialIcons name="check-circle" size={24} color="#ffffff" />
              <Text style={styles.checkAnswerButtonText}>
                {levelMode ? 'Finish Level' : 'Check Answer'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </Animated.View>
    );
  };
  
  // Removed start screen to go directly to exercise UI

  if (loading) {
    return (
      <View style={styles.container}>
        <ImageBackground source={getBackgroundSource(backgroundImage)} style={styles.backgroundImage}>
          {renderLoadingScreen()}
        </ImageBackground>
      </View>
    );
  }

  // Show resource preloading screen
  if (isPreloadingResources || (resourcesReady && !exerciseStarted)) {
    return (
      <View style={styles.container}>
        <ImageBackground source={getBackgroundSource(backgroundImage)} style={styles.backgroundImage}>
          {renderLoadingScreen()}
        </ImageBackground>
      </View>
    );
  }
  
  if (!exercise) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Exercise not found</Text>
      </View>
    );
  }
  
  return (
    <View style={styles.container}>
      {/* Background Image with Blur Overlay */}
      <ImageBackground
        source={getBackgroundSource(backgroundImage)}
        style={styles.backgroundImage}
        blurRadius={0.5}
      >
        {/* Dark Overlay */}
        <View style={styles.overlay} />
        
        {/* Header - Hide when showing results */}
        {!showResults && (
          <View style={styles.header}>
            <TouchableOpacity
              style={styles.headerButton}
              onPress={() => router.back()}
              activeOpacity={0.7}
            >
              <MaterialIcons name="arrow-back" size={24} color="#ffffff" />
            </TouchableOpacity>
            
            <View style={styles.headerCenter}>
              {/* Simple Time Limit Badge */}
              {exercise.timeLimitPerItem && exerciseStarted && (
                <View style={[
                  styles.timeLimitBadge,
                  timeRemaining !== null && timeRemaining < 10000 && styles.timeLimitBadgeWarning,
                  timeRemaining === 0 && styles.timeLimitBadgeExpired
                ]}>
                  <MaterialIcons 
                    name={timeRemaining === 0 ? "timer-off" : "timer"} 
                    size={20} 
                    color="#ffffff" 
                  />
                  <Text style={[
                    styles.timeLimitBadgeText,
                    timeRemaining !== null && timeRemaining < 10000 && styles.timeLimitBadgeTextWarning
                  ]}>
                    {timeRemaining === 0 ? "Times Up!" : 
                     timeRemaining !== null ? formatTime(timeRemaining) : `${exercise.timeLimitPerItem}s`}
                  </Text>
                </View>
              )}
              <Text style={styles.progressText}>
                Question {currentQuestionIndex + 1} of {exercise.questions.length}
              </Text>
            </View>
            
            <TouchableOpacity
              style={styles.headerButton}
              onPress={() => {
                // Toggle settings, but also provide quick TTS play of current question if available on long press
                setShowSettings(!showSettings);
              }}
              activeOpacity={0.7}
            >
              <MaterialIcons name="settings" size={24} color="#ffffff" />
            </TouchableOpacity>
          </View>
        )}
        
        {/* Progress Bar - Hide when showing results */}
        {!showResults && (
        <View style={styles.progressContainer}>
          <View style={styles.progressBarContainer}>
            <Animated.View 
              style={[
                styles.progressBar,
                { width: progressAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0%', '100%']
                })}
              ]}
            />
            <View style={styles.progressTextContainer}>
              <Text style={styles.progressText}>
                {currentQuestionIndex + 1} / {exercise.questions.length}
              </Text>
            </View>
          </View>
        </View>
        )}
        
        {/* Attempt Limit Indicator - Hide when showing results */}
        {!showResults && exercise.maxAttemptsPerItem !== null && (
          <View style={styles.attemptLimitContainer}>
            <MaterialCommunityIcons name="repeat" size={16} color="#64748b" />
            <Text style={styles.attemptLimitText}>
              Attempts: {attemptLogsRef.current[exercise.questions[currentQuestionIndex]?.id]?.length || 0} / {exercise.maxAttemptsPerItem}
            </Text>
          </View>
        )}
        
        {/* Question Content */}
        <ScrollView 
          style={styles.contentContainer}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          <Animated.View 
            style={[
              styles.questionWrapper,
              {
                opacity: fadeAnim,
                transform: [
                  { translateY: slideAnim },
                  { translateX: shakeAnim },
                  { scale: cardScaleAnim }
                ]
              }
            ]}
          >
            {renderQuestion()}
          </Animated.View>
        </ScrollView>

        {/* Correct Feedback Panel */}
        {showCorrect && (
          <Animated.View
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              justifyContent: 'center',
              alignItems: 'center',
              backgroundColor: 'rgba(0,0,0,0.2)',
              opacity: correctAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }),
              transform: [
                { scale: correctAnim.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1] }) },
              ],
            }}
          >
            <View style={{ backgroundColor: '#10b981', paddingHorizontal: 24, paddingVertical: 14, borderRadius: 16, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, elevation: 5 }}>
              <Text style={{ color: '#ffffff', fontSize: 18, fontWeight: '800' }}>Correct!</Text>
            </View>
          </Animated.View>
        )}

        {/* Wrong Feedback Panel */}
        {showWrong && (
          <Animated.View
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              justifyContent: 'center',
              alignItems: 'center',
              backgroundColor: 'rgba(0,0,0,0.2)',
              opacity: wrongAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }),
              transform: [
                { scale: wrongAnim.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1] }) },
              ],
            }}
          >
            <View style={{ backgroundColor: '#ef4444', paddingHorizontal: 24, paddingVertical: 14, borderRadius: 16, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, elevation: 5 }}>
              <Text style={{ color: '#ffffff', fontSize: 18, fontWeight: '800' }}>Wrong!</Text>
            </View>
          </Animated.View>
        )}

        {/* Kid-Friendly Results Panel */}
        {showResults && (
          <View style={styles.resultsOverlay}>
            <ScrollView 
              style={styles.resultsScrollContainer}
              contentContainerStyle={styles.resultsScrollContent}
              showsVerticalScrollIndicator={false}
              bounces={true}
            >
              <View style={styles.resultsContainer}>
                {/* Decorative Top Border */}
                <View style={styles.resultsTopBorder} />
                
                {/* Header with Celebration */}
                <View style={styles.resultsHeader}>
                  <View style={styles.celebrationContainer}>
                    <Text style={styles.resultsTitleEmoji}>🎉</Text>
                    <Text style={styles.resultsTitleEmoji}>🌟</Text>
                    <Text style={styles.resultsTitleEmoji}>🎊</Text>
                  </View>
                  <Text style={styles.resultsTitle}>Amazing Work!</Text>
                  <Text style={styles.resultsSubtitle}>You've completed your math adventure!</Text>
                  <View style={styles.scoreBadge}>
                    <Text style={styles.scoreBadgeText}>
                      {(() => {
                        // CRITICAL FIX: Use savedResultsSummary if available (most accurate)
                        if (savedResultsSummary) {
                          return `${savedResultsSummary.meanPercentageScore}% Complete`;
                        }
                        // Fallback to savedQuestionResults
                        if (savedQuestionResults.length > 0) {
                          const correct = savedQuestionResults.filter(sr => sr.isCorrect).length;
                          const total = exercise?.questions.length || 0;
                          const percentage = total > 0 ? Math.round((correct / total) * 100) : 0;
                          return `${percentage}% Complete`;
                        }
                        // Final fallback to local state
                        const correct = answers.filter(a => a.isCorrect).length;
                        const total = exercise?.questions.length || 0;
                        const percentage = total > 0 ? Math.round((correct / total) * 100) : 0;
                        return `${percentage}% Complete`;
                      })()}
                    </Text>
                  </View>
                </View>

              {/* Summary Stats Cards */}
              <View style={styles.statsContainer}>
                {/* Score Card */}
                <View style={[styles.statCard, styles.scoreCard]}>
                  <View style={styles.statCardHeader}>
                    <Text style={styles.statEmoji}>⭐</Text>
                    <View style={styles.statCardAccent} />
                  </View>
                  <Text style={styles.statNumber}>
                    {(() => {
                      // CRITICAL FIX: Use savedResultsSummary if available (most accurate)
                      if (savedResultsSummary) {
                        return `${savedResultsSummary.totalCorrect}/${savedResultsSummary.totalItems}`;
                      }
                      // Fallback to savedQuestionResults
                      if (savedQuestionResults.length > 0) {
                        const correct = savedQuestionResults.filter(sr => sr.isCorrect).length;
                        const total = exercise?.questions.length || 0;
                        return `${correct}/${total}`;
                      }
                      // Final fallback to local state
                      const correct = answers.filter(a => a.isCorrect).length;
                      const total = exercise?.questions.length || 0;
                      return `${correct}/${total}`;
                    })()}
                  </Text>
                  <Text style={styles.statLabel}>Correct Answers</Text>
                </View>

                {/* Time Card */}
                <View style={[styles.statCard, styles.timeCard]}>
                  <View style={styles.statCardHeader}>
                    <Text style={styles.statEmoji}>⏱️</Text>
                    <View style={styles.statCardAccent} />
                  </View>
                  <Text style={styles.statNumber}>
                    {(() => {
                      // CRITICAL FIX: Use savedResultsSummary if available (most accurate)
                      if (savedResultsSummary) {
                        return formatTime(savedResultsSummary.totalTimeSpentSeconds * 1000);
                      }
                      // Fallback to savedQuestionResults
                      if (savedQuestionResults.length > 0) {
                        const totalMs = savedQuestionResults.reduce((sum, sr) => sum + (sr.timeSpentSeconds * 1000), 0);
                        return formatTime(totalMs);
                      }
                      // Final fallback to local state
                      const totalMs = (answers || []).reduce((sum, a) => sum + (a.timeSpent || 0), 0);
                      return formatTime(totalMs);
                    })()}
                  </Text>
                  <Text style={styles.statLabel}>Time Taken</Text>
                </View>

                {/* Attempts Card */}
                <View style={[styles.statCard, styles.attemptsCard]}>
                  <View style={styles.statCardHeader}>
                    <Text style={styles.statEmoji}>🎯</Text>
                    <View style={styles.statCardAccent} />
                  </View>
                  <Text style={styles.statNumber}>
                    {(() => {
                      // CRITICAL FIX: Use savedResultsSummary if available (most accurate)
                      if (savedResultsSummary) {
                        return savedResultsSummary.totalAttempts;
                      }
                      // Fallback to savedQuestionResults
                      if (savedQuestionResults.length > 0) {
                        return savedQuestionResults.reduce((sum, sr) => sum + sr.attempts, 0);
                      }
                      // Final fallback to local state
                      return getTotalAttemptCount();
                    })()}
                  </Text>
                  <Text style={styles.statLabel}>Total Attempts</Text>
                </View>
              </View>

              {/* Performance Message */}
              <View style={styles.performanceContainer}>
                <View style={styles.performanceHeader}>
                  <Text style={styles.performanceEmoji}>
                    {(() => {
                      // CRITICAL FIX: Use savedResultsSummary if available (most accurate)
                      let percentage = 0;
                      if (savedResultsSummary) {
                        percentage = savedResultsSummary.meanPercentageScore;
                      } else if (savedQuestionResults.length > 0) {
                        const correct = savedQuestionResults.filter(sr => sr.isCorrect).length;
                        const total = exercise?.questions.length || 0;
                        percentage = total > 0 ? (correct / total) * 100 : 0;
                      } else {
                        const correct = answers.filter(a => a.isCorrect).length;
                        const total = exercise?.questions.length || 0;
                        percentage = total > 0 ? (correct / total) * 100 : 0;
                      }
                      
                      if (percentage >= 80) return '🌟';
                      if (percentage >= 60) return '👍';
                      if (percentage >= 40) return '💪';
                      return '🌱';
                    })()}
                  </Text>
                  <View style={styles.performanceStars}>
                    {(() => {
                      // CRITICAL FIX: Use savedResultsSummary if available (most accurate)
                      let percentage = 0;
                      if (savedResultsSummary) {
                        percentage = savedResultsSummary.meanPercentageScore;
                      } else if (savedQuestionResults.length > 0) {
                        const correct = savedQuestionResults.filter(sr => sr.isCorrect).length;
                        const total = exercise?.questions.length || 0;
                        percentage = total > 0 ? (correct / total) * 100 : 0;
                      } else {
                        const correct = answers.filter(a => a.isCorrect).length;
                        const total = exercise?.questions.length || 0;
                        percentage = total > 0 ? (correct / total) * 100 : 0;
                      }
                      const stars = Math.floor(percentage / 20);
                      return Array.from({ length: 5 }, (_, i) => (
                        <Text key={i} style={[styles.star, { opacity: i < stars ? 1 : 0.3 }]}>⭐</Text>
                      ));
                    })()}
                  </View>
                </View>
                <Text style={styles.performanceMessage}>
                  {(() => {
                    // CRITICAL FIX: Use savedResultsSummary if available (most accurate)
                    let percentage = 0;
                    if (savedResultsSummary) {
                      percentage = savedResultsSummary.meanPercentageScore;
                    } else if (savedQuestionResults.length > 0) {
                      const correct = savedQuestionResults.filter(sr => sr.isCorrect).length;
                      const total = exercise?.questions.length || 0;
                      percentage = total > 0 ? (correct / total) * 100 : 0;
                    } else {
                      const correct = answers.filter(a => a.isCorrect).length;
                      const total = exercise?.questions.length || 0;
                      percentage = total > 0 ? (correct / total) * 100 : 0;
                    }
                    
                    if (percentage >= 80) return 'Outstanding! You\'re a math champion! 🏆';
                    if (percentage >= 60) return 'Excellent work! You\'re doing great! 🌟';
                    if (percentage >= 40) return 'Good job! Keep up the practice! 💪';
                    return 'Nice effort! Every step counts! 🌱';
                  })()}
                </Text>
              </View>

                {/* Question Details */}
                <View style={styles.questionDetailsContainer}>
                  <Text style={styles.questionDetailsTitle}>Question Summary</Text>
                  <ScrollView 
                    style={styles.questionDetailsScroll} 
                    showsVerticalScrollIndicator={false}
                    nestedScrollEnabled={true}
                  >
                    {exercise?.questions.map((q, idx) => {
                      // CRITICAL FIX: Read from savedQuestionResults if available (after submission)
                      // Otherwise fallback to local state (during quiz)
                      const savedResult = savedQuestionResults.find(sr => sr.questionId === q.id);
                      const answer = answers.find(a => a.questionId === q.id);
                      
                      // Use saved data if available, otherwise use local state
                      const isCorrect = savedResult ? savedResult.isCorrect : (answer?.isCorrect || false);
                      const attempts = savedResult ? savedResult.attempts : getQuestionAttemptCount(q.id);
                      const timeMs = savedResult ? (savedResult.timeSpentSeconds * 1000) : getTimeMsForQuestion(q);
                      const hasAnswer = savedResult ? (savedResult.studentAnswer && savedResult.studentAnswer.trim() !== '') : (answer && answer.answer !== undefined && answer.answer !== '');
                      
                      console.log(`[ResultsUI] Q${idx + 1} Display:`, {
                        hasSavedResult: !!savedResult,
                        attempts,
                        isCorrect,
                        timeMs,
                        hasAnswer
                      });
                      
                      return (
                        <View key={q.id} style={styles.questionDetailCard}>
                          <View style={styles.questionDetailHeader}>
                            <Text style={styles.questionDetailNumber}>Q{idx + 1}</Text>
                            <View style={[
                              styles.questionDetailStatus,
                              { 
                                backgroundColor: isCorrect ? '#10b981' : hasAnswer ? '#ef4444' : '#94a3b8'
                              }
                            ]}>
                              <Text style={styles.questionDetailStatusText}>
                                {isCorrect ? '✓' : hasAnswer ? '✗' : '?'}
                              </Text>
                            </View>
                          </View>
                          
                          {/* Question Type Badge */}
                          <View style={styles.questionTypeBadge}>
                            <Text style={styles.questionTypeBadgeText}>
                              {q.type === 'multiple-choice' ? '📝 Multiple Choice' :
                               q.type === 'identification' ? '✏️ Fill in the Blank' :
                               q.type === 'matching' ? '🔗 Matching' :
                               q.type === 're-order' ? '🔢 Re-order' :
                               q.type === 'reading-passage' ? '📖 Reading' : '❓ Question'}
                            </Text>
                          </View>
                          
                          {/* Show question text for identification type */}
                          {q.type === 'identification' && (
                            <View style={styles.questionTextPreview}>
                              <Text style={styles.questionTextPreviewLabel}>Question:</Text>
                              <Text style={styles.questionTextPreviewContent} numberOfLines={3}>
                                {q.question}
                              </Text>
                            </View>
                          )}
                          
                          <View style={styles.questionDetailStats}>
                            <Text style={styles.questionDetailStat}>
                              🎯 {attempts} attempt{attempts !== 1 ? 's' : ''}
                            </Text>
                            <Text style={styles.questionDetailStat}>
                              ⏱️ {formatTime(timeMs)}
                            </Text>
                          </View>
                          {hasAnswer && (
                            <View style={styles.questionAnswerPreview}>
                              <Text style={styles.questionAnswerText}>
                                <Text style={{ fontWeight: '700' }}>Your answer: </Text>
                                {(() => {
                                  if (savedResult) return savedResult.studentAnswer;
                                  if (answer) return serializeAnswer(q, answer.answer);
                                  return 'No answer';
                                })()}
                              </Text>
                              {!isCorrect && (
                                <Text style={[styles.questionAnswerText, { color: '#10b981', marginTop: 4 }]}>
                                  <Text style={{ fontWeight: '700' }}>Correct answer: </Text>
                                  {savedResult ? savedResult.correctAnswer : formatCorrectAnswer(q)}
                                </Text>
                              )}
                            </View>
                          )}
                        </View>
                      );
                    })}
                  </ScrollView>
                </View>

                {/* Close Button */}
                <View style={styles.buttonContainer}>
                  <TouchableOpacity 
                    onPress={() => router.back()} 
                    style={styles.closeResultsButton}
                    activeOpacity={0.8}
                  >
                    <MaterialIcons name="home" size={20} color="#ffffff" />
                    <Text style={styles.closeResultsButtonText}>Back to Home</Text>
                  </TouchableOpacity>
                  
                  {/* Additional Info */}
                  <Text style={styles.submitInfoText}>
                    Your results have been saved and shared with your teacher
                  </Text>
                </View>
              </View>
            </ScrollView>
          </View>
        )}

        {/* Custom Alert Modal */}
        {showAlertModal && (
          <Animated.View
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.7)',
              justifyContent: 'center',
              alignItems: 'center',
              zIndex: 1000,
              opacity: alertAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [0, 1],
              }),
            }}
          >
            <Animated.View
              style={{
                backgroundColor: '#ffffff',
                borderRadius: 20,
                padding: 30,
                margin: 20,
                maxWidth: screenWidth - 80,
                width: screenWidth * 0.8,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 8 },
                shadowOpacity: 0.3,
                shadowRadius: 16,
                elevation: 12,
                transform: [
                  {
                    scale: alertAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.9, 1],
                    }),
                  },
                  {
                    translateY: alertAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [20, 0],
                    }),
                  },
                ],
              }}
            >
              <View style={{ alignItems: 'center', marginBottom: 20 }}>
                <View style={{
                  width: 60,
                  height: 60,
                  borderRadius: 30,
                  backgroundColor: alertConfig.type === 'success' ? '#10b981' : 
                                 alertConfig.type === 'error' ? '#ef4444' : '#ff6b6b',
                  justifyContent: 'center',
                  alignItems: 'center',
                  marginBottom: 15,
                  shadowColor: alertConfig.type === 'success' ? '#10b981' : 
                              alertConfig.type === 'error' ? '#ef4444' : '#ff6b6b',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.3,
                  shadowRadius: 8,
                  elevation: 6,
                }}>
                  <MaterialIcons 
                    name={alertConfig.type === 'success' ? 'check-circle' : 
                          alertConfig.type === 'error' ? 'error' : 'warning'} 
                    size={32} 
                    color="#ffffff" 
                  />
                </View>
                
                <Text style={{
                  fontSize: 20,
                  fontWeight: '800',
                  color: '#1e293b',
                  marginBottom: 10,
                  textAlign: 'center',
                }}>
                  {alertConfig.title}
                </Text>
                
                <Text style={{
                  fontSize: 16,
                  color: '#64748b',
                  textAlign: 'center',
                  lineHeight: 22,
                }}>
                  {alertConfig.message}
                </Text>
              </View>

              <TouchableOpacity
                style={{
                  backgroundColor: alertConfig.type === 'success' ? '#10b981' : 
                                 alertConfig.type === 'error' ? '#ef4444' : '#ff6b6b',
                  borderRadius: 12,
                  paddingVertical: 14,
                  paddingHorizontal: 24,
                  alignItems: 'center',
                  shadowColor: alertConfig.type === 'success' ? '#10b981' : 
                              alertConfig.type === 'error' ? '#ef4444' : '#ff6b6b',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.3,
                  shadowRadius: 8,
                  elevation: 4,
                }}
                onPress={hideCustomAlert}
                activeOpacity={0.8}
              >
                <Text style={{
                  fontSize: 16,
                  fontWeight: '700',
                  color: '#ffffff',
                }}>
                  OK
                </Text>
              </TouchableOpacity>
            </Animated.View>
          </Animated.View>
        )}
      </ImageBackground>
    </View>
  );
}
const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  backgroundImage: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
  },
  loadingText: {
    fontSize: 18,
    color: '#64748b',
    fontWeight: '500',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
  },
  errorText: {
    fontSize: 18,
    color: '#ef4444',
    fontWeight: '500',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: getResponsivePadding(20),
    paddingTop: getResponsiveSize(60),
    paddingBottom: getResponsiveSize(20),
    zIndex: 10,
  },
  headerButton: {
    width: getResponsiveSize(44),
    height: getResponsiveSize(44),
    borderRadius: getResponsiveSize(22),
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  timeLimitBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 165, 0, 0.9)',
    borderRadius: 18,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 16,
    shadowColor: '#ffa500',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#ffa500',
    gap: 6,
    maxWidth: 100,
    alignSelf: 'center',
  },
  timeLimitBadgeWarning: {
    backgroundColor: 'rgba(239, 68, 68, 0.9)',
    borderColor: '#ef4444',
    shadowColor: '#ef4444',
  },
  timeLimitBadgeExpired: {
    backgroundColor: 'rgba(107, 114, 128, 0.9)',
    borderColor: '#6b7280',
    shadowColor: '#6b7280',
  },
  timeLimitBadgeText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
    fontFamily: 'monospace',
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  timeLimitBadgeTextWarning: {
    color: '#ffffff',
    textShadowColor: 'rgba(255, 255, 255, 0.5)',
    textShadowRadius: 3,
  },
  exerciseTitle: {
    fontSize: getResponsiveFontSize(20),
    fontWeight: '700',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: getResponsiveSize(10),
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
    letterSpacing: 0.3,
  },
  progressLabelText: {
    fontSize: 16,
    color: '#ffffff',
    fontWeight: '600',
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
    letterSpacing: 0.2,
  },
  progressContainer: {
    marginHorizontal: getResponsivePadding(20),
    marginBottom: getResponsiveSize(20),
    alignItems: 'center',
  },
  progressBarContainer: {
    width: '100%',
    height: getResponsiveSize(25),
    backgroundColor: '#ffffff',
    borderRadius: getResponsiveSize(12),
    borderWidth: getResponsiveSize(2),
    borderColor: '#ffa500',
    shadowColor: '#ffa500',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
    overflow: 'hidden',
    position: 'relative',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#ffa500',
    borderRadius: 10,
    position: 'absolute',
    top: 0,
    left: 0,
    shadowColor: '#ffa500',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
  progressTextContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
    letterSpacing: 0.3,
  },
  attemptLimitContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    marginHorizontal: 20,
    marginTop: 0,
    marginBottom: 8, // CRITICAL FIX: Add bottom margin to prevent overlap with question type
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
    alignSelf: 'center',
    maxWidth: 200,
  },
  attemptLimitText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
    marginLeft: 4,
  },
  
  // Interactive loading screen styles
  interactiveLoadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: getResponsivePadding(20),
  },
  floatingMathElements: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  mathElement: {
    position: 'absolute',
    width: 80,
    height: 80,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 40,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  mathElement1: {
    top: '10%',
    left: '5%',
  },
  mathElement2: {
    top: '15%',
    right: '8%',
  },
  mathElement3: {
    bottom: '20%',
    left: '10%',
  },
  mathElement4: {
    top: '60%',
    right: '5%',
  },
  mathElement5: {
    bottom: '10%',
    right: '15%',
  },
  mathElementText: {
    fontSize: 24,
  },
  loadingCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 25,
    padding: 30,
    minWidth: 350,
    maxWidth: 450,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 10,
    borderWidth: 2,
    borderColor: '#ffa500',
  },
  loadingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 25,
  },
  loadingIcon: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#ff6b6b',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 20,
    shadowColor: '#ff6b6b',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  loadingIconEmoji: {
    fontSize: 28,
  },
  loadingTitleContainer: {
    flex: 1,
  },
  loadingTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#2d3748',
    marginBottom: 5,
    fontFamily: Platform.OS === 'ios' ? 'LuckiestGuy-Regular' : 'LuckiestGuy-Regular',
  },
  loadingSubtitle: {
    fontSize: 14,
    color: '#4a5568',
    lineHeight: 20,
  },
  progressSection: {
    marginBottom: 25,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  progressTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2d3748',
  },
  progressPercentage: {
    fontSize: 18,
    fontWeight: '800',
    color: '#ffa500',
  },
  loadingProgressBarContainer: {
    width: '100%',
    marginBottom: 10,
  },
  loadingProgressBarBackground: {
    height: 12,
    backgroundColor: '#e2e8f0',
    borderRadius: 6,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#cbd5e0',
  },
  loadingProgressBarFill: {
    height: '100%',
    backgroundColor: '#ffa500',
    borderRadius: 4,
  },
  progressStatus: {
    fontSize: 12,
    color: '#718096',
    textAlign: 'center',
    fontStyle: 'italic',
  },
  interactiveElements: {
    alignItems: 'center',
    marginBottom: 20,
  },
  loadingDotsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 15,
  },
  loadingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#ffa500',
    marginHorizontal: 5,
  },
  ttsCacheStatusContainer: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  ttsCacheStatusText: {
    fontSize: 12,
    color: '#10b981',
    textAlign: 'center',
    fontWeight: '600',
  },
  mathFactsContainer: {
    backgroundColor: 'rgba(255, 165, 0, 0.1)',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 165, 0, 0.3)',
  },
  mathFactText: {
    fontSize: 12,
    color: '#4a5568',
    textAlign: 'center',
    fontStyle: 'italic',
  },
  loadingErrorContainer: {
    backgroundColor: '#fed7d7',
    borderWidth: 2,
    borderColor: '#feb2b2',
    borderRadius: 15,
    padding: 20,
    marginTop: 20,
    width: '100%',
  },
  loadingErrorText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#c53030',
    textAlign: 'center',
    marginBottom: 8,
  },
  errorSubtext: {
    fontSize: 14,
    color: '#9b2c2c',
    textAlign: 'center',
    marginBottom: 15,
  },
  retryButton: {
    backgroundColor: '#4299e1',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  skipButton: {
    backgroundColor: '#ed8936',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginTop: 15,
    alignItems: 'center',
  },
  skipButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  // Kid-Friendly Results Styles
  resultsOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    zIndex: 1000,
  },
  resultsScrollContainer: {
    width: '100%',
    maxWidth: 400,
    maxHeight: '95%',
  },
  resultsScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: 20,
  },
  resultsContainer: {
    backgroundColor: '#ffffff',
    width: '100%',
    borderRadius: 24,
    padding: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 16,
    overflow: 'hidden',
  },
  resultsTopBorder: {
    height: 6,
    backgroundColor: '#4ecdc4',
  },
  resultsHeader: {
    alignItems: 'center',
    marginBottom: 20,
    paddingTop: 24,
    paddingHorizontal: 24,
  },
  celebrationContainer: {
    flexDirection: 'row',
    marginBottom: 16,
    gap: 8,
  },
  scoreBadge: {
    backgroundColor: '#f0f9ff',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginTop: 12,
    borderWidth: 2,
    borderColor: '#0ea5e9',
  },
  scoreBadgeText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0ea5e9',
  },
  resultsTitleEmoji: {
    fontSize: 28,
    marginBottom: 0,
  },
  resultsTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1e293b',
    marginBottom: 8,
    textAlign: 'center',
    lineHeight: 32,
  },
  resultsSubtitle: {
    fontSize: 15,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 8,
    marginBottom: 0,
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
    gap: 12,
    paddingHorizontal: 24,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#e2e8f0',
    minHeight: 100,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
    position: 'relative',
  },
  statCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    position: 'relative',
  },
  statCardAccent: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10b981',
  },
  scoreCard: {
    borderColor: '#fbbf24',
    backgroundColor: '#fffbeb',
  },
  timeCard: {
    borderColor: '#3b82f6',
    backgroundColor: '#eff6ff',
  },
  attemptsCard: {
    borderColor: '#ef4444',
    backgroundColor: '#fef2f2',
  },
  statEmoji: {
    fontSize: 20,
    marginBottom: 0,
  },
  statNumber: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1e293b',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
    fontWeight: '600',
    lineHeight: 16,
  },
  performanceContainer: {
    backgroundColor: '#f8fafc',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#e2e8f0',
    marginHorizontal: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  performanceHeader: {
    alignItems: 'center',
    marginBottom: 12,
  },
  performanceEmoji: {
    fontSize: 28,
    marginBottom: 8,
  },
  performanceStars: {
    flexDirection: 'row',
    gap: 2,
  },
  star: {
    fontSize: 14,
  },
  performanceMessage: {
    fontSize: 14,
    color: '#1e293b',
    textAlign: 'center',
    fontWeight: '700',
    lineHeight: 24,
    paddingHorizontal: 8,
  },
  questionDetailsContainer: {
    marginBottom: 24,
    marginHorizontal: 24,
  },
  questionDetailsTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 12,
    textAlign: 'center',
  },
  questionDetailsScroll: {
    maxHeight: 200,
  },
  buttonContainer: {
    paddingHorizontal: 24,
    paddingBottom: 24,
    alignItems: 'center',
  },
  submitButton: {
    backgroundColor: '#10b981',
    borderRadius: 20,
    paddingVertical: 16,
    paddingHorizontal: 32,
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
    borderWidth: 2,
    borderColor: '#059669',
    width: '100%',
    marginBottom: 12,
  },
  submitButtonDisabled: {
    backgroundColor: '#9ca3af',
    borderColor: '#6b7280',
    shadowColor: '#9ca3af',
  },
  submitButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  submitButtonEmoji: {
    fontSize: 16,
  },
  submitButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  submitInfoText: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
    fontStyle: 'italic',
    paddingHorizontal: 16,
  },
  // Check Answer Button
  checkAnswerButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10b981',
    borderRadius: 20,
    paddingVertical: 18,
    paddingHorizontal: 24,
    gap: 10,
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
    borderWidth: 2,
    borderColor: '#059669',
  },
  checkAnswerButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  // Compact Results Styles
  compactResultsContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 24,
    width: '90%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 12,
  },
  compactResultsHeader: {
    alignItems: 'center',
    marginBottom: 20,
  },
  resultsCelebrationEmoji: {
    fontSize: 36,
    marginBottom: 8,
  },
  compactResultsTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1e293b',
    marginBottom: 12,
  },
  performanceStarsCompact: {
    flexDirection: 'row',
    gap: 4,
  },
  starCompact: {
    fontSize: 16,
  },
  compactStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 20,
    paddingVertical: 16,
    backgroundColor: '#f8fafc',
    borderRadius: 16,
  },
  compactStatItem: {
    alignItems: 'center',
    flex: 1,
  },
  compactStatEmoji: {
    fontSize: 20,
    marginBottom: 8,
  },
  compactStatNumber: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1e293b',
    marginBottom: 4,
  },
  compactStatLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  compactPerformanceMessage: {
    backgroundColor: '#f0f9ff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 2,
    borderColor: '#bfdbfe',
  },
  compactPerformanceText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1e293b',
    textAlign: 'center',
  },
  compactQuestionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 24,
    paddingVertical: 12,
  },
  compactQuestionBadge: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#f8fafc',
    borderWidth: 2,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  compactQuestionNumber: {
    fontSize: 14,
    fontWeight: '700',
    color: '#64748b',
    position: 'absolute',
    top: 4,
    left: 0,
    right: 0,
    textAlign: 'center',
  },
  compactQuestionIcon: {
    fontSize: 16,
    position: 'absolute',
    bottom: 6,
    left: 0,
    right: 0,
    textAlign: 'center',
  },
  closeResultsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4a90e2',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 24,
    gap: 8,
    shadowColor: '#4a90e2',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  closeResultsButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
  },
  questionDetailCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  questionDetailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  questionDetailNumber: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
  },
  questionDetailStatus: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  questionDetailStatusText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  questionDetailStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  questionDetailStat: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '600',
  },
  questionAnswerPreview: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  questionAnswerText: {
    fontSize: 12,
    color: '#64748b',
    fontStyle: 'italic',
  },
  questionTypeBadge: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  questionTypeBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  questionTextPreview: {
    backgroundColor: '#f8fafc',
    padding: 10,
    borderRadius: 8,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#3b82f6',
  },
  questionTextPreviewLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#3b82f6',
    marginBottom: 4,
  },
  questionTextPreviewContent: {
    fontSize: 12,
    color: '#475569',
    lineHeight: 18,
  },
  startNowButton: {
    marginTop: 25,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
  },
  startNowButtonContent: {
    backgroundColor: '#48bb78',
    paddingVertical: 20,
    paddingHorizontal: 40,
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: 3,
    borderColor: '#38a169',
  },
  startNowEmoji: {
    fontSize: 32,
    marginBottom: 8,
  },
  startNowText: {
    fontSize: 24,
    fontWeight: '800',
    color: '#ffffff',
    marginBottom: 4,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  startNowSubtext: {
    fontSize: 14,
    fontWeight: '600',
    color: '#f0fff4',
    textAlign: 'center',
  },
  contentContainer: {
    flex: 1,
    paddingHorizontal: getResponsivePadding(20),
    paddingTop: getResponsiveSize(20),
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: getResponsiveSize(20),
  },
  questionWrapper: {
    flex: 1,
    paddingHorizontal: 8,
    paddingVertical: 12,
  },
  questionImagesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    gap: 8,
    paddingHorizontal: 4,
  },
  questionImagesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
    marginTop: 8,
    paddingHorizontal: 4,
    flexWrap: 'wrap',
  },
  imageRowCenter: {
    justifyContent: 'center',
  },
  imageRowLeft: {
    justifyContent: 'flex-start',
  },
  questionImageThumb: {
    flex: 1,
    minWidth: 70,
    maxWidth: 100,
    aspectRatio: 1,
    borderRadius: 8,
    marginHorizontal: 4,
    marginVertical: 4,
    borderWidth: 2,
    borderColor: 'rgba(124, 58, 237, 0.3)',
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  questionContainer: {
    width: '100%',
    marginBottom: 20,
    paddingHorizontal: 0,
  },
  questionImageContainer: {
    alignItems: 'stretch',
    marginBottom: 12,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginHorizontal: 4,
  },
  questionImageContainerSingle: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  questionImageContainerMultiple: {
    alignItems: 'stretch',
    justifyContent: 'flex-start',
  },
  questionImage: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    backgroundColor: '#f8fafc',
  },
  singleImageCentered: {
    alignSelf: 'center',
  },
  questionImageSmall: {
    flex: 1,
    minWidth: 80,
    maxWidth: 120,
    aspectRatio: 1,
    borderRadius: 8,
    marginHorizontal: 4,
    borderWidth: 2,
    borderColor: 'rgba(124, 58, 237, 0.3)',
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  // Auto-sized square that fills available row when 1-3 images
  questionImageAuto: {
    flex: 1,
    aspectRatio: 1,
    maxWidth: 140,
    minWidth: 90,
    borderRadius: 8,
    marginHorizontal: 4,
    borderWidth: 2,
    borderColor: 'rgba(124, 58, 237, 0.3)',
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  questionText: {
    fontSize: getResponsiveFontSize(15),
    fontWeight: '700',
    color: '#1e293b',
    lineHeight: getResponsiveFontSize(28),
    marginBottom: getResponsiveSize(30),
    marginTop: getResponsiveSize(-15),
    textShadowColor: 'rgba(255, 165, 0, 0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  fillBlankQuestionText: {
    fontWeight: '700',
    color: '#1e293b',
    textShadowColor: 'rgba(255, 165, 0, 0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
    textAlign: 'center',
    lineHeight: 32,
    maxWidth: '90%',
  },
  optionsContainer: {
    gap: getResponsiveSize(10),
  },
  optionsGridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between', // Always space-between for 2 columns
    gap: getResponsiveSize(8), // Smaller gap to ensure 2 columns fit
    paddingHorizontal: 0,
    width: '100%', // Ensure full width
  },
  questionTypeLabel: {
    backgroundColor: '#4a90e2',
    borderRadius: 15,
    paddingHorizontal: 14,
    paddingVertical: 7,
    marginBottom: 10,
    marginTop: 0, // CRITICAL FIX: Reduced negative margin to prevent overlap with attempts card
    alignSelf: 'center',
  },
  questionTypeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#ffffff',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  multipleChoiceOption: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: getResponsiveSize(15),
    padding: getResponsivePadding(12),
    marginBottom: getResponsiveSize(12),
    borderWidth: getResponsiveSize(2),
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    minHeight: getResponsiveSize(60),
  },
  selectedMultipleChoiceOption: {
    backgroundColor: '#4a90e2',
    borderColor: '#4a90e2',
    borderWidth: 3,
    shadowColor: '#4a90e2',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
    transform: [{ scale: 1.02 }],
  },
  optionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  optionLabelContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#ffa500',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  optionLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
  },
  selectedOptionLabel: {
    color: '#ffffff',
  },
  checkIconContainer: {
    position: 'absolute',
    right: 12,
    top: 12,
  },
  optionImage: {
    width: 48,
    height: 48,
    borderRadius: 8,
    marginRight: 12,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: 'rgba(124, 58, 237, 0.2)',
  },
  optionText: {
    flex: 1,
    fontSize: 16,
    color: '#1e293b',
    fontWeight: '600',
    lineHeight: 22,
  },
  selectedOptionText: {
    color: '#ffffff',
    fontWeight: '700',
  },
  multipleChoiceGridOption: {
    backgroundColor: '#10b981', // Solid green color like in the image
    borderRadius: getResponsiveSize(20), // More rounded corners
    padding: getResponsivePadding(12),
    width: '48%', // Always 48% for 2 columns regardless of screen size
    maxWidth: 150, // Prevent too wide on larger screens
    aspectRatio: 1,
    borderWidth: 0, // Remove border for solid look
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    minWidth: 100, // Ensure minimum width for smaller screens
  },
  selectedMultipleChoiceGridOption: {
    backgroundColor: '#059669', // Darker green when selected
    borderColor: '#ffffff',
    borderWidth: getResponsiveSize(3),
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
    transform: [{ scale: 1.05 }],
  },
  gridOptionImage: {
    width: '75%',
    height: '75%',
    borderRadius: 12,
    backgroundColor: '#ffffff',
  },
  gridCheckIconContainer: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 14,
    padding: 2,
  },
  gridOptionLabelContainer: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    backgroundColor: '#ffa500',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    minWidth: 24,
    alignItems: 'center',
  },
  gridOptionLabel: {
    fontSize: getResponsiveFontSize(16),
    fontWeight: '700',
    color: '#ffffff',
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  identificationContainer: {
    marginBottom: 10,
  },
  questionTextContainer: {
    backgroundColor: '#ffffff',
    borderRadius: getResponsiveSize(15),
    padding: getResponsivePadding(20),
    marginBottom: getResponsiveSize(20),
    borderWidth: getResponsiveSize(3),
    borderColor: '#ffa500',
    shadowColor: '#ffa500',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: getResponsiveSize(80),
  },
  characterBoxesContainer: {
    alignItems: 'center',
    marginVertical: 20,
  },
  boxesInstruction: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 18,
    textShadowColor: 'rgba(0, 0, 0, 0.7)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  boxesRow: {
    flexDirection: 'row',
    gap: 15,
    justifyContent: 'center',
    flexWrap: 'wrap',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  characterBox: {
    width: 50,
    height: 50,
    backgroundColor: '#ffffff',
    borderRadius: 10,
    borderWidth: 3,
    borderColor: '#ffa500',
    fontSize: 22,
    fontWeight: '800',
    color: '#1e293b',
    textAlign: 'center',
    textAlignVertical: 'center',
    shadowColor: '#ffa500',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 5,
    letterSpacing: 0.5,
  },
  blanksContainer: {
    gap: 16,
  },
  blankItem: {
    marginBottom: 12,
  },
  adaptiveBoxesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
    marginBottom: 14,
  },
  blankBoxInput: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 18,
    color: '#1e293b',
    borderWidth: 3,
    borderColor: '#ffa500',
    textAlign: 'center',
    textAlignVertical: 'center',
    shadowColor: '#ffa500',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  blankLabel: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 8,
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
 blankInput: {
    backgroundColor: '#ffffff',
    borderRadius: 15,
    padding: 25,
    fontSize: 19,
    color: '#1e293b',
    borderWidth: 4,
    borderColor: '#ffa500',
    minHeight: 80,
    textAlignVertical: 'center',
    shadowColor: '#ffa500',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
    fontWeight: '600',
    textAlign: 'center',
    letterSpacing: 1,
    lineHeight: 26,
  },
  identificationInput: {
    backgroundColor: '#ffffff',
    borderRadius: 15,
    padding: 20,
    fontSize: 20,
    color: '#1e293b',
    borderWidth: 4,
    borderColor: '#ffa500',
    minHeight: 60,
    textAlignVertical: 'center',
    shadowColor: '#ffa500',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
    fontWeight: '600',
    textAlign: 'center',
    letterSpacing: 1,
    lineHeight: 28,
  },
  hintText: {
    fontSize: 14,
    color: '#64748b',
    fontStyle: 'italic',
    marginTop: 8,
  },
  navigationContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 32,
    gap: 16,
  },
  navButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 15,
    padding: 16,
    borderWidth: 2,
    borderColor: '#e2e8f0',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 4,
  },
  disabledNavButton: {
    opacity: 0.5,
    borderColor: '#e2e8f0',
    shadowOpacity: 0,
    elevation: 0,
  },
  navButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
  },
  // TTS button
  ttsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: getResponsiveSize(6),
    backgroundColor: '#ffa500',
    borderRadius: getResponsiveSize(12),
    paddingHorizontal: getResponsivePadding(10),
    paddingVertical: getResponsiveSize(6),
    marginTop: getResponsiveSize(8),
    alignSelf: 'flex-start',
  },
  ttsButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: getResponsiveFontSize(13),
  },
  // Matching question styles
  matchingContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
  },
  matchingGameContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
    marginTop: 16,
    flex: 1,
  },
  matchingColumn: {
    flex: 1,
    alignItems: 'stretch',
  },
  columnHeaderSimple: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  matchingColumnTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
    textShadowColor: 'rgba(255, 165, 0, 0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  matchingProgressContainer: {
    marginBottom: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 20,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  progressBarBackground: {
    height: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
    borderRadius: 6,
    overflow: 'hidden',
    marginBottom: 12,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#4a90e2',
    borderRadius: 6,
    shadowColor: '#4a90e2',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  matchingProgressText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
    textAlign: 'center',
  },
  matchingCompleteContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    padding: 8,
    backgroundColor: '#f0fdf4',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#10b981',
  },
  matchingCompleteText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#10b981',
    marginLeft: 8,
  },
  matchingItem: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: '#ffa500',
    shadowColor: '#ffa500',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
    minHeight: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gameMatchingItem: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 12,
    borderWidth: 3,
    shadowColor: '#ffa500',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
    height: 80, // Fixed height for all boxes
    width: '100%',
    alignSelf: 'stretch',
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  matchingLeft: {
    borderColor: '#ffa500',
  },
  matchingRight: {
    borderColor: '#ffa500',
  },
  selectedMatchingItem: {
    backgroundColor: 'rgba(255, 165, 0, 0.12)',
    borderColor: '#ffa500',
    borderWidth: 4,
    shadowOpacity: 0.35,
    elevation: 6,
    transform: [{ scale: 1.02 }],
  },
  matchingLeftSelected: {
    backgroundColor: '#fff7ed',
    borderColor: '#fb923c',
    borderWidth: 4,
    shadowColor: '#fb923c',
    shadowOpacity: 0.4,
    elevation: 8,
    transform: [{ scale: 1.05 }],
  },
  matchingInstructions: {
    backgroundColor: 'rgba(251, 146, 60, 0.1)',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#fb923c',
    borderStyle: 'dashed',
  },
  matchingInstructionsText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ea580c',
    textAlign: 'center',
  },
  matchingPairBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 12,
    padding: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 3,
  },
  matchingImage: {
    width: 40,
    height: 40,
    borderRadius: 8,
  },
  gameMatchingImage: {
    width: 64,
    height: 64,
    borderRadius: 12,
    marginRight: 0,
    alignSelf: 'center',
    flexShrink: 0,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(124, 58, 237, 0.2)',
  },
  matchingText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
    textAlign: 'center',
  },
  gameMatchingText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1e293b',
    textAlign: 'center',
    flex: 1,
    lineHeight: 17,
    flexWrap: 'wrap',
    maxHeight: 56, // Ensure text fits within the 80px box height minus padding
  },
  gameItemContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    paddingHorizontal: 4,
    height: '100%', // Take full height of the parent box
    minHeight: 56, // Ensure minimum height for content
  },
  matchBadge: {
    backgroundColor: '#4a90e2',
    borderRadius: 20,
    padding: 6,
    marginLeft: 8,
    shadowColor: '#4a90e2',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  // Re-order question styles
  reorderContainer: {
    gap: 12,
  },
  resetButtonContainer: {
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: 24,
  },
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ef4444',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  resetButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 6,
  },
  reorderSlotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    flexWrap: 'nowrap',
    width: '100%',
    paddingHorizontal: getResponsiveSize(4),
    paddingVertical: getResponsiveSize(8),
    marginBottom: getResponsiveSize(8),
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: getResponsiveSize(12),
    gap: getResponsiveSize(4),
  },
  reorderChoicesRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    flexWrap: 'nowrap',
    width: '100%',
    paddingHorizontal: getResponsiveSize(4),
    paddingVertical: getResponsiveSize(8),
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: getResponsiveSize(12),
    gap: getResponsiveSize(4),
  },
  reorderSlotsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 20,
    paddingHorizontal: 8,
    width: '100%',
  },
  reorderInstructions: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(124, 58, 237, 0.3)',
    shadowColor: '#7c3aed',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  reorderInstructionsText: {
    fontSize: 14,
    color: '#64748b',
    marginLeft: 10,
    flex: 1,
    fontWeight: '500',
    lineHeight: 20,
  },
  reorderSlot: {
    flex: 1,
    minWidth: getResponsiveSize(60),
    maxWidth: getResponsiveSize(90),
    height: getResponsiveSize(70),
    marginHorizontal: getResponsiveSize(2),
    borderRadius: getResponsiveSize(12),
    backgroundColor: 'rgba(255, 247, 237, 0.95)',
    borderWidth: getResponsiveSize(2),
    borderStyle: 'dashed',
    borderColor: '#f59e0b',
    shadowColor: '#f59e0b',
    shadowOffset: { width: 0, height: getResponsiveSize(3) },
    shadowOpacity: 0.25,
    shadowRadius: getResponsiveSize(3),
    elevation: 3,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  slotPlaceholder: {
    width: '100%',
    height: '100%',
    borderRadius: 14,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  slotPlaceholderText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#f59e0b',
    textAlign: 'center',
  },
  slotFilledCard: {
    width: '100%',
    height: '100%',
    borderRadius: 14,
    backgroundColor: '#ffffff',
    borderWidth: 2,
    borderColor: '#ffa500',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    shadowColor: '#ffa500',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  removeSlotButton: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
    zIndex: 10,
    padding: 2,
  },
  removeSlotButtonFixed: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 10,
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 4,
    zIndex: 999,
  },
  lockIndicator: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 10,
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#64748b',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 3,
    zIndex: 999,
  },
  statusIndicator: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 10,
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 3,
    zIndex: 10,
  },
  reorderChoicesPool: {
    // kept for compatibility if referenced elsewhere
  },
  reorderResetContainer: {
    alignItems: 'center',
    marginBottom: getResponsiveSize(12),
  },
  reorderResetButton: {
    backgroundColor: '#f59e0b',
    paddingHorizontal: getResponsiveSize(16),
    paddingVertical: getResponsiveSize(8),
    borderRadius: getResponsiveSize(20),
    shadowColor: '#f59e0b',
    shadowOffset: { width: 0, height: getResponsiveSize(2) },
    shadowOpacity: 0.3,
    shadowRadius: getResponsiveSize(4),
    elevation: 3,
  },
  reorderResetButtonText: {
    color: '#ffffff',
    fontSize: getResponsiveFontSize(14),
    fontWeight: '600',
  },
  reorderChoice: {
    flex: 1,
    minWidth: getResponsiveSize(60),
    maxWidth: getResponsiveSize(90),
    height: getResponsiveSize(70),
    marginHorizontal: getResponsiveSize(2),
    borderRadius: getResponsiveSize(12),
    backgroundColor: '#ffffff',
    borderWidth: getResponsiveSize(2),
    borderColor: '#ffa500',
    shadowColor: '#ffa500',
    shadowOffset: { width: 0, height: getResponsiveSize(3) },
    shadowOpacity: 0.25,
    shadowRadius: getResponsiveSize(3),
    elevation: 4,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  dragIndicator: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    backgroundColor: 'rgba(124, 58, 237, 0.8)',
    borderRadius: 8,
    padding: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  reorderChoiceImage: {
    width: '90%',
    height: '90%',
    borderRadius: getResponsiveSize(12),
  },
  reorderChoiceText: {
    fontSize: getResponsiveFontSize(24),
    fontWeight: '700',
    color: '#3b82f6',
    textAlign: 'center',
    flexShrink: 1,
  },
  reorderInstruction: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
    textAlign: 'center',
    marginBottom: 16,
  },
  reorderItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: '#ffa500',
    shadowColor: '#ffa500',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  reorderNumber: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#ffa500',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  reorderNumberText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
  },
  reorderItemText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
  },
  // Reading passage styles
  passageContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 15,
    padding: 20,
    marginBottom: 20,
    borderWidth: 2,
    borderColor: '#ffa500',
    shadowColor: '#ffa500',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  subQuestionCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 15,
    padding: 16,
    borderWidth: 2,
    borderColor: '#ffa500',
    shadowColor: '#ffa500',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 3,
  },
  passageText: {
    fontSize: 16,
    lineHeight: 24,
    color: '#1e293b',
  },
  subQuestionContainer: {
    marginBottom: 20,
  },
  subQuestionTextContainer: {
    marginBottom: 12,
    alignItems: 'center',
  },
  subQuestionImageContainer: {
    alignItems: 'center',
    marginBottom: 10,
  },
  subQuestionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffa500',
    marginBottom: 8,
  },
  subQuestionText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 16,
  },
  subQuestionNavigation: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
    gap: 16,
  },
});