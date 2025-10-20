import { AntDesign, MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { Accelerometer } from 'expo-sensors';
import { useEffect, useRef, useState } from 'react';
import { Alert, Animated, Dimensions, Easing, Image, KeyboardAvoidingView, Modal, PanResponder, Platform, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { useResponsive } from '../hooks/useResponsive';
import { useResponsiveLayout, useResponsiveValue } from '../hooks/useResponsiveLayout';
import { collectAppMetadata } from '../lib/app-metadata';
import { logError, logErrorWithStack } from '../lib/error-logger';
import { readData, writeData } from '../lib/firebase-database';
import { uploadFile } from '../lib/firebase-storage';

// Utility functions for answer formatting (from StudentExerciseAnswering.tsx)
const extractFileName = (value: any): string => {
  if (!value) return '';
  const str = String(value).trim();
  
  // Check if this is a URL
  if (str.startsWith('http://') || str.startsWith('https://')) {
    try {
      const url = new URL(str);
      const pathname = url.pathname;
      const filename = pathname.split('/').pop() || '';
      // Remove file extension for cleaner display
      return filename.replace(/\.[^/.]+$/, '');
    } catch (e) {
      // If URL parsing fails, return the original string
      return str;
    }
  }
  
  return str;
};

const serializeAnswer = (question: any, ans: any): string => {
  try {
    if (question.type === 'multiple-choice') {
      if (Array.isArray(ans)) {
        const arr = ans.map(v => String(v));
        const labeled = arr.map(v => {
          // Extract filename if this is a URL
          const displayText = extractFileName(v);
          return displayText;
        });
        return labeled.join(', ');
      }
      const displayText = extractFileName(String(ans ?? ''));
      return displayText;
    }
    if (question.type === 'identification') {
      if (Array.isArray(ans)) {
        if (ans.length > 1) {
          return ans.map((x, idx) => `[${idx + 1}] ${extractFileName(String(x))}`).join('  ');
        }
        return ans.map((x) => extractFileName(String(x))).join(', ');
      }
      return extractFileName(String(ans ?? ''));
    }
    if (question.type === 're-order') {
      const ids = Array.isArray(ans) ? ans as string[] : [];
      const map = new Map((question.reorderItems || []).map((it: any) => [it.id, it] as const));
      const labels = ids.map(id => {
        const item = map.get(id);
        if (!item) return '';
        const label = (item as any).text || (item as any).image || `Item ${id}`;
        return extractFileName(label);
      });
      return labels.join(' , ');
    }
    if (question.type === 'matching') {
      const pairs = question.pairs || [];
      const pairedItems: string[] = [];
      
      for (let i = 0; i < pairs.length; i++) {
        const rightIndex = ans && ans[i] !== undefined ? ans[i] : null;
        
        if (rightIndex !== undefined && rightIndex !== null && pairs[rightIndex]) {
          const leftText = pairs[i].left || `Item ${i + 1}`;
          const rightText = pairs[rightIndex].right || `Item ${rightIndex + 1}`;
          const leftDisplay = extractFileName(leftText);
          const rightDisplay = extractFileName(rightText);
          pairedItems.push(`${leftDisplay} → ${rightDisplay}`);
        }
      }
      
      return pairedItems.length > 0 ? pairedItems.join('; ') : 'No pairs matched';
    }
    return String(ans ?? '');
  } catch (e) {
    return String(ans ?? '');
  }
};

// New function specifically for displaying re-order answers in pattern format
const serializeReorderAnswerPattern = (question: any, ans: any): string => {
  try {
    if (question.type !== 're-order') {
      return serializeAnswer(question, ans);
    }
    
    // Debug logging
    console.log('[DEBUG] serializeReorderAnswerPattern - Input ans:', ans, 'Type:', typeof ans);
    
    // Handle different answer formats
    let ids: string[] = [];
    
    if (Array.isArray(ans)) {
      ids = ans as string[];
    } else if (typeof ans === 'string') {
      // Try to parse as JSON array first
      try {
        const parsed = JSON.parse(ans);
        if (Array.isArray(parsed)) {
          ids = parsed;
        } else {
          // If it's a single string, treat it as one element
          ids = [ans];
        }
      } catch {
        // If parsing fails, treat as single string
        ids = [ans];
      }
    } else if (ans && typeof ans === 'object') {
      // Handle object with array property
      ids = ans.items || ans.sequence || ans.order || [];
    }
    
    console.log('[DEBUG] serializeReorderAnswerPattern - Processed ids:', ids);
    
    const reorderItems = question.reorderItems || [];
    
    if (ids.length === 0) {
      return 'No items selected';
    }
    
    // Check if the answer contains PNG file paths (URL encoded)
    const isPngPaths = ids.some(id => 
      typeof id === 'string' && 
      (id.includes('reorder-') || id.includes('.png') || id.includes('%2F') || id.includes('exercises'))
    );
    
    if (isPngPaths) {
      // Extract item numbers from PNG file paths
      const itemNumbers = ids.map(id => {
        if (typeof id === 'string') {
          // Decode URL-encoded path first
          let decodedId = id;
          try {
            decodedId = decodeURIComponent(id);
          } catch {
            decodedId = id;
          }
          
          // Look for reorder-X pattern in the filename
          const reorderMatch = decodedId.match(/reorder-(\d+)/);
          if (reorderMatch) {
            // Convert 0-based to 1-based numbering
            return (parseInt(reorderMatch[1]) + 1).toString();
          }
          
          // Fallback: try to extract any number from the path
          const numberMatch = decodedId.match(/(\d+)\.png/);
          if (numberMatch) {
            return (parseInt(numberMatch[1]) + 1).toString();
          }
        }
        return '?';
      }).filter(num => num !== '?');
      
      console.log('[DEBUG] serializeReorderAnswerPattern - Extracted itemNumbers:', itemNumbers);
      
      if (itemNumbers.length > 0) {
        const result = itemNumbers.join('-');
        console.log('[DEBUG] serializeReorderAnswerPattern - PNG path result:', result);
        return result;
      }
    }
    
    // Original logic for non-PNG answers
    // Create a map of item ID to original position (1-based)
    const originalPositions = new Map();
    reorderItems.forEach((item: any, index: number) => {
      originalPositions.set(item.id, index + 1);
    });
    
    // Map the answer IDs to their original positions
    const pattern = ids.map(id => {
      const position = originalPositions.get(id);
      return position ? position.toString() : '?';
    });
    
    const result = pattern.join('-');
    console.log('[DEBUG] serializeReorderAnswerPattern - Regular path result:', result);
    return result;
  } catch (error) {
    console.error('Error serializing re-order pattern:', error);
    return serializeAnswer(question, ans);
  }
};

interface ParentData {
  firstName: string;
  lastName: string;
  email: string;
  mobile: string;
  profilePictureUrl: string;
  parentKey: string;
  createdAt: string;
}

interface Announcement {
  id: string;
  classIds: string[];
  dateTime: string;
  message: string;
  teacherId: string;
  title: string;
  readBy?: string[];
  teacherName?: string;
  teacherProfilePictureUrl?: string;
  teacherGender?: string;
}

interface AssignedExercise {
  id: string;
  exerciseId: string;
  classId: string;
  deadline: string;
  assignedBy: string;
  createdAt: string;
  acceptLateSubmissions?: boolean;
  acceptingStatus?: 'open' | 'closed';
  manuallyUpdated?: boolean;
  status?: 'pending' | 'in-progress' | 'completed' | 'overdue';
  completedAt?: string;
  score?: number;
  timeSpent?: number;
  resultId?: string;
  quarter?: 'Quarter 1' | 'Quarter 2' | 'Quarter 3' | 'Quarter 4';
  exercise?: {
    id: string;
    title: string;
    description: string;
    teacherId: string;
    questionCount: number;
    timesUsed: number;
    isPublic: boolean;
    createdAt: string;
  };
  teacherName?: string;
  teacherProfilePictureUrl?: string;
  teacherGender?: string;
}

interface Task {
  id: string;
  title: string;
  description: string;
  dueDate: string;
  createdAt: string;
  teacherId: string;
  classIds: string[];
  exerciseId?: string;
  status: 'pending' | 'in-progress' | 'completed' | 'overdue';
  completedAt?: string;
  teacherName?: string;
  teacherProfilePictureUrl?: string;
  teacherGender?: string;
  points?: number;
  attachments?: Array<{
    name: string;
    url: string;
    type: 'file' | 'image' | 'link';
  }>;
  // For assigned exercises
  isAssignedExercise?: boolean;
  assignedExerciseId?: string;
  score?: number;
  timeSpent?: number;
  resultId?: string;
  quarter?: 'Quarter 1' | 'Quarter 2' | 'Quarter 3' | 'Quarter 4';
  // Student information (for completed tasks)
  studentInfo?: {
    studentId: string;
    name: string;
    sex?: string;
    gradeSection?: string;
  };
  studentId?: string;
  studentName?: string;
  studentSex?: string;
  studentGradeSection?: string;
}

const { width: staticWidth, height: staticHeight } = Dimensions.get('window');

interface CustomAlertProps {
  visible: boolean;
  title: string;
  message: string;
  buttons?: Array<{
    text: string;
    onPress?: () => void;
    style?: 'default' | 'cancel' | 'destructive';
  }>;
  onClose: () => void;
  icon?: 'success' | 'error' | 'warning' | 'info';
}

// Quarter Section Component to avoid hooks-in-loop error
const QuarterSection: React.FC<{
  quarter: string;
  quarterTasks: Task[];
  avgScore: number;
  totalTime: number;
  onTaskPress: (task: Task) => void;
  defaultOpen?: boolean;
}> = ({ quarter, quarterTasks, avgScore, totalTime, onTaskPress, defaultOpen = false }) => {
  const [collapsed, setCollapsed] = useState(!defaultOpen);

  return (
    <View style={styles.quarterSection}>
      <TouchableOpacity 
        style={styles.quarterHeaderButton}
        onPress={() => setCollapsed(!collapsed)}
        activeOpacity={0.7}
      >
        <View style={styles.quarterHeaderLeft}>
          <View style={styles.quarterIconContainer}>
            <MaterialCommunityIcons name="calendar-range" size={16} color="#ffffff" />
          </View>
          <View style={styles.quarterInfo}>
            <Text style={styles.quarterTitle}>{quarter}</Text>
            <Text style={styles.quarterSummary}>
              {quarterTasks.length > 0 
                ? `${quarterTasks.length} gawain · Average: ${avgScore.toFixed(0)}%`
                : 'Walang natapos na gawain'}
            </Text>
          </View>
        </View>
        <MaterialIcons 
          name={collapsed ? "keyboard-arrow-down" : "keyboard-arrow-up"} 
          size={24} 
          color="#64748b" 
        />
      </TouchableOpacity>

      {!collapsed && (
        quarterTasks.length === 0 ? (
          <View style={styles.emptyQuarterContent}>
            <MaterialCommunityIcons name="clipboard-text-outline" size={32} color="#cbd5e1" />
            <Text style={styles.emptyQuarterText}>Walang natapos na gawain sa quarter na ito</Text>
          </View>
        ) : (
          quarterTasks.map((task, index) => {
        const completedDate = task.completedAt ? new Date(task.completedAt) : new Date(task.createdAt);
        const now = new Date();
        const diffTime = now.getTime() - completedDate.getTime();
        const diffHours = Math.floor(diffTime / (1000 * 60 * 60));
        const diffDays = Math.floor(diffHours / 24);
        
        let timeAgo = '';
        if (diffHours < 1) {
          timeAgo = 'Kamakailan lang';
        } else if (diffHours < 24) {
          timeAgo = `${diffHours} oras na ang nakalipas`;
        } else if (diffDays < 7) {
          timeAgo = `${diffDays} araw na ang nakalipas`;
        } else {
          timeAgo = completedDate.toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric',
            year: completedDate.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
          });
        }

        const formatTime = (ms: number) => {
          const minutes = Math.floor(ms / 60000);
          const seconds = Math.floor((ms % 60000) / 1000);
          return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
        };

        return (
          <TouchableOpacity 
            key={task.id} 
            style={styles.modernHistoryItem}
            onPress={() => {
              if (task.resultId) {
                onTaskPress(task);
              } else {
                Alert.alert('Walang Resulta', 'Walang available na resulta para sa gawaing ito.');
              }
            }}
            activeOpacity={0.7}
          >
            <View style={styles.modernHistoryContent}>
              <View style={[
                styles.modernHistoryIcon,
                { backgroundColor: task.score && task.score >= 80 ? "#dcfce7" : 
                               task.score && task.score >= 60 ? "#fef3c7" : "#fef2f2" }
              ]}>
                <Text style={[
                  styles.modernHistoryScore,
                  { color: task.score && task.score >= 80 ? "#10b981" : 
                           task.score && task.score >= 60 ? "#f59e0b" : "#ef4444" }
                ]}>
                  {task.score !== undefined ? `${Math.round(task.score)}%` : 'N/A'}
                </Text>
              </View>
              
              <View style={styles.modernHistoryInfo}>
                <Text style={styles.modernHistoryTitle} numberOfLines={2}>
                  {task.title}
                </Text>
                <View style={styles.modernHistoryMeta}>
                  <View style={styles.modernHistoryMetaItem}>
                    <MaterialIcons name="quiz" size={12} color="#64748b" />
                    <Text style={styles.modernHistoryMetaText}>{task.points || 0} tanong</Text>
                  </View>
                  {task.timeSpent && (
                    <View style={styles.modernHistoryMetaItem}>
                      <MaterialIcons name="schedule" size={12} color="#64748b" />
                      <Text style={styles.modernHistoryMetaText}>{formatTime(task.timeSpent)}</Text>
                    </View>
                  )}
                </View>
                {task.resultId && (
                  <View style={styles.resultIdBadgeCompact}>
                    <MaterialIcons name="fingerprint" size={10} color="#3b82f6" />
                    <Text style={styles.resultIdTextCompact}>{task.resultId}</Text>
                  </View>
                )}
                <Text style={styles.modernHistoryDate}>{timeAgo}</Text>
              </View>

              {task.resultId && (
                <MaterialIcons name="chevron-right" size={20} color="#9ca3af" />
              )}
            </View>
          </TouchableOpacity>
        );
      })
        )
      )}
    </View>
  );
};

const CustomAlert: React.FC<CustomAlertProps> = ({ visible, title, message, buttons = [], onClose, icon }) => {
  if (!visible) return null;

  const defaultButtons = buttons.length > 0 ? buttons : [{ text: 'OK', onPress: onClose }];
  const isThreeButtons = defaultButtons.length === 3;
  const isFourButtons = defaultButtons.length === 4;

  const renderIcon = () => {
    if (!icon) return null;

    const iconSize = 48;
    const iconContainerStyle = {
      marginBottom: 16,
      alignItems: 'center' as const,
    };

    switch (icon) {
      case 'success':
        return (
          <View style={iconContainerStyle}>
            <AntDesign name="check" size={iconSize} color="#10b981" />
          </View>
        );
      case 'error':
        return (
          <View style={iconContainerStyle}>
            <AntDesign name="close" size={iconSize} color="#ef4444" />
          </View>
        );
      case 'warning':
        return (
          <View style={iconContainerStyle}>
            <AntDesign name="warning" size={iconSize} color="#f59e0b" />
          </View>
        );
      case 'info':
        return (
          <View style={iconContainerStyle}>
            <AntDesign name="info" size={iconSize} color="#3b82f6" />
          </View>
        );
      default:
        return null;
    }
  };

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.alertOverlay}>
        <View style={styles.alertContainer}>
          <View style={styles.alertContent}>
            {renderIcon()}
            <Text style={styles.alertTitle}>{title}</Text>
            <Text style={styles.alertMessage}>{message}</Text>
            <View style={[
              styles.alertButtons,
              isThreeButtons && styles.alertButtonsThree,
              isFourButtons && styles.alertButtonsFour
            ]}>
              {defaultButtons.map((button, index) => (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.alertButton,
                    button.style === 'destructive' && styles.alertButtonDestructive,
                    button.style === 'cancel' && styles.alertButtonCancel,
                    defaultButtons.length === 1 && styles.alertButtonSingle,
                    isThreeButtons && styles.alertButtonThree,
                    isFourButtons && styles.alertButtonFour
                  ]}
                  onPress={() => {
                    if (button.onPress) {
                      button.onPress();
                    }
                    onClose();
                  }}
                >
                  <Text style={[
                    styles.alertButtonText,
                    button.style === 'destructive' && styles.alertButtonTextDestructive,
                    button.style === 'cancel' && styles.alertButtonTextCancel
                  ]}>
                    {button.text}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
};

export default function ParentDashboard() {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const responsive = useResponsive();
  const layout = useResponsiveLayout();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [pulseAnim] = useState(new Animated.Value(1)); // For loading skeleton pulse animation
  
  // Responsive values
  const containerPadding = useResponsiveValue({
    mobile: 16,
    tablet: 24,
    desktop: 32,
    default: 16,
  });
  const translateAnim = useRef(new Animated.Value(16)).current;
  
  // Collapsed quarters state for Tasks section
  const [collapsedTasksQuarters, setCollapsedTasksQuarters] = useState<Record<string, boolean>>({});
  
  // Floating button position state
  const pan = useRef(new Animated.ValueXY({ x: width - 80, y: height - 170 })).current;
  const floatingOpacity = useRef(new Animated.Value(1)).current;
  const inactivityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Shake detection state
  const [isShakeEnabled, setIsShakeEnabled] = useState(true);
  const lastShakeTime = useRef(0);
  const shakeThreshold = 12; // Lowered for better sensitivity (was 15)
  
  // Parent data state
  const [parentData, setParentData] = useState<ParentData | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Registration form state
  const [showRegistrationModal, setShowRegistrationModal] = useState(false);
  const [registrationData, setRegistrationData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    mobile: '',
    profilePicture: null as string | null
  });
  const [registrationLoading, setRegistrationLoading] = useState(false);
  
  // Announcements state
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  
  // Tasks state
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tasksLoading, setTasksLoading] = useState(true); // Start as true to show loading skeleton
  const [initialTasksLoaded, setInitialTasksLoaded] = useState(false); // Track if tasks have been loaded at least once
  
  // Refresh state
  const [refreshing, setRefreshing] = useState(false);
  
  // Navigation state
  const [activeSection, setActiveSection] = useState('home');
  
  // Question Result view state
  const [showQuestionResult, setShowQuestionResult] = useState(false);
  const [selectedResult, setSelectedResult] = useState<any>(null);
  const [geminiAnalysis, setGeminiAnalysis] = useState<any>(null);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);
  const [classAverages, setClassAverages] = useState<any>(null);
  const [performanceRanking, setPerformanceRanking] = useState<any>(null);
  
  // Detailed History Modal state
  const [dailyQuote, setDailyQuote] = useState<{quote: string, author: string} | null>(null);
  
  // Question navigation state for swipe functionality
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  
  // Animation values for smooth transitions
  const questionFadeAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;
  
  // Profile modal state
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profileEditData, setProfileEditData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    mobile: '',
    profilePicture: null as string | null
  });
  const [profileEditLoading, setProfileEditLoading] = useState(false);
  
  // Announcement modal state
  const [showAnnouncementModal, setShowAnnouncementModal] = useState(false);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null);
  
  // Announcement expansion state
  const [expandedAnnouncementId, setExpandedAnnouncementId] = useState<string | null>(null);

  // Technical Report state
  const [showTechReportModal, setShowTechReportModal] = useState(false);
  const [reportDescription, setReportDescription] = useState('');
  const [reportScreenshots, setReportScreenshots] = useState<string[]>([]);
  const [submittingReport, setSubmittingReport] = useState(false);
  
  // Custom alert state
  const [showCustomAlert, setShowCustomAlert] = useState(false);
  const [alertConfig, setAlertConfig] = useState({
    title: '',
    message: '',
    icon: 'success' as 'success' | 'error' | 'warning' | 'info',
  });

  // Load parent data on component mount
  useEffect(() => {
    loadParentData();
    fetchDailyQuote();
  }, []);

  // Load announcements and tasks when parent data is available
  useEffect(() => {
    if (parentData) {
      loadAnnouncements();
      loadTasks();
    }
  }, [parentData]);

  // Initialize collapsed quarters state when tasks change
  useEffect(() => {
    const pendingTasks = tasks.filter(t => t.isAssignedExercise && t.status !== 'completed');
    
    if (pendingTasks.length > 0) {
      const groupedByQuarter: Record<string, Task[]> = {
        'Quarter 1': [],
        'Quarter 2': [],
        'Quarter 3': [],
        'Quarter 4': [],
        'No Quarter': [],
      };
      
      pendingTasks.forEach((task) => {
        const quarter = task.quarter || 'No Quarter';
        groupedByQuarter[quarter].push(task);
      });
      
      const quarters = ['Quarter 4', 'Quarter 3', 'Quarter 2', 'Quarter 1', 'No Quarter'].filter(
        (quarter) => groupedByQuarter[quarter].length > 0
      );
      
      // Only initialize if state is empty
      if (Object.keys(collapsedTasksQuarters).length === 0 && quarters.length > 0) {
        const initial: Record<string, boolean> = {};
        quarters.forEach((quarter, index) => {
          initial[quarter] = index !== 0; // Collapse all except first (latest)
        });
        setCollapsedTasksQuarters(initial);
      }
    }
  }, [tasks]);

  // Real-time listener for ExerciseResults to auto-update task completion status
  useEffect(() => {
    if (!parentData) return;
    
    let intervalId: ReturnType<typeof setInterval>;
    
    const setupRealTimeListener = async () => {
      // Poll for updates every 10 seconds (lightweight approach)
      intervalId = setInterval(async () => {
        try {
          const studentId = await getStudentId();
          if (!studentId) return;
          
          // Check for new results
          const exerciseResultsResult = await readData('/ExerciseResults');
          if (exerciseResultsResult.data) {
            const results = Object.values(exerciseResultsResult.data) as any[];
            
            // Update tasks with new completion data
            setTasks(prevTasks => {
              return prevTasks.map(task => {
                if (!task.isAssignedExercise || task.status === 'completed') {
                  return task; // Skip non-exercise tasks and already completed tasks
                }
                
                // Check if there's a new completion for this task
                const completionData = results.find((result: any) => {
                  const resultExerciseId = result.exerciseInfo?.exerciseId || result.exerciseId;
                  const resultAssignedExerciseId = result.assignmentMetadata?.assignedExerciseId || result.assignedExerciseId;
                  const resultStudentId = result.studentInfo?.studentId || result.studentId;
                  
                  return resultExerciseId === task.exerciseId && 
                         resultAssignedExerciseId === task.assignedExerciseId &&
                         resultStudentId === studentId;
                });
                
                if (completionData && !task.resultId) {
                  console.log('✅ Auto-updating task to completed:', task.title);
                  // Task just completed - update it
                  return {
                    ...task,
                    status: 'completed' as const,
                    completedAt: completionData.exerciseSession?.completedAt || new Date().toISOString(),
                    score: completionData.resultsSummary?.meanPercentageScore || completionData.scorePercentage,
                    timeSpent: completionData.resultsSummary?.totalTimeSpentSeconds ? completionData.resultsSummary.totalTimeSpentSeconds * 1000 : completionData.totalTimeSpent,
                    resultId: completionData.exerciseResultId || completionData.resultId,
                  };
                }
                
                return task;
              });
            });
          }
        } catch (error) {
          console.error('Real-time update error:', error);
        }
      }, 10000); // Check every 10 seconds
    };
    
    setupRealTimeListener();
    
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [parentData]);

  const loadParentData = async () => {
    try {
      // Get parent key from AsyncStorage
      const parentKey = await AsyncStorage.getItem('parent_key');
      
      if (parentKey) {
        // Resolve login code to actual parent ID
        const parentIdResult = await readData(`/parentLoginCodes/${parentKey}`);
        if (parentIdResult.data) {
          const actualParentId = parentIdResult.data;
          
          // Load parent data from Firebase using the actual parent ID
          const result = await readData(`/parents/${actualParentId}`);
          if (result.data) {
            setParentData({
              ...result.data,
              parentKey: parentKey
            });
          } else {
            // No data found, show registration modal
            setShowRegistrationModal(true);
          }
        } else {
          // Invalid parent key
          router.replace('/ParentLogin');
        }
      } else {
        // No parent key, redirect to login
        router.replace('/ParentLogin');
      }
    } catch (error) {
      console.error('Failed to load parent data:', error);
      if (error instanceof Error) {
        logErrorWithStack(error, 'error', 'ParentDashboard', 'Failed to load parent data');
      } else {
        logError('Failed to load parent data: ' + String(error), 'error', 'ParentDashboard');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 350,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(translateAnim, {
        toValue: 0,
        duration: 400,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
    
    // Pulse animation for loading skeletons
    const pulseAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.5,
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
    pulseAnimation.start();
    
    return () => {
      pulseAnimation.stop();
    };
  }, [fadeAnim, translateAnim]);

  const loadAnnouncements = async () => {
    try {
      const result = await readData('/announcements');
      if (result.data) {
        const announcementsList = Object.entries(result.data).map(([key, value]: [string, any]) => ({
          ...value,
          id: key
        })) as Announcement[];
        
        // Load teacher data for each announcement
        const announcementsWithTeacherData = await Promise.all(
          announcementsList.map(async (announcement) => {
            try {
              const teacherResult = await readData(`/teachers/${announcement.teacherId}`);
              if (teacherResult.data) {
                return {
                  ...announcement,
                  teacherName: teacherResult.data.firstName + ' ' + teacherResult.data.lastName,
                  teacherProfilePictureUrl: teacherResult.data.profilePictureUrl,
                  teacherGender: teacherResult.data.gender
                };
              }
            } catch (error) {
              console.error('Failed to load teacher data:', error);
              if (error instanceof Error) {
                logErrorWithStack(error, 'warning', 'ParentDashboard', 'Failed to load teacher data for announcement');
              } else {
                logError('Failed to load teacher data: ' + String(error), 'warning', 'ParentDashboard');
              }
            }
            return announcement;
          })
        );
        
        // Sort by date (newest first)
        const sortedAnnouncements = announcementsWithTeacherData.sort((a, b) => 
          new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime()
        );
        setAnnouncements(sortedAnnouncements);
        
        // Calculate unread count
        const parentKey = await AsyncStorage.getItem('parent_key');
        if (parentKey) {
          const unread = sortedAnnouncements.filter(announcement => 
            !announcement.readBy || !announcement.readBy.includes(parentKey)
          );
          setUnreadCount(unread.length);
        } else {
          setUnreadCount(sortedAnnouncements.length);
        }
      }
    } catch (error) {
      console.error('Failed to load announcements:', error);
      if (error instanceof Error) {
        logErrorWithStack(error, 'error', 'ParentDashboard', 'Failed to load announcements');
      } else {
        logError('Failed to load announcements: ' + String(error), 'error', 'ParentDashboard');
      }
    }
  };

  const markAnnouncementAsRead = async (announcementId: string) => {
    try {
      const parentKey = await AsyncStorage.getItem('parent_key');
      if (!parentKey) {
        return;
      }

      const announcement = announcements.find(a => a.id === announcementId);
      if (!announcement) {
        return;
      }

      // Check if already read
      if (announcement.readBy && announcement.readBy.includes(parentKey)) {
        return;
      }


      // Add parent to readBy array
      const updatedReadBy = [...(announcement.readBy || []), parentKey];
      
      // Update in Firebase
      const { success, error } = await writeData(`/announcements/${announcementId}/readBy`, updatedReadBy);
      
      if (success) {
        
        // Update local state
        setAnnouncements(prev => 
          prev.map(a => 
            a.id === announcementId 
              ? { ...a, readBy: updatedReadBy }
              : a
          )
        );
        
        // Update unread count
        setUnreadCount(prev => Math.max(0, prev - 1));
      } else {
        console.error('Failed to update Firebase:', error);
      }
    } catch (error) {
      console.error('Failed to mark announcement as read:', error);
      if (error instanceof Error) {
        logErrorWithStack(error, 'warning', 'ParentDashboard', 'Failed to mark announcement as read');
      } else {
        logError('Failed to mark announcement as read: ' + String(error), 'warning', 'ParentDashboard');
      }
    }
  };

  const openAnnouncementModal = (announcement: Announcement) => {
    setSelectedAnnouncement(announcement);
    setShowAnnouncementModal(true);
    // Mark as read when opened
    markAnnouncementAsRead(announcement.id);
  };

  const closeAnnouncementModal = () => {
    setShowAnnouncementModal(false);
    setSelectedAnnouncement(null);
  };

  const toggleAnnouncementExpansion = (announcementId: string) => {
    if (expandedAnnouncementId === announcementId) {
      setExpandedAnnouncementId(null);
    } else {
      setExpandedAnnouncementId(announcementId);
      markAnnouncementAsRead(announcementId);
    }
  };

  // Handle question result view
  const handleShowQuestionResult = async (task: Task) => {
    console.log('handleShowQuestionResult called with task:', task);
    console.log('task.resultId:', task.resultId);
    console.log('task.exerciseId:', task.exerciseId);
    
    if (!task.resultId) {
      console.log('No resultId found, returning early');
      Alert.alert('No Results', 'No results available for this activity.');
      return;
    }
    
    // Set a timeout to prevent stuck loading state
    const loadingTimeout = setTimeout(() => {
      console.log('Loading timeout reached, clearing loading state');
      setLoadingAnalysis(false);
    }, 30000); // 30 second timeout
    
    try {
      console.log('Starting to load result data...');
      setLoadingAnalysis(true);
      setSelectedResult(task);
      setShowQuestionResult(true);
      
      // Load detailed result data, original exercise, and existing performance metrics
      const [resultData, exerciseData, performanceData] = await Promise.all([
        readData(`/ExerciseResults/${task.resultId}`),
        readData(`/exercises/${task.exerciseId}`),
        readData(`/PerformanceMetrics/${task.resultId}`)
      ]);
      
      if (resultData.data && exerciseData.data) {
        console.log('Successfully loaded result and exercise data');
        console.log('resultData.data keys:', Object.keys(resultData.data));
        console.log('exerciseData.data keys:', Object.keys(exerciseData.data));
        
        // Enhance question results with original exercise data
        const questionResults = resultData.data.questionResults || [];
        const questions = exerciseData.data.questions || [];
        
        console.log('questionResults length:', questionResults.length);
        console.log('questions length:', questions.length);
        console.log('questionResults type:', typeof questionResults);
        console.log('questions type:', typeof questions);
        
        let enhancedQuestionResults = [];
        try {
          enhancedQuestionResults = questionResults.map((qResult: any) => {
            const originalQuestion = questions.find((q: any) => q.id === qResult.questionId);
            return {
              ...qResult,
              questionText: originalQuestion?.question || qResult.questionText || '',
              questionImage: originalQuestion?.questionImage || qResult.questionImage || null,
              options: originalQuestion?.options || qResult.options || [],
              ttsAudioUrl: originalQuestion?.ttsAudioUrl || null,
              // Ensure we have the full question data
              originalQuestion: originalQuestion
            };
          });
          console.log('Successfully enhanced question results:', enhancedQuestionResults.length);
        } catch (error) {
          console.error('Error enhancing question results:', error);
          console.log('questionResults:', questionResults);
          console.log('questions:', questions);
          // Fallback to empty array
          enhancedQuestionResults = [];
        }
        
        // Ensure all important fields are always available with proper fallbacks
        const mergedResult = {
          ...task,
          ...resultData.data,
          questionResults: enhancedQuestionResults,
          // Ensure studentInfo is always present
          studentInfo: resultData.data.studentInfo || task.studentInfo || {
            studentId: resultData.data.studentId || task.studentId,
            name: resultData.data.studentName || task.studentName || 'Student',
            sex: resultData.data.studentSex || task.studentSex,
            gradeSection: resultData.data.studentGradeSection || task.studentGradeSection || 'Unknown Grade'
          },
          // Ensure exerciseInfo is present
          exerciseInfo: resultData.data.exerciseInfo || {
            exerciseId: task.exerciseId || resultData.data.exerciseId,
            title: task.title || resultData.data.exerciseTitle,
            category: resultData.data.exerciseCategory || 'Mathematics'
          },
          // Ensure assignmentMetadata is present
          assignmentMetadata: resultData.data.assignmentMetadata || {
            assignedExerciseId: task.assignedExerciseId || resultData.data.assignedExerciseId,
            classId: task.classIds?.[0] || resultData.data.classId,
            parentId: resultData.data.parentId
          }
        };
        
        console.log('Setting selected result with studentInfo:', mergedResult.studentInfo);
        setSelectedResult(mergedResult);
        
        // Check if performance metrics already exist
        if (performanceData.data && performanceData.data.performanceMetrics) {
          setPerformanceRanking({
            currentStudent: performanceData.data.performanceMetrics,
            classStats: performanceData.data.classStats,
            allStudents: [], // Not stored in performance data
            performanceLevel: performanceData.data.performanceMetrics.performanceLevel
          });
        } else {
          try {
            console.log('Starting calculateClassAverages...');
            // Calculate class averages including per-question averages
            await calculateClassAverages(resultData.data, exerciseData.data);
            console.log('calculateClassAverages completed successfully');
            
            console.log('Starting calculatePerformanceMetrics...');
            // Calculate comprehensive performance metrics and ranking
            await calculatePerformanceMetrics(resultData.data, exerciseData.data);
            console.log('calculatePerformanceMetrics completed successfully');
        } catch (error) {
          console.error('Error calculating performance metrics:', error);
          console.log('Error stack:', (error as Error).stack);
            // Continue without performance metrics
          }
        }
        
        // Generate analysis (try Gemini first, fallback to direct interpretation)
        try {
          console.log('Starting generateGeminiAnalysis...');
          await generateGeminiAnalysis({
            ...resultData.data,
            questionResults: enhancedQuestionResults
          });
          console.log('generateGeminiAnalysis completed successfully');
        } catch (error) {
          console.error('Error generating Gemini analysis, using direct interpretation:', error);
          console.log('Error stack:', (error as Error).stack);
          try {
            console.log('Starting generateDirectAnalysis...');
            // Fallback to direct interpretation
            await generateDirectAnalysis({
              ...resultData.data,
              questionResults: enhancedQuestionResults
            });
            console.log('generateDirectAnalysis completed successfully');
          } catch (directError) {
            console.error('Error in generateDirectAnalysis:', directError);
            console.log('Direct error stack:', (directError as Error).stack);
          }
        }
      } else {
        console.log('Missing data - resultData:', !!resultData.data, 'exerciseData:', !!exerciseData.data);
        Alert.alert('Data Not Found', 'Unable to load exercise results. The data may not be available yet.');
        setShowQuestionResult(false);
      }
    } catch (error) {
      console.error('Failed to load question result:', error);
      Alert.alert('Error', 'Failed to load exercise results. Please try again.');
      setShowQuestionResult(false);
    } finally {
      clearTimeout(loadingTimeout);
      setLoadingAnalysis(false);
      console.log('Loading analysis completed, state cleared');
    }
  };

  // Helper function to calculate individual student metrics
  const calculateStudentMetrics = (resultData: any) => {
    const questionResults = resultData.questionResults || [];
    const totalQuestions = questionResults.length || 1; // Prevent division by zero
    
    // Calculate efficiency score (lower attempts and time = higher score)
    const totalAttempts = questionResults.reduce((sum: number, q: any) => sum + (q.attempts || 1), 0);
    const totalTime = resultData.totalTimeSpent || 0;
    const avgAttemptsPerQuestion = totalQuestions > 0 ? totalAttempts / totalQuestions : 0;
    const avgTimePerQuestion = totalQuestions > 0 ? totalTime / totalQuestions : 0;
    
    // Calculate consistency score (how consistent performance is across questions)
    const attemptVariance = totalQuestions > 0 ? questionResults.reduce((sum: number, q: any) => {
      const deviation = Math.abs((q.attempts || 1) - avgAttemptsPerQuestion);
      return sum + (deviation * deviation);
    }, 0) / totalQuestions : 0;
    
    const timeVariance = totalQuestions > 0 ? questionResults.reduce((sum: number, q: any) => {
      const deviation = Math.abs((q.timeSpent || 0) - avgTimePerQuestion);
      return sum + (deviation * deviation);
    }, 0) / totalQuestions : 0;
    
    // Calculate mastery score based on actual performance
    const correctAnswers = questionResults.length; // All questions are correct since student completed
    const masteryScore = Math.round((correctAnswers / totalQuestions) * 100);
    
    // Improved efficiency scoring with more granular scale
    let efficiencyScore;
    if (avgAttemptsPerQuestion <= 1) {
      efficiencyScore = 100; // Perfect efficiency
    } else if (avgAttemptsPerQuestion <= 1.5) {
      efficiencyScore = 90; // Excellent efficiency
    } else if (avgAttemptsPerQuestion <= 2) {
      efficiencyScore = 80; // Good efficiency
    } else if (avgAttemptsPerQuestion <= 2.5) {
      efficiencyScore = 70; // Fair efficiency
    } else if (avgAttemptsPerQuestion <= 3) {
      efficiencyScore = 60; // Poor efficiency
    } else {
      efficiencyScore = Math.max(40, 100 - (avgAttemptsPerQuestion - 1) * 15); // Decreasing score
    }
    
    // Improved consistency scoring
    let consistencyScore;
    if (attemptVariance <= 0.1) {
      consistencyScore = 100; // Perfect consistency
    } else if (attemptVariance <= 0.25) {
      consistencyScore = 90; // Excellent consistency
    } else if (attemptVariance <= 0.5) {
      consistencyScore = 80; // Good consistency
    } else if (attemptVariance <= 1.0) {
      consistencyScore = 70; // Fair consistency
    } else if (attemptVariance <= 1.5) {
      consistencyScore = 60; // Poor consistency
    } else {
      consistencyScore = Math.max(40, 100 - attemptVariance * 20); // Decreasing score
    }
    
    
    // Calculate overall score with better weighting
    const overallScore = Math.round(
      (efficiencyScore * 0.5) +  // Increased weight for efficiency
      (consistencyScore * 0.3) + 
      (masteryScore * 0.2)       // Reduced weight for mastery since it's often 100%
    );
    
    return {
      studentId: resultData.studentInfo?.studentId || resultData.studentId,
      parentId: resultData.assignmentMetadata?.parentId || resultData.parentId,
      efficiencyScore: Math.round(efficiencyScore),
      consistencyScore: Math.round(consistencyScore),
      masteryScore: Math.round(masteryScore),
      overallScore,
      totalAttempts,
      totalTime,
      avgAttemptsPerQuestion: Math.round(avgAttemptsPerQuestion * 10) / 10,
      avgTimePerQuestion: Math.round(avgTimePerQuestion),
      quickCorrectAnswers: correctAnswers,
      scorePercentage: resultData.scorePercentage || resultData.resultsSummary?.meanPercentageScore || 0
    };
  };

  // Calculate comprehensive performance metrics for class ranking
  const calculatePerformanceMetrics = async (resultData: any, exerciseData: any) => {
    try {
      console.log('calculatePerformanceMetrics: Starting with resultData keys:', Object.keys(resultData || {}));
      console.log('calculatePerformanceMetrics: Starting with exerciseData keys:', Object.keys(exerciseData || {}));
      
      const allResults = await readData('/ExerciseResults');
      if (!allResults.data) {
        console.log('calculatePerformanceMetrics: No allResults.data available');
        return;
      }

      const results = Object.values(allResults.data) as any[];
      console.log('calculatePerformanceMetrics: Total results found:', results.length);
      
      const sameExerciseResults = results.filter((result: any) => {
        // Handle new structure: get exerciseId from nested object
        const resultExerciseId = result.exerciseInfo?.exerciseId || result.exerciseId;
        const resultClassId = result.assignmentMetadata?.classId || result.classId;
        const resultStudentId = result.studentInfo?.studentId || result.studentId;
        
        const currentExerciseId = resultData.exerciseInfo?.exerciseId || resultData.exerciseId;
        const currentClassId = resultData.assignmentMetadata?.classId || resultData.classId;
        const currentStudentId = resultData.studentInfo?.studentId || resultData.studentId;
        
        return resultExerciseId === currentExerciseId &&
               resultClassId === currentClassId &&
               resultStudentId !== currentStudentId; // Exclude current student's result
      });

      console.log('calculatePerformanceMetrics: Same exercise results found:', sameExerciseResults.length);
      if (sameExerciseResults.length === 0) {
        console.log('calculatePerformanceMetrics: No same exercise results, returning early');
        return;
      }

      // Calculate performance metrics for each student
      console.log('calculatePerformanceMetrics: Starting to process sameExerciseResults');
      console.log('calculatePerformanceMetrics: sameExerciseResults type:', typeof sameExerciseResults);
      console.log('calculatePerformanceMetrics: sameExerciseResults is array:', Array.isArray(sameExerciseResults));
      
      let studentMetrics: any[] = [];
      try {
        studentMetrics = sameExerciseResults.map((result: any, index: number) => {
          console.log(`calculatePerformanceMetrics: Processing result ${index + 1}/${sameExerciseResults.length}`);
          console.log('calculatePerformanceMetrics: Result keys:', Object.keys(result || {}));
          
          const questionResults = result.questionResults || [];
          console.log('calculatePerformanceMetrics: questionResults length:', questionResults.length);
          const totalQuestions = questionResults.length || 1; // Prevent division by zero
        
        // Calculate efficiency score (lower attempts and time = higher score)
        const totalAttempts = questionResults.reduce((sum: number, q: any) => sum + (q.attempts || 1), 0);
        const totalTime = result.totalTimeSpent || 0;
        const avgAttemptsPerQuestion = totalQuestions > 0 ? totalAttempts / totalQuestions : 0;
        const avgTimePerQuestion = totalQuestions > 0 ? totalTime / totalQuestions : 0;
        
        // Calculate consistency score (how consistent performance is across questions)
        const attemptVariance = totalQuestions > 0 ? questionResults.reduce((sum: number, q: any) => {
          const deviation = Math.abs((q.attempts || 1) - avgAttemptsPerQuestion);
          return sum + (deviation * deviation);
        }, 0) / totalQuestions : 0;
        
        const timeVariance = totalQuestions > 0 ? questionResults.reduce((sum: number, q: any) => {
          const deviation = Math.abs((q.timeSpent || 0) - avgTimePerQuestion);
          return sum + (deviation * deviation);
        }, 0) / totalQuestions : 0;
        
        // Calculate mastery score based on actual performance
        const correctAnswers = questionResults.length; // All questions are correct since student completed
        const masteryScore = Math.round((correctAnswers / totalQuestions) * 100);
        
        // Improved efficiency scoring with more granular scale
        let efficiencyScore;
        if (avgAttemptsPerQuestion <= 1) {
          efficiencyScore = 100; // Perfect efficiency
        } else if (avgAttemptsPerQuestion <= 1.5) {
          efficiencyScore = 90; // Excellent efficiency
        } else if (avgAttemptsPerQuestion <= 2) {
          efficiencyScore = 80; // Good efficiency
        } else if (avgAttemptsPerQuestion <= 2.5) {
          efficiencyScore = 70; // Fair efficiency
        } else if (avgAttemptsPerQuestion <= 3) {
          efficiencyScore = 60; // Poor efficiency
        } else {
          efficiencyScore = Math.max(40, 100 - (avgAttemptsPerQuestion - 1) * 15); // Decreasing score
        }
        
        // Improved consistency scoring
        let consistencyScore;
        if (attemptVariance <= 0.1) {
          consistencyScore = 100; // Perfect consistency
        } else if (attemptVariance <= 0.25) {
          consistencyScore = 90; // Excellent consistency
        } else if (attemptVariance <= 0.5) {
          consistencyScore = 80; // Good consistency
        } else if (attemptVariance <= 1.0) {
          consistencyScore = 70; // Fair consistency
        } else if (attemptVariance <= 1.5) {
          consistencyScore = 60; // Poor consistency
        } else {
          consistencyScore = Math.max(40, 100 - attemptVariance * 20); // Decreasing score
        }
        
        // Calculate overall performance score with better weighting
        const overallScore = Math.round(
          (efficiencyScore * 0.5) +  // Increased weight for efficiency
          (consistencyScore * 0.3) + 
          (masteryScore * 0.2)       // Reduced weight for mastery since it's often 100%
        );
        
        return {
          studentId: result.studentInfo?.studentId || result.studentId,
          studentName: result.studentInfo?.name || result.studentName || 'Unknown Student',
          totalAttempts,
          totalTime,
          avgAttemptsPerQuestion,
          avgTimePerQuestion,
          efficiencyScore: Math.round(efficiencyScore),
          consistencyScore: Math.round(consistencyScore),
          masteryScore: Math.round(masteryScore),
          overallScore: overallScore,
          quickCorrectAnswers: correctAnswers,
          attemptVariance,
          timeVariance,
          questionResults: questionResults
        };
        });
        console.log('calculatePerformanceMetrics: Successfully processed all results');
      } catch (mapError) {
        console.error('calculatePerformanceMetrics: Error in map operation:', mapError);
        console.log('calculatePerformanceMetrics: Map error stack:', (mapError as Error).stack);
        console.log('calculatePerformanceMetrics: sameExerciseResults at error:', sameExerciseResults);
        studentMetrics = [];
      }

      // Sort students by multiple criteria for more consistent ranking
      studentMetrics.sort((a, b) => {
        // Primary sort: overall score (descending)
        if (b.overallScore !== a.overallScore) {
          return b.overallScore - a.overallScore;
        }
        
        // Secondary sort: efficiency score (descending)
        if (b.efficiencyScore !== a.efficiencyScore) {
          return b.efficiencyScore - a.efficiencyScore;
        }
        
        // Tertiary sort: consistency score (descending)
        if (b.consistencyScore !== a.consistencyScore) {
          return b.consistencyScore - a.consistencyScore;
        }
        
        // Quaternary sort: fewer total attempts (ascending)
        if (a.totalAttempts !== b.totalAttempts) {
          return a.totalAttempts - b.totalAttempts;
        }
        
        // Quinary sort: less time spent (ascending)
        return a.totalTime - b.totalTime;
      });
      
      // Calculate rankings based on sorted position (no ties)
      const rankedStudents = studentMetrics.map((student, index) => {
        return {
          ...student,
          rank: index + 1, // Rank is simply the position in the sorted array
          percentile: Math.round(((studentMetrics.length - index) / studentMetrics.length) * 100)
        };
      });

      // Calculate current student's performance metrics
      const currentStudentMetrics = calculateStudentMetrics(resultData);
      
      // Calculate class statistics (including current student)
      const allStudentsIncludingCurrent = [...studentMetrics, currentStudentMetrics];
      
      // Re-sort all students including current student for proper ranking
      allStudentsIncludingCurrent.sort((a, b) => {
        // Primary sort: overall score (descending)
        if (b.overallScore !== a.overallScore) {
          return b.overallScore - a.overallScore;
        }
        
        // Secondary sort: efficiency score (descending)
        if (b.efficiencyScore !== a.efficiencyScore) {
          return b.efficiencyScore - a.efficiencyScore;
        }
        
        // Tertiary sort: consistency score (descending)
        if (b.consistencyScore !== a.consistencyScore) {
          return b.consistencyScore - a.consistencyScore;
        }
        
        // Quaternary sort: fewer total attempts (ascending)
        if (a.totalAttempts !== b.totalAttempts) {
          return a.totalAttempts - b.totalAttempts;
        }
        
        // Quinary sort: less time spent (ascending)
        return a.totalTime - b.totalTime;
      });
      
      // Find current student's rank in the complete list
      const currentStudentIndex = allStudentsIncludingCurrent.findIndex(s => s.studentId === resultData.studentId);
      const currentStudent = {
        ...currentStudentMetrics,
        rank: currentStudentIndex + 1, // Rank is the position in the sorted array
        percentile: Math.round(((allStudentsIncludingCurrent.length - currentStudentIndex) / allStudentsIncludingCurrent.length) * 100)
      };
      
      const classStats = {
        totalStudents: allStudentsIncludingCurrent.length,
        averageEfficiency: allStudentsIncludingCurrent.reduce((sum, s) => sum + s.efficiencyScore, 0) / allStudentsIncludingCurrent.length,
        averageConsistency: allStudentsIncludingCurrent.reduce((sum, s) => sum + s.consistencyScore, 0) / allStudentsIncludingCurrent.length,
        averageMastery: allStudentsIncludingCurrent.reduce((sum, s) => sum + s.masteryScore, 0) / allStudentsIncludingCurrent.length,
        averageOverallScore: allStudentsIncludingCurrent.reduce((sum, s) => sum + s.overallScore, 0) / allStudentsIncludingCurrent.length
      };


      setPerformanceRanking({
        currentStudent,
        classStats,
        allStudents: rankedStudents,
        performanceLevel: currentStudent ? 
          (currentStudent.overallScore >= 70 ? 'excellent' : // Lowered from 80
           currentStudent.overallScore >= 50 ? 'good' : // Lowered from 60
           currentStudent.overallScore >= 30 ? 'needs_improvement' : 'struggling') : 'unknown' // Lowered from 40
      });

      // Save performance metrics to the database
      try {
        const performanceData = {
          resultId: resultData.exerciseResultId || resultData.resultId,
          exerciseId: resultData.exerciseInfo?.exerciseId || resultData.exerciseId,
          studentId: resultData.studentInfo?.studentId || resultData.studentId,
          parentId: resultData.assignmentMetadata?.parentId || resultData.parentId,
          classId: resultData.assignmentMetadata?.classId || resultData.classId,
          performanceMetrics: {
            overallScore: currentStudent.overallScore,
            efficiencyScore: currentStudent.efficiencyScore,
            consistencyScore: currentStudent.consistencyScore,
            masteryScore: currentStudent.masteryScore,
            rank: currentStudent.rank,
            percentile: currentStudent.percentile,
            totalAttempts: currentStudent.totalAttempts,
            totalTime: currentStudent.totalTime,
            avgAttemptsPerQuestion: currentStudent.avgAttemptsPerQuestion,
            avgTimePerQuestion: currentStudent.avgTimePerQuestion,
            performanceLevel: currentStudent.overallScore >= 70 ? 'excellent' :
                            currentStudent.overallScore >= 50 ? 'good' :
                            currentStudent.overallScore >= 30 ? 'needs_improvement' : 'struggling'
          },
          classStats: {
            totalStudents: classStats.totalStudents,
            averageEfficiency: classStats.averageEfficiency,
            averageConsistency: classStats.averageConsistency,
            averageMastery: classStats.averageMastery,
            averageOverallScore: classStats.averageOverallScore
          },
          calculatedAt: new Date().toISOString()
        };

        // Save to PerformanceMetrics table
        await writeData(`/PerformanceMetrics/${resultData.resultId}`, performanceData);
        console.log('calculatePerformanceMetrics: Performance metrics saved successfully');
      } catch (error) {
        console.error('Failed to save performance metrics:', error);
        console.log('calculatePerformanceMetrics: Save error stack:', (error as Error).stack);
      }
    } catch (error) {
      console.error('calculatePerformanceMetrics: Error in function:', error);
      console.log('calculatePerformanceMetrics: Error stack:', (error as Error).stack);
    }
  };

  const handleTaskAction = async (task: Task) => {
    if (task.status === 'completed') {
      // For completed tasks, switch to history tab and load the result
      setActiveSection('history');
      await handleShowQuestionResult(task);
    } else {
      // For pending tasks, start the exercise
      const params: any = { exerciseId: task.exerciseId };
      
      // If this is an assigned exercise, pass the assignedExerciseId
      if (task.isAssignedExercise && task.assignedExerciseId) {
        params.assignedExerciseId = task.assignedExerciseId;
      }
      
      router.push({
        pathname: '/StudentExerciseAnswering',
        params
      });
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        loadAnnouncements(),
        loadTasks(),
      ]);
    } catch (error) {
      console.error('Error refreshing data:', error);
    } finally {
      setRefreshing(false);
    }
  };

  const fetchDailyQuote = async () => {
    try {
      const response = await fetch('https://zenquotes.io/api/quotes');
      if (response.ok) {
        const quotes = await response.json();
        if (quotes && quotes.length > 0) {
          // Get the first quote from the array
          setDailyQuote({
            quote: quotes[0].q,
            author: quotes[0].a
          });
        }
      }
    } catch (error) {
      console.error('Failed to fetch quote:', error);
      // Set a fallback quote
      setDailyQuote({
        quote: "Education is the most powerful weapon which you can use to change the world.",
        author: "Nelson Mandela"
      });
    }
  };

  const calculateClassAverages = async (resultData: any, exerciseData: any) => {
    try {
      console.log('calculateClassAverages called with:', { 
        resultDataKeys: Object.keys(resultData || {}), 
        exerciseDataKeys: Object.keys(exerciseData || {}) 
      });
      
      // Get all results for the same exercise and class (excluding current student for comparison)
      const allResults = await readData('/ExerciseResults');
      if (allResults.data) {
        const results = Object.values(allResults.data) as any[];
        console.log('Total results found:', results.length);
        
        const sameExerciseResults = results.filter((result: any) => {
          // Handle new structure: get exerciseId from nested object
          const resultExerciseId = result.exerciseInfo?.exerciseId || result.exerciseId;
          const resultClassId = result.assignmentMetadata?.classId || result.classId;
          const resultStudentId = result.studentInfo?.studentId || result.studentId;
          
          const currentExerciseId = resultData.exerciseInfo?.exerciseId || resultData.exerciseId;
          const currentClassId = resultData.assignmentMetadata?.classId || resultData.classId;
          const currentStudentId = resultData.studentInfo?.studentId || resultData.studentId;
          
          return resultExerciseId === currentExerciseId && 
                 resultClassId === currentClassId &&
                 resultStudentId !== currentStudentId; // Exclude current student's result
        });
        
        console.log('Same exercise results found:', sameExerciseResults.length);
        
        if (sameExerciseResults.length > 0) {
          const totalTime = (sameExerciseResults || []).reduce((sum, r) => sum + (r.resultsSummary?.totalTimeSpentSeconds * 1000 || r.totalTimeSpent || 0), 0);
          const avgTime = totalTime / sameExerciseResults.length;
          const avgScore = (sameExerciseResults || []).reduce((sum, r) => sum + (r.resultsSummary?.meanPercentageScore || r.scorePercentage || 0), 0) / sameExerciseResults.length;
          
          // Calculate per-question averages
          const questionAverages: any = {};
          const questions = exerciseData.questions || [];
          console.log('Questions to process:', questions.length);
          
          if (questions.length > 0) {
            try {
              questions.forEach((question: any, index: number) => {
                console.log(`Processing question ${index + 1}/${questions.length}:`, question.id);
                
                const questionTimes = (sameExerciseResults || [])
                  .map(r => (r.questionResults || []).find((qr: any) => qr.questionId === question.id)?.timeSpent || 0)
                  .filter(time => time > 0);
                
                const questionAttempts = (sameExerciseResults || [])
                  .map(r => (r.questionResults || []).find((qr: any) => qr.questionId === question.id)?.attempts || 1)
                  .filter(attempts => attempts > 0);
                
                questionAverages[question.id] = {
                  averageTime: questionTimes.length > 0 ? questionTimes.reduce((sum, time) => sum + time, 0) / questionTimes.length : 0,
                  averageAttempts: questionAttempts.length > 0 ? questionAttempts.reduce((sum, attempts) => sum + attempts, 0) / questionAttempts.length : 1,
                  totalStudents: questionTimes.length
                };
              });
              console.log('Successfully processed all questions');
            } catch (error) {
              console.error('Error processing questions in calculateClassAverages:', error);
              console.log('Questions data:', questions);
              console.log('SameExerciseResults data:', sameExerciseResults);
            }
          }
          
          setClassAverages({
            averageTime: avgTime,
            averageScore: avgScore,
            totalStudents: sameExerciseResults.length,
            questionAverages: questionAverages
          });
          console.log('Class averages set successfully');
        } else {
          console.log('No same exercise results found, skipping class averages');
        }
      } else {
        console.log('No allResults.data available');
      }
    } catch (error) {
      console.error('Failed to calculate class averages:', error);
      console.log('Error details:', error);
    }
  };

  // Generate direct analysis without Gemini dependency
  const generateDirectAnalysis = async (resultData: any) => {
    try {
      console.log('Generating direct analysis for result:', resultData.exerciseResultId);
      
      const questionResults = resultData.questionResults || [];
      const resultsSummary = resultData.resultsSummary || {};
      const studentInfo = resultData.studentInfo || {};
      const exerciseInfo = resultData.exerciseInfo || {};
      
      // Calculate basic metrics
      const totalQuestions = questionResults.length;
      const totalCorrect = resultsSummary.totalCorrect || 0;
      const totalIncorrect = resultsSummary.totalIncorrect || 0;
      const score = resultsSummary.meanPercentageScore || 0;
      const totalAttempts = resultsSummary.totalAttempts || 0;
      const totalTime = resultsSummary.totalTimeSpentSeconds || 0;
      const avgAttemptsPerQuestion = resultsSummary.meanAttemptsPerItem || 0;
      const avgTimePerQuestion = resultsSummary.meanTimePerItemSeconds || 0;
      
      // Determine performance level
      let performanceLevel = 'Needs Improvement';
      let performanceDescription = 'The student needs more practice with this topic.';
      let grade = 'D';
      
      if (score >= 90) {
        performanceLevel = 'Excellent';
        performanceDescription = 'Outstanding performance! The student has mastered this topic.';
        grade = 'A+';
      } else if (score >= 80) {
        performanceLevel = 'Very Good';
        performanceDescription = 'Great work! The student shows strong understanding.';
        grade = 'A';
      } else if (score >= 70) {
        performanceLevel = 'Good';
        performanceDescription = 'Good progress! The student understands most concepts.';
        grade = 'B';
      } else if (score >= 60) {
        performanceLevel = 'Satisfactory';
        performanceDescription = 'The student is making progress but needs more practice.';
        grade = 'C';
      } else {
        performanceLevel = 'Needs Improvement';
        performanceDescription = 'The student needs additional support and practice.';
        grade = 'D';
      }
      
      // Calculate efficiency
      const efficiencyScore = avgAttemptsPerQuestion <= 1.5 ? 90 : 
                            avgAttemptsPerQuestion <= 2.5 ? 70 : 
                            avgAttemptsPerQuestion <= 3.5 ? 50 : 30;
      
      // Calculate consistency
      const correctRate = totalQuestions > 0 ? (totalCorrect / totalQuestions) * 100 : 0;
      const consistencyScore = correctRate >= 80 ? 90 : 
                              correctRate >= 60 ? 70 : 
                              correctRate >= 40 ? 50 : 30;
      
      // Generate insights
      const insights = {
        accuracy: {
          score: Math.round(correctRate),
          description: correctRate >= 80 ? 'High accuracy' : 
                      correctRate >= 60 ? 'Good accuracy' : 
                      correctRate >= 40 ? 'Fair accuracy' : 'Low accuracy'
        },
        efficiency: {
          score: efficiencyScore,
          description: efficiencyScore >= 80 ? 'Very efficient' : 
                      efficiencyScore >= 60 ? 'Efficient' : 
                      efficiencyScore >= 40 ? 'Moderately efficient' : 'Needs improvement'
        },
        consistency: {
          score: consistencyScore,
          description: consistencyScore >= 80 ? 'Very consistent' : 
                      consistencyScore >= 60 ? 'Consistent' : 
                      consistencyScore >= 40 ? 'Somewhat consistent' : 'Inconsistent'
        },
        learningPace: {
          score: Math.round((efficiencyScore + consistencyScore) / 2),
          description: avgTimePerQuestion <= 10 ? 'Fast learner' : 
                      avgTimePerQuestion <= 20 ? 'Normal pace' : 'Takes time to process'
        }
      };
      
      // Generate strengths and areas for improvement
      const strengths = [];
      const areasForImprovement = [];
      
      if (correctRate >= 80) {
        strengths.push('Shows strong understanding of the concepts');
      }
      if (efficiencyScore >= 80) {
        strengths.push('Completes tasks efficiently');
      }
      if (consistencyScore >= 80) {
        strengths.push('Performs consistently across questions');
      }
      if (avgTimePerQuestion <= 15) {
        strengths.push('Works at a good pace');
      }
      
      if (correctRate < 70) {
        areasForImprovement.push('Needs more practice with basic concepts');
      }
      if (efficiencyScore < 60) {
        areasForImprovement.push('Should work on reducing attempts per question');
      }
      if (consistencyScore < 60) {
        areasForImprovement.push('Needs to maintain consistent performance');
      }
      if (avgTimePerQuestion > 25) {
        areasForImprovement.push('Should work on improving speed');
      }
      
      // Generate recommendations
      const recommendations = {
        immediate: [
          'Review incorrect answers with the student',
          'Practice similar problems together',
          'Encourage the student to take their time'
        ],
        shortTerm: [
          'Continue practicing this topic daily',
          'Use visual aids to reinforce concepts',
          'Break down complex problems into smaller steps'
        ],
        longTerm: [
          'Build a strong foundation in basic math skills',
          'Develop problem-solving strategies',
          'Encourage independent thinking and confidence'
        ]
      };
      
      // Generate parent guidance
      const parentGuidance = {
        howToHelp: [
          'Create a quiet study space for practice',
          'Use everyday objects to practice math concepts',
          'Celebrate small victories and progress',
          'Be patient and encouraging'
        ],
        whatToWatch: [
          'Signs of frustration or giving up',
          'Difficulty understanding basic concepts',
          'Need for additional support or resources'
        ],
        whenToSeekHelp: [
          'If the student consistently struggles with basic concepts',
          'When frustration affects their confidence',
          'If progress stalls for more than a week'
        ]
      };
      
      // Generate next steps
      const nextSteps = [
        'Review the exercise results together',
        'Practice similar problems at home',
        'Set small, achievable goals for improvement',
        'Schedule regular practice sessions',
        'Monitor progress and adjust approach as needed'
      ];
      
      // Create the analysis object
      const analysis = {
        overallPerformance: {
          level: performanceLevel,
          description: performanceDescription,
          score: Math.round(score),
          grade: grade,
          interpretation: `${studentInfo.name || 'The student'} scored ${Math.round(score)}% on ${exerciseInfo.title || 'this exercise'}. ${performanceDescription}`
        },
        performanceInsights: insights,
        strengths: strengths.length > 0 ? strengths : ['Shows effort and determination'],
        areasForImprovement: areasForImprovement.length > 0 ? areasForImprovement : ['Continue practicing regularly'],
        learningRecommendations: recommendations,
        parentGuidance: parentGuidance,
        nextSteps: nextSteps,
        callToAction: 'Work together to build confidence and improve math skills through regular practice and positive reinforcement.'
      };
      
      console.log('Direct analysis generated successfully');
      setGeminiAnalysis(analysis);
      
    } catch (error) {
      console.error('Error generating direct analysis:', error);
      // Set a basic fallback analysis
      setGeminiAnalysis({
        overallPerformance: {
          level: 'Analysis Unavailable',
          description: 'Unable to generate detailed analysis at this time.',
          score: 0,
          grade: 'N/A',
          interpretation: 'Please try again later or contact support if the issue persists.'
        },
        performanceInsights: {
          accuracy: { score: 0, description: 'Data unavailable' },
          efficiency: { score: 0, description: 'Data unavailable' },
          consistency: { score: 0, description: 'Data unavailable' },
          learningPace: { score: 0, description: 'Data unavailable' }
        },
        strengths: ['Student completed the exercise'],
        areasForImprovement: ['Continue practicing regularly'],
        learningRecommendations: {
          immediate: ['Review the exercise together'],
          shortTerm: ['Practice similar problems'],
          longTerm: ['Build strong math foundations']
        },
        parentGuidance: {
          howToHelp: ['Encourage regular practice'],
          whatToWatch: ['Monitor progress'],
          whenToSeekHelp: ['If concerns arise']
        },
        nextSteps: ['Continue learning and practicing'],
        callToAction: 'Keep encouraging your child\'s learning journey!'
      });
    }
  };

  const generateGeminiAnalysis = async (resultData: any) => {
    try {
      const geminiApiKey = "AIzaSyDsUXZXUDTMRQI0axt_A9ulaSe_m-HQvZk";
      
      // Prepare comprehensive performance data for analysis
      const performanceData = {
        score: resultData.scorePercentage || resultData.resultsSummary?.meanPercentageScore || 0,
        totalQuestions: resultData.totalQuestions || resultData.resultsSummary?.totalItems || 0,
        timeSpent: resultData.totalTimeSpent || resultData.resultsSummary?.totalTimeSpentSeconds * 1000 || 0,
        questionResults: resultData.questionResults || [],
        classAverage: classAverages?.averageScore || 0,
        classAverageTime: classAverages?.averageTime || 0,
        // Additional data from new structure
        totalAttempts: resultData.resultsSummary?.totalAttempts || 0,
        totalCorrect: resultData.resultsSummary?.totalCorrect || 0,
        totalIncorrect: resultData.resultsSummary?.totalIncorrect || 0,
        meanAttemptsPerItem: resultData.resultsSummary?.meanAttemptsPerItem || 0,
        meanTimePerItemSeconds: resultData.resultsSummary?.meanTimePerItemSeconds || 0,
        remarks: resultData.resultsSummary?.remarks || 'No remarks',
        // Student and exercise info
        studentName: resultData.studentInfo?.name || 'Student',
        exerciseTitle: resultData.exerciseInfo?.title || 'Math Exercise',
        exerciseCategory: resultData.exerciseInfo?.category || 'Mathematics',
        // Device and session info
        deviceInfo: resultData.deviceInfo || {},
        exerciseSession: resultData.exerciseSession || {}
      };
      
      const prompt = `You are an expert educational psychologist analyzing a Grade 1 student's math exercise performance. Provide a comprehensive analysis in JSON format.

STUDENT INFORMATION:
- Student Name: ${performanceData.studentName}
- Exercise: ${performanceData.exerciseTitle}
- Category: ${performanceData.exerciseCategory}

PERFORMANCE SUMMARY:
- Overall Score: ${performanceData.score}%
- Total Questions: ${performanceData.totalQuestions}
- Questions Correct: ${performanceData.totalCorrect}
- Questions Incorrect: ${performanceData.totalIncorrect}
- Total Time Spent: ${Math.round(performanceData.timeSpent / 1000)} seconds
- Total Attempts: ${performanceData.totalAttempts}
- Average Attempts per Question: ${performanceData.meanAttemptsPerItem.toFixed(1)}
- Average Time per Question: ${performanceData.meanTimePerItemSeconds.toFixed(1)} seconds
- Performance Remarks: ${performanceData.remarks}

CLASS COMPARISON:
- Class Average Score: ${Math.round(performanceData.classAverage)}%
- Class Average Time: ${Math.round(performanceData.classAverageTime / 1000)} seconds

PERFORMANCE RANKING DATA:
${performanceRanking?.currentStudent ? `
- Percentile: ${performanceRanking.currentStudent.percentile}th percentile
- Overall Performance Score: ${Math.round(performanceRanking.currentStudent.overallScore)}/100
- Efficiency Score: ${Math.round(performanceRanking.currentStudent.efficiencyScore)}/100 (attempts and time efficiency)
- Consistency Score: ${Math.round(performanceRanking.currentStudent.consistencyScore)}/100 (performance consistency)
- Mastery Score: ${Math.round(performanceRanking.currentStudent.masteryScore * 100)}/100 (quick correct answers)
- Quick Correct Answers: ${performanceRanking.currentStudent.quickCorrectAnswers}/${performanceData.totalQuestions} questions
- Average Attempts per Question: ${performanceRanking.currentStudent.avgAttemptsPerQuestion.toFixed(1)}
- Average Time per Question: ${Math.round(performanceRanking.currentStudent.avgTimePerQuestion / 1000)}s
- Performance Level: ${performanceRanking.performanceLevel}

CLASS COMPARISON:
- Class Average Efficiency: ${Math.round(performanceRanking.classStats.averageEfficiency)}/100
- Class Average Consistency: ${Math.round(performanceRanking.classStats.averageConsistency)}/100
- Class Average Mastery: ${Math.round(performanceRanking.classStats.averageMastery * 100)}/100
- Class Average Overall Score: ${Math.round(performanceRanking.classStats.averageOverallScore)}/100
` : '- Performance ranking data not available'}

DETAILED QUESTION RESULTS:
${(performanceData.questionResults || []).map((q: any, idx: number) => {
  const classAvg = classAverages?.questionAverages?.[q.questionId];
  return `Question ${q.questionNumber}: ${q.isCorrect ? 'CORRECT' : 'INCORRECT'} (${q.attempts} attempts, ${Math.round(q.timeSpent / 1000)}s)
   Question Text: "${q.questionText}"
   Question Type: ${q.questionType}
   ${q.options && q.options.length > 0 ? `Options: ${q.options.join(', ')}` : ''}
   Student Answer: "${serializeReorderAnswerPattern(q, q.studentAnswer)}"
   Correct Answer: "${serializeReorderAnswerPattern(q, q.correctAnswer)}"
   ${q.questionImage ? `Image: ${q.questionImage}` : ''}
   
   ENHANCED PERFORMANCE DATA:
   - Difficulty Level: ${q.metadata?.difficulty || 'medium'}
   - Topic Tags: ${q.metadata?.topicTags?.join(', ') || 'none'}
   - Cognitive Load: ${q.metadata?.cognitiveLoad || 'medium'}
   - Question Complexity: ${q.metadata?.questionComplexity || 'medium'}
   - Total Hesitation Time: ${Math.round((q.totalHesitationTime || 0) / 1000)}s
   - Average Confidence: ${q.averageConfidence?.toFixed(1) || '2.0'} (1=low, 2=medium, 3=high)
   - Significant Changes: ${q.significantChanges || 0}
   - Phase Distribution: Reading(${q.phaseDistribution?.reading || 0}), Thinking(${q.phaseDistribution?.thinking || 0}), Answering(${q.phaseDistribution?.answering || 0}), Reviewing(${q.phaseDistribution?.reviewing || 0})
   
   INTERACTION PATTERNS:
   - Total Interactions: ${q.totalInteractions || 0}
   - Option Clicks: ${q.interactionTypes?.optionClicks || 0}
   - Help Used: ${q.interactionTypes?.helpUsed || 0} (Help Button: ${q.helpUsage?.helpButtonClicks || 0})
   - Answer Changes: ${q.interactionTypes?.answerChanges || 0}
   
   TIME BREAKDOWN:
   - Reading Time: ${Math.round((q.timeBreakdown?.readingTime || 0) / 1000)}s
   - Thinking Time: ${Math.round((q.timeBreakdown?.thinkingTime || 0) / 1000)}s
   - Answering Time: ${Math.round((q.timeBreakdown?.answeringTime || 0) / 1000)}s
   - Reviewing Time: ${Math.round((q.timeBreakdown?.reviewingTime || 0) / 1000)}s
   - Time to First Answer: ${Math.round((q.timeBreakdown?.timeToFirstAnswer || 0) / 1000)}s
   - Time to Final Answer: ${Math.round((q.timeBreakdown?.timeToFinalAnswer || 0) / 1000)}s
   
   ${q.attemptHistory && q.attemptHistory.length > 0 ? `Attempt History: ${(q.attemptHistory || []).map((a: any) => {
     const answerData = a.selectedAnswer || a.answer || a.answerValue || a.studentAnswer || a.finalAnswer || a.userAnswer || a.response;
     const serializedAnswer = serializeReorderAnswerPattern(q, answerData) || 'blank';
     return `"${serializedAnswer}" (${Math.round((a.timeSpent || 0) / 1000)}s, ${a.attemptType}, ${a.questionPhase}, confidence: ${a.confidence})`;
   }).join(', ')}` : ''}
   ${classAvg ? `Class Average Time: ${Math.round(classAvg.averageTime / 1000)}s, Class Average Attempts: ${Math.round(classAvg.averageAttempts)}` : ''}`;
}).join('\n\n')}


ANALYSIS REQUIREMENTS:
1. Analyze the student's performance ranking and percentile within the class
2. Compare efficiency, consistency, and mastery scores against class averages
3. Identify specific areas where the student excels or needs improvement based on ranking data
4. Consider the student's position relative to peers (rank, percentile) in recommendations
5. Analyze each specific question with enhanced performance data and ranking context
6. Identify patterns in hesitation time, confidence levels, and interaction patterns
7. Look for correlations between question difficulty, cognitive load, and student performance
8. Analyze phase distribution to understand where students spend most time (reading, thinking, answering, reviewing)
9. Consider interaction patterns (help usage, option clicks, answer changes) in your analysis
10. Provide specific recommendations based on performance ranking and class comparison
11. Focus on the specific math concepts, difficulty levels, and cognitive demands in the questions
12. Consider the student's confidence levels, hesitation patterns, and class standing in recommendations

Please provide analysis in this JSON format:
{
  "overallPerformance": {
    "level": "excellent|good|needs_improvement|struggling",
    "description": "Brief overall assessment in Tagalog for parents based on specific questions answered",
    "score": ${performanceData.score},
    "grade": "A+|A|B+|B|C+|C|D|F",
    "interpretation": "Detailed interpretation of what this score means for the student's learning"
  },
  "performanceInsights": {
    "accuracy": "Analysis of how many questions were answered correctly",
    "efficiency": "Analysis of time spent vs attempts made",
    "consistency": "Analysis of performance across different question types",
    "learningPace": "Analysis of how quickly the student learns and applies concepts"
  },
  "strengths": [
    "List 3-4 specific strengths in Tagalog based on the actual questions (e.g., 'Mahusay sa pagbibilang ng mga numero', 'Mabilis sa pag-identify ng mga hugis')"
  ],
  "areasForImprovement": [
    "List 3-4 specific areas needing improvement in Tagalog based on actual questions (e.g., 'Kailangan pa ng practice sa subtraction', 'Medyo mabagal sa word problems')"
  ],
  "questionAnalysis": [
    "For each question that took longer or more attempts, provide specific analysis in Tagalog"
  ],
  "timeAnalysis": {
    "studentTime": ${Math.round(performanceData.timeSpent / 1000)},
    "classAverage": ${Math.round(performanceData.classAverageTime / 1000)},
    "comparison": "faster|slower|similar",
    "description": "Analysis of time performance in Tagalog based on specific questions",
    "efficiency": "How efficiently the student used their time"
  },
  "learningRecommendations": {
    "immediate": [
      "2-3 immediate actions parents can take this week"
    ],
    "shortTerm": [
      "2-3 goals for the next month"
    ],
    "longTerm": [
      "2-3 long-term learning objectives"
    ]
  },
  "parentGuidance": {
    "howToHelp": [
      "Specific ways parents can support their child's learning"
    ],
    "whatToWatch": [
      "Signs to look for that indicate progress or struggles"
    ],
    "whenToSeekHelp": [
      "When parents should consider additional support"
    ]
  },
  "nextSteps": [
    "Specific next steps for continued learning and improvement"
  ],
  "encouragement": "A positive, encouraging message in Tagalog for the student based on their specific performance",
  "callToAction": "A clear call to action for parents on what to do next"
}

Focus on:
1. Use Tagalog language for parents to understand
2. Reference specific questions and math concepts from the exercise
3. Analyze patterns in the actual questions answered
4. Provide specific guidance based on the question types and content
5. Make recommendations relevant to the specific skills tested
6. Cultural sensitivity for Filipino families`;

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [{
              parts: [{
                text: prompt
              }]
            }]
          })
        }
      );

      const data = await response.json();
      if (data.candidates && data.candidates[0] && data.candidates[0].content) {
        let analysisText = data.candidates[0].content.parts[0].text;
        
        // Clean up the response text to extract JSON
        analysisText = analysisText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        
        // Remove any leading/trailing text that's not JSON
        const jsonStart = analysisText.indexOf('{');
        const jsonEnd = analysisText.lastIndexOf('}');
        
        if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
          analysisText = analysisText.substring(jsonStart, jsonEnd + 1);
        }
        
        // Additional cleaning for common issues
        analysisText = analysisText
          .replace(/,\s*}/g, '}')  // Remove trailing commas
          .replace(/,\s*]/g, ']')  // Remove trailing commas in arrays
          .replace(/\n/g, ' ')     // Replace newlines with spaces
          .replace(/\s+/g, ' ')    // Replace multiple spaces with single space
          .trim();
        
        try {
          const analysis = JSON.parse(analysisText);
          setGeminiAnalysis(analysis);
        } catch (parseError) {
          console.error('Failed to parse Gemini response:', parseError);
          
          // Try to extract partial data from the response
          try {
            const fallbackAnalysis = {
              overallPerformance: {
                level: performanceData.score >= 80 ? 'excellent' : performanceData.score >= 60 ? 'good' : 'needs_improvement',
                description: `Nakakuha ang bata ng ${performanceData.score}% sa pagsusulit na ito.`,
                score: performanceData.score
              },
              strengths: ['Nakumpleto ang lahat ng tanong', 'Nagpakita ng pagsisikap'],
              weaknesses: ['Kailangan pa ng karagdagang pagsasanay sa ilang tanong'],
              questionAnalysis: ['Ang bata ay nakasagot nang tama sa lahat ng tanong'],
              timeAnalysis: {
                studentTime: Math.round(performanceData.timeSpent / 1000),
                classAverage: Math.round(performanceData.classAverageTime / 1000),
                comparison: 'similar',
                description: 'Ang bilis ng pagsagot ay nasa normal na saklaw'
              },
              recommendations: ['Mag-practice pa ng mga katulad na pagsasanay', 'Magbasa nang mabuti ang mga tanong'],
              encouragement: 'Magaling! Nakumpleto mo ang pagsasanay na ito! Patuloy na mag-practice para mas lalong gumaling!'
            };
            setGeminiAnalysis(fallbackAnalysis);
          } catch (fallbackError) {
            console.error('Fallback analysis failed:', fallbackError);
            // Use minimal fallback
            setGeminiAnalysis({
              overallPerformance: {
                level: 'good',
                description: 'Nakumpleto ang pagsusulit',
                score: performanceData.score
              },
              strengths: ['Nakumpleto ang lahat ng tanong'],
              weaknesses: ['Kailangan pa ng practice'],
              questionAnalysis: ['Nakasagot nang tama sa lahat ng tanong'],
              timeAnalysis: {
                studentTime: Math.round(performanceData.timeSpent / 1000),
                classAverage: Math.round(performanceData.classAverageTime / 1000),
                comparison: 'similar',
                description: 'Normal na bilis'
              },
              recommendations: ['Mag-practice pa'],
              encouragement: 'Magaling!'
            });
          }
        }
      }
    } catch (error) {
      console.error('Failed to generate Gemini analysis:', error);
      // Fallback analysis
      setGeminiAnalysis({
        overallPerformance: {
          level: resultData.scorePercentage >= 80 ? 'excellent' : resultData.scorePercentage >= 60 ? 'good' : 'needs_improvement',
          description: `Nakakuha ang bata ng ${resultData.scorePercentage}% sa pagsusulit na ito.`,
          score: resultData.scorePercentage
        },
        strengths: ['Nakumpleto ang lahat ng tanong', 'Nagpakita ng pagsisikap'],
        weaknesses: ['Kailangan pa ng karagdagang pagsasanay sa ilang tanong'],
        questionAnalysis: ['Ang bata ay nakasagot nang tama sa lahat ng tanong'],
        timeAnalysis: {
          studentTime: Math.round(resultData.totalTimeSpent / 1000),
          classAverage: 0,
          comparison: 'similar',
          description: 'Ang bilis ng pagsagot ay nasa normal na saklaw'
        },
        recommendations: ['Mag-practice pa ng mga katulad na pagsasanay', 'Magbasa nang mabuti ang mga tanong'],
        encouragement: 'Magaling! Nakumpleto mo ang pagsasanay na ito! Patuloy na mag-practice para mas lalong gumaling!'
      });
    }
  };

  const handleBackToHistory = () => {
    setShowQuestionResult(false);
    setSelectedResult(null);
    setGeminiAnalysis(null);
    setClassAverages(null);
  };


  // Question navigation functions
  const handleNextQuestion = () => {
    if (selectedResult?.questionResults && currentQuestionIndex < selectedResult.questionResults.length - 1) {
      animateQuestionTransition(() => {
        setCurrentQuestionIndex(currentQuestionIndex + 1);
      });
    }
  };

  const handlePreviousQuestion = () => {
    if (currentQuestionIndex > 0) {
      animateQuestionTransition(() => {
        setCurrentQuestionIndex(currentQuestionIndex - 1);
      });
    }
  };

  const handleQuestionIndexChange = (index: number) => {
    if (index !== currentQuestionIndex) {
      animateQuestionTransition(() => {
        setCurrentQuestionIndex(index);
      });
    }
  };

  // Animation function for smooth transitions
  const animateQuestionTransition = (callback: () => void) => {
    setIsTransitioning(true);
    
    Animated.parallel([
      Animated.timing(questionFadeAnim, {
        toValue: 0.3,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start(() => {
      callback();
      
      Animated.parallel([
        Animated.timing(questionFadeAnim, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setIsTransitioning(false);
      });
    });
  };

  // Reset question index when result changes
  useEffect(() => {
    if (selectedResult) {
      setCurrentQuestionIndex(0);
    }
  }, [selectedResult]);

  // Swipe gesture handling for question navigation
  const questionPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: (evt, gestureState) => {
        // Don't capture initially - let ScrollView handle vertical gestures
        return false;
      },
      onStartShouldSetPanResponderCapture: (evt, gestureState) => {
        // Don't capture initially
        return false;
      },
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        // Only respond to horizontal swipes with sufficient movement
        // Allow vertical scrolling by not capturing vertical gestures
        const isHorizontal = Math.abs(gestureState.dx) > Math.abs(gestureState.dy) && Math.abs(gestureState.dx) > 20;
        const hasMultipleQuestions = selectedResult?.questionResults && selectedResult.questionResults.length > 1;
        console.log('onMoveShouldSetPanResponder:', isHorizontal, 'dx:', gestureState.dx, 'dy:', gestureState.dy, 'hasMultiple:', hasMultipleQuestions);
        return isHorizontal && hasMultipleQuestions;
      },
      onMoveShouldSetPanResponderCapture: (evt, gestureState) => {
        // Only capture clear horizontal movements
        const isHorizontal = Math.abs(gestureState.dx) > Math.abs(gestureState.dy) && Math.abs(gestureState.dx) > 20;
        const hasMultipleQuestions = selectedResult?.questionResults && selectedResult.questionResults.length > 1;
        console.log('onMoveShouldSetPanResponderCapture:', isHorizontal, 'hasMultiple:', hasMultipleQuestions);
        return isHorizontal && hasMultipleQuestions;
      },
      onPanResponderGrant: () => {
        console.log('Pan responder granted');
      },
      onPanResponderMove: (evt, gestureState) => {
        // Optional: Add visual feedback during swipe
        console.log('Pan responder move:', gestureState.dx);
      },
      onPanResponderRelease: (evt, gestureState) => {
        const { dx } = gestureState;
        const threshold = 30; // Reduced threshold for better sensitivity
        
        console.log('Pan responder release:', dx, 'threshold:', threshold);
        
        // Only navigate if we have multiple questions
        if (selectedResult?.questionResults && selectedResult.questionResults.length > 1) {
          if (dx > threshold) {
            // Swipe right - go to previous question
            console.log('Swipe right - previous question');
            handlePreviousQuestion();
          } else if (dx < -threshold) {
            // Swipe left - go to next question
            console.log('Swipe left - next question');
            handleNextQuestion();
          }
        }
      },
      onPanResponderTerminate: () => {
        console.log('Pan responder terminated');
      },
    })
  ).current;

  // Helper function to get student class ID
  const getStudentClassId = async (): Promise<string | null> => {
    if (!parentData?.parentKey) {
      console.warn('getStudentClassId: No parent key available');
      return null;
    }
    
    try {
      // Resolve parent key to actual parent ID
      const parentIdResult = await readData(`/parentLoginCodes/${parentData.parentKey}`);
      if (parentIdResult.data) {
        const actualParentId = parentIdResult.data;
        console.log('getStudentClassId: Resolved parent key to parent ID:', actualParentId);
        
        // Find the student associated with this parent
        const studentsData = await readData('/students');
        if (studentsData.data) {
          const student = Object.values(studentsData.data).find((s: any) => s.parentId === actualParentId) as any;
          if (student && student.classId) {
            console.log('getStudentClassId: Found student class ID:', student.classId, 'for parent:', actualParentId);
            return student.classId;
          } else {
            console.warn('getStudentClassId: No student found with parentId:', actualParentId);
          }
        } else {
          console.warn('getStudentClassId: No students data available');
        }
      } else {
        console.warn('getStudentClassId: Invalid parent key, no mapping found:', parentData.parentKey);
      }
    } catch (error) {
      console.error('getStudentClassId: Error retrieving student class information:', error);
    }
    
    return null;
  };

  // Helper function to get student ID
  const getStudentId = async (): Promise<string | null> => {
    if (!parentData?.parentKey) {
      console.warn('getStudentId: No parent key available');
      return null;
    }
    
    try {
      // Resolve parent key to actual parent ID
      const parentIdResult = await readData(`/parentLoginCodes/${parentData.parentKey}`);
      if (parentIdResult.data) {
        const actualParentId = parentIdResult.data;
        console.log('getStudentId: Resolved parent key to parent ID:', actualParentId);
        
        // Find the student associated with this parent
        const studentsData = await readData('/students');
        if (studentsData.data) {
          const student = Object.values(studentsData.data).find((s: any) => s.parentId === actualParentId) as any;
          if (student && student.studentId) {
            console.log('getStudentId: Found student ID:', student.studentId, 'for parent:', actualParentId);
            return student.studentId;
          } else {
            console.warn('getStudentId: No student found with parentId:', actualParentId);
          }
        } else {
          console.warn('getStudentId: No students data available');
        }
      } else {
        console.warn('getStudentId: Invalid parent key, no mapping found:', parentData.parentKey);
      }
    } catch (error) {
      console.error('getStudentId: Error retrieving student ID:', error);
    }
    
    return null;
  };

  // Helper function to get actual parent ID
  const getActualParentId = async (): Promise<string | null> => {
    if (!parentData?.parentKey) {
      console.warn('getActualParentId: No parent key available');
      return null;
    }
    
    try {
      // Resolve parent key to actual parent ID
      const parentIdResult = await readData(`/parentLoginCodes/${parentData.parentKey}`);
      if (parentIdResult.data) {
        const actualParentId = parentIdResult.data;
        console.log('getActualParentId: Resolved parent key to parent ID:', actualParentId);
        return actualParentId;
      } else {
        console.warn('getActualParentId: Invalid parent key, no mapping found:', parentData.parentKey);
      }
    } catch (error) {
      console.error('getActualParentId: Error retrieving actual parent ID:', error);
    }
    
    return null;
  };

  const loadAssignedExercises = async () => {
    try {
      // Get the student's class information
      const studentClassId = await getStudentClassId();

      const result = await readData('/assignedExercises');
      if (result.data) {
        const assignedExercisesList = Object.entries(result.data).map(([key, value]: [string, any]) => ({
          ...value,
          id: key
        })) as AssignedExercise[];
        
        // Filter assigned exercises by student's class and update status
        const filteredAssignedExercises = studentClassId 
          ? assignedExercisesList
              .filter(assignedExercise => assignedExercise.classId === studentClassId)
              .map(assignedExercise => {
                // Update status based on deadline and acceptLateSubmissions
                const now = new Date();
                const deadline = new Date(assignedExercise.deadline);
                const isOverdue = now > deadline;
                
                let newStatus = assignedExercise.acceptingStatus;
                
                if (isOverdue) {
                  // If overdue and not accepting late submissions, should be closed
                  // But only if it wasn't manually updated (respect manual overrides)
                  // Default to true (accept late submissions) if undefined
                  if (!(assignedExercise.acceptLateSubmissions ?? true) && 
                      assignedExercise.acceptingStatus === 'open' && 
                      !assignedExercise.manuallyUpdated) {
                    newStatus = 'closed';
                  }
                }
                
                return {
                  ...assignedExercise,
                  acceptingStatus: newStatus,
                };
              })
          : [];
        
        console.log(`Filtered ${filteredAssignedExercises.length} assigned exercises for class ${studentClassId}`);
        
        // If no student class found, show warning but don't crash
        if (!studentClassId) {
          console.warn('No student class found for parent - no assigned exercises will be shown');
        }
        
        // Load exercise and teacher data for each assigned exercise
        const assignedExercisesWithData = await Promise.all(
          filteredAssignedExercises.map(async (assignedExercise) => {
            try {
              // Load exercise data
              const exerciseResult = await readData(`/exercises/${assignedExercise.exerciseId}`);
              let exerciseData = null;
              if (exerciseResult.data) {
                exerciseData = {
                  ...exerciseResult.data,
                  id: assignedExercise.exerciseId
                };
              }
              
              // Load teacher data
              const teacherResult = await readData(`/teachers/${assignedExercise.assignedBy}`);
              let teacherData = null;
              if (teacherResult.data) {
                teacherData = {
                  teacherName: teacherResult.data.firstName + ' ' + teacherResult.data.lastName,
                  teacherProfilePictureUrl: teacherResult.data.profilePictureUrl,
                  teacherGender: teacherResult.data.gender
                };
              }
              
              return {
                ...assignedExercise,
                exercise: exerciseData,
                ...teacherData
              };
            } catch (error) {
              console.error('Failed to load data for assigned exercise:', error);
            }
            return assignedExercise;
          })
        );
        
        return assignedExercisesWithData;
      }
      return [];
    } catch (error) {
      console.error('Failed to load assigned exercises:', error);
      return [];
    }
  };

  const loadTasks = async () => {
    try {
      setTasksLoading(true);
      
      // Get student class ID, student ID, and actual parent ID for filtering
      console.log('loadTasks: Starting to load tasks for parent:', parentData?.parentKey);
      const [studentClassId, studentId, actualParentId] = await Promise.all([
        getStudentClassId(),
        getStudentId(),
        getActualParentId()
      ]);
      
      console.log('loadTasks: Retrieved studentClassId:', studentClassId, 'studentId:', studentId, 'actualParentId:', actualParentId);
      
      if (!studentClassId || !studentId) {
        console.error('loadTasks: Missing required data - studentClassId:', studentClassId, 'studentId:', studentId);
        setTasksLoading(false);
        setInitialTasksLoaded(true); // Mark as loaded even if no data
        return;
      }
      
      console.log('loadTasks: Successfully identified student. ClassId:', studentClassId, 'StudentId:', studentId, 'ActualParentId:', actualParentId);
      
      // Load tasks, assigned exercises, and exercise results
      const [tasksResult, assignedExercises, exerciseResultsResult] = await Promise.all([
        readData('/tasks'),
        loadAssignedExercises(),
        readData('/ExerciseResults')
      ]);
      
      let allTasks: Task[] = [];
      
      // Process regular tasks
      if (tasksResult.data) {
        const tasksList = Object.entries(tasksResult.data).map(([key, value]: [string, any]) => ({
          ...value,
          id: key
        })) as Task[];
        
        // Filter tasks by student's class
        const filteredTasks = studentClassId 
          ? tasksList.filter(task => task.classIds && task.classIds.includes(studentClassId))
          : [];
        
        console.log(`Filtered ${filteredTasks.length} regular tasks for class ${studentClassId}`);
        
        // Load teacher data for each filtered task
        const tasksWithTeacherData = await Promise.all(
          filteredTasks.map(async (task) => {
            try {
              const teacherResult = await readData(`/teachers/${task.teacherId}`);
              if (teacherResult.data) {
                return {
                  ...task,
                  teacherName: teacherResult.data.firstName + ' ' + teacherResult.data.lastName,
                  teacherProfilePictureUrl: teacherResult.data.profilePictureUrl,
                  teacherGender: teacherResult.data.gender
                };
              }
            } catch (error) {
              console.error('Failed to load teacher data for task:', error);
            }
            return task;
          })
        );
        
        allTasks = [...tasksWithTeacherData];
      }
      
      // Convert assigned exercises to tasks and check completion status from ExerciseResults
      // CRITICAL FIX: Ensure completion status is matched ONLY to the specific student
      // Previously, the logic used loose OR conditions that would match ANY student's completion
      // of an assignment, causing all parents to see exercises as completed incorrectly.
      const assignedExerciseTasks: Task[] = await Promise.all(
        assignedExercises
          .filter(assignedExercise => assignedExercise.exercise) // Only include exercises that were loaded successfully
          .map(async (assignedExercise) => {
            // Check if there's a completed result for this exercise
            let completionData = null;
            if (exerciseResultsResult.data) {
              const results = Object.values(exerciseResultsResult.data) as any[];
              console.log(`Looking for completion data for exercise ${assignedExercise.exerciseId}, assignment ${assignedExercise.id}, student ${studentId}`);
              console.log(`Available results:`, results.length);
              
              completionData = results.find((result: any) => {
                // Handle new structure: get exerciseId and assignedExerciseId from nested objects
                const resultExerciseId = result.exerciseInfo?.exerciseId || result.exerciseId;
                const resultAssignedExerciseId = result.assignmentMetadata?.assignedExerciseId || result.assignedExerciseId;
                const resultStudentId = result.studentInfo?.studentId || result.studentId;
                const resultParentId = result.assignmentMetadata?.parentId || result.parentId;
                
                // Check if this result matches the assigned exercise
                const exerciseMatches = resultExerciseId === assignedExercise.exerciseId;
                const assignmentMatches = resultAssignedExerciseId === assignedExercise.id;
                
                // CRITICAL: Must match BOTH the student AND the assignment
                // Don't use OR conditions - all must match for THIS specific student
                const studentMatches = resultStudentId === studentId;
                
                // CRITICAL FIX: Parent verification should use actualParentId (resolved ID), not login code
                // The result stores actualParentId, not the login code (parentKey)
                const parentVerified = !resultParentId || resultParentId === actualParentId;
                
                console.log(`Result ${result.exerciseResultId || result.resultId}: exerciseMatches=${exerciseMatches}, assignmentMatches=${assignmentMatches}, studentMatches=${studentMatches}, parentVerified=${parentVerified}, actualParentId=${actualParentId}, resultParentId=${resultParentId}`);
                
                // All conditions must be true - exercise, assignment, AND student must match
                return exerciseMatches && assignmentMatches && studentMatches && parentVerified;
              });
              
              if (completionData) {
                console.log(`Found completion data:`, completionData.exerciseResultId || completionData.resultId);
              } else {
                console.log(`No completion data found for exercise ${assignedExercise.exerciseId}`);
              }
            }
            
            return {
              id: assignedExercise.id,
              title: assignedExercise.exercise!.title,
              description: assignedExercise.exercise!.description,
              dueDate: assignedExercise.deadline,
              createdAt: assignedExercise.createdAt,
              teacherId: assignedExercise.assignedBy,
              classIds: [assignedExercise.classId],
              exerciseId: assignedExercise.exerciseId,
              status: completionData ? 'completed' as const : 'pending' as const,
              completedAt: completionData?.submittedAt || completionData?.exerciseSession?.completedAt,
              teacherName: assignedExercise.teacherName,
              teacherProfilePictureUrl: assignedExercise.teacherProfilePictureUrl,
              teacherGender: assignedExercise.teacherGender,
              points: assignedExercise.exercise!.questionCount,
              isAssignedExercise: true,
              assignedExerciseId: assignedExercise.id,
              score: completionData?.resultsSummary?.meanPercentageScore || completionData?.scorePercentage,
              timeSpent: completionData?.resultsSummary?.totalTimeSpentSeconds ? completionData.resultsSummary.totalTimeSpentSeconds * 1000 : completionData?.totalTimeSpent,
              resultId: completionData?.exerciseResultId || completionData?.resultId,
              quarter: assignedExercise.quarter,
              // Include student info for proper display
              studentInfo: completionData?.studentInfo || {
                studentId: completionData?.studentId,
                name: completionData?.studentName || 'Student'
              }
            };
          })
      );
      
      // Combine and sort all tasks by due date (earliest first)
      const combinedTasks = [...allTasks, ...assignedExerciseTasks];
      const sortedTasks = combinedTasks.sort((a, b) => 
        new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
      );
      
      setTasks(sortedTasks);
      setInitialTasksLoaded(true); // Mark as loaded
    } catch (error) {
      console.error('Failed to load tasks:', error);
      setInitialTasksLoaded(true); // Mark as loaded even on error
    } finally {
      setTasksLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        loadAnnouncements(),
        loadTasks()
      ]);
    } catch (error) {
      console.error('Failed to refresh data:', error);
    } finally {
      setRefreshing(false);
    }
  };

  const updateTaskStatus = async (taskId: string, status: Task['status']) => {
    try {
      const { success, error } = await writeData(`/tasks/${taskId}/status`, status);
      
      if (success) {
        // Update local state
        setTasks(prev => 
          prev.map(task => 
            task.id === taskId 
              ? { 
                  ...task, 
                  status,
                  completedAt: status === 'completed' ? new Date().toISOString() : undefined
                }
              : task
          )
        );
      } else {
        console.error('Failed to update task status:', error);
        Alert.alert('Error', 'Failed to update task status');
      }
    } catch (error) {
      console.error('Failed to update task status:', error);
      Alert.alert('Error', 'Failed to update task status');
    }
  };

  // Registration form handlers
  const handleRegistrationInputChange = (field: string, value: string) => {
    setRegistrationData(prev => ({ ...prev, [field]: value }));
  };

  const pickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Media library permission is required to select photos.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images',
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setRegistrationData(prev => ({ ...prev, profilePicture: result.assets[0].uri }));
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to pick image');
      console.error('Image picker error:', error);
    }
  };

  const takePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Camera permission is required to take photos.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setRegistrationData(prev => ({ ...prev, profilePicture: result.assets[0].uri }));
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to take photo');
      console.error('Camera error:', error);
    }
  };

  const handleRegistration = async () => {
    setRegistrationLoading(true);
    
    // Validation
    if (!registrationData.firstName || !registrationData.lastName || !registrationData.email || !registrationData.mobile) {
      Alert.alert('Error', 'Please fill in all required fields.');
      setRegistrationLoading(false);
      return;
    }
    
    try {
      const parentKey = await AsyncStorage.getItem('parent_key');
      if (!parentKey) {
        Alert.alert('Error', 'Parent key not found. Please login again.');
        setRegistrationLoading(false);
        return;
      }

      let profilePictureUrl = '';
      
      // Upload profile picture if provided
      if (registrationData.profilePicture) {
        try {
          const response = await fetch(registrationData.profilePicture);
          const blob = await response.blob();
          const timestamp = Date.now();
          const filename = `parents/profiles/${parentKey}_${timestamp}.jpg`;
          
          const { downloadURL, error: uploadError } = await uploadFile(filename, blob, {
            contentType: 'image/jpeg',
          });
          
          if (uploadError) {
            console.error('Photo upload error:', uploadError);
          } else {
            profilePictureUrl = downloadURL || '';
          }
        } catch (error) {
          console.error('Photo upload error:', error);
        }
      }
      
      // Resolve login code to actual parent ID
      const parentIdResult = await readData(`/parentLoginCodes/${parentKey}`);
      if (!parentIdResult.data) {
        Alert.alert('Error', 'Invalid parent key. Please contact your teacher.');
        setRegistrationLoading(false);
        return;
      }
      
      const actualParentId = parentIdResult.data;
      
      // Save parent data to Firebase under the correct parent ID
      const parentData = {
        firstName: registrationData.firstName,
        lastName: registrationData.lastName,
        email: registrationData.email,
        mobile: registrationData.mobile,
        profilePictureUrl: profilePictureUrl,
        parentKey: parentKey,
        createdAt: new Date().toISOString(),
        parentId: actualParentId,
        infoStatus: 'completed',
      };
      
      const { success, error: dbError } = await writeData(`/parents/${actualParentId}`, parentData);
      
      if (success) {
        Alert.alert('Success', 'Profile completed successfully!');
        setShowRegistrationModal(false);
        setParentData(parentData);
        
        // Reset form
        setRegistrationData({
          firstName: '',
          lastName: '',
          email: '',
          mobile: '',
          profilePicture: null
        });
      } else {
        Alert.alert('Error', `Failed to save parent data: ${dbError}`);
      }
    } catch (error) {
      Alert.alert('Error', 'An unexpected error occurred during registration.');
    } finally {
      setRegistrationLoading(false);
    }
  };

  // Profile modal handlers
  const openProfileModal = () => {
    if (parentData) {
      setProfileEditData({
        firstName: parentData.firstName,
        lastName: parentData.lastName,
        email: parentData.email,
        mobile: parentData.mobile,
        profilePicture: null
      });
    }
    setShowProfileModal(true);
  };

  const closeProfileModal = () => {
    setShowProfileModal(false);
  };

  const handleProfileEditInputChange = (field: string, value: string) => {
    setProfileEditData(prev => ({ ...prev, [field]: value }));
  };

  const pickProfileImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Media library permission is required to select photos.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images',
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setProfileEditData(prev => ({ ...prev, profilePicture: result.assets[0].uri }));
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to pick image');
      console.error('Image picker error:', error);
    }
  };

  const takeProfilePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Camera permission is required to take photos.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setProfileEditData(prev => ({ ...prev, profilePicture: result.assets[0].uri }));
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to take photo');
      console.error('Camera error:', error);
    }
  };

  const handleProfileUpdate = async () => {
    setProfileEditLoading(true);
    
    // Validation
    if (!profileEditData.firstName || !profileEditData.lastName || !profileEditData.email || !profileEditData.mobile) {
      Alert.alert('Error', 'Please fill in all required fields.');
      setProfileEditLoading(false);
      return;
    }
    
    try {
      const parentKey = await AsyncStorage.getItem('parent_key');
      if (!parentKey) {
        Alert.alert('Error', 'Parent key not found. Please login again.');
        setProfileEditLoading(false);
        return;
      }

      // Resolve login code to actual parent ID
      const parentIdResult = await readData(`/parentLoginCodes/${parentKey}`);
      if (!parentIdResult.data) {
        Alert.alert('Error', 'Invalid parent key. Please contact your teacher.');
        setProfileEditLoading(false);
        return;
      }
      
      const actualParentId = parentIdResult.data;

      let profilePictureUrl = parentData?.profilePictureUrl || '';
      
      // Upload new profile picture if provided
      if (profileEditData.profilePicture) {
        try {
          const response = await fetch(profileEditData.profilePicture);
          const blob = await response.blob();
          const timestamp = Date.now();
          const filename = `parents/profiles/${actualParentId}_${timestamp}.jpg`;
          
          const { downloadURL, error: uploadError } = await uploadFile(filename, blob, {
            contentType: 'image/jpeg',
          });
          
          if (uploadError) {
            console.error('Photo upload error:', uploadError);
          } else {
            profilePictureUrl = downloadURL || '';
          }
        } catch (error) {
          console.error('Photo upload error:', error);
        }
      }
      
      // Update parent data in Firebase
      const updatedParentData: ParentData = {
        ...parentData!,
        firstName: profileEditData.firstName,
        lastName: profileEditData.lastName,
        email: profileEditData.email,
        mobile: profileEditData.mobile,
        profilePictureUrl: profilePictureUrl,
      };
      
      const { success, error: dbError } = await writeData(`/parents/${actualParentId}`, updatedParentData);
      
      if (success) {
        Alert.alert('Success', 'Profile updated successfully!');
        setShowProfileModal(false);
        setParentData(updatedParentData);
      } else {
        Alert.alert('Error', `Failed to update profile: ${dbError}`);
      }
    } catch (error) {
      Alert.alert('Error', 'An unexpected error occurred while updating profile.');
    } finally {
      setProfileEditLoading(false);
    }
  };

  const handleLogout = async () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            try {
              // Don't remove parent_key from AsyncStorage to preserve it in login
              router.replace('/ParentLogin');
            } catch (error) {
              console.error('Logout error:', error);
              router.replace('/ParentLogin');
            }
          }
        }
      ]
    );
  };

  // Floating button functions
  const fadeOutFloatingButton = () => {
    Animated.timing(floatingOpacity, {
      toValue: 0.3,
      duration: 300,
      useNativeDriver: false,
    }).start();
  };
  
  const fadeInFloatingButton = () => {
    Animated.timing(floatingOpacity, {
      toValue: 1,
      duration: 200,
      useNativeDriver: false,
    }).start();
  };
  
  const resetInactivityTimer = () => {
    // Clear existing timer
    if (inactivityTimer.current) {
      clearTimeout(inactivityTimer.current);
    }
    
    // Fade in immediately
    fadeInFloatingButton();
    
    // Set new timer to fade out after 3 seconds
    inactivityTimer.current = setTimeout(() => {
      fadeOutFloatingButton();
    }, 3000);
  };
  
  // Start the initial fade out timer
  useEffect(() => {
    const initialTimer = setTimeout(() => {
      fadeOutFloatingButton();
    }, 3000);
    
    return () => {
      clearTimeout(initialTimer);
      if (inactivityTimer.current) {
        clearTimeout(inactivityTimer.current);
      }
    };
  }, []);
  
  // Shake detection with improved compatibility
  useEffect(() => {
    if (!isShakeEnabled) return;
    
    let subscription: any;
    let isSubscribed = true;
    
    const startShakeDetection = async () => {
      try {
        console.log('🚀 Starting shake detection...');
        
        // Platform check - only enable on Android/iOS
        if (Platform.OS !== 'android' && Platform.OS !== 'ios') {
          console.log('⚠️ Shake detection only available on mobile devices');
          return;
        }
        
        console.log('✓ Platform check passed:', Platform.OS);
        
        // Check if accelerometer is available with timeout
        const availabilityPromise = Accelerometer.isAvailableAsync();
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout checking accelerometer')), 2000)
        );
        
        const isAvailable = await Promise.race([availabilityPromise, timeoutPromise])
          .catch(() => false) as boolean;
        
        if (!isAvailable) {
          console.log('❌ Accelerometer not available on this device');
          return;
        }
        
        console.log('✓ Accelerometer available, threshold:', shakeThreshold);
        
        // Set update interval (60fps) - works on all Android versions
        Accelerometer.setUpdateInterval(16);
        
        subscription = Accelerometer.addListener(({ x, y, z }) => {
          if (!isSubscribed) return;
          
          // Calculate total acceleration (magnitude of acceleration vector)
          const acceleration = Math.sqrt(x * x + y * y + z * z);
          
          // Check if acceleration exceeds threshold
          if (acceleration > shakeThreshold) {
            const currentTime = Date.now();
            
            // Prevent multiple triggers within 1 second
            if (currentTime - lastShakeTime.current > 1000) {
              console.log('🔔 Shake detected! Acceleration:', acceleration.toFixed(2));
              lastShakeTime.current = currentTime;
              
              // Trigger FAB action
              handleShakeTrigger();
            }
          }
        });
      } catch (error) {
        console.log('Shake detection not available:', error);
        // Silently fail - shake is optional feature
      }
    };
    
    const handleShakeTrigger = () => {
      // Show FAB if hidden
      fadeInFloatingButton();
      resetInactivityTimer();
      
      // Open tech report modal
      setShowTechReportModal(true);
    };
    
    startShakeDetection();
    
    return () => {
      isSubscribed = false;
      if (subscription) {
        try {
          subscription.remove();
        } catch (error) {
          console.log('Error removing accelerometer subscription:', error);
        }
      }
    };
  }, [isShakeEnabled]);
  
  // PanResponder for dragging with improved tap detection
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Only set responder if moved more than 5 pixels (this allows taps to work)
        return Math.abs(gestureState.dx) > 5 || Math.abs(gestureState.dy) > 5;
      },
      onPanResponderGrant: () => {
        resetInactivityTimer();
        pan.setOffset({
          x: (pan.x as any)._value,
          y: (pan.y as any)._value,
        });
        pan.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: Animated.event(
        [null, { dx: pan.x, dy: pan.y }],
        { useNativeDriver: false }
      ),
      onPanResponderRelease: (_, gesture) => {
        pan.flattenOffset();
        
        // Check if this was a tap (minimal movement)
        const wasTap = Math.abs(gesture.dx) < 5 && Math.abs(gesture.dy) < 5;
        
        if (wasTap) {
          // This was a tap, let the TouchableOpacity handle it
          return;
        }
        
        // Get current position
        const currentX = (pan.x as any)._value;
        const currentY = (pan.y as any)._value;
        
        // Keep button within screen bounds (with padding)
        const buttonSize = 60;
        const padding = 10;
        const maxX = width - buttonSize - padding;
        const maxY = height - buttonSize - padding;
        
        let finalX = currentX;
        let finalY = currentY;
        
        // Constrain X
        if (currentX < padding) finalX = padding;
        if (currentX > maxX) finalX = maxX;
        
        // Constrain Y
        if (currentY < padding) finalY = padding;
        if (currentY > maxY) finalY = maxY;
        
        // Animate to final position if needed
        if (finalX !== currentX || finalY !== currentY) {
          Animated.spring(pan, {
            toValue: { x: finalX, y: finalY },
            useNativeDriver: false,
            tension: 50,
            friction: 7,
          }).start();
        }
      },
    })
  ).current;

  // Technical Report functions
  const pickReportImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please grant permission to access photos.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images',
        allowsMultipleSelection: true,
        quality: 0.8,
        selectionLimit: 5 - reportScreenshots.length,
      });

      if (!result.canceled && result.assets) {
        const newUris = result.assets.map(asset => asset.uri);
        setReportScreenshots(prev => [...prev, ...newUris].slice(0, 5));
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to pick image. Please try again.');
    }
  };

  const takeReportPhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please grant permission to access camera.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets[0]) {
        if (reportScreenshots.length < 5) {
          setReportScreenshots(prev => [...prev, result.assets[0].uri]);
        } else {
          Alert.alert('Limit Reached', 'You can only attach up to 5 screenshots.');
        }
      }
    } catch (error) {
      console.error('Error taking photo:', error);
      Alert.alert('Error', 'Failed to take photo. Please try again.');
    }
  };

  const removeReportScreenshot = (uri: string) => {
    setReportScreenshots(prev => prev.filter(s => s !== uri));
  };

  // Show custom alert helper function
  const showCustomAlertMessage = (
    title: string, 
    message: string, 
    icon: 'success' | 'error' | 'warning' | 'info' = 'success'
  ) => {
    setAlertConfig({ title, message, icon });
    setShowCustomAlert(true);
  };

  const submitTechnicalReport = async () => {
    if (!reportDescription.trim()) {
      Alert.alert('Missing Information', 'Please describe the problem.');
      return;
    }

    setSubmittingReport(true);
    try {
      const timestamp = new Date().toISOString();
      const random = Math.floor(Math.random() * 9000);
      const ticketNumber = `TICKET${random.toString().padStart(4, '0')}`;
      const reportId = ticketNumber;

      // Collect app and device metadata
      const metadata = await collectAppMetadata();
      console.log('Collected app metadata for ticket:', metadata);

      // Upload screenshots to Firebase Storage
      const uploadedUrls: string[] = [];
      for (let i = 0; i < reportScreenshots.length; i++) {
        const uri = reportScreenshots[i];
        const fileName = `technical-reports/${reportId}/screenshot_${i + 1}.jpg`;
        
        const response = await fetch(uri);
        const blob = await response.blob();
        const { downloadURL } = await uploadFile(fileName, blob);
        if (downloadURL) {
          uploadedUrls.push(downloadURL);
        }
      }

      const report = {
        id: reportId,
        ticketNumber: reportId,
        reportedBy: parentData?.parentKey || 'unknown',
        reportedByEmail: parentData?.email || 'unknown',
        reportedByName: parentData ? `${parentData.firstName} ${parentData.lastName}` : 'Unknown Parent',
        userRole: 'parent' as const,
        timestamp,
        description: reportDescription.trim(),
        screenshots: uploadedUrls,
        status: 'pending' as const,
        // Add comprehensive metadata
        appVersion: metadata.appVersion,
        updateId: metadata.updateId,
        runtimeVersion: metadata.runtimeVersion,
        platform: metadata.platform,
        platformVersion: metadata.platformVersion,
        deviceInfo: metadata.deviceInfo,
        environment: metadata.environment,
        buildProfile: metadata.buildProfile,
        expoVersion: metadata.expoVersion,
        submittedAt: metadata.timestamp,
      };

      const { success, error } = await writeData(`/technicalReports/${reportId}`, report);
      
      if (success) {
        setShowTechReportModal(false);
        setReportDescription('');
        setReportScreenshots([]);
        showCustomAlertMessage(
          'Success', 
          'Your technical report has been submitted to the Admin. Thank you for helping us improve!',
          'success'
        );
      } else {
        throw new Error(error || 'Failed to submit report');
      }
    } catch (error) {
      console.error('Error submitting report:', error);
      if (error instanceof Error) {
        logErrorWithStack(error, 'error', 'ParentDashboard', 'Failed to submit technical report');
      } else {
        logError('Failed to submit technical report: ' + String(error), 'error', 'ParentDashboard');
      }
      showCustomAlertMessage(
        'Error', 
        'Failed to submit report. Please try again later.',
        'error'
      );
    } finally {
      setSubmittingReport(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.backgroundPattern} />

      <Animated.View style={{ flex: 1, opacity: fadeAnim, transform: [{ translateY: translateAnim }] }}>
      <ScrollView 
        style={styles.scrollView} 
        contentContainerStyle={styles.scrollContentContainer}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#3b82f6']}
            tintColor="#3b82f6"
          />
        }
      >
        <View style={styles.header}>
          <View style={styles.profileSection}>
            <TouchableOpacity style={styles.profileImageContainer} onPress={openProfileModal}>
              {parentData?.profilePictureUrl ? (
                <Image 
                  source={{ uri: parentData.profilePictureUrl }} 
                  style={styles.profileImage}
                />
              ) : (
                <View style={styles.profileImagePlaceholder}>
                  <MaterialIcons name="person" size={32} color="#9ca3af" />
                </View>
              )}
            </TouchableOpacity>
            <View style={styles.welcomeText}>
              <Text style={styles.welcomeLabel}>Magandang araw,</Text>
              <Text style={styles.welcomeTitle}>
                {parentData ? `${parentData.firstName}` : 'Magulang'}
              </Text>
            </View>
          </View>
        </View>


        {/* Home Section - Modern Filipino-Friendly Design */}
        {activeSection === 'home' && (
          <ScrollView 
            style={styles.homeScrollView} 
            contentContainerStyle={styles.homeScrollContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                colors={['#3b82f6']}
                tintColor="#3b82f6"
              />
            }
          >

            {/* Announcements Section - Top Priority */}
            <View style={styles.modernAnnouncementSection}>
              <View style={styles.sectionHeaderRow}>
                <View style={styles.modernSectionLabelContainer}>
                  <MaterialCommunityIcons name="bullhorn" size={24} color="#3b82f6" />
                  <Text style={styles.modernSectionLabel}>Mga Paalala</Text>
                  {unreadCount > 0 && (
                    <View style={styles.modernUnreadBadge}>
                      <Text style={styles.modernUnreadCount}>{unreadCount}</Text>
                    </View>
                  )}
                </View>
              </View>

              {announcements.length > 0 ? (
                <ScrollView 
                  horizontal 
                  showsHorizontalScrollIndicator={false}
                  style={styles.modernAnnouncementsScroll}
                  contentContainerStyle={styles.modernAnnouncementsContent}
                >
                  {announcements.slice(0, 5).map((announcement) => {
                    const parentKey = parentData?.parentKey;
                    const isRead = announcement.readBy && parentKey && announcement.readBy.includes(parentKey);
                    const isExpanded = expandedAnnouncementId === announcement.id;
                    
                    return (
                      <TouchableOpacity 
                        key={announcement.id} 
                        style={[
                          styles.modernAnnouncementCard,
                          !isRead && styles.modernAnnouncementCardUnread
                        ]}
                        onPress={() => toggleAnnouncementExpansion(announcement.id)}
                        activeOpacity={0.85}
                      >
                        {!isRead && (
                          <View style={styles.modernAnnouncementBadge}>
                            <Text style={styles.modernAnnouncementBadgeText}>BAGO</Text>
                          </View>
                        )}
                        <View style={styles.modernAnnouncementHeader}>
                          <View style={styles.modernAnnouncementIconContainer}>
                            <MaterialIcons name="campaign" size={14} color="#ffffff" />
                          </View>
                          <Text style={styles.modernAnnouncementTitle} numberOfLines={1}>
                            {announcement.title}
                          </Text>
                        </View>
                        <Text 
                          style={styles.modernAnnouncementMessage} 
                          numberOfLines={isExpanded ? undefined : 3}
                        >
                          {announcement.message}
                        </Text>
                        {isExpanded && (
                          <View style={styles.modernAnnouncementFooter}>
                            <View style={styles.modernAnnouncementTeacher}>
                              {announcement.teacherProfilePictureUrl ? (
                                <Image 
                                  source={{ uri: announcement.teacherProfilePictureUrl }} 
                                  style={styles.modernAnnouncementTeacherImage}
                                />
                              ) : (
                                <View style={styles.modernAnnouncementTeacherPlaceholder}>
                                  <MaterialIcons name="person" size={12} color="#64748b" />
                                </View>
                              )}
                              <Text style={styles.modernAnnouncementTeacherText}>
                                {announcement.teacherGender === 'Male' ? 'Sir' : announcement.teacherGender === 'Female' ? "Ma'am" : ''} {announcement.teacherName || 'Teacher'}
                              </Text>
                            </View>
                            <Text style={styles.modernAnnouncementDate}>
                              {announcement.dateTime ? new Date(announcement.dateTime).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric'
                              }) : 'No date'}
                            </Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              ) : (
                <View style={styles.modernEmptyState}>
                  <MaterialCommunityIcons name="bell-outline" size={36} color="#cbd5e1" />
                  <Text style={styles.modernEmptyStateText}>Walang paalala pa</Text>
                </View>
              )}
            </View>

            {/* Performance Overview Cards - Compact Grid */}
            <View style={[styles.overviewGrid, { marginBottom: 16 }]}>
              <View style={styles.modernSectionLabelContainer}>
                <MaterialCommunityIcons name="chart-box" size={24} color="#3b82f6" />
                <Text style={styles.modernSectionLabel}>Buod ng Pagganap</Text>
              </View>
              <View style={styles.modernStatsRow}>
                <Animated.View style={[styles.modernStatCard, { opacity: fadeAnim }]}>
                  <View style={[styles.statIconContainer, { backgroundColor: '#dbeafe' }]}>
                    <MaterialCommunityIcons name="clipboard-check" size={20} color="#3b82f6" />
                  </View>
                  <Text style={styles.modernStatValue}>
                    {tasks.filter(t => t.isAssignedExercise && t.status === 'completed').length}
                  </Text>
                  <Text style={styles.modernStatLabel}>Natapos</Text>
                </Animated.View>

                <Animated.View style={[styles.modernStatCard, { opacity: fadeAnim }]}>
                  <View style={[styles.statIconContainer, { backgroundColor: '#fee2e2' }]}>
                    <MaterialCommunityIcons name="clock-alert" size={20} color="#ef4444" />
                  </View>
                  <Text style={styles.modernStatValue}>
                    {tasks.filter(t => t.isAssignedExercise && t.status === 'pending').length}
                  </Text>
                  <Text style={styles.modernStatLabel}>Naghihintay</Text>
                </Animated.View>

                <Animated.View style={[styles.modernStatCard, { opacity: fadeAnim }]}>
                  <View style={[styles.statIconContainer, { backgroundColor: '#dcfce7' }]}>
                    <MaterialCommunityIcons name="star" size={20} color="#10b981" />
                  </View>
                  <Text style={styles.modernStatValue}>
                    {tasks.filter(t => t.isAssignedExercise && t.status === 'completed' && t.score && t.score >= 80).length}
                  </Text>
                  <Text style={styles.modernStatLabel}>Mahusay</Text>
                </Animated.View>
              </View>
            </View>

            {/* Active Subjects/Exercises */}
            <View style={[styles.activeSection, { marginBottom: 8 }]}>
              <View style={styles.sectionHeaderRow}>
                <View style={styles.modernSectionLabelContainer}>
                  <MaterialCommunityIcons name="book-open-page-variant" size={24} color="#3b82f6" />
                  <Text style={styles.modernSectionLabel}>Kasalukuyang Aralin</Text>
                </View>
                <TouchableOpacity onPress={() => setActiveSection('tasks')}>
                  <Text style={styles.modernSeeAllText}>Tingnan Lahat →</Text>
                </TouchableOpacity>
              </View>
              
              {tasksLoading && !initialTasksLoaded ? (
                <Animated.View style={[styles.loadingCard, { opacity: pulseAnim }]}>
                  <View style={styles.skeletonLine} />
                  <View style={[styles.skeletonLine, { width: '70%' }]} />
                </Animated.View>
              ) : tasks.filter(t => t.isAssignedExercise && t.status === 'pending').length > 0 ? (
                tasks.filter(t => t.isAssignedExercise && t.status === 'pending')
                  .slice(0, 3)
                  .map((task, index) => {
                    const dueDate = new Date(task.dueDate);
                    const now = new Date();
                    const diffTime = dueDate.getTime() - now.getTime();
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    const isUrgent = diffDays <= 1;

                    return (
                      <Animated.View key={task.id} style={[styles.activeTaskCard, { opacity: fadeAnim }]}>
                        <TouchableOpacity 
                          style={styles.activeTaskContent}
                          onPress={() => setActiveSection('tasks')}
                          activeOpacity={0.7}
                        >
                          <View style={styles.activeTaskLeft}>
                            <View style={[styles.activeTaskIconContainer, isUrgent && styles.urgentTaskIcon]}>
                              <MaterialCommunityIcons 
                                name={isUrgent ? "alert-circle" : "pencil"} 
                                size={16} 
                                color={isUrgent ? "#ef4444" : "#3b82f6"} 
                              />
                            </View>
                            <View style={styles.activeTaskInfo}>
                              <Text style={styles.activeTaskTitle} numberOfLines={1}>
                                {task.title}
                              </Text>
                              {task.description && (
                                <Text style={styles.activeTaskDescription} numberOfLines={1}>
                                  {task.description}
                                </Text>
                              )}
                              <View style={styles.activeTaskMeta}>
                                <MaterialIcons name="schedule" size={12} color="#64748b" />
                                <Text style={[styles.activeTaskMetaText, isUrgent && styles.urgentText]}>
                                  {diffDays < 0 ? 'Nakalipas na' : diffDays === 0 ? 'Ngayong araw' : diffDays === 1 ? 'Bukas' : `${diffDays} araw`}
                                </Text>
                                {task.points && (
                                  <>
                                    <Text style={styles.activeTaskMetaSeparator}>•</Text>
                                    <MaterialIcons name="quiz" size={12} color="#64748b" />
                                    <Text style={styles.activeTaskMetaText}>{task.points} items</Text>
                                  </>
                                )}
                              </View>
                            </View>
                          </View>
                          <MaterialIcons name="chevron-right" size={20} color="#9ca3af" />
                        </TouchableOpacity>
                      </Animated.View>
                    );
                  })
              ) : (
                <View style={styles.emptyStateCard}>
                  <MaterialCommunityIcons name="check-all" size={48} color="#10b981" />
                  <Text style={styles.emptyStateTitle}>Walang pending na gawain! ✨</Text>
                  <Text style={styles.emptyStateText}>
                    Napakahusay! Lahat ay natapos na.
                  </Text>
                </View>
              )}
            </View>

            {/* Recent Activity Preview */}
            <View style={styles.recentSection}>
              <View style={styles.sectionHeaderRow}>
                <View style={styles.modernSectionLabelContainer}>
                  <MaterialCommunityIcons name="history" size={24} color="#3b82f6" />
                  <Text style={styles.modernSectionLabel}>Kamakailang Aktibidad</Text>
                </View>
                <TouchableOpacity onPress={() => setActiveSection('history')}>
                  <Text style={styles.modernSeeAllText}>Kasaysayan →</Text>
                </TouchableOpacity>
              </View>
              
              {tasks.filter(t => t.isAssignedExercise && t.status === 'completed').length > 0 ? (
                tasks.filter(t => t.isAssignedExercise && t.status === 'completed')
                  .slice(0, 3)
                  .map((task, index) => (
                    <Animated.View key={task.id} style={[styles.recentActivityCard, { opacity: fadeAnim }]}>
                      <View style={[styles.recentActivityIcon, { backgroundColor: task.score && task.score >= 80 ? '#dcfce7' : '#fef3c7' }]}>
                        <MaterialCommunityIcons 
                          name={task.score && task.score >= 80 ? "check-circle" : "check"} 
                          size={16} 
                          color={task.score && task.score >= 80 ? "#10b981" : "#f59e0b"} 
                        />
                      </View>
                      <View style={styles.recentActivityInfo}>
                        <Text style={styles.recentActivityTitle} numberOfLines={1}>
                          {task.title}
                        </Text>
                        {task.description && (
                          <Text style={styles.recentActivityDescription} numberOfLines={1}>
                            {task.description}
                          </Text>
                        )}
                        <View style={styles.recentActivityMeta}>
                          {task.score !== undefined && (
                            <View style={styles.recentScoreBadge}>
                              <MaterialIcons name="star" size={12} color="#f59e0b" />
                              <Text style={styles.recentScoreText}>{task.score}%</Text>
                            </View>
                          )}
                          {task.points && (
                            <View style={styles.recentItemsBadge}>
                              <MaterialIcons name="quiz" size={10} color="#3b82f6" />
                              <Text style={styles.recentItemsText}>{task.points}</Text>
                            </View>
                          )}
                          <Text style={styles.recentActivityDate}>
                            {task.completedAt ? (() => {
                              const completedDate = new Date(task.completedAt);
                              const now = new Date();
                              const diffHours = Math.floor((now.getTime() - completedDate.getTime()) / (1000 * 60 * 60));
                              const diffDays = Math.floor(diffHours / 24);
                              if (diffHours < 1) return 'Kamakailan lang';
                              if (diffHours < 24) return `${diffHours} oras na ang nakalipas`;
                              if (diffDays < 7) return `${diffDays} araw na ang nakalipas`;
                              return completedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                            })() : 'Kamakailan'}
                          </Text>
                        </View>
                        {task.resultId && (
                          <View style={styles.resultIdBadgeCompact}>
                            <MaterialIcons name="fingerprint" size={10} color="#3b82f6" />
                            <Text style={styles.resultIdTextCompact}>{task.resultId}</Text>
                          </View>
                        )}
                      </View>
                      <TouchableOpacity onPress={() => {
                        setActiveSection('history');
                        if (task.resultId) {
                          handleShowQuestionResult(task);
                        }
                      }}>
                        <MaterialIcons name="visibility" size={20} color="#64748b" />
                      </TouchableOpacity>
                    </Animated.View>
                  ))
              ) : (
                <View style={styles.emptyStateCard}>
                  <MaterialCommunityIcons name="history" size={48} color="#cbd5e1" />
                  <Text style={styles.emptyStateText}>
                    Walang natapos na gawain pa
                  </Text>
                </View>
              )}
            </View>

            {/* Daily Quote Section */}
            <View style={styles.quoteSection}>
              <View style={styles.quoteCard}>
                <View style={styles.quoteIcon}>
                  <MaterialCommunityIcons name="format-quote-open" size={24} color="#3b82f6" />
                </View>
                <Text style={styles.quoteText}>
                  {dailyQuote ? `"${dailyQuote.quote}"` : '"Education is the most powerful weapon which you can use to change the world."'}
                </Text>
                <Text style={styles.quoteAuthor}>
                  — {dailyQuote ? dailyQuote.author : 'Nelson Mandela'}
                </Text>
              </View>
            </View>
          </ScrollView>
        )}

        {/* Tasks Section */}
        {activeSection === 'tasks' && (
          <View style={styles.tasksSection}>
            <View style={styles.tasksHeader}>
              <Text style={styles.tasksMainTitle}>Tasks</Text>
              <View style={styles.tasksSummary}>
                <View style={styles.summaryItem}>
                  <View style={[styles.summaryDot, { backgroundColor: '#f59e0b' }]} />
                  <Text style={styles.tasksSummaryText}>
                    {tasks.filter(t => t.isAssignedExercise && t.status === 'pending').length} Pending
                  </Text>
                </View>
                <View style={styles.summaryDivider} />
                <View style={styles.summaryItem}>
                  <View style={[styles.summaryDot, { backgroundColor: '#10b981' }]} />
                  <Text style={styles.tasksSummaryText}>
                    {tasks.filter(t => t.isAssignedExercise && t.status === 'completed').length} Completed
                  </Text>
                </View>
              </View>
            </View>
            
            {tasksLoading && !initialTasksLoaded ? (
              // Loading Skeleton for Tasks
              <View style={styles.tasksLoadingContainer}>
                <Animated.View style={[styles.taskSkeletonCard, { opacity: pulseAnim }]}>
                  <View style={styles.taskSkeletonHeader}>
                    <View style={[styles.skeletonLine, { width: '70%', height: 20 }]} />
                    <View style={[styles.skeletonLine, { width: 80, height: 24, borderRadius: 12 }]} />
                  </View>
                  <View style={[styles.skeletonLine, { width: '100%', height: 16, marginTop: 8 }]} />
                  <View style={[styles.skeletonLine, { width: '60%', height: 14, marginTop: 12 }]} />
                </Animated.View>
                <Animated.View style={[styles.taskSkeletonCard, { opacity: pulseAnim }]}>
                  <View style={styles.taskSkeletonHeader}>
                    <View style={[styles.skeletonLine, { width: '70%', height: 20 }]} />
                    <View style={[styles.skeletonLine, { width: 80, height: 24, borderRadius: 12 }]} />
                  </View>
                  <View style={[styles.skeletonLine, { width: '100%', height: 16, marginTop: 8 }]} />
                  <View style={[styles.skeletonLine, { width: '60%', height: 14, marginTop: 12 }]} />
                </Animated.View>
              </View>
            ) : tasks.filter(t => t.isAssignedExercise && t.status !== 'completed').length > 0 ? (
              <ScrollView 
                style={styles.tasksScrollView} 
                contentContainerStyle={styles.tasksScrollContainer}
                showsVerticalScrollIndicator={false}
              >
                {(() => {
                  // Separate pending and completed tasks
                  const pendingTasks = tasks.filter(t => t.isAssignedExercise && t.status !== 'completed');
                  const completedTasks = tasks.filter(t => t.isAssignedExercise && t.status === 'completed');
                  
                  const filteredTasks = pendingTasks;
                  
                  // Sort tasks by deadline (nearest first)
                  const sortedTasks = filteredTasks.sort((a, b) => {
                    const dateA = new Date(a.dueDate);
                    const dateB = new Date(b.dueDate);
                    return dateA.getTime() - dateB.getTime();
                  });
                  
                  const groupedByQuarter: Record<string, Task[]> = {
                    'Quarter 1': [],
                    'Quarter 2': [],
                    'Quarter 3': [],
                    'Quarter 4': [],
                    'No Quarter': [],
                  };
                  
                  sortedTasks.forEach((task) => {
                    const quarter = task.quarter || 'No Quarter';
                    groupedByQuarter[quarter].push(task);
                  });
                  
                  // Reverse quarter order: Q4, Q3, Q2, Q1 - only show quarters with tasks
                  const quarters = ['Quarter 4', 'Quarter 3', 'Quarter 2', 'Quarter 1', 'No Quarter'].filter(
                    (quarter) => groupedByQuarter[quarter].length > 0
                  );
                  
                  return quarters.map((quarter, quarterIdx) => (
                    <View key={quarter}>
                      <TouchableOpacity 
                        style={styles.quarterHeaderButton}
                        onPress={() => {
                          setCollapsedTasksQuarters(prev => ({
                            ...prev,
                            [quarter]: !prev[quarter]
                          }));
                        }}
                        activeOpacity={0.7}
                      >
                        <View style={styles.quarterHeaderLeft}>
                          <View style={styles.quarterIconContainer}>
                            <MaterialCommunityIcons name="calendar-range" size={16} color="#ffffff" />
                          </View>
                          <View style={styles.quarterInfo}>
                            <Text style={styles.quarterTitle}>{quarter}</Text>
                            <Text style={styles.quarterSummary}>
                              {groupedByQuarter[quarter].length} {groupedByQuarter[quarter].length === 1 ? 'gawain' : 'mga gawain'}
                            </Text>
                          </View>
                        </View>
                        <MaterialIcons 
                          name={collapsedTasksQuarters[quarter] ? "keyboard-arrow-down" : "keyboard-arrow-up"} 
                          size={24} 
                          color="#64748b" 
                        />
                      </TouchableOpacity>
                      
                      {!collapsedTasksQuarters[quarter] && groupedByQuarter[quarter].length > 1 && (
                        <View style={styles.sortIndicator}>
                          <MaterialIcons name="sort" size={14} color="#64748b" />
                          <Text style={styles.sortIndicatorText}>Sorted by nearest deadline</Text>
                        </View>
                      )}
                      
                      {!collapsedTasksQuarters[quarter] && groupedByQuarter[quarter].map((task, index) => {
                        const isFirstTask = index === 0;
                  const isOverdue = new Date(task.dueDate) < new Date() && task.status !== 'completed';
                  const dueDate = new Date(task.dueDate);
                  const now = new Date();
                  const diffTime = dueDate.getTime() - now.getTime();
                  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                  
                  let dueText = '';
                  let dueIcon: 'event' | 'warning' | 'schedule' | 'alarm' | 'access-time' = 'event';
                  let dueColor = '#3b82f6';
                  let dueBgColor = '#eff6ff';
                  let dueBorderColor = '#dbeafe';
                  let isUrgent = false;
                  
                  if (diffDays < 0) {
                    dueText = `Overdue ${Math.abs(diffDays)}d`;
                    dueIcon = 'alarm';
                    dueColor = '#ef4444';
                    dueBgColor = '#fef2f2';
                    dueBorderColor = '#fecaca';
                    isUrgent = true;
                  } else if (diffDays === 0) {
                    dueText = 'Due today';
                    dueIcon = 'alarm';
                    dueColor = '#ef4444';
                    dueBgColor = '#fef2f2';
                    dueBorderColor = '#fecaca';
                    isUrgent = true;
                  } else if (diffDays === 1) {
                    dueText = 'Tomorrow';
                    dueIcon = 'warning';
                    dueColor = '#ef4444';
                    dueBgColor = '#fef2f2';
                    dueBorderColor = '#fecaca';
                    isUrgent = true;
                  } else if (diffDays <= 3) {
                    dueText = `${diffDays} days`;
                    dueIcon = 'warning';
                    dueColor = '#ef4444';
                    dueBgColor = '#fef2f2';
                    dueBorderColor = '#fecaca';
                    isUrgent = true;
                  } else if (diffDays <= 7) {
                    dueText = `${diffDays} days`;
                    dueIcon = 'schedule';
                    dueColor = '#f59e0b';
                    dueBgColor = '#fffbeb';
                    dueBorderColor = '#fed7aa';
                  } else {
                    dueText = dueDate.toLocaleDateString('en-US', { 
                      month: 'short', 
                      day: 'numeric'
                    });
                    dueIcon = 'event';
                    dueColor = '#64748b';
                    dueBgColor = '#f8fafc';
                    dueBorderColor = '#e2e8f0';
                  }

                  const getStatusInfo = (status: Task['status']) => {
                    switch (status) {
                      case 'completed': 
                        return { 
                          color: '#10b981', 
                          bgColor: '#ecfdf5', 
                          borderColor: '#d1fae5',
                          icon: 'check-circle' as const,
                          text: 'Completed'
                        };
                      case 'in-progress': 
                        return { 
                          color: '#3b82f6', 
                          bgColor: '#eff6ff', 
                          borderColor: '#dbeafe',
                          icon: 'play-circle' as const,
                          text: 'In Progress'
                        };
                      case 'overdue': 
                        return { 
                          color: '#ef4444', 
                          bgColor: '#fef2f2', 
                          borderColor: '#fecaca',
                          icon: 'warning' as const,
                          text: 'Overdue'
                        };
                      default: 
                        return { 
                          color: '#64748b', 
                          bgColor: '#f8fafc', 
                          borderColor: '#e2e8f0',
                          icon: 'schedule' as const,
                          text: 'Pending'
                        };
                    }
                  };

                  const statusInfo = getStatusInfo(task.status);

                  return (
                    <Animated.View 
                      key={task.id} 
                      style={[
                        styles.enhancedTaskItem,
                        task.status === 'pending' && styles.pendingTaskItem,
                        isOverdue && styles.overdueTaskItem,
                        task.status === 'completed' && styles.completedTaskItem,
                        isFirstTask && styles.firstTaskItem,
                        { opacity: fadeAnim }
                      ]}
                    >
                      {/* Compact Task Header */}
                      <View style={styles.compactTaskHeader}>
                        <View style={styles.taskTitleRow}>
                          <Text style={[
                            styles.compactTaskTitle,
                            task.status === 'completed' && styles.completedTaskTitleStrikethrough
                          ]} numberOfLines={2}>
                            {task.title}
                          </Text>
                          <View style={[
                            styles.compactDueBadge,
                            { backgroundColor: dueColor }
                          ]}>
                            <MaterialIcons name={dueIcon} size={12} color="#ffffff" />
                            <Text style={styles.compactDueText}>{dueText}</Text>
                          </View>
                        </View>
                      </View>

                      {/* Info Row: Teacher + Items + Quarter + Time Remaining */}
                      <View style={styles.taskInfoRow}>
                        {task.teacherName && (
                          <View style={styles.compactTeacherInfo}>
                            <View style={styles.teacherAvatarTiny}>
                              {task.teacherProfilePictureUrl ? (
                                <Image 
                                  source={{ uri: task.teacherProfilePictureUrl }} 
                                  style={styles.teacherProfileImageTiny}
                                />
                              ) : (
                                <MaterialIcons name="person" size={10} color="#64748b" />
                              )}
                            </View>
                            <Text style={styles.compactTeacherText} numberOfLines={1}>
                              {task.teacherName}
                            </Text>
                          </View>
                        )}
                        {task.points && (
                          <View style={styles.itemsCountBadge}>
                            <MaterialIcons name="quiz" size={12} color="#3b82f6" />
                            <Text style={styles.itemsCountText}>{task.points} items</Text>
                          </View>
                        )}
                        {diffDays >= 0 && diffDays < 1 && task.status !== 'completed' && (
                          <View style={styles.timeRemainingBadge}>
                            <MaterialIcons name="timer" size={12} color="#ef4444" />
                            <Text style={styles.timeRemainingText}>
                              {(() => {
                                const hours = Math.floor(diffTime / (1000 * 60 * 60));
                                const mins = Math.floor((diffTime % (1000 * 60 * 60)) / (1000 * 60));
                                if (hours > 0) return `${hours}h ${mins}m`;
                                return `${mins}m`;
                              })()}
                            </Text>
                          </View>
                        )}
                      </View>
                      
                      {/* Exercise Description */}
                      {task.description && (
                        <Text style={styles.taskDescriptionCompact} numberOfLines={2}>
                          {task.description}
                        </Text>
                      )}

                      {/* Emphasized Action Button */}
                      {(task.exerciseId || task.isAssignedExercise) && (
                        <TouchableOpacity 
                          style={[
                            styles.emphasizedActionButton,
                            task.status === 'completed' && styles.emphasizedViewButton,
                            isUrgent && task.status !== 'completed' && styles.emphasizedUrgentButton
                          ]}
                          onPress={() => handleTaskAction(task)}
                          activeOpacity={0.8}
                        >
                          <MaterialIcons 
                            name={task.status === 'completed' ? "visibility" : "play-arrow"} 
                            size={16} 
                            color="#ffffff" 
                          />
                          <Text style={styles.emphasizedActionText}>
                            {task.status === 'completed' ? 'Tingnan Resulta' : 'Simulan'}
                          </Text>
                        </TouchableOpacity>
                      )}
                    </Animated.View>
                  );
                      })}
                    </View>
                  ));
                })()}
              </ScrollView>
            ) : (
              <View style={styles.emptyTasksCard}>
                <View style={styles.emptyIconContainer}>
                  <MaterialCommunityIcons name="clipboard-text-outline" size={64} color="#cbd5e1" />
                </View>
                <Text style={styles.emptyTasksTitle}>No exercises assigned</Text>
                <Text style={styles.emptyTasksDescription}>
                  Exercises assigned by your teacher will appear here
                </Text>
                <View style={styles.emptyTasksHint}>
                  <MaterialIcons name="info" size={16} color="#64748b" />
                  <Text style={styles.emptyTasksHintText}>
                    Check back later for new assignments
                  </Text>
                </View>
              </View>
            )}
          </View>
        )}

        {/* History Section - Modern with Quarterly Grouping */}
        {activeSection === 'history' && !showQuestionResult && (
          <View style={styles.historySection}>
            <View style={styles.historyModernHeader}>
              <Text style={styles.historyMainTitle}>📖 Kasaysayan ng Pagsasanay</Text>
              <Text style={styles.historySubtitle}>Tingnan ang lahat ng natapos na gawain</Text>
            </View>

            {/* Stats Summary Cards */}
            <View style={styles.historyStatsGrid}>
              <View style={styles.historyStatCard}>
                <View style={[styles.historyStatIcon, { backgroundColor: '#dcfce7' }]}>
                  <MaterialCommunityIcons name="check-circle" size={16} color="#10b981" />
                </View>
                <Text style={styles.historyStatValue}>
                  {tasks?.filter(t => t.isAssignedExercise && t.status === 'completed').length || 0}
                </Text>
                <Text style={styles.historyStatLabel}>Natapos</Text>
              </View>

              <View style={styles.historyStatCard}>
                <View style={[styles.historyStatIcon, { backgroundColor: '#fef3c7' }]}>
                  <MaterialCommunityIcons name="star" size={16} color="#f59e0b" />
                </View>
                <Text style={styles.historyStatValue}>
                  {tasks?.filter(t => t.isAssignedExercise && t.status === 'completed' && t.score && t.score >= 80).length || 0}
                </Text>
                <Text style={styles.historyStatLabel}>Mahusay</Text>
              </View>

              <View style={styles.historyStatCard}>
                <View style={[styles.historyStatIcon, { backgroundColor: '#dbeafe' }]}>
                  <MaterialCommunityIcons name="clock-outline" size={16} color="#3b82f6" />
                </View>
                <Text style={styles.historyStatValue}>
                  {tasks?.filter(t => t.isAssignedExercise && t.status === 'completed').length > 0 ? 
                    Math.round(tasks.filter(t => t.isAssignedExercise && t.status === 'completed')
                      .reduce((sum, t) => sum + (t.timeSpent || 0), 0) / 60000) : 0}
                </Text>
                <Text style={styles.historyStatLabel}>Minuto</Text>
              </View>
            </View>
            {tasksLoading ? (
              <View style={styles.historyLoadingContainer}>
                <Animated.View style={[styles.historyLoadingCard, { opacity: pulseAnim }]}>
                  <MaterialCommunityIcons name="loading" size={32} color="#3b82f6" />
                  <Text style={styles.historyLoadingText}>Kumukuha ng kasaysayan...</Text>
                  <Text style={styles.historyLoadingSubtext}>Sandali lang po</Text>
                </Animated.View>
              </View>
            ) : tasks?.filter(t => t.isAssignedExercise && t.status === 'completed').length > 0 ? (
              <ScrollView style={styles.historyScrollView} showsVerticalScrollIndicator={false}>
                {(() => {
                  const completedTasks = (tasks || [])
                    .filter(t => t.isAssignedExercise && t.status === 'completed')
                    .sort((a, b) => new Date(b.completedAt || b.createdAt).getTime() - new Date(a.completedAt || a.createdAt).getTime());

                  // Group by quarter
                  const groupedByQuarter: Record<string, typeof completedTasks> = {
                    'Unang Quarter': [],
                    'Ikalawang Quarter': [],
                    'Ikatlong Quarter': [],
                    'Ikaapat na Quarter': [],
                    'Walang Quarter': [],
                  };

                  completedTasks.forEach(task => {
                    const quarter = task.quarter || 'Walang Quarter';
                    const filipinoQuarter = quarter === 'Quarter 1' ? 'Unang Quarter' :
                                           quarter === 'Quarter 2' ? 'Ikalawang Quarter' :
                                           quarter === 'Quarter 3' ? 'Ikatlong Quarter' :
                                           quarter === 'Quarter 4' ? 'Ikaapat na Quarter' : 'Walang Quarter';
                    
                    if (!groupedByQuarter[filipinoQuarter]) {
                      groupedByQuarter[filipinoQuarter] = [];
                    }
                    groupedByQuarter[filipinoQuarter].push(task);
                  });

                  // Find most recent quarter with activity (for defaultOpen)
                  const quarterOrder = ['Ikaapat na Quarter', 'Ikatlong Quarter', 'Ikalawang Quarter', 'Unang Quarter', 'Walang Quarter'];
                  let mostRecentQuarterWithActivity: string | null = null;
                  
                  for (const q of quarterOrder) {
                    if (groupedByQuarter[q] && groupedByQuarter[q].length > 0) {
                      mostRecentQuarterWithActivity = q;
                      break; // Found the first (most recent) quarter with tasks
                    }
                  }
                  
                  console.log('[Quarters] Most recent quarter with activity:', mostRecentQuarterWithActivity);

                  // Show ALL quarters (Q4 at top, Q1 at bottom) even if empty
                  return quarterOrder.map((quarter, quarterIndex) => {
                    const quarterTasks = groupedByQuarter[quarter] || [];
                    const avgScore = quarterTasks.length > 0 
                      ? quarterTasks.reduce((sum, t) => sum + (t.score || 0), 0) / quarterTasks.length 
                      : 0;
                    const totalTime = quarterTasks.length > 0
                      ? quarterTasks.reduce((sum, t) => sum + (t.timeSpent || 0), 0)
                      : 0;
                    const isDefaultOpen = quarter === mostRecentQuarterWithActivity;

                    return (
                      <QuarterSection 
                        key={quarter} 
                        quarter={quarter}
                        quarterTasks={quarterTasks}
                        avgScore={avgScore}
                        totalTime={totalTime}
                        onTaskPress={handleShowQuestionResult}
                        defaultOpen={isDefaultOpen}
                      />
                    );
                  });
                })()}
              </ScrollView>
            ) : (
              <View style={styles.emptyHistoryCard}>
                <View style={styles.emptyIconContainer}>
                  <MaterialCommunityIcons name="history" size={64} color="#cbd5e1" />
                </View>
                <Text style={styles.emptyHistoryTitle}>Walang Natapos na Gawain</Text>
                <Text style={styles.emptyHistoryDescription}>
                  Ang mga natapos na ehersisyo ay makikita dito kasama ang detalyadong pagsusuri
                </Text>
                <View style={styles.emptyHistoryHint}>
                  <MaterialIcons name="info" size={16} color="#64748b" />
                  <Text style={styles.emptyHistoryHintText}>
                    Tapusin ang ilang ehersisyo upang makita ang pag-unlad
                  </Text>
                </View>
              </View>
            )}
          </View>
        )}

        {/* Question Result View */}
        {activeSection === 'history' && showQuestionResult && selectedResult && (
          <View style={styles.questionResultSection}>
            {loadingAnalysis ? (
              <View style={styles.loadingContainer}>
                <MaterialCommunityIcons name="loading" size={32} color="#3b82f6" />
                <Text style={styles.loadingText}>Analyzing performance...</Text>
              </View>
            ) : (
              <View style={styles.questionResultContent}>
                {/* Exercise Result Header */}
                <View style={styles.exerciseResultHeader}>
                  <TouchableOpacity 
                    style={styles.backButton}
                    onPress={handleBackToHistory}
                  >
                    <MaterialIcons name="arrow-back" size={24} color="#3b82f6" />
                  </TouchableOpacity>
                  <View style={styles.exerciseResultHeaderContent}>
                    <MaterialCommunityIcons name="chart-bar" size={24} color="#8b5cf6" />
                    <Text style={styles.exerciseResultTitle}>Exercise Result</Text>
                  </View>
                </View>

                {/* Item Analysis Title */}
                <Text style={styles.itemAnalysisTitle}>Item Analysis</Text>

                {/* Exercise ID Badge */}
                <View style={styles.exerciseIdBadge}>
                  <MaterialIcons name="settings" size={12} color="#3b82f6" />
                  <Text style={styles.exerciseIdText}>{selectedResult.exerciseInfo?.exerciseId || 'E-PZW-0012-R-FKV-0321'}</Text>
                </View>

                {/* Student Information Card */}
                <View style={styles.studentInfoCard}>
                  <View style={styles.studentInfoRow}>
                    <Text style={styles.studentInfoLabel}>Student Name:</Text>
                    <Text style={styles.studentInfoValue}>{selectedResult.studentInfo?.name || 'Adrian Reyes'}</Text>
                  </View>
                  <View style={styles.studentInfoRow}>
                    <Text style={styles.studentInfoLabel}>Exercise:</Text>
                    <Text style={styles.studentInfoValue}>{selectedResult.exerciseInfo?.title || selectedResult.title || 'Peso Adventure!'}</Text>
                  </View>
                  <View style={styles.studentInfoRow}>
                    <Text style={styles.studentInfoLabel}>Date:</Text>
                    <Text style={styles.studentInfoValue}>
                      {selectedResult.exerciseSession?.completedAt ? 
                        new Date(selectedResult.exerciseSession.completedAt).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric'
                        }) + ' - ' + new Date(selectedResult.exerciseSession.completedAt).toLocaleTimeString('en-US', {
                          hour: 'numeric',
                          minute: '2-digit',
                          hour12: true
                        }) : 
                        'Oct 19, 2025 - 9:02PM'
                      }
                    </Text>
                    <View style={styles.onTimeBadge}>
                      <Text style={styles.onTimeText}>On-Time</Text>
                    </View>
                  </View>
                  <View style={styles.studentStatusRow}>
                    <View style={[
                      styles.statusGradientBar,
                      { 
                        backgroundColor: (() => {
                          const score = performanceRanking?.currentStudent ? 
                            performanceRanking.currentStudent.overallScore : 
                            (selectedResult.scorePercentage || selectedResult.resultsSummary?.meanPercentageScore || 0);
                          if (score >= 90) return '#10b981';
                          if (score >= 80) return '#3b82f6';
                          if (score >= 70) return '#f59e0b';
                          return '#ef4444';
                        })()
                      }
                    ]} />
                    <Text style={[
                      styles.studentStatusText,
                      { 
                        color: (() => {
                          const score = performanceRanking?.currentStudent ? 
                            performanceRanking.currentStudent.overallScore : 
                            (selectedResult.scorePercentage || selectedResult.resultsSummary?.meanPercentageScore || 0);
                          if (score >= 90) return '#10b981';
                          if (score >= 80) return '#3b82f6';
                          if (score >= 70) return '#f59e0b';
                          return '#ef4444';
                        })()
                      }
                    ]}>
                      {(() => {
                        const score = performanceRanking?.currentStudent ? 
                          performanceRanking.currentStudent.overallScore : 
                          (selectedResult.scorePercentage || selectedResult.resultsSummary?.meanPercentageScore || 0);
                        if (score >= 90) return 'Excellent Performance';
                        if (score >= 80) return 'Good Performance';
                        if (score >= 70) return 'Needs Improvement';
                        return 'For Intervention';
                      })()}
                    </Text>
                  </View>
                </View>

                {/* Performance Overview Card */}
                <View style={styles.performanceOverviewCard}>
                  <View style={styles.performanceOverviewHeader}>
                    <Text style={styles.performanceOverviewTitle}>Performance Overview</Text>
                    <View style={[
                      styles.performanceRatingBadge,
                      { 
                        backgroundColor: (() => {
                          const score = performanceRanking?.currentStudent ? 
                            performanceRanking.currentStudent.overallScore : 
                            (selectedResult.scorePercentage || selectedResult.resultsSummary?.meanPercentageScore || 0);
                          if (score >= 90) return '#10b981';
                          if (score >= 80) return '#3b82f6';
                          if (score >= 70) return '#f59e0b';
                          return '#ef4444';
                        })()
                      }
                    ]}>
                      <Text style={styles.performanceRatingText}>
                        {(() => {
                          const score = performanceRanking?.currentStudent ? 
                            performanceRanking.currentStudent.overallScore : 
                            (selectedResult.scorePercentage || selectedResult.resultsSummary?.meanPercentageScore || 0);
                          if (score >= 90) return 'EXCELLENT';
                          if (score >= 80) return 'GOOD';
                          if (score >= 70) return 'FAIR';
                          return 'POOR';
                        })()}
                      </Text>
                    </View>
                  </View>
                  
                  <View style={styles.performanceScoreContainer}>
                    <Text style={styles.performanceScoreNumber}>
                      {performanceRanking?.currentStudent ? 
                        Math.round(performanceRanking.currentStudent.overallScore) : 
                        (selectedResult.scorePercentage || selectedResult.resultsSummary?.meanPercentageScore || 0)
                      }
                    </Text>
                    <Text style={styles.performanceScoreLabel}>PERFORMANCE SCORE</Text>
                  </View>

                  {/* Performance Metrics Grid */}
                  <View style={styles.performanceMetricsGrid}>
                    <View style={styles.performanceMetricItem}>
                      <Text style={styles.performanceMetricValue}>
                        {performanceRanking?.currentStudent ? 
                          `${Math.round(performanceRanking.currentStudent.efficiencyScore)}/100` :
                          (() => {
                            const questionResults = selectedResult.questionResults || [];
                            const totalAttempts = questionResults.reduce((sum: number, q: any) => sum + (q.attempts || 1), 0);
                            const totalQuestions = questionResults.length || 1;
                            const avgAttemptsPerQuestion = totalQuestions > 0 ? totalAttempts / totalQuestions : 0;
                            let efficiencyScore;
                            if (avgAttemptsPerQuestion <= 1) efficiencyScore = 100;
                            else if (avgAttemptsPerQuestion <= 1.5) efficiencyScore = 90;
                            else if (avgAttemptsPerQuestion <= 2) efficiencyScore = 80;
                            else if (avgAttemptsPerQuestion <= 2.5) efficiencyScore = 70;
                            else if (avgAttemptsPerQuestion <= 3) efficiencyScore = 60;
                            else efficiencyScore = 50;
                            return `${efficiencyScore}/100`;
                          })()
                        }
                      </Text>
                      <Text style={styles.performanceMetricLabel}>EFFICIENCY</Text>
                    </View>
                    <View style={styles.performanceMetricItem}>
                      <Text style={styles.performanceMetricValue}>
                        {performanceRanking?.currentStudent ? 
                          `${Math.round(performanceRanking.currentStudent.consistencyScore)}/100` :
                          (() => {
                            const questionResults = selectedResult.questionResults || [];
                            const totalQuestions = questionResults.length || 1;
                            const correctAnswers = questionResults.filter((q: any) => q.isCorrect).length;
                            const consistencyScore = Math.round((correctAnswers / totalQuestions) * 100);
                            return `${consistencyScore}/100`;
                          })()
                        }
                      </Text>
                      <Text style={styles.performanceMetricLabel}>CONSISTENCY</Text>
                    </View>
                    <View style={styles.performanceMetricItem}>
                      <Text style={styles.performanceMetricValue}>
                        {performanceRanking?.currentStudent ? 
                          `${Math.round(performanceRanking.currentStudent.masteryScore)}/100` :
                          (() => {
                            const questionResults = selectedResult.questionResults || [];
                            const totalQuestions = questionResults.length || 1;
                            const correctAnswers = questionResults.filter((q: any) => q.isCorrect).length;
                            const masteryScore = Math.round((correctAnswers / totalQuestions) * 100);
                            return `${masteryScore}/100`;
                          })()
                        }
                      </Text>
                      <Text style={styles.performanceMetricLabel}>MASTERY</Text>
                    </View>
                    <View style={styles.performanceMetricItem}>
                      <Text style={styles.performanceMetricValue}>{selectedResult.totalQuestions || selectedResult.resultsSummary?.totalItems || 3}</Text>
                      <Text style={styles.performanceMetricLabel}>QUESTIONS</Text>
                    </View>
                    <View style={styles.performanceMetricItem}>
                      <Text style={styles.performanceMetricValue}>
                        {Math.round((selectedResult.totalTimeSpent || selectedResult.resultsSummary?.totalTimeSpentSeconds * 1000 || 78000) / 1000)}s
                      </Text>
                      <Text style={styles.performanceMetricLabel}>DURATION</Text>
                    </View>
                    <View style={styles.performanceMetricItem}>
                      <Text style={styles.performanceMetricValue}>
                        {selectedResult.resultsSummary?.totalAttempts || 
                         (selectedResult.questionResults ? 
                           selectedResult.questionResults.reduce((sum: number, q: any) => sum + (q.attempts || 1), 0) : 9)
                        }
                      </Text>
                      <Text style={styles.performanceMetricLabel}>ATTEMPTS</Text>
                    </View>
                  </View>

                  {/* Summary Statistics */}
                  <View style={styles.summaryStatsContainer}>
                    <View style={styles.summaryStatRow}>
                      <Text style={styles.summaryStatLabel}>Average Attempts per Question:</Text>
                      <Text style={styles.summaryStatValue}>
                        {(() => {
                          const questionResults = selectedResult.questionResults || [];
                          const totalAttempts = questionResults.reduce((sum: number, q: any) => sum + (q.attempts || 1), 0);
                          const totalQuestions = questionResults.length || 1;
                          return (totalQuestions > 0 ? totalAttempts / totalQuestions : 0).toFixed(1);
                        })()}
                      </Text>
                    </View>
                    <View style={styles.summaryStatRow}>
                      <Text style={styles.summaryStatLabel}>Average Time per Question:</Text>
                      <Text style={styles.summaryStatValue}>
                        {(() => {
                          const questionResults = selectedResult.questionResults || [];
                          const totalTime = questionResults.reduce((sum: number, q: any) => sum + (q.timeSpent || 0), 0);
                          const totalQuestions = questionResults.length || 1;
                          return `${(totalQuestions > 0 ? totalTime / totalQuestions / 1000 : 0).toFixed(0)}s`;
                        })()}
                      </Text>
                    </View>
                    <View style={styles.summaryStatRow}>
                      <Text style={styles.summaryStatLabel}>Correct / Incorrect Count:</Text>
                      <Text style={styles.summaryStatValue}>
                        {(() => {
                          const questionResults = selectedResult.questionResults || [];
                          const correctAnswers = questionResults.filter((q: any) => q.isCorrect).length;
                          const incorrectAnswers = questionResults.length - correctAnswers;
                          return `${correctAnswers}/${incorrectAnswers}`;
                        })()}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Enhanced History Card with Swipe Navigation */}
                <View style={styles.historyCard}>
                  <Text style={styles.historyCardTitle}>Question History</Text>
                  
                  {/* Question Navigation Header */}
                  {selectedResult.questionResults && selectedResult.questionResults.length > 1 && (
                    <View style={styles.questionNavigationHeader}>
                      <Text style={styles.questionNavigationTitle}>
                        Question {currentQuestionIndex + 1} of {selectedResult.questionResults.length}
                      </Text>
                      <View style={styles.questionNavigationDots}>
                        {selectedResult.questionResults.map((_: any, index: number) => (
                          <TouchableOpacity
                            key={index}
                            style={[
                              styles.questionNavigationDot,
                              index === currentQuestionIndex && styles.questionNavigationDotActive
                            ]}
                            onPress={() => handleQuestionIndexChange(index)}
                          />
                        ))}
                      </View>
                    </View>
                  )}



                  {/* Current Question Display */}
                  {selectedResult.questionResults && selectedResult.questionResults[currentQuestionIndex] && (
                    <Animated.View 
                      style={[
                        styles.currentQuestionCard,
                        {
                          opacity: questionFadeAnim,
                          transform: [{
                            translateX: slideAnim.interpolate({
                              inputRange: [0, 1],
                              outputRange: [0, 20],
                            }),
                          }],
                        }
                      ]}
                      {...questionPanResponder.panHandlers}
                    >
                      <ScrollView 
                        style={styles.questionCardScrollView}
                        contentContainerStyle={styles.questionCardScrollContent}
                        showsVerticalScrollIndicator={true}
                        nestedScrollEnabled={true}
                        keyboardShouldPersistTaps="handled"
                        scrollEventThrottle={16}
                      >
                      {/* Question Header */}
                      <View style={styles.questionCardHeader}>
                        <View style={styles.questionHeaderTopRow}>
                          <View style={styles.questionNumberBadge}>
                            <Text style={styles.questionNumberText}>{currentQuestionIndex + 1}</Text>
                          </View>
                          <View style={styles.questionTypeBadge}>
                            <Text style={styles.questionTypeText}>
                              {selectedResult.questionResults[currentQuestionIndex].originalQuestion?.type || 'Question'}
                            </Text>
                          </View>
                          <View style={styles.questionDifficultyBadge}>
                            <MaterialCommunityIcons name="diamond" size={12} color="#8b5cf6" />
                            <Text style={styles.questionDifficultyText}>2.2</Text>
                          </View>
                          <View style={styles.questionTimeBadge}>
                            <MaterialCommunityIcons name="clock" size={12} color="#8b5cf6" />
                            <Text style={styles.questionTimeText}>20s</Text>
                          </View>
                        </View>
                        <View style={styles.questionStatusContainer}>
                          <MaterialIcons 
                            name={selectedResult.questionResults[currentQuestionIndex].isCorrect ? "check-circle" : "close"} 
                            size={20} 
                            color={selectedResult.questionResults[currentQuestionIndex].isCorrect ? "#10b981" : "#ef4444"} 
                          />
                          <Text style={[
                            styles.questionStatusText,
                            { color: selectedResult.questionResults[currentQuestionIndex].isCorrect ? "#10b981" : "#ef4444" }
                          ]}>
                            {selectedResult.questionResults[currentQuestionIndex].isCorrect ? "Correct" : "Incorrect"}
                          </Text>
                        </View>
                      </View>

                      {/* Question Stats */}
                      <View style={styles.questionStatsRow}>
                        <View style={styles.questionStatItem}>
                          <MaterialIcons name="schedule" size={16} color="#64748b" />
                          <Text style={styles.questionStatText}>
                            {selectedResult.questionResults[currentQuestionIndex].attempts || 1} attempts
                          </Text>
                        </View>
                        <View style={styles.questionStatItem}>
                          <MaterialIcons name="timer" size={16} color="#64748b" />
                          <Text style={styles.questionStatText}>
                            {Math.round((selectedResult.questionResults[currentQuestionIndex].timeSpent || 0) / 1000)}s
                          </Text>
                        </View>
                      </View>

                      {/* Question Instruction */}
                      <Text style={styles.questionInstructionText}>
                        {selectedResult.questionResults[currentQuestionIndex].questionText || 
                         selectedResult.questionResults[currentQuestionIndex].originalQuestion?.question || 
                         "Question not available"}
                      </Text>

                      {/* Question Prompt */}
                      <Text style={styles.questionPromptText}>
                        {selectedResult.questionResults[currentQuestionIndex].questionText || 
                         selectedResult.questionResults[currentQuestionIndex].originalQuestion?.question || 
                         "Question not available"}
                      </Text>

                      {/* Question Image if available */}
                      {selectedResult.questionResults[currentQuestionIndex].questionImage && (
                        <View style={styles.questionImageContainer}>
                          <Image 
                            source={{ uri: selectedResult.questionResults[currentQuestionIndex].questionImage }} 
                            style={styles.questionImage}
                            resizeMode="contain"
                          />
                        </View>
                      )}

                      {/* Enhanced Attempt History */}
                      <View style={styles.attemptHistoryContainer}>
                        <Text style={styles.attemptHistoryTitle}>Attempt History:</Text>
                        {selectedResult.questionResults[currentQuestionIndex].attemptHistory && 
                         Array.isArray(selectedResult.questionResults[currentQuestionIndex].attemptHistory) ? 
                          selectedResult.questionResults[currentQuestionIndex].attemptHistory.map((attempt: any, attemptIndex: number) => (
                            <View key={attemptIndex} style={styles.enhancedAttemptHistoryItem}>
                            <View style={styles.attemptHeader}>
                              <View style={styles.attemptStatusContainer}>
                                <MaterialIcons 
                                  name={attempt.isCorrect ? "check-circle" : "close"} 
                                  size={18} 
                                  color={attempt.isCorrect ? "#10b981" : "#ef4444"} 
                                />
                                <Text style={[
                                  styles.attemptNumber,
                                  { color: attempt.isCorrect ? "#10b981" : "#ef4444" }
                                ]}>
                                  Attempt {attemptIndex + 1}
                                </Text>
                                {attempt.attemptType && (
                                  <View style={[
                                    styles.attemptTypeBadge,
                                    { backgroundColor: attempt.attemptType === 'final' ? '#dcfce7' : '#fef3c7' }
                                  ]}>
                                    <Text style={[
                                      styles.attemptTypeText,
                                      { color: attempt.attemptType === 'final' ? '#10b981' : '#f59e0b' }
                                    ]}>
                                      {attempt.attemptType}
                                    </Text>
                                  </View>
                                )}
                              </View>
                              <View style={styles.attemptTimeContainer}>
                                <MaterialIcons name="schedule" size={14} color="#64748b" />
                                <Text style={styles.attemptTimeText}>
                                  {Math.round((attempt.timeSpent || 0) / 1000)}s
                                </Text>
                              </View>
                            </View>
                            
                            <View style={styles.attemptDetails}>
                              <View style={styles.answerLabelContainer}>
                                <MaterialIcons name="quiz" size={14} color="#3b82f6" />
                                <Text style={styles.answerLabel}>Student Answer:</Text>
                              </View>
                              <Text style={styles.attemptAnswerText}>
                                {(() => {
                                  const question = selectedResult.questionResults[currentQuestionIndex];
                                  
                                  // Try the correct field name from AttemptHistory interface
                                  const answerData = attempt.selectedAnswer || attempt.answer || attempt.answerValue || attempt.studentAnswer || attempt.finalAnswer;
                                  
                                  if (answerData) {
                                    const serializedAnswer = serializeReorderAnswerPattern(question, answerData);
                                    return serializedAnswer;
                                  }
                                  
                                  // If no answer data, check if this is a timeout or skipped attempt
                                  if (attempt.attemptType === 'final' && !answerData) {
                                    return 'Attempt timed out or skipped';
                                  }
                                  
                                  // Check for other possible answer fields
                                  if (attempt.userAnswer) {
                                    const serializedUserAnswer = serializeReorderAnswerPattern(question, attempt.userAnswer);
                                    return serializedUserAnswer;
                                  }
                                  
                                  if (attempt.response) {
                                    const serializedResponse = serializeReorderAnswerPattern(question, attempt.response);
                                    return serializedResponse;
                                  }
                                  
                                  return attempt.description || 'No answer provided';
                                })()}
                              </Text>
                              
                              {attempt.confidence && (
                                <View style={styles.confidenceContainer}>
                                  <MaterialIcons name="psychology" size={14} color="#64748b" />
                                  <Text style={styles.confidenceText}>
                                    Confidence: {attempt.confidence}%
                                  </Text>
                                </View>
                              )}
                              
                              {attempt.questionPhase && (
                                <View style={styles.phaseContainer}>
                                  <MaterialIcons name="timeline" size={14} color="#64748b" />
                                  <Text style={styles.phaseText}>
                                    Phase: {attempt.questionPhase}
                                  </Text>
                                </View>
                              )}
                              
                              {attempt.timestamp && (
                                <View style={styles.timestampContainer}>
                                  <MaterialIcons name="access-time" size={14} color="#64748b" />
                                  <Text style={styles.timestampText}>
                                    {new Date(attempt.timestamp).toLocaleTimeString()}
                                  </Text>
                                </View>
                              )}
                            </View>
                          </View>
                        )) || (
                          <View style={styles.enhancedAttemptHistoryItem}>
                            <View style={styles.attemptHeader}>
                              <View style={styles.attemptStatusContainer}>
                                <MaterialIcons 
                                  name={selectedResult.questionResults[currentQuestionIndex].isCorrect ? "check-circle" : "close"} 
                                  size={18} 
                                  color={selectedResult.questionResults[currentQuestionIndex].isCorrect ? "#10b981" : "#ef4444"} 
                                />
                                <Text style={[
                                  styles.attemptNumber,
                                  { color: selectedResult.questionResults[currentQuestionIndex].isCorrect ? "#10b981" : "#ef4444" }
                                ]}>
                                  Final Result
                                </Text>
                              </View>
                              <View style={styles.attemptTimeContainer}>
                                <MaterialIcons name="schedule" size={14} color="#64748b" />
                                <Text style={styles.attemptTimeText}>
                                  {Math.round((selectedResult.questionResults[currentQuestionIndex].timeSpent || 0) / 1000)}s
                                </Text>
                              </View>
                            </View>
                            
                            <View style={styles.attemptDetails}>
                              <View style={styles.answerLabelContainer}>
                                <MaterialIcons name="check-circle" size={14} color="#10b981" />
                                <Text style={styles.answerLabel}>Final Answer:</Text>
                              </View>
                              <Text style={styles.attemptAnswerText}>
                                {(() => {
                                  const question = selectedResult.questionResults[currentQuestionIndex];
                                  const questionResult = selectedResult.questionResults[currentQuestionIndex];
                                  
                                  // Try the correct field name from QuestionResult interface
                                  const finalAnswer = questionResult.studentAnswer || 
                                                    questionResult.finalAnswer || 
                                                    questionResult.answer || 
                                                    questionResult.answerValue ||
                                                    questionResult.userAnswer ||
                                                    questionResult.response;
                                  
                                  if (finalAnswer) {
                                    const serializedAnswer = serializeReorderAnswerPattern(question, finalAnswer);
                                    return serializedAnswer;
                                  }
                                  
                                  // If no final answer, check if the question was answered correctly
                                  if (questionResult.isCorrect) {
                                    return 'Question answered correctly (answer data not available)';
                                  }
                                  
                                  return 'No final answer recorded';
                                })()}
                              </Text>
                              
                              <View style={styles.attemptStatsContainer}>
                                <View style={styles.attemptStatItem}>
                                  <MaterialIcons name="quiz" size={14} color="#64748b" />
                                  <Text style={styles.attemptStatText}>
                                    Attempts: {selectedResult.questionResults[currentQuestionIndex].attempts || 1}
                                  </Text>
                                </View>
                                
                                <View style={styles.attemptStatItem}>
                                  <MaterialIcons name="timer" size={14} color="#64748b" />
                                  <Text style={styles.attemptStatText}>
                                    Total Time: {Math.round((selectedResult.questionResults[currentQuestionIndex].timeSpent || 0) / 1000)}s
                                  </Text>
                                </View>
                              </View>
                            </View>
                          </View>
                        ) : (
                          <View style={styles.enhancedAttemptHistoryItem}>
                            <Text style={styles.attemptAnswerText}>No attempt history available</Text>
                          </View>
                        )}
                      </View>

                      {/* Options if available */}
                      {selectedResult.questionResults[currentQuestionIndex].options && 
                       selectedResult.questionResults[currentQuestionIndex].options.length > 0 && (
                        <View style={styles.optionsContainer}>
                          <Text style={styles.optionsTitle}>Options:</Text>
                          {selectedResult.questionResults[currentQuestionIndex].options.map((option: any, optionIndex: number) => (
                            <View key={optionIndex} style={styles.optionItem}>
                              <Text style={styles.optionText}>
                                {optionIndex + 1}. {option.text || option}
                              </Text>
                              {option.isCorrect && (
                                <MaterialIcons name="check" size={16} color="#10b981" />
                              )}
                            </View>
                          ))}
                        </View>
                      )}
                      
                      </ScrollView>
                    </Animated.View>
                  )}

                  {/* Arrow Navigation Buttons */}
                  {selectedResult.questionResults && selectedResult.questionResults.length > 1 && (
                    <View style={styles.arrowNavigationButtons}>
                      <TouchableOpacity
                        style={[
                          styles.arrowButton,
                          currentQuestionIndex === 0 && styles.arrowButtonDisabled
                        ]}
                        onPress={handlePreviousQuestion}
                        disabled={currentQuestionIndex === 0}
                      >
                        <MaterialIcons name="chevron-left" size={24} color={currentQuestionIndex === 0 ? "#9ca3af" : "#3b82f6"} />
                      </TouchableOpacity>
                      
                      <TouchableOpacity
                        style={[
                          styles.arrowButton,
                          currentQuestionIndex === selectedResult.questionResults.length - 1 && styles.arrowButtonDisabled
                        ]}
                        onPress={handleNextQuestion}
                        disabled={currentQuestionIndex === selectedResult.questionResults.length - 1}
                      >
                        <MaterialIcons name="chevron-right" size={24} color={currentQuestionIndex === selectedResult.questionResults.length - 1 ? "#9ca3af" : "#3b82f6"} />
                      </TouchableOpacity>
                    </View>
                  )}

                </View>


                {/* Existing Analysis Sections - Keep all existing functionality */}
                {/* Class Comparison */}
                {classAverages && (
                  <View style={styles.comparisonCard}>
                    <Text style={styles.cardTitle}>Class Comparison</Text>
                    <View style={styles.disclaimerContainer}>
                      <MaterialCommunityIcons name="information" size={14} color="#6b7280" />
                      <Text style={styles.disclaimerText}>
                        Averages update as more students complete this activity
                      </Text>
                    </View>
                    <View style={styles.comparisonRow}>
                      <View style={styles.comparisonItem}>
                        <Text style={styles.comparisonLabel}>
                          {performanceRanking?.currentStudent ? 'Your Performance' : 'Your Score'}
                        </Text>
                        <Text style={styles.comparisonValue}>
                          {performanceRanking?.currentStudent ? 
                            Math.round(performanceRanking.currentStudent.overallScore) : 
                            (selectedResult.scorePercentage || 0)
                          }
                        </Text>
                      </View>
                      <View style={styles.comparisonItem}>
                        <Text style={styles.comparisonLabel}>
                          {performanceRanking?.currentStudent ? 'Class Average' : 'Class Average'}
                        </Text>
                        <Text style={styles.comparisonValue}>
                          {performanceRanking?.currentStudent ? 
                            Math.round(performanceRanking.classStats.averageOverallScore) : 
                            Math.round(classAverages.averageScore)
                          }
                        </Text>
                      </View>
                    </View>
                    <View style={styles.comparisonRow}>
                      <View style={styles.comparisonItem}>
                        <Text style={styles.comparisonLabel}>Your Time</Text>
                        <Text style={styles.comparisonValue}>{Math.round((selectedResult.totalTimeSpent || 0) / 1000)}s</Text>
                      </View>
                      <View style={styles.comparisonItem}>
                        <Text style={styles.comparisonLabel}>Class Average</Text>
                        <Text style={styles.comparisonValue}>{Math.round(classAverages.averageTime / 1000)}s</Text>
                      </View>
                    </View>
                    <Text style={styles.comparisonNote}>
                      Based on {classAverages.totalStudents} students
                    </Text>
                  </View>
                )}

                {/* Gemini Analysis */}
                {geminiAnalysis && (
                  <>
                    {/* Overall Performance */}
                    <View style={styles.analysisCard}>
                      <Text style={styles.cardTitle}>Performance Analysis</Text>
                      <View style={styles.performanceLevel}>
                        <View style={styles.performanceHeader}>
                          <Text style={[
                            styles.performanceLevelText,
                            { color: 
                              geminiAnalysis.overallPerformance.level === 'excellent' ? '#10b981' :
                              geminiAnalysis.overallPerformance.level === 'good' ? '#3b82f6' :
                              geminiAnalysis.overallPerformance.level === 'needs_improvement' ? '#f59e0b' : '#ef4444'
                            }
                          ]}>
                            {geminiAnalysis.overallPerformance.level === 'excellent' ? 'MAHUSAY' :
                             geminiAnalysis.overallPerformance.level === 'good' ? 'MABUTI' :
                             geminiAnalysis.overallPerformance.level === 'needs_improvement' ? 'KAYLANGAN PAGBUTIHIN' : 'MAHIRAP'}
                          </Text>
                          {geminiAnalysis.overallPerformance.grade && (
                            <View style={[styles.gradeBadge, { 
                              backgroundColor: geminiAnalysis.overallPerformance.level === 'excellent' ? '#10b981' :
                                             geminiAnalysis.overallPerformance.level === 'good' ? '#3b82f6' :
                                             geminiAnalysis.overallPerformance.level === 'needs_improvement' ? '#f59e0b' : '#ef4444'
                            }]}>
                              <Text style={styles.gradeText}>{geminiAnalysis.overallPerformance.grade}</Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.performanceDescription}>
                          {geminiAnalysis.overallPerformance.description}
                        </Text>
                        {geminiAnalysis.overallPerformance.interpretation && (
                          <Text style={styles.performanceInterpretation}>
                            {geminiAnalysis.overallPerformance.interpretation}
                          </Text>
                        )}
                      </View>
                    </View>


                    {/* Strengths */}
                    <View style={styles.analysisCard}>
                      <Text style={styles.cardTitle}>Strengths</Text>
                      {(geminiAnalysis.strengths || []).map((strength: string, index: number) => (
                        <View key={index} style={styles.analysisItem}>
                          <MaterialCommunityIcons name="check-circle" size={16} color="#10b981" />
                          <Text style={styles.analysisText}>{strength}</Text>
                        </View>
                      ))}
                    </View>

                    {/* Areas for Improvement */}
                    <View style={styles.analysisCard}>
                      <Text style={styles.cardTitle}>Areas for Improvement</Text>
                      {(geminiAnalysis.areasForImprovement || geminiAnalysis.weaknesses || []).map((weakness: string, index: number) => (
                        <View key={index} style={styles.analysisItem}>
                          <MaterialCommunityIcons name="alert-circle" size={16} color="#f59e0b" />
                          <Text style={styles.analysisText}>{weakness}</Text>
                        </View>
                      ))}
                    </View>

                    {/* Simple Recommendations */}
                    <View style={styles.analysisCard}>
                      <Text style={styles.cardTitle}>What You Can Do</Text>
                      <View style={styles.simpleRecommendations}>
                        {(geminiAnalysis.learningRecommendations?.immediate || []).slice(0, 3).map((rec: string, index: number) => (
                          <View key={index} style={styles.recommendationItem}>
                            <MaterialIcons name="lightbulb" size={16} color="#3b82f6" />
                            <Text style={styles.recommendationText}>{rec}</Text>
                          </View>
                        ))}
                      </View>
                    </View>

                    {/* Simple Parent Tips */}
                    <View style={styles.analysisCard}>
                      <Text style={styles.cardTitle}>How to Help Your Child</Text>
                      <View style={styles.simpleGuidance}>
                        {(geminiAnalysis.parentGuidance?.howToHelp || []).slice(0, 2).map((guidance: string, index: number) => (
                          <View key={index} style={styles.guidanceItem}>
                            <MaterialIcons name="support" size={16} color="#10b981" />
                            <Text style={styles.guidanceText}>{guidance}</Text>
                          </View>
                        ))}
                      </View>
                    </View>

                    {/* Simple Next Steps */}
                    {geminiAnalysis.nextSteps && geminiAnalysis.nextSteps.length > 0 && (
                      <View style={styles.analysisCard}>
                        <Text style={styles.cardTitle}>Next Steps</Text>
                        <View style={styles.simpleNextSteps}>
                          {(geminiAnalysis.nextSteps || []).slice(0, 3).map((step: string, index: number) => (
                            <View key={index} style={styles.nextStepItem}>
                              <Text style={styles.nextStepNumber}>{index + 1}.</Text>
                              <Text style={styles.nextStepText}>{step}</Text>
                            </View>
                          ))}
                        </View>
                      </View>
                    )}

                    {/* Call to Action */}
                    {geminiAnalysis.callToAction && (
                      <View style={styles.callToActionCard}>
                        <MaterialIcons name="campaign" size={24} color="#3b82f6" />
                        <Text style={styles.callToActionText}>{geminiAnalysis.callToAction}</Text>
                      </View>
                    )}


                    {/* Encouragement */}
                    <View style={styles.encouragementCard}>
                      <MaterialCommunityIcons name="heart" size={24} color="#ef4444" />
                      <Text style={styles.encouragementText}>
                        {geminiAnalysis.encouragement}
                      </Text>
                    </View>
                  </>
                )}

              </View>
            )}
          </View>
        )}
      </ScrollView>
      </Animated.View>

      {/* Floating Report Button */}
      <Animated.View
        {...panResponder.panHandlers}
        style={[
          styles.floatingReportButton,
          {
            transform: [{ translateX: pan.x }, { translateY: pan.y }],
            opacity: floatingOpacity,
          },
        ]}
      >
        <TouchableOpacity 
          style={styles.floatingReportButtonInner}
          onPress={() => {
            console.log('📞 FAB button pressed - opening tech report modal');
            resetInactivityTimer();
            setShowTechReportModal(true);
          }}
          activeOpacity={0.85}
        >
          <MaterialCommunityIcons name="headset" size={28} color="#ffffff" />
        </TouchableOpacity>
      </Animated.View>

      <Animated.View style={[styles.bottomNav, { opacity: fadeAnim }] }>
        <TouchableOpacity 
          style={[styles.navItem, activeSection === 'home' && styles.activeNavItem]}
          onPress={() => setActiveSection('home')}
        >
          <MaterialIcons name="home" size={24} color={activeSection === 'home' ? "#3b82f6" : "#9ca3af"} />
          <Text style={[styles.navText, activeSection === 'home' && styles.activeNavText]}>Home</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.navItem, activeSection === 'tasks' && styles.activeNavItem]}
          onPress={() => setActiveSection('tasks')}
        >
          <MaterialCommunityIcons name="clipboard-check" size={24} color={activeSection === 'tasks' ? "#3b82f6" : "#9ca3af"} />
          <Text style={[styles.navText, activeSection === 'tasks' && styles.activeNavText]}>Gawain</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.navItem, activeSection === 'history' && styles.activeNavItem]}
          onPress={() => setActiveSection('history')}
        >
          <MaterialCommunityIcons name="clock-outline" size={24} color={activeSection === 'history' ? "#3b82f6" : "#9ca3af"} />
          <Text style={[styles.navText, activeSection === 'history' && styles.activeNavText]}>Kasaysayan</Text>
        </TouchableOpacity>
      </Animated.View>
      
      {/* Parent Registration Modal */}
      <Modal visible={showRegistrationModal} animationType="slide" transparent>
        <KeyboardAvoidingView 
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.registrationModal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Complete Your Profile</Text>
              <TouchableOpacity onPress={() => setShowRegistrationModal(false)} style={styles.closeButton}>
                <AntDesign name="close" size={24} color="#1e293b" />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.registrationForm} showsVerticalScrollIndicator={false}>
              {/* Personal Information */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Personal Information</Text>
                
                <View style={styles.inputRow}>
                  <View style={styles.halfInput}>
                    <TextInput
                      style={styles.registrationInput}
                      placeholder="First Name *"
                      placeholderTextColor="#1e293b"
                      value={registrationData.firstName}
                      onChangeText={(value) => handleRegistrationInputChange('firstName', value)}
                    />
                  </View>
                  <View style={styles.halfInput}>
                    <TextInput
                      style={styles.registrationInput}
                      placeholder="Last Name *"
                      placeholderTextColor="#1e293b"
                      value={registrationData.lastName}
                      onChangeText={(value) => handleRegistrationInputChange('lastName', value)}
                    />
                  </View>
                </View>
                
                <TextInput
                  style={styles.registrationInput}
                  placeholder="Email Address *"
                  placeholderTextColor="#1e293b"
                  value={registrationData.email}
                  onChangeText={(value) => handleRegistrationInputChange('email', value)}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
                
                <TextInput
                  style={styles.registrationInput}
                  placeholder="Mobile Number *"
                  placeholderTextColor="#1e293b"
                  value={registrationData.mobile}
                  onChangeText={(value) => handleRegistrationInputChange('mobile', value)}
                  keyboardType="phone-pad"
                />
                
                {/* Profile Picture Section */}
                <View style={styles.photoSection}>
                  <Text style={styles.photoLabel}>Profile Picture (Optional)</Text>
                  <View style={styles.photoContainer}>
                    {registrationData.profilePicture ? (
                      <View style={styles.photoPreview}>
                        <Image source={{ uri: registrationData.profilePicture }} style={styles.photoPreviewImage} />
                        <TouchableOpacity 
                          style={styles.removePhotoButton}
                          onPress={() => setRegistrationData(prev => ({ ...prev, profilePicture: null }))}
                        >
                          <AntDesign name="close" size={16} color="#fff" />
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <View style={styles.photoPlaceholder}>
                        <AntDesign name="camera" size={32} color="#64748b" />
                        <Text style={styles.photoPlaceholderText}>Add Photo</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.photoButtons}>
                    <TouchableOpacity style={styles.photoButton} onPress={takePhoto}>
                      <AntDesign name="camera" size={20} color="#fff" />
                      <Text style={styles.photoButtonText}>Take Photo</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.photoButton} onPress={pickImage}>
                      <AntDesign name="picture" size={20} color="#fff" />
                      <Text style={styles.photoButtonText}>Upload</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </ScrollView>
            
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setShowRegistrationModal(false)}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.createButton, registrationLoading && styles.buttonDisabled]} 
                onPress={handleRegistration}
                disabled={registrationLoading}
              >
                <Text style={styles.createButtonText}>
                  {registrationLoading ? 'Creating Profile...' : 'Complete Registration'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      
      {/* Profile Modal */}
      <Modal visible={showProfileModal} animationType="slide" transparent>
        <KeyboardAvoidingView 
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.profileModal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Profile Information</Text>
              <TouchableOpacity onPress={closeProfileModal} style={styles.closeButton}>
                <AntDesign name="close" size={24} color="#1e293b" />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.profileForm} showsVerticalScrollIndicator={false}>
              {/* Profile Picture Section */}
              <View style={styles.profilePictureSection}>
                <Text style={styles.profilePictureLabel}>Profile Picture</Text>
                <View style={styles.profilePictureContainer}>
                  {profileEditData.profilePicture ? (
                    <View style={styles.profilePicturePreview}>
                      <Image source={{ uri: profileEditData.profilePicture }} style={styles.profilePicturePreviewImage} />
                      <TouchableOpacity 
                        style={styles.removeProfilePictureButton}
                        onPress={() => setProfileEditData(prev => ({ ...prev, profilePicture: null }))}
                      >
                        <AntDesign name="close" size={16} color="#fff" />
                      </TouchableOpacity>
                    </View>
                  ) : parentData?.profilePictureUrl ? (
                    <View style={styles.profilePicturePreview}>
                      <Image source={{ uri: parentData.profilePictureUrl }} style={styles.profilePicturePreviewImage} />
                    </View>
                  ) : (
                    <View style={styles.profilePicturePlaceholder}>
                      <AntDesign name="camera" size={32} color="#64748b" />
                      <Text style={styles.profilePicturePlaceholderText}>Add Photo</Text>
                    </View>
                  )}
                </View>
                <View style={styles.profilePictureButtons}>
                  <TouchableOpacity style={styles.profilePictureButton} onPress={takeProfilePhoto}>
                    <AntDesign name="camera" size={20} color="#fff" />
                    <Text style={styles.profilePictureButtonText}>Take Photo</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.profilePictureButton} onPress={pickProfileImage}>
                    <AntDesign name="picture" size={20} color="#fff" />
                    <Text style={styles.profilePictureButtonText}>Upload</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Personal Information */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Personal Information</Text>
                
                <View style={styles.inputRow}>
                  <View style={styles.halfInput}>
                    <TextInput
                      style={styles.profileInput}
                      placeholder="First Name *"
                      placeholderTextColor="#1e293b"
                      value={profileEditData.firstName}
                      onChangeText={(value) => handleProfileEditInputChange('firstName', value)}
                    />
                  </View>
                  <View style={styles.halfInput}>
                    <TextInput
                      style={styles.profileInput}
                      placeholder="Last Name *"
                      placeholderTextColor="#1e293b"
                      value={profileEditData.lastName}
                      onChangeText={(value) => handleProfileEditInputChange('lastName', value)}
                    />
                  </View>
                </View>
                
                <TextInput
                  style={styles.profileInput}
                  placeholder="Email Address *"
                  placeholderTextColor="#1e293b"
                  value={profileEditData.email}
                  onChangeText={(value) => handleProfileEditInputChange('email', value)}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
                
                <TextInput
                  style={styles.profileInput}
                  placeholder="Mobile Number *"
                  placeholderTextColor="#1e293b"
                  value={profileEditData.mobile}
                  onChangeText={(value) => handleProfileEditInputChange('mobile', value)}
                  keyboardType="phone-pad"
                />
              </View>
            </ScrollView>
            
            <View style={styles.profileModalActions}>
              <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
                <MaterialIcons name="logout" size={20} color="#ef4444" />
                <Text style={styles.logoutButtonText}>Logout</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.updateButton, profileEditLoading && styles.buttonDisabled]} 
                onPress={handleProfileUpdate}
                disabled={profileEditLoading}
              >
                <Text style={styles.updateButtonText}>
                  {profileEditLoading ? 'Updating...' : 'Update Profile'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      
      {/* Announcement Detail Modal */}
      <Modal visible={showAnnouncementModal} animationType="slide" transparent>
        <KeyboardAvoidingView 
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.announcementModal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Announcement Details</Text>
              <TouchableOpacity onPress={closeAnnouncementModal} style={styles.closeButton}>
                <AntDesign name="close" size={24} color="#1e293b" />
              </TouchableOpacity>
            </View>
            
            {selectedAnnouncement && (
              <View style={styles.announcementModalContent}>
                <ScrollView showsVerticalScrollIndicator={false} style={styles.announcementScrollView}>
                  <View style={styles.announcementModalCard}>
                    <View style={styles.announcementModalHeader}>
                      <View style={styles.announcementModalIcon}>
                        <View style={styles.announcementIconContainer}>
                          <MaterialIcons name="campaign" size={20} color="#ffffff" />
                        </View>
                        <Text style={styles.announcementModalTitle}>{selectedAnnouncement.title}</Text>
                      </View>
                    </View>
                    
                    <View style={styles.announcementModalBody}>
                      <Text style={styles.announcementModalMessage}>{selectedAnnouncement.message}</Text>
                    </View>
                    
                    <View style={styles.announcementModalFooter}>
                      <View style={styles.announcementModalMeta}>
                        <View style={styles.announcementModalMetaRow}>
                          <Text style={styles.announcementModalMetaLabel}>Posted on:</Text>
                          <Text style={styles.announcementModalMetaValue}>
                            {selectedAnnouncement.dateTime ? new Date(selectedAnnouncement.dateTime).toLocaleString('en-US', {
                              weekday: 'short',
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric',
                              hour: 'numeric',
                              minute: '2-digit',
                              hour12: true
                            }) : 'No date'}
                          </Text>
                        </View>
                        <View style={styles.announcementModalMetaRow}>
                          <View style={styles.teacherProfileRow}>
                            <View style={styles.teacherAvatarSmall}>
                              {selectedAnnouncement.teacherProfilePictureUrl ? (
                                <Image 
                                  source={{ uri: selectedAnnouncement.teacherProfilePictureUrl }} 
                                  style={styles.teacherProfileImageSmall}
                                />
                              ) : (
                                <MaterialIcons name="person" size={16} color="#64748b" />
                              )}
                            </View>
                            <Text style={styles.announcementModalMetaLabel}>Posted by: </Text>
                            <Text style={styles.announcementModalMetaValue}>
                              {selectedAnnouncement.teacherGender === 'Male' ? 'Sir' : selectedAnnouncement.teacherGender === 'Female' ? 'Ma\'am' : ''} {selectedAnnouncement.teacherName || 'Teacher'}
                            </Text>
                          </View>
                        </View>
                      </View>
                    </View>
                  </View>
                </ScrollView>
              </View>
            )}
            
            <View style={styles.announcementModalActions}>
              <TouchableOpacity style={styles.closeAnnouncementButton} onPress={closeAnnouncementModal}>
                <Text style={styles.closeAnnouncementButtonText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Technical Report Modal */}
      <Modal visible={showTechReportModal} animationType="slide" transparent>
        <KeyboardAvoidingView 
          style={styles.techReportModalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.techReportModal}>
            <View style={styles.techReportModalHeader}>
              <View style={styles.techReportModalTitleContainer}>
                <MaterialCommunityIcons name="bug-outline" size={24} color="#ef4444" />
                <Text style={styles.techReportModalTitle}>Report Technical Problem</Text>
              </View>
              <TouchableOpacity 
                onPress={() => {
                  setShowTechReportModal(false);
                  setReportDescription('');
                  setReportScreenshots([]);
                }}
                disabled={submittingReport}
              >
                <AntDesign name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>
            
            <ScrollView 
              style={styles.techReportModalContent} 
              showsVerticalScrollIndicator={false} 
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.techReportForm}>
                <Text style={styles.techReportHint}>
                  Help us improve! Please describe any bugs or errors you encountered. Be as detailed as possible and attach screenshots if available.
                </Text>

                <View style={styles.techReportField}>
                  <Text style={styles.techReportFieldLabel}>Problem Description *</Text>
                  <TextInput
                    style={[styles.techReportFieldInput, styles.techReportMessageInput]}
                    value={reportDescription}
                    onChangeText={setReportDescription}
                    placeholder="Describe the bug or error you encountered..."
                    placeholderTextColor="#94a3b8"
                    multiline
                    textAlignVertical="top"
                    editable={!submittingReport}
                  />
                </View>

                <View style={styles.techReportField}>
                  <Text style={styles.techReportFieldLabel}>Screenshots (Optional)</Text>
                  <Text style={styles.techReportFieldHint}>
                    You can attach up to 5 screenshots to help us understand the issue
                  </Text>
                  
                  {reportScreenshots.length > 0 && (
                    <ScrollView 
                      horizontal 
                      showsHorizontalScrollIndicator={false} 
                      style={styles.screenshotsPreviewContainer}
                    >
                      {reportScreenshots.map((uri, idx) => (
                        <View key={idx} style={styles.screenshotPreviewWrapper}>
                          <Image source={{ uri }} style={styles.screenshotPreview} />
                          <TouchableOpacity
                            style={styles.removeScreenshotButton}
                            onPress={() => removeReportScreenshot(uri)}
                            disabled={submittingReport}
                          >
                            <AntDesign name="close" size={16} color="#ffffff" />
                          </TouchableOpacity>
                        </View>
                      ))}
                    </ScrollView>
                  )}

                  <View style={styles.screenshotButtons}>
                    <TouchableOpacity
                      style={styles.screenshotButton}
                      onPress={takeReportPhoto}
                      disabled={submittingReport || reportScreenshots.length >= 5}
                    >
                      <MaterialIcons name="photo-camera" size={20} color="#3b82f6" />
                      <Text style={styles.screenshotButtonText}>Take Photo</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.screenshotButton}
                      onPress={pickReportImage}
                      disabled={submittingReport || reportScreenshots.length >= 5}
                    >
                      <MaterialIcons name="photo-library" size={20} color="#3b82f6" />
                      <Text style={styles.screenshotButtonText}>Choose from Gallery</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </ScrollView>

            <View style={styles.techReportModalFooter}>
              <TouchableOpacity 
                style={styles.techReportCancelButton} 
                onPress={() => {
                  setShowTechReportModal(false);
                  setReportDescription('');
                  setReportScreenshots([]);
                }} 
                disabled={submittingReport}
              >
                <Text style={styles.techReportCancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.techReportSubmitButton,
                  (!reportDescription.trim() || submittingReport) && styles.techReportSubmitButtonDisabled
                ]}
                disabled={submittingReport || !reportDescription.trim()}
                onPress={submitTechnicalReport}
              >
                {submittingReport ? (
                  <View style={styles.techReportLoadingContainer}>
                    <MaterialCommunityIcons name="loading" size={18} color="#ffffff" />
                    <Text style={styles.techReportSubmitButtonText}>Submitting...</Text>
                  </View>
                ) : (
                  <View style={styles.techReportSubmitContainer}>
                    <MaterialIcons name="send" size={18} color="#ffffff" />
                    <Text style={styles.techReportSubmitButtonText}>Submit Report</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>


      {/* Custom Alert */}
      <CustomAlert
        visible={showCustomAlert}
        title={alertConfig.title}
        message={alertConfig.message}
        icon={alertConfig.icon}
        onClose={() => setShowCustomAlert(false)}
      />
      
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  backgroundPattern: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#f8fafc',
    opacity: 0.8,
  },
  scrollView: {
    flex: 1,
  },
  scrollContentContainer: {
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 90, // Extra padding to prevent content from being covered by bottom nav
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Math.min(16, staticHeight * 0.02),
    paddingHorizontal: 0,
    paddingVertical: Math.min(8, staticHeight * 0.01),
  },
  profileSection: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  profileImageContainer: {
    marginRight: 16,
  },
  profileImage: {
    width: Math.min(48, staticWidth * 0.12),
    height: Math.min(48, staticWidth * 0.12),
    borderRadius: Math.min(24, staticWidth * 0.06),
    backgroundColor: '#f1f5f9',
    borderWidth: 2,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  profileImagePlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  welcomeText: {
    flex: 1,
  },
  welcomeLabel: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 4,
    fontWeight: '500',
  },
  welcomeTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
  },
  announcementSection: {
    marginBottom: 24,
  },
  announcementHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  announcementTitle: {
    fontSize: Math.min(15, staticWidth * 0.04),
    fontWeight: '700',
    color: '#1e293b',
  },
  announcementCard: {
    backgroundColor: '#ffffff',
    borderRadius: Math.min(12, staticWidth * 0.03),
    padding: Math.min(16, staticWidth * 0.04),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  teacherProfile: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  teacherAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#f1f5f9',
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  teacherProfileImage: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  teacherInfo: {
    flex: 1,
  },
  teacherName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 2,
  },
  teacherRole: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '500',
  },
  flagButton: {
    padding: 8,
  },
  announcementContent: {
    marginTop: 8,
  },
  announcementIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  pinkIcon: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: '#ec4899',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  announcementIconContainer: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: '#3b82f6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  announcementTitleText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1e293b',
  },
  announcementDescription: {
    fontSize: 14,
    color: '#64748b',
    lineHeight: 20,
  },
  studentProfileSection: {
    marginBottom: 100,
  },
  studentProfileTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 16,
  },
  studentProfileCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  studentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  studentAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#f1f5f9',
    marginRight: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  studentInfo: {
    flex: 1,
  },
  studentName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 4,
  },
  studentId: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '500',
    marginBottom: 2,
  },
  studentGrade: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '500',
  },
  awardIcon: {
    padding: 8,
  },
  progressSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
  },
  progressCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#3b82f6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  progressText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#ffffff',
  },
  progressDescription: {
    flex: 1,
    fontSize: 14,
    color: '#64748b',
    fontWeight: '500',
  },
  metricsGrid: {
    marginBottom: 20,
  },
  metricCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  metricIcon: {
    marginRight: 16,
  },
  metricText: {
    flex: 1,
    fontSize: 14,
    color: '#1e293b',
    fontWeight: '500',
  },
  feedbackCard: {
    flexDirection: 'row',
    backgroundColor: '#eff6ff',
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#3b82f6',
  },
  feedbackIcon: {
    marginRight: 12,
  },
  feedbackText: {
    flex: 1,
    fontSize: 14,
    color: '#1e293b',
    lineHeight: 20,
  },
  bottomNav: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    paddingVertical: 16,
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'ios' ? 32 : 16,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 8,
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
  },
  activeNavItem: {
    backgroundColor: '#eff6ff',
  },
  navText: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 6,
    fontWeight: '500',
  },
  activeNavText: {
    color: '#3b82f6',
    fontWeight: '700',
  },
  // Registration Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  registrationModal: {
    width: '100%',
    maxWidth: 500,
    maxHeight: '90%',
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 20,
    borderWidth: 2,
    borderColor: 'rgba(35, 177, 248, 0.4)',
    shadowColor: '#00aaff',
    shadowOpacity: 0.5,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 25,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,170,255,0.2)',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'rgb(40, 127, 214)',
  },
  closeButton: {
    padding: 5,
  },
  registrationForm: {
    maxHeight: 400,
    paddingHorizontal: 20,
  },
  inputGroup: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 10,
  },
  inputRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  halfInput: {
    width: '48%',
  },
  registrationInput: {
    backgroundColor: 'rgba(255,255,255,0.8)',
    borderWidth: 1,
    borderColor: 'rgba(0,170,255,0.3)',
    borderRadius: 12,
    paddingHorizontal: 15,
    paddingVertical: 12,
    fontSize: 14,
    color: '#1e293b',
    marginBottom: 10,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,170,255,0.2)',
  },
  cancelButton: {
    flex: 1,
    backgroundColor: 'rgba(236, 236, 236, 1)',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginRight: 10,
    borderWidth: 1,
    borderColor: 'rgba(150,150,150,0.3)',
  },
  cancelButtonText: {
    color: '#1e293b',
    fontSize: 14,
    fontWeight: '600',
  },
  createButton: {
    flex: 1,
    backgroundColor: 'rgb(40, 127, 214)',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginLeft: 10,
    borderWidth: 1,
    borderColor: 'rgba(0,170,255,0.3)',
  },
  createButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
  },
  // Photo Section Styles
  photoSection: {
    marginTop: 10,
    marginBottom: 10,
  },
  photoLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 8,
  },
  photoContainer: {
    alignItems: 'center',
    marginBottom: 10,
  },
  photoPreview: {
    position: 'relative',
    width: 120,
    height: 120,
    borderRadius: 60,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: 'rgba(0,170,255,0.3)',
  },
  photoPreviewImage: {
    width: '100%',
    height: '100%',
  },
  removePhotoButton: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(239, 68, 68, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoPlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(0,170,255,0.3)',
    borderStyle: 'dashed',
  },
  photoPlaceholderText: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 4,
    fontWeight: '500',
  },
  photoButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  photoButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgb(40, 127, 214)',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 15,
    marginHorizontal: 5,
  },
  photoButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 6,
  },
  // Announcement Styles
  announcementTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  unreadIndicator: {
    backgroundColor: '#ef4444',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginLeft: 8,
    minWidth: 20,
    alignItems: 'center',
  },
  unreadCount: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  announcementDate: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 8,
    fontStyle: 'italic',
  },
  announcementPostedBy: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 4,
    fontWeight: '500',
  },
  announcementMetaInfo: {
    marginTop: 12,
  },
  announcementMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  announcementMetaLabel: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '500',
    marginRight: 4,
  },
  announcementMetaValue: {
    fontSize: 12,
    color: '#1e293b',
    fontWeight: '600',
  },
  teacherProfileRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  teacherAvatarSmall: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
    marginRight: 8,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  teacherProfileImageSmall: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  noAnnouncementsText: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    paddingVertical: 20,
  },
  // Horizontal Scrolling Styles
  announcementsHorizontalScroll: {
    marginBottom: 16,
  },
  announcementsHorizontalContent: {
    paddingRight: 20,
  },
  announcementCardHorizontal: {
    width: 320,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    marginRight: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    position: 'relative',
  },
  announcementCardExpanded: {
    width: 380,
  },
  unreadAnnouncementCard: {
    borderColor: '#ef4444',
    borderWidth: 2,
    backgroundColor: '#fef2f2',
  },
  unreadIndicatorHorizontal: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: '#ef4444',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  unreadCountHorizontal: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  // Section Styles
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1e293b',
    marginBottom: 16,
    marginTop: 15,
  },
  tasksSection: {
    marginBottom: 100,
  },
  tasksScrollView: {
    flex: 1,
  },
  tasksScrollContainer: {
    paddingBottom: 20, // Ensure last task card is fully accessible
  },
  quarterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#eff6ff',
    borderRadius: 8,
    marginBottom: 8,
    marginTop: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#3b82f6',
  },
  quarterHeaderText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1e40af',
    marginLeft: 6,
    flex: 1,
  },
  quarterBadge: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  quarterBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#ffffff',
  },
  sortIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    marginBottom: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: '#f8fafc',
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  sortIndicatorText: {
    fontSize: 9,
    color: '#64748b',
    fontWeight: '500',
    marginLeft: 4,
  },
  tasksHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  tasksTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tasksMainTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#374151',
    marginBottom: 16,
  },
  tasksSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  summaryItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  summaryDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  summaryDivider: {
    width: 1,
    height: 16,
    backgroundColor: '#e2e8f0',
    marginHorizontal: 12,
  },
  tasksSummaryText: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '600',
  },
  loadingContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 48,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  loadingText: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '600',
    marginTop: 12,
  },
  tasksCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  // Enhanced Task Item Styles - Compact for Mobile
  enhancedTaskItem: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    marginTop: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  taskItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  overdueTaskItem: {
    backgroundColor: '#fef2f2',
    borderWidth: 2,
    borderColor: '#ef4444',
    borderLeftWidth: 4,
    borderLeftColor: '#dc2626',
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  pendingTaskItem: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderLeftWidth: 3,
    borderLeftColor: '#3b82f6',
  },
  completedTaskItem: {
    opacity: 0.8,
    backgroundColor: '#f8fafc',
    borderColor: '#e2e8f0',
  },
  firstTaskItem: {
    borderWidth: 2,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 4,
  },
  // Tasks Loading Skeleton
  tasksLoadingContainer: {
    gap: 16,
  },
  taskSkeletonCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  taskSkeletonHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  taskHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 2,
    marginTop: 2,
  },
  taskIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f0f9ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  taskTitleContainer: {
    flex: 1,
    marginRight: 12,
    marginTop: 3,
  },
  taskRightHeader: {
    alignItems: 'flex-end',
  },
  enhancedTaskTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 8,
    lineHeight: 22,
  },
  // Compact Task Styles for Mobile
  compactTaskHeader: {
    marginBottom: 6,
  },
  taskTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  compactTaskTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: '#1e293b',
    lineHeight: 20,
  },
  compactDueBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 5,
    gap: 3,
    flexShrink: 0,
  },
  compactDueText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#ffffff',
  },
  taskInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
    flexWrap: 'wrap',
  },
  itemsCountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
    gap: 3,
  },
  itemsCountText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#3b82f6',
  },
  timeRemainingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef2f2',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
    gap: 3,
  },
  timeRemainingText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#ef4444',
  },
  compactMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    gap: 8,
  },
  compactTeacherInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  teacherAvatarTiny: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  teacherProfileImageTiny: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  compactTeacherText: {
    fontSize: 10,
    color: '#64748b',
    fontWeight: '500',
    flex: 1,
  },
  compactDueDateFull: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '500',
  },
  // Subtle Action Link (replaces overwhelming button)
  subtleActionLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingVertical: 6,
    gap: 4,
  },
  subtleActionText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#3b82f6',
  },
  urgentActionText: {
    color: '#ef4444',
  },
  compactActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3b82f6',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    gap: 6,
  },
  compactUrgentActionButton: {
    backgroundColor: '#ef4444',
  },
  compactCompletedActionButton: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  compactActionButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#ffffff',
  },
  compactCompletedActionButtonText: {
    color: '#64748b',
  },
  // Result ID Display
  resultIdContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginTop: 4,
    marginBottom: 6,
    alignSelf: 'flex-start',
  },
  resultIdText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#3b82f6',
    marginLeft: 4,
    fontFamily: 'monospace',
  },
  taskBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  exerciseBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#dbeafe',
  },
  exerciseBadgeText: {
    fontSize: 8,
    color: '#3b82f6',
    fontWeight: '600',
    marginLeft: 4,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#f1f5f9',
    borderWidth: 0,
    gap: 4,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    marginLeft: 4,
  },
  enhancedTaskDescription: {
    fontSize: 13,
    color: '#64748b',
    lineHeight: 18,
    marginBottom: 10,
  },
  taskMetaContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginBottom: 16,
    gap: 16,
  },
  taskMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaIconContainer: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  metaText: {
    fontSize: 13,
    fontWeight: '600',
  },
  teacherInfoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  teacherText: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '500',
    marginLeft: 6,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3b82f6',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    shadowColor: '#3b82f6',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  completedActionButton: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  actionButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#ffffff',
    marginLeft: 6,
  },
  completedActionButtonText: {
    color: '#64748b',
  },
  taskLeftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 12,
  },
  taskCheckbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#d1d5db',
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  taskCheckboxCompleted: {
    backgroundColor: '#10b981',
    borderColor: '#10b981',
  },
  taskIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f8fafc',
    justifyContent: 'center',
    alignItems: 'center',
  },
  taskContent: {
    flex: 1,
    marginRight: 12,
  },
  taskHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  taskTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1e293b',
    flex: 1,
  },
  completedTaskTitleStrikethrough: {
    textDecorationLine: 'line-through',
    color: '#9ca3af',
  },
  pointsBadge: {
    backgroundColor: '#3b82f6',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginTop: 6,
    alignSelf: 'flex-start',
  },
  pointsText: {
    fontSize: 10,
    color: '#ffffff',
    fontWeight: '600',
  },
  taskDescription: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 8,
    lineHeight: 20,
  },
  completedTaskDescription: {
    color: '#9ca3af',
  },
  taskMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  taskDueDate: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '500',
    marginLeft: 4,
  },
  highlightedDueDate: {
    color: '#3b82f6',
    fontWeight: '600',
  },
  overdueText: {
    color: '#ef4444',
    fontWeight: '700',
  },
  taskTeacher: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '500',
    marginLeft: 4,
  },
  taskRightSection: {
    alignItems: 'flex-end',
  },
  taskStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginBottom: 8,
  },
  taskStatusText: {
    fontSize: 10,
    fontWeight: '500',
    marginLeft: 4,
  },
  playButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f0f9ff',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e0f2fe',
  },
  startExerciseButton: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
  },
  assignedExerciseInfo: {
    marginTop: 8,
    marginBottom: 8,
  },
  assignedExerciseBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  assignedExerciseBadgeText: {
    fontSize: 10,
    color: '#64748b',
    fontWeight: '500',
    marginLeft: 4,
  },
  emptyTasksCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 48,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  emptyHistoryCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 48,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  emptyHistoryTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyHistoryDescription: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 16,
  },
  emptyHistoryHint: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  emptyHistoryHintText: {
    fontSize: 12,
    color: '#64748b',
    marginLeft: 6,
    fontStyle: 'italic',
  },
  
  // Home Section Styles
  homeScrollView: {
    flex: 1,
  },
  homeScrollContent: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 80, // Extra padding to ensure content is fully scrollable
    flexGrow: 1,
  },
  tasksPreviewSection: {
    marginTop: 20,
    marginBottom: 20,
  },
  tasksPreviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  tasksPreviewTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
    marginLeft: 8,
  },
  tasksPreviewCard: {
    backgroundColor: '#f0f9ff',
    borderRadius: 16,
    padding: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#3b82f6',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  tasksPreviewCardPending: {
    backgroundColor: '#fffbeb', // Light yellow background for pending
    borderLeftColor: '#f59e0b', // Orange border for pending
    borderWidth: 2,
    borderColor: '#fcd34d',
    shadowColor: '#f59e0b',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
  tasksPreviewContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tasksPreviewInfo: {
    flex: 1,
  },
  tasksPreviewCount: {
    fontSize: 16,
    fontWeight: '700',
    color: '#d97706',
    marginBottom: 4,
  },
  tasksPreviewCountCompleted: {
    fontSize: 16,
    fontWeight: '700',
    color: '#059669',
    marginBottom: 4,
  },
  tasksPreviewDescription: {
    fontSize: 14,
    color: '#92400e',
    lineHeight: 20,
  },
  tasksPreviewDescriptionCompleted: {
    fontSize: 14,
    color: '#065f46',
    lineHeight: 20,
  },
  pendingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  completedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  // Loading Skeleton Styles
  loadingSkeleton: {
    backgroundColor: '#f1f5f9',
    borderLeftColor: '#cbd5e1',
  },
  skeletonLine: {
    backgroundColor: '#e2e8f0',
    borderRadius: 4,
  },
  skeletonTitle: {
    width: '60%',
    height: 20,
    marginBottom: 8,
  },
  skeletonDescription: {
    width: '100%',
    height: 16,
  },
  skeletonChevron: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#e2e8f0',
  },
  quoteSection: {
    marginTop: 20,
    marginBottom: 40, // Increased bottom margin to ensure quote is fully visible
  },
  quoteCard: {
    backgroundColor: '#f0f9ff',
    borderRadius: 16,
    padding: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#3b82f6',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  quoteIcon: {
    alignItems: 'center',
    marginBottom: 12,
  },
  quoteText: {
    fontSize: 16,
    fontStyle: 'italic',
    color: '#1e293b',
    textAlign: 'center',
    lineHeight: 26,
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  quoteAuthor: {
    fontSize: 14,
    fontWeight: '600',
    color: '#3b82f6',
    textAlign: 'center',
  },
  emptyIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#f8fafc',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  emptyTasksTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 12,
    textAlign: 'center',
  },
  emptyTasksDescription: {
    fontSize: 16,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 20,
  },
  emptyTasksHint: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  emptyTasksHintText: {
    fontSize: 14,
    color: '#64748b',
    marginLeft: 8,
    fontWeight: '500',
  },
  historySection: {
    marginBottom: 100,
  },
  historyHeader: {
    marginBottom: 16,
  },
  historyStats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingHorizontal: 4,
  },
  historyStatItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  historyStatText: {
    fontSize: 12,
    color: '#64748b',
    marginLeft: 4,
    fontWeight: '500',
  },
  historyStatDivider: {
    width: 1,
    height: 16,
    backgroundColor: '#e2e8f0',
    marginHorizontal: 12,
  },
  historyScrollView: {
    flex: 1,
  },
  historyItem: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  historyItemClickable: {
    borderColor: '#e2e8f0',
  },
  historyItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  historyItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  historyItemInfo: {
    flex: 1,
    marginLeft: 12,
  },
  historyItemRight: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 6,
  },
  historyMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 12,
  },
  historyMetaText: {
    fontSize: 12,
    color: '#64748b',
    marginLeft: 4,
    fontWeight: '500',
  },
  resultBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#3b82f6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  noResultBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyContent: {
    flex: 1,
  },
  historyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 4,
  },
  historyDescription: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 4,
  },
  historyDate: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '500',
  },
  // Profile Modal Styles
  profileModal: {
    width: '100%',
    maxWidth: 500,
    maxHeight: '90%',
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 20,
    borderWidth: 2,
    borderColor: 'rgba(35, 177, 248, 0.4)',
    shadowColor: '#00aaff',
    shadowOpacity: 0.5,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 25,
  },
  profileForm: {
    maxHeight: 400,
    paddingHorizontal: 20,
  },
  profilePictureSection: {
    marginBottom: 20,
  },
  profilePictureLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 8,
  },
  profilePictureContainer: {
    alignItems: 'center',
    marginBottom: 10,
  },
  profilePicturePreview: {
    position: 'relative',
    width: 120,
    height: 120,
    borderRadius: 60,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: 'rgba(0,170,255,0.3)',
  },
  profilePicturePreviewImage: {
    width: '100%',
    height: '100%',
  },
  removeProfilePictureButton: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(239, 68, 68, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  profilePicturePlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(0,170,255,0.3)',
    borderStyle: 'dashed',
  },
  profilePicturePlaceholderText: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 4,
    fontWeight: '500',
  },
  profilePictureButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  profilePictureButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgb(40, 127, 214)',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 15,
    marginHorizontal: 5,
  },
  profilePictureButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 6,
  },
  profileInput: {
    backgroundColor: 'rgba(255,255,255,0.8)',
    borderWidth: 1,
    borderColor: 'rgba(0,170,255,0.3)',
    borderRadius: 12,
    paddingHorizontal: 15,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1e293b',
    marginBottom: 10,
  },
  profileModalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,170,255,0.2)',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  logoutButtonText: {
    color: '#ef4444',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  updateButton: {
    flex: 1,
    backgroundColor: 'rgb(40, 127, 214)',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginLeft: 10,
    borderWidth: 1,
    borderColor: 'rgba(0,170,255,0.3)',
  },
  updateButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  // Announcement Modal Styles
  announcementModal: {
    width: '100%',
    maxWidth: 500,
    maxHeight: '85%',
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 20,
    borderWidth: 2,
    borderColor: 'rgba(35, 177, 248, 0.4)',
    shadowColor: '#00aaff',
    shadowOpacity: 0.5,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 25,
  },
  announcementModalContent: {
    flex: 1,
    paddingHorizontal: 20,
  },
  announcementScrollView: {
    flex: 1,
  },
  announcementModalCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  announcementModalHeader: {
    marginBottom: 16,
  },
  announcementModalIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  announcementModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
    marginLeft: 12,
  },
  announcementModalBody: {
    marginBottom: 20,
  },
  announcementModalMessage: {
    fontSize: 16,
    color: '#1e293b',
    lineHeight: 24,
  },
  announcementModalFooter: {
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingTop: 16,
  },
  announcementModalMeta: {
    marginBottom: 8,
  },
  announcementModalMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  announcementModalMetaLabel: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '500',
    marginRight: 4,
  },
  announcementModalMetaValue: {
    fontSize: 14,
    color: '#1e293b',
    fontWeight: '600',
  },
  announcementModalActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,170,255,0.2)',
    backgroundColor: 'rgba(255,255,255,0.95)',
  },
  closeAnnouncementButton: {
    backgroundColor: 'rgb(40, 127, 214)',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,170,255,0.3)',
  },
  closeAnnouncementButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  // Question Result View Styles
  questionResultSection: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  questionResultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 16,
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#3b82f6',
    marginLeft: 4,
  },
  questionResultTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
    flex: 1,
  },
  questionResultContent: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  performanceCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 12,
  },
  scoreContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  scoreText: {
    fontSize: 48,
    fontWeight: '800',
    color: '#3b82f6',
    marginBottom: 4,
  },
  scoreLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#64748b',
  },
  scoreNote: {
    fontSize: 12,
    color: '#9ca3af',
    textAlign: 'center',
    marginTop: 4,
    fontStyle: 'italic',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#64748b',
  },
  comparisonCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  comparisonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  comparisonItem: {
    flex: 1,
    alignItems: 'center',
  },
  comparisonLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#64748b',
    marginBottom: 4,
  },
  comparisonValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
  },
  comparisonNote: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 8,
  },
  analysisCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  performanceLevel: {
    alignItems: 'center',
  },
  performanceLevelText: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 8,
  },
  
  // Disclaimer Styles
  disclaimerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    padding: 8,
    borderRadius: 6,
    marginBottom: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#3b82f6',
  },
  disclaimerText: {
    fontSize: 12,
    color: '#6b7280',
    marginLeft: 6,
    flex: 1,
    lineHeight: 16,
  },
  performanceDescription: {
    fontSize: 16,
    color: '#64748b',
    textAlign: 'center',
  },
  analysisItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  analysisText: {
    fontSize: 16,
    color: '#1e293b',
    marginLeft: 12,
    flex: 1,
    lineHeight: 22,
  },
  timeAnalysisText: {
    fontSize: 16,
    color: '#1e293b',
    marginBottom: 12,
    lineHeight: 22,
  },
  timeComparison: {
    backgroundColor: '#f1f5f9',
    padding: 12,
    borderRadius: 8,
  },
  timeComparisonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#475569',
    textAlign: 'center',
  },
  encouragementCard: {
    backgroundColor: '#fef2f2',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderLeftWidth: 4,
    borderLeftColor: '#ef4444',
  },
  encouragementText: {
    fontSize: 16,
    color: '#1e293b',
    marginLeft: 12,
    flex: 1,
    lineHeight: 22,
    fontWeight: '500',
  },
  simpleSummary: {
    gap: 12,
  },
  simpleSummaryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  summaryText: {
    fontSize: 16,
    color: '#374151',
    flex: 1,
  },
  simpleRecommendations: {
    gap: 12,
  },
  simpleGuidance: {
    gap: 12,
  },
  simpleNextSteps: {
    gap: 12,
  },
  nextStepNumber: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#3b82f6',
    marginRight: 8,
  },
  questionDetailsCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  questionDetailItem: {
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
  },
  questionDetailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  questionDetailStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  questionDetailStat: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '500',
  },
  questionInfo: {
    marginBottom: 8,
  },
  questionInfoLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 2,
  },
  questionInfoValue: {
    fontSize: 14,
    color: '#1e293b',
    backgroundColor: '#f1f5f9',
    padding: 8,
    borderRadius: 6,
    fontStyle: 'italic',
  },
  questionClassAverages: {
    backgroundColor: '#e0f2fe',
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#0ea5e9',
  },
  questionClassAveragesTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0c4a6e',
    marginBottom: 6,
  },
  questionClassAveragesRow: {
    flexDirection: 'column',
    marginBottom: 4,
  },
  questionClassAveragesText: {
    fontSize: 12,
    color: '#0c4a6e',
    fontWeight: '500',
    marginBottom: 2,
  },
  questionClassAveragesNote: {
    fontSize: 11,
    color: '#64748b',
    fontStyle: 'italic',
  },
  
  // Performance Ranking Styles
  rankingCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  rankingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  rankingItem: {
    alignItems: 'center',
  },
  rankingLabel: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '500',
    marginBottom: 4,
  },
  rankingValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
  },
  performanceMetrics: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  metricItem: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  metricLabel: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '500',
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 2,
  },
  metricComparison: {
    fontSize: 10,
    color: '#9ca3af',
    textAlign: 'center',
  },
  overallScore: {
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  overallScoreLabel: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '500',
    marginBottom: 4,
  },
  overallScoreValue: {
    fontSize: 24,
    fontWeight: '800',
    color: '#1e293b',
    marginBottom: 4,
  },

  // Floating Report Button Styles
  floatingReportButton: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 60,
    height: 60,
    zIndex: 1000,
  },
  floatingReportButtonInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#3b82f6',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 10,
    borderWidth: 3,
    borderColor: '#ffffff',
  },

  // Technical Report Modal Styles
  techReportModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  techReportModal: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    width: '100%',
    maxHeight: '95%',
    minHeight: '80%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 16,
  },
  techReportModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingVertical: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  techReportModalTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  techReportModalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1e293b',
    letterSpacing: -0.3,
  },
  techReportModalContent: {
    flex: 1,
  },
  techReportForm: {
    paddingHorizontal: 28,
    paddingVertical: 20,
    gap: 20,
  },
  techReportHint: {
    fontSize: 14,
    color: '#64748b',
    lineHeight: 20,
    backgroundColor: '#f8fafc',
    padding: 12,
    borderRadius: 12,
  },
  techReportField: {
    gap: 8,
  },
  techReportFieldLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#64748b',
  },
  techReportFieldHint: {
    fontSize: 12,
    color: '#94a3b8',
    marginBottom: 8,
  },
  techReportFieldInput: {
    backgroundColor: '#f8fafc',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    color: '#0f172a',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  techReportMessageInput: {
    height: 140,
  },
  screenshotsPreviewContainer: {
    marginVertical: 12,
  },
  screenshotPreviewWrapper: {
    marginRight: 12,
    position: 'relative',
  },
  screenshotPreview: {
    width: 100,
    height: 100,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
  },
  removeScreenshotButton: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: '#ef4444',
    borderRadius: 12,
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  screenshotButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  screenshotButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#f8fafc',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  screenshotButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#3b82f6',
  },
  techReportModalFooter: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 24,
    paddingBottom: 48,
    paddingTop: 12,
  },
  techReportCancelButton: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f1f5f9',
  },
  techReportCancelButtonText: {
    color: '#0f172a',
    fontWeight: '700',
    fontSize: 15,
  },
  techReportSubmitButton: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3b82f6',
  },
  techReportSubmitButtonDisabled: {
    opacity: 0.6,
  },
  techReportLoadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  techReportSubmitContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  techReportSubmitButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 15,
  },
  // Custom Alert Styles
  alertOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  alertContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 0,
    minWidth: 280,
    maxWidth: 350,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  alertContent: {
    padding: 20,
  },
  alertTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 6,
    textAlign: 'center',
  },
  alertMessage: {
    fontSize: 15,
    color: '#6b7280',
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 20,
  },
  alertButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    flexWrap: 'wrap',
  },
  alertButtonsThree: {
    flexDirection: 'column',
  },
  alertButtonsFour: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  alertButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#3b82f6',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 120,
  },
  alertButtonSingle: {
    width: '100%',
  },
  alertButtonThree: {
    width: '100%',
    marginBottom: 8,
  },
  alertButtonFour: {
    flex: 1,
    minWidth: '45%',
  },
  alertButtonDestructive: {
    backgroundColor: '#ef4444',
  },
  alertButtonCancel: {
    backgroundColor: '#6b7280',
  },
  alertButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  alertButtonTextDestructive: {
    color: '#ffffff',
  },
  alertButtonTextCancel: {
    color: '#ffffff',
  },
  // New comprehensive result display styles
  infoCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  infoLabel: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '600',
    marginLeft: 8,
    marginRight: 8,
    minWidth: 80,
  },
  infoValue: {
    fontSize: 14,
    color: '#1e293b',
    fontWeight: '500',
    flex: 1,
  },
  additionalMetrics: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  additionalMetricLabel: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '500',
  },
  additionalMetricValue: {
    fontSize: 13,
    color: '#1e293b',
    fontWeight: '600',
  },
  performanceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  gradeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  gradeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  performanceInterpretation: {
    fontSize: 13,
    color: '#64748b',
    fontStyle: 'italic',
    marginTop: 8,
    lineHeight: 18,
  },
  insightsCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  insightsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  insightItem: {
    width: '48%',
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    alignItems: 'center',
  },
  insightLabel: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '600',
    marginTop: 4,
    marginBottom: 4,
  },
  insightText: {
    fontSize: 11,
    color: '#1e293b',
    textAlign: 'center',
    lineHeight: 16,
  },
  recommendationsCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  recommendationSection: {
    marginBottom: 16,
  },
  recommendationSectionTitle: {
    fontSize: 14,
    color: '#1e293b',
    fontWeight: '700',
    marginBottom: 8,
  },
  recommendationItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  recommendationText: {
    fontSize: 13,
    color: '#374151',
    marginLeft: 8,
    flex: 1,
    lineHeight: 18,
  },
  guidanceCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  guidanceSection: {
    marginBottom: 16,
  },
  guidanceSectionTitle: {
    fontSize: 14,
    color: '#1e293b',
    fontWeight: '700',
    marginBottom: 8,
  },
  guidanceItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  guidanceText: {
    fontSize: 13,
    color: '#374151',
    marginLeft: 8,
    flex: 1,
    lineHeight: 18,
  },
  nextStepsCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  nextStepItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  stepNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#3b82f6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  stepNumberText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  nextStepText: {
    fontSize: 13,
    color: '#374151',
    flex: 1,
    lineHeight: 18,
  },
  callToActionCard: {
    backgroundColor: '#eff6ff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#dbeafe',
  },
  callToActionText: {
    fontSize: 14,
    color: '#1e40af',
    fontWeight: '600',
    marginLeft: 12,
    flex: 1,
    lineHeight: 20,
  },
  resultAvailableIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  noResultIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  historyLoadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  historyLoadingCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  historyLoadingText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
    marginTop: 16,
    marginBottom: 4,
  },
  historyLoadingSubtext: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
  },
  // Completed Tasks Section Styles
  completedTasksSection: {
    marginTop: 32,
    paddingTop: 24,
    borderTopWidth: 2,
    borderTopColor: '#e2e8f0',
  },
  completedTasksHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  completedTasksHeaderText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
    marginLeft: 8,
    flex: 1,
  },
  completedBadgeSmall: {
    backgroundColor: '#10b981',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  completedBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
  },
  completedTaskItemCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  completedTaskLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  completedTaskInfo: {
    marginLeft: 12,
    flex: 1,
  },
  completedTaskTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 4,
  },
  completedTaskMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  completedTaskMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  completedTaskMetaText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  },
  completedTaskDate: {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: '500',
  },
  completedTaskViewButton: {
    padding: 8,
    backgroundColor: '#f8fafc',
    borderRadius: 8,
  },
  viewAllCompletedButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#eff6ff',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginTop: 8,
    gap: 8,
  },
  viewAllCompletedText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#3b82f6',
  },

  // ===== NEW MODERN STYLES FOR FILIPINO-FRIENDLY UI =====
  
  // Welcome Card Styles - Compact & Consistent
  welcomeCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  welcomeGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  welcomeContent: {
    flex: 1,
  },
  filipinoGreeting: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 3,
  },
  welcomeSubtext: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '500',
    lineHeight: 16,
  },
  welcomeIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fef2f2',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Overview Grid Styles - Compact & Efficient
  overviewGrid: {
    marginBottom: 14,
  },
  modernSectionLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 8,
    letterSpacing: 0.3,
  },
  modernStatsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  modernStatCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  statIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  modernStatValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 2,
  },
  modernStatLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748b',
    textAlign: 'center',
  },

  // Section Header Row
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  modernSeeAllText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#3b82f6',
  },

  // Active Section Styles - Highlight Important Tasks
  activeSection: {
    marginBottom: 14,
  },
  activeTaskCard: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderLeftWidth: 3,
    borderLeftColor: '#3b82f6',
  },
  activeTaskContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 10,
  },
  activeTaskLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  activeTaskIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#dbeafe',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  urgentTaskIcon: {
    backgroundColor: '#fee2e2',
  },
  activeTaskInfo: {
    flex: 1,
  },
  activeTaskTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 2,
  },
  activeTaskMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  activeTaskMetaText: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '500',
  },
  urgentText: {
    color: '#ef4444',
    fontWeight: '700',
  },

  // Recent Section Styles
  recentSection: {
    marginBottom: 14,
  },
  recentActivityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  recentActivityIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  recentActivityInfo: {
    flex: 1,
  },
  recentActivityTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 3,
  },
  recentActivityMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  recentScoreBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#fffbeb',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
  },
  recentScoreText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#f59e0b',
  },
  recentActivityDate: {
    fontSize: 10,
    color: '#94a3b8',
    fontWeight: '500',
  },

  // Empty State Styles
  emptyStateCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderStyle: 'dashed',
  },
  emptyStateTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1e293b',
    marginTop: 10,
    marginBottom: 4,
  },
  emptyStateText: {
    fontSize: 11,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 16,
  },

  // Loading Card
  loadingCard: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },

  // History Modern Styles - Compact & Clear
  historyModernHeader: {
    marginBottom: 14,
  },
  historyMainTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 4,
  },
  historySubtitle: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '500',
  },
  historyStatsGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  historyStatCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  historyStatIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  historyStatValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 1,
  },
  historyStatLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748b',
    textAlign: 'center',
  },

  // Quarter Section Styles - Prominent & Clear
  quarterSection: {
    marginBottom: 12,
  },
  quarterHeaderButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f0f9ff',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: '#bfdbfe',
  },
  quarterHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  quarterIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#3b82f6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  quarterInfo: {
    flex: 1,
  },
  quarterTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 2,
  },
  quarterSummary: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '500',
  },
  emptyQuarterContent: {
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    padding: 24,
    marginTop: 8,
    marginBottom: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderStyle: 'dashed',
  },
  emptyQuarterText: {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: '500',
    marginTop: 8,
    textAlign: 'center',
  },

  // Modern History Item Styles - Score Emphasized
  modernHistoryItem: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
  },
  modernHistoryContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
  },
  modernHistoryIcon: {
    width: 48,
    height: 48,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  modernHistoryScore: {
    fontSize: 15,
    fontWeight: '700',
  },
  modernHistoryInfo: {
    flex: 1,
  },
  modernHistoryTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 4,
    lineHeight: 18,
  },
  modernHistoryMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  modernHistoryMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  modernHistoryMetaText: {
    fontSize: 10,
    color: '#64748b',
    fontWeight: '500',
  },
  modernHistoryDate: {
    fontSize: 10,
    color: '#94a3b8',
    fontWeight: '500',
  },

  // Modern Header Styles - Compact
  modernHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingHorizontal: 2,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  modernProfileImageContainer: {
    marginRight: 10,
  },
  modernProfileImage: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: '#3b82f6',
  },
  modernProfilePlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#3b82f6',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#dbeafe',
  },
  modernWelcomeText: {
    flex: 1,
  },
  modernWelcomeLabel: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '500',
    marginBottom: 1,
  },
  modernWelcomeTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
  },
  notificationBadge: {
    position: 'relative',
    padding: 6,
  },
  notificationDot: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: '#ef4444',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  notificationCount: {
    fontSize: 9,
    fontWeight: '700',
    color: '#ffffff',
  },

  // ===== MODERNIZED UI STYLES =====
  
  // Modern Section Label Container
  modernSectionLabelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },

  // Modern Announcement Section
  modernAnnouncementSection: {
    marginBottom: 18,
  },
  modernUnreadBadge: {
    backgroundColor: '#ef4444',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginLeft: 6,
  },
  modernUnreadCount: {
    fontSize: 10,
    fontWeight: '700',
    color: '#ffffff',
  },
  modernAnnouncementsScroll: {
    marginTop: 2,
  },
  modernAnnouncementsContent: {
    paddingRight: 16,
  },
  modernAnnouncementCard: {
    width: 280,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 14,
    marginRight: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  modernAnnouncementCardUnread: {
    borderColor: '#3b82f6',
    borderWidth: 2,
    backgroundColor: '#eff6ff',
  },
  modernAnnouncementBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: '#ef4444',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    zIndex: 10,
  },
  modernAnnouncementBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: 0.5,
  },
  modernAnnouncementHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  modernAnnouncementIconContainer: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: '#3b82f6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modernAnnouncementTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1e293b',
    flex: 1,
  },
  modernAnnouncementMessage: {
    fontSize: 13,
    color: '#64748b',
    lineHeight: 18,
    marginBottom: 8,
  },
  modernAnnouncementFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  modernAnnouncementTeacher: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  modernAnnouncementTeacherImage: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  modernAnnouncementTeacherPlaceholder: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modernAnnouncementTeacherText: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '500',
  },
  modernAnnouncementDate: {
    fontSize: 10,
    color: '#94a3b8',
    fontWeight: '500',
  },

  // Modern Empty State
  modernEmptyState: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderStyle: 'dashed',
  },
  modernEmptyStateText: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 8,
    textAlign: 'center',
  },

  // Emphasized Action Button
  emphasizedActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3b82f6',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    gap: 6,
    shadowColor: '#3b82f6',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
    minWidth: 120,
  },
  emphasizedViewButton: {
    backgroundColor: '#64748b',
    shadowColor: '#64748b',
  },
  emphasizedUrgentButton: {
    backgroundColor: '#3b82f6',
    shadowColor: '#3b82f6',
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 6,
  },
  emphasizedActionText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: 0.3,
  },

  // Result ID Badge Styles
  resultIdBadgeCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 4,
    alignSelf: 'flex-start',
    gap: 3,
  },
  resultIdTextCompact: {
    fontSize: 9,
    fontWeight: '600',
    color: '#3b82f6',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },

  // Task Description Compact
  taskDescriptionCompact: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 4,
    marginBottom: 4,
    lineHeight: 15,
  },

  // Active Task Description
  activeTaskDescription: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 1,
    marginBottom: 2,
    lineHeight: 14,
  },
  activeTaskMetaSeparator: {
    fontSize: 11,
    color: '#cbd5e1',
    marginHorizontal: 3,
  },

  // Recent Activity Description
  recentActivityDescription: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 1,
    marginBottom: 3,
    lineHeight: 14,
  },
  recentItemsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: '#eff6ff',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  recentItemsText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#3b82f6',
  },

  // New Exercise Result UI Styles
  exerciseResultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  exerciseResultTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#374151',
  },
  exerciseResultHeaderContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  itemAnalysisTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 16,
    marginTop: 8,
  },
  exerciseResultCloseButton: {
    padding: 8,
  },
  exerciseIdBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
    marginBottom: 16,
    gap: 4,
  },
  exerciseIdText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#3b82f6',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  studentInfoCard: {
    backgroundColor: '#f0f9ff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  studentInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    flexWrap: 'wrap',
  },
  studentInfoLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginRight: 8,
  },
  studentInfoValue: {
    fontSize: 14,
    color: '#374151',
    flex: 1,
  },
  onTimeBadge: {
    backgroundColor: '#10b981',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    marginLeft: 8,
  },
  onTimeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#ffffff',
  },
  studentStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  statusGradientBar: {
    width: 40,
    height: 4,
    backgroundColor: '#ec4899',
    borderRadius: 2,
    marginRight: 8,
  },
  studentStatusText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ec4899',
  },
  performanceOverviewCard: {
    backgroundColor: '#f0f9ff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  performanceOverviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  performanceOverviewTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#374151',
  },
  performanceRatingBadge: {
    backgroundColor: '#ef4444',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  performanceRatingText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
  },
  performanceScoreContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  performanceScoreNumber: {
    fontSize: 48,
    fontWeight: '700',
    color: '#1e40af',
    marginBottom: 4,
  },
  performanceScoreLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
    letterSpacing: 1,
  },
  performanceMetricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  performanceMetricItem: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    width: '30%',
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  performanceMetricValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 4,
  },
  performanceMetricLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#374151',
    textAlign: 'center',
  },
  summaryStatsContainer: {
    marginTop: 8,
  },
  summaryStatRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  summaryStatLabel: {
    fontSize: 12,
    color: '#374151',
  },
  summaryStatValue: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
  },
  historyCard: {
    backgroundColor: '#f0f9ff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  historyCardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 16,
  },
  questionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f9ff',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
    flexWrap: 'wrap',
    gap: 8,
  },
  questionNumber: {
    fontSize: 20,
    fontWeight: '700',
    color: '#374151',
    marginRight: 8,
  },
  questionType: {
    fontSize: 14,
    color: '#374151',
    marginRight: 8,
  },
  questionAttempts: {
    fontSize: 12,
    color: '#374151',
    marginLeft: 4,
  },
  questionTime: {
    fontSize: 12,
    color: '#374151',
    marginLeft: 4,
  },
  questionStatus: {
    fontSize: 12,
    color: '#10b981',
    fontWeight: '600',
    marginLeft: 4,
  },
  questionPrompt: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
    marginBottom: 16,
  },
  attemptDetailsContainer: {
    marginBottom: 16,
  },
  attemptItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  attemptText: {
    fontSize: 12,
    color: '#374151',
    marginLeft: 8,
  },

  // Detailed History Modal Styles
  detailedHistoryModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
    zIndex: 9999,
  },
  detailedHistoryModal: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
    minHeight: '60%',
    zIndex: 10000,
  },
  detailedHistoryModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  detailedHistoryModalTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailedHistoryModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
  },
  detailedHistoryCloseButton: {
    padding: 8,
  },
  detailedHistoryModalContent: {
    flex: 1,
    paddingHorizontal: 20,
  },
  detailedQuestionCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 16,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  detailedQuestionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    flexWrap: 'wrap',
    gap: 8,
  },
  detailedQuestionNumber: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
    marginRight: 8,
  },
  detailedQuestionType: {
    fontSize: 12,
    color: '#64748b',
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    marginRight: 8,
  },
  detailedQuestionAttempts: {
    fontSize: 12,
    color: '#374151',
    marginLeft: 4,
  },
  detailedQuestionTime: {
    fontSize: 12,
    color: '#374151',
    marginLeft: 4,
  },
  detailedQuestionStatus: {
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
  },
  detailedQuestionPrompt: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
    marginBottom: 12,
  },
  detailedQuestionImageContainer: {
    marginBottom: 12,
    alignItems: 'center',
  },
  detailedQuestionImage: {
    width: 200,
    height: 150,
    borderRadius: 8,
  },
  detailedAttemptHistory: {
    marginBottom: 12,
  },
  detailedAttemptHistoryTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 8,
  },
  detailedAttemptItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    paddingLeft: 8,
  },
  detailedAttemptText: {
    fontSize: 12,
    color: '#374151',
    flex: 1,
    marginLeft: 8,
  },
  detailedAttemptTime: {
    fontSize: 10,
    color: '#64748b',
    marginLeft: 8,
  },
  detailedOptionsContainer: {
    marginTop: 8,
  },
  detailedOptionsTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 6,
  },
  detailedOptionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
    paddingLeft: 8,
  },
  detailedOptionText: {
    fontSize: 12,
    color: '#374151',
    flex: 1,
  },
  noHistoryContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  noHistoryText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#64748b',
    marginTop: 12,
  },
  noHistorySubtext: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 4,
    textAlign: 'center',
  },
  detailedHistoryModalFooter: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  detailedHistoryCloseFooterButton: {
    backgroundColor: '#3b82f6',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
  },
  detailedHistoryCloseFooterButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },

  // Expanded History Styles
  expandedHistoryCard: {
    backgroundColor: '#f0f9ff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  expandedHistoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  expandedHistoryTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
  },
  expandedHistoryCloseButton: {
    padding: 8,
  },
  expandedHistoryContent: {
    maxHeight: 400,
  },
  expandedQuestionCard: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  expandedQuestionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    flexWrap: 'wrap',
    gap: 6,
  },
  expandedQuestionNumber: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1e293b',
    marginRight: 6,
  },
  expandedQuestionType: {
    fontSize: 11,
    color: '#64748b',
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginRight: 6,
  },
  expandedQuestionAttempts: {
    fontSize: 11,
    color: '#374151',
    marginLeft: 2,
  },
  expandedQuestionTime: {
    fontSize: 11,
    color: '#374151',
    marginLeft: 2,
  },
  expandedQuestionStatus: {
    fontSize: 11,
    fontWeight: '600',
    marginLeft: 2,
  },
  expandedQuestionPrompt: {
    fontSize: 13,
    color: '#374151',
    lineHeight: 18,
    marginBottom: 8,
  },
  expandedQuestionImageContainer: {
    marginBottom: 8,
    alignItems: 'center',
  },
  expandedQuestionImage: {
    width: 150,
    height: 100,
    borderRadius: 6,
  },
  expandedAttemptHistory: {
    marginBottom: 8,
  },
  expandedAttemptHistoryTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 6,
  },
  expandedAttemptItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    paddingLeft: 6,
  },
  expandedAttemptText: {
    fontSize: 11,
    color: '#374151',
    flex: 1,
    marginLeft: 6,
  },
  expandedAttemptTime: {
    fontSize: 10,
    color: '#64748b',
    marginLeft: 6,
  },
  expandedOptionsContainer: {
    marginTop: 6,
  },
  expandedOptionsTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 4,
  },
  expandedOptionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
    paddingLeft: 6,
  },
  expandedOptionText: {
    fontSize: 11,
    color: '#374151',
    flex: 1,
  },
  expandedNoHistoryContainer: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  expandedNoHistoryText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
    marginTop: 8,
  },
  expandedNoHistorySubtext: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 4,
    textAlign: 'center',
  },

  // Enhanced History Navigation Styles
  questionNavigationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  questionNavigationTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
  },
  questionNavigationDots: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  questionNavigationDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#d1d5db',
    marginHorizontal: 4,
  },
  questionNavigationDotActive: {
    backgroundColor: '#3b82f6',
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  currentQuestionCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    height: 400, // Fixed height for the white card
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  questionCardScrollView: {
    flex: 1,
    maxHeight: 350, // Ensure scrollable area within the 400px card
    minHeight: 200, // Ensure minimum scrollable area
  },
  questionCardScrollContent: {
    paddingBottom: 20,
    paddingTop: 5,
    flexGrow: 1,
    minHeight: 350, // Force content to be scrollable
  },
  questionCardHeader: {
    marginBottom: 16,
  },
  questionHeaderTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  questionNumberBadge: {
    backgroundColor: '#3b82f6',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    minWidth: 24,
    alignItems: 'center',
  },
  questionNumberText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
  },
  questionTypeBadge: {
    backgroundColor: '#e0e7ff',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  questionTypeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#3730a3',
    textTransform: 'lowercase',
  },
  questionDifficultyBadge: {
    backgroundColor: '#e0e7ff',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  questionDifficultyText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8b5cf6',
  },
  questionTimeBadge: {
    backgroundColor: '#e0e7ff',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  questionTimeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8b5cf6',
  },
  questionStatusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  questionStatusText: {
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 6,
  },
  questionInstructionText: {
    fontSize: 14,
    color: '#1e293b',
    fontWeight: '600',
    lineHeight: 20,
    marginBottom: 16,
  },
  questionStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  questionStatItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  questionStatText: {
    fontSize: 12,
    color: '#64748b',
    marginLeft: 4,
  },
  questionPromptText: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
    marginBottom: 12,
  },
  questionImageContainer: {
    alignItems: 'center',
    marginBottom: 12,
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    padding: 8,
  },
  questionImage: {
    width: 200,
    height: 150,
    borderRadius: 6,
  },
  attemptHistoryContainer: {
    marginBottom: 12,
    marginTop: 8,
  },
  attemptHistoryTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  attemptHistoryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    paddingVertical: 4,
  },
  attemptHistoryText: {
    fontSize: 13,
    color: '#4b5563',
    marginLeft: 8,
    flex: 1,
  },
  attemptHistoryTime: {
    fontSize: 11,
    color: '#9ca3af',
    marginLeft: 8,
  },
  enhancedAttemptHistoryItem: {
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  attemptHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  attemptStatusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  attemptNumber: {
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
  },
  attemptTypeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    marginLeft: 8,
  },
  attemptTypeText: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  attemptTimeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  attemptTimeText: {
    fontSize: 12,
    color: '#64748b',
    marginLeft: 4,
    fontWeight: '500',
  },
  attemptDetails: {
    marginTop: 4,
  },
  attemptAnswerText: {
    fontSize: 13,
    color: '#374151',
    marginBottom: 8,
    lineHeight: 18,
  },
  answerLabelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  answerLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#3b82f6',
    marginLeft: 4,
  },
  confidenceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  confidenceText: {
    fontSize: 11,
    color: '#64748b',
    marginLeft: 4,
  },
  phaseContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  phaseText: {
    fontSize: 11,
    color: '#64748b',
    marginLeft: 4,
  },
  timestampContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  timestampText: {
    fontSize: 11,
    color: '#64748b',
    marginLeft: 4,
  },
  attemptStatsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  attemptStatItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  attemptStatText: {
    fontSize: 11,
    color: '#64748b',
    marginLeft: 4,
  },
  optionsContainer: {
    marginTop: 8,
  },
  optionsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    paddingVertical: 2,
  },
  optionText: {
    fontSize: 13,
    color: '#4b5563',
    flex: 1,
  },
  arrowNavigationButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 16,
    paddingHorizontal: 20,
    gap: 20, // Add gap between arrows instead of space-between
  },
  arrowButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  arrowButtonDisabled: {
    backgroundColor: '#f1f5f9',
    borderColor: '#e2e8f0',
    shadowOpacity: 0.05,
  },
  swipeHintContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  swipeHintText: {
    fontSize: 13,
    color: '#3b82f6',
    marginLeft: 8,
    fontWeight: '500',
  },
  transitionIndicator: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },

});