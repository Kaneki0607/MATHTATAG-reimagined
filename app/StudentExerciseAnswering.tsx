import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image as ExpoImage } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
    Alert,
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
    UIManager,
    View,
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
}

interface StudentAnswer {
  questionId: string;
  answer: string | string[] | {[key: string]: any};
  isCorrect?: boolean;
  timeSpent?: number;
}

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

// Animated touchable for shake feedback
const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

export default function StudentExerciseAnswering() {
  const router = useRouter();
  const { exerciseId, questionIndex } = useLocalSearchParams();
  
  // State
  const [exercise, setExercise] = useState<Exercise | null>(null);
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
  const rafIdRef = useRef<number | null>(null);
  const questionElapsedRef = useRef<number>(0);
  const frozenElapsedRef = useRef<number | null>(null);
  const [backgroundImage, setBackgroundImage] = useState<string>('bg.jpg');
  const [showSettings, setShowSettings] = useState(false);
  const [matchingSelections, setMatchingSelections] = useState<{[key: string]: {[key: string]: string}}>({});
  const [reorderAnswers, setReorderAnswers] = useState<{[key: string]: ReorderItem[]}>({});
  const [shuffledPairsCache, setShuffledPairsCache] = useState<{[key: string]: {left: number[]; right: number[]}}>({});
  const prevQuestionIndexRef = useRef<number>(0);
  // Map-level play state
  const levelMode = typeof questionIndex !== 'undefined';
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
  const [attemptLogs, setAttemptLogs] = useState<{[questionId: string]: string[]}>({});

  // Enable smooth layout transitions on Android
  if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
  }
  
  // Load exercise data
  useEffect(() => {
    loadExercise();
  }, [exerciseId]);
  
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
    const tick = () => {
      setElapsedTime(Date.now() - startTime);
      setQuestionElapsed(Date.now() - questionStartTime);
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
    };
  }, [timerInterval]);
  
  // Animation on question change
  useEffect(() => {
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
  }, [currentQuestionIndex]);
  
  const getRandomBackground = () => {
    const mapImages = [
      'bg.jpg',
      'bg2.jpg'
    ];
    const randomIndex = Math.floor(Math.random() * mapImages.length);
    return mapImages[randomIndex];
  };

  const getBackgroundSource = (imageName: string) => {
    switch (imageName) {
      case 'bg.jpg':
        return require('../assets/images/bg.jpg');
      case 'bg2.jpg':
        return require('../assets/images/bg2.jpg');
      default:
        return require('../assets/images/bg.jpg');
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

  // Helpers to present correct answers for all question types
  const subQuestionsLabel = (index: number): string => String(index + 1);
  const getReorderItemLabel = (item?: ReorderItem | null) => {
    if (!item) return '';
    if (item.type === 'image') return item.content || '[image]';
    return item.content;
  };

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

  const logAttempt = (question: Question, ans: any) => {
    const text = serializeAnswer(question, ans);
    setAttemptLogs(prev => ({
      ...prev,
      [question.id]: [...(prev[question.id] || []), text],
    }));
  };

  const loadExercise = async () => {
    try {
      setLoading(true);
      
      // Set random background
      setBackgroundImage(getRandomBackground());
      
      const result = await readData(`/exercises/${exerciseId}`);
      if (result.data) {
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
          if (batchUrls.length) prefetchUrls(batchUrls);
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
        Alert.alert('Error', 'Exercise not found');
        router.back();
      }
    } catch (error) {
      console.error('Failed to load exercise:', error);
      Alert.alert('Error', 'Failed to load exercise');
      router.back();
    } finally {
      setLoading(false);
    }
  };
  
  const handleAnswerChange = (answer: string | string[] | {[key: string]: any}) => {
    setCurrentAnswer(answer);
    
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
    if (!correct) {
      setAttemptCounts(prev => ({ ...prev, [q.id]: (prev[q.id] || 0) + 1 }));
      logAttempt(q, currentAns);
      // Trigger global shake for non-selectable types
      Animated.sequence([
        Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 6, duration: 50, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: -6, duration: 50, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
      ]).start();
      triggerWrongFeedback();
      Alert.alert('Try again', 'That is not correct yet. Please try again.');
      return;
    }
    setCorrectQuestions(prev => ({ ...prev, [q.id]: true }));
    // Log the successful attempt as well
    logAttempt(q, currentAns);
    triggerCorrectFeedback(() => advanceToNextOrFinish());
  };

  const advanceToNextOrFinish = () => {
    if (!exercise) return;
    // Do not accumulate here; index-change effect handles accumulation centrally
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
  
  const handlePrevious = () => {
    if (currentQuestionIndex > 0) {
      // Accumulation handled by index-change effect; just move index
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

  const handleSubmit = async () => {
    try {
      setSubmitting(true);
      
      // Stop timer
      if (timerInterval) {
        clearInterval(timerInterval);
        setTimerInterval(null);
      }
      
      // Validate last question on submit (try-again basis)
      if (exercise) {
        const q = exercise.questions[currentQuestionIndex];
        const currentAns = answers.find(a => a.questionId === q.id)?.answer;
        const correct = isAnswerCorrect(q, currentAns);
        if (!correct) {
          setAttemptCounts(prev => ({ ...prev, [q.id]: (prev[q.id] || 0) + 1 }));
          // Shake on submit when wrong
          Animated.sequence([
            Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: 6, duration: 50, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: -6, duration: 50, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
          ]).start();
          triggerWrongFeedback();
          Alert.alert('Try again', 'Your current answer is not correct yet. Please try again.');
          setSubmitting(false);
          return;
        }
        setCorrectQuestions(prev => ({ ...prev, [q.id]: true }));
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

      // Aggregate attempts
      const attemptsPerQuestion = attemptCounts;
      const totalAttempts = Object.values(attemptsPerQuestion).reduce((sum, v) => sum + (v || 0), 0);
      
      // Save student answers to database
      const studentKey = 'student_key'; // This should come from authentication
      const submissionData = {
        exerciseId,
        studentId: studentKey,
        answers: finalAnswers,
        submittedAt: new Date().toISOString(),
        totalTimeSpent: elapsedTime,
        score: 0, // Optional: adjust if you want to compute scoring
        attemptsPerQuestion,
        totalAttempts,
        attemptLogs,
        exerciseTitle: exercise?.title,
        questionCount: exercise?.questions.length,
      };
      
      // Save submission
      await writeData(`/studentSubmissions/${exerciseId}_${studentKey}`, submissionData);
      
      // Update task status if this is an assigned exercise
      try {
        const taskUpdateData = {
          status: 'completed',
          completedAt: new Date().toISOString(),
          timeSpent: elapsedTime,
        };
        await writeData(`/tasks/${exerciseId}`, taskUpdateData);
      } catch (taskError) {
        console.log('Task update failed (may not be an assigned exercise):', taskError);
      }
      
      // Show results panel instead of alert/back
      setShowResults(true);
    } catch (error) {
      console.error('Failed to submit answers:', error);
      Alert.alert('Error', 'Failed to submit answers. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleLevelComplete = async () => {
    if (!exercise) return;
    const q = exercise.questions[currentQuestionIndex];
    const currentAns = answers.find(a => a.questionId === q.id)?.answer;
    const correct = isAnswerCorrect(q, currentAns);
    if (correct) {
      // Accumulate time for the level question
      const delta = Date.now() - questionStartTime;
      setAnswers(prev => prev.map(a => a.questionId === q.id ? { ...a, timeSpent: (a.timeSpent || 0) + delta } : a));
      setCorrectQuestions(prev => ({ ...prev, [q.id]: true }));
      await unlockNextLevel();
      Alert.alert('Great job!', 'Level cleared!', [
        { text: 'Back to Map', onPress: () => router.replace({ pathname: '/Homepage', params: { exerciseId: exercise.id, session: String(Date.now()) } } as any) }
      ]);
    } else {
      setAttemptCounts(prev => ({ ...prev, [q.id]: (prev[q.id] || 0) + 1 }));
      Alert.alert('Not yet correct', 'Try again!');
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
              <View style={styles.questionImagesGrid}>
                {question.questionImages.map((img, idx) => (
                  <ExpoImage key={`qis-${idx}`} source={{ uri: img }} style={styles.questionImageThumb} contentFit="cover" transition={120} cachePolicy="disk" />
                ))}
              </View>
            ) : null}
          </View>
        )}
        
        <View style={styles.questionTextContainer}>
          <Text style={styles.questionText}>{question.question}</Text>
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
                        setLastShakeKey(optionKey);
                        setAttemptCounts(prev => ({ ...prev, [question.id]: (prev[question.id] || 0) + 1 }));
                        logAttempt(question, option);
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
                      handleAnswerChange(option);
                      setCorrectQuestions(prev => ({ ...prev, [question.id]: true }));
                      logAttempt(question, option);
                      triggerCorrectFeedback(() => advanceToNextOrFinish());
                      return;
                    }
                    // Multi-answer behaves as selection accumulation
                    const newAnswers = isSelected 
                      ? selectedAnswers.filter(a => a !== option)
                      : [...selectedAnswers, option];
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
                        setLastShakeKey(optionKey);
                        setAttemptCounts(prev => ({ ...prev, [question.id]: (prev[question.id] || 0) + 1 }));
                        logAttempt(question, option);
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
                      handleAnswerChange(option);
                      setCorrectQuestions(prev => ({ ...prev, [question.id]: true }));
                      logAttempt(question, option);
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
                        cachePolicy="disk"
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
            <View style={styles.timerContainer}>
              <MaterialIcons name="timer" size={20} color="#ffffff" />
              <Text style={styles.timerText}>{formatTime(questionElapsed)}</Text>
            </View>
            <Text style={styles.exerciseTitle}>{exercise.title}</Text>
            <Text style={styles.progressText}>
              Question {currentQuestionIndex + 1} of {exercise.questions.length}
            </Text>
          </View>
          
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => setShowSettings(!showSettings)}
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
                return <Text style={{ fontSize: 16, color: '#334155', marginBottom: 8 }}>Total time: {formatTime(totalMs)}</Text>;
              })()}
              <View style={{ maxHeight: 320 }}>
                <ScrollView>
                  {exercise?.questions.map((q, idx) => {
                    if (q.type === 'reading-passage' && q.subQuestions && q.subQuestions.length) {
                      return (
                        <View key={q.id} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' }}>
                          <Text style={{ fontSize: 15, fontWeight: '700', color: '#0f172a' }}>Question {idx + 1} (Reading Passage)</Text>
                          {q.subQuestions.map((sq, sidx) => (
                            <View key={sq.id} style={{ marginTop: 6 }}>
                              <Text style={{ fontSize: 14, fontWeight: '700', color: '#0f172a' }}>Q{subQuestionsLabel(sidx)}</Text>
                              <Text style={{ fontSize: 14, color: '#334155' }}>Tries: {attemptCounts[sq.id] || 0}</Text>
                              {(() => {
                                const ms = getTimeMsForSubQuestion(q, sq);
                                return <Text style={{ fontSize: 13, color: '#64748b' }}>Time: {formatTime(ms)}</Text>;
                              })()}
                              <Text style={{ fontSize: 14, color: '#475569' }}>Correct answer: {Array.isArray(formatCorrectAnswer(sq)) ? (formatCorrectAnswer(sq) as string[]).join(', ') : (formatCorrectAnswer(sq) as string)}</Text>
                              {(attemptLogs[sq.id] && attemptLogs[sq.id].length > 0) && (
                                <View style={{ marginTop: 4 }}>
                                  {attemptLogs[sq.id].map((log, li) => (
                                    <Text key={li} style={{ fontSize: 13, color: '#64748b' }}>Try {li + 1}: {log || '(blank)'}</Text>
                                  ))}
                                </View>
                              )}
                            </View>
                          ))}
                        </View>
                      );
                    }
                    return (
                      <View key={q.id} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' }}>
                        <Text style={{ fontSize: 15, fontWeight: '700', color: '#0f172a' }}>Question {idx + 1}</Text>
                        <Text style={{ fontSize: 14, color: '#334155' }}>Tries: {attemptCounts[q.id] || 0}</Text>
                        {(() => {
                          const ms = getTimeMsForQuestion(q);
                          return <Text style={{ fontSize: 13, color: '#64748b' }}>Time: {formatTime(ms)}</Text>;
                        })()}
                        <Text style={{ fontSize: 14, color: '#475569' }}>Correct answer: {Array.isArray(formatCorrectAnswer(q)) ? (formatCorrectAnswer(q) as string[]).join(', ') : (formatCorrectAnswer(q) as string)}</Text>
                        {(attemptLogs[q.id] && attemptLogs[q.id].length > 0) && (
                          <View style={{ marginTop: 4 }}>
                            {attemptLogs[q.id].map((log, li) => (
                              <Text key={li} style={{ fontSize: 13, color: '#64748b' }}>Try {li + 1}: {log || '(blank)'}</Text>
                            ))}
                          </View>
                        )}
                      </View>
                    );
                  })}
                </ScrollView>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 16 }}>
                <TouchableOpacity onPress={() => { setShowResults(false); router.back(); }} style={{ backgroundColor: '#ffa500', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 }} activeOpacity={0.8}>
                  <Text style={{ color: '#fff', fontWeight: '700' }}>Done</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
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
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    zIndex: 10,
  },
  headerButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
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
  timerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 165, 0, 0.9)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginBottom: 8,
    shadowColor: '#ffa500',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
    borderWidth: 2,
    borderColor: '#ff8c00',
    gap: 8,
  },
  timerText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
    fontFamily: 'monospace',
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  exerciseTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 10,
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
    marginHorizontal: 20,
    marginBottom: 20,
    alignItems: 'center',
  },
  progressBarContainer: {
    width: '100%',
    height: 25,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 2,
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
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 20,
  },
  questionWrapper: {
    flex: 1,
    paddingHorizontal: 20,
    paddingVertical: 20,
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
    fontSize: 15,
    fontWeight: '700',
    color: '#1e293b',
    lineHeight: 28,
    marginBottom: 30,
    marginTop: -15,
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
    gap: 10,
  },
  optionsGridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
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
    borderRadius: 15,
    padding: 12,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    minHeight: 60,
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
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 15,
    padding: 16,
    width: '48%',
    aspectRatio: 1,
    borderWidth: 2,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  selectedMultipleChoiceGridOption: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderColor: '#4a90e2',
    borderWidth: 3,
    shadowColor: '#4a90e2',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
    transform: [{ scale: 1.02 }],
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
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
  },
  identificationContainer: {
    marginBottom: 10,
  },
  questionTextContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 15,
    padding: 20,
    marginBottom: 20,
    borderWidth: 3,
    borderColor: '#ffa500',
    shadowColor: '#ffa500',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 80,
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