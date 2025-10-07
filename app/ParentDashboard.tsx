import { AntDesign, MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Animated, Dimensions, Easing, Image, KeyboardAvoidingView, Modal, PanResponder, Platform, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { logError, logErrorWithStack } from '../lib/error-logger';
import { readData, writeData } from '../lib/firebase-database';
import { uploadFile } from '../lib/firebase-storage';

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
}

const { width, height } = Dimensions.get('window');

export default function ParentDashboard() {
  const router = useRouter();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const translateAnim = useRef(new Animated.Value(16)).current;
  
  // Floating button position state
  const pan = useRef(new Animated.ValueXY({ x: width - 80, y: height - 170 })).current;
  const floatingOpacity = useRef(new Animated.Value(1)).current;
  const inactivityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  
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
  const [tasksLoading, setTasksLoading] = useState(false);
  
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
  const [dailyQuote, setDailyQuote] = useState<{quote: string, author: string} | null>(null);
  
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
    if (!task.resultId) return;
    
    try {
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
        // Enhance question results with original exercise data
        const enhancedQuestionResults = resultData.data.questionResults?.map((qResult: any) => {
          const originalQuestion = exerciseData.data.questions?.find((q: any) => q.id === qResult.questionId);
          return {
            ...qResult,
            questionText: originalQuestion?.question || qResult.questionText || '',
            questionImage: originalQuestion?.questionImage || qResult.questionImage || null,
            options: originalQuestion?.options || qResult.options || [],
            ttsAudioUrl: originalQuestion?.ttsAudioUrl || null,
            // Ensure we have the full question data
            originalQuestion: originalQuestion
          };
        }) || [];
        
        setSelectedResult({
          ...task,
          ...resultData.data,
          questionResults: enhancedQuestionResults
        });
        
        // Check if performance metrics already exist
        if (performanceData.data && performanceData.data.performanceMetrics) {
          setPerformanceRanking({
            currentStudent: performanceData.data.performanceMetrics,
            classStats: performanceData.data.classStats,
            allStudents: [], // Not stored in performance data
            performanceLevel: performanceData.data.performanceMetrics.performanceLevel
          });
        } else {
          // Calculate class averages including per-question averages
          await calculateClassAverages(resultData.data, exerciseData.data);
          
          // Calculate comprehensive performance metrics and ranking
          await calculatePerformanceMetrics(resultData.data, exerciseData.data);
        }
        
        // Generate Gemini analysis
        await generateGeminiAnalysis({
          ...resultData.data,
          questionResults: enhancedQuestionResults
        });
      }
    } catch (error) {
      console.error('Failed to load question result:', error);
      Alert.alert('Error', 'Failed to load exercise results. Please try again.');
    } finally {
      setLoadingAnalysis(false);
    }
  };

  // Helper function to calculate individual student metrics
  const calculateStudentMetrics = (resultData: any) => {
    const questionResults = resultData.questionResults || [];
    const totalQuestions = questionResults.length;
    
    // Calculate efficiency score (lower attempts and time = higher score)
    const totalAttempts = questionResults.reduce((sum: number, q: any) => sum + (q.attempts || 1), 0);
    const totalTime = resultData.totalTimeSpent || 0;
    const avgAttemptsPerQuestion = totalAttempts / totalQuestions;
    const avgTimePerQuestion = totalTime / totalQuestions;
    
    // Calculate consistency score (how consistent performance is across questions)
    const attemptVariance = questionResults.reduce((sum: number, q: any) => {
      const deviation = Math.abs((q.attempts || 1) - avgAttemptsPerQuestion);
      return sum + (deviation * deviation);
    }, 0) / totalQuestions;
    
    const timeVariance = questionResults.reduce((sum: number, q: any) => {
      const deviation = Math.abs((q.timeSpent || 0) - avgTimePerQuestion);
      return sum + (deviation * deviation);
    }, 0) / totalQuestions;
    
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
      studentId: resultData.studentId,
      parentId: resultData.parentId,
      efficiencyScore: Math.round(efficiencyScore),
      consistencyScore: Math.round(consistencyScore),
      masteryScore: Math.round(masteryScore),
      overallScore,
      totalAttempts,
      totalTime,
      avgAttemptsPerQuestion: Math.round(avgAttemptsPerQuestion * 10) / 10,
      avgTimePerQuestion: Math.round(avgTimePerQuestion),
      quickCorrectAnswers: correctAnswers,
      scorePercentage: resultData.scorePercentage || 0
    };
  };

  // Calculate comprehensive performance metrics for class ranking
  const calculatePerformanceMetrics = async (resultData: any, exerciseData: any) => {
    try {
      const allResults = await readData('/ExerciseResults');
      if (!allResults.data) return;

      const results = Object.values(allResults.data) as any[];
      const sameExerciseResults = results.filter((result: any) =>
        result.exerciseId === resultData.exerciseId &&
        result.classId === resultData.classId &&
        result.parentId !== resultData.parentId // Exclude current student's result
      );

      if (sameExerciseResults.length === 0) return;

      // Calculate performance metrics for each student
      const studentMetrics = sameExerciseResults.map((result: any) => {
        const questionResults = result.questionResults || [];
        const totalQuestions = questionResults.length;
        
        // Calculate efficiency score (lower attempts and time = higher score)
        const totalAttempts = questionResults.reduce((sum: number, q: any) => sum + (q.attempts || 1), 0);
        const totalTime = result.totalTimeSpent || 0;
        const avgAttemptsPerQuestion = totalAttempts / totalQuestions;
        const avgTimePerQuestion = totalTime / totalQuestions;
        
        // Calculate consistency score (how consistent performance is across questions)
        const attemptVariance = questionResults.reduce((sum: number, q: any) => {
          const deviation = Math.abs((q.attempts || 1) - avgAttemptsPerQuestion);
          return sum + (deviation * deviation);
        }, 0) / totalQuestions;
        
        const timeVariance = questionResults.reduce((sum: number, q: any) => {
          const deviation = Math.abs((q.timeSpent || 0) - avgTimePerQuestion);
          return sum + (deviation * deviation);
        }, 0) / totalQuestions;
        
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
          studentId: result.studentId,
          studentName: result.studentName || 'Unknown Student',
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
          resultId: resultData.resultId,
          exerciseId: resultData.exerciseId,
          studentId: resultData.studentId,
          parentId: resultData.parentId,
          classId: resultData.classId,
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
      } catch (error) {
        console.error('Failed to save performance metrics:', error);
      }

    } catch (error) {
      console.error('Failed to calculate performance metrics:', error);
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
      // Get all results for the same exercise and class (excluding current student for comparison)
      const allResults = await readData('/ExerciseResults');
      if (allResults.data) {
        const results = Object.values(allResults.data) as any[];
        const sameExerciseResults = results.filter((result: any) => 
          result.exerciseId === resultData.exerciseId && 
          result.classId === resultData.classId &&
          result.parentId !== resultData.parentId // Exclude current student's result
        );
        
        if (sameExerciseResults.length > 0) {
          const totalTime = sameExerciseResults.reduce((sum, r) => sum + (r.totalTimeSpent || 0), 0);
          const avgTime = totalTime / sameExerciseResults.length;
          const avgScore = sameExerciseResults.reduce((sum, r) => sum + (r.scorePercentage || 0), 0) / sameExerciseResults.length;
          
          // Calculate per-question averages
          const questionAverages: any = {};
          if (exerciseData.questions) {
            exerciseData.questions.forEach((question: any, index: number) => {
              const questionTimes = sameExerciseResults
                .map(r => r.questionResults?.find((qr: any) => qr.questionId === question.id)?.timeSpent || 0)
                .filter(time => time > 0);
              
              const questionAttempts = sameExerciseResults
                .map(r => r.questionResults?.find((qr: any) => qr.questionId === question.id)?.attempts || 1)
                .filter(attempts => attempts > 0);
              
              questionAverages[question.id] = {
                averageTime: questionTimes.length > 0 ? questionTimes.reduce((sum, time) => sum + time, 0) / questionTimes.length : 0,
                averageAttempts: questionAttempts.length > 0 ? questionAttempts.reduce((sum, attempts) => sum + attempts, 0) / questionAttempts.length : 1,
                totalStudents: questionTimes.length
              };
            });
          }
          
          setClassAverages({
            averageTime: avgTime,
            averageScore: avgScore,
            totalStudents: sameExerciseResults.length,
            questionAverages: questionAverages
          });
        }
      }
    } catch (error) {
      console.error('Failed to calculate class averages:', error);
    }
  };

  const generateGeminiAnalysis = async (resultData: any) => {
    try {
      const geminiApiKey = "AIzaSyDsUXZXUDTMRQI0axt_A9ulaSe_m-HQvZk";
      
      // Prepare performance data for analysis
      const performanceData = {
        score: resultData.scorePercentage,
        totalQuestions: resultData.totalQuestions,
        timeSpent: resultData.totalTimeSpent,
        questionResults: resultData.questionResults || [],
        classAverage: classAverages?.averageScore || 0,
        classAverageTime: classAverages?.averageTime || 0
      };
      
      const prompt = `You are an expert educational psychologist analyzing a Grade 1 student's math exercise performance. Provide a comprehensive analysis in JSON format.

STUDENT PERFORMANCE DATA:
- Score: ${performanceData.score}%
- Total Questions: ${performanceData.totalQuestions}
- Time Spent: ${Math.round(performanceData.timeSpent / 1000)} seconds
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
${performanceData.questionResults.map((q: any, idx: number) => {
  const classAvg = classAverages?.questionAverages?.[q.questionId];
  return `Question ${q.questionNumber}: ${q.isCorrect ? 'CORRECT' : 'INCORRECT'} (${q.attempts} attempts, ${Math.round(q.timeSpent / 1000)}s)
   Question Text: "${q.questionText}"
   Question Type: ${q.questionType}
   ${q.options && q.options.length > 0 ? `Options: ${q.options.join(', ')}` : ''}
   Student Answer: "${q.studentAnswer}"
   Correct Answer: "${q.correctAnswer}"
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
   
   ${q.attemptHistory && q.attemptHistory.length > 0 ? `Attempt History: ${q.attemptHistory.map((a: any) => `"${a.answer || 'blank'}" (${Math.round((a.timeSpent || 0) / 1000)}s, ${a.attemptType}, ${a.questionPhase}, confidence: ${a.confidence})`).join(', ')}` : ''}
   ${classAvg ? `Class Average Time: ${Math.round(classAvg.averageTime / 1000)}s, Class Average Attempts: ${Math.round(classAvg.averageAttempts)}` : ''}`;
}).join('\n\n')}

IMPORTANT: Since the student completed the exercise, ALL questions were answered correctly. Analyze the specific questions and provide tailored recommendations.

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
    "score": ${performanceData.score}
  },
  "strengths": [
    "List 2-3 specific strengths in Tagalog based on the actual questions (e.g., 'Mahusay sa pagbibilang ng mga numero', 'Mabilis sa pag-identify ng mga hugis')"
  ],
  "weaknesses": [
    "List 2-3 specific areas needing improvement in Tagalog based on actual questions (e.g., 'Kailangan pa ng practice sa subtraction', 'Medyo mabagal sa word problems')"
  ],
  "questionAnalysis": [
    "For each question that took longer or more attempts, provide specific analysis in Tagalog"
  ],
  "timeAnalysis": {
    "studentTime": ${Math.round(performanceData.timeSpent / 1000)},
    "classAverage": ${Math.round(performanceData.classAverageTime / 1000)},
    "comparison": "faster|slower|similar",
    "description": "Analysis of time performance in Tagalog based on specific questions"
  },
  "recommendations": [
    "List 3-4 specific, actionable recommendations in Tagalog for parents based on the actual questions (e.g., 'Practice more addition with objects', 'Work on reading word problems slowly')"
  ],
  "encouragement": "A positive, encouraging message in Tagalog for the student based on their specific performance"
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

  // Helper function to get student class ID
  const getStudentClassId = async (): Promise<string | null> => {
    if (!parentData?.parentKey) return null;
    
    try {
      // Resolve parent key to actual parent ID
      const parentIdResult = await readData(`/parentLoginCodes/${parentData.parentKey}`);
      if (parentIdResult.data) {
        const actualParentId = parentIdResult.data;
        
        // Find the student associated with this parent
        const studentsData = await readData('/students');
        if (studentsData.data) {
          const student = Object.values(studentsData.data).find((s: any) => s.parentId === actualParentId) as any;
          if (student && student.classId) {
            console.log('Found student class ID:', student.classId);
            return student.classId;
          }
        }
      }
    } catch (error) {
      console.warn('Could not get student class information:', error);
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
      
      // Get student class ID for filtering
      const studentClassId = await getStudentClassId();
      
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
      const assignedExerciseTasks: Task[] = await Promise.all(
        assignedExercises
          .filter(assignedExercise => assignedExercise.exercise) // Only include exercises that were loaded successfully
          .map(async (assignedExercise) => {
            // Check if there's a completed result for this exercise
            let completionData = null;
            if (exerciseResultsResult.data) {
              const results = Object.values(exerciseResultsResult.data) as any[];
              completionData = results.find((result: any) => 
                result.exerciseId === assignedExercise.exerciseId && 
                result.assignedExerciseId === assignedExercise.id &&
                result.parentId === parentData?.parentKey
              );
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
              completedAt: completionData?.submittedAt,
              teacherName: assignedExercise.teacherName,
              teacherProfilePictureUrl: assignedExercise.teacherProfilePictureUrl,
              teacherGender: assignedExercise.teacherGender,
              points: assignedExercise.exercise!.questionCount,
              isAssignedExercise: true,
              assignedExerciseId: assignedExercise.id,
              score: completionData?.scorePercentage,
              timeSpent: completionData?.totalTimeSpent,
              resultId: completionData?.resultId
            };
          })
      );
      
      // Combine and sort all tasks by due date (earliest first)
      const combinedTasks = [...allTasks, ...assignedExerciseTasks];
      const sortedTasks = combinedTasks.sort((a, b) => 
        new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
      );
      
      setTasks(sortedTasks);
    } catch (error) {
      console.error('Failed to load tasks:', error);
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
  
  // PanResponder for dragging
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
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

  const submitTechnicalReport = async () => {
    if (!reportDescription.trim()) {
      Alert.alert('Missing Information', 'Please describe the problem.');
      return;
    }

    setSubmittingReport(true);
    try {
      const timestamp = new Date().toISOString();
      const reportId = `report_${Date.now()}`;

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
        reportedBy: parentData?.parentKey || 'unknown',
        reportedByEmail: parentData?.email || 'unknown',
        reportedByName: parentData ? `${parentData.firstName} ${parentData.lastName}` : 'Unknown Parent',
        userRole: 'parent',
        timestamp,
        description: reportDescription.trim(),
        screenshots: uploadedUrls,
        status: 'pending',
      };

      const { success, error } = await writeData(`/technicalReports/${reportId}`, report);
      
      if (success) {
        setShowTechReportModal(false);
        setReportDescription('');
        setReportScreenshots([]);
        Alert.alert('Success', 'Your technical report has been submitted to the Admin. Thank you for helping us improve!');
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
      Alert.alert('Error', 'Failed to submit report. Please try again later.');
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
              <Text style={styles.welcomeLabel}>Welcome,</Text>
              <Text style={styles.welcomeTitle}>
                {parentData ? `${parentData.firstName} ${parentData.lastName}` : 'Marie Chan'}
              </Text>
            </View>
          </View>
        </View>


        {/* Home Section */}
        {activeSection === 'home' && (
          <ScrollView 
            style={styles.homeScrollView} 
            contentContainerStyle={styles.homeScrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Announcements Section */}
            <View style={styles.announcementSection}>
              <View style={styles.announcementHeader}>
                <View style={styles.announcementTitleContainer}>
                  <Text style={styles.announcementTitle}>Announcements</Text>
                  {unreadCount > 0 && (
                    <View style={styles.unreadIndicator}>
                      <Text style={styles.unreadCount}>{unreadCount}</Text>
                    </View>
                  )}
                </View>
              </View>

              {announcements.length > 0 ? (
                <ScrollView 
                  horizontal 
                  showsHorizontalScrollIndicator={false}
                  style={styles.announcementsHorizontalScroll}
                  contentContainerStyle={styles.announcementsHorizontalContent}
                >
                  {announcements.map((announcement, index) => {
                    const parentKey = parentData?.parentKey;
                    const isRead = announcement.readBy && parentKey && announcement.readBy.includes(parentKey);
                    const isExpanded = expandedAnnouncementId === announcement.id;
                    
                    return (
                      <TouchableOpacity 
                        key={announcement.id} 
                        style={[
                          styles.announcementCardHorizontal,
                          !isRead && styles.unreadAnnouncementCard,
                          isExpanded && styles.announcementCardExpanded
                        ]}
                        onPress={() => toggleAnnouncementExpansion(announcement.id)}
                      >
                        <View style={styles.announcementContent}>
                          <View style={styles.announcementIcon}>
                            <View style={styles.announcementIconContainer}>
                              <MaterialIcons name="campaign" size={16} color="#ffffff" />
                            </View>
                            <Text style={styles.announcementTitleText}>{announcement.title}</Text>
                            <MaterialIcons 
                              name={isExpanded ? "keyboard-arrow-up" : "keyboard-arrow-down"} 
                              size={20} 
                              color="#64748b" 
                              style={{ marginLeft: 'auto' }}
                            />
                          </View>
                          <Text 
                            style={styles.announcementDescription} 
                            numberOfLines={isExpanded ? undefined : 3}
                          >
                            {announcement.message}
                          </Text>
                          
                          {isExpanded && (
                            <View style={styles.announcementMetaInfo}>
                              <View style={styles.announcementMetaRow}>
                                <Text style={styles.announcementMetaLabel}>Posted on:</Text>
                                <Text style={styles.announcementMetaValue}>
                                  {announcement.dateTime ? new Date(announcement.dateTime).toLocaleString('en-US', {
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
                              <View style={styles.announcementMetaRow}>
                                <View style={styles.teacherProfileRow}>
                                  <View style={styles.teacherAvatarSmall}>
                                    {announcement.teacherProfilePictureUrl ? (
                                      <Image 
                                        source={{ uri: announcement.teacherProfilePictureUrl }} 
                                        style={styles.teacherProfileImageSmall}
                                      />
                                    ) : (
                                      <MaterialIcons name="person" size={16} color="#64748b" />
                                    )}
                                  </View>
                                  <Text style={styles.announcementMetaLabel}>Posted by: </Text>
                                  <Text style={styles.announcementMetaValue}>
                                    {announcement.teacherGender === 'Male' ? 'Sir' : announcement.teacherGender === 'Female' ? 'Ma\'am' : ''} {announcement.teacherName || 'Teacher'}
                                  </Text>
                                </View>
                              </View>
                            </View>
                          )}
                        </View>
                        
                        {!isRead && (
                          <View style={styles.unreadIndicatorHorizontal}>
                            <Text style={styles.unreadCountHorizontal}>NEW</Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              ) : (
                <View style={styles.announcementCard}>
                  <Text style={styles.noAnnouncementsText}>No announcements yet.</Text>
                </View>
              )}
            </View>

            {/* Tasks Preview Section */}
            <View style={styles.tasksPreviewSection}>
              <View style={styles.tasksPreviewHeader}>
                <MaterialCommunityIcons name="clipboard-check" size={30} color="#3b82f6" />
                <Text style={styles.tasksPreviewTitle}>Tasks Overview</Text>
              </View>
              
              <TouchableOpacity 
                style={styles.tasksPreviewCard}
                onPress={() => setActiveSection('tasks')}
              >
                <View style={styles.tasksPreviewContent}>
                  <View style={styles.tasksPreviewInfo}>
                    {tasks.filter(t => t.isAssignedExercise && t.status === 'pending').length > 0 ? (
                      <>
                        <Text style={styles.tasksPreviewCount}>
                          {tasks.filter(t => t.isAssignedExercise && t.status === 'pending').length} Task{tasks.filter(t => t.isAssignedExercise && t.status === 'pending').length !== 1 ? 's' : ''} Pending
                        </Text>
                        <Text style={styles.tasksPreviewDescription}>
                          {tasks.filter(t => t.isAssignedExercise && t.status === 'pending').length === 1 
                            ? 'You have 1 exercise waiting to be completed'
                            : `You have ${tasks.filter(t => t.isAssignedExercise && t.status === 'pending').length} exercises waiting to be completed`
                          }
                        </Text>
                      </>
                    ) : (
                      <>
                        <Text style={styles.tasksPreviewCount}>
                          No Pending Tasks
                        </Text>
                        <Text style={styles.tasksPreviewDescription}>
                          All exercises are completed! Check back for new assignments.
                        </Text>
                      </>
                    )}
                  </View>
                  <MaterialIcons name="chevron-right" size={24} color="#3b82f6" />
                </View>
              </TouchableOpacity>
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
            
            {tasksLoading ? (
              <View style={styles.loadingContainer}>
                <MaterialCommunityIcons name="loading" size={32} color="#3b82f6" />
                <Text style={styles.loadingText}>Loading tasks...</Text>
              </View>
            ) : tasks.filter(t => t.isAssignedExercise).length > 0 ? (
              <ScrollView 
                style={styles.tasksScrollView} 
                contentContainerStyle={styles.tasksScrollContainer}
                showsVerticalScrollIndicator={false}
              >
                {tasks.filter(t => t.isAssignedExercise).map((task, index) => {
                  const isOverdue = new Date(task.dueDate) < new Date() && task.status !== 'completed';
                  const dueDate = new Date(task.dueDate);
                  const now = new Date();
                  const diffTime = dueDate.getTime() - now.getTime();
                  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                  
                  let dueText = '';
                  let dueIcon: 'event' | 'warning' | 'schedule' = 'event';
                  let dueColor = '#3b82f6';
                  
                  if (diffDays < 0) {
                    dueText = `Overdue by ${Math.abs(diffDays)} day${Math.abs(diffDays) !== 1 ? 's' : ''}`;
                    dueIcon = 'warning';
                    dueColor = '#ef4444';
                  } else if (diffDays === 0) {
                    dueText = 'Due today';
                    dueIcon = 'schedule';
                    dueColor = '#f59e0b';
                  } else if (diffDays === 1) {
                    dueText = 'Due tomorrow';
                    dueIcon = 'schedule';
                    dueColor = '#f59e0b';
                  } else if (diffDays <= 7) {
                    dueText = `Due in ${diffDays} days`;
                    dueIcon = 'event';
                    dueColor = '#3b82f6';
                  } else {
                    dueText = dueDate.toLocaleDateString('en-US', { 
                      month: 'short', 
                      day: 'numeric',
                      year: dueDate.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
                    });
                    dueIcon = 'event';
                    dueColor = '#64748b';
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
                    <View key={task.id} style={[
                      styles.enhancedTaskItem,
                      isOverdue && styles.overdueTaskItem,
                      task.status === 'completed' && styles.completedTaskItem
                    ]}>
                      {/* Task Header with Icon and Status */}
                      <View style={styles.taskHeaderRow}>
                        <View style={styles.taskTitleContainer}>
                          <Text style={[
                            styles.enhancedTaskTitle,
                            task.status === 'completed' && styles.completedTaskTitle
                          ]}>
                            {task.title}
                          </Text>
                        </View>
                        <View style={styles.taskRightHeader}>
                          <View style={[
                            styles.statusBadge,
                            { 
                              backgroundColor: statusInfo.bgColor,
                              borderColor: statusInfo.borderColor
                            }
                          ]}>
                            <MaterialIcons 
                              name={statusInfo.icon} 
                              size={14} 
                              color={statusInfo.color} 
                            />
                            <Text style={[styles.statusText, { color: statusInfo.color }]}>
                              {statusInfo.text}
                            </Text>
                          </View>
                          
                        </View>
                      </View>

                      {/* Task Description */}
                      <Text style={[
                        styles.enhancedTaskDescription,
                        task.status === 'completed' && styles.completedTaskDescription
                      ]}>
                        {task.description}
                      </Text>

                      {/* Task Meta Information */}
                      <View style={styles.taskMetaContainer}>
                        <View style={styles.taskMetaRow}>
                          <View style={[styles.metaIconContainer, { backgroundColor: `${dueColor}15` }]}>
                            <MaterialIcons name={dueIcon} size={16} color={dueColor} />
                          </View>
                          <View style={styles.dueDateContainer}>
                            <Text style={[styles.metaText, { color: dueColor }]}>
                              {dueText}
                            </Text>
                            <Text style={styles.dueDateTimeText}>
                              {dueDate.toLocaleDateString('en-US', {
                                weekday: 'long',
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric'
                              })} at {dueDate.toLocaleTimeString('en-US', {
                                hour: 'numeric',
                                minute: '2-digit',
                                hour12: true
                              })}
                            </Text>
                          </View>
                        </View>
                        
                        {task.teacherName && (
                          <View style={styles.taskMetaRow}>
                            <View style={styles.teacherInfoContainer}>
                              <View style={styles.teacherAvatarSmall}>
                                {task.teacherProfilePictureUrl ? (
                                  <Image 
                                    source={{ uri: task.teacherProfilePictureUrl }} 
                                    style={styles.teacherProfileImageSmall}
                                  />
                                ) : (
                                  <MaterialIcons name="person" size={14} color="#64748b" />
                                )}
                              </View>
                              <Text style={styles.teacherText}>
                                {task.teacherGender === 'Male' ? 'Sir' : task.teacherGender === 'Female' ? 'Ma\'am' : ''} {task.teacherName}
                              </Text>
                            </View>
                          </View>
                        )}
                      </View>

                      {/* Action Button */}
                      {(task.exerciseId || task.isAssignedExercise) && (
                        <TouchableOpacity 
                          style={[
                            styles.actionButton,
                            task.status === 'completed' && styles.completedActionButton
                          ]}
                          onPress={() => handleTaskAction(task)}
                        >
                          <MaterialIcons 
                            name={task.status === 'completed' ? 'visibility' : 'play-arrow'} 
                            size={18} 
                            color={task.status === 'completed' ? "#64748b" : "#ffffff"} 
                          />
                          <Text style={[
                            styles.actionButtonText,
                            task.status === 'completed' && styles.completedActionButtonText
                          ]}>
                            {task.status === 'completed' ? 'View Results' : 'Start Exercise'}
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                })}
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

        {/* History Section */}
        {activeSection === 'history' && !showQuestionResult && (
          <View style={styles.historySection}>
            <View style={styles.historyHeader}>
              <Text style={styles.sectionTitle}>Activity History</Text>
              <View style={styles.historyStats}>
                <View style={styles.historyStatItem}>
                  <MaterialCommunityIcons name="check-circle" size={16} color="#10b981" />
                  <Text style={styles.historyStatText}>
                    {tasks.filter(t => t.isAssignedExercise && t.status === 'completed').length} Completed
                  </Text>
                </View>
                <View style={styles.historyStatDivider} />
                <View style={styles.historyStatItem}>
                  <MaterialCommunityIcons name="clock-outline" size={16} color="#3b82f6" />
                  <Text style={styles.historyStatText}>
                    {tasks.filter(t => t.isAssignedExercise && t.status === 'completed').length > 0 ? 
                      Math.round(tasks.filter(t => t.isAssignedExercise && t.status === 'completed')
                        .reduce((sum, t) => sum + (t.timeSpent || 0), 0) / 1000) : 0}s Total Time
                  </Text>
                </View>
              </View>
            </View>
            {tasksLoading ? (
              <View style={styles.loadingContainer}>
                <MaterialCommunityIcons name="loading" size={32} color="#3b82f6" />
                <Text style={styles.loadingText}>Loading history...</Text>
              </View>
            ) : tasks.filter(t => t.isAssignedExercise && t.status === 'completed').length > 0 ? (
              <ScrollView style={styles.historyScrollView} showsVerticalScrollIndicator={false}>
                {tasks
                  .filter(t => t.isAssignedExercise && t.status === 'completed')
                  .sort((a, b) => new Date(b.completedAt || b.createdAt).getTime() - new Date(a.completedAt || a.createdAt).getTime())
                  .map((task, index) => {
                    const completedDate = task.completedAt ? new Date(task.completedAt) : new Date(task.createdAt);
                    const now = new Date();
                    const diffTime = now.getTime() - completedDate.getTime();
                    const diffHours = Math.floor(diffTime / (1000 * 60 * 60));
                    const diffDays = Math.floor(diffHours / 24);
                    
                    let timeAgo = '';
                    if (diffHours < 1) {
                      timeAgo = 'Just now';
                    } else if (diffHours < 24) {
                      timeAgo = `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
                    } else if (diffDays < 7) {
                      timeAgo = `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
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
                        style={styles.historyItem}
                        onPress={() => {
                          // Navigate to results view if resultId exists
                          if (task.resultId) {
                            handleShowQuestionResult(task);
                          }
                        }}
                      >
                        <View style={styles.historyIcon}>
                          <MaterialCommunityIcons 
                            name="check-circle" 
                            size={20} 
                            color={task.score && task.score >= 80 ? "#10b981" : task.score && task.score >= 60 ? "#f59e0b" : "#ef4444"} 
                          />
                        </View>
                        <View style={styles.historyContent}>
                          <Text style={styles.historyTitle}>{task.title}</Text>
                          <Text style={styles.historyDescription}>
                            {task.score ? `Scored ${task.score}%` : 'Completed'} • {task.points || 0} questions
                            {task.timeSpent && ` • ${formatTime(task.timeSpent)}`}
                          </Text>
                          <Text style={styles.historyDate}>{timeAgo}</Text>
                        </View>
                        {task.resultId && (
                          <MaterialIcons name="chevron-right" size={20} color="#9ca3af" />
                        )}
                      </TouchableOpacity>
                    );
                  })}
              </ScrollView>
            ) : (
              <View style={styles.emptyHistoryCard}>
                <View style={styles.emptyIconContainer}>
                  <MaterialCommunityIcons name="history" size={64} color="#cbd5e1" />
                </View>
                <Text style={styles.emptyHistoryTitle}>No completed activities</Text>
                <Text style={styles.emptyHistoryDescription}>
                  Completed exercises will appear here with detailed performance analysis
                </Text>
                <View style={styles.emptyHistoryHint}>
                  <MaterialIcons name="info" size={16} color="#64748b" />
                  <Text style={styles.emptyHistoryHintText}>
                    Complete some exercises to see your progress
                  </Text>
                </View>
              </View>
            )}
          </View>
        )}

        {/* Question Result View */}
        {activeSection === 'history' && showQuestionResult && selectedResult && (
          <View style={styles.questionResultSection}>
            {/* Header */}
            <View style={styles.questionResultHeader}>
              <TouchableOpacity 
                style={styles.backButton}
                onPress={handleBackToHistory}
              >
                <MaterialIcons name="arrow-back" size={24} color="#3b82f6" />
              </TouchableOpacity>
              <Text style={styles.questionResultTitle}>{selectedResult.title}</Text>
            </View>

            {loadingAnalysis ? (
              <View style={styles.loadingContainer}>
                <MaterialCommunityIcons name="loading" size={32} color="#3b82f6" />
                <Text style={styles.loadingText}>Analyzing performance...</Text>
              </View>
            ) : (
              <ScrollView style={styles.questionResultContent} showsVerticalScrollIndicator={false}>
                {/* Performance Overview */}
                <View style={styles.performanceCard}>
                  <Text style={styles.cardTitle}>Performance Overview</Text>
                  <View style={styles.scoreContainer}>
                    <Text style={styles.scoreText}>
                      {performanceRanking?.currentStudent ? 
                        (() => {
                          return Math.round(performanceRanking.currentStudent.overallScore);
                        })() : 
                        (selectedResult.scorePercentage || 0)
                      }
                    </Text>
                    <Text style={styles.scoreLabel}>
                      {performanceRanking?.currentStudent ? 'Performance Score' : 'Overall Score'}
                    </Text>
                    {performanceRanking?.currentStudent && (
                      <Text style={styles.scoreNote}>
                        Based on efficiency, consistency & mastery
                      </Text>
                    )}
                  </View>
                  <View style={styles.statsRow}>
                    <View style={styles.statItem}>
                      <Text style={styles.statValue}>{selectedResult.totalQuestions || 0}</Text>
                      <Text style={styles.statLabel}>Questions</Text>
                    </View>
                    <View style={styles.statItem}>
                      <Text style={styles.statValue}>{Math.round((selectedResult.totalTimeSpent || 0) / 1000)}s</Text>
                      <Text style={styles.statLabel}>Time Spent</Text>
                    </View>
                    <View style={styles.statItem}>
                      <Text style={styles.statValue}>
                        {selectedResult.questionResults ? 
                          selectedResult.questionResults.reduce((sum: number, q: any) => sum + (q.attempts || 1), 0) : 0
                        }
                      </Text>
                      <Text style={styles.statLabel}>Total Attempts</Text>
                    </View>
                  </View>
                </View>

                {/* Performance Ranking */}
                {performanceRanking?.currentStudent && (
                  <View style={styles.rankingCard}>
                    <Text style={styles.cardTitle}>Performance Ranking</Text>
                   
                    <View style={styles.performanceMetrics}>
                      <View style={styles.metricItem}>
                        <Text style={styles.metricLabel}>Efficiency</Text>
                        <Text style={styles.metricValue}>
                          {(() => {
                            return Math.round(performanceRanking.currentStudent.efficiencyScore);
                          })()}/100
                        </Text>
                        <Text style={styles.metricComparison}>
                          vs {Math.round(performanceRanking.classStats.averageEfficiency)} class avg
                        </Text>
                      </View>
                      <View style={styles.metricItem}>
                        <Text style={styles.metricLabel}>Consistency</Text>
                        <Text style={styles.metricValue}>
                          {(() => {
                            return Math.round(performanceRanking.currentStudent.consistencyScore);
                          })()}/100
                        </Text>
                        <Text style={styles.metricComparison}>
                          vs {Math.round(performanceRanking.classStats.averageConsistency)} class avg
                        </Text>
                      </View>
                      <View style={styles.metricItem}>
                        <Text style={styles.metricLabel}>Mastery</Text>
                        <Text style={styles.metricValue}>
                          {(() => {
                            return Math.round(performanceRanking.currentStudent.masteryScore);
                          })()}/100
                        </Text>
                        <Text style={styles.metricComparison}>
                          vs {Math.round(performanceRanking.classStats.averageMastery)} class avg
                        </Text>
                      </View>
                    </View>
                    <View style={styles.overallScore}>
                      <Text style={styles.overallScoreLabel}>Overall Performance</Text>
                      <Text style={styles.overallScoreValue}>{Math.round(performanceRanking.currentStudent.overallScore)}/100</Text>
                      <Text style={[styles.performanceLevelText, { 
                        color: performanceRanking.performanceLevel === 'excellent' ? '#10b981' :
                               performanceRanking.performanceLevel === 'good' ? '#3b82f6' :
                               performanceRanking.performanceLevel === 'needs_improvement' ? '#f59e0b' : '#ef4444'
                      }]}>
                        {performanceRanking.performanceLevel.charAt(0).toUpperCase() + performanceRanking.performanceLevel.slice(1).replace('_', ' ')}
                      </Text>
                    </View>
                  </View>
                )}

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
                        <Text style={styles.performanceDescription}>
                          {geminiAnalysis.overallPerformance.description}
                        </Text>
                      </View>
                    </View>

                    {/* Strengths */}
                    <View style={styles.analysisCard}>
                      <Text style={styles.cardTitle}>Strengths</Text>
                      {geminiAnalysis.strengths.map((strength: string, index: number) => (
                        <View key={index} style={styles.analysisItem}>
                          <MaterialCommunityIcons name="check-circle" size={16} color="#10b981" />
                          <Text style={styles.analysisText}>{strength}</Text>
                        </View>
                      ))}
                    </View>

                    {/* Areas for Improvement */}
                    <View style={styles.analysisCard}>
                      <Text style={styles.cardTitle}>Areas for Improvement</Text>
                      {geminiAnalysis.weaknesses.map((weakness: string, index: number) => (
                        <View key={index} style={styles.analysisItem}>
                          <MaterialCommunityIcons name="alert-circle" size={16} color="#f59e0b" />
                          <Text style={styles.analysisText}>{weakness}</Text>
                        </View>
                      ))}
                    </View>

                    {/* Question-Specific Analysis */}
                    {geminiAnalysis.questionAnalysis && Array.isArray(geminiAnalysis.questionAnalysis) && geminiAnalysis.questionAnalysis.length > 0 && (
                      <View style={styles.analysisCard}>
                        <Text style={styles.cardTitle}>Question Analysis</Text>
                        {geminiAnalysis.questionAnalysis.map((analysis: any, index: number) => (
                          <View key={index} style={styles.analysisItem}>
                            <MaterialCommunityIcons name="help-circle" size={16} color="#3b82f6" />
                            <Text style={styles.analysisText}>
                              {typeof analysis === 'string' ? analysis : 
                               typeof analysis === 'object' && analysis.analysis ? analysis.analysis :
                               typeof analysis === 'object' && analysis.questionNumber ? 
                                 `Tanong ${analysis.questionNumber}: ${analysis.analysis || analysis.concept || JSON.stringify(analysis)}` :
                               JSON.stringify(analysis)}
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}

                    {/* Time Analysis */}
                    {geminiAnalysis.timeAnalysis && (
                      <View style={styles.analysisCard}>
                        <Text style={styles.cardTitle}>Time Analysis</Text>
                        <Text style={styles.timeAnalysisText}>
                          {geminiAnalysis.timeAnalysis.description}
                        </Text>
                        <View style={styles.timeComparison}>
                          <Text style={styles.timeComparisonText}>
                            You: {geminiAnalysis.timeAnalysis.studentTime}s | 
                            Class: {geminiAnalysis.timeAnalysis.classAverage}s
                          </Text>
                        </View>
                      </View>
                    )}

                    {/* Recommendations */}
                    <View style={styles.analysisCard}>
                      <Text style={styles.cardTitle}>Recommendations</Text>
                      {geminiAnalysis.recommendations.map((recommendation: string, index: number) => (
                        <View key={index} style={styles.analysisItem}>
                          <MaterialCommunityIcons name="lightbulb" size={16} color="#3b82f6" />
                          <Text style={styles.analysisText}>{recommendation}</Text>
                        </View>
                      ))}
                    </View>

                    {/* Encouragement */}
                    <View style={styles.encouragementCard}>
                      <MaterialCommunityIcons name="heart" size={24} color="#ef4444" />
                      <Text style={styles.encouragementText}>
                        {geminiAnalysis.encouragement}
                      </Text>
                    </View>
                  </>
                )}

                {/* Question Details */}
                {selectedResult.questionResults && selectedResult.questionResults.length > 0 && (
                  <View style={styles.questionDetailsCard}>
                    <Text style={styles.cardTitle}>Question Details</Text>
                    {selectedResult.questionResults.map((question: any, index: number) => (
                      <View key={question.questionId} style={styles.questionDetailItem}>
                        <View style={styles.questionDetailHeader}>
                          <Text style={styles.questionNumber}>Tanong {question.questionNumber}</Text>
                          <View style={[
                            styles.questionStatus,
                            { backgroundColor: '#10b981' } // All questions are correct since student completed
                          ]}>
                            <Text style={styles.questionStatusText}>
                              TAMA
                            </Text>
                          </View>
                        </View>
                        
                        {/* Show question text */}
                        {question.questionText && (
                          <View style={styles.questionInfo}>
                            <Text style={styles.questionInfoLabel}>Tanong:</Text>
                            <Text style={styles.questionInfoValue}>"{question.questionText}"</Text>
                          </View>
                        )}
                        
                        {/* Show question image if available */}
                        {question.questionImage && (
                          <View style={styles.questionInfo}>
                            <Text style={styles.questionInfoLabel}>Larawan:</Text>
                            <Text style={styles.questionInfoValue}>May kasamang larawan</Text>
                          </View>
                        )}
                        
                        {/* Show question type */}
                        {question.questionType && (
                          <View style={styles.questionInfo}>
                            <Text style={styles.questionInfoLabel}>Uri ng Tanong:</Text>
                            <Text style={styles.questionInfoValue}>{question.questionType}</Text>
                          </View>
                        )}
                        
                        {/* Show options if available */}
                        {question.options && question.options.length > 0 && (
                          <View style={styles.questionInfo}>
                            <Text style={styles.questionInfoLabel}>Mga Pagpipilian:</Text>
                            <Text style={styles.questionInfoValue}>{question.options.join(', ')}</Text>
                          </View>
                        )}
                        
                        {/* Show attempted answers history */}
                        {question.attemptHistory && question.attemptHistory.length > 0 && (
                          <View style={styles.questionInfo}>
                            <Text style={styles.questionInfoLabel}>Attempted Answers:</Text>
                            <Text style={styles.questionInfoValue}>
                              {question.attemptHistory.map((attempt: any, idx: number) => {
                                const timeSpent = attempt.timeSpent || 0;
                                const timeInSeconds = Math.round(timeSpent / 1000);
                                return `"${attempt.answer || 'blank'}" (${timeInSeconds}s)`;
                              }).join(', ')}
                            </Text>
                          </View>
                        )}
                        
                        {question.studentAnswer && (
                          <View style={styles.questionInfo}>
                            <Text style={styles.questionInfoLabel}>Huling Sagot:</Text>
                            <Text style={styles.questionInfoValue}>"{question.studentAnswer}"</Text>
                          </View>
                        )}
                        
                        {question.correctAnswer && (
                          <View style={styles.questionInfo}>
                            <Text style={styles.questionInfoLabel}>Tamang Sagot:</Text>
                            <Text style={styles.questionInfoValue}>"{question.correctAnswer}"</Text>
                          </View>
                        )}
                        
                        <View style={styles.questionDetailStats}>
                          <Text style={styles.questionDetailStat}>
                            Pagsubok: {question.attempts || 1}
                          </Text>
                          <Text style={styles.questionDetailStat}>
                            Oras: {Math.round((question.timeSpent || 0) / 1000)}s
                          </Text>
                        </View>
                        
                        {/* Show class averages for this question */}
                        {classAverages?.questionAverages?.[question.questionId] && (
                          <View style={styles.questionClassAverages}>
                            <Text style={styles.questionClassAveragesTitle}>Average Class Performance:</Text>
                            <View style={styles.questionClassAveragesRow}>
                              <Text style={styles.questionClassAveragesText}>
                                Average Time: {Math.round(classAverages.questionAverages[question.questionId].averageTime / 1000)}s
                              </Text>
                              <Text style={styles.questionClassAveragesText}>
                                Average Attempts: {Math.round(classAverages.questionAverages[question.questionId].averageAttempts)}
                              </Text>
                            </View>
                            <Text style={styles.questionClassAveragesNote}>
                              Batay sa {classAverages.questionAverages[question.questionId].totalStudents} mag-aaral
                            </Text>
                          </View>
                        )}
                      </View>
                    ))}
                  </View>
                )}
              </ScrollView>
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
          <MaterialIcons name="home" size={24} color={activeSection === 'home' ? "#1e293b" : "#9ca3af"} />
          <Text style={[styles.navText, activeSection === 'home' && styles.activeNavText]}>Home</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.navItem, activeSection === 'tasks' && styles.activeNavItem]}
          onPress={() => setActiveSection('tasks')}
        >
          <MaterialCommunityIcons name="clipboard-check" size={24} color={activeSection === 'tasks' ? "#1e293b" : "#9ca3af"} />
          <Text style={[styles.navText, activeSection === 'tasks' && styles.activeNavText]}>Tasks</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.navItem, activeSection === 'history' && styles.activeNavItem]}
          onPress={() => setActiveSection('history')}
        >
          <MaterialCommunityIcons name="clock-outline" size={24} color={activeSection === 'history' ? "#1e293b" : "#9ca3af"} />
          <Text style={[styles.navText, activeSection === 'history' && styles.activeNavText]}>History</Text>
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
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 120, // Extra padding to prevent content from being covered by bottom nav
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    paddingHorizontal: 0,
    paddingVertical: 12,
  },
  profileSection: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  profileImageContainer: {
    marginRight: 16,
  },
  profileImage: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#f1f5f9',
    borderWidth: 3,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
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
    fontSize: 22,
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
    fontSize: 20,
    fontWeight: '700',
    color: '#1e293b',
  },
  announcementCard: {
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
    fontSize: 16,
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
    fontSize: 16,
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
    fontSize: 20,
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
    fontSize: 20,
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
    fontSize: 16,
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
    // Active state styling handled by text and icon color
  },
  navText: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 6,
    fontWeight: '500',
  },
  activeNavText: {
    color: '#1e293b',
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
    fontSize: 20,
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
    fontSize: 16,
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
    fontSize: 16,
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
    fontSize: 16,
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
    fontSize: 16,
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
    fontSize: 16,
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
    fontSize: 16,
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
    fontSize: 25,
    fontWeight: '700',
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
    fontSize: 24,
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
    fontSize: 16,
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
  // Enhanced Task Item Styles
  enhancedTaskItem: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    marginTop: 4, // Add top margin for better spacing
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    borderWidth: 0,
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
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#fecaca',
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 6,
  },
  completedTaskItem: {
    opacity: 0.8,
    backgroundColor: '#f8fafc',
    borderColor: '#e2e8f0',
    marginBottom: 12,
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
    fontSize: 16,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 8,
    lineHeight: 22,
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
    fontSize: 14,
    color: '#64748b',
    lineHeight: 20,
    marginBottom: 16,
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
  dueDateContainer: {
    flex: 1,
  },
  dueDateTimeText: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '500',
    marginTop: 2,
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
    borderRadius: 12,
    paddingVertical: 12,
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
    fontSize: 14,
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
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
    flex: 1,
  },
  completedTaskTitle: {
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
    fontSize: 18,
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
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 120, // Extra padding to ensure content is fully scrollable
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
    fontSize: 20,
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
    color: '#1e40af',
    marginBottom: 4,
  },
  tasksPreviewDescription: {
    fontSize: 14,
    color: '#1e40af',
    lineHeight: 20,
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
  historyCard: {
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
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  historyIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f8fafc',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  historyContent: {
    flex: 1,
  },
  historyTitle: {
    fontSize: 16,
    fontWeight: '600',
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
  questionNumber: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
  },
  questionStatus: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  questionStatusText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
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
    maxHeight: '85%',
    minHeight: '60%',
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
    paddingBottom: 24,
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
});