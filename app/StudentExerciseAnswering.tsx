import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useIsFocused } from '@react-navigation/native';
import { AudioSource, AudioStatus, createAudioPlayer } from 'expo-audio';
import { Image as ExpoImage } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Speech from 'expo-speech';
import { useEffect, useRef, useState } from 'react';
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
import { readData, writeData } from '../lib/firebase-database';

// Standalone component for Re-order interaction to keep hooks valid
function ReorderQuestion({
  question,
  initialAnswer,
  onChange,
}: {
  question: Question;
  initialAnswer: ReorderItem[];
  onChange: (ordered: ReorderItem[]) => void;
}) {
  const items: ReorderItem[] = (question.reorderItems || []).map((it) => ({ ...it }));
  const slotsCount = items.length;

  const [initialized, setInitialized] = useState(false);
  const [slotLayouts, setSlotLayouts] = useState<{ x: number; y: number; width: number; height: number }[]>(
    Array(slotsCount).fill(null)
  );
  const [slots, setSlots] = useState<(ReorderItem | null)[]>(Array(slotsCount).fill(null));
  const [pool, setPool] = useState<ReorderItem[]>([]);

  useEffect(() => {
    if (initialized) return;
    if (initialAnswer && initialAnswer.length) {
      const placed: (ReorderItem | null)[] = Array(slotsCount).fill(null);
      initialAnswer.forEach((it, idx) => {
        if (idx < placed.length) placed[idx] = it;
      });
      const remaining = items.filter((it) => !initialAnswer.find((e) => e.id === it.id));
      setSlots(placed);
      setPool(remaining);
    } else {
      const shuffled = [...items].sort(() => Math.random() - 0.5);
      setPool(shuffled);
    }
    setInitialized(true);
  }, [initialized]);

  useEffect(() => {
    if (!initialized) return;
    const ordered = slots.filter(Boolean) as ReorderItem[];
    onChange(ordered);
  }, [slots]);

  const placeIntoSlot = (item: ReorderItem, slotIndex: number) => {
    setSlots((prev) => {
      const next = [...prev];
      const prevAtSlot = next[slotIndex];
      setPool((p) => p.filter((x) => x.id !== item.id));
      next[slotIndex] = item;
      if (prevAtSlot) setPool((p) => [...p, prevAtSlot]);
      return next;
    });
  };

  const removeFromSlot = (slotIndex: number) => {
    setSlots((prev) => {
      const next = [...prev];
      const item = next[slotIndex];
      if (item) setPool((p) => [...p, item]);
      next[slotIndex] = null;
      return next;
    });
  };

  const createPanResponder = (item: ReorderItem) => {
    const position = new Animated.ValueXY();
    const panResponder = {
      position,
      responder: undefined as any,
    } as any;

    const responder = (require('react-native').PanResponder as any).create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        position.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: Animated.event([
        null,
        { dx: position.x, dy: position.y },
      ], { useNativeDriver: false }),
      onPanResponderRelease: (_: any, gesture: any) => {
        position.flattenOffset();
        const dropX = gesture.moveX;
        const dropY = gesture.moveY;
        let target = -1;
        slotLayouts.forEach((r, idx) => {
          if (!r) return;
          const within = dropX >= r.x && dropX <= r.x + r.width && dropY >= r.y && dropY <= r.y + r.height;
          if (within) target = idx;
        });
        if (target >= 0) {
          placeIntoSlot(item, target);
        }
        Animated.spring(position, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
      },
    });
    panResponder.responder = responder;
    return panResponder;
  };

  const Slot = ({ index }: { index: number }) => (
    <TouchableOpacity
      activeOpacity={0.9}
      onLongPress={() => removeFromSlot(index)}
      onLayout={(e) => {
        const { x, y, width, height } = e.nativeEvent.layout;
        setSlotLayouts((prev) => {
          const next = [...prev];
          next[index] = { x: x + 20, y: y + 260, width, height };
          return next;
        });
      }}
      style={styles.reorderSlot}
    >
      {slots[index] ? (
        <View style={styles.slotFilledCard}>
          {slots[index]?.type === 'image' && slots[index]?.imageUrl ? (
            <ExpoImage
              source={{ uri: slots[index]!.imageUrl! }}
              style={styles.reorderChoiceImage}
              contentFit="contain"
              transition={120}
              cachePolicy="disk"
              priority="high"
            />
          ) : (
            <Text style={styles.reorderChoiceText}>{slots[index]?.content}</Text>
          )}
        </View>
      ) : (
        <View style={styles.slotPlaceholder} />
      )}
    </TouchableOpacity>
  );

  const ChoiceCard = ({ item }: { item: ReorderItem }) => {
    const pan = createPanResponder(item);
    return (
      <Animated.View
        style={[styles.reorderChoice, { transform: [{ translateX: pan.position.x }, { translateY: pan.position.y }] }]}
        {...pan.responder.panHandlers}
      >
        {item.type === 'image' && item.imageUrl ? (
          <ExpoImage
            source={{ uri: item.imageUrl }}
            style={styles.reorderChoiceImage}
            contentFit="contain"
            transition={120}
            cachePolicy="disk"
            priority="high"
          />
        ) : (
          <Text style={styles.reorderChoiceText}>{item.content}</Text>
        )}
      </Animated.View>
    );
  };

  return (
    <View>
      <View style={styles.reorderSlotsGrid}>
        {Array.from({ length: slotsCount }).map((_, i) => (
          <Slot key={`slot-${i}`} index={i} />
        ))}
      </View>
      <View style={styles.reorderChoicesPool}>
        {pool.map((choice) => (
          <ChoiceCard key={choice.id} item={choice} />
        ))}
      </View>
    </View>
  );
}

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
  optionMultipleImages?: (string[] | null)[];
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
}

interface StudentAnswer {
  questionId: string;
  answer: string | string[] | {[key: string]: any};
  isCorrect?: boolean;
  timeSpent?: number;
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
  const [currentAnswer, setCurrentAnswer] = useState<string | string[] | {[key: string]: any}>('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
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
  const [reorderAnswers, setReorderAnswers] = useState<{[key: string]: ReorderItem[]}>({});
  const [shuffledPairsCache, setShuffledPairsCache] = useState<{[key: string]: {left: number[]; right: number[]}}>({});
  const prevQuestionIndexRef = useRef<number>(0);
  // Map-level play state (only for direct exercise access, not assigned exercises)
  const levelMode = typeof questionIndex !== 'undefined' && !assignedExerciseId;
  const levelIndex = levelMode ? Math.max(0, parseInt(String(questionIndex as any), 10) || 0) : 0;
  // Attempts and correctness tracking for try-again assessment
  const [attemptCounts, setAttemptCounts] = useState<{[questionId: string]: number}>({});
  const [correctQuestions, setCorrectQuestions] = useState<{[questionId: string]: boolean}>({});
  
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
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [alertConfig, setAlertConfig] = useState({title: '', message: '', type: 'warning', onConfirm: () => {}});
  const alertAnim = useRef(new Animated.Value(0)).current;
  const [attemptLogs, setAttemptLogs] = useState<{[questionId: string]: Array<{answer: string, timeSpent: number, timestamp: number, attemptType: string, hesitationTime: number, isSignificantChange: boolean, questionPhase: string, confidence: string}>}>({});
  
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

  // Layout transitions will be handled by React Native automatically
  
  // Load exercise data
  useEffect(() => {
    loadExercise();
  }, [exerciseId, assignedExerciseId, questionIndex]);
  
  // Timer effect (requestAnimationFrame for smoother and accurate updates)
  useEffect(() => {
    if (!exercise || submitting) {
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
        if (remaining === 0 && !submitting) {
          // Mark current question as failed due to timeout
          const currentQuestion = exercise.questions[currentQuestionIndex];
          if (currentQuestion) {
            const timeoutAnswer: StudentAnswer = {
              questionId: currentQuestion.id,
              answer: '',
              isCorrect: false,
              timeSpent: questionElapsedRef.current,
            };
            
            setAnswers(prev => {
              const existingIndex = prev.findIndex(a => a.questionId === currentQuestion.id);
              if (existingIndex >= 0) {
                const updated = [...prev];
                updated[existingIndex] = timeoutAnswer;
                return updated;
              } else {
                return [...prev, timeoutAnswer];
              }
            });
          }
          
          // Show "Times Up" briefly before advancing
          setTimeout(() => {
            handleNext();
          }, 1500); // Show "Times Up" for 1.5 seconds
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
  }, [exercise, startTime, submitting, questionStartTime]);

  // Keep a ref of the latest per-question elapsed to avoid race conditions during index changes
  useEffect(() => {
    questionElapsedRef.current = questionElapsed;
  }, [questionElapsed]);
  
  // Cleanup timer on unmount
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
        console.warn('Error stopping speech on unmount:', error);
      }
      
      try {
        // Stop and cleanup audio player
        if (currentTTSRef.current) {
          currentTTSRef.current.pause();
          currentTTSRef.current.remove();
        }
        if (currentAudioPlayer) {
          currentAudioPlayer.remove();
        }
      } catch (error) {
        console.warn('Error stopping audio player on unmount:', error);
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
    // Prefetch upcoming images (next two questions) for snappier transitions
    if (exercise) {
      const urls: string[] = [];
      const nextIndex = currentQuestionIndex + 1;
      const nextQ = exercise.questions[nextIndex];
      const nextNextQ = exercise.questions[nextIndex + 1];
      if (nextQ) urls.push(...collectImageUrls(nextQ));
      if (nextNextQ) urls.push(...collectImageUrls(nextNextQ));
      if (urls.length) prefetchUrls(urls);
    }
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
        setAnswers(prev => prev.map(a => a.questionId === prevQid ? { ...a, timeSpent: (a.timeSpent || 0) + delta } : a));
        frozenElapsedRef.current = null;
      }
      prevQuestionIndexRef.current = currentQuestionIndex;
    }
    setQuestionStartTime(Date.now());
    setQuestionElapsed(0);
    
    // Log initial attempt when question is displayed
    if (exercise && exercise.questions[currentQuestionIndex]) {
      const currentQuestion = exercise.questions[currentQuestionIndex];
      const existingAnswer = answers.find(a => a.questionId === currentQuestion.id);
      // Only log initial attempt if there's an actual answer
      if (existingAnswer?.answer && existingAnswer.answer !== '' && existingAnswer.answer !== null) {
        logAttempt(currentQuestion, existingAnswer.answer, 'initial');
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

  // Prefetch helpers to make images load faster without heavy upfront cost
  const collectImageUrls = (q?: Question | null): string[] => {
    if (!q) return [];
    const urls: string[] = [];
    if (q.questionImage) {
      if (Array.isArray(q.questionImage)) {
        urls.push(...q.questionImage.filter(Boolean) as string[]);
      } else {
        urls.push(q.questionImage);
      }
    }
    if (q.questionImages && q.questionImages.length) {
      urls.push(...q.questionImages.filter(Boolean));
    }
    if (q.optionImages && q.optionImages.length) q.optionImages.forEach((u) => { if (u) urls.push(u); });
    if (q.reorderItems && q.reorderItems.length) q.reorderItems.forEach((it) => { if (it.imageUrl) urls.push(it.imageUrl); });
    if (q.pairs && q.pairs.length) q.pairs.forEach((p) => { if (p.leftImage) urls.push(p.leftImage); if (p.rightImage) urls.push(p.rightImage); });
    if (q.subQuestions && q.subQuestions.length) q.subQuestions.forEach((sq) => {
      urls.push(...collectImageUrls(sq as any));
    });
    return urls;
  };

  const prefetchUrls = async (urls: string[]) => {
    try {
      const unique = Array.from(new Set(urls.filter(Boolean)));
      await Promise.all(unique.map((u) => Image.prefetch(u)));
    } catch {
      // ignore prefetch failures (network, etc.)
    }
  };

  // Enhanced image preloading with priority and caching
  const prefetchUrlsWithPriority = async (urls: string[], priority: 'high' | 'normal' | 'low' = 'normal') => {
    if (!urls.length) return;
    
    try {
      const uniqueUrls = [...new Set(urls.filter(Boolean))]; // Remove duplicates and null/undefined
      
      // Cache source objects immediately for faster access
      uniqueUrls.forEach(url => {
        if (!imageCache.has(url)) {
          imageCache.set(url, { uri: url });
        }
      });
      
      // Prioritize critical images
      const criticalCount = priority === 'high' ? 5 : priority === 'normal' ? 3 : 1;
      const criticalImages = uniqueUrls.slice(0, criticalCount);
      const remainingImages = uniqueUrls.slice(criticalCount);
      
      // Load critical images first with higher concurrency
      if (criticalImages.length > 0) {
        const criticalPromises = criticalImages.map(url => {
          return ExpoImage.prefetch(url, {
            cachePolicy: 'disk'
          }).catch(error => {
            console.warn(`Failed to prefetch critical image: ${url}`, error);
          });
        });
        await Promise.allSettled(criticalPromises);
      }
      
      // Load remaining images in smaller chunks to prevent memory issues
      if (remainingImages.length > 0) {
        const batchSize = priority === 'high' ? 3 : priority === 'normal' ? 2 : 1;
        
        for (let i = 0; i < remainingImages.length; i += batchSize) {
          const batch = remainingImages.slice(i, i + batchSize);
          const batchPromises = batch.map(url => {
            return ExpoImage.prefetch(url, {
              cachePolicy: 'disk'
            }).catch(error => {
              console.warn(`Failed to prefetch image: ${url}`, error);
            });
          });
          
          await Promise.allSettled(batchPromises);
          
          // Small delay between batches to prevent overwhelming the system
          if (i + batchSize < remainingImages.length) {
            await new Promise(resolve => setTimeout(resolve, priority === 'low' ? 150 : 100));
          }
        }
      }
    } catch (error) {
      console.warn('Error in prefetchUrlsWithPriority:', error);
    }
  };

  // Image caches for optimization
  const imageCache = new Map<string, any>();
  const backgroundCache = new Map<string, string>();
  const getOptimizedBackground = (imageName: string): string => {
    if (backgroundCache.has(imageName)) {
      return backgroundCache.get(imageName)!;
    }
    const source = getBackgroundSource(imageName);
    backgroundCache.set(imageName, source);
    return source;
  };

  // Optimized Image Component with lazy loading and error handling
  const OptimizedImage = ({ source, style, contentFit = "contain", priority = "normal", lazy = false, ...props }: any) => {
    const [isLoaded, setIsLoaded] = useState(false);
    const [hasError, setHasError] = useState(false);
    const [shouldLoad, setShouldLoad] = useState(!lazy);
    const [retryCount, setRetryCount] = useState(0);

    // For lazy loading, start loading when component mounts
    useEffect(() => {
      if (lazy && !shouldLoad) {
        const timer = setTimeout(() => setShouldLoad(true), 100);
        return () => clearTimeout(timer);
      }
    }, [lazy, shouldLoad]);

    // Reset state when source changes
    useEffect(() => {
      setIsLoaded(false);
      setHasError(false);
      setRetryCount(0);
    }, [source?.uri]);

    const handleError = () => {
      if (retryCount < 2) {
        // Retry loading the image up to 2 times
        setTimeout(() => {
          setRetryCount(prev => prev + 1);
          setHasError(false);
        }, 1000 * (retryCount + 1)); // Exponential backoff
      } else {
        setHasError(true);
        setIsLoaded(true);
        console.warn(`Image failed to load after ${retryCount + 1} attempts:`, source?.uri);
      }
    };

    if (lazy && !shouldLoad) {
      return (
        <View style={[style, { backgroundColor: '#f0f0f0', opacity: 0.3, justifyContent: 'center', alignItems: 'center' }]}>
          {/* Placeholder while loading */}
        </View>
      );
    }

    if (hasError && retryCount >= 2) {
      return (
        <View style={[style, { backgroundColor: '#f8f9fa', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#dee2e6' }]}>
          <Text style={{ color: '#6c757d', fontSize: 12 }}>Image unavailable</Text>
        </View>
      );
    }

    return (
      <ExpoImage
        key={`${source?.uri}-${retryCount}`} // Force re-render on retry
        source={source}
        style={[
          style,
          !isLoaded && { opacity: 0.3 }, // Show loading state
          hasError && retryCount < 2 && { opacity: 0.1 }   // Show retry state
        ]}
        contentFit={contentFit}
        transition={isLoaded ? 120 : 0} // Only animate on successful load
        cachePolicy="memory-disk"
        priority={priority}
        onLoad={() => {
          setIsLoaded(true);
          setHasError(false);
        }}
        onError={handleError}
        {...props}
      />
    );
  };

  // Helpers to present correct answers for all question types
  const subQuestionsLabel = (index: number): string => String(index + 1);
  const getReorderItemLabel = (item?: ReorderItem | null) => {
    if (!item) return '';
    if (item.type === 'image') return item.content || '[image]';
    return item.content;
  };

  // TTS cache and optimization
  const ttsCache = new Map<string, any>();
  const ttsLoadingPromises = new Map<string, Promise<any>>();

  // Preload TTS audio
  const preloadTTS = async (audioUrl: string) => {
    if (!audioUrl || ttsCache.has(audioUrl) || ttsLoadingPromises.has(audioUrl)) {
      return;
    }

    try {
      const loadingPromise = Promise.resolve(createAudioPlayer({ uri: audioUrl }));
      
      ttsLoadingPromises.set(audioUrl, loadingPromise);
      const player = await loadingPromise;
      
      // Cache the player object without playing
      ttsCache.set(audioUrl, player);
      ttsLoadingPromises.delete(audioUrl);
      
    } catch (error) {
      console.warn('Failed to preload TTS:', audioUrl, error);
      ttsLoadingPromises.delete(audioUrl);
    }
  };

  // TTS helpers
  const playTTS = async (audioUrl?: string | null) => {
    try {
      if (!audioUrl) return;
      
      // Always auto-play TTS for all question types and contexts
      
      // CRITICAL: Always stop any existing TTS before starting new one
      stopCurrentTTS();
      
      // Wait for stopping to complete
      await new Promise(resolve => setTimeout(resolve, 200));
      
      setIsLoadingTTS(true);
      const source: AudioSource = { uri: audioUrl };
      const player = createAudioPlayer(source);
      
      // Store in both ref and state
      currentTTSRef.current = player;
      setCurrentAudioPlayer(player);
      setCurrentAudioUri(audioUrl);
      
      player.addListener('playbackStatusUpdate', (status: AudioStatus) => {
        if ('isLoaded' in status && status.isLoaded) {
          if (status.playing) {
            setIsPlayingTTS(true);
            setIsLoadingTTS(false);
          }
          if (status.didJustFinish) {
            setIsPlayingTTS(false);
            setIsLoadingTTS(false);
            try { 
              player.remove(); 
            } catch {}
            currentTTSRef.current = null;
            setCurrentAudioPlayer(null);
            setCurrentAudioUri(null);
          }
        } else if ('error' in status) {
          console.error('TTS playback error:', status.error);
          setIsPlayingTTS(false);
          setIsLoadingTTS(false);
          try { 
            player.remove(); 
          } catch {}
          currentTTSRef.current = null;
          setCurrentAudioPlayer(null);
          setCurrentAudioUri(null);
        }
      });
      
      player.play();
    } catch (error) {
      console.error('TTS playback error:', error);
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
      console.warn('Error stopping speech:', error);
    }

    // Stop the expo-audio player if it exists
    if (currentTTSRef.current) {
      try {
        currentTTSRef.current.pause();
        currentTTSRef.current.remove();
      } catch (error) {
        console.warn('Error stopping audio player:', error);
      }
      currentTTSRef.current = null;
    }
  
    // Reset all states
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

  // Auto-play TTS on question change when available
  useEffect(() => {
    if (!exercise) return;
    const q = exercise.questions[currentQuestionIndex];
    if (!q) return;
    
    // CRITICAL: Stop any previous audio IMMEDIATELY
    stopCurrentTTS();
    
    if (!isFocused) return; // only auto-play when screen is focused
    if (lastAutoPlayedQuestionIdRef.current === q.id) return;
    
    // Always set the last played question ID regardless of whether TTS exists
    lastAutoPlayedQuestionIdRef.current = q.id;
    
    if (q.ttsAudioUrl) {
      // Increased delay to ensure smooth transition between questions
      setTimeout(() => {
        playTTS(q.ttsAudioUrl!);
      }, 800);
    }
  }, [exercise, currentQuestionIndex, isFocused]);

  // Stop any TTS if screen loses focus
  useEffect(() => {
    if (!isFocused) {
      stopCurrentTTS();
    }
  }, [isFocused]);

  const formatCorrectAnswer = (question: Question): string | string[] => {
    if (question.type === 'multiple-choice') {
      if (Array.isArray(question.answer)) {
        const values = (question.answer as string[]).map(t => mapAnswerTokenToOptionValue(question, String(t)));
        const labeled = values.map(v => {
          const letter = getOptionLetterForValue(question, v);
          return letter ? `${letter}. ${v}` : v;
        });
        return labeled.join(', ');
      }
      const v = mapAnswerTokenToOptionValue(question, String(question.answer ?? ''));
      const letter = getOptionLetterForValue(question, v);
      return letter ? `${letter}. ${v}` : v;
    }
    if (question.type === 'identification') {
      // Include alternative answers in the formatted display
      const allAnswers: string[] = [];
      
      // Add main answer(s)
      if (Array.isArray(question.answer)) {
        allAnswers.push(...(question.answer as string[]));
      } else {
        allAnswers.push(String(question.answer ?? ''));
      }
      
      // Add alternative answers if they exist
      if (question.fillSettings?.altAnswers && question.fillSettings.altAnswers.length > 0) {
        allAnswers.push(...question.fillSettings.altAnswers);
      }
      
      // Remove duplicates and return formatted string
      const uniqueAnswers = Array.from(new Set(allAnswers.filter(Boolean)));
      return uniqueAnswers.length > 1 ? uniqueAnswers.join(' OR ') : uniqueAnswers[0] || '';
    }
    if (question.type === 'matching') {
      const pairs = question.pairs || [];
      return pairs.map(p => `${p.left} → ${p.right}`).join('; ');
    }
    if (question.type === 're-order') {
      const ids: string[] = (question.order && question.order.length)
        ? (question.order as string[])
        : (question.reorderItems || []).map(it => it.id);
      if (!ids.length) return '';
      const map = new Map((question.reorderItems || []).map(it => [it.id, it] as const));
      const labels = ids.map(id => getReorderItemLabel(map.get(id) || null));
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
        const arr = (Array.isArray(ans) ? ans : [ans]).filter(Boolean).map(x => String(x));
        const labeled = arr.map(v => {
          const valueText = mapAnswerTokenToOptionValue(question, v);
          const letter = getOptionLetterForValue(question, valueText) || v.toUpperCase();
          return `${letter}. ${valueText}`;
        });
        return labeled.join(', ');
      }
      if (question.type === 'identification') {
        if (Array.isArray(ans)) {
          const nonEmpty = ans.filter(x => x !== '' && x !== null && x !== undefined);
          return nonEmpty.length > 0 ? nonEmpty.map((x) => String(x)).join(', ') : 'No answer';
        }
        const answer = String(ans ?? '');
        return answer.trim() === '' ? 'No answer' : answer;
      }
      if (question.type === 're-order') {
        const ids = Array.isArray(ans) ? ans as string[] : [];
        const map = new Map((question.reorderItems || []).map(it => [it.id, it] as const));
        const labels = ids.map(id => getReorderItemLabel(map.get(id) || null));
        return labels.join(' , ');
      }
      if (question.type === 'matching') {
        return ans && typeof ans === 'object' ? JSON.stringify(ans) : String(ans ?? '');
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

  const logAttempt = (question: Question, ans: any, attemptType: 'initial' | 'change' | 'final' = 'change') => {
    const text = serializeAnswer(question, ans);
    const currentTime = Date.now();
    const timeSpent = currentTime - questionStartTime;
    
    // Calculate hesitation time (time between attempts)
    const previousAttempts = attemptLogs[question.id] || [];
    const lastAttemptTime = previousAttempts.length > 0 ? previousAttempts[previousAttempts.length - 1].timestamp : questionStartTime;
    const hesitationTime = currentTime - lastAttemptTime;
    
    // Determine if this is a significant change or just a minor adjustment
    const isSignificantChange = previousAttempts.length === 0 || 
      (previousAttempts.length > 0 && previousAttempts[previousAttempts.length - 1].answer !== text);
    
    setAttemptLogs(prev => ({
      ...prev,
      [question.id]: [...(prev[question.id] || []), {
        answer: text,
        timeSpent: timeSpent,
        timestamp: currentTime,
        attemptType: attemptType,
        hesitationTime: hesitationTime,
        isSignificantChange: isSignificantChange,
        questionPhase: getQuestionPhase(question, ans), // 'reading', 'thinking', 'answering', 'reviewing'
        confidence: estimateConfidence(question, ans, timeSpent, previousAttempts.length + 1)
      }],
    }));
  };

  const loadExercise = async () => {
    try {
      setLoading(true);
      
      // Set random background with optimization
      const bgImage = getRandomBackground();
      setBackgroundImage(bgImage);
      
      // Preload background image
      try {
        const bgUrl = getOptimizedBackground(bgImage);
        prefetchUrlsWithPriority([bgUrl], 'high');
      } catch (error) {
        console.warn('Failed to preload background:', error);
      }
      
      // Always enable TTS autoplay for all contexts
      
      // Get parent ID and find associated student ID
      let parentId: string | null = null;
      let studentId: string | null = null;
      try {
        const loginCode = await AsyncStorage.getItem('parent_key');
        console.log('Debug - Login code from AsyncStorage:', loginCode);
        
        if (loginCode) {
          // Resolve login code to actual parent ID
          const parentIdResult = await readData(`/parentLoginCodes/${loginCode}`);
          console.log('Debug - Parent ID resolution result:', parentIdResult);
          
          if (parentIdResult.data) {
            parentId = parentIdResult.data;
            console.log('Debug - Resolved parentId:', parentId);
            
            // Find the student associated with this parent
            const studentsData = await readData('/students');
            if (studentsData.data) {
              const student = Object.values(studentsData.data).find((s: any) => s.parentId === parentId) as any;
              console.log('Debug - Found student:', student);
              
              if (student && student.studentId) {
                studentId = student.studentId;
                console.log('Debug - Final studentId:', studentId);
                
                // Store student ID in AsyncStorage for future use
                if (studentId) {
                  await AsyncStorage.setItem('student_id', studentId);
                }
              }
            }
          } else {
            console.warn('Debug - No parent ID found for login code:', loginCode);
          }
        }
      } catch (error) {
        console.warn('Could not get parent key or student ID:', error);
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
        
        // Validate assigned exercise has required fields
        // Note: assigned exercises may not have title/teacherId directly - they reference the exercise
        if (!assignedData.createdAt) {
          console.error('Invalid assigned exercise data structure:', assignedData);
          showCustomAlert('Error', 'Invalid assigned exercise data - missing required fields', () => router.back(), 'error');
          return;
        }
        
        // Validate that the assignment is properly linked to a student or class
        if (!assignedData.studentId && !assignedData.parentId && !assignedData.classId) {
          console.error('Assigned exercise not linked to any student or class:', assignedData);
          showCustomAlert('Error', 'This assignment is not properly linked to a student or class', () => router.back(), 'error');
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
          
          // Validate exercise matches assignment metadata
          // Note: Assigned exercises reference exercises by ID, so we validate the reference exists
          if (result.data.id !== actualExerciseId) {
            console.warn('Exercise ID mismatch:', { expectedId: actualExerciseId, actualId: result.data.id });
          }
          
          // Log exercise metadata for debugging
          console.log('Loaded exercise metadata:', {
            title: result.data.title,
            teacherId: result.data.teacherId,
            questionCount: result.data.questions?.length || 0
          });
          
          // Validate question structure and data integrity
          const questions: Question[] = result.data.questions;
          for (let i = 0; i < questions.length; i++) {
            const q = questions[i];
            if (!q.id || !q.type || !q.question || q.answer === undefined) {
              console.error(`Invalid question structure at index ${i}:`, q);
              showCustomAlert('Error', `Invalid question data found in exercise`, () => router.back(), 'error');
              return;
            }
            
            // Validate question-specific data
            if (q.type === 'multiple-choice' && (!q.options || q.options.length === 0)) {
              console.error(`Multiple choice question missing options at index ${i}:`, q);
              showCustomAlert('Error', `Multiple choice question missing options`, () => router.back(), 'error');
              return;
            }
            
            if (q.type === 'matching' && (!q.pairs || q.pairs.length === 0)) {
              console.error(`Matching question missing pairs at index ${i}:`, q);
              showCustomAlert('Error', `Matching question missing pairs`, () => router.back(), 'error');
              return;
            }
            
            if (q.type === 're-order' && (!q.reorderItems || q.reorderItems.length === 0)) {
              console.error(`Reorder question missing items at index ${i}:`, q);
              showCustomAlert('Error', `Reorder question missing items`, () => router.back(), 'error');
              return;
            }
            
            // Validate sub-questions for reading passages
            if (q.type === 'reading-passage' && q.subQuestions) {
              for (let j = 0; j < q.subQuestions.length; j++) {
                const sq = q.subQuestions[j];
                if (!sq.id || !sq.type || !sq.question || sq.answer === undefined) {
                  console.error(`Invalid sub-question structure at index ${i}-${j}:`, sq);
                  showCustomAlert('Error', `Invalid sub-question data found`, () => router.back(), 'error');
                  return;
                }
              }
            }
          }
          
          setExercise({
            ...result.data,
            id: actualExerciseId,
          });
          // Warm cache for first questions (current and next two)
          try {
            const questions: Question[] = result.data.questions || [];
            const batchUrls: string[] = [];
            const startIdx = levelMode ? levelIndex : 0;
            for (let i = startIdx; i < Math.min(questions.length, startIdx + 3); i++) {
              batchUrls.push(...collectImageUrls(questions[i]));
            }
            if (batchUrls.length) {
              // Prefetch current and next questions with high priority
              const currentAndNext = batchUrls.slice(0, Math.min(batchUrls.length, 10));
              const remaining = batchUrls.slice(10);
              
              // High priority for current and next questions
              prefetchUrlsWithPriority(currentAndNext, 'high');
              
              // Low priority for remaining questions
              if (remaining.length) {
                prefetchUrlsWithPriority(remaining, 'low');
              }
            }
          } catch {}
          if (levelMode) {
            setCurrentQuestionIndex(levelIndex);
          }
          // Initialize answers array (including nested sub-answers for reading-passage)
          setAnswers(result.data.questions.map((q: Question) => ({
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
          })));
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
          
          setExercise({
            ...result.data,
            id: exerciseId as string,
          });
          // Warm cache for first questions (current and next two)
          try {
            const questions: Question[] = result.data.questions || [];
            const batchUrls: string[] = [];
            const startIdx = levelMode ? levelIndex : 0;
            for (let i = startIdx; i < Math.min(questions.length, startIdx + 3); i++) {
              batchUrls.push(...collectImageUrls(questions[i]));
            }
            if (batchUrls.length) {
              // Prefetch current and next questions with high priority
              const currentAndNext = batchUrls.slice(0, Math.min(batchUrls.length, 10));
              const remaining = batchUrls.slice(10);
              
              // High priority for current and next questions
              prefetchUrlsWithPriority(currentAndNext, 'high');
              
              // Low priority for remaining questions
              if (remaining.length) {
                prefetchUrlsWithPriority(remaining, 'low');
              }
            }
          } catch {}
          if (levelMode) {
            setCurrentQuestionIndex(levelIndex);
          }
          // Initialize answers array (including nested sub-answers for reading-passage)
          setAnswers(result.data.questions.map((q: Question) => ({
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
          })));
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
      
      // Calculate correctness and update answers array
      const isCorrect = isAnswerCorrect(currentQuestion, answer);
      
      setAnswers(prev => prev.map(a => 
        a.questionId === currentQuestion.id 
          ? { ...a, answer, isCorrect }
          : a
      ));
      
      // Update correct questions tracking
      setCorrectQuestions(prev => ({ ...prev, [currentQuestion.id]: isCorrect }));
    }
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
    setAnswers(prev => prev.map(a => {
      if (a.questionId !== parentId) return a;
      const base = (a.answer && typeof a.answer === 'object' && !Array.isArray(a.answer)) ? { ...(a.answer as {[key: string]: any}) } : {};
      base[subId] = value;
      
      // Calculate correctness for sub-questions if we have the exercise data
      if (exercise) {
        const parentQuestion = exercise.questions.find(q => q.id === parentId);
        if (parentQuestion && parentQuestion.type === 'reading-passage' && parentQuestion.subQuestions) {
          const subQuestion = parentQuestion.subQuestions.find(sq => sq.id === subId);
          if (subQuestion) {
            const isSubCorrect = isAnswerCorrect(subQuestion, value);
            // Update correct questions tracking for sub-questions
            setCorrectQuestions(prev => ({ ...prev, [subId]: isSubCorrect }));
          }
        }
      }
      
      return { ...a, answer: base };
    }));
  };
  
  const handleNext = () => {
    if (!exercise) return;
    const q = exercise.questions[currentQuestionIndex];
    const currentAns = answers.find(a => a.questionId === q.id)?.answer;
    const correct = isAnswerCorrect(q, currentAns);
    if (!correct) {
      setAttemptCounts(prev => ({ ...prev, [q.id]: (prev[q.id] || 0) + 1 }));
      logAttempt(q, currentAns, 'change');
      // Trigger global shake for non-selectable types
      Animated.sequence([
        Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 6, duration: 50, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: -6, duration: 50, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
      ]).start();
      triggerWrongFeedback();
      showCustomAlert('Try again', 'That is not correct yet. Please try again.', undefined, 'warning');
      return;
    }
    
    // Stop TTS immediately when answer is correct
    stopCurrentTTS();
    
    setCorrectQuestions(prev => ({ ...prev, [q.id]: true }));
    // Count the final successful attempt
    setAttemptCounts(prev => ({ ...prev, [q.id]: (prev[q.id] || 0) + 1 }));
    // Log the successful attempt as well
    logAttempt(q, currentAns, 'final');
    triggerCorrectFeedback(() => advanceToNextOrFinish());
  };

  const advanceToNextOrFinish = () => {
    if (!exercise) return;
    // Do not accumulate here; index-change effect handles accumulation centrally
    // Stop TTS if playing when moving forward
    stopCurrentTTS();
    if (currentQuestionIndex < (exercise.questions.length || 0) - 1) {
      const nextIndex = currentQuestionIndex + 1;
      setCurrentQuestionIndex(nextIndex);
      const nextQuestion = exercise.questions[nextIndex];
      if (nextQuestion) {
        const existingAnswer = answers.find(a => a.questionId === nextQuestion.id);
        setCurrentAnswer(existingAnswer?.answer || (nextQuestion.type === 'multiple-choice' ? [] : nextQuestion.type === 'matching' ? {} : nextQuestion.type === 're-order' ? [] : ''));
      }
    } else {
      // Finishing: accumulate the current question's elapsed time before stopping
      const qid = exercise.questions[currentQuestionIndex].id;
      const delta = (frozenElapsedRef.current ?? questionElapsedRef.current);
      setAnswers(prev => prev.map(a => a.questionId === qid ? { ...a, timeSpent: (a.timeSpent || 0) + delta } : a));
      frozenElapsedRef.current = null;
      if (timerInterval) {
        clearInterval(timerInterval);
        setTimerInterval(null);
      }
      setShowResults(true);
    }
  };

  const triggerCorrectFeedback = (onComplete?: () => void) => {
    // CRITICAL: Stop TTS immediately when answer is correct
    stopCurrentTTS();
    
    // Freeze UI timer at the moment of correctness; used when recording
    frozenElapsedRef.current = questionElapsedRef.current;
    setShowCorrect(true);
    correctAnim.setValue(0);
    Animated.timing(correctAnim, { toValue: 1, duration: 180, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(() => {
      setTimeout(() => {
        Animated.timing(correctAnim, { toValue: 0, duration: 180, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(() => {
          setShowCorrect(false);
          onComplete && onComplete();
        });
      }, 500);
    });
  };
  
  const triggerWrongFeedback = () => {
    setShowWrong(true);
    wrongAnim.setValue(0);
    Animated.timing(wrongAnim, { toValue: 1, duration: 180, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(() => {
      setTimeout(() => {
        Animated.timing(wrongAnim, { toValue: 0, duration: 180, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(() => {
          setShowWrong(false);
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
  const stripAccents = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '');
  const normalizeWithSettings = (s: any, settings?: Question['fillSettings']) => {
    let out = normalize(s, !!settings?.caseSensitive);
    if (settings?.ignoreAccents) out = stripAccents(out);
    return out;
  };
  const letterToIndex = (letter: string) => {
    const upper = letter.trim().toUpperCase();
    if (upper.length !== 1) return -1;
    const code = upper.charCodeAt(0) - 65; // 'A' -> 0
    return code >= 0 && code <= 25 ? code : -1;
  };
  const mapAnswerTokenToOptionValue = (question: Question, token: string) => {
    if (!question.options || !question.options.length) return token;
    
    // First, check if the token is already an option value
    const normalizedToken = normalize(token);
    const matchingOption = question.options.find(opt => normalize(opt) === normalizedToken);
    if (matchingOption) {
      return matchingOption;
    }
    
    // If not found, try to map as a letter (A, B, C, D)
    const idx = letterToIndex(token);
    if (idx >= 0 && idx < question.options.length) return question.options[idx];
    
    // Return the original token if no mapping found
    return token;
  };

  // Robust helper: compute expected correct option indices from saved answer
  const getExpectedOptionIndices = (question: Question): number[] => {
    try {
      const options = question.options || [];
      const expectedRaw = question.answer;
      const toIndex = (token: string): number => {
        // 1) Letter like 'A','B','C','D'
        const li = letterToIndex(token);
        if (li >= 0 && li < options.length) return li;
        // 2) Numeric string index "0".."n" or 1-based "1".."n"
        const n = Number(token);
        if (!Number.isNaN(n)) {
          if (n >= 0 && n < options.length) return n; // zero-based
          if (n > 0 && n-1 < options.length) return n-1; // one-based
        }
        // 3) Match option text directly
        const norm = normalize(token);
        const idx = options.findIndex(opt => normalize(opt) === norm);
        return idx; // -1 if not found
      };
      if (Array.isArray(expectedRaw)) {
        const arr = (expectedRaw as string[]).map(x => toIndex(String(x))).filter(i => i >= 0);
        return arr;
      }
      const single = toIndex(String(expectedRaw));
      return single >= 0 ? [single] : [];
    } catch {
      return [];
    }
  };

  const indexToLetter = (index: number) => String.fromCharCode(65 + index);
  const getOptionLetterForValue = (question: Question, value: string): string => {
    if (!question.options || !question.options.length) return '';
    const normValue = normalize(value);
    const idx = question.options.findIndex(opt => normalize(opt) === normValue);
    return idx >= 0 ? indexToLetter(idx) : '';
  };

  const isOptionIndexCorrect = (question: Question, optionIndex: number): boolean => {
    const expected = getExpectedOptionIndices(question);
    if (!expected.length) return false;
    return expected.includes(optionIndex);
  };

  const isAnswerCorrect = (question: Question, ans: any): boolean => {
    try {
      if (question.type === 'multiple-choice') {
        // Normalize both expected and given; support letter-based keys (A,B,C...)
        const expectedRaw = question.answer;
        if (Array.isArray(expectedRaw)) {
          const expectedValues = (expectedRaw as string[]).map(t => mapAnswerTokenToOptionValue(question, String(t)));
          const givenValues = (Array.isArray(ans) ? ans : [ans]).map(t => mapAnswerTokenToOptionValue(question, String(t)));
          const normExpected = expectedValues.map(v => normalize(v));
          const normGiven = givenValues.map(v => normalize(v));
          normExpected.sort();
          normGiven.sort();
          return normExpected.length === normGiven.length && normExpected.every((v, i) => v === normGiven[i]);
        }
        const expectedValue = mapAnswerTokenToOptionValue(question, String(expectedRaw));
        const givenValue = mapAnswerTokenToOptionValue(question, String(ans));
        return normalize(givenValue) === normalize(expectedValue);
      }
      if (question.type === 'identification') {
        const norm = (s: any) => normalizeWithSettings(s, question.fillSettings);
        
        // Get all possible correct answers (main answer + alternative answers)
        const getAllCorrectAnswers = () => {
          const correctAnswers: string[] = [];
          
          // Add main answer
          if (Array.isArray(question.answer)) {
            correctAnswers.push(...(question.answer as string[]));
          } else {
            correctAnswers.push(String(question.answer || ''));
          }
          
          // Add alternative answers from fillSettings
          if (question.fillSettings?.altAnswers && question.fillSettings.altAnswers.length > 0) {
            correctAnswers.push(...question.fillSettings.altAnswers);
          }
          
          return correctAnswers;
        };
        
        if (Array.isArray(question.answer)) {
          const arr = Array.isArray(ans) ? ans : [];
          const allCorrectAnswers = getAllCorrectAnswers();
          
          // For array answers, check each position
          return (question.answer as string[]).every((expectedAnswer, i) => {
            const studentAnswer = String(arr[i] || '');
            const normalizedStudentAnswer = norm(studentAnswer);
            
            // Check against main answer and all alternatives
            return allCorrectAnswers.some(correctAnswer => {
              const normalizedCorrectAnswer = norm(String(correctAnswer || ''));
              return normalizedStudentAnswer === normalizedCorrectAnswer;
            });
          });
        }
        
        // For single answer, check against main answer and all alternatives
        const studentAnswer = norm(String(ans || ''));
        const allCorrectAnswers = getAllCorrectAnswers();
        
        return allCorrectAnswers.some(correctAnswer => {
          const normalizedCorrectAnswer = norm(String(correctAnswer || ''));
          return studentAnswer === normalizedCorrectAnswer;
        });
      }
      if (question.type === 're-order') {
        const expected: string[] = (question.order && question.order.length)
          ? (question.order as string[])
          : (question.reorderItems || []).map(it => it.id);
        const given = Array.isArray(ans) ? ans : [];
        return expected.length === given.length && expected.every((v, i) => v === given[i]);
      }
      if (question.type === 'matching') {
        // For now, consider matching correct if student's mapping pairs left->right matches the saved pairs order.
        // Expected is an array of pairs; student's ans should be an object mapping keys; this implementation may need alignment with UI answer format.
        // If no answer object, treat as incorrect.
        const pairs = question.pairs || [];
        const selections = ans && typeof ans === 'object' ? ans as {[k: string]: any} : {};
        // Expect selections in the form { 'left-<i>': 'left-<i>', 'right-<j>': 'right-<j>' } pairs are not yet linked in UI
        // For correctness, require all left and right have been chosen and that their indices match by position
        const leftChosen = Object.keys(selections).filter(k => k.startsWith('left-')).map(k => parseInt(k.split('-')[1], 10)).sort((a,b)=>a-b);
        const rightChosen = Object.keys(selections).filter(k => k.startsWith('right-')).map(k => parseInt(k.split('-')[1], 10)).sort((a,b)=>a-b);
        const complete = leftChosen.length === pairs.length && rightChosen.length === pairs.length;
        // With current UI, we cannot map which left matches which right; treat completion as correctness for now
        return complete && pairs.length > 0;
      }
      // Multiple-choice explicit check using indices (single or multi answer)
      if ((question as any).type === 'multiple-choice') {
        const expected = getExpectedOptionIndices(question);
        if (!expected.length) return false;
        if (Array.isArray(ans)) {
          const givenIdxs = (ans as string[]).map(v => {
            const idx = (question.options || []).findIndex(opt => normalize(opt) === normalize(String(v)));
            return idx;
          }).filter(i => i >= 0).sort();
          const expectedSorted = [...expected].sort();
          return givenIdxs.length === expectedSorted.length && expectedSorted.every((v,i)=>v===givenIdxs[i]);
        }
        const singleIdx = (question.options || []).findIndex(opt => normalize(opt) === normalize(String(ans)));
        return expected.includes(singleIdx);
      }
      return false;
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
      try {
        parentId = await AsyncStorage.getItem('parent_key');
        studentId = await AsyncStorage.getItem('student_id');
        
        // If student ID is not found, try to find it again
        if (!studentId && parentId) {
          const studentsData = await readData('/students');
          if (studentsData.data) {
            const student = Object.values(studentsData.data).find((s: any) => s.parentId === parentId) as any;
            if (student && student.studentId) {
              studentId = student.studentId;
              if (studentId) {
                await AsyncStorage.setItem('student_id', studentId);
              }
            }
          }
        }
      } catch (error) {
        console.warn('Could not get parent key or student ID from storage:', error);
      }

      // Calculate final answers with time spent
      let finalAnswers = answers;
      if (exercise) {
        const currentQid = exercise.questions[currentQuestionIndex].id;
        const currentDelta = Date.now() - questionStartTime;
        finalAnswers = answers.map(a => ({
          ...a,
          timeSpent: a.questionId === currentQid ? (a.timeSpent || 0) + currentDelta : (a.timeSpent || 0),
        }));
      }

      // Calculate results
      const correctAnswers = finalAnswers.filter(answer => answer.isCorrect).length;
      const totalQuestions = exercise?.questions.length || 0;
      const scorePercentage = totalQuestions > 0 ? Math.round((correctAnswers / totalQuestions) * 100) : 0;
      const totalAttempts = Object.values(attemptCounts).reduce((sum, v) => sum + (v || 0), 0);
      
      // Create normalized result record with unique ID
      const resultId = `${exercise?.id || exerciseId}_${parentId || 'anonymous'}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Debug logging
      console.log('Recording exercise result with:', {
        parentId,
        studentId,
        resultId,
        exerciseId
      });
      
      if (!parentId) {
        console.warn('No parentId found - exercise result may not be properly tracked');
      }
      
      const resultData = {
        // Core identifiers
        resultId,
        exerciseId: exercise?.id || exerciseId as string, // Use the actual loaded exercise ID
        assignedExerciseId: assignedExerciseId as string || null, // Reference to assigned exercise if applicable
        parentId, // Parent ID for linking to parent account
        studentId, // Student ID for tracking individual student performance
        
        // Exercise metadata
        exerciseTitle: exercise?.title || 'Unknown Exercise',
        classId: assignedExercise?.classId || (exercise as any)?.classId || null,
        teacherId: assignedExercise?.assignedBy || (exercise as any)?.teacherId || null,
        
        // Performance metrics
        scorePercentage,
        totalQuestions,
        totalTimeSpent: elapsedTime,
        
        // Submission info
        submittedAt: new Date().toISOString(),
        deviceInfo: {
          platform: Platform.OS,
          timestamp: Date.now()
        },
        
        // Assignment-specific metadata (if applicable)
        assignmentMetadata: assignedExercise ? {
          assignedAt: assignedExercise.createdAt,
          deadline: assignedExercise.deadline,
          isLateSubmission: assignedExercise.deadline ? (() => {
            try {
              const deadlineDate = new Date(assignedExercise.deadline);
              return !isNaN(deadlineDate.getTime()) && new Date() > deadlineDate;
            } catch {
              return false;
            }
          })() : false,
          acceptingStatus: assignedExercise.acceptingStatus,
          acceptLateSubmissions: assignedExercise.acceptLateSubmissions || false,
          assignmentId: assignedExerciseId
        } : null,
        
        // Student context and exercise metadata
        studentContext: {
          gradeLevel: 'Grade 1', // Could be dynamic based on student data
          exerciseSequence: currentQuestionIndex + 1, // Current position in exercise
          totalQuestions: exercise?.questions.length || 0,
          completionRate: ((currentQuestionIndex + 1) / (exercise?.questions.length || 1)) * 100,
          sessionStartTime: startTime,
          sessionDuration: elapsedTime
        },
        
        // Exercise metadata
        exerciseMetadata: {
          title: exercise?.title || '',
          description: exercise?.description || '',
          subject: 'Mathematics', // Default subject
          difficulty: 'medium', // Default difficulty
          totalQuestions: exercise?.questions.length || 0,
          questionTypes: exercise?.questions.map(q => q.type) || [],
          estimatedDuration: 0, // Default duration
          learningObjectives: [] // Default empty array
        },
        
        // Detailed question data (normalized)
        questionResults: exercise?.questions.map((q, idx) => {
          const metadata = getQuestionMetadata(q);
          const questionAttempts = attemptLogs[q.id] || [];
          const totalHesitationTime = questionAttempts.reduce((sum, attempt) => sum + (attempt.hesitationTime || 0), 0);
          const averageConfidence = questionAttempts.length > 0 ? 
            questionAttempts.reduce((sum, attempt) => {
              const confValue = attempt.confidence === 'high' ? 3 : attempt.confidence === 'medium' ? 2 : 1;
              return sum + confValue;
            }, 0) / questionAttempts.length : 2;
          
          return {
            questionId: q.id,
            questionNumber: idx + 1,
            questionType: q.type,
            questionText: q.question || '',
            questionImage: q.questionImage || null,
            options: q.options || [],
            isCorrect: finalAnswers.find(a => a.questionId === q.id)?.isCorrect || false,
            timeSpent: getTimeMsForQuestion(q),
            attempts: attemptCounts[q.id] || 1,
            studentAnswer: finalAnswers.find(a => a.questionId === q.id)?.answer || '',
            correctAnswer: formatCorrectAnswer(q),
            attemptHistory: questionAttempts.map(attempt => ({
              ...attempt,
              hesitationTime: attempt.hesitationTime || 0,
              isSignificantChange: attempt.isSignificantChange || false
            })),
            
            // Enhanced metadata for better analysis
            metadata: metadata,
            totalHesitationTime: totalHesitationTime,
            averageConfidence: averageConfidence,
            significantChanges: questionAttempts.filter(attempt => attempt.isSignificantChange).length,
            phaseDistribution: {
              reading: questionAttempts.filter(attempt => attempt.questionPhase === 'reading').length,
              thinking: questionAttempts.filter(attempt => attempt.questionPhase === 'thinking').length,
              answering: questionAttempts.filter(attempt => attempt.questionPhase === 'answering').length,
              reviewing: questionAttempts.filter(attempt => attempt.questionPhase === 'reviewing').length
            },
            
            // Interaction tracking data
            interactions: (interactionLogs[q.id] || []).map(interaction => ({
              ...interaction,
              duration: interaction.duration || 0 // Ensure no undefined values
            })),
            helpUsage: helpUsage[q.id] || {ttsCount: 0, helpButtonClicks: 0},
            optionHoverTimes: optionHoverTimes[q.id] || {},
            totalInteractions: (interactionLogs[q.id] || []).length,
            interactionTypes: {
              optionClicks: (interactionLogs[q.id] || []).filter(i => i.type === 'option_click').length,
              helpUsed: (interactionLogs[q.id] || []).filter(i => i.type === 'help_used').length,
              answerChanges: (interactionLogs[q.id] || []).filter(i => i.type === 'answer_change').length
            },
            
            // Granular time tracking
            timeBreakdown: {
              totalTime: getTimeMsForQuestion(q),
              readingTime: questionAttempts.filter(attempt => attempt.questionPhase === 'reading').reduce((sum, attempt) => sum + (attempt.timeSpent || 0), 0),
              thinkingTime: questionAttempts.filter(attempt => attempt.questionPhase === 'thinking').reduce((sum, attempt) => sum + (attempt.timeSpent || 0), 0),
              answeringTime: questionAttempts.filter(attempt => attempt.questionPhase === 'answering').reduce((sum, attempt) => sum + (attempt.timeSpent || 0), 0),
              reviewingTime: questionAttempts.filter(attempt => attempt.questionPhase === 'reviewing').reduce((sum, attempt) => sum + (attempt.timeSpent || 0), 0),
              averageTimePerAttempt: questionAttempts.length > 0 ? getTimeMsForQuestion(q) / questionAttempts.length : 0,
              timeToFirstAnswer: questionAttempts.length > 0 ? (questionAttempts[0].timeSpent || 0) : 0,
              timeToFinalAnswer: questionAttempts.length > 0 ? (questionAttempts[questionAttempts.length - 1].timeSpent || 0) : 0
            }
          };
        }) || []
      };
      
      // Save to normalized ExerciseResults table
      const exerciseResult = await writeData(`/ExerciseResults/${resultId}`, resultData);
      if (!exerciseResult.success) {
        throw new Error(`Failed to save exercise result: ${exerciseResult.error}`);
      }
      
      // Mark assigned exercise as completed if it exists
      if (assignedExerciseId && parentId) {
        try {
          const assignedExerciseData = await readData(`/assignedExercises/${assignedExerciseId}`);
          if (assignedExerciseData.data) {
            const updatedAssignedExercise = {
              ...assignedExerciseData.data,
              completedAt: new Date().toISOString(),
              status: 'completed',
              resultId: resultId,
              scorePercentage: scorePercentage,
              totalTimeSpent: elapsedTime
            };
            await writeData(`/assignedExercises/${assignedExerciseId}`, updatedAssignedExercise);
            console.log('Marked assigned exercise as completed:', assignedExerciseId);
          }
        } catch (error) {
          console.warn('Could not update assigned exercise completion status:', error);
        }
      }
      
      // Close results panel and navigate back
      setShowResults(false);
      router.back();
      
    } catch (error: any) {
      console.error('Failed to submit final answers:', error);
      showCustomAlert('Error', `Failed to submit answers: ${error.message || error}. Please try again.`, undefined, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    try {
      setSubmitting(true);
      
      // Stop timer
      if (timerInterval) {
        clearInterval(timerInterval);
        setTimerInterval(null);
      }
      // Stop any TTS during submit
      stopCurrentTTS();
      
      // Validate last question on submit and show feedback
      if (exercise) {
        const q = exercise.questions[currentQuestionIndex];
        const currentAns = answers.find(a => a.questionId === q.id)?.answer;
        const correct = isAnswerCorrect(q, currentAns);
        
        if (!correct) {
          setAttemptCounts(prev => ({ ...prev, [q.id]: (prev[q.id] || 0) + 1 }));
          // Log the incorrect attempt for the last question
          logAttempt(q, currentAns, 'change');
          // Shake on submit when wrong
          Animated.sequence([
            Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: 6, duration: 50, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: -6, duration: 50, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
          ]).start();
          triggerWrongFeedback();
          showCustomAlert('Incorrect Answer', 'Your current answer is not correct yet. Please try again.', undefined, 'warning');
          setSubmitting(false);
          return;
        } else {
          // Count the final successful attempt
          setAttemptCounts(prev => ({ ...prev, [q.id]: (prev[q.id] || 0) + 1 }));
          setCorrectQuestions(prev => ({ ...prev, [q.id]: true }));
          
          // Update the answer in the answers array to mark it as correct
          setAnswers(prev => prev.map(a => 
            a.questionId === q.id 
              ? { ...a, answer: currentAns || '', isCorrect: true }
              : a
          ));
          
          // Log the final successful attempt for the last question
          logAttempt(q, currentAns, 'final');
          
          // Show success feedback for last question before proceeding to results
          triggerCorrectFeedback(() => {
            showCustomAlert(
              'Correct!', 
              'Great job! Your answer is correct. Proceeding to assessment summary...', 
              () => {
                // Show results panel after user acknowledges correct answer
                setShowResults(true);
              }, 
              'success'
            );
          });
          setSubmitting(false);
          return;
        }
      }

      // No need to update assignedExercises - completion status is determined by ExerciseResults existence
      
      // Show results panel - database saving will happen when Done is clicked
      setShowResults(true);
    } catch (error: any) {
      console.error('Failed to submit answers:', error);
      showCustomAlert('Error', `Failed to submit answers: ${error.message || error}. Please try again.`, undefined, 'error');
    } finally {
      setSubmitting(false);
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
      // Accumulate time for the level question
      const delta = Date.now() - questionStartTime;
      setAnswers(prev => prev.map(a => a.questionId === q.id ? { ...a, timeSpent: (a.timeSpent || 0) + delta } : a));
      setCorrectQuestions(prev => ({ ...prev, [q.id]: true }));
      // Count the final successful attempt
      setAttemptCounts(prev => ({ ...prev, [q.id]: (prev[q.id] || 0) + 1 }));
      await unlockNextLevel();
      showCustomAlert('Great job!', 'Level cleared!', () => router.replace({ pathname: '/Homepage', params: { exerciseId: exercise.id, session: String(Date.now()) } } as any), 'success');
    } else {
      setAttemptCounts(prev => ({ ...prev, [q.id]: (prev[q.id] || 0) + 1 }));
      showCustomAlert('Not yet correct', 'Try again!', undefined, 'warning');
    }
  };
  
  const renderMultipleChoice = (question: Question) => {
    const selectedAnswers = Array.isArray(currentAnswer) ? currentAnswer : [];
    
    // Check if all options have images
    const hasAllImages = question.options?.every((_, index) => question.optionImages?.[index]);
    const useGridLayout = hasAllImages && question.options && question.options.length <= 4;
    
    return (
      <View style={styles.questionContainer}>
        {/* Question Image */}
        {(question.questionImage || (question.questionImages && question.questionImages.length)) && (
          <View style={styles.questionImageContainer}>
              {Array.isArray(question.questionImage) ? (
              question.questionImage.map((img, idx) => (
                <ExpoImage key={`qi-${idx}`} source={{ uri: img }} style={styles.questionImage} contentFit="contain" transition={150} cachePolicy="disk" priority="high" />
              ))
            ) : question.questionImage ? (
              <ExpoImage source={{ uri: question.questionImage }} style={styles.questionImage} contentFit="contain" transition={150} cachePolicy="disk" priority="high" />
            ) : null}
            {question.questionImages && question.questionImages.length ? (
              (() => {
                const layout = getQuestionImageLayout(question);
                
                // Special layout for pattern recognition
                if (layout.layout === 'pattern-blocks') {
                  return (
                    <View style={[styles.patternBlocksContainer, { 
                      maxHeight: layout.maxHeight, 
                      maxWidth: layout.maxWidth
                    }]}>
                      {/* Top row - 4 items in blue container */}
                      <View style={styles.patternTopRow}>
                        {question.questionImages.slice(0, 4).map((img, idx) => (
                          <View key={`top-${idx}`} style={styles.patternTopItem}>
                            <ExpoImage 
                              source={{ uri: img }} 
                              style={styles.patternTopImage}
                              contentFit={layout.contentFit} 
                              transition={120} 
                              cachePolicy="disk" 
                            />
                          </View>
                        ))}
                      </View>
                      
                      {/* Middle section - single large item */}
                      {question.questionImages[4] && (
                        <View style={styles.patternMiddleRow}>
                          <ExpoImage 
                            source={{ uri: question.questionImages[4] }} 
                            style={styles.patternMiddleImage}
                            contentFit={layout.contentFit} 
                            transition={120} 
                            cachePolicy="disk" 
                          />
                        </View>
                      )}
                      
                      {/* Bottom section - 2x2 grid */}
                      <View style={styles.patternBottomGrid}>
                        {question.questionImages.slice(5, 9).map((img, idx) => (
                          <View key={`bottom-${idx}`} style={styles.patternBottomItem}>
                            <ExpoImage 
                              source={{ uri: img }} 
                              style={styles.patternBottomImage}
                              contentFit={layout.contentFit} 
                              transition={120} 
                              cachePolicy="disk" 
                            />
                          </View>
                        ))}
                      </View>
                    </View>
                  );
                }
                
                // Default layout for other question types
                return (
                  <View style={[styles.questionImagesContainer, { 
                    maxHeight: layout.maxHeight, 
                    maxWidth: layout.maxWidth,
                    justifyContent: layout.alignment
                  }]}>
                    <View style={[styles.questionImagesGrid, { 
                      flexDirection: layout.gridColumns === 1 ? 'column' : 'row',
                      flexWrap: 'wrap',
                      justifyContent: layout.alignment
                    }]}>
                      {question.questionImages.map((img, idx) => (
                        <ExpoImage 
                          key={`qis-${idx}`} 
                          source={{ uri: img }} 
                          style={[styles.questionImageThumb, { 
                            width: layout.imageSize, 
                            height: layout.imageSize,
                            margin: 4
                          }]} 
                          contentFit={layout.contentFit} 
                          transition={120} 
                          cachePolicy="disk" 
                        />
                      ))}
                    </View>
                  </View>
                );
              })()
            ) : null}
          </View>
        )}
        
        <View style={styles.questionTextContainer}>
          <Text style={styles.questionText}>{question.question}</Text>
          {renderTTSButton(question.ttsAudioUrl)}
        </View>
        
        {useGridLayout ? (
          <View style={styles.optionsGridContainer}>
            {question.options?.map((option, index) => {
              const isSelected = selectedAnswers.includes(option);
              const hasImage = question.optionImages?.[index];
              const optionLabel = String.fromCharCode(65 + index); // A, B, C, D
              
              const optionKey = `mc-${question.id}-${index}`;
              const isCorrect = isOptionIndexCorrect(question, index);
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
                    // Single answer immediate validation and feedback
                    if (!question.multiAnswer) {
                      // Debug logging
                      console.log('Multiple Choice Click Debug:', {
                        questionId: question.id,
                        selectedOption: option,
                        questionAnswer: question.answer,
                        isCorrect,
                        options: question.options
                      });
                      
                      if (!isCorrect) {
                        setLastShakeKey(optionKey);
                        setAttemptCounts(prev => ({ ...prev, [question.id]: (prev[question.id] || 0) + 1 }));
                        logAttempt(question, option, 'change');
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
                      // Correct -> set answer and move next
                      // Stop TTS immediately when correct answer is selected
                      stopCurrentTTS();
                      logInteraction(question.id, 'option_click', option, 0);
                      handleAnswerChange(option);
                      setCorrectQuestions(prev => ({ ...prev, [question.id]: true }));
                      // Count the final successful attempt
                      setAttemptCounts(prev => ({ ...prev, [question.id]: (prev[question.id] || 0) + 1 }));
                      logAttempt(question, option, 'final');
                      triggerCorrectFeedback(() => advanceToNextOrFinish());
                      return;
                    }
                    // Multi-answer behaves as selection accumulation
                    const newAnswers = isSelected 
                      ? selectedAnswers.filter(a => a !== option)
                      : [...selectedAnswers, option];
                    logInteraction(question.id, 'option_click', option, 0);
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
                              cachePolicy="disk"
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
              const isSelected = selectedAnswers.includes(option);
              const hasImage = question.optionImages?.[index];
              const hasMultipleImages = question.optionMultipleImages?.[index]?.length;
              const optionLabel = String.fromCharCode(65 + index); // A, B, C, D
              
              const optionKey = `mc-${question.id}-${index}`;
              const isCorrect = isOptionIndexCorrect(question, index);
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
                    if (!question.multiAnswer) {
                      // Debug logging
                      console.log('Multiple Choice Click Debug (Non-Grid):', {
                        questionId: question.id,
                        selectedOption: option,
                        questionAnswer: question.answer,
                        isCorrect,
                        options: question.options
                      });
                      
                      if (!isCorrect) {
                        setLastShakeKey(optionKey);
                        setAttemptCounts(prev => ({ ...prev, [question.id]: (prev[question.id] || 0) + 1 }));
                        logAttempt(question, option, 'change');
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
                      // Stop TTS immediately when correct answer is selected
                      stopCurrentTTS();
                      handleAnswerChange(option);
                      setCorrectQuestions(prev => ({ ...prev, [question.id]: true }));
                      logAttempt(question, option, 'change');
                      triggerCorrectFeedback(() => advanceToNextOrFinish());
                      return;
                    }
                    const newAnswers = isSelected 
                      ? selectedAnswers.filter(a => a !== option)
                      : [...selectedAnswers, option];
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
                    
                      {/* Single Image Display (Legacy) */}
                      {hasImage && (
                        <ExpoImage 
                          source={{ uri: hasImage }} 
                          style={styles.optionImage}
                          contentFit="contain"
                          transition={120}
                          cachePolicy="disk"
                        />
                      )}
                      
                      {/* Multiple Images Display */}
                      {hasMultipleImages && (
                        <View style={styles.multipleImagesContainer}>
                          {question.optionMultipleImages?.[index]?.map((imageUrl, imgIndex) => (
                            <ExpoImage 
                              key={imgIndex}
                              source={{ uri: imageUrl }} 
                              style={styles.optionImage}
                              contentFit="contain"
                              transition={120}
                              cachePolicy="disk"
                            />
                          ))}
                        </View>
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

  // Question type detection for image layout
  const getQuestionImageLayout = (question: Question) => {
    const questionText = question.question.toLowerCase();
    const title = exercise?.title.toLowerCase() || '';
    
    // Pattern recognition detection
    const isPatternRecognition = questionText.includes('pattern') || 
                                questionText.includes('kasunod') || 
                                questionText.includes('susunod') ||
                                title.includes('pattern');
    
    // Multiple choice with images
    const isMultipleChoice = question.type === 'multiple-choice';
    
    // Identification questions
    const isIdentification = question.type === 'identification';
    
    // Matching questions
    const isMatching = question.type === 'matching';
    
    if (isPatternRecognition) {
      return {
        type: 'pattern',
        gridColumns: 2,
        maxHeight: 280,
        maxWidth: 400,
        imageSize: 60,
        contentFit: 'contain' as const,
        alignment: 'center' as const,
        layout: 'pattern-blocks' as const
      };
    }
    
    if (isMultipleChoice && question.questionImages?.length) {
      return {
        type: 'multiple-choice',
        gridColumns: Math.min(3, question.questionImages.length),
        maxHeight: 150,
        maxWidth: 350,
        imageSize: 70,
        contentFit: 'contain' as const,
        alignment: 'center' as const
      };
    }
    
    if (isIdentification && question.questionImages?.length) {
      return {
        type: 'identification',
        gridColumns: Math.min(4, question.questionImages.length),
        maxHeight: 120,
        maxWidth: 400,
        imageSize: 60,
        contentFit: 'contain' as const,
        alignment: 'flex-start' as const
      };
    }
    
    if (isMatching && question.questionImages?.length) {
      return {
        type: 'matching',
        gridColumns: Math.min(2, question.questionImages.length),
        maxHeight: 180,
        maxWidth: 300,
        imageSize: 90,
        contentFit: 'contain' as const,
        alignment: 'center' as const
      };
    }
    
    // Default layout
    return {
      type: 'default',
      gridColumns: Math.min(3, question.questionImages?.length || 3),
      maxHeight: 150,
      maxWidth: 350,
      imageSize: 80,
      contentFit: 'contain' as const,
      alignment: 'center' as const
    };
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
            <View style={styles.questionImageContainer}>
              {Array.isArray(question.questionImage) ? (
                question.questionImage.map((img, idx) => (
                  <ExpoImage key={`qi-${idx}`} source={{ uri: img }} style={styles.questionImage} contentFit="contain" transition={150} cachePolicy="disk" priority="high" />
                ))
              ) : question.questionImage ? (
                <ExpoImage source={{ uri: question.questionImage }} style={styles.questionImage} contentFit="contain" transition={150} cachePolicy="disk" priority="high" />
              ) : null}
            {question.questionImages && question.questionImages.length ? (
              (() => {
                const layout = getQuestionImageLayout(question);
                return (
                  <View style={[styles.questionImagesContainer, { 
                    maxHeight: layout.maxHeight, 
                    maxWidth: layout.maxWidth,
                    justifyContent: layout.alignment
                  }]}>
                    <View style={[styles.questionImagesGrid, { 
                      flexDirection: layout.gridColumns === 1 ? 'column' : 'row',
                      flexWrap: 'wrap',
                      justifyContent: layout.alignment
                    }]}>
                      {question.questionImages.map((img, idx) => (
                        <ExpoImage 
                          key={`qis-${idx}`} 
                          source={{ uri: img }} 
                          style={[styles.questionImageThumb, { 
                            width: layout.imageSize, 
                            height: layout.imageSize,
                            margin: 4
                          }]} 
                          contentFit={layout.contentFit} 
                          transition={120} 
                          cachePolicy="disk" 
                        />
                      ))}
                    </View>
                  </View>
                );
              })()
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
            <View style={styles.questionImageContainer}>
              {Array.isArray(question.questionImage) ? (
                question.questionImage.map((img, idx) => (
                  <Image key={`qi-${idx}`} source={{ uri: img }} style={styles.questionImage} resizeMode="contain" />
                ))
              ) : question.questionImage ? (
                <Image source={{ uri: question.questionImage }} style={styles.questionImage} resizeMode="contain" />
              ) : null}
              {question.questionImages && question.questionImages.length ? (
                (() => {
                  const layout = getQuestionImageLayout(question);
                  return (
                    <View style={[styles.questionImagesContainer, { 
                      maxHeight: layout.maxHeight, 
                      maxWidth: layout.maxWidth,
                      justifyContent: layout.alignment
                    }]}>
                      <View style={[styles.questionImagesGrid, { 
                        flexDirection: layout.gridColumns === 1 ? 'column' : 'row',
                        flexWrap: 'wrap',
                        justifyContent: layout.alignment
                      }]}>
                        {question.questionImages.map((img, idx) => (
                          <ExpoImage 
                            key={`qis-${idx}`} 
                            source={{ uri: img }} 
                            style={[styles.questionImageThumb, { 
                              width: layout.imageSize, 
                              height: layout.imageSize,
                              margin: 4
                            }]} 
                            contentFit={layout.contentFit} 
                            transition={120} 
                            cachePolicy="disk" 
                          />
                        ))}
                      </View>
                    </View>
                  );
                })()
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
    const currentSelections = matchingSelections[question.id] || {};
    // Create persistent shuffled orders per question to auto "rumble" selections
    const pairCount = question.pairs?.length || 0;
    const cached = shuffledPairsCache[question.id];
    const makeOrder = (n: number) => Array.from({ length: n }, (_, i) => i).sort(() => Math.random() - 0.5);
    const leftOrder = cached?.left || makeOrder(pairCount);
    const rightOrder = cached?.right || makeOrder(pairCount);
    if (!cached && pairCount > 0) {
      setShuffledPairsCache(prev => ({ ...prev, [question.id]: { left: leftOrder, right: rightOrder } }));
    }
    
    return (
      <View style={styles.questionContainer}>
        {/* Question Image */}
        {(question.questionImage || (question.questionImages && question.questionImages.length)) && (
          <View style={styles.questionImageContainer}>
            {Array.isArray(question.questionImage) ? (
              question.questionImage.map((img, idx) => (
                <Image key={`qi-${idx}`} source={{ uri: img }} style={styles.questionImage} resizeMode="contain" />
              ))
            ) : question.questionImage ? (
              <Image source={{ uri: question.questionImage }} style={styles.questionImage} resizeMode="contain" />
            ) : null}
            {question.questionImages && question.questionImages.length ? (
              (() => {
                const layout = getQuestionImageLayout(question);
                return (
                  <View style={[styles.questionImagesContainer, { 
                    maxHeight: layout.maxHeight, 
                    maxWidth: layout.maxWidth,
                    justifyContent: layout.alignment
                  }]}>
                    <View style={[styles.questionImagesGrid, { 
                      flexDirection: layout.gridColumns === 1 ? 'column' : 'row',
                      flexWrap: 'wrap',
                      justifyContent: layout.alignment
                    }]}>
                      {question.questionImages.map((img, idx) => (
                        <ExpoImage 
                          key={`qis-${idx}`} 
                          source={{ uri: img }} 
                          style={[styles.questionImageThumb, { 
                            width: layout.imageSize, 
                            height: layout.imageSize,
                            margin: 4
                          }]} 
                          contentFit={layout.contentFit} 
                          transition={120} 
                          cachePolicy="disk" 
                        />
                      ))}
                    </View>
                  </View>
                );
              })()
            ) : null}
          </View>
        )}
        
        <View style={styles.questionTextContainer}>
          <Text style={styles.questionText}>{question.question}</Text>
          {renderTTSButton(question.ttsAudioUrl)}
        </View>
        
        {/* Progress removed per new design */}
        
        <View style={styles.matchingGameContainer}>
          <View style={styles.matchingColumn}>
            <View style={styles.columnHeaderSimple}>
              <Text style={styles.matchingColumnTitle}>Column A</Text>
            </View>
            {leftOrder.map((mappedIndex) => {
              const pair = question.pairs![mappedIndex];
              const idx = mappedIndex;
              return (
              <TouchableOpacity
                key={`left-${idx}`}
                style={[
                  styles.gameMatchingItem,
                  styles.matchingLeft,
                  currentSelections[`left-${idx}`] && styles.selectedMatchingItem
                ]}
                onPress={() => {
                  const newSelections = { ...currentSelections };
                  const key = `left-${idx}`;
                  if (newSelections[key]) {
                    delete newSelections[key];
                  } else {
                    newSelections[key] = key;
                  }
                  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                  setMatchingSelections(prev => ({ ...prev, [question.id]: newSelections }));
                  handleAnswerChange(newSelections);
                }}
                activeOpacity={0.7}
              >
                {pair.leftImage ? (
                  <ExpoImage source={{ uri: pair.leftImage }} style={styles.gameMatchingImage} contentFit="contain" transition={120} cachePolicy="disk" />
                ) : (
                  <View style={styles.gameItemContent}>
                    <Text style={styles.gameMatchingText}>{pair.left}</Text>
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
              const pair = question.pairs![mappedIndex];
              const idx = mappedIndex;
              return (
              <TouchableOpacity
                key={`right-${idx}`}
                style={[
                  styles.gameMatchingItem,
                  styles.matchingRight,
                  currentSelections[`right-${idx}`] && styles.selectedMatchingItem
                ]}
                onPress={() => {
                  const newSelections = { ...currentSelections };
                  const key = `right-${idx}`;
                  if (newSelections[key]) {
                    delete newSelections[key];
                  } else {
                    newSelections[key] = key;
                  }
                  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                  setMatchingSelections(prev => ({ ...prev, [question.id]: newSelections }));
                  handleAnswerChange(newSelections);
                }}
                activeOpacity={0.7}
              >
                {pair.rightImage ? (
                  <ExpoImage source={{ uri: pair.rightImage }} style={styles.gameMatchingImage} contentFit="contain" transition={120} cachePolicy="disk" />
                ) : (
                  <View style={styles.gameItemContent}>
                    <Text style={styles.gameMatchingText}>{pair.right}</Text>
                  </View>
                )}
              </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>
    );
  };

  const renderReorder = (question: Question) => {
    const initial = (reorderAnswers[question.id] as any) as ReorderItem[] | undefined;
    return (
      <View style={styles.questionContainer}>
        {question.questionImage && (
          <View style={styles.questionImageContainer}>
            {Array.isArray(question.questionImage) ? (
              question.questionImage.map((img, idx) => (
                <ExpoImage key={idx} source={{ uri: img }} style={styles.questionImage} contentFit="contain" transition={150} cachePolicy="disk" priority="high" />
              ))
            ) : (
              <ExpoImage source={{ uri: question.questionImage }} style={styles.questionImage} contentFit="contain" transition={150} cachePolicy="disk" priority="high" />
            )}
          </View>
        )}
        <View style={styles.questionTextContainer}>
          <Text style={styles.questionText}>{question.question}</Text>
          {renderTTSButton(question.ttsAudioUrl)}
        </View>
        <ReorderQuestion
          question={question}
          initialAnswer={initial || []}
          onChange={(ordered) => {
            setReorderAnswers((prev) => ({ ...prev, [question.id]: ordered }));
            handleAnswerChange(ordered.map((o) => o.id));
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
                  <Image key={`qi-${idx}`} source={{ uri: img }} style={styles.questionImage} resizeMode="contain" />
                ))
              ) : question.questionImage ? (
                <Image source={{ uri: question.questionImage }} style={styles.questionImage} resizeMode="contain" />
              ) : null}
              {question.questionImages && question.questionImages.length ? (
                (() => {
                  const layout = getQuestionImageLayout(question);
                  return (
                    <View style={[styles.questionImagesContainer, { 
                      maxHeight: layout.maxHeight, 
                      maxWidth: layout.maxWidth,
                      justifyContent: layout.alignment
                    }]}>
                      <View style={[styles.questionImagesGrid, { 
                        flexDirection: layout.gridColumns === 1 ? 'column' : 'row',
                        flexWrap: 'wrap',
                        justifyContent: layout.alignment
                      }]}>
                        {question.questionImages.map((img, idx) => (
                          <ExpoImage 
                            key={`qis-${idx}`} 
                            source={{ uri: img }} 
                            style={[styles.questionImageThumb, { 
                              width: layout.imageSize, 
                              height: layout.imageSize,
                              margin: 4
                            }]} 
                            contentFit={layout.contentFit} 
                            transition={120} 
                            cachePolicy="disk" 
                          />
                        ))}
                      </View>
                    </View>
                  );
                })()
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
                      <Image key={idx2} source={{ uri: img }} style={styles.questionImage} resizeMode="contain" />
                    ))
                  ) : (
                    <Image source={{ uri: subQuestion.questionImage }} style={styles.questionImage} resizeMode="contain" />
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
                                cachePolicy="disk"
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
                            <ExpoImage source={{ uri: hasImage }} style={styles.optionImage} contentFit="contain" transition={120} cachePolicy="disk" />
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
                const currentSelections = matchingSelections[selectionsKey] || {};
                const makeOrder = (n: number) => Array.from({ length: n }, (_, i) => i).sort(() => Math.random() - 0.5);
                const cached = shuffledPairsCache[selectionsKey];
                const leftOrder = cached?.left || makeOrder(pairCount);
                const rightOrder = cached?.right || makeOrder(pairCount);
                if (!cached && pairCount > 0) {
                  setShuffledPairsCache(prev => ({ ...prev, [selectionsKey]: { left: leftOrder, right: rightOrder } }));
                }
                return (
                  <View style={styles.matchingGameContainer}>
                    <View style={styles.matchingColumn}>
                      <View style={styles.columnHeaderSimple}>
                        <Text style={styles.matchingColumnTitle}>Column A</Text>
                      </View>
                      {leftOrder.map((mappedIndex) => {
                        const pair = subQuestion.pairs![mappedIndex];
                        const idx = mappedIndex;
                        return (
                          <TouchableOpacity
                            key={`left-${idx}`}
                            style={[
                              styles.gameMatchingItem,
                              styles.matchingLeft,
                              currentSelections[`left-${idx}`] && styles.selectedMatchingItem
                            ]}
                            onPress={() => {
                              const newSelections: {[key: string]: string} = { ...currentSelections };
                              const key = `left-${idx}`;
                              if (newSelections[key]) delete newSelections[key]; else newSelections[key] = key;
                              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                              setMatchingSelections(prev => ({ ...prev, [selectionsKey]: newSelections }));
                              setSubAnswer(parentId, subId, newSelections);
                            }}
                            activeOpacity={0.7}
                          >
                        {pair.leftImage ? (
                              <ExpoImage source={{ uri: pair.leftImage }} style={styles.gameMatchingImage} contentFit="contain" transition={120} cachePolicy="disk" />
                            ) : (
                              <View style={styles.gameItemContent}>
                                <Text style={styles.gameMatchingText}>{pair.left}</Text>
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
                        return (
                          <TouchableOpacity
                            key={`right-${idx}`}
                            style={[
                              styles.gameMatchingItem,
                              styles.matchingRight,
                              currentSelections[`right-${idx}`] && styles.selectedMatchingItem
                            ]}
                            onPress={() => {
                              const newSelections: {[key: string]: string} = { ...currentSelections };
                              const key = `right-${idx}`;
                              if (newSelections[key]) delete newSelections[key]; else newSelections[key] = key;
                              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                              setMatchingSelections(prev => ({ ...prev, [selectionsKey]: newSelections }));
                              setSubAnswer(parentId, subId, newSelections);
                            }}
                            activeOpacity={0.7}
                          >
                            {pair.rightImage ? (
                              <ExpoImage source={{ uri: pair.rightImage }} style={styles.gameMatchingImage} contentFit="contain" transition={120} cachePolicy="disk" />
                            ) : (
                              <View style={styles.gameItemContent}>
                                <Text style={styles.gameMatchingText}>{pair.right}</Text>
                              </View>
                            )}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
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
  
  const renderQuestion = () => {
    if (!exercise) return null;
    
    const question = exercise.questions[currentQuestionIndex];
    const isLastQuestion = currentQuestionIndex === exercise.questions.length - 1;
    
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
        {question.type === 'multiple-choice' && renderMultipleChoice(question)}
        {question.type === 'identification' && renderIdentification(question)}
        {question.type === 'matching' && renderMatching(question)}
        {question.type === 're-order' && renderReorder(question)}
        {question.type === 'reading-passage' && renderReadingPassage(question)}
        
        {/* Navigation Buttons (map level vs full exercise) */}
        {levelMode ? (
          <View style={styles.navigationContainer}>
            <TouchableOpacity style={[styles.navButton, styles.submitButton]} onPress={handleLevelComplete} activeOpacity={0.85}>
              <MaterialIcons name="flag" size={20} color="#ffffff" />
              <Text style={[styles.navButtonText, styles.submitButtonText]}>Finish Level</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.navigationContainer}>
            <TouchableOpacity
              style={[styles.navButton, currentQuestionIndex === 0 && styles.disabledNavButton]}
              onPress={handlePrevious}
              disabled={currentQuestionIndex === 0}
              activeOpacity={0.7}
            >
              <MaterialIcons name="arrow-back" size={20} color="#ffa500" />
              <Text style={styles.navButtonText}>Previous</Text>
            </TouchableOpacity>
            {isLastQuestion ? (
              <TouchableOpacity style={[styles.navButton, styles.submitButton]} onPress={handleSubmit} disabled={submitting} activeOpacity={0.8}>
                <MaterialIcons name="send" size={20} color="#ffffff" />
                <Text style={[styles.navButtonText, styles.submitButtonText]}>{submitting ? 'Submitting...' : 'Submit'}</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.navButton} onPress={handleNext} activeOpacity={0.7}>
                <Text style={styles.navButtonText}>Next</Text>
                <MaterialIcons name="arrow-forward" size={20} color="#ffa500" />
              </TouchableOpacity>
            )}
          </View>
        )}
      </Animated.View>
    );
  };
  
  // Removed start screen to go directly to exercise UI

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading exercise...</Text>
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
        
        {/* Header */}
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
            {exercise.timeLimitPerItem && (
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
            
            <Text style={styles.exerciseTitle}>{exercise.title}</Text>
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
        
        {/* Progress Bar */}
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
              <Text style={{ color: '#ffffff', fontSize: 20, fontWeight: '800' }}>Correct!</Text>
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
              <Text style={{ color: '#ffffff', fontSize: 20, fontWeight: '800' }}>Wrong!</Text>
            </View>
          </Animated.View>
        )}

        {/* Results Panel */}
        {showResults && (
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
            <View style={{ backgroundColor: '#ffffff', width: '100%', maxWidth: 500, borderRadius: 16, padding: 20 }}>
              <Text style={{ fontSize: 20, fontWeight: '800', color: '#1e293b', marginBottom: 12 }}>Assessment Summary</Text>
              {(() => {
                const totalMs = (answers || []).reduce((sum, a) => sum + (a.timeSpent || 0), 0);
                
                // Calculate total questions including sub-questions
                let totalQuestions = 0;
                let correctAnswers = 0;
                
                if (exercise?.questions) {
                  exercise.questions.forEach(q => {
                    if (q.type === 'reading-passage' && q.subQuestions) {
                      // For reading passages, count each sub-question
                      totalQuestions += q.subQuestions.length;
                      q.subQuestions.forEach(sq => {
                        if (correctQuestions[sq.id]) {
                          correctAnswers++;
                        }
                      });
                    } else {
                      // For regular questions
                      totalQuestions++;
                      const questionAnswer = answers.find(a => a.questionId === q.id);
                      if (questionAnswer?.isCorrect) {
                        correctAnswers++;
                      }
                    }
                  });
                }
                
                const scorePercentage = totalQuestions > 0 ? Math.round((correctAnswers / totalQuestions) * 100) : 0;
                
                return (
                  <>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                      <Text style={{ fontSize: 16, color: '#334155' }}>Score: {correctAnswers}/{totalQuestions}</Text>
                      <Text style={{ fontSize: 16, fontWeight: '700', color: scorePercentage >= 80 ? '#10b981' : scorePercentage >= 60 ? '#f59e0b' : '#ef4444' }}>
                        {scorePercentage}%
                      </Text>
                    </View>
                    <Text style={{ fontSize: 16, color: '#334155', marginBottom: 8 }}>Total time: {formatTime(totalMs)}</Text>
                    <Text style={{ fontSize: 14, color: '#64748b', marginBottom: 8 }}>
                      Questions: {exercise?.questions.length || 0} • Total items: {totalQuestions}
                    </Text>
                  </>
                );
              })()}
              <View style={{ maxHeight: 320 }}>
                <ScrollView>
                  {exercise?.questions.map((q, idx) => {
                    if (q.type === 'reading-passage' && q.subQuestions && q.subQuestions.length) {
                      return (
                        <View key={q.id} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                            <Text style={{ fontSize: 15, fontWeight: '700', color: '#0f172a' }}>Question {idx + 1} (Reading Passage)</Text>
                            {(() => {
                              // Calculate overall status for reading passage (all sub-questions correct = green, some correct = orange, none correct = red)
                              const subQuestionCount = q.subQuestions?.length || 0;
                              const correctSubQuestions = q.subQuestions?.filter(sq => correctQuestions[sq.id]).length || 0;
                              let statusColor = '#ef4444'; // red
                              if (correctSubQuestions === subQuestionCount && subQuestionCount > 0) {
                                statusColor = '#10b981'; // green
                              } else if (correctSubQuestions > 0) {
                                statusColor = '#f59e0b'; // orange
                              }
                              return (
                                <View style={{ marginLeft: 8, width: 12, height: 12, borderRadius: 6, backgroundColor: statusColor }} />
                              );
                            })()}
                          </View>
                          {q.subQuestions.map((sq, sidx) => {
                            // Get the parent answer and extract sub-question data
                            const parentAnswer = answers.find(a => a.questionId === q.id);
                            const subAnswerData = parentAnswer?.answer && typeof parentAnswer.answer === 'object' ? (parentAnswer.answer as {[key: string]: any})[sq.id] : '';
                            const isSubCorrect = correctQuestions[sq.id] || false;
                            const subAttempts = attemptCounts[sq.id] || 0;
                            
                            return (
                            <View key={sq.id} style={{ marginTop: 6 }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <Text style={{ fontSize: 14, fontWeight: '700', color: '#0f172a' }}>Q{subQuestionsLabel(sidx)}</Text>
                                <View style={{ 
                                  marginLeft: 8, 
                                  width: 10, 
                                  height: 10, 
                                  borderRadius: 5, 
                                  backgroundColor: isSubCorrect ? '#10b981' : '#ef4444' 
                                }} />
                              </View>
                              <Text style={{ fontSize: 13, color: '#64748b', marginBottom: 2 }}>Type: {sq.type}</Text>
                              <Text style={{ fontSize: 14, color: '#334155' }}>Tries: {attemptLogs[sq.id]?.length || 0}</Text>
                              <Text style={{ fontSize: 13, color: '#64748b' }}>Your answer: {serializeAnswer(sq, subAnswerData)}</Text>
                              <Text style={{ fontSize: 14, color: '#475569' }}>Correct answer: {Array.isArray(formatCorrectAnswer(sq)) ? (formatCorrectAnswer(sq) as string[]).join(', ') : (formatCorrectAnswer(sq) as string)}</Text>
                              {(() => {
                                const ms = getTimeMsForSubQuestion(q, sq);
                                const limitMs = exercise?.timeLimitPerItem ? exercise.timeLimitPerItem * 1000 : null;
                                return (
                                  <>
                                    <Text style={{ fontSize: 13, color: '#64748b' }}>Time Limit: {limitMs ? formatTime(limitMs) : '—'}</Text>
                                    <Text style={{ fontSize: 13, color: '#64748b' }}>Time Taken: {formatTime(ms)}</Text>
                                  </>
                                );
                              })()}
                              {(attemptLogs[sq.id] && attemptLogs[sq.id].length > 0) && (
                                <View style={{ marginTop: 4 }}>
                                  {attemptLogs[sq.id].map((log, li) => (
                                    <Text key={li} style={{ fontSize: 13, color: '#64748b' }}>Try {li + 1}: {log.answer || 'No answer'} ({Math.round(log.timeSpent / 1000)}s)</Text>
                                  ))}
                                </View>
                              )}
                            </View>
                            );
                          })}
                        </View>
                      );
                    }
                    return (
                      <View key={q.id} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                          <Text style={{ fontSize: 15, fontWeight: '700', color: '#0f172a' }}>Question {idx + 1}</Text>
                          {(() => {
                            const questionAnswer = answers.find(a => a.questionId === q.id);
                            const isCorrect = questionAnswer?.isCorrect || false;
                            return (
                              <View style={{ 
                                marginLeft: 8, 
                                width: 12, 
                                height: 12, 
                                borderRadius: 6, 
                                backgroundColor: isCorrect ? '#10b981' : '#ef4444' 
                              }} />
                            );
                          })()}
                        </View>
                        <Text style={{ fontSize: 13, color: '#64748b', marginBottom: 2 }}>Type: {q.type}</Text>
                        <Text style={{ fontSize: 14, color: '#334155' }}>Tries: {attemptLogs[q.id]?.length || 0}</Text>
                        <Text style={{ fontSize: 13, color: '#64748b' }}>Your answer: {serializeAnswer(q, answers.find(a => a.questionId === q.id)?.answer || '')}</Text>
                        <Text style={{ fontSize: 14, color: '#475569' }}>Correct answer: {Array.isArray(formatCorrectAnswer(q)) ? (formatCorrectAnswer(q) as string[]).join(', ') : (formatCorrectAnswer(q) as string)}</Text>
                        {(() => {
                          const ms = getTimeMsForQuestion(q);
                          const limitMs = exercise?.timeLimitPerItem ? exercise.timeLimitPerItem * 1000 : null;
                          return (
                            <>
                              <Text style={{ fontSize: 13, color: '#64748b' }}>Time Limit: {limitMs ? formatTime(limitMs) : '—'}</Text>
                              <Text style={{ fontSize: 13, color: '#64748b' }}>Time Taken: {formatTime(ms)}</Text>
                            </>
                          );
                        })()}
                        {(attemptLogs[q.id] && attemptLogs[q.id].length > 0) && (
                          <View style={{ marginTop: 4 }}>
                            {attemptLogs[q.id].map((log, li) => (
                              <Text key={li} style={{ fontSize: 13, color: '#64748b' }}>Try {li + 1}: {log.answer || 'No answer'} ({Math.round(log.timeSpent / 1000)}s)</Text>
                            ))}
                          </View>
                        )}
                      </View>
                    );
                  })}
                </ScrollView>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 16 }}>
                <TouchableOpacity 
                  onPress={handleFinalSubmission} 
                  disabled={submitting}
                  style={{ 
                    backgroundColor: submitting ? '#ccc' : '#ffa500', 
                    paddingHorizontal: 16, 
                    paddingVertical: 10, 
                    borderRadius: 10 
                  }} 
                  activeOpacity={0.8}
                >
                  <Text style={{ color: '#fff', fontWeight: '700' }}>
                    {submitting ? 'Submitting...' : 'Done'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
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
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
    shadowColor: '#ffa500',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#ffa500',
    gap: 8,
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
    fontSize: 16,
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
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
    letterSpacing: 0.3,
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
    paddingHorizontal: getResponsivePadding(20),
    paddingVertical: getResponsiveSize(20),
  },
  questionImagesContainer: {
    alignItems: 'center',
    marginTop: 8,
    overflow: 'hidden',
  },
  questionImagesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
  },
  questionImageThumb: {
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#ffa500',
    backgroundColor: '#ffffff',
  },
  // Pattern blocks layout styles
  patternBlocksContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  patternTopRow: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 8,
    marginBottom: 16,
    justifyContent: 'space-evenly',
    alignItems: 'center',
    minHeight: 70,
  },
  patternTopItem: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    backgroundColor: '#f8fafc',
    borderWidth: 2,
    borderColor: '#e2e8f0',
  },
  patternTopImage: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  patternMiddleRow: {
    marginBottom: 16,
    padding: 16,
    minHeight: 80,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    backgroundColor: '#f8fafc',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#e2e8f0',
  },
  patternMiddleImage: {
    width: '100%',
    height: 60,
    borderRadius: 12,
  },
  patternBottomGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    width: '100%',
  },
  patternBottomItem: {
    width: '48%',
    aspectRatio: 1,
    borderRadius: 16,
    marginBottom: 8,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    backgroundColor: '#f8fafc',
    borderWidth: 2,
    borderColor: '#e2e8f0',
  },
  patternBottomImage: {
    width: '100%',
    height: '100%',
    borderRadius: 16,
  },
  questionContainer: {
    marginBottom: 20,
  },
  questionImageContainer: {
    alignItems: 'center',
    marginBottom: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 15,
    padding: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  questionImage: {
    width: '100%',
    height: 200,
    borderRadius: 12,
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
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginBottom: 10,
    marginTop: -50,
    alignSelf: 'center',
  },
  questionTypeText: {
    fontSize: 14,
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
    width: 32,
    height: 32,
    borderRadius: 6,
    marginRight: 8,
  },
  multipleImagesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginRight: 8,
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
    width: '80%',
    height: '80%',
    borderRadius: 8,
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
  submitButton: {
    backgroundColor: '#ffa500',
    borderColor: '#ff8c00',
    shadowColor: '#ffa500',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
    transform: [{ scale: 1.02 }],
  },
  navButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
  },
  submitButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
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
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 12,
    borderWidth: 3,
    shadowColor: '#ffa500',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
    minHeight: 72,
    height: 72,
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
  matchingImage: {
    width: 40,
    height: 40,
    borderRadius: 8,
  },
  gameMatchingImage: {
    width: 60,
    height: 60,
    borderRadius: 12,
    marginRight: 0,
    alignSelf: 'center',
  },
  matchingText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
    textAlign: 'center',
  },
  gameMatchingText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
    textAlign: 'center',
    flex: 1,
  },
  gameItemContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
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
  reorderSlotsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 16,
  },
  reorderSlot: {
    width: '47%',
    height: 88,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.6)',
    borderWidth: 2,
    borderColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
    justifyContent: 'center',
    alignItems: 'center',
  },
  slotPlaceholder: {
    width: '92%',
    height: '76%',
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderWidth: 2,
    borderColor: '#ffa500',
  },
  slotFilledCard: {
    width: '92%',
    height: '76%',
    borderRadius: 14,
    backgroundColor: '#ffffff',
    borderWidth: 2,
    borderColor: '#ffa500',
    justifyContent: 'center',
    alignItems: 'center',
  },
  reorderChoicesPool: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between',
  },
  reorderChoice: {
    width: '47%',
    height: 88,
    borderRadius: 18,
    backgroundColor: '#ffffff',
    borderWidth: 2,
    borderColor: '#ffa500',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  reorderChoiceImage: {
    width: 56,
    height: 56,
    borderRadius: 12,
  },
  reorderChoiceText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
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