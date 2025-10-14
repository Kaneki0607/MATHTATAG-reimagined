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

  // Session and device tracking for new database format
  const [sessionStartTime, setSessionStartTime] = useState<string>('');
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);
  const [studentInfo, setStudentInfo] = useState<StudentInfo | null>(null);

  // Resource preloading state
  const [isPreloadingResources, setIsPreloadingResources] = useState(false);
  const [preloadProgress, setPreloadProgress] = useState(0);
  const [preloadStatus, setPreloadStatus] = useState('');
  const [preloadError, setPreloadError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [loadedResources, setLoadedResources] = useState<Set<string>>(new Set());
  const [failedResources, setFailedResources] = useState<Set<string>>(new Set());
  const [resourcesReady, setResourcesReady] = useState(false);
  const [exerciseStarted, setExerciseStarted] = useState(false);
  const [officialStartTime, setOfficialStartTime] = useState<number | null>(null);

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
      
      // Initialize device info
      const { width, height } = Dimensions.get('window');
      const deviceData: DeviceInfo = {
        platform: Platform.OS,
        appVersion: '1.0.0', // You can get this from app.json or package.json
        deviceModel: Platform.OS === 'android' ? `Android ${Platform.Version}` : `iOS ${Platform.Version}`,
        networkType: 'unknown' // Network detection would require additional setup
      };
      setDeviceInfo(deviceData);
      
      // Load student information
      try {
        const parentId = await AsyncStorage.getItem('parent_key');
        const studentId = await AsyncStorage.getItem('student_id');
        
        if (parentId && studentId) {
          const studentsData = await readData('/students');
          if (studentsData.data) {
            const student = Object.values(studentsData.data).find((s: any) => s.studentId === studentId) as any;
            if (student) {
              setStudentInfo({
                studentId: student.studentId,
                name: student.fullName || 'Unknown Student',
                gradeSection: student.gradeSection || 'Unknown Grade',
                sex: student.gender || 'Unknown'
              });
            }
          }
        }
      } catch (error) {
        console.warn('Could not load student information:', error);
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
            advanceToNextOrFinish();
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
  }, [exercise, startTime, submitting, questionStartTime, exerciseStarted, showResults]);

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
        setAnswers(prev => prev.map(a => a.questionId === prevQid ? { ...a, timeSpent: (a.timeSpent || 0) + delta } : a));
        frozenElapsedRef.current = null;
      }
      prevQuestionIndexRef.current = currentQuestionIndex;
    }
    setQuestionStartTime(Date.now());
    setQuestionElapsed(0);
    
    // Log initial attempt when question is displayed (only if there's an existing answer)
    if (exercise && exercise.questions[currentQuestionIndex]) {
      const currentQuestion = exercise.questions[currentQuestionIndex];
      const existingAnswer = answers.find(a => a.questionId === currentQuestion.id);
      // Only log if there's an actual answer, not empty
      if (existingAnswer?.answer && existingAnswer.answer !== '') {
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

  // Enhanced resource collection and preloading system
  const collectAllResources = (exercise: Exercise): ResourceItem[] => {
    const resources: ResourceItem[] = [];
    
    exercise.questions.forEach((question, questionIndex) => {
      const priority: 'high' | 'medium' | 'low' = 
        questionIndex < 3 ? 'high' : 
        questionIndex < 6 ? 'medium' : 'low';
      
      // Collect question images
      if (question.questionImage) {
        if (Array.isArray(question.questionImage)) {
          question.questionImage.filter(Boolean).forEach(url => {
            resources.push({ url, type: 'image', priority, questionId: question.id });
          });
        } else {
          resources.push({ url: question.questionImage, type: 'image', priority, questionId: question.id });
        }
      }
      
      if (question.questionImages && question.questionImages.length) {
        question.questionImages.filter(Boolean).forEach(url => {
          resources.push({ url, type: 'image', priority, questionId: question.id });
        });
      }
      
      // Collect option images
      if (question.optionImages && question.optionImages.length) {
        question.optionImages.filter(Boolean).forEach(url => {
          resources.push({ url: url!, type: 'image', priority, questionId: question.id });
        });
      }
      
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
      
      // Collect TTS audio
      if (question.ttsAudioUrl) {
        resources.push({ url: question.ttsAudioUrl, type: 'audio', priority, questionId: question.id });
      }
      
      // Collect sub-question resources
      if (question.subQuestions && question.subQuestions.length) {
        question.subQuestions.forEach(subQ => {
          const subResources = collectAllResources({ ...exercise, questions: [subQ] });
          resources.push(...subResources);
        });
      }
    });
    
    return resources;
  };

  const preloadResource = async (resource: ResourceItem): Promise<PreloadResult> => {
    const startTime = Date.now();
    
    try {
      if (resource.type === 'image') {
        await Image.prefetch(resource.url);
      } else if (resource.type === 'audio') {
        // For audio, we'll just validate the URL exists
        const response = await fetch(resource.url, { method: 'HEAD' });
        if (!response.ok) {
          throw new Error(`Audio resource failed: ${response.status}`);
        }
      }
      
      const loadTime = Date.now() - startTime;
      return { success: true, url: resource.url, loadTime };
    } catch (error) {
      const loadTime = Date.now() - startTime;
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
    
    // Process resources in batches for better performance
    const batchSize = 5;
    const batches = [];
    for (let i = 0; i < sortedResources.length; i += batchSize) {
      batches.push(sortedResources.slice(i, i + batchSize));
    }
    
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      
      setPreloadStatus(`Loading resources ${batchIndex * batchSize + 1}-${Math.min((batchIndex + 1) * batchSize, totalResources)} of ${totalResources}...`);
      
      // Process batch in parallel
      const batchPromises = batch.map(async (resource) => {
        const result = await preloadResource(resource);
        
        // Update progress
        const currentProgress = Math.round(((results.length + 1) / totalResources) * 100);
        setPreloadProgress(currentProgress);
        
        // Update loaded/failed resources
        if (result.success) {
          setLoadedResources(prev => new Set([...prev, resource.url]));
        } else {
          setFailedResources(prev => new Set([...prev, resource.url]));
        }
        
        return result;
      });
      
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
      
      // Small delay between batches to prevent overwhelming the network
      if (batchIndex < batches.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
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
      // Increased delay to ensure smooth transition between questions
      setTimeout(() => {
        playTTS(q.ttsAudioUrl!);
      }, 800);
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
      if (Array.isArray(question.answer)) return (question.answer as string[]).join(', ');
      return String(question.answer ?? '');
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
        if (Array.isArray(ans)) return ans.map((x) => String(x)).join(', ');
        return String(ans ?? '');
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
    
    // Don't log empty answers unless it's a final attempt (timeout case)
    if (!text || text.trim() === '') {
      if (attemptType !== 'final') {
        return; // Skip logging empty answers for initial/change attempts
      }
    }
    
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
      
      // Set random background
      setBackgroundImage(getRandomBackground());
      
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
          
          const exerciseData = {
            ...result.data,
            id: actualExerciseId,
          };
          
          setExercise(exerciseData);
          
          // Start comprehensive resource preloading
          setIsPreloadingResources(true);
          setPreloadProgress(0);
          setPreloadStatus('Preparing resources...');
          setPreloadError(null);
          
          try {
            const allResources = collectAllResources(exerciseData);
            console.log(`Found ${allResources.length} resources to preload`);
            
            if (allResources.length > 0) {
              const preloadResults = await preloadResourcesWithProgress(allResources);
              
              const successCount = preloadResults.filter(r => r.success).length;
              const failCount = preloadResults.filter(r => !r.success).length;
              
              console.log(`Preloading completed: ${successCount} successful, ${failCount} failed`);
              
              if (failCount > 0) {
                console.warn('Some resources failed to load:', preloadResults.filter(r => !r.success));
              }
              
              setPreloadStatus(`Preloading completed! ${successCount}/${allResources.length} resources loaded successfully.`);
              setResourcesReady(true);
            } else {
              setPreloadStatus('No resources to preload.');
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
    }
    
    // Update answers array
    setAnswers(prev => prev.map(a => 
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
    setAnswers(prev => prev.map(a => {
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
    
    if (!correct) {
      const newAttemptCount = currentAttempts + 1;
      
      // Check if attempt limit is reached
      if (maxAttempts !== null && maxAttempts !== undefined && newAttemptCount >= maxAttempts) {
        setAttemptCounts(prev => ({ ...prev, [q.id]: newAttemptCount }));
        logAttempt(q, currentAns, 'change');
        
        // Show attempt limit reached message
        showCustomAlert(
          'Attempt Limit Reached', 
          `You have reached the maximum number of attempts (${maxAttempts}) for this question. The correct answer will be shown.`,
          () => {
            // Mark as incorrect but allow progression
            setAnswers(prev => prev.map(a => 
              a.questionId === q.id ? { ...a, isCorrect: false } : a
            ));
            setCorrectQuestions(prev => ({ ...prev, [q.id]: false }));
            advanceToNextOrFinish();
          },
          'warning'
        );
        return;
      }
      
      setAttemptCounts(prev => ({ ...prev, [q.id]: newAttemptCount }));
      logAttempt(q, currentAns, 'change');
      
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
    
    // Stop TTS immediately when answer is correct
    stopCurrentTTS();
    
    // Update the answer with isCorrect: true
    setAnswers(prev => prev.map(a => 
      a.questionId === q.id ? { ...a, isCorrect: true } : a
    ));
    
    setCorrectQuestions(prev => ({ ...prev, [q.id]: true }));
    // Count the final successful attempt
    setAttemptCounts(prev => ({ ...prev, [q.id]: (prev[q.id] || 0) + 1 }));
    // Log the successful attempt as well
    logAttempt(q, currentAns, 'final');
    triggerCorrectFeedback(() => advanceToNextOrFinish());
  };

  const advanceToNextOrFinish = async () => {
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
      
      // Auto-submit before showing results
      await autoSubmitResults();
    }
  };
  
  const autoSubmitResults = async () => {
    try {
      setSubmitting(true);
      await handleFinalSubmission();
    } catch (error) {
      console.error('Auto-submit failed:', error);
      // Still show results even if submission fails
      setShowResults(true);
    } finally {
      setSubmitting(false);
    }
  };

  const triggerCorrectFeedback = (onComplete?: () => void) => {
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
          onComplete && onComplete();
        });
      }, 500);
    });
  };
  
  const triggerWrongFeedback = () => {
    // Trigger haptic feedback for wrong answer
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    
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
  const stripAccents = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
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
    const idx = letterToIndex(token);
    if (idx >= 0 && idx < question.options.length) return question.options[idx];
    return token;
  };

  const indexToLetter = (index: number) => String.fromCharCode(65 + index);
  const getOptionLetterForValue = (question: Question, value: string): string => {
    if (!question.options || !question.options.length) return '';
    const normValue = normalize(value);
    const idx = question.options.findIndex(opt => normalize(opt) === normValue);
    return idx >= 0 ? indexToLetter(idx) : '';
  };

  const isOptionCorrect = (question: Question, optionValue: string): boolean => {
    const expectedRaw = question.answer;
    if (Array.isArray(expectedRaw)) {
      const expectedValues = (expectedRaw as string[]).map(t => mapAnswerTokenToOptionValue(question, String(t)));
      return expectedValues.map(v => normalize(v)).includes(normalize(optionValue));
    }
    const expectedValue = mapAnswerTokenToOptionValue(question, String(expectedRaw));
    return normalize(optionValue) === normalize(expectedValue);
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
        if (Array.isArray(question.answer)) {
          const arr = Array.isArray(ans) ? ans : [];
          return (question.answer as string[]).every((v, i) => norm(String(arr[i] || '')) === norm(String(v || '')));
        }
        return norm(String(ans || '')) === norm(String(question.answer || ''));
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
      const totalTimeSpentSeconds = Math.floor(elapsedTime / 1000);
      
      // Create unique result ID
      const exerciseResultId = `${exercise?.id || exerciseId}_${parentId || 'anonymous'}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Get current timestamp for submission
      const completedAt = new Date().toISOString();
      const timestampSubmitted = Date.now();
      
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
      
      // Create assignment metadata
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
      
      // Create device info (use state or fallback)
      const deviceInfoData: DeviceInfo = deviceInfo || {
        platform: Platform.OS,
        appVersion: '1.0.0',
        deviceModel: 'Unknown',
        networkType: 'unknown'
      };
      
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
      
      // Create question results
      const questionResults: QuestionResult[] = exercise?.questions.map((q, idx) => {
        const questionAttempts = attemptLogs[q.id] || [];
        // Get the student answer from the last attempt, or from answers state as fallback
        const lastAttempt = questionAttempts[questionAttempts.length - 1];
        const studentAnswer = lastAttempt?.answer || finalAnswers.find(a => a.questionId === q.id)?.answer || '';
        const correctAnswer = formatCorrectAnswer(q);
        const isCorrect = isAnswerCorrect(q, studentAnswer);
        const attempts = attemptCounts[q.id] || 1;
        const timeSpentSeconds = Math.floor(getTimeMsForQuestion(q) / 1000);
        const ttsPlayed = helpUsage[q.id]?.ttsCount > 0;
        const ttsPlayCount = helpUsage[q.id]?.ttsCount || 0;
        
        // Get interaction types
        const interactions = interactionLogs[q.id] || [];
        const interactionTypes = interactions.map(i => i.type).filter((value, index, self) => self.indexOf(value) === index);
        
        // Create attempt history
        const attemptHistory: AttemptHistory[] = questionAttempts.map((attempt, attemptIdx) => {
          // For attempt history, we need to deserialize the answer back to raw format for validation
          let rawAnswer = attempt.answer;
          
          // If the answer is in display format (e.g., "C. 5"), extract the raw value
          if (typeof rawAnswer === 'string' && rawAnswer.includes('. ')) {
            const parts = rawAnswer.split('. ');
            if (parts.length >= 2) {
              // Extract the letter and convert back to raw format
              const letter = parts[0];
              const value = parts.slice(1).join('. ');
              // Convert letter back to raw answer format
              const letterIndex = letterToIndex(letter);
              if (letterIndex >= 0 && q.options && q.options[letterIndex]) {
                rawAnswer = q.options[letterIndex];
              }
            }
          }
          
          return {
            attemptNumber: attemptIdx + 1,
            selectedAnswer: attempt.answer || '',
            isCorrect: isAnswerCorrect(q, rawAnswer),
            timeStamp: new Date(attempt.timestamp).toISOString()
          };
        });
        
        // Format choices for multiple choice questions
        const choices = q.type === 'multiple-choice' && q.options ? 
          q.options.map((option, optIdx) => `${String.fromCharCode(65 + optIdx)}. ${option}`) : 
          undefined;
        
        return {
          questionNumber: idx + 1,
          questionId: q.id,
          questionText: q.question || '',
          choices: choices,
          correctAnswer: Array.isArray(correctAnswer) ? correctAnswer.join(', ') : String(correctAnswer),
          studentAnswer: Array.isArray(studentAnswer) ? studentAnswer.join(', ') : String(studentAnswer),
          isCorrect: isCorrect,
          attempts: attempts,
          timeSpentSeconds: timeSpentSeconds,
          ttsPlayed: ttsPlayed,
          ttsPlayCount: ttsPlayCount,
          interactionTypes: interactionTypes,
          attemptHistory: attemptHistory
        };
      }) || [];
      
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
      
      // Debug logging
      console.log('Recording exercise result with:', {
        parentId,
        studentId,
        exerciseResultId,
        exerciseId
      });
      
      if (!parentId) {
        console.warn('No parentId found - exercise result may not be properly tracked');
      }
      
      // Save to ExerciseResults table
      const exerciseResult = await writeData(`/ExerciseResults/${exerciseResultId}`, resultData);
      if (!exerciseResult.success) {
        throw new Error(`Failed to save exercise result: ${exerciseResult.error}`);
      }
      
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
        
        if (!correct) {
          const newAttemptCount = currentAttempts + 1;
          
          // Check if attempt limit is reached
          if (maxAttempts !== null && maxAttempts !== undefined && newAttemptCount >= maxAttempts) {
            setAttemptCounts(prev => ({ ...prev, [q.id]: newAttemptCount }));
            
            // Show attempt limit reached message
            showCustomAlert(
              'Attempt Limit Reached', 
              `You have reached the maximum number of attempts (${maxAttempts}) for this question. The correct answer will be shown.`,
              () => {
                // Mark as incorrect but allow progression
                setAnswers(prev => prev.map(a => 
                  a.questionId === q.id ? { ...a, isCorrect: false } : a
                ));
                setCorrectQuestions(prev => ({ ...prev, [q.id]: false }));
                setShowResults(true);
              },
              'warning'
            );
            setSubmitting(false);
            return;
          }
          
          setAttemptCounts(prev => ({ ...prev, [q.id]: newAttemptCount }));
          
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
          return;
        } else {
          // Update the answer with isCorrect: true
          setAnswers(prev => prev.map(a => 
            a.questionId === q.id ? { ...a, isCorrect: true } : a
          ));
          // Count the final successful attempt
          setAttemptCounts(prev => ({ ...prev, [q.id]: (prev[q.id] || 0) + 1 }));
        }
        setCorrectQuestions(prev => ({ ...prev, [q.id]: true }));
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
      setAnswers(prev => prev.map(a => a.questionId === q.id ? { ...a, timeSpent: (a.timeSpent || 0) + delta, isCorrect: true } : a));
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
                <ExpoImage 
                  key={`qi-${idx}`} 
                  source={{ uri: img }} 
                  style={styles.questionImage} 
                  contentFit="contain" 
                  transition={150} 
                  cachePolicy="memory-disk" 
                  priority="high"
                  recyclingKey={`qi-${question.id}-${idx}`}
                  onLoadStart={() => console.log(`Loading question image ${idx}`)}
                  onLoadEnd={() => console.log(`Question image ${idx} loaded`)}
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
                recyclingKey={`qi-${question.id}`}
                onLoadStart={() => console.log('Loading question image')}
                onLoadEnd={() => console.log('Question image loaded')}
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
                    recyclingKey={`qis-${question.id}-${idx}`}
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
        
        {useGridLayout ? (
          <View style={styles.optionsGridContainer}>
            {question.options?.map((option, index) => {
              const isSelected = selectedAnswers.includes(option);
              const hasImage = question.optionImages?.[index];
              const optionLabel = String.fromCharCode(65 + index); // A, B, C, D
              
              const optionKey = `mc-${question.id}-${index}`;
              const isCorrect = isOptionCorrect(question, option);
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
                      if (!isCorrect) {
                        const newAttemptCount = (attemptCounts[question.id] || 0) + 1;
                        const maxAttempts = exercise?.maxAttemptsPerItem;
                        
                        // Check if attempt limit is reached
                        if (maxAttempts !== null && maxAttempts !== undefined && newAttemptCount >= maxAttempts) {
                          setAttemptCounts(prev => ({ ...prev, [question.id]: newAttemptCount }));
                          logAttempt(question, option, 'change');
                          
                          // Mark as failed and advance
                          setAnswers(prev => prev.map(a => 
                            a.questionId === question.id ? { ...a, isCorrect: false } : a
                          ));
                          setCorrectQuestions(prev => ({ ...prev, [question.id]: false }));
                          
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
                        setAttemptCounts(prev => ({ ...prev, [question.id]: newAttemptCount }));
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
                      
                      // Update the answer with isCorrect: true
                      setAnswers(prev => prev.map(a => 
                        a.questionId === question.id ? { ...a, isCorrect: true } : a
                      ));
                      
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
              const isSelected = selectedAnswers.includes(option);
              const hasImage = question.optionImages?.[index];
              const optionLabel = String.fromCharCode(65 + index); // A, B, C, D
              
              const optionKey = `mc-${question.id}-${index}`;
              const isCorrect = isOptionCorrect(question, option);
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
                      if (!isCorrect) {
                        const newAttemptCount = (attemptCounts[question.id] || 0) + 1;
                        const maxAttempts = exercise?.maxAttemptsPerItem;
                        
                        // Check if attempt limit is reached
                        if (maxAttempts !== null && maxAttempts !== undefined && newAttemptCount >= maxAttempts) {
                          setAttemptCounts(prev => ({ ...prev, [question.id]: newAttemptCount }));
                          logAttempt(question, option, 'change');
                          
                          // Mark as failed and advance
                          setAnswers(prev => prev.map(a => 
                            a.questionId === question.id ? { ...a, isCorrect: false } : a
                          ));
                          setCorrectQuestions(prev => ({ ...prev, [question.id]: false }));
                          
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
                        setAttemptCounts(prev => ({ ...prev, [question.id]: newAttemptCount }));
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
                      
                      // Update the answer with isCorrect: true
                      setAnswers(prev => prev.map(a => 
                        a.questionId === question.id ? { ...a, isCorrect: true } : a
                      ));
                      
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
            <View style={styles.questionImageContainer}>
              {Array.isArray(question.questionImage) ? (
                question.questionImage.map((img, idx) => (
                  <ExpoImage key={`qi-${idx}`} source={{ uri: img }} style={styles.questionImage} contentFit="contain" transition={150} cachePolicy="disk" priority="high" />
                ))
              ) : question.questionImage ? (
                <ExpoImage source={{ uri: question.questionImage }} style={styles.questionImage} contentFit="contain" transition={150} cachePolicy="disk" priority="high" />
              ) : null}
            {question.questionImages && question.questionImages.length ? (
              <View style={styles.questionImagesGrid}>
                {question.questionImages.map((img, idx) => (
                  <Image key={`qis-${idx}`} source={{ uri: img }} style={styles.questionImageThumb} resizeMode="cover" />
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
            <View style={styles.questionImageContainer}>
              {Array.isArray(question.questionImage) ? (
                question.questionImage.map((img, idx) => (
                  <Image key={`qi-${idx}`} source={{ uri: img }} style={styles.questionImage} resizeMode="contain" />
                ))
              ) : question.questionImage ? (
                <Image source={{ uri: question.questionImage }} style={styles.questionImage} resizeMode="contain" />
              ) : null}
              {question.questionImages && question.questionImages.length ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                  {question.questionImages.map((img, idx) => (
                    <ExpoImage key={`qis-${idx}`} source={{ uri: img }} style={{ width: 100, height: 100, borderRadius: 8, marginRight: 8 }} contentFit="cover" transition={120} cachePolicy="disk" />
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
              <View style={styles.questionImagesGrid}>
                {question.questionImages.map((img, idx) => (
                  <Image key={`qis-${idx}`} source={{ uri: img }} style={styles.questionImageThumb} resizeMode="cover" />
                ))}
              </View>
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
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                  {question.questionImages.map((img, idx) => (
                    <Image key={`qis-${idx}`} source={{ uri: img }} style={{ width: 100, height: 100, borderRadius: 8, marginRight: 8 }} resizeMode="cover" />
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
                    {loading ? '...' : `${preloadProgress}%`}
                  </Text>
                </View>
                
                <View style={styles.loadingProgressBarContainer}>
                  <View style={styles.loadingProgressBarBackground}>
                    <Animated.View 
                      style={[
                        styles.loadingProgressBarFill, 
                        { width: `${loading ? 0 : preloadProgress}%` }
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
        
        {/* Check Answer Button for non-auto-advancing question types */}
        {question.type !== 'multiple-choice' && (
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
              Attempts: {attemptCounts[exercise.questions[currentQuestionIndex]?.id] || 0} / {exercise.maxAttemptsPerItem}
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
                      const totalAttempts = Object.values(attemptCounts).reduce((sum, count) => sum + count, 0);
                      return totalAttempts;
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
                      const correct = answers.filter(a => a.isCorrect).length;
                      const total = exercise?.questions.length || 0;
                      const percentage = total > 0 ? (correct / total) * 100 : 0;
                      
                      if (percentage >= 80) return '🌟';
                      if (percentage >= 60) return '👍';
                      if (percentage >= 40) return '💪';
                      return '🌱';
                    })()}
                  </Text>
                  <View style={styles.performanceStars}>
                    {(() => {
                      const correct = answers.filter(a => a.isCorrect).length;
                      const total = exercise?.questions.length || 0;
                      const percentage = total > 0 ? (correct / total) * 100 : 0;
                      const stars = Math.floor(percentage / 20);
                      return Array.from({ length: 5 }, (_, i) => (
                        <Text key={i} style={[styles.star, { opacity: i < stars ? 1 : 0.3 }]}>⭐</Text>
                      ));
                    })()}
                  </View>
                </View>
                <Text style={styles.performanceMessage}>
                  {(() => {
                    const correct = answers.filter(a => a.isCorrect).length;
                    const total = exercise?.questions.length || 0;
                    const percentage = total > 0 ? (correct / total) * 100 : 0;
                    
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
                      const answer = answers.find(a => a.questionId === q.id);
                      const isCorrect = answer?.isCorrect || false;
                      const attempts = attemptCounts[q.id] || 0;
                      const timeMs = getTimeMsForQuestion(q);
                      const hasAnswer = answer && answer.answer !== undefined && answer.answer !== '';
                      
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
                                Your answer: {typeof answer.answer === 'string' ? answer.answer.substring(0, 50) + (answer.answer.length > 50 ? '...' : '') : 'Answered'}
                              </Text>
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
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    marginHorizontal: getResponsivePadding(20),
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  attemptLimitText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
    marginLeft: 6,
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
    fontSize: 40,
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
    fontSize: 35,
  },
  loadingTitleContainer: {
    flex: 1,
  },
  loadingTitle: {
    fontSize: 24,
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
    fontSize: 20,
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
    fontSize: 18,
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
    fontSize: 16,
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
    fontSize: 16,
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
    fontSize: 32,
    marginBottom: 0,
  },
  resultsTitle: {
    fontSize: 26,
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
    fontSize: 24,
    marginBottom: 0,
  },
  statNumber: {
    fontSize: 20,
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
    fontSize: 32,
    marginBottom: 8,
  },
  performanceStars: {
    flexDirection: 'row',
    gap: 2,
  },
  star: {
    fontSize: 16,
  },
  performanceMessage: {
    fontSize: 16,
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
    fontSize: 18,
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
    fontSize: 18,
  },
  submitButtonText: {
    color: '#ffffff',
    fontSize: 16,
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
    fontSize: 18,
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
    fontSize: 48,
    marginBottom: 8,
  },
  compactResultsTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#1e293b',
    marginBottom: 12,
  },
  performanceStarsCompact: {
    flexDirection: 'row',
    gap: 4,
  },
  starCompact: {
    fontSize: 20,
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
    fontSize: 28,
    marginBottom: 8,
  },
  compactStatNumber: {
    fontSize: 22,
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
    fontSize: 16,
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
    fontSize: 18,
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
    paddingHorizontal: getResponsivePadding(20),
    paddingVertical: getResponsiveSize(20),
  },
  questionImagesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginTop: 8,
  },
  questionImageThumb: {
    width: 88,
    height: 88,
    borderRadius: 8,
    marginRight: 8,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: '#ffa500',
    backgroundColor: '#ffffff',
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