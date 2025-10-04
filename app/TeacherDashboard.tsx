import { AntDesign, MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Print from 'expo-print';
import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useEffect, useState } from 'react';
import {
  Alert,
  Dimensions,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View
} from 'react-native';
import { AssignExerciseForm } from '../components/AssignExerciseForm';
import { AssignedExercise, useExercises } from '../hooks/useExercises';
import { onAuthChange, signOutUser } from '../lib/firebase-auth';
import { deleteData, pushData, readData, updateData, writeData } from '../lib/firebase-database';
import { uploadFile } from '../lib/firebase-storage';

const { width, height } = Dimensions.get('window');

// Stock image library data
const stockImages: Record<string, Array<{ name: string; uri: any }>> = {
  'Water Animals': [
    { name: 'Water Animal 1', uri: require('../assets/images/Water Animals/1.png') },
    { name: 'Water Animal 2', uri: require('../assets/images/Water Animals/2.png') },
    { name: 'Water Animal 4', uri: require('../assets/images/Water Animals/4.png') },
    { name: 'Water Animal 5', uri: require('../assets/images/Water Animals/5.png') },
    { name: 'Water Animal 6', uri: require('../assets/images/Water Animals/6.png') },
    { name: 'Water Animal 7', uri: require('../assets/images/Water Animals/7.png') },
    { name: 'Water Animal 8', uri: require('../assets/images/Water Animals/8.png') },
    { name: 'Water Animal 10', uri: require('../assets/images/Water Animals/10.png') },
    { name: 'Water Animal 11', uri: require('../assets/images/Water Animals/11.png') },
    { name: 'Water Animal 12', uri: require('../assets/images/Water Animals/12.png') },
    { name: 'Water Animal 13', uri: require('../assets/images/Water Animals/13.png') },
    { name: 'Water Animal 15', uri: require('../assets/images/Water Animals/15.png') },
  ],
  'Alphabet': [
    { name: 'A', uri: require('../assets/images/Alphabet/a.png') },
    { name: 'B', uri: require('../assets/images/Alphabet/b.png') },
    { name: 'C', uri: require('../assets/images/Alphabet/c.png') },
    { name: 'D', uri: require('../assets/images/Alphabet/d.png') },
    { name: 'E', uri: require('../assets/images/Alphabet/e.png') },
    { name: 'F', uri: require('../assets/images/Alphabet/f.png') },
    { name: 'G', uri: require('../assets/images/Alphabet/g.png') },
    { name: 'H', uri: require('../assets/images/Alphabet/h.png') },
    { name: 'I', uri: require('../assets/images/Alphabet/i.png') },
    { name: 'J', uri: require('../assets/images/Alphabet/j.png') },
    { name: 'K', uri: require('../assets/images/Alphabet/k.png') },
    { name: 'M', uri: require('../assets/images/Alphabet/m.png') },
    { name: 'N', uri: require('../assets/images/Alphabet/n.png') },
    { name: 'O', uri: require('../assets/images/Alphabet/o.png') },
    { name: 'P', uri: require('../assets/images/Alphabet/p.png') },
    { name: 'Q', uri: require('../assets/images/Alphabet/q.png') },
    { name: 'R', uri: require('../assets/images/Alphabet/r.png') },
    { name: 'S', uri: require('../assets/images/Alphabet/s.png') },
    { name: 'T', uri: require('../assets/images/Alphabet/t.png') },
    { name: 'U', uri: require('../assets/images/Alphabet/u.png') },
    { name: 'V', uri: require('../assets/images/Alphabet/v.png') },
    { name: 'W', uri: require('../assets/images/Alphabet/w.png') },
    { name: 'X', uri: require('../assets/images/Alphabet/x.png') },
    { name: 'Y', uri: require('../assets/images/Alphabet/y.png') },
    { name: 'Z', uri: require('../assets/images/Alphabet/z.png') },
  ],
  'Fruits': [
    { name: 'Apple', uri: require('../assets/images/Fruits/apple.png') },
    { name: 'Avocado', uri: require('../assets/images/Fruits/avocado.png') },
    { name: 'Banana', uri: require('../assets/images/Fruits/banana.png') },
    { name: 'Blueberry', uri: require('../assets/images/Fruits/blueberry.png') },
    { name: 'Coco', uri: require('../assets/images/Fruits/coco.png') },
    { name: 'Corn', uri: require('../assets/images/Fruits/corn.png') },
    { name: 'Durian', uri: require('../assets/images/Fruits/durian.png') },
    { name: 'Grapes', uri: require('../assets/images/Fruits/grapes.png') },
    { name: 'Lemon', uri: require('../assets/images/Fruits/lemon.png') },
    { name: 'Mango', uri: require('../assets/images/Fruits/mango.png') },
    { name: 'Orange', uri: require('../assets/images/Fruits/orange.png') },
    { name: 'Pineapple', uri: require('../assets/images/Fruits/pineapple.png') },
    { name: 'Rambutan', uri: require('../assets/images/Fruits/rambutan.png') },
    { name: 'Strawberry', uri: require('../assets/images/Fruits/strawberry.png') },
    { name: 'Tomato', uri: require('../assets/images/Fruits/tomato.png') },
    { name: 'Watermelon', uri: require('../assets/images/Fruits/watermelon.png') },
  ],
  'Land Animals': [
    { name: 'Bee', uri: require('../assets/images/Land Animals/bee.png') },
    { name: 'Bird', uri: require('../assets/images/Land Animals/bird.png') },
    { name: 'Black Cat', uri: require('../assets/images/Land Animals/black cat.png') },
    { name: 'Bug', uri: require('../assets/images/Land Animals/bug.png') },
    { name: 'Bunny', uri: require('../assets/images/Land Animals/bunny.png') },
    { name: 'Butterfly', uri: require('../assets/images/Land Animals/butterfly.png') },
    { name: 'Cat', uri: require('../assets/images/Land Animals/cat.png') },
    { name: 'Cheetah', uri: require('../assets/images/Land Animals/cheetah.png') },
    { name: 'Chicken', uri: require('../assets/images/Land Animals/chicken.png') },
    { name: 'Cow', uri: require('../assets/images/Land Animals/cow.png') },
    { name: 'Deer', uri: require('../assets/images/Land Animals/deer.png') },
    { name: 'Dog', uri: require('../assets/images/Land Animals/dog.png') },
    { name: 'Elephant', uri: require('../assets/images/Land Animals/elephant.png') },
    { name: 'Fox', uri: require('../assets/images/Land Animals/fox.png') },
    { name: 'Frog', uri: require('../assets/images/Land Animals/frog.png') },
    { name: 'Giraffe', uri: require('../assets/images/Land Animals/guraffe.png') },
    { name: 'Hipo', uri: require('../assets/images/Land Animals/hipo.png') },
    { name: 'Horse', uri: require('../assets/images/Land Animals/horse.png') },
    { name: 'Koala', uri: require('../assets/images/Land Animals/koala.png') },
    { name: 'Lion', uri: require('../assets/images/Land Animals/lion.png') },
    { name: 'Monkey', uri: require('../assets/images/Land Animals/monkey.png') },
    { name: 'Owl', uri: require('../assets/images/Land Animals/owl.png') },
    { name: 'Panda', uri: require('../assets/images/Land Animals/panda.png') },
    { name: 'Penguin', uri: require('../assets/images/Land Animals/penguin.png') },
    { name: 'Pig', uri: require('../assets/images/Land Animals/pig.png') },
    { name: 'Red Panda', uri: require('../assets/images/Land Animals/red panda.png') },
    { name: 'Snail', uri: require('../assets/images/Land Animals/snail.png') },
    { name: 'Snake', uri: require('../assets/images/Land Animals/snake.png') },
    { name: 'Tiger', uri: require('../assets/images/Land Animals/tiger.png') },
    { name: 'Turkey', uri: require('../assets/images/Land Animals/turkey.png') },
    { name: 'Wolf', uri: require('../assets/images/Land Animals/wolf.png') },
    { name: 'Zebra', uri: require('../assets/images/Land Animals/zebra.png') },
  ],
  'Math Symbols': [
    { name: 'Equal', uri: require('../assets/images/Math Symbols/equal.png') },
    { name: 'Greater Than', uri: require('../assets/images/Math Symbols/greater than.png') },
    { name: 'Less Than', uri: require('../assets/images/Math Symbols/less than.png') },
    { name: 'Minus', uri: require('../assets/images/Math Symbols/minus.png') },
    { name: 'Not Equal To', uri: require('../assets/images/Math Symbols/not equal to.png') },
    { name: 'Plus', uri: require('../assets/images/Math Symbols/plus.png') },
  ],
  'Numbers': [
    { name: '1', uri: require('../assets/images/Numbers/1.png') },
    { name: '2', uri: require('../assets/images/Numbers/2.png') },
    { name: '3', uri: require('../assets/images/Numbers/3.png') },
    { name: '4', uri: require('../assets/images/Numbers/4.png') },
    { name: '5', uri: require('../assets/images/Numbers/5.png') },
    { name: '6', uri: require('../assets/images/Numbers/6.png') },
    { name: '7', uri: require('../assets/images/Numbers/7.png') },
    { name: '8', uri: require('../assets/images/Numbers/8.png') },
    { name: '9', uri: require('../assets/images/Numbers/9.png') },
  ],
  'School Supplies': [
    { name: 'Abacus', uri: require('../assets/images/School Supplies/abacus.png') },
    { name: 'Bag', uri: require('../assets/images/School Supplies/bag.png') },
    { name: 'Blue Scissors', uri: require('../assets/images/School Supplies/blue scissors.png') },
    { name: 'Board', uri: require('../assets/images/School Supplies/board.png') },
    { name: 'Brushes', uri: require('../assets/images/School Supplies/brushes.png') },
    { name: 'Clip', uri: require('../assets/images/School Supplies/clip.png') },
    { name: 'Crayon', uri: require('../assets/images/School Supplies/crayon.png') },
    { name: 'Crayons', uri: require('../assets/images/School Supplies/crayons.png') },
    { name: 'Eraser', uri: require('../assets/images/School Supplies/eraser.png') },
    { name: 'Globe', uri: require('../assets/images/School Supplies/globe.png') },
    { name: 'Glue', uri: require('../assets/images/School Supplies/glue.png') },
    { name: 'Mid Thick Book', uri: require('../assets/images/School Supplies/mid thick book.png') },
    { name: 'Notebook 1', uri: require('../assets/images/School Supplies/notebook 1.png') },
    { name: 'Notebook 2', uri: require('../assets/images/School Supplies/notebook 2.png') },
    { name: 'Paint Brush', uri: require('../assets/images/School Supplies/paint brush.png') },
    { name: 'Paper', uri: require('../assets/images/School Supplies/paper.png') },
    { name: 'Pencil Case', uri: require('../assets/images/School Supplies/pencil case.png') },
    { name: 'Pencil', uri: require('../assets/images/School Supplies/pencil.png') },
    { name: 'Red Scissors', uri: require('../assets/images/School Supplies/red scissors.png') },
    { name: 'Ruler 1', uri: require('../assets/images/School Supplies/ruler 1.png') },
    { name: 'Ruler 2', uri: require('../assets/images/School Supplies/ruler 2.png') },
    { name: 'Sharpener', uri: require('../assets/images/School Supplies/sharpener.png') },
    { name: 'Stack Books', uri: require('../assets/images/School Supplies/stack books.png') },
    { name: 'Stapler', uri: require('../assets/images/School Supplies/stapler.png') },
    { name: 'Thickest Book', uri: require('../assets/images/School Supplies/thickest book.png') },
    { name: 'Thin Book', uri: require('../assets/images/School Supplies/thin book.png') },
  ],
  'Shapes': [
    { name: 'Circle', uri: require('../assets/images/Shapes/circle.png') },
    { name: 'Decagon', uri: require('../assets/images/Shapes/decagon.png') },
    { name: 'Heptagon', uri: require('../assets/images/Shapes/heptagon.png') },
    { name: 'Hexagon', uri: require('../assets/images/Shapes/hexagon.png') },
    { name: 'Nonagon', uri: require('../assets/images/Shapes/nonagon.png') },
    { name: 'Octagon', uri: require('../assets/images/Shapes/octagon.png') },
    { name: 'Oval', uri: require('../assets/images/Shapes/oval.png') },
    { name: 'Pentagon', uri: require('../assets/images/Shapes/pentagon.png') },
    { name: 'Rectangle', uri: require('../assets/images/Shapes/rectangle.png') },
    { name: 'Square', uri: require('../assets/images/Shapes/square.png') },
    { name: 'Triangle', uri: require('../assets/images/Shapes/triangle.png') },
  ],
  'Toys': [
    { name: 'Airplane', uri: require('../assets/images/Toys/airplane.png') },
    { name: 'Ball', uri: require('../assets/images/Toys/ball.png') },
    { name: 'Beach Ball', uri: require('../assets/images/Toys/beach ball.png') },
    { name: 'Bear', uri: require('../assets/images/Toys/bear.png') },
    { name: 'Bike', uri: require('../assets/images/Toys/bike.png') },
    { name: 'Boat', uri: require('../assets/images/Toys/boat.png') },
    { name: 'Car', uri: require('../assets/images/Toys/car.png') },
    { name: 'Dice', uri: require('../assets/images/Toys/dice.png') },
    { name: 'Dino', uri: require('../assets/images/Toys/dino.png') },
    { name: 'Drums', uri: require('../assets/images/Toys/drums.png') },
    { name: 'Excavator', uri: require('../assets/images/Toys/excavator.png') },
    { name: 'House', uri: require('../assets/images/Toys/house.png') },
    { name: 'Joystick', uri: require('../assets/images/Toys/joystick.png') },
    { name: 'Kite', uri: require('../assets/images/Toys/kite.png') },
    { name: 'Lego', uri: require('../assets/images/Toys/lego.png') },
    { name: 'Magnet', uri: require('../assets/images/Toys/magnet.png') },
    { name: 'Paper Boat', uri: require('../assets/images/Toys/paper boat.png') },
    { name: 'Puzzle', uri: require('../assets/images/Toys/puzzle.png') },
    { name: 'Racket', uri: require('../assets/images/Toys/racket.png') },
    { name: 'Robot', uri: require('../assets/images/Toys/robot.png') },
    { name: 'Rubik', uri: require('../assets/images/Toys/rubik.png') },
    { name: 'Stack Ring', uri: require('../assets/images/Toys/stack ring.png') },
    { name: 'Train', uri: require('../assets/images/Toys/train.png') },
    { name: 'Xylophone', uri: require('../assets/images/Toys/xylophone.png') },
    { name: 'Yoyo', uri: require('../assets/images/Toys/yoyo.png') },
  ],
};

interface TeacherData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  school: string;
  profilePictureUrl: string;
  uid: string;
  createdAt: string;
}

// Generate two-digit school year options like 22-23, returning { label, value }
// value will be stored as 2223 in the database
function generateYearOptions() {
  const now = new Date();
  const currentFull = now.getFullYear();
  const items: { label: string; value: string }[] = [];
  for (let offset = -5; offset <= 5; offset++) {
    const startFull = currentFull + offset;
    const endFull = startFull + 1;
    const start = ((startFull % 100) + 100) % 100;
    const end = ((endFull % 100) + 100) % 100;
    const s = String(start).padStart(2, '0');
    const e = String(end).padStart(2, '0');
    items.push({ label: `${s}-${e}`, value: `${s}${e}` });
  }
  return items;
}

export default function TeacherDashboard() {
  const router = useRouter();
  const [teacherData, setTeacherData] = useState<TeacherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState<TeacherData | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showAddClassModal, setShowAddClassModal] = useState(false);
  const [className, setClassName] = useState('');
  const [schoolOption, setSchoolOption] = useState<'profile' | 'other'>('profile');
  const [schoolOther, setSchoolOther] = useState('');
  const [schoolYear, setSchoolYear] = useState(''); // stores label like "22-23"
  const [showYearPicker, setShowYearPicker] = useState(false);
  const [savingClass, setSavingClass] = useState(false);

  // Announcement state
  const [showAnnModal, setShowAnnModal] = useState(false);
  const [annTitle, setAnnTitle] = useState('');
  const [annMessage, setAnnMessage] = useState('');
  const [annAllClasses, setAnnAllClasses] = useState(true);
  const [annSelectedClassIds, setAnnSelectedClassIds] = useState<string[]>([]);
  const [teacherClasses, setTeacherClasses] = useState<{
    id: string;
    name: string;
    schoolYear?: string;
    schoolName?: string;
    status?: string;
  }[]>([]);
  const [activeClasses, setActiveClasses] = useState<
    { id: string; name: string; schoolYear?: string; schoolName?: string; status?: string }[]
  >([]);
  const [sendingAnn, setSendingAnn] = useState(false);
  const [closingClassId, setClosingClassId] = useState<string | null>(null);
  // Add Student state
  const [showAddStudentModal, setShowAddStudentModal] = useState(false);
  const [selectedClassForStudent, setSelectedClassForStudent] = useState<{ id: string; name: string } | null>(null);
  const [studentNickname, setStudentNickname] = useState('');
  const [studentGender, setStudentGender] = useState<'male' | 'female'>('male');
  const [savingStudent, setSavingStudent] = useState(false);
  
  // Student menu and parent info state
  const [studentMenuVisible, setStudentMenuVisible] = useState<string | null>(null);
  const [showParentInfoModal, setShowParentInfoModal] = useState(false);
  const [selectedParentInfo, setSelectedParentInfo] = useState<any>(null);
  
  // Results sorting state
  const [resultsSortBy, setResultsSortBy] = useState<'attempts' | 'time'>('attempts');
  const [resultsSortOrder, setResultsSortOrder] = useState<'asc' | 'desc'>('asc');
  // List modal state
  const [showListModal, setShowListModal] = useState(false);
  const [studentsByClass, setStudentsByClass] = useState<Record<string, any[]>>({});
  const [parentsById, setParentsById] = useState<Record<string, any>>({});
  const [assignmentsByClass, setAssignmentsByClass] = useState<Record<string, { total: number; completed: number; pending: number }>>({});
  const [classAnalytics, setClassAnalytics] = useState<Record<string, { performance?: number; change?: number }>>({});
  const [exerciseResults, setExerciseResults] = useState<Record<string, any[]>>({});

  // Auth state
  const [currentUserId, setCurrentUserId] = useState<string | undefined>(undefined);
  // Overflow menu state per-class (three dots)
  const [openMenuClassId, setOpenMenuClassId] = useState<string | null>(null);
  // Local navigation state to keep bottom nav persistent
  const [activeTab, setActiveTab] = useState<'home' | 'list' | 'class' | 'exercises' | 'results'>('home');
  
  // Exercises Library state
  const [exercisesTab, setExercisesTab] = useState<'my' | 'public' | 'assigned'>('my');
  const [showAssignForm, setShowAssignForm] = useState(false);
  const [selectedExerciseForAssign, setSelectedExerciseForAssign] = useState<any>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Assignment edit/delete modals
  const [showEditAssignmentModal, setShowEditAssignmentModal] = useState(false);
  const [showDeleteAssignmentModal, setShowDeleteAssignmentModal] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<AssignedExercise | null>(null);
  const [deletingAssignment, setDeletingAssignment] = useState<AssignedExercise | null>(null);
  const [editAssignmentLoading, setEditAssignmentLoading] = useState(false);
  const [editAcceptLateSubmissions, setEditAcceptLateSubmissions] = useState(true);
  const [deleteAssignmentLoading, setDeleteAssignmentLoading] = useState(false);

  // Student completion status modal
  const [showStudentStatusModal, setShowStudentStatusModal] = useState(false);
  const [selectedAssignmentForStatus, setSelectedAssignmentForStatus] = useState<AssignedExercise | null>(null);
  const [completedStudents, setCompletedStudents] = useState<Record<string, string[]>>({}); // assignmentId -> studentIds[]

  // Student performance modal
  const [showStudentPerformanceModal, setShowStudentPerformanceModal] = useState(false);
  const [selectedStudentPerformance, setSelectedStudentPerformance] = useState<any>(null);
  const [selectedExerciseForPerformance, setSelectedExerciseForPerformance] = useState<any>(null);
  const [studentPerformanceData, setStudentPerformanceData] = useState<any>(null);
  const [loadingStudentPerformance, setLoadingStudentPerformance] = useState(false);
  const [geminiAnalysis, setGeminiAnalysis] = useState<any>(null);
  const [classAverages, setClassAverages] = useState<any>(null);

  // Date/Time picker state
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedTime, setSelectedTime] = useState(new Date());
  const [newDeadline, setNewDeadline] = useState<string>('');
  
  // Category options
  const categoryOptions = [
    'All',
    'Addition',
    'Subtraction', 
    'Multiplication',
    'Division',
    'Word Problems',
    'Geometry',
    'Fractions',
    'Measurement',
    'Time & Money'
  ];

  // Helper function to calculate time remaining until deadline
  const getTimeRemaining = (deadline: string) => {
    const now = new Date();
    const dueDate = new Date(deadline);
    const diffMs = dueDate.getTime() - now.getTime();
    
    if (diffMs <= 0) {
      return { text: 'Overdue', color: '#ef4444', urgent: true };
    }
    
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const diffWeeks = Math.floor(diffDays / 7);
    
    if (diffWeeks > 0) {
      return { 
        text: `${diffWeeks} week${diffWeeks > 1 ? 's' : ''} left`, 
        color: diffWeeks <= 1 ? '#f59e0b' : '#10b981',
        urgent: diffWeeks <= 1
      };
    } else if (diffDays > 0) {
      return { 
        text: `${diffDays} day${diffDays > 1 ? 's' : ''} left`, 
        color: diffDays <= 1 ? '#ef4444' : diffDays <= 3 ? '#f59e0b' : '#10b981',
        urgent: diffDays <= 1
      };
    } else {
      return { 
        text: `${diffHours} hour${diffHours > 1 ? 's' : ''} left`, 
        color: '#ef4444',
        urgent: true
      };
    }
  };

  // Helper function to get student completion stats
  const getStudentCompletionStats = (assignment: AssignedExercise) => {
    const classStudents = studentsByClass[assignment.classId] || [];
    const totalStudents = classStudents.length;
    
    // Get exercise results for this assignment's exercise
    const classResults = exerciseResults[assignment.classId] || [];
    const assignmentResults = classResults.filter((result: any) => 
      result.exerciseId === assignment.exerciseId
    );
    
    
    // Count students who have completed this exercise using flexible matching
    const completedStudentIds = new Set<string>();
    
    assignmentResults.forEach((result: any) => {
      // Try to find which student this result belongs to
      const matchingStudent = classStudents.find((student: any) => {
        // Try Firebase parent ID match (new format)
        if (result.parentId === student.parentId) return true;
        
        // Try studentId match (if available in result)
        if (result.studentId === student.studentId) return true;
        
        // Try login code match (old format - backward compatibility)
        const parentData = parentsById[student.parentId];
        if (parentData && parentData.loginCode && result.parentId === parentData.loginCode) {
          return true;
        }
        
        return false;
      });
      
      if (matchingStudent) {
        completedStudentIds.add(matchingStudent.studentId);
      }
    });
    
    const completedCount = completedStudentIds.size;
    
    
    return {
      completed: completedCount,
      total: totalStudents,
      percentage: totalStudents > 0 ? Math.round((completedCount / totalStudents) * 100) : 0
    };
  };

  // Helper function to get individual student status
  const getStudentStatus = (studentId: string, assignment: AssignedExercise) => {
    // Check if student has completed the assignment by looking at ExerciseResults
    const classResults = exerciseResults[assignment.classId] || [];
    
    // Find the student to get their parentId
    const student = studentsByClass[assignment.classId]?.find((s: any) => s.studentId === studentId);
    if (!student) return 'pending';
    
    // Check for exercise results using both Firebase parent ID and login code (for backward compatibility)
    const studentResult = classResults.find((result: any) => {
      if (result.exerciseId !== assignment.exerciseId) return false;
      
      // Try to match by Firebase parent ID (new format)
      if (result.parentId === student.parentId) return true;
      
      // Try to match by studentId directly (if available in result)
      if (result.studentId === studentId) return true;
      
      // Try to match by login code (old format - backward compatibility)
      // This requires resolving the student's parent to their login code
      const parentData = parentsById[student.parentId];
      if (parentData && parentData.loginCode && result.parentId === parentData.loginCode) {
        return true;
      }
      
      return false;
    });
    
    return studentResult ? 'completed' : 'pending';
  };

  // Function to open student status modal
  const handleShowStudentStatus = (assignment: AssignedExercise) => {
    setSelectedAssignmentForStatus(assignment);
    setShowStudentStatusModal(true);
  };

  // Function to mark a student as completed (for testing purposes)
  const markStudentCompleted = (studentId: string, assignmentId: string) => {
    setCompletedStudents(prev => ({
      ...prev,
      [assignmentId]: [...(prev[assignmentId] || []), studentId]
    }));
  };

  // Function to mark a student as pending (for testing purposes)
  const markStudentPending = (studentId: string, assignmentId: string) => {
    setCompletedStudents(prev => ({
      ...prev,
      [assignmentId]: (prev[assignmentId] || []).filter(id => id !== studentId)
    }));
  };
  
  // Filter and group exercises by category
  const getFilteredAndGroupedExercises = (exercises: any[]) => {
    let filtered = exercises;
    
    // Filter by category
    if (selectedCategory !== 'All') {
      filtered = filtered.filter(exercise => exercise.category === selectedCategory);
    }
    
    // Filter by search query
    if (searchQuery.trim()) {
      filtered = filtered.filter(exercise => 
        exercise.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        exercise.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (exercise.category && exercise.category.toLowerCase().includes(searchQuery.toLowerCase()))
      );
    }
    
    // Group by category
    const grouped = filtered.reduce((acc, exercise) => {
      const category = exercise.category || 'Uncategorized';
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push(exercise);
      return acc;
    }, {} as Record<string, any[]>);
    
    return grouped;
  };
  
  // Use the exercises hook
  const {
    myExercises,
    publicExercises,
    assignedExercises,
    loading: exercisesLoading,
    error: exercisesError,
    loadMyExercises,
    loadPublicExercises,
    loadAssignedExercises,
    copyExercise,
    deleteExercise,
    assignExercise,
    deleteAssignment,
    updateAssignmentStatus,
  } = useExercises(currentUserId || null);
  

  useEffect(() => {
    const unsubscribe = onAuthChange((user) => {
      setCurrentUserId(user?.uid);
      if (user?.uid) {
        fetchTeacherData(user.uid);
        loadTeacherClasses(user.uid);
      } else {
        router.replace('/TeacherLogin');
      }
    });
    return unsubscribe;
  }, []);

  // Load exercises when exercises tab becomes active
  useEffect(() => {
    if (activeTab === 'exercises' && currentUserId) {
      if (exercisesTab === 'my') {
        loadMyExercises();
      } else if (exercisesTab === 'public') {
        loadPublicExercises();
      } else if (exercisesTab === 'assigned') {
        loadAssignedExercises();
        // Also load assignments to get exercise results
        if (activeClasses.length > 0) {
          loadAssignments(activeClasses.map(c => c.id));
        }
      }
    }
  }, [activeTab, exercisesTab, currentUserId]);

  // Load assignments when activeClasses change to ensure exercise results are available
  useEffect(() => {
    if (activeClasses.length > 0) {
      loadAssignments(activeClasses.map(c => c.id));
    }
  }, [activeClasses]);

  // Also load assignments when the assigned exercises tab becomes active
  useEffect(() => {
    if (activeTab === 'exercises' && exercisesTab === 'assigned' && activeClasses.length > 0) {
      loadAssignments(activeClasses.map(c => c.id));
    }
  }, [activeTab, exercisesTab, activeClasses]);

  const loadTeacherClasses = async (teacherId: string) => {
    try {
      const { data } = await readData('/sections');
      const list = Object.entries(data || {})
        .map(([id, v]: any) => ({ id, ...(v || {}) }))
        .filter((s: any) => s.teacherId === teacherId)
        .map((s: any) => ({
          id: s.id,
          name: s.name ?? 'Untitled',
          schoolYear: s.schoolYear,
          schoolName: s.schoolName,
          status: s.status ?? 'active',
        }));
      setTeacherClasses(list);
      setActiveClasses(list.filter((c) => c.status !== 'inactive'));
      // After classes load, refresh related data
      await Promise.all([
        loadStudentsAndParents(list.map((c) => c.id)),
        loadAssignments(list.map((c) => c.id)),
        loadClassAnalytics(list.map((c) => c.id)),
      ]);
    } catch (e) {
      // ignore
    }
  };

  const formatSchoolYear = (value?: string) => {
    if (!value) return '—';
    const v = String(value);
    if (v.length === 4) return `${v.slice(0, 2)}-${v.slice(2)}`;
    return value;
  };

  const loadStudentsAndParents = async (classIds: string[]) => {
    try {
      const [{ data: students }, { data: parents }, { data: parentLoginCodes }] = [
        await readData('/students'),
        await readData('/parents'),
        await readData('/parentLoginCodes'),
      ];
      
      // Create a reverse lookup map from parentId to loginCode
      const parentIdToLoginCode: Record<string, string> = {};
      if (parentLoginCodes) {
        Object.entries(parentLoginCodes).forEach(([loginCode, parentId]) => {
          if (typeof parentId === 'string') {
            parentIdToLoginCode[parentId] = loginCode;
          }
        });
      }
      
      const parentsMap: Record<string, any> = Object.entries(parents || {}).reduce((acc: any, [id, v]: any) => {
        const parentData = { id, ...(v || {}) };
        // Ensure loginCode is available - try from parent data first, then from reverse lookup
        if (!parentData.loginCode && parentIdToLoginCode[id]) {
          parentData.loginCode = parentIdToLoginCode[id];
        }
        acc[id] = parentData;
        return acc;
      }, {});
      
      
      const grouped: Record<string, any[]> = {};
      Object.entries(students || {}).forEach(([id, v]: any) => {
        const s = { studentId: id, ...(v || {}) };
        if (!classIds.includes(s.classId)) return;
        if (!grouped[s.classId]) grouped[s.classId] = [];
        grouped[s.classId].push(s);
      });
      
      setParentsById(parentsMap);
      setStudentsByClass(grouped);
    } catch (error) {
      console.error('Error loading students and parents:', error);
    }
  };

  const loadAssignments = async (classIds: string[]) => {
    try {
      // Load assignments, exercise results, students data, parents data, and login codes
      const [{ data: assignmentsData }, { data: exerciseResultsData }, { data: studentsData }, { data: parentsData }, { data: loginCodesData }] = await Promise.all([
        readData('/assignedExercises'),
        readData('/ExerciseResults'),
        readData('/students'),
        readData('/parents'),
        readData('/parentLoginCodes')
      ]);
      
      const stats: Record<string, { total: number; completed: number; pending: number }> = {};
      
      
      // Process assignments
      Object.entries(assignmentsData || {}).forEach(([id, v]: any) => {
        const a = { id, ...(v || {}) };
        if (!classIds.includes(a.classId)) return;
        if (!stats[a.classId]) stats[a.classId] = { total: 0, completed: 0, pending: 0 };
        stats[a.classId].total += 1;
        if (a.status === 'completed') stats[a.classId].completed += 1;
        else stats[a.classId].pending += 1;
      });
      
      // Create a map of parentId to classId from students data
      // This map will include both Firebase parent IDs and login codes for backward compatibility
      const parentToClassMap: Record<string, string> = {};
      Object.entries(studentsData || {}).forEach(([studentId, student]: any) => {
        if (student.parentId && student.classId && classIds.includes(student.classId)) {
          // Map Firebase parent ID to class ID
          parentToClassMap[student.parentId] = student.classId;
          
          // Also map login code to class ID (for backward compatibility)
          const parentData = parentsData?.[student.parentId];
          if (parentData && parentData.loginCode) {
            parentToClassMap[parentData.loginCode] = student.classId;
          }
          
          // Also check if there's a parent record under the login code format (old data structure)
          if (parentData && parentData.parentKey) {
            parentToClassMap[parentData.parentKey] = student.classId;
          }
        }
      });
      
      // Also add reverse mappings from login codes to class IDs
      Object.entries(loginCodesData || {}).forEach(([loginCode, parentId]: any) => {
        // Find which class this parent belongs to
        const student = Object.values(studentsData || {}).find((s: any) => s.parentId === parentId);
        if (student && classIds.includes((student as any).classId)) {
          parentToClassMap[loginCode] = (student as any).classId;
        }
      });
      
      
      // Process exercise results to get more accurate completion counts
      const resultsByClass: Record<string, Set<string>> = {}; // classId -> Set of completed exerciseIds
      const resultsByClassArray: Record<string, any[]> = {}; // classId -> Array of results
      
      Object.entries(exerciseResultsData || {}).forEach(([resultId, result]: any) => {
        const r = { resultId, ...(result || {}) };
        
        // Find the classId for this result using parentId
        const classId = r.parentId ? parentToClassMap[r.parentId] : null;
        
        
        if (classId && classIds.includes(classId)) {
          if (!resultsByClass[classId]) resultsByClass[classId] = new Set();
          if (!resultsByClassArray[classId]) resultsByClassArray[classId] = [];
          resultsByClass[classId].add(r.exerciseId);
          resultsByClassArray[classId].push(r);
        }
      });
      
      // Update stats with actual completion data from ExerciseResults
      Object.entries(resultsByClass).forEach(([classId, completedExerciseIds]) => {
        if (stats[classId]) {
          stats[classId].completed = completedExerciseIds.size;
          stats[classId].pending = Math.max(0, stats[classId].total - completedExerciseIds.size);
        }
      });
      
      
      setAssignmentsByClass(stats);
      setExerciseResults(resultsByClassArray);
      
    } catch (error) {
      console.error('Error loading assignments:', error);
      setAssignmentsByClass({});
      setExerciseResults({});
    }
  };

  const loadClassAnalytics = async (classIds: string[]) => {
    try {
      const { data } = await readData('/classAnalytics');
      const map: Record<string, any> = {};
      Object.entries(data || {}).forEach(([cid, v]: any) => {
        if (classIds.includes(cid)) map[cid] = v || {};
      });
      setClassAnalytics(map);
    } catch {
      setClassAnalytics({});
    }
  };

  const handleDeleteExercise = async (exerciseId: string) => {
    Alert.alert(
      'Delete Exercise',
      'Are you sure you want to delete this exercise? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteExercise(exerciseId);
              Alert.alert('Success', 'Exercise deleted successfully');
            } catch (error) {
              Alert.alert('Error', 'Failed to delete exercise');
            }
          },
        },
      ]
    );
  };

  const handleCopyExercise = async (exercise: any) => {
    try {
      const teacherName = teacherData ? `${teacherData.firstName} ${teacherData.lastName}` : 'Unknown Teacher';
      await copyExercise(exercise, currentUserId!, teacherName);
      Alert.alert('Success', 'Exercise copied to My Exercises');
    } catch (error) {
      Alert.alert('Error', 'Failed to copy exercise');
    }
  };

  const handleAssignExercise = async (classIds: string[], deadline: string, acceptLateSubmissions: boolean) => {
    try {
      await assignExercise(
        selectedExerciseForAssign.id, 
        classIds, 
        deadline, 
        currentUserId!, 
        acceptLateSubmissions, 
        'open' // Default to open status
      );
      Alert.alert('Success', 'Exercise assigned successfully');
    } catch (error) {
      Alert.alert('Error', 'Failed to assign exercise');
    }
  };

  const handleEditAssignment = (assignment: AssignedExercise) => {
    setEditingAssignment(assignment);
    setNewDeadline(assignment.deadline || '');
    setEditAcceptLateSubmissions(assignment.acceptLateSubmissions ?? true);
    
    // Initialize date/time pickers with current deadline or current date/time
    if (assignment.deadline) {
      const deadlineDate = new Date(assignment.deadline);
      setSelectedDate(deadlineDate);
      setSelectedTime(deadlineDate);
    } else {
      const now = new Date();
      setSelectedDate(now);
      setSelectedTime(now);
    }
    
    setShowEditAssignmentModal(true);
  };

  const handleDeleteAssignment = (assignment: AssignedExercise) => {
    setDeletingAssignment(assignment);
    setShowDeleteAssignmentModal(true);
  };

  const handleToggleAcceptingStatus = async (assignment: AssignedExercise) => {
    try {
      const newStatus = assignment.acceptingStatus === 'closed' ? 'open' : 'closed';
      const statusText = newStatus === 'closed' ? 'close' : 'reopen';
      
      Alert.alert(
        `${statusText.charAt(0).toUpperCase() + statusText.slice(1)} Assignment`,
        `Are you sure you want to ${statusText} "${assignment.exercise?.title}" for ${assignment.className}?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { 
            text: statusText.charAt(0).toUpperCase() + statusText.slice(1), 
            onPress: async () => {
              await updateAssignmentStatus(assignment.id, newStatus);
              Alert.alert(
                'Success', 
                `Assignment ${newStatus === 'closed' ? 'closed' : 'reopened'} successfully`
              );
            }
          }
        ]
      );
    } catch (error) {
      Alert.alert('Error', 'Failed to update assignment status');
    }
  };

  const confirmDeleteAssignment = async () => {
    if (!deletingAssignment) return;
    
    setDeleteAssignmentLoading(true);
    try {
      await deleteAssignment(deletingAssignment.id);
      setShowDeleteAssignmentModal(false);
      setDeletingAssignment(null);
      // The useExercises hook will automatically refresh the list
    } catch (error) {
      Alert.alert('Error', 'Failed to delete assignment');
    } finally {
      setDeleteAssignmentLoading(false);
    }
  };

  const updateDeadline = (date: Date, time: Date) => {
    const combinedDateTime = new Date(date);
    combinedDateTime.setHours(time.getHours());
    combinedDateTime.setMinutes(time.getMinutes());
    setNewDeadline(combinedDateTime.toISOString());
  };

  const saveEditAssignment = async () => {
    if (!editingAssignment) return;
    
    setEditAssignmentLoading(true);
    try {
      // Get current assignment data
      const { data: currentAssignment } = await readData(`/assignedExercises/${editingAssignment.id}`);
      if (!currentAssignment) {
        throw new Error('Assignment not found');
      }

      // Update the assignment with new deadline and late submissions setting
      const updatedAssignment = {
        ...currentAssignment,
        deadline: newDeadline,
        acceptLateSubmissions: editAcceptLateSubmissions,
        updatedAt: new Date().toISOString(),
      };

      const { success, error } = await writeData(`/assignedExercises/${editingAssignment.id}`, updatedAssignment);
      
      if (success) {
        setShowEditAssignmentModal(false);
        setEditingAssignment(null);
        setNewDeadline('');
        setEditAcceptLateSubmissions(true);
        // Refresh the assigned exercises list
        await loadAssignedExercises();
        Alert.alert('Success', 'Assignment updated successfully');
      } else {
        Alert.alert('Error', error || 'Failed to update assignment');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to update assignment');
    } finally {
      setEditAssignmentLoading(false);
    }
  };

  const escapeHtml = (value: string) =>
    value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  // Helper function to calculate individual student metrics
  const calculateStudentMetrics = (resultData: any) => {
    const questionResults = resultData.questionResults || [];
    const totalQuestions = questionResults.length;
    
    if (totalQuestions === 0) {
      return {
        efficiencyScore: 0,
        consistencyScore: 0,
        masteryScore: 0,
        overallScore: 0,
        totalAttempts: 0,
        totalTime: 0,
        avgAttemptsPerQuestion: 0,
        avgTimePerQuestion: 0
      };
    }
    
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
    
    // Calculate mastery score based on actual performance (same as parent dashboard)
    const correctAnswers = questionResults.length; // All questions are correct since student completed
    const masteryScore = Math.round((correctAnswers / totalQuestions) * 100);
    
    // Improved efficiency scoring with more granular scale (same as parent dashboard)
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
    
    // Improved consistency scoring (same as parent dashboard)
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
    
    // Calculate overall score with better weighting (same as parent dashboard)
    const overallScore = Math.round(
      (efficiencyScore * 0.5) +  // Increased weight for efficiency
      (consistencyScore * 0.3) + 
      (masteryScore * 0.2)       // Reduced weight for mastery since it's often 100%
    );
    
    return {
      efficiencyScore: Math.round(efficiencyScore),
      consistencyScore: Math.round(consistencyScore),
      masteryScore: Math.round(masteryScore),
      overallScore,
      totalAttempts,
      totalTime,
      avgAttemptsPerQuestion: Math.round(avgAttemptsPerQuestion * 10) / 10,
      avgTimePerQuestion: Math.round(avgTimePerQuestion)
    };
  };

  // Function to load student performance data
  const loadStudentPerformance = async (studentId: string, exerciseId: string, classId: string) => {
    try {
      setLoadingStudentPerformance(true);
      
      // Get the student's result for this exercise
      const { data: allResults } = await readData('/ExerciseResults');
      if (!allResults) return;

      const results = Object.values(allResults) as any[];
      const studentResult = results.find((result: any) => 
        result.exerciseId === exerciseId && 
        result.classId === classId && 
        result.studentId === studentId
      );

      if (!studentResult) {
        Alert.alert('No Data', 'No performance data found for this student.');
        return;
      }

      // Get exercise data
      const { data: exerciseData } = await readData(`/exercises/${exerciseId}`);
      if (!exerciseData) {
        Alert.alert('Error', 'Exercise data not found.');
        return;
      }

      // Calculate performance metrics
      const performanceMetrics = calculateStudentMetrics(studentResult);
      
      // Get class comparison data
      const sameExerciseResults = results.filter((result: any) =>
        result.exerciseId === exerciseId &&
        result.classId === classId &&
        result.studentId !== studentId // Exclude current student's result
      );

      let classStats = null;
      if (sameExerciseResults.length > 0) {
        const classMetrics = sameExerciseResults.map((result: any) => calculateStudentMetrics(result));
        classStats = {
          averageEfficiency: classMetrics.reduce((sum, m) => sum + m.efficiencyScore, 0) / classMetrics.length,
          averageConsistency: classMetrics.reduce((sum, m) => sum + m.consistencyScore, 0) / classMetrics.length,
          averageMastery: classMetrics.reduce((sum, m) => sum + m.masteryScore, 0) / classMetrics.length,
          averageOverall: classMetrics.reduce((sum, m) => sum + m.overallScore, 0) / classMetrics.length,
        };
      }

      // Determine performance level
      let performanceLevel = 'needs_improvement';
      if (performanceMetrics.overallScore >= 85) performanceLevel = 'excellent';
      else if (performanceMetrics.overallScore >= 70) performanceLevel = 'good';
      else if (performanceMetrics.overallScore >= 50) performanceLevel = 'fair';

      // Calculate class averages for comparison
      let classAveragesData = null;
      if (sameExerciseResults.length > 0) {
        const totalClassScore = sameExerciseResults.reduce((sum: number, result: any) => sum + (result.scorePercentage || 0), 0);
        const totalClassTime = sameExerciseResults.reduce((sum: number, result: any) => sum + (result.totalTimeSpent || 0), 0);
        
        // Calculate question-level averages
        const questionAverages: any = {};
        const questionIds = new Set<string>();
        
        // Collect all question IDs from all results
        sameExerciseResults.forEach((result: any) => {
          if (result.questionResults) {
            result.questionResults.forEach((q: any) => {
              questionIds.add(q.questionId);
            });
          }
        });
        
        // Calculate averages for each question
        questionIds.forEach(questionId => {
          const questionResults = sameExerciseResults
            .map((result: any) => result.questionResults?.find((q: any) => q.questionId === questionId))
            .filter(Boolean);
          
          if (questionResults.length > 0) {
            const totalTime = questionResults.reduce((sum: number, q: any) => sum + (q.timeSpent || 0), 0);
            const totalAttempts = questionResults.reduce((sum: number, q: any) => sum + (q.attempts || 1), 0);
            
            questionAverages[questionId] = {
              averageTime: totalTime / questionResults.length,
              averageAttempts: totalAttempts / questionResults.length,
              totalStudents: questionResults.length
            };
          }
        });
        
        classAveragesData = {
          averageScore: totalClassScore / sameExerciseResults.length,
          averageTime: totalClassTime / sameExerciseResults.length,
          totalStudents: sameExerciseResults.length,
          questionAverages
        };
      }

      setClassAverages(classAveragesData);

      setStudentPerformanceData({
        studentResult,
        exerciseData,
        performanceMetrics,
        classStats,
        performanceLevel,
        totalStudents: sameExerciseResults.length + 1
      });

      // Generate Gemini analysis
      const analysis = await generateGeminiAnalysis(studentResult, classAveragesData);
      setGeminiAnalysis(analysis);

    } catch (error) {
      console.error('Error loading student performance:', error);
      Alert.alert('Error', 'Failed to load student performance data.');
    } finally {
      setLoadingStudentPerformance(false);
    }
  };

  // Function to generate Gemini analysis with retry logic
  const generateGeminiAnalysis = async (resultData: any, classAverages: any, retryCount: number = 0): Promise<any> => {
    const maxRetries = 3;
    const retryDelay = 1000 * (retryCount + 1); // Exponential backoff: 1s, 2s, 3s
    
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
- Class Average Time: ${Math.round(performanceData.classAverageTime)} seconds

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
   - Time to First Answer: ${Math.round((q.timeToFirstAnswer || 0) / 1000)}s
   ${q.attemptHistory && q.attemptHistory.length > 0 ? `
   ATTEMPT HISTORY:
   ${q.attemptHistory.map((attempt: any, attemptIdx: number) => 
     `   Attempt ${attemptIdx + 1}: "${attempt.answer || 'blank'}" (${Math.round((attempt.timeSpent || 0) / 1000)}s)`
   ).join('\n')}` : ''}
   
   ${classAvg ? `CLASS AVERAGE: ${Math.round(classAvg.averageTime / 1000)}s, ${Math.round(classAvg.averageAttempts)} attempts` : '- Performance ranking data not available'}`;
}).join('\n\n')}

IMPORTANT: Respond with ONLY valid JSON. Do not include any markdown formatting, code blocks, or additional text. Return only the JSON object.

Required JSON format:
{
  "strengths": ["strength1", "strength2", "strength3"],
  "weaknesses": ["weakness1", "weakness2", "weakness3"],
  "questionAnalysis": ["analysis1", "analysis2", "analysis3"],
  "timeAnalysis": {
    "description": "Time analysis description",
    "studentTime": ${Math.round(performanceData.timeSpent / 1000)},
    "classAverage": ${Math.round(performanceData.classAverageTime)}
  },
  "recommendations": ["recommendation1", "recommendation2", "recommendation3"],
  "encouragement": "Encouraging message for the student"
}

Focus on:
1. Mathematical concepts mastered
2. Areas needing improvement
3. Time management skills
4. Specific question performance
5. Age-appropriate recommendations
6. Positive reinforcement

Remember: Return ONLY the JSON object, no markdown, no code blocks, no additional text.`;

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: prompt
            }]
          }],
          generationConfig: {
            temperature: 0.7,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 2048,
          }
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.warn(`Gemini API error (attempt ${retryCount + 1}): ${response.status} - ${errorText}`);
        
        // Retry on certain error codes
        if ((response.status === 404 || response.status === 500 || response.status === 503) && retryCount < maxRetries) {
          console.log(`Retrying Gemini analysis in ${retryDelay}ms... (attempt ${retryCount + 1}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          return generateGeminiAnalysis(resultData, classAverages, retryCount + 1);
        }
        
        throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      const analysisText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (!analysisText) {
        if (retryCount < maxRetries) {
          console.log(`No analysis text received, retrying in ${retryDelay}ms... (attempt ${retryCount + 1}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          return generateGeminiAnalysis(resultData, classAverages, retryCount + 1);
        }
        throw new Error('No analysis generated');
      }

      // Parse the JSON response
      try {
        // Clean the response text to extract JSON
        let cleanedText = analysisText.trim();
        
        // Remove markdown code blocks if present
        if (cleanedText.startsWith('```json')) {
          cleanedText = cleanedText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
        } else if (cleanedText.startsWith('```')) {
          cleanedText = cleanedText.replace(/^```\s*/, '').replace(/\s*```$/, '');
        }
        
        // Remove any leading/trailing text that's not JSON
        const jsonStart = cleanedText.indexOf('{');
        const jsonEnd = cleanedText.lastIndexOf('}');
        
        if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
          cleanedText = cleanedText.substring(jsonStart, jsonEnd + 1);
        }
        
        console.log('Cleaned Gemini response:', cleanedText.substring(0, 200) + '...');
        
        const analysis = JSON.parse(cleanedText);
        console.log(`Gemini analysis generated successfully (attempt ${retryCount + 1})`);
        return analysis;
      } catch (parseError) {
        console.warn(`Failed to parse Gemini response (attempt ${retryCount + 1}):`, parseError);
        console.warn('Raw response:', analysisText.substring(0, 500));
        
        if (retryCount < maxRetries) {
          console.log(`Retrying due to parse error in ${retryDelay}ms... (attempt ${retryCount + 1}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          return generateGeminiAnalysis(resultData, classAverages, retryCount + 1);
        }
        
        // If all retries failed, try to extract partial data or return fallback
        console.log('All retries failed, attempting to extract partial data...');
        try {
          // Try to extract any valid JSON fragments
          const jsonMatches = analysisText.match(/\{[^}]*"strengths"[^}]*\}/g);
          if (jsonMatches && jsonMatches.length > 0) {
            const partialAnalysis = JSON.parse(jsonMatches[0]);
            console.log('Using partial analysis data');
            return partialAnalysis;
          }
        } catch (partialError) {
          console.warn('Could not extract partial data:', partialError);
        }
        
        throw new Error('Failed to parse analysis response');
      }
    } catch (error: unknown) {
      console.error(`Error generating Gemini analysis (attempt ${retryCount + 1}):`, error);
      
      // Retry on network errors or other retryable errors
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (retryCount < maxRetries && (
        errorMessage.includes('fetch') || 
        errorMessage.includes('network') || 
        errorMessage.includes('timeout') ||
        errorMessage.includes('ECONNRESET') ||
        errorMessage.includes('ENOTFOUND')
      )) {
        console.log(`Retrying due to network error in ${retryDelay}ms... (attempt ${retryCount + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        return generateGeminiAnalysis(resultData, classAverages, retryCount + 1);
      }
      
      // Return fallback analysis after all retries failed
      console.log('All retries failed, returning fallback analysis');
      return {
        strengths: ["Completed the exercise successfully", "Showed persistence in problem-solving"],
        weaknesses: ["Could improve time management", "May need more practice with certain concepts"],
        questionAnalysis: ["Overall good performance across questions"],
        timeAnalysis: {
          description: "Student completed the exercise in a reasonable time",
          studentTime: Math.round(resultData.totalTimeSpent / 1000),
          classAverage: Math.round(classAverages?.averageTime || 0)
        },
        recommendations: ["Continue practicing regularly", "Focus on areas that took longer"],
        encouragement: "Great job completing the exercise! Keep up the good work!"
      };
    }
  };

  // Function to handle student name click
  const handleStudentNameClick = async (studentId: string, exerciseId: string, classId: string, studentNickname: string) => {
    // Find the student data
    const student = Object.values(studentsByClass).flat().find((s: any) => s.studentId === studentId);
    if (!student) return;

    setSelectedStudentPerformance(student);
    setSelectedExerciseForPerformance({ exerciseId, classId, studentNickname });
    setShowStudentPerformanceModal(true);
    
    // Load performance data
    await loadStudentPerformance(studentId, exerciseId, classId);
  };

  const handleExportToExcel = async (exerciseTitle: string, results: any[], students: any[]) => {
    try {
      // Create CSV data
      const csvHeaders = ['#', 'Student', 'Attempts', 'Time (s)', 'Time (m:s)'];
      const csvRows = results.map((result: any, idx: number) => {
        const student = students.find((s: any) => s.studentId === result.studentId);
        const studentNickname = student?.nickname || 'Unknown Student';
        
        const questionResults = result.questionResults || [];
        const totalAttempts = questionResults.reduce((sum: number, q: any) => sum + (q.attempts || 1), 0);
        const avgAttempts = questionResults.length > 0 ? (totalAttempts / questionResults.length).toFixed(1) : '1.0';
        
        const totalTimeSeconds = Math.round((result.totalTimeSpent || 0) / 1000);
        const totalTimeMinutes = Math.round((result.totalTimeSpent || 0) / 60000);
        const remainingSeconds = Math.round(((result.totalTimeSpent || 0) % 60000) / 1000);
        const timeDisplay = totalTimeMinutes > 0 ? `${totalTimeMinutes}m ${remainingSeconds}s` : `${totalTimeSeconds}s`;
        
        return [
          idx + 1,
          studentNickname,
          avgAttempts,
          totalTimeSeconds,
          timeDisplay
        ];
      });
      
      // Create CSV content
      const csvContent = [csvHeaders, ...csvRows]
        .map(row => row.map(field => `"${field}"`).join(','))
        .join('\n');
      
      // Create filename
      const filename = `${exerciseTitle.replace(/[^a-zA-Z0-9]/g, '_')}_results.csv`;
      
      // Create HTML table for better mobile compatibility
      const htmlContent = `
        <html>
          <head>
            <meta charset="utf-8">
            <title>${exerciseTitle} Results</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 20px; }
              table { border-collapse: collapse; width: 100%; }
              th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
              th { background-color: #f2f2f2; font-weight: bold; }
              tr:nth-child(even) { background-color: #f9f9f9; }
            </style>
          </head>
          <body>
            <h2>${exerciseTitle} - Student Results</h2>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Student</th>
                  <th>Attempts</th>
                  <th>Time (s)</th>
                  <th>Time (m:s)</th>
                </tr>
              </thead>
              <tbody>
                ${csvRows.map(row => `
                  <tr>
                    <td>${row[0]}</td>
                    <td>${row[1]}</td>
                    <td>${row[2]}</td>
                    <td>${row[3]}</td>
                    <td>${row[4]}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
            <br>
            <p><strong>CSV Data:</strong></p>
            <pre style="background-color: #f5f5f5; padding: 10px; border-radius: 4px; overflow-x: auto;">${csvContent}</pre>
          </body>
        </html>
      `;
      
      // Save file
      const { uri } = await Print.printToFileAsync({
        html: htmlContent,
        base64: false,
      });
      
      // Share the file
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'text/html',
          dialogTitle: `Export ${exerciseTitle} Results`,
          UTI: 'public.html'
        });
      } else {
        Alert.alert('Success', `Results exported to ${filename}`);
      }
    } catch (error) {
      console.error('Export error:', error);
      Alert.alert('Error', 'Failed to export results');
    }
  };

  const exportClassListToPdf = async (cls: { id: string; name: string }) => {
    try {
      const students = [...(studentsByClass[cls.id] || [])].sort((a, b) =>
        String(a.nickname || '').localeCompare(String(b.nickname || ''))
      );
      const rows = students
        .map((s: any, idx: number) => {
          const loginCode = s.parentId ? (parentsById[s.parentId]?.loginCode || '—') : '—';
          return `<tr>
            <td style="padding:8px;border:1px solid #e5e7eb;text-align:center;">${idx + 1}</td>
            <td style="padding:8px;border:1px solid #e5e7eb;">${escapeHtml(String(s.nickname || ''))}</td>
            <td style="padding:8px;border:1px solid #e5e7eb;text-align:center;">${escapeHtml(String(loginCode))}</td>
          </tr>`;
        })
        .join('');

      const html = `<!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8" />
            <title>${escapeHtml(cls.name)} — Student List</title>
          </head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Helvetica Neue', Arial, 'Noto Sans', 'Apple Color Emoji','Segoe UI Emoji','Segoe UI Symbol','Noto Color Emoji'; color:#111827;">
            <h1 style="font-size:20px;">${escapeHtml(cls.name)} — Student List</h1>
            <p style="color:#6b7280;">Generated on ${new Date().toLocaleString()}</p>
            <table style="border-collapse:collapse;width:100%;font-size:12px;">
              <thead>
                <tr>
                  <th style="padding:8px;border:1px solid #e5e7eb;background:#f8fafc;width:60px;">#</th>
                  <th style="padding:8px;border:1px solid #e5e7eb;background:#f8fafc;text-align:left;">Student</th>
                  <th style="padding:8px;border:1px solid #e5e7eb;background:#f8fafc;width:140px;">Parent Code</th>
                </tr>
              </thead>
              <tbody>
                ${rows || `<tr><td colspan="3" style="padding:12px;text-align:center;border:1px solid #e5e7eb;">No students yet.</td></tr>`}
              </tbody>
            </table>
          </body>
        </html>`;

      const file = await Print.printToFileAsync({ html });
      const sharingAvailable = await Sharing.isAvailableAsync();
      if (sharingAvailable) {
        await Sharing.shareAsync(file.uri, { dialogTitle: `Export ${cls.name} Student List` });
      } else {
        Alert.alert('Export Complete', `PDF saved to: ${file.uri}`);
      }
    } catch (e) {
      Alert.alert('Export Failed', 'Unable to export PDF.');
    }
  };

  const parseSchoolYear = (sy?: string) => {
    const raw = String(sy || '').replace(/[^0-9]/g, '');
    const n = Number(raw);
    return Number.isFinite(n) ? n : -1; // -1 ranks last
  };

  const compareBySchoolYearDescThenName = (a: { schoolYear?: string; name: string }, b: { schoolYear?: string; name: string }) => {
    const ay = parseSchoolYear(a.schoolYear);
    const by = parseSchoolYear(b.schoolYear);
    if (ay !== by) return by - ay; // desc by year
    return String(a.name || '').localeCompare(String(b.name || ''));
  };

  const handleCloseClass = (cls: { id: string; name: string }) => {
    Alert.alert(
      'Close Class',
      `Are you sure you want to close "${cls.name}"? This will mark the class as inactive and lock all class files from being edited. You can still view it from the Class panel.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Close Class',
          style: 'destructive',
          onPress: async () => {
            try {
              setClosingClassId(cls.id);
              const { error } = await updateData(`/sections/${cls.id}`, {
                status: 'inactive',
                closedAt: new Date().toISOString(),
              });
              if (error) {
                Alert.alert('Error', error || 'Failed to close class.');
                return;
              }
              Alert.alert('Class Closed', 'The class has been marked as inactive.');
              if (currentUserId) {
                await loadTeacherClasses(currentUserId);
              }
            } catch (e) {
              Alert.alert('Error', 'Failed to close class.');
            } finally {
              setClosingClassId(null);
            }
          },
        },
      ]
    );
  };

  const generateLoginCode = () => String(Math.floor(Math.random() * 1000000)).padStart(6, '0');

  const generateUniqueLoginCode = async (): Promise<string> => {
    for (let i = 0; i < 10; i++) {
      const code = generateLoginCode();
      const { data } = await readData(`/parentLoginCodes/${code}`);
      if (!data) return code;
    }
    // Fallback if collisions keep happening
    return `${Date.now()}`.slice(-6);
  };

  const handleOpenAddStudent = (cls: { id: string; name: string }) => {
    setSelectedClassForStudent(cls);
    setStudentNickname('');
    setStudentGender('male');
    setShowAddStudentModal(true);
  };

  const handleCreateStudent = async () => {
    if (!selectedClassForStudent) return;
    if (!studentNickname.trim()) { Alert.alert('Error', 'Please enter a student nickname.'); return; }
    try {
      setSavingStudent(true);
      const loginCode = await generateUniqueLoginCode();
      // Create parent placeholder (details will be collected on first login)
      const parentPayload = {
        loginCode,
        infoStatus: 'pending',
        createdAt: new Date().toISOString(),
      };
      const { key: parentId, error: parentErr } = await pushData('/parents', parentPayload);
      if (parentErr || !parentId) { Alert.alert('Error', parentErr || 'Failed to create parent.'); return; }
      await writeData(`/parentLoginCodes/${loginCode}`, parentId);
      // Create student
      const studentPayload = {
        classId: selectedClassForStudent.id,
        parentId,
        nickname: studentNickname.trim(),
        gender: studentGender,
        createdAt: new Date().toISOString(),
      };
      const { key: studentId, error: studentErr } = await pushData('/students', studentPayload);
      if (studentErr || !studentId) { Alert.alert('Error', studentErr || 'Failed to create student.'); return; }
      await updateData(`/students/${studentId}`, { studentId });
      await updateData(`/parents/${parentId}`, { parentId });
      // Refresh lists
      await loadStudentsAndParents(activeClasses.map((c) => c.id));
      Alert.alert(
        'Student Created',
        `Share this Parent Login Code with the guardian: ${loginCode}`,
        [
          {
            text: 'Create Another',
            onPress: () => {
              setStudentNickname('');
            },
          },
          {
            text: 'Done',
            style: 'default',
            onPress: () => setShowAddStudentModal(false),
          },
        ]
      );
    } catch (e) {
      Alert.alert('Error', 'Failed to create student.');
    } finally {
      setSavingStudent(false);
    }
  };

  // Student menu handlers
  const handleEditStudent = (student: any, classInfo: { id: string; name: string }) => {
    setSelectedClassForStudent(classInfo);
    setStudentNickname(String(student.nickname || ''));
    setStudentGender(String(student.gender || 'male') === 'female' ? 'female' : 'male');
    setShowAddStudentModal(true);
    setStudentMenuVisible(null);
  };

  const handleDeleteStudent = (student: any, classId: string) => {
    Alert.alert(
      'Delete Student',
      `Remove "${student.nickname}" from this class? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteData(`/students/${student.studentId}`);
              await loadStudentsAndParents([classId]);
              Alert.alert('Removed', 'Student deleted.');
            } catch (e) {
              Alert.alert('Error', 'Failed to delete student.');
            }
          },
        },
      ]
    );
    setStudentMenuVisible(null);
  };

  const handleViewParentInfo = (student: any) => {
    const parentData = student.parentId ? parentsById[student.parentId] : null;
    if (parentData) {
      setSelectedParentInfo({
        ...parentData,
        student: student,
        loginCode: parentData.loginCode || 'N/A'
      });
      setShowParentInfoModal(true);
    } else {
      Alert.alert('Info', 'Parent information not available.');
    }
    setStudentMenuVisible(null);
  };

  const fetchTeacherData = async (userId: string) => {
    try {
      setLoading(true);
      const { data, error } = await readData(`/teachers/${userId}`);
      
      if (error) {
        console.error('Error fetching teacher data:', error);
        // Use mock data for testing
        setTeacherData({
          firstName: 'John',
          lastName: 'Doe',
          email: 'john.doe@example.com',
          phone: '+1234567890',
          school: 'Camohaguin Elementary School',
          profilePictureUrl: '',
          uid: userId,
          createdAt: new Date().toISOString(),
        });
      } else if (data) {
        setTeacherData(data);
        setEditData(data);
      }
    } catch (error) {
      console.error('Error fetching teacher data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleProfilePress = () => {
    setShowProfileModal(true);
    setEditData(teacherData);
  };

  const handleEdit = () => {
    setEditing(true);
  };

  const handleSave = async () => {
    if (!editData) return;

    try {
      setUploading(true);
      
      let profilePictureUrl = editData.profilePictureUrl;
      
      // If profile picture was changed, upload new one
      if (editData.profilePictureUrl !== teacherData?.profilePictureUrl) {
        // This would be implemented when user selects new photo
        // For now, keep existing URL
      }

      const updatedData = {
        ...editData,
        profilePictureUrl,
      };

      const { success, error } = await updateData(`/teachers/${currentUserId}`, updatedData);
      
      if (success) {
        setTeacherData(updatedData);
        setEditing(false);
        Alert.alert('Success', 'Profile updated successfully!');
      } else {
        Alert.alert('Error', `Failed to update profile: ${error}`);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to update profile');
    } finally {
      setUploading(false);
    }
  };

  const handleCancel = () => {
    setEditing(false);
    setEditData(teacherData);
  };

  const handleLogout = async () => {
    try {
      await signOutUser();
    } catch (e) {
      // ignore
    } finally {
      setShowProfileModal(false);
      router.replace('/RoleSelection');
    }
  };

  const handleInputChange = (field: keyof TeacherData, value: string) => {
    if (editData) {
      setEditData({ ...editData, [field]: value });
    }
  };

  const handleChangePhoto = async () => {
    try {
      // Request media library permissions
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

      if (!result.canceled && result.assets[0] && editData) {
        // Upload new photo to Firebase Storage
        const response = await fetch(result.assets[0].uri);
        const blob = await response.blob();
        const timestamp = Date.now();
        const filename = `teachers/profiles/${currentUserId}_${timestamp}.jpg`;
        
        const { downloadURL, error: uploadError } = await uploadFile(filename, blob, {
          contentType: 'image/jpeg',
        });
        
        if (uploadError) {
          Alert.alert('Error', 'Failed to upload photo');
          return;
        }
        
        // Update editData with new photo URL
        setEditData({ ...editData, profilePictureUrl: downloadURL || '' });
        Alert.alert('Success', 'Photo updated successfully!');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to change photo');
      console.error('Photo change error:', error);
    }
  };


  // Don't render until auth state resolves
  if (currentUserId === undefined) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Background Pattern */}
      <View style={styles.backgroundPattern} />
      
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
         {/* Header Section */}
         <View style={styles.header}>
           <TouchableOpacity style={styles.avatarContainer} onPress={handleProfilePress}>
             {teacherData?.profilePictureUrl ? (
               <Image 
                 source={{ uri: teacherData.profilePictureUrl }} 
                 style={styles.avatarImage}
               />
             ) : (
               <View style={styles.avatar}>
                 <MaterialIcons name="person" size={40} color="#4a5568" />
               </View>
             )}
           </TouchableOpacity>
           <View style={styles.welcomeText}>
             <Text style={styles.welcomeLabel}>Welcome,</Text>
             <Text style={styles.welcomeTitle}>
               {teacherData ? `${teacherData.firstName} ${teacherData.lastName}` : 'Teacher'}
             </Text>
           </View>
         </View>

         {activeTab === 'home' && (
           <>
             {/* Make Announcement Card */}
             <View style={styles.announcementCard}>
               <View style={styles.announcementGradient}>
                 <View style={styles.announcementHeader}>
                   <View style={styles.megaphoneIcon}>
                     <MaterialCommunityIcons name="bullhorn" size={32} color="#e53e3e" />
                   </View>
                   <Text style={styles.announcementTitle}>Make Announcement</Text>
                 </View>
                 <Text style={styles.announcementText}>
                   Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nam fermentum vestibulum lectus, eget eleifend...
                 </Text>
                 <TouchableOpacity
                   style={styles.editButton}
                   onPress={async () => {
                     setShowAnnModal(true);
                     if (currentUserId) {
                       await loadTeacherClasses(currentUserId);
                       setAnnSelectedClassIds(teacherClasses.map((c) => c.id));
                       setAnnAllClasses(true);
                     }
                   }}
                 >
                   <AntDesign name="edit" size={20} color="#ffffff" />
                 </TouchableOpacity>
               </View>
             </View>

             {/* Action Buttons */}
             <View style={styles.actionButtons}>
               <TouchableOpacity style={styles.actionCard} onPress={() => setShowAddClassModal(true)}>
                <View style={styles.actionGradient1}>
                  <View style={styles.actionIcon}>
                    <MaterialCommunityIcons name="google-classroom" size={28} color="#3182ce" />
                  </View>
                  <Text style={styles.actionText}>Add Class</Text>
                 </View>
               </TouchableOpacity>
               
              <TouchableOpacity style={styles.actionCard} onPress={() => setActiveTab('exercises')}>
                <View style={styles.actionGradient2}>
                  <View style={styles.actionIcon}>
                    <MaterialCommunityIcons name="abacus" size={28} color="#38a169" />
                  </View>
                  <Text style={styles.actionText}>Exercises</Text>
                </View>
              </TouchableOpacity>
             </View>


             {/* Classrooms Section */}
             <View style={styles.classroomsSection}>
               <Text style={styles.sectionTitle}>Classrooms</Text>
               {activeClasses.length === 0 ? (
                 <Text style={styles.classroomSubtitle}>No active classes yet.</Text>
               ) : (
                activeClasses.map((cls) => (
                  <View key={cls.id} style={styles.classroomCard}>
                   <View style={styles.classroomHeader}>
                      <Text style={styles.classroomTitle}>{cls.name}</Text>
                      <Text style={styles.classroomSubtitle}>{cls.schoolName || '—'}</Text>
                      <Text style={styles.classroomYear}>SY: {formatSchoolYear(cls.schoolYear)}</Text>
                      <TouchableOpacity
                        accessibilityLabel="More actions"
                        onPress={() => setOpenMenuClassId(openMenuClassId === cls.id ? null : cls.id)}
                        style={styles.moreButton}
                      >
                        <MaterialIcons name="more-vert" size={22} color="#64748b" />
                      </TouchableOpacity>
                      {openMenuClassId === cls.id && (
                        <View style={styles.moreMenu}>
                          <TouchableOpacity
                            style={styles.moreMenuItem}
                            onPress={() => {
                              setOpenMenuClassId(null);
                              handleOpenAddStudent({ id: cls.id, name: cls.name });
                            }}
                          >
                            <AntDesign name="plus" size={16} color="#1e293b" />
                            <Text style={styles.moreMenuText}>Add Student</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.moreMenuItem}
                            onPress={() => {
                              setOpenMenuClassId(null);
                              handleCloseClass(cls);
                            }}
                            disabled={closingClassId === cls.id}
                          >
                            <MaterialCommunityIcons name="lock" size={16} color="#ef4444" />
                            <Text style={[styles.moreMenuText, { color: '#ef4444' }]}>{closingClassId === cls.id ? 'Closing…' : 'Close Class'}</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                    {/* Analytics Section (placeholder/demo) */}
                    <View style={styles.analyticsContainer}>
                       <View style={styles.analyticsHeader}>
                         <Text style={styles.analyticsTitle}>Performance Analytics</Text>
                         <TouchableOpacity style={styles.viewAllButton}>
                           <Text style={styles.viewAllText}>View All</Text>
                           <AntDesign name="arrow-right" size={14} color="#3b82f6" />
                         </TouchableOpacity>
                       </View>
                       <View style={styles.analyticsCards}>
                         <View style={styles.analyticsCard}>
                           <View style={styles.analyticsIcon}>
                             <MaterialCommunityIcons name="chart-line" size={24} color="#10b981" />
                           </View>
                           <View style={styles.analyticsContent}>
                             <Text style={styles.analyticsLabel}>Overall Performance</Text>
                             <Text style={styles.analyticsValue}>{
                               classAnalytics[cls.id]?.performance != null ? `${classAnalytics[cls.id].performance}%` : '—'
                             }</Text>
                             <Text style={styles.analyticsChange}>{
                               (() => {
                                 const ca = classAnalytics[cls.id];
                                 if (!ca || ca.change == null) return '—';
                                 return `${ca.change > 0 ? '+' : ''}${ca.change}% from last week`;
                               })()
                             }</Text>
                           </View>
                         </View>
                         <View style={styles.analyticsCard}>
                           <View style={styles.analyticsIcon}>
                             <MaterialCommunityIcons name="account-group" size={24} color="#3b82f6" />
                           </View>
                           <View style={styles.analyticsContent}>
                             <Text style={styles.analyticsLabel}>Active Students</Text>
                             <Text style={styles.analyticsValue}>{studentsByClass[cls.id]?.length ?? 0}</Text>
                             <Text style={styles.analyticsChange}>All students listed</Text>
                           </View>
                         </View>
                       </View>
                       <View style={styles.quickStats}>
                         <View style={styles.statItem}>
                           <Text style={styles.statValue}>{assignmentsByClass[cls.id]?.total ?? 0}</Text>
                           <Text style={styles.statLabel}>Exercises</Text>
                         </View>
                         <View style={styles.statDivider} />
                         <View style={styles.statItem}>
                           <Text style={styles.statValue}>{assignmentsByClass[cls.id]?.completed ?? 0}</Text>
                           <Text style={styles.statLabel}>Completed</Text>
                         </View>
                         <View style={styles.statDivider} />
                         <View style={styles.statItem}>
                           <Text style={styles.statValue}>{assignmentsByClass[cls.id]?.pending ?? 0}</Text>
                           <Text style={styles.statLabel}>Pending</Text>
                         </View>
                       </View>
                     </View>
                   </View>
                 ))
               )}
             </View>
           </>
         )}

         {activeTab === 'exercises' && (
           <View style={styles.exercisesSection}>
             {/* Exercises Library Header */}
             <View style={styles.exercisesHeader}>
               <Text style={styles.exercisesTitle}>Exercises Library</Text>
               <View style={styles.exercisesActions}>
                 <TouchableOpacity 
                   style={styles.refreshButton}
                   onPress={() => {
                     if (exercisesTab === 'my') {
                       loadMyExercises();
                     } else {
                       loadPublicExercises();
                     }
                   }}
                 >
                   <MaterialCommunityIcons name="refresh" size={20} color="#64748b" />
                 </TouchableOpacity>
                 <TouchableOpacity style={styles.searchButton}>
                   <AntDesign name="search" size={20} color="#64748b" />
                 </TouchableOpacity>
                 <TouchableOpacity style={styles.moreOptionsButton}>
                   <MaterialIcons name="more-vert" size={20} color="#64748b" />
                 </TouchableOpacity>
               </View>
             </View>

             {/* Exercises Tabs */}
             <View style={styles.exercisesTabs}>
               <TouchableOpacity 
                 style={[styles.exercisesTab, exercisesTab === 'my' && styles.exercisesTabActive]}
                 onPress={() => {
                   setExercisesTab('my');
                   loadMyExercises();
                 }}
               >
                 <Text style={[styles.exercisesTabText, exercisesTab === 'my' && styles.exercisesTabTextActive]}>My Exercises</Text>
               </TouchableOpacity>
               <TouchableOpacity 
                 style={[styles.exercisesTab, exercisesTab === 'public' && styles.exercisesTabActive]}
                 onPress={() => {
                   setExercisesTab('public');
                   loadPublicExercises();
                 }}
               >
                 <Text style={[styles.exercisesTabText, exercisesTab === 'public' && styles.exercisesTabTextActive]}>Public</Text>
               </TouchableOpacity>
               <TouchableOpacity 
                 style={[styles.exercisesTab, exercisesTab === 'assigned' && styles.exercisesTabActive]}
                 onPress={() => {
                   setExercisesTab('assigned');
                   loadAssignedExercises();
                  // Also load assignments to get exercise results
                  if (activeClasses.length > 0) {
                    loadAssignments(activeClasses.map(c => c.id));
                  }
                 }}
               >
                 <Text style={[styles.exercisesTabText, exercisesTab === 'assigned' && styles.exercisesTabTextActive]}>Assigned</Text>
               </TouchableOpacity>
             </View>

             {/* Exercise Cards */}
             <View style={styles.exerciseCardsContainer}>
               {exercisesTab === 'my' ? (
                 <>
                   {exercisesLoading ? (
                     <View style={styles.loadingContainer}>
                       <Text style={styles.loadingText}>Loading your exercises...</Text>
                     </View>
                   ) : myExercises.length === 0 ? (
                     <View style={styles.emptyState}>
                       <MaterialCommunityIcons name="book-open-variant" size={48} color="#9ca3af" />
                       <Text style={styles.emptyStateText}>No exercises created yet</Text>
                       <Text style={styles.emptyStateSubtext}>Create your first exercise to get started</Text>
                     </View>
                   ) : (
                     myExercises.map((exercise) => (
                       <View key={exercise.id} style={styles.exerciseCard}>
                         {exercise.category && (
                           <View style={styles.categoryBadgeTopRight}>
                             <Text style={styles.categoryBadgeText}>{exercise.category}</Text>
                           </View>
                         )}
                         <View style={styles.exerciseContent}>
                           <Text style={styles.exerciseTitle}>{exercise.title || 'Untitled Exercise'}</Text>
                           <Text 
                             style={styles.exerciseDescription}
                             numberOfLines={3}
                             ellipsizeMode="tail"
                           >
                             {exercise.description || 'No description available'}
                           </Text>
                           <View style={styles.exerciseStats}>
                             <Text style={styles.exerciseStat}>{exercise.questionCount || 0} Questions</Text>
                             <Text style={styles.exerciseStatSeparator}>•</Text>
                             <Text style={styles.exerciseStat}>{exercise.timesUsed || 0} uses</Text>
                           </View>
                           <View style={styles.exerciseMeta}>
                             <Text style={styles.exerciseCreator}>
                               {exercise.isPublic ? 'Public' : 'Private'}
                             </Text>
                             <Text style={styles.exerciseDate}>
                               {exercise.createdAt ? new Date(exercise.createdAt).toLocaleDateString() : 'Unknown date'}
                             </Text>
                           </View>
                         </View>
                         <View style={styles.exerciseActions}>
                           <TouchableOpacity 
                             style={styles.exerciseOptions}
                             onPress={() => {
                               Alert.alert(
                                 'Exercise Options',
                                 'What would you like to do with this exercise?',
                                 [
                                 { text: 'Edit', onPress: () => router.push(`/CreateExercise?edit=${exercise.id}`) },
                                 { text: 'Delete', style: 'destructive', onPress: () => handleDeleteExercise(exercise.id) },
                                   { text: 'Cancel', style: 'cancel' }
                                 ]
                               );
                             }}
                           >
                             <MaterialIcons name="more-vert" size={20} color="#64748b" />
                           </TouchableOpacity>
                         </View>
                         <View style={styles.exerciseBottomActions}>
                           <TouchableOpacity 
                             style={styles.assignButtonBottom}
                             onPress={() => {
                               setSelectedExerciseForAssign(exercise);
                               setShowAssignForm(true);
                             }}
                           >
                             <MaterialCommunityIcons name="send" size={16} color="#ffffff" />
                             <Text style={styles.assignButtonText}>Assign</Text>
                           </TouchableOpacity>
                         </View>
                       </View>
                     ))
                   )}
                 </>
               ) : exercisesTab === 'public' ? (
                 <>
                   {/* Search and Filter Bar */}
                   <View style={styles.filterContainer}>
                     <View style={styles.searchContainer}>
                       <MaterialCommunityIcons name="magnify" size={20} color="#64748b" />
                       <TextInput
                         style={styles.searchInput}
                         placeholder="Search exercises..."
                         placeholderTextColor="#64748b"
                         value={searchQuery}
                         onChangeText={setSearchQuery}
                       />
                     </View>
                     <View style={styles.categoryFilterContainer}>
                       <ScrollView 
                         horizontal 
                         showsHorizontalScrollIndicator={false}
                         contentContainerStyle={styles.categoryScrollContent}
                         style={styles.categoryScrollView}
                         bounces={false}
                         decelerationRate="fast"
                         scrollEventThrottle={16}
                       >
                         {categoryOptions.map((category) => (
                           <TouchableOpacity
                             key={category}
                             style={[
                               styles.categoryFilterButton,
                               selectedCategory === category && styles.categoryFilterButtonActive
                             ]}
                             onPress={() => setSelectedCategory(category)}
                           >
                             <Text style={[
                               styles.categoryFilterText,
                               selectedCategory === category && styles.categoryFilterTextActive
                             ]}>
                               {category}
                             </Text>
                           </TouchableOpacity>
                         ))}
                       </ScrollView>
                     </View>
                   </View>

                   {exercisesLoading ? (
                     <View style={styles.loadingContainer}>
                       <Text style={styles.loadingText}>Loading public exercises...</Text>
                     </View>
                   ) : (() => {
                     const groupedExercises = getFilteredAndGroupedExercises(publicExercises);
                     const categories = Object.keys(groupedExercises).sort();
                     
                     if (categories.length === 0) {
                       return (
                         <View style={styles.emptyState}>
                           <MaterialCommunityIcons name="book-open-variant" size={48} color="#9ca3af" />
                           <Text style={styles.emptyStateText}>No exercises found</Text>
                           <Text style={styles.emptyStateSubtext}>
                             {searchQuery || selectedCategory !== 'All' 
                               ? 'Try adjusting your search or filter criteria'
                               : 'Check back later for new exercises shared by other teachers'
                             }
                           </Text>
                         </View>
                       );
                     }
                     
                     return categories.map((category) => (
                       <View key={category} style={styles.categorySection}>
                         <Text style={styles.categoryHeader}>{category}</Text>
                         {groupedExercises[category].map((exercise: any) => (
                           <View key={exercise.id} style={styles.exerciseCard}>
                             {exercise.category && (
                               <View style={styles.categoryBadgeTopRight}>
                                 <Text style={styles.categoryBadgeText}>{exercise.category}</Text>
                               </View>
                             )}
                             <View style={styles.exerciseIcon}>
                               <View style={styles.exerciseIconBackground}>
                                 <MaterialCommunityIcons name="book-open-variant" size={24} color="#8b5cf6" />
                               </View>
                             </View>
                             <View style={styles.exerciseContent}>
                               <Text style={styles.exerciseTitle}>{exercise.title || 'Untitled Exercise'}</Text>
                               <Text 
                                 style={styles.exerciseDescription}
                                 numberOfLines={3}
                                 ellipsizeMode="tail"
                               >
                                 {exercise.description || 'No description available'}
                               </Text>
                               <View style={styles.exerciseStats}>
                                 <Text style={styles.exerciseStat}>{exercise.questionCount || 0} Questions</Text>
                                 <Text style={styles.exerciseStatSeparator}>•</Text>
                                 <Text style={styles.exerciseStat}>{exercise.timesUsed || 0} uses</Text>
                               </View>
                               <View style={styles.exerciseMeta}>
                                 <Text style={styles.exerciseCreator}>By {exercise.teacherName || 'Unknown Teacher'}</Text>
                                 <Text style={styles.exerciseDate}>
                                   {exercise.createdAt ? new Date(exercise.createdAt).toLocaleDateString() : 'Unknown date'}
                                 </Text>
                               </View>
                             </View>
                             <TouchableOpacity 
                               style={styles.exerciseOptions}
                               onPress={() => {
                                 Alert.alert(
                                   'Exercise Options',
                                   'What would you like to do with this exercise?',
                                   [
                                     { text: 'Make a Copy', onPress: () => handleCopyExercise(exercise) },
                                     { text: 'Cancel', style: 'cancel' }
                                   ]
                                 );
                               }}
                             >
                               <MaterialIcons name="more-vert" size={20} color="#64748b" />
                             </TouchableOpacity>
                           </View>
                         ))}
                       </View>
                     ));
                   })()}
                 </>
               ) : (
                 // Assigned Exercises Tab
                 <>
                   {exercisesLoading ? (
                     <View style={styles.loadingContainer}>
                       <Text style={styles.loadingText}>Loading assigned exercises...</Text>
                     </View>
                   ) : assignedExercises.length === 0 ? (
                     <View style={styles.emptyState}>
                       <MaterialCommunityIcons name="clipboard-text" size={48} color="#9ca3af" />
                       <Text style={styles.emptyStateText}>No exercises assigned yet</Text>
                       <Text style={styles.emptyStateSubtext}>Assign exercises to your classes to see them here</Text>
                     </View>
                   ) : (
                     assignedExercises.map((assignment) => {
                       const timeRemaining = getTimeRemaining(assignment.deadline);
                       const completionStats = getStudentCompletionStats(assignment);
                       
                       return (
                         <View key={assignment.id} style={styles.assignmentCard}>
                           <View style={styles.assignmentHeader}>
                             <View style={styles.assignmentInfo}>
                               <Text style={styles.assignmentTitle}>
                                 {assignment.exercise?.title || 'Unknown Exercise'}
                               </Text>
                               <Text style={styles.assignmentClass}>
                                 {assignment.className || 'Unknown Class'}
                               </Text>
                             </View>
                             <View style={styles.assignmentOptions}>
                               {/* Status Toggle */}
                               <TouchableOpacity 
                                 style={[
                                   styles.statusToggleButton,
                                   assignment.acceptingStatus === 'closed' && styles.statusToggleButtonClosed
                                 ]}
                                 onPress={() => handleToggleAcceptingStatus(assignment)}
                               >
                                 <MaterialCommunityIcons 
                                   name={assignment.acceptingStatus === 'closed' ? 'lock' : 'lock-open'} 
                                   size={16} 
                                   color={assignment.acceptingStatus === 'closed' ? '#ef4444' : '#10b981'} 
                                 />
                                 <Text style={[
                                   styles.statusToggleText,
                                   assignment.acceptingStatus === 'closed' && styles.statusToggleTextClosed
                                 ]}>
                                   {assignment.acceptingStatus === 'closed' ? 'Closed' : 'Open'}
                                 </Text>
                               </TouchableOpacity>
                               
                               <TouchableOpacity 
                                 style={styles.assignmentActionButton}
                                 onPress={() => handleEditAssignment(assignment)}
                               >
                                 <MaterialIcons name="edit" size={20} color="#3b82f6" />
                               </TouchableOpacity>
                               <TouchableOpacity 
                                 style={styles.assignmentActionButton}
                                 onPress={() => handleDeleteAssignment(assignment)}
                               >
                                 <MaterialIcons name="delete" size={20} color="#ef4444" />
                               </TouchableOpacity>
                             </View>
                           </View>
                           
                           {/* Student Completion Stats */}
                           <View style={styles.assignmentStats}>
                             <TouchableOpacity 
                               style={styles.completionStats}
                               onPress={() => handleShowStudentStatus(assignment)}
                               activeOpacity={0.7}
                             >
                               <View style={styles.completionIcon}>
                                 <MaterialCommunityIcons name="account-group" size={16} color="#3b82f6" />
                               </View>
                               <Text style={styles.completionText}>
                                 {completionStats.completed}/{completionStats.total} students completed
                               </Text>
                               <View style={[styles.completionBadge, { 
                                 backgroundColor: completionStats.percentage === 100 ? '#10b981' : 
                                                completionStats.percentage >= 50 ? '#f59e0b' : '#ef4444'
                               }]}>
                                 <Text style={styles.completionPercentage}>{completionStats.percentage}%</Text>
                               </View>
                               <MaterialCommunityIcons name="chevron-right" size={16} color="#64748b" />
                             </TouchableOpacity>
                             
                             {/* Progress Bar */}
                             <View style={styles.progressBarContainer}>
                               <View style={styles.progressBar}>
                                 <View 
                                   style={[
                                     styles.progressBarFill, 
                                     { 
                                       width: `${completionStats.percentage}%`,
                                       backgroundColor: completionStats.percentage === 100 ? '#10b981' : 
                                                      completionStats.percentage >= 50 ? '#f59e0b' : '#ef4444'
                                     }
                                   ]} 
                                 />
                               </View>
                             </View>
                           </View>
                           
                           <View style={styles.assignmentDetails}>
                             <View style={styles.assignmentDetail}>
                               <MaterialCommunityIcons name="calendar-clock" size={16} color="#64748b" />
                               <Text style={styles.assignmentDetailText}>
                                 Due: {new Date(assignment.deadline).toLocaleDateString()}
                               </Text>
                             </View>
                             <View style={[styles.assignmentDetail, styles.timeRemainingDetail]}>
                               <MaterialCommunityIcons 
                                 name={timeRemaining.urgent ? "clock-alert" : "clock"} 
                                 size={16} 
                                 color={timeRemaining.color} 
                               />
                               <Text style={[styles.assignmentDetailText, { color: timeRemaining.color }]}>
                                 {timeRemaining.text}
                               </Text>
                             </View>
                           </View>
                         </View>
                       );
                     })
                   )}
                 </>
               )}
             </View>

             {/* Add Exercise Button */}
             <TouchableOpacity style={styles.addExerciseButton} onPress={() => router.push('../CreateExercise')}>
               <View style={styles.addExerciseIcon}>
                 <AntDesign name="plus" size={20} color="#ffffff" />
               </View>
               <Text style={styles.addExerciseText}>Add Exercise</Text>
             </TouchableOpacity>
           </View>
         )}

         {activeTab === 'list' && (
           <View style={{ paddingBottom: 100 }}>
             <Text style={styles.sectionTitle}>Student Lists</Text>
             {activeClasses.map((cls) => (
               <View key={cls.id} style={styles.classroomCard}>
                 <View style={styles.classroomHeader}>
                   <Text style={styles.classroomTitle}>{cls.name}</Text>
                   <Text style={styles.classroomSubtitle}>{cls.schoolName || '—'}</Text>
                   <Text style={styles.classroomYear}>SY: {formatSchoolYear(cls.schoolYear)}</Text>
                 </View>
                <View style={styles.classHeader}>
                  <Text style={{ color: '#64748b', flex: 1 }}>Total Students: {studentsByClass[cls.id]?.length ?? 0}</Text>
                  <View style={styles.headerActions}>
                     <TouchableOpacity style={[styles.addStudentBtn, { backgroundColor: '#3b82f6' }]} onPress={() => handleOpenAddStudent({ id: cls.id, name: cls.name })}>
                       <AntDesign name="plus" size={16} color="#ffffff" />
                       <Text style={[styles.addStudentBtnText, { marginLeft: 6 }]}>Add Student</Text>
                     </TouchableOpacity>
                     <TouchableOpacity style={styles.exportBtn} onPress={() => exportClassListToPdf(cls)}>
                       <MaterialCommunityIcons name="file-pdf-box" size={18} color="#ffffff" />
                       <Text style={styles.exportBtnText}>Export PDF</Text>
                     </TouchableOpacity>
                   </View>
                 </View>
                 {(studentsByClass[cls.id] || []).length === 0 ? (
                   <Text style={{ color: '#64748b' }}>No students yet.</Text>
                ) : (
                  <TouchableWithoutFeedback onPress={() => setStudentMenuVisible(null)}>
                    <View>
                      <View style={styles.studentHeaderRow}>
                        <Text style={[styles.studentIndex, { width: 28 }]}>#</Text>
                        <Text style={[styles.studentName, { fontWeight: '700', color: '#374151' }]}>Student Name</Text>
                        <Text style={[styles.studentCode, { color: '#374151' }]}>Parent Access Code</Text>
                      </View>
                      {(studentsByClass[cls.id] || []).map((s: any, idx: number) => {
                      const p = s.parentId ? parentsById[s.parentId] : undefined;
                      const loginCode = p?.loginCode || 'N/A';
                      return (
                        <View key={s.studentId} style={styles.studentRow}>
                          <Text style={styles.studentIndex}>{idx + 1}.</Text>
                          <Text style={styles.studentName}>{s.nickname}</Text>
                          <Text style={styles.studentCode}>{loginCode}</Text>
                          <View style={styles.studentActionsWrap}>
                            <TouchableOpacity
                              accessibilityLabel="Student options"
                              onPress={() => setStudentMenuVisible(studentMenuVisible === s.studentId ? null : s.studentId)}
                              style={styles.iconBtn}
                            >
                              <MaterialIcons name="more-vert" size={20} color="#64748b" />
                            </TouchableOpacity>
                            {studentMenuVisible === s.studentId && (
                              <View style={styles.studentMenuDropdown}>
                                <TouchableOpacity
                                  style={styles.studentMenuItem}
                                  onPress={() => handleEditStudent(s, { id: cls.id, name: cls.name })}
                                >
                                  <MaterialIcons name="edit" size={16} color="#64748b" />
                                  <Text style={styles.studentMenuText}>Edit Student</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                  style={styles.studentMenuItem}
                                  onPress={() => handleViewParentInfo(s)}
                                >
                                  <MaterialIcons name="person" size={16} color="#3b82f6" />
                                  <Text style={styles.studentMenuText}>View Parent Info</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                  style={[styles.studentMenuItem, styles.studentMenuItemDanger]}
                                  onPress={() => handleDeleteStudent(s, cls.id)}
                                >
                                  <MaterialIcons name="delete" size={16} color="#ef4444" />
                                  <Text style={[styles.studentMenuText, styles.studentMenuTextDanger]}>Delete Student</Text>
                                </TouchableOpacity>
                              </View>
                            )}
                          </View>
                        </View>
                      );
                    })}
                    </View>
                  </TouchableWithoutFeedback>
                )}
               </View>
             ))}
           </View>
         )}

         {activeTab === 'results' && (
           <View style={{ paddingBottom: 100 }}>
             <Text style={styles.sectionTitle}>Exercise Results & Analytics</Text>

             {/* Class-wise Results */}
             {activeClasses.map((cls) => {
               const classResults = exerciseResults[cls.id] || [];
               const classStudents = studentsByClass[cls.id] || [];
               
               // Calculate class statistics
               const totalSubmissions = classResults.length;
               const uniqueStudents = new Set(classResults.map((r: any) => r.studentId)).size;
               const averageScore = totalSubmissions > 0 ? 
                 classResults.reduce((sum: number, result: any) => sum + (result.scorePercentage || 0), 0) / totalSubmissions : 0;
               
               // Note: Class-level metrics removed - now calculated per exercise
               
               return (
                 <View key={cls.id} style={styles.classroomCard}>
                   <View style={styles.classroomHeader}>
                     <Text style={styles.classroomTitle}>{cls.name}</Text>
                     <Text style={styles.classroomSubtitle}>{cls.schoolName || '—'}</Text>
                     <Text style={styles.classroomYear}>SY: {formatSchoolYear(cls.schoolYear)}</Text>
                   </View>
                  

                   {classResults.length === 0 ? (
                     <View style={styles.emptyResultsCard}>
                       <MaterialCommunityIcons name="chart-line" size={48} color="#cbd5e1" />
                       <Text style={styles.emptyResultsText}>No completed exercises yet</Text>
                       <Text style={styles.emptyResultsSubtext}>
                         Results will appear here when students complete assignments
                       </Text>
                     </View>
                   ) : (
                     <View style={styles.resultsList}>
                       {(() => {
                         // Sort results by score percentage (descending) and calculate ranks
                         const sortedResults = [...classResults].sort((a: any, b: any) => 
                           (b.scorePercentage || 0) - (a.scorePercentage || 0)
                         );
                         
                         // Calculate ranks (handling ties properly)
                         const rankedResults = sortedResults.map((result: any, idx: number) => {
                           let rank = idx + 1;
                           
                           // Handle ties - if previous result has same score, use same rank
                           if (idx > 0 && sortedResults[idx - 1].scorePercentage === result.scorePercentage) {
                             // Find the first result with this score to get its rank
                             for (let i = idx - 1; i >= 0; i--) {
                               if (sortedResults[i].scorePercentage === result.scorePercentage) {
                                 rank = i + 1;
                               } else {
                                 break;
                               }
                             }
                           }
                           
                           return { ...result, rank };
                         });
                         
                         // Group results by exercise for better organization
                         const resultsByExercise = rankedResults.reduce((acc: any, result: any) => {
                           const exerciseTitle = result.exerciseTitle || 'Unknown Exercise';
                           if (!acc[exerciseTitle]) {
                             acc[exerciseTitle] = [];
                           }
                           acc[exerciseTitle].push(result);
                           return acc;
                         }, {});

                         // Handle sorting function
                         const handleSort = (newSortBy: 'attempts' | 'time') => {
                           if (resultsSortBy === newSortBy) {
                             setResultsSortOrder(resultsSortOrder === 'asc' ? 'desc' : 'asc');
                           } else {
                             setResultsSortBy(newSortBy);
                             setResultsSortOrder('asc');
                           }
                         };

                         return Object.entries(resultsByExercise).map(([exerciseTitle, exerciseResults]: [string, any]) => {
                           // Find the assignment for this exercise to get status
                           const exerciseAssignment = assignedExercises.find((assignment: any) => 
                             assignment.exerciseId === exerciseResults[0]?.exerciseId && 
                             assignment.classId === cls.id
                           );
                           
                           // Determine if exercise is still accepting results
                           const isAcceptingResults = exerciseAssignment ? 
                             exerciseAssignment.acceptingStatus === 'open' && 
                             (new Date() <= new Date(exerciseAssignment.deadline) || exerciseAssignment.acceptLateSubmissions) : 
                             false;
                           
                           // Sort the exercise results based on current sort settings
                           const sortedResults = [...exerciseResults].sort((a: any, b: any) => {
                             const aQuestionResults = a.questionResults || [];
                             const bQuestionResults = b.questionResults || [];
                             
                             let aValue, bValue;
                             
                             if (resultsSortBy === 'attempts') {
                               const aTotalAttempts = aQuestionResults.reduce((sum: number, q: any) => sum + (q.attempts || 1), 0);
                               const bTotalAttempts = bQuestionResults.reduce((sum: number, q: any) => sum + (q.attempts || 1), 0);
                               aValue = aQuestionResults.length > 0 ? aTotalAttempts / aQuestionResults.length : 1;
                               bValue = bQuestionResults.length > 0 ? bTotalAttempts / bQuestionResults.length : 1;
                             } else {
                               aValue = a.totalTimeSpent || 0;
                               bValue = b.totalTimeSpent || 0;
                             }
                             
                             return resultsSortOrder === 'asc' ? aValue - bValue : bValue - aValue;
                           });

                           // Calculate exercise-specific metrics
                           const exerciseTotalTime = exerciseResults.reduce((sum: number, result: any) => sum + (result.totalTimeSpent || 0), 0);
                           const exerciseAverageTime = exerciseResults.length > 0 ? exerciseTotalTime / exerciseResults.length : 0;
                           
                           const exerciseAverageAttempts = exerciseResults.length > 0 ? 
                             exerciseResults.reduce((sum: number, result: any) => {
                               const questionResults = result.questionResults || [];
                               const totalAttempts = questionResults.reduce((qSum: number, q: any) => qSum + (q.attempts || 1), 0);
                               return sum + (questionResults.length > 0 ? totalAttempts / questionResults.length : 1);
                             }, 0) / exerciseResults.length : 0;
                           
                           const exerciseCompletionRate = classStudents.length > 0 ? 
                             (exerciseResults.length / classStudents.length) * 100 : 0;

                           return (
                             <View key={exerciseTitle} style={styles.exerciseResultsSection}>
                               {/* Exercise Header with Status */}
                               <View style={styles.exerciseHeader}>
                                 <View style={styles.exerciseTitleRow}>
                                   <MaterialCommunityIcons name="book-open-variant" size={20} color="#3b82f6" />
                                   <Text style={styles.exerciseTitle}>{exerciseTitle}</Text>
                                   <View style={[
                                     styles.exerciseStatusBadge,
                                     { backgroundColor: isAcceptingResults ? '#10b981' : '#ef4444' }
                                   ]}>
                                     <MaterialCommunityIcons 
                                       name={isAcceptingResults ? "check-circle" : "close-circle"} 
                                       size={12} 
                                       color="#ffffff" 
                                     />
                                     <Text style={styles.exerciseStatusText}>
                                       {isAcceptingResults ? 'Open' : 'Closed'}
                                     </Text>
                                   </View>
                                 </View>
                                 
                                 {/* Performance Summary Card */}
                                 <View style={styles.performanceSummaryCard}>
                                   <Text style={styles.performanceSummaryTitle}>Summary of Class Average</Text>
                                   <View style={styles.performanceMetricsGrid}>
                                     <View style={styles.performanceMetric}>
                                       <View style={styles.metricIconContainer}>
                                         <MaterialCommunityIcons name="clock-outline" size={14} color="#3b82f6" />
                                       </View>
                                       <View style={styles.metricContent}>
                                         <Text style={styles.metricLabel}>Average Time</Text>
                                         <Text style={styles.metricValue}>
                                           {exerciseAverageTime > 0 ? 
                                             (() => {
                                               const totalMinutes = Math.floor(exerciseAverageTime / 60000);
                                               const remainingSeconds = Math.floor((exerciseAverageTime % 60000) / 1000);
                                               return totalMinutes > 0 ? `${totalMinutes}m ${remainingSeconds}s` : `${remainingSeconds}s`;
                                             })() : 
                                             '—'
                                           }
                                         </Text>
                                       </View>
                                     </View>
                                     
                                     <View style={styles.performanceMetric}>
                                       <View style={styles.metricIconContainer}>
                                         <MaterialCommunityIcons name="repeat" size={14} color="#10b981" />
                                       </View>
                                       <View style={styles.metricContent}>
                                         <Text style={styles.metricLabel}>Average Attempts</Text>
                                         <Text style={styles.metricValue}>
                                           {exerciseAverageAttempts > 0 ? exerciseAverageAttempts.toFixed(1) : '—'}
                                         </Text>
                                       </View>
                                     </View>
                                     
                                     <View style={styles.performanceMetric}>
                                       <View style={styles.metricIconContainer}>
                                         <MaterialCommunityIcons name="account-group" size={14} color="#f59e0b" />
                                       </View>
                                       <View style={styles.metricContent}>
                                         <Text style={styles.metricLabel}>Completion</Text>
                                         <Text style={styles.metricValue}>
                                           {Math.round(exerciseCompletionRate)}% ({exerciseResults.length}/{classStudents.length})
                                         </Text>
                                       </View>
                                     </View>
                                   </View>
                                 </View>
                               </View>
                               
                               {/* Student Results Table */}
                               <View style={styles.studentResultsContainer}>
                                 <View style={styles.studentResultsHeader}>
                                   <Text style={styles.studentResultsTitle}>Student Results</Text>
                                   <TouchableOpacity 
                                     style={styles.exportButton}
                                     onPress={() => handleExportToExcel(exerciseTitle, sortedResults, classStudents)}
                                   >
                                     <MaterialCommunityIcons name="file-excel" size={14} color="#ffffff" />
                                     <Text style={styles.exportButtonText}>Export Excel</Text>
                                   </TouchableOpacity>
                                 </View>
                                 
                                 <ScrollView 
                                   horizontal={width < 400}
                                   showsHorizontalScrollIndicator={width < 400}
                                   style={styles.tableScrollContainer}
                                 >
                                   <View style={styles.tableContainer}>
                                     {/* Table Header */}
                                     <View style={styles.resultsTableHeader}>
                                       <Text style={[styles.tableHeaderText, { width: 50 }]}>#</Text>
                                       <Text style={[styles.tableHeaderText, { flex: 2 }]}>Student</Text>
                                       <TouchableOpacity 
                                         style={styles.sortableHeaderCell}
                                         onPress={() => handleSort('attempts')}
                                       >
                                         <Text style={[styles.tableHeaderText, { flex: 1.5 }, resultsSortBy === 'attempts' && styles.activeSort]}>
                                           Attempts
                                         </Text>
                                         {resultsSortBy === 'attempts' && (
                                           <MaterialIcons 
                                             name={resultsSortOrder === 'asc' ? 'keyboard-arrow-up' : 'keyboard-arrow-down'} 
                                             size={16} 
                                             color="#3b82f6" 
                                           />
                                         )}
                                       </TouchableOpacity>
                                       <TouchableOpacity 
                                         style={styles.sortableHeaderCell}
                                         onPress={() => handleSort('time')}
                                       >
                                         <Text style={[styles.tableHeaderText, { flex: 1.5 }, resultsSortBy === 'time' && styles.activeSort]}>
                                           Time
                                         </Text>
                                         {resultsSortBy === 'time' && (
                                           <MaterialIcons 
                                             name={resultsSortOrder === 'asc' ? 'keyboard-arrow-up' : 'keyboard-arrow-down'} 
                                             size={16} 
                                             color="#3b82f6" 
                                           />
                                         )}
                                       </TouchableOpacity>
                                     </View>
                                   
                                     {/* Table Rows */}
                                     {sortedResults.map((result: any, idx: number) => {
                                       // Find student by studentId from the result (proper database lookup)
                                       const student = Object.values(studentsByClass).flat().find((s: any) => s.studentId === result.studentId);
                                       const studentNickname = student?.nickname || 'Unknown Student';
                                       
                                       // Calculate average attempts and total time
                                       const questionResults = result.questionResults || [];
                                       const totalAttempts = questionResults.reduce((sum: number, q: any) => sum + (q.attempts || 1), 0);
                                       const avgAttempts = questionResults.length > 0 ? (totalAttempts / questionResults.length).toFixed(1) : '1.0';
                                       const totalTimeMinutes = Math.round((result.totalTimeSpent || 0) / 60000);
                                       const totalTimeSeconds = Math.round(((result.totalTimeSpent || 0) % 60000) / 1000);
                                       const timeDisplay = totalTimeMinutes > 0 ? `${totalTimeMinutes}m ${totalTimeSeconds}s` : `${Math.round((result.totalTimeSpent || 0) / 1000)}s`;
                                       
                                       return (
                                         <View key={result.resultId || idx} style={styles.resultsTableRow}>
                                           <Text style={[styles.tableRowText, { width: 50 }]}>{idx + 1}</Text>
                                           <TouchableOpacity 
                                             style={{ flex: 2 }}
                                             onPress={() => handleStudentNameClick(result.studentId, result.exerciseId, result.classId, studentNickname)}
                                           >
                                             <Text style={[styles.tableRowText, styles.studentNameCell, { flex: 2, color: '#3b82f6' }]}>{studentNickname}</Text>
                                           </TouchableOpacity>
                                           <Text style={[styles.tableRowText, { flex: 1.5 }]}>{avgAttempts}</Text>
                                           <Text style={[styles.tableRowText, { flex: 1.5 }]}>{timeDisplay}</Text>
                                         </View>
                                       );
                                     })}
                                   </View>
                                 </ScrollView>
                               </View>
                             </View>
                           );
                         });
                       })()}
                     </View>
                   )}
                 </View>
               );
             })}
           </View>
         )}

        {activeTab === 'class' && (
          <View style={{ paddingBottom: 100 }}>
            <Text style={styles.sectionTitle}>Classroom</Text>
            {teacherClasses.length === 0 ? (
              <Text style={styles.classroomSubtitle}>No classes yet.</Text>
            ) : (
              <>
                {activeClasses.length > 0 && (
                  <>
                    <Text style={[styles.classroomSubtitle, { marginBottom: 8 }]}>Active</Text>
                    {[...activeClasses].sort(compareBySchoolYearDescThenName).map((cls) => (
                      <View key={cls.id} style={[styles.classroomCard, { marginBottom: 12 }]}>
                        <View style={styles.classroomHeader}>
                          <Text style={styles.classroomTitle}>{cls.name}</Text>
                          <Text style={styles.classroomSubtitle}>{cls.schoolName || '—'}</Text>
                          <Text style={styles.classroomYear}>SY: {formatSchoolYear(cls.schoolYear)}</Text>
                        </View>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                          <View style={styles.statusPillActive}>
                            <Text style={styles.statusText}>Active</Text>
                          </View>
                          <Text style={{ color: '#64748b' }}>Students: {studentsByClass[cls.id]?.length ?? 0}</Text>
                        </View>
                        <View style={styles.quickStats}>
                          <View style={styles.statItem}>
                            <Text style={styles.statValue}>{assignmentsByClass[cls.id]?.total ?? 0}</Text>
                            <Text style={styles.statLabel}>Exercises</Text>
                          </View>
                          <View style={styles.statDivider} />
                          <View style={styles.statItem}>
                            <Text style={styles.statValue}>{assignmentsByClass[cls.id]?.completed ?? 0}</Text>
                            <Text style={styles.statLabel}>Completed</Text>
                          </View>
                          <View style={styles.statDivider} />
                          <View style={styles.statItem}>
                            <Text style={styles.statValue}>{assignmentsByClass[cls.id]?.pending ?? 0}</Text>
                            <Text style={styles.statLabel}>Pending</Text>
                          </View>
                        </View>
                      </View>
                    ))}
                  </>
                )}
                {teacherClasses.filter((c) => c.status === 'inactive').length > 0 && (
                  <>
                    <Text style={[styles.classroomSubtitle, { marginVertical: 8 }]}>Inactive</Text>
                    {teacherClasses
                      .filter((c) => c.status === 'inactive')
                      .sort(compareBySchoolYearDescThenName)
                      .map((cls) => (
                      <View key={cls.id} style={[styles.classroomCard, { marginBottom: 12 }]}>
                        <View style={styles.classroomHeader}>
                          <Text style={styles.classroomTitle}>{cls.name}</Text>
                          <Text style={styles.classroomSubtitle}>{cls.schoolName || '—'}</Text>
                          <Text style={styles.classroomYear}>SY: {formatSchoolYear(cls.schoolYear)}</Text>
                        </View>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                          <View style={styles.statusPillInactive}>
                            <Text style={styles.statusText}>Inactive</Text>
                          </View>
                          <Text style={{ color: '#64748b' }}>Students: {studentsByClass[cls.id]?.length ?? 0}</Text>
                        </View>
                      </View>
                    ))}
                  </>
                )}
              </>
            )}
          </View>
        )}
      </ScrollView>

      {/* Bottom Navigation */}
      <View style={styles.bottomNav}>
        <TouchableOpacity style={[styles.navItem, activeTab === 'home' && styles.activeNavItem]} onPress={() => setActiveTab('home')}>
          <AntDesign name="home" size={24} color={activeTab === 'home' ? '#000000' : '#9ca3af'} />
          <Text style={[styles.navText, activeTab === 'home' && styles.activeNavText]}>Home</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={[styles.navItem, activeTab === 'list' && styles.activeNavItem]} onPress={() => setActiveTab('list')}>
          <MaterialIcons name="list" size={24} color={activeTab === 'list' ? '#000000' : '#9ca3af'} />
          <Text style={[styles.navText, activeTab === 'list' && styles.activeNavText]}>List</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={[styles.navItem, activeTab === 'class' && styles.activeNavItem]} onPress={() => setActiveTab('class')}>
          <MaterialCommunityIcons name="account-group" size={24} color={activeTab === 'class' ? '#000000' : '#9ca3af'} />
          <Text style={[styles.navText, activeTab === 'class' && styles.activeNavText]}>Class</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={[styles.navItem, activeTab === 'results' && styles.activeNavItem]} onPress={() => setActiveTab('results')}>
          <MaterialIcons name="assessment" size={24} color={activeTab === 'results' ? '#000000' : '#9ca3af'} />
          <Text style={[styles.navText, activeTab === 'results' && styles.activeNavText]}>Results</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={[styles.navItem, activeTab === 'exercises' && styles.activeNavItem]} onPress={() => setActiveTab('exercises')}>
          <MaterialCommunityIcons name="abacus" size={24} color={activeTab === 'exercises' ? '#000000' : '#9ca3af'} />
          <Text style={[styles.navText, activeTab === 'exercises' && styles.activeNavText]}>Exercises</Text>
        </TouchableOpacity>
      </View>

      {/* Profile Modal */}
      <Modal visible={showProfileModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.profileModal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Teacher Profile</Text>
              <TouchableOpacity 
                onPress={() => setShowProfileModal(false)}
                style={styles.closeButton}
              >
                <AntDesign name="close" size={24} color="#1e293b" />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.profileContent}>
              {/* Profile Picture Section */}
              <View style={styles.profilePictureSection}>
                {editData?.profilePictureUrl ? (
                  <Image 
                    source={{ uri: editData.profilePictureUrl }} 
                    style={styles.profilePicture}
                  />
                ) : (
                  <View style={styles.profilePicturePlaceholder}>
                    <MaterialIcons name="person" size={60} color="#4a5568" />
                  </View>
                )}
                {editing && (
                  <TouchableOpacity style={styles.changePhotoButton} onPress={handleChangePhoto}>
                    <AntDesign name="camera" size={16} color="#fff" />
                    <Text style={styles.changePhotoText}>Change Photo</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Teacher Information */}
              <View style={styles.infoSection}>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>First Name:</Text>
                  {editing ? (
                    <TextInput
                      style={styles.infoInput}
                      value={editData?.firstName || ''}
                      onChangeText={(value) => handleInputChange('firstName', value)}
                    />
                  ) : (
                    <Text style={styles.infoValue}>{teacherData?.firstName}</Text>
                  )}
                </View>

                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Last Name:</Text>
                  {editing ? (
                    <TextInput
                      style={styles.infoInput}
                      value={editData?.lastName || ''}
                      onChangeText={(value) => handleInputChange('lastName', value)}
                    />
                  ) : (
                    <Text style={styles.infoValue}>{teacherData?.lastName}</Text>
                  )}
                </View>

                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Email:</Text>
                  {editing ? (
                    <TextInput
                      style={styles.infoInput}
                      value={editData?.email || ''}
                      onChangeText={(value) => handleInputChange('email', value)}
                      keyboardType="email-address"
                    />
                  ) : (
                    <Text style={styles.infoValue}>{teacherData?.email}</Text>
                  )}
                </View>

                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Phone:</Text>
                  {editing ? (
                    <TextInput
                      style={styles.infoInput}
                      value={editData?.phone || ''}
                      onChangeText={(value) => handleInputChange('phone', value)}
                      keyboardType="phone-pad"
                    />
                  ) : (
                    <Text style={styles.infoValue}>{teacherData?.phone}</Text>
                  )}
                </View>

                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>School:</Text>
                  {editing ? (
                    <TextInput
                      style={styles.infoInput}
                      value={editData?.school || ''}
                      onChangeText={(value) => handleInputChange('school', value)}
                    />
                  ) : (
                    <Text style={styles.infoValue}>{teacherData?.school}</Text>
                  )}
                </View>
              </View>
            </ScrollView>

            {/* Modal Actions */}
            <View style={styles.modalActions}>
              {editing ? (
                <>
                  <TouchableOpacity 
                    style={styles.cancelButton} 
                    onPress={handleCancel}
                    disabled={uploading}
                  >
                    <Text style={styles.cancelButtonText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={styles.saveButton} 
                    onPress={handleSave}
                    disabled={uploading}
                  >
                    <Text style={styles.saveButtonText}>
                      {uploading ? 'Saving...' : 'Save Changes'}
                    </Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <TouchableOpacity 
                    style={styles.editProfileButton} 
                    onPress={handleEdit}
                  >
                    <Text style={styles.editProfileButtonText}>Edit Profile</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={styles.cancelButton} 
                    onPress={handleLogout}
                  >
                    <Text style={styles.cancelButtonText}>Logout</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        </View>
      </Modal>

      {/* Add Class Modal */}
      <Modal visible={showAddClassModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.profileModal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Class / Section</Text>
              <TouchableOpacity 
                onPress={() => setShowAddClassModal(false)}
                style={styles.closeButton}
              >
                <AntDesign name="close" size={24} color="#1e293b" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.profileContent}>
              <View style={styles.infoSection}>
                {/* Name field */}
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Name</Text>
                  <TextInput
                    style={styles.fieldInput}
                    value={className}
                    onChangeText={setClassName}
                    placeholder="e.g., Section Mabait"
                    placeholderTextColor="#6b7280"
                  />
                </View>

                {/* School selector */}
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>School</Text>
                  <View style={styles.segmentWrap}>
                    <TouchableOpacity
                      style={[styles.segmentButton, schoolOption === 'profile' && styles.segmentActive]}
                      onPress={() => setSchoolOption('profile')}
                    >
                      <Text style={[styles.segmentText, schoolOption === 'profile' && styles.segmentTextActive]}>Use Profile</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.segmentButton, schoolOption === 'other' && styles.segmentActive]}
                      onPress={() => setSchoolOption('other')}
                    >
                      <Text style={[styles.segmentText, schoolOption === 'other' && styles.segmentTextActive]}>Other</Text>
                    </TouchableOpacity>
                  </View>
                  {schoolOption === 'other' ? (
                    <TextInput
                      style={[styles.fieldInput, { marginTop: 10 }]}
                      value={schoolOther}
                      onChangeText={setSchoolOther}
                      placeholder="Enter school name"
                      placeholderTextColor="#6b7280"
                    />
                  ) : (
                    <View style={styles.readonlyBox}>
                      <Text style={styles.readonlyText}>{teacherData?.school || '—'}</Text>
                    </View>
                  )}
                </View>

                {/* School year dropdown */}
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>School Year</Text>
                  <TouchableOpacity style={styles.yearButton} onPress={() => setShowYearPicker((v) => !v)}>
                    <Text style={styles.yearButtonText}>{schoolYear || 'Select (e.g., 22-23)'}</Text>
                    <AntDesign name={showYearPicker ? 'up' : 'down'} size={14} color="#1e293b" />
                  </TouchableOpacity>
                  {showYearPicker && (
                    <View style={styles.yearMenu}>
                      <ScrollView>
                        {generateYearOptions().map((opt) => (
                          <TouchableOpacity
                            key={opt.value}
                            style={[
                              styles.yearOption,
                              schoolYear === opt.label && styles.yearOptionSelected,
                            ]}
                            onPress={() => {
                              setSchoolYear(opt.label);
                              setShowYearPicker(false);
                            }}
                          >
                            <Text style={styles.yearOptionText}>{opt.label}</Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  )}
                </View>
              </View>
            </ScrollView>
            <View style={styles.modalActions}>
              <TouchableOpacity 
                style={styles.cancelButton} 
                onPress={() => setShowAddClassModal(false)}
                disabled={savingClass}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.saveButton} 
                onPress={async () => {
                  if (!currentUserId) {
                    Alert.alert('Error', 'Not authenticated.');
                    return;
                  }
                  if (!className.trim()) {
                    Alert.alert('Error', 'Please enter class/section name.');
                    return;
                  }
                  const resolvedSchool = schoolOption === 'other' ? schoolOther.trim() : (teacherData?.school || '').trim();
                  if (!resolvedSchool) {
                    Alert.alert('Error', 'Please select or enter a school name.');
                    return;
                  }
                  if (!schoolYear.trim()) {
                    Alert.alert('Error', 'Please enter school year (e.g., 2025-2026).');
                    return;
                  }
                  try {
                    setSavingClass(true);
                    const syValue = schoolYear.replace('-', ''); // store as 2223
                    const section = {
                      name: className.trim(),
                      schoolName: resolvedSchool,
                      schoolYear: syValue,
                      teacherId: currentUserId,
                      status: 'active',
                      createdAt: new Date().toISOString(),
                    };
                    const { key, error } = await pushData('/sections', section);
                    if (error || !key) {
                      Alert.alert('Error', error || 'Failed to create section.');
                    } else {
                      await updateData(`/sections/${key}`, { id: key });
                      Alert.alert('Success', 'Class/Section created successfully.');
                      if (currentUserId) {
                        await loadTeacherClasses(currentUserId);
                      }
                      setShowAddClassModal(false);
                      setClassName('');
                      setSchoolOption('profile');
                      setSchoolOther('');
                      setSchoolYear('');
                    }
                  } catch (e) {
                    Alert.alert('Error', 'Failed to create section.');
                  } finally {
                    setSavingClass(false);
                  }
                }}
                disabled={savingClass}
              >
                <Text style={styles.saveButtonText}>{savingClass ? 'Creating...' : 'Create'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Announcement Modal */}
      <Modal visible={showAnnModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.profileModal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New Announcement</Text>
              <TouchableOpacity onPress={() => setShowAnnModal(false)} style={styles.closeButton}>
                <AntDesign name="close" size={24} color="#1e293b" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.profileContent}>
              <View style={styles.infoSection}>
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Title</Text>
                  <TextInput
                    style={styles.fieldInput}
                    value={annTitle}
                    onChangeText={setAnnTitle}
                    placeholder="e.g., Exam Schedule"
                    placeholderTextColor="#6b7280"
                  />
                </View>
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Message</Text>
                  <TextInput
                    style={[styles.fieldInput, { height: 120, textAlignVertical: 'top' }]}
                    value={annMessage}
                    onChangeText={setAnnMessage}
                    placeholder="Write your announcement..."
                    placeholderTextColor="#6b7280"
                    multiline
                  />
                </View>
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Send To</Text>
                  <View style={styles.segmentWrap}>
                    <TouchableOpacity
                      style={[styles.segmentButton, annAllClasses && styles.segmentActive]}
                      onPress={() => {
                        setAnnAllClasses(true);
                        setAnnSelectedClassIds(teacherClasses.map((c) => c.id));
                      }}
                    >
                      <Text style={[styles.segmentText, annAllClasses && styles.segmentTextActive]}>All Classes</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.segmentButton, !annAllClasses && styles.segmentActive]}
                      onPress={() => setAnnAllClasses(false)}
                    >
                      <Text style={[styles.segmentText, !annAllClasses && styles.segmentTextActive]}>Specific</Text>
                    </TouchableOpacity>
                  </View>
                  {!annAllClasses && (
                    <View style={{ marginTop: 10, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, backgroundColor: '#fff' }}>
                      {teacherClasses.map((c) => {
                        const checked = annSelectedClassIds.includes(c.id);
                        return (
                          <TouchableOpacity
                            key={c.id}
                            style={{ paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#f1f5f9' }}
                            onPress={() => {
                              setAnnSelectedClassIds((prev) => (
                                checked ? prev.filter((id) => id !== c.id) : [...prev, c.id]
                              ));
                            }}
                          >
                            <Text style={{ color: '#111827', fontSize: 16 }}>{c.name}</Text>
                            <MaterialIcons name={checked ? 'check-box' : 'check-box-outline-blank'} size={18} color={checked ? '#2563eb' : '#9ca3af'} />
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                </View>
              </View>
            </ScrollView>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setShowAnnModal(false)} disabled={sendingAnn}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.saveButton}
                disabled={sendingAnn}
                onPress={async () => {
                  if (!currentUserId) { Alert.alert('Error', 'Not authenticated.'); return; }
                  if (!annTitle.trim() || !annMessage.trim()) { Alert.alert('Error', 'Title and message are required.'); return; }
                  const targetIds = annAllClasses ? teacherClasses.map((c) => c.id) : annSelectedClassIds;
                  if (!targetIds.length) { Alert.alert('Error', 'Select at least one class.'); return; }
                  try {
                    setSendingAnn(true);
                    const now = new Date();
                    const id = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}-${Math.random().toString(36).slice(2,6).toUpperCase()}`;
                    const payload = {
                      id,
                      classIds: targetIds,
                      dateTime: now.toISOString(),
                      message: annMessage.trim(),
                      title: annTitle.trim(),
                      teacherId: currentUserId,
                    };
                    const { success, error } = await writeData(`/announcements/${id}`, payload);
                    if (!success) {
                      Alert.alert('Error', error || 'Failed to send');
                    } else {
                      Alert.alert('Success', 'Announcement sent');
                      setShowAnnModal(false);
                      setAnnTitle('');
                      setAnnMessage('');
                    }
                  } catch (e) {
                    Alert.alert('Error', 'Failed to send');
                  } finally {
                    setSendingAnn(false);
                  }
                }}
              >
                <Text style={styles.saveButtonText}>{sendingAnn ? 'Sending...' : 'Send'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add Student Modal */}
      <Modal visible={showAddStudentModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.profileModal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Student{selectedClassForStudent ? ` — ${selectedClassForStudent.name}` : ''}</Text>
              <TouchableOpacity onPress={() => setShowAddStudentModal(false)} style={styles.closeButton}>
                <AntDesign name="close" size={24} color="#1e293b" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.profileContent}>
              <View style={styles.infoSection}>
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Student Nickname</Text>
                  <TextInput
                    style={styles.fieldInput}
                    value={studentNickname}
                    onChangeText={setStudentNickname}
                    placeholder="e.g., Ken"
                    placeholderTextColor="#6b7280"
                  />
                </View>
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Gender</Text>
                  <View style={styles.segmentWrap}>
                    <TouchableOpacity
                      style={[styles.segmentButton, studentGender === 'male' && styles.segmentActive]}
                      onPress={() => setStudentGender('male')}
                    >
                      <Text style={[styles.segmentText, studentGender === 'male' && styles.segmentTextActive]}>Male</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.segmentButton, studentGender === 'female' && styles.segmentActive]}
                      onPress={() => setStudentGender('female')}
                    >
                      <Text style={[styles.segmentText, studentGender === 'female' && styles.segmentTextActive]}>Female</Text>
                    </TouchableOpacity>
                  </View>
                </View>
                <Text style={{ color: '#64748b', fontSize: 12, marginTop: 4 }}>
                  Disclaimer: For student privacy, use only a nickname or a unique identifier. Parent details will be collected securely when they first log in.
                </Text>
              </View>
            </ScrollView>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setShowAddStudentModal(false)} disabled={savingStudent}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveButton} onPress={handleCreateStudent} disabled={savingStudent}>
                <Text style={styles.saveButtonText}>{savingStudent ? 'Creating...' : 'Create'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Class List Modal */}
      <Modal visible={showListModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.profileModal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Class Lists</Text>
              <TouchableOpacity onPress={() => setShowListModal(false)} style={styles.closeButton}>
                <AntDesign name="close" size={24} color="#1e293b" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.profileContent}>
              {activeClasses.map((cls) => (
                <View key={cls.id} style={{ marginBottom: 18 }}>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: '#1e293b', marginBottom: 8 }}>{cls.name}</Text>
                  {(studentsByClass[cls.id] || []).length === 0 ? (
                    <Text style={{ color: '#64748b' }}>No students yet.</Text>
                  ) : (
                    (studentsByClass[cls.id] || []).map((s) => {
                      const p = s.parentId ? parentsById[s.parentId] : undefined;
                      return (
                        <View key={s.studentId} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' }}>
                          <Text style={{ color: '#111827' }}>{s.nickname}</Text>
                          <Text style={{ color: '#2563eb', fontWeight: '600' }}>{p?.loginCode || '—'}</Text>
                        </View>
                      );
                    })
                  )}
                </View>
              ))}
            </ScrollView>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.saveButton} onPress={() => setShowListModal(false)}>
                <Text style={styles.saveButtonText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Assign Exercise Form */}
      <AssignExerciseForm
        visible={showAssignForm}
        onClose={() => {
          setShowAssignForm(false);
          setSelectedExerciseForAssign(null);
        }}
        onAssign={handleAssignExercise}
        exerciseTitle={selectedExerciseForAssign?.title || ''}
        currentUserId={currentUserId}
      />

      {/* Edit Assignment Modal */}
      <Modal
        visible={showEditAssignmentModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowEditAssignmentModal(false)}
      >
        <View style={styles.assignmentModalContainer}>
          <View style={styles.assignmentModalHeader}>
            <TouchableOpacity
              onPress={() => setShowEditAssignmentModal(false)}
              style={styles.assignmentModalCloseButton}
            >
              <MaterialIcons name="close" size={24} color="#1e293b" />
            </TouchableOpacity>
            <Text style={styles.assignmentModalTitle}>Edit Assignment</Text>
            <View style={styles.assignmentModalPlaceholder} />
          </View>

          {editingAssignment && (
            <ScrollView style={styles.assignmentModalContent} showsVerticalScrollIndicator={false}>
              <View style={styles.editAssignmentForm}>
                <Text style={styles.editAssignmentTitle}>
                  {editingAssignment.exercise?.title || 'Unknown Exercise'}
                </Text>
                
                <View style={styles.editInputGroup}>
                  <Text style={styles.editInputLabel}>Assigned Class</Text>
                  <Text style={styles.classDisplay}>
                    {editingAssignment.className || 'Unknown Class'}
                  </Text>
                  <Text style={styles.inputNote}>Class cannot be changed after assignment</Text>
                </View>

                <View style={styles.editInputGroup}>
                  <Text style={styles.editInputLabel}>Deadline</Text>
                  
                  {/* Simple Date/Time Input */}
                  <View style={styles.simpleDateTimeContainer}>
                    <Text style={styles.simpleDateTimeLabel}>Select New Deadline:</Text>
                    
                    <View style={styles.simpleDateTimeRow}>
                      <Text style={styles.simpleDateTimeText}>Date:</Text>
                      <TextInput
                        style={styles.simpleDateTimeInput}
                        placeholder="MM/DD/YYYY"
                        value={selectedDate.toLocaleDateString('en-US')}
                        onChangeText={(text) => {
                          // Simple date parsing
                          const parts = text.split('/');
                          if (parts.length === 3) {
                            const month = parseInt(parts[0]) - 1;
                            const day = parseInt(parts[1]);
                            const year = parseInt(parts[2]);
                            if (!isNaN(month) && !isNaN(day) && !isNaN(year)) {
                              const newDate = new Date(year, month, day);
                              if (!isNaN(newDate.getTime())) {
                                setSelectedDate(newDate);
                                updateDeadline(newDate, selectedTime);
                              }
                            }
                          }
                        }}
                      />
                    </View>

                    <View style={styles.simpleDateTimeRow}>
                      <Text style={styles.simpleDateTimeText}>Time:</Text>
                      <TextInput
                        style={styles.simpleDateTimeInput}
                        placeholder="HH:MM AM/PM"
                        value={selectedTime.toLocaleTimeString('en-US', { hour12: true })}
                        onChangeText={(text) => {
                          // Simple time parsing
                          const timeMatch = text.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
                          if (timeMatch) {
                            let hours = parseInt(timeMatch[1]);
                            const minutes = parseInt(timeMatch[2]);
                            const ampm = timeMatch[3].toUpperCase();
                            
                            if (ampm === 'PM' && hours !== 12) hours += 12;
                            if (ampm === 'AM' && hours === 12) hours = 0;
                            
                            const newTime = new Date();
                            newTime.setHours(hours, minutes, 0, 0);
                            setSelectedTime(newTime);
                            updateDeadline(selectedDate, newTime);
                          }
                        }}
                      />
                    </View>
                  </View>

                  {/* Current Deadline Display */}
                  {newDeadline && (
                    <View style={styles.currentDeadlineDisplay}>
                      <Text style={styles.currentDeadlineLabel}>New Deadline:</Text>
                      <Text style={styles.currentDeadlineText}>
                        {new Date(newDeadline).toLocaleString('en-US', {
                          weekday: 'short',
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                          hour12: true
                        })}
                      </Text>
                    </View>
                  )}
                </View>

                {/* Accept Late Submissions Toggle */}
                <View style={styles.editInputGroup}>
                  <Text style={styles.editInputLabel}>Submission Settings</Text>
                  <TouchableOpacity 
                    style={styles.editSettingItem}
                    onPress={() => setEditAcceptLateSubmissions(!editAcceptLateSubmissions)}
                  >
                    <View style={styles.editSettingInfo}>
                      <Text style={styles.editSettingTitle}>Accept Late Submissions</Text>
                      <Text style={styles.editSettingDescription}>
                        Allow students to submit after the deadline
                      </Text>
                    </View>
                    <View style={[
                      styles.editToggle,
                      editAcceptLateSubmissions && styles.editToggleActive
                    ]}>
                      <View style={[
                        styles.editToggleThumb,
                        editAcceptLateSubmissions && styles.editToggleThumbActive
                      ]} />
                    </View>
                  </TouchableOpacity>
                </View>

                <View style={styles.editAssignmentInfo}>
                  <Text style={styles.editInfoLabel}>Assignment Details</Text>
                  <View style={styles.editInfoRow}>
                    <Text style={styles.editInfoLabel}>Created:</Text>
                    <Text style={styles.editInfoValue}>
                      {new Date(editingAssignment.createdAt).toLocaleDateString()}
                    </Text>
                  </View>
                  <View style={styles.editInfoRow}>
                    <Text style={styles.editInfoLabel}>Questions:</Text>
                    <Text style={styles.editInfoValue}>
                      {editingAssignment.exercise?.questionCount || 0} questions
                    </Text>
                  </View>
                </View>
              </View>
            </ScrollView>
          )}

          <View style={styles.assignmentModalActions}>
            <TouchableOpacity
              style={styles.editCancelButton}
              onPress={() => setShowEditAssignmentModal(false)}
            >
              <Text style={styles.editCancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.editSaveButton, editAssignmentLoading && styles.buttonDisabled]}
              onPress={saveEditAssignment}
              disabled={editAssignmentLoading}
            >
              <Text style={styles.editSaveButtonText}>
                {editAssignmentLoading ? 'Saving...' : 'Save Changes'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Delete Assignment Modal */}
      <Modal
        visible={showDeleteAssignmentModal}
        animationType="fade"
        transparent
        onRequestClose={() => setShowDeleteAssignmentModal(false)}
      >
        <View style={styles.deleteModalOverlay}>
          <View style={styles.deleteModal}>
            <View style={styles.deleteModalHeader}>
              <MaterialIcons name="warning" size={24} color="#ef4444" />
              <Text style={styles.deleteModalTitle}>Delete Assignment</Text>
            </View>
            
            {deletingAssignment && (
              <View style={styles.deleteModalContent}>
                <Text style={styles.deleteModalText}>
                  Are you sure you want to delete this assignment?
                </Text>
                <View style={styles.deleteAssignmentInfo}>
                  <Text style={styles.deleteAssignmentTitle}>
                    {deletingAssignment.exercise?.title || 'Unknown Exercise'}
                  </Text>
                  <Text style={styles.deleteAssignmentClass}>
                    {deletingAssignment.className || 'Unknown Class'}
                  </Text>
                  <Text style={styles.deleteAssignmentDeadline}>
                    Due: {deletingAssignment.deadline ? 
                      new Date(deletingAssignment.deadline).toLocaleDateString() : 'No deadline'
                    }
                  </Text>
                </View>
                <Text style={styles.deleteWarningText}>
                  This action cannot be undone. Students will no longer have access to this assignment.
                </Text>
              </View>
            )}

            <View style={styles.deleteModalActions}>
              <TouchableOpacity
                style={styles.deleteCancelButton}
                onPress={() => setShowDeleteAssignmentModal(false)}
              >
                <Text style={styles.deleteCancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.deleteConfirmButton, deleteAssignmentLoading && styles.buttonDisabled]}
                onPress={confirmDeleteAssignment}
                disabled={deleteAssignmentLoading}
              >
                <Text style={styles.deleteConfirmButtonText}>
                  {deleteAssignmentLoading ? 'Deleting...' : 'Delete Assignment'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Student Status Modal */}
      <Modal
        visible={showStudentStatusModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowStudentStatusModal(false)}
      >
        <View style={styles.studentStatusModalContainer}>
          <View style={styles.studentStatusModalHeader}>
            <TouchableOpacity
              onPress={() => setShowStudentStatusModal(false)}
              style={styles.studentStatusModalCloseButton}
            >
              <MaterialIcons name="close" size={24} color="#1e293b" />
            </TouchableOpacity>
            <Text style={styles.studentStatusModalTitle}>Student Progress</Text>
            <View style={styles.studentStatusModalPlaceholder} />
          </View>

          {selectedAssignmentForStatus && (
            <ScrollView style={styles.studentStatusModalContent} showsVerticalScrollIndicator={false}>
              <View style={styles.studentStatusHeader}>
                <Text style={styles.studentStatusAssignmentTitle}>
                  {selectedAssignmentForStatus.exercise?.title || 'Unknown Exercise'}
                </Text>
                <Text style={styles.studentStatusClass}>
                  {selectedAssignmentForStatus.className || 'Unknown Class'}
                </Text>
                <Text style={styles.studentStatusDeadline}>
                  Due: {new Date(selectedAssignmentForStatus.deadline).toLocaleString('en-US', {
                    weekday: 'short',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true
                  })}
                </Text>
              </View>

              <View style={styles.studentListContainer}>
                <Text style={styles.studentListTitle}>Students ({studentsByClass[selectedAssignmentForStatus.classId]?.length || 0})</Text>
                <Text style={styles.studentListSubtitle}>Tap status badges to toggle completion</Text>
                
                {(studentsByClass[selectedAssignmentForStatus.classId] || []).map((student: any, index: number) => {
                  const status = getStudentStatus(student.studentId, selectedAssignmentForStatus);
                  return (
                    <View key={student.studentId} style={styles.studentStatusItem}>
                      <View style={styles.studentInfo}>
                        <View style={styles.studentAvatar}>
                          <Text style={styles.studentAvatarText}>
                            {student.nickname?.charAt(0)?.toUpperCase() || 'S'}
                          </Text>
                        </View>
                        <View style={styles.studentDetails}>
                          <Text style={styles.studentStatusName}>{student.nickname || 'Unknown Student'}</Text>
                          <Text style={styles.studentId}>ID: {student.studentId}</Text>
                        </View>
                      </View>
                      
                      <TouchableOpacity 
                        style={[styles.statusBadge, {
                          backgroundColor: status === 'completed' ? '#10b981' : '#ef4444'
                        }]}
                        onPress={() => {
                          if (status === 'completed') {
                            markStudentPending(student.studentId, selectedAssignmentForStatus.id);
                          } else {
                            markStudentCompleted(student.studentId, selectedAssignmentForStatus.id);
                          }
                        }}
                        activeOpacity={0.7}
                      >
                        <MaterialCommunityIcons 
                          name={status === 'completed' ? 'check-circle' : 'alert-circle'} 
                          size={16} 
                          color="#ffffff" 
                        />
                        <Text style={styles.studentStatusText}>
                          {status === 'completed' ? 'Completed' : 'Pending'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            </ScrollView>
          )}

          <View style={styles.studentStatusModalActions}>
            <TouchableOpacity
              style={styles.studentStatusCloseButton}
              onPress={() => setShowStudentStatusModal(false)}
            >
              <Text style={styles.studentStatusCloseButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Parent Info Modal */}
      <Modal visible={showParentInfoModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.parentInfoModal}>
            <View style={styles.parentInfoHeader}>
              <TouchableOpacity
                onPress={() => setShowParentInfoModal(false)}
                style={styles.parentInfoCloseButton}
              >
                <MaterialIcons name="close" size={24} color="#1e293b" />
              </TouchableOpacity>
              <Text style={styles.parentInfoTitle}>Parent Information</Text>
              <View style={styles.parentInfoPlaceholder} />
            </View>

            {selectedParentInfo && (
              <ScrollView style={styles.parentInfoContent} showsVerticalScrollIndicator={false}>
                <View style={styles.parentInfoSection}>
                  <Text style={styles.parentInfoSectionTitle}>Student Information</Text>
                  <View style={styles.parentInfoRow}>
                    <Text style={styles.parentInfoLabel}>Student Name:</Text>
                    <Text style={styles.parentInfoValue}>{selectedParentInfo.student?.nickname || 'N/A'}</Text>
                  </View>
                  <View style={styles.parentInfoRow}>
                    <Text style={styles.parentInfoLabel}>Gender:</Text>
                    <Text style={styles.parentInfoValue}>{selectedParentInfo.student?.gender || 'N/A'}</Text>
                  </View>
                </View>

                <View style={styles.parentInfoSection}>
                  <Text style={styles.parentInfoSectionTitle}>Access Information</Text>
                  <View style={styles.parentInfoRow}>
                    <Text style={styles.parentInfoLabel}>Parent Access Code:</Text>
                    <Text style={[styles.parentInfoValue, styles.parentInfoCodeValue]}>{selectedParentInfo.loginCode}</Text>
                  </View>
                  <View style={styles.parentInfoRow}>
                    <Text style={styles.parentInfoLabel}>Account Status:</Text>
                    <Text style={[styles.parentInfoValue, selectedParentInfo.infoStatus === 'completed' ? styles.parentInfoStatusCompleted : styles.parentInfoStatusPending]}>
                      {selectedParentInfo.infoStatus === 'completed' ? 'Profile Complete' : 'Profile Pending'}
                    </Text>
                  </View>
                </View>

                {selectedParentInfo.infoStatus === 'completed' && (
                  <View style={styles.parentInfoSection}>
                    <Text style={styles.parentInfoSectionTitle}>Parent Details</Text>
                    <View style={styles.parentInfoRow}>
                      <Text style={styles.parentInfoLabel}>Name:</Text>
                      <Text style={styles.parentInfoValue}>
                        {selectedParentInfo.firstName && selectedParentInfo.lastName 
                          ? `${selectedParentInfo.firstName} ${selectedParentInfo.lastName}`
                          : 'Not provided'}
                      </Text>
                    </View>
                    <View style={styles.parentInfoRow}>
                      <Text style={styles.parentInfoLabel}>Email:</Text>
                      <Text style={styles.parentInfoValue}>{selectedParentInfo.email || 'Not provided'}</Text>
                    </View>
                    <View style={styles.parentInfoRow}>
                      <Text style={styles.parentInfoLabel}>Mobile:</Text>
                      <Text style={styles.parentInfoValue}>{selectedParentInfo.mobile || 'Not provided'}</Text>
                    </View>
                    {selectedParentInfo.profilePictureUrl && (
                      <View style={styles.parentInfoRow}>
                        <Text style={styles.parentInfoLabel}>Profile Picture:</Text>
                        <View style={styles.parentInfoImageContainer}>
                          <Image 
                            source={{ uri: selectedParentInfo.profilePictureUrl }} 
                            style={styles.parentInfoImage}
                            resizeMode="cover"
                          />
                        </View>
                      </View>
                    )}
                  </View>
                )}

                {selectedParentInfo.infoStatus === 'pending' && (
                  <View style={styles.parentInfoSection}>
                    <View style={styles.parentInfoPendingContainer}>
                      <MaterialIcons name="info" size={24} color="#f59e0b" />
                      <Text style={styles.parentInfoPendingText}>
                        Parent hasn't completed their profile yet. Share the access code with them to get started.
                      </Text>
                    </View>
                  </View>
                )}
              </ScrollView>
            )}

            <View style={styles.parentInfoActions}>
              <TouchableOpacity
                style={styles.parentInfoCloseActionButton}
                onPress={() => setShowParentInfoModal(false)}
              >
                <Text style={styles.parentInfoCloseActionButtonText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Student Performance Modal */}
      <Modal visible={showStudentPerformanceModal} animationType="slide" transparent={false}>
        <View style={styles.studentPerformanceFullScreenContainer}>
          <View style={styles.studentPerformanceFullScreenHeader}>
            <View style={styles.studentPerformanceHeaderContent}>
              <Text style={styles.studentPerformanceFullScreenTitle}>Student Performance Analysis</Text>
              {selectedStudentPerformance && (
                <Text style={styles.studentPerformanceStudentName}>
                  {selectedStudentPerformance.nickname || selectedStudentPerformance.firstName}
                </Text>
              )}
            </View>
            <TouchableOpacity
              onPress={() => setShowStudentPerformanceModal(false)}
              style={styles.studentPerformanceCloseButton}
            >
              <MaterialIcons name="close" size={24} color="#1e293b" />
            </TouchableOpacity>
          </View>

          {loadingStudentPerformance ? (
            <View style={styles.studentPerformanceFullScreenLoading}>
              <Text style={styles.studentPerformanceLoadingText}>Loading performance data...</Text>
            </View>
          ) : studentPerformanceData ? (
            <ScrollView style={styles.studentPerformanceFullScreenContent} showsVerticalScrollIndicator={true}>
                {/* Student Info */}
                <View style={styles.studentPerformanceSection}>
                  <Text style={styles.studentPerformanceSectionTitle}>Student Information</Text>
                  <View style={styles.studentPerformanceInfo}>
                    <Text style={styles.studentPerformanceName}>
                      {selectedStudentPerformance?.nickname || 'Unknown Student'}
                    </Text>
                    <Text style={styles.studentPerformanceExercise}>
                      {studentPerformanceData.exerciseData?.title || 'Unknown Exercise'}
                    </Text>
                  </View>
                </View>

                {/* Performance Overview */}
                <View style={styles.studentPerformanceCard}>
                  <Text style={styles.studentPerformanceCardTitle}>Performance Overview</Text>
                  <View style={styles.studentPerformanceScoreContainer}>
                    <Text style={styles.studentPerformanceScoreText}>
                      {Math.round(studentPerformanceData.performanceMetrics.overallScore)}
                    </Text>
                    <Text style={styles.studentPerformanceScoreLabel}>Performance Score</Text>
                    <Text style={styles.studentPerformanceScoreNote}>
                      Based on efficiency, consistency & mastery
                    </Text>
                  </View>
                  <View style={styles.studentPerformanceStatsRow}>
                    <View style={styles.studentPerformanceStatItem}>
                      <Text style={styles.studentPerformanceStatValue}>
                        {studentPerformanceData.studentResult.questionResults?.length || 0}
                      </Text>
                      <Text style={styles.studentPerformanceStatLabel}>Questions</Text>
                    </View>
                    <View style={styles.studentPerformanceStatItem}>
                      <Text style={styles.studentPerformanceStatValue}>
                        {Math.round((studentPerformanceData.studentResult.totalTimeSpent || 0) / 1000)}s
                      </Text>
                      <Text style={styles.studentPerformanceStatLabel}>Time Spent</Text>
                    </View>
                    <View style={styles.studentPerformanceStatItem}>
                      <Text style={styles.studentPerformanceStatValue}>
                        {studentPerformanceData.performanceMetrics.totalAttempts}
                      </Text>
                      <Text style={styles.studentPerformanceStatLabel}>Total Attempts</Text>
                    </View>
                  </View>
                </View>

                {/* Performance Metrics */}
                {studentPerformanceData.classStats && (
                  <View style={styles.studentPerformanceRankingCard}>
                    <Text style={styles.studentPerformanceCardTitle}>Performance Metrics</Text>
                    <View style={styles.studentPerformanceMetrics}>
                      <View style={styles.studentPerformanceMetricItem}>
                        <Text style={styles.studentPerformanceMetricLabel}>Efficiency</Text>
                        <Text style={styles.studentPerformanceMetricValue}>
                          {Math.round(studentPerformanceData.performanceMetrics.efficiencyScore)}/100
                        </Text>
                        <Text style={styles.studentPerformanceMetricComparison}>
                          vs {Math.round(studentPerformanceData.classStats.averageEfficiency)} class avg
                        </Text>
                      </View>
                      <View style={styles.studentPerformanceMetricItem}>
                        <Text style={styles.studentPerformanceMetricLabel}>Consistency</Text>
                        <Text style={styles.studentPerformanceMetricValue}>
                          {Math.round(studentPerformanceData.performanceMetrics.consistencyScore)}/100
                        </Text>
                        <Text style={styles.studentPerformanceMetricComparison}>
                          vs {Math.round(studentPerformanceData.classStats.averageConsistency)} class avg
                        </Text>
                      </View>
                      <View style={styles.studentPerformanceMetricItem}>
                        <Text style={styles.studentPerformanceMetricLabel}>Mastery</Text>
                        <Text style={styles.studentPerformanceMetricValue}>
                          {Math.round(studentPerformanceData.performanceMetrics.masteryScore)}/100
                        </Text>
                        <Text style={styles.studentPerformanceMetricComparison}>
                          vs {Math.round(studentPerformanceData.classStats.averageMastery)} class avg
                        </Text>
                      </View>
                    </View>
                    <View style={styles.studentPerformanceOverallScore}>
                      <Text style={styles.studentPerformanceOverallScoreLabel}>Overall Performance</Text>
                      <Text style={styles.studentPerformanceOverallScoreValue}>
                        {Math.round(studentPerformanceData.performanceMetrics.overallScore)}/100
                      </Text>
                      <Text style={[styles.studentPerformanceLevelText, { 
                        color: studentPerformanceData.performanceLevel === 'excellent' ? '#10b981' :
                               studentPerformanceData.performanceLevel === 'good' ? '#3b82f6' :
                               studentPerformanceData.performanceLevel === 'fair' ? '#f59e0b' : '#ef4444'
                      }]}>
                        {studentPerformanceData.performanceLevel.charAt(0).toUpperCase() + 
                         studentPerformanceData.performanceLevel.slice(1).replace('_', ' ')}
                      </Text>
                    </View>
                  </View>
                )}

                {/* Gemini Analysis Sections */}
                {geminiAnalysis && (
                  <>
                    {/* Strengths */}
                    <View style={styles.studentPerformanceAnalysisCard}>
                      <Text style={styles.studentPerformanceCardTitle}>Strengths</Text>
                      {geminiAnalysis.strengths.map((strength: string, index: number) => (
                        <View key={index} style={styles.studentPerformanceAnalysisItem}>
                          <MaterialCommunityIcons name="check-circle" size={16} color="#10b981" />
                          <Text style={styles.studentPerformanceAnalysisText}>{strength}</Text>
                        </View>
                      ))}
                    </View>

                    {/* Areas for Improvement */}
                    <View style={styles.studentPerformanceAnalysisCard}>
                      <Text style={styles.studentPerformanceCardTitle}>Areas for Improvement</Text>
                      {geminiAnalysis.weaknesses.map((weakness: string, index: number) => (
                        <View key={index} style={styles.studentPerformanceAnalysisItem}>
                          <MaterialCommunityIcons name="alert-circle" size={16} color="#f59e0b" />
                          <Text style={styles.studentPerformanceAnalysisText}>{weakness}</Text>
                        </View>
                      ))}
                    </View>

                    {/* Question Analysis */}
                    {geminiAnalysis.questionAnalysis && Array.isArray(geminiAnalysis.questionAnalysis) && geminiAnalysis.questionAnalysis.length > 0 && (
                      <View style={styles.studentPerformanceAnalysisCard}>
                        <Text style={styles.studentPerformanceCardTitle}>Question Analysis</Text>
                        {geminiAnalysis.questionAnalysis.map((analysis: any, index: number) => (
                          <View key={index} style={styles.studentPerformanceAnalysisItem}>
                            <MaterialCommunityIcons name="help-circle" size={16} color="#3b82f6" />
                            <Text style={styles.studentPerformanceAnalysisText}>
                              {typeof analysis === 'string' ? analysis : 
                               typeof analysis === 'object' && analysis.analysis ? analysis.analysis :
                               typeof analysis === 'object' && analysis.questionNumber ? 
                                 `Question ${analysis.questionNumber}: ${analysis.analysis || analysis.concept || JSON.stringify(analysis)}` :
                               JSON.stringify(analysis)}
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}

                    {/* Time Analysis */}
                    {geminiAnalysis.timeAnalysis && (
                      <View style={styles.studentPerformanceAnalysisCard}>
                        <Text style={styles.studentPerformanceCardTitle}>Time Analysis</Text>
                        <Text style={styles.studentPerformanceTimeAnalysisText}>
                          {geminiAnalysis.timeAnalysis.description}
                        </Text>
                        <View style={styles.studentPerformanceTimeComparison}>
                          <Text style={styles.studentPerformanceTimeComparisonText}>
                            Student: {geminiAnalysis.timeAnalysis.studentTime}s | 
                            Class: {geminiAnalysis.timeAnalysis.classAverage}s
                          </Text>
                        </View>
                      </View>
                    )}

                    {/* Recommendations */}
                    <View style={styles.studentPerformanceAnalysisCard}>
                      <Text style={styles.studentPerformanceCardTitle}>Recommendations</Text>
                      {geminiAnalysis.recommendations.map((recommendation: string, index: number) => (
                        <View key={index} style={styles.studentPerformanceAnalysisItem}>
                          <MaterialCommunityIcons name="lightbulb" size={16} color="#3b82f6" />
                          <Text style={styles.studentPerformanceAnalysisText}>{recommendation}</Text>
                        </View>
                      ))}
                    </View>

                    {/* Encouragement */}
                    <View style={styles.studentPerformanceEncouragementCard}>
                      <MaterialCommunityIcons name="heart" size={24} color="#ef4444" />
                      <Text style={styles.studentPerformanceEncouragementText}>
                        {geminiAnalysis.encouragement}
                      </Text>
                    </View>
                  </>
                )}

                {/* Question Details */}
                {studentPerformanceData?.studentResult?.questionResults && studentPerformanceData.studentResult.questionResults.length > 0 && (
                  <View style={styles.studentPerformanceQuestionDetailsCard}>
                    <Text style={styles.studentPerformanceCardTitle}>Question Details</Text>
                    {studentPerformanceData.studentResult.questionResults.map((question: any, index: number) => (
                      <View key={question.questionId} style={styles.studentPerformanceQuestionDetailItem}>
                        <View style={styles.studentPerformanceQuestionDetailHeader}>
                          <Text style={styles.studentPerformanceQuestionNumber}>Question {question.questionNumber}</Text>
                          <View style={[
                            styles.studentPerformanceQuestionStatus,
                            { backgroundColor: '#10b981' } // All questions are correct since student completed
                          ]}>
                            <Text style={styles.studentPerformanceQuestionStatusText}>
                              CORRECT
                            </Text>
                          </View>
                        </View>
                        
                        {/* Show question text */}
                        {question.questionText && (
                          <View style={styles.studentPerformanceQuestionInfo}>
                            <Text style={styles.studentPerformanceQuestionInfoLabel}>Question:</Text>
                            <Text style={styles.studentPerformanceQuestionInfoValue}>"{question.questionText}"</Text>
                          </View>
                        )}
                        
                        {/* Show question image if available */}
                        {question.questionImage && (
                          <View style={styles.studentPerformanceQuestionInfo}>
                            <Text style={styles.studentPerformanceQuestionInfoLabel}>Image:</Text>
                            <Text style={styles.studentPerformanceQuestionInfoValue}>Contains image</Text>
                          </View>
                        )}
                        
                        {/* Show question type */}
                        {question.questionType && (
                          <View style={styles.studentPerformanceQuestionInfo}>
                            <Text style={styles.studentPerformanceQuestionInfoLabel}>Question Type:</Text>
                            <Text style={styles.studentPerformanceQuestionInfoValue}>{question.questionType}</Text>
                          </View>
                        )}
                        
                        {/* Show options if available */}
                        {question.options && question.options.length > 0 && (
                          <View style={styles.studentPerformanceQuestionInfo}>
                            <Text style={styles.studentPerformanceQuestionInfoLabel}>Options:</Text>
                            <Text style={styles.studentPerformanceQuestionInfoValue}>{question.options.join(', ')}</Text>
                          </View>
                        )}
                        
                        {/* Show attempted answers history */}
                        {question.attemptHistory && question.attemptHistory.length > 0 && (
                          <View style={styles.studentPerformanceQuestionInfo}>
                            <Text style={styles.studentPerformanceQuestionInfoLabel}>Attempt History:</Text>
                            <Text style={styles.studentPerformanceQuestionInfoValue}>
                              {question.attemptHistory.map((attempt: any, idx: number) => {
                                const timeSpent = attempt.timeSpent || 0;
                                const timeInSeconds = Math.round(timeSpent / 1000);
                                return `"${attempt.answer || 'blank'}" (${timeInSeconds}s)`;
                              }).join(', ')}
                            </Text>
                          </View>
                        )}
                        
                        {question.studentAnswer && (
                          <View style={styles.studentPerformanceQuestionInfo}>
                            <Text style={styles.studentPerformanceQuestionInfoLabel}>Final Answer:</Text>
                            <Text style={styles.studentPerformanceQuestionInfoValue}>"{question.studentAnswer}"</Text>
                          </View>
                        )}
                        
                        {question.correctAnswer && (
                          <View style={styles.studentPerformanceQuestionInfo}>
                            <Text style={styles.studentPerformanceQuestionInfoLabel}>Correct Answer:</Text>
                            <Text style={styles.studentPerformanceQuestionInfoValue}>"{question.correctAnswer}"</Text>
                          </View>
                        )}
                        
                        <View style={styles.studentPerformanceQuestionDetailStats}>
                          <Text style={styles.studentPerformanceQuestionDetailStat}>
                            Attempts: {question.attempts || 1}
                          </Text>
                          <Text style={styles.studentPerformanceQuestionDetailStat}>
                            Time: {Math.round((question.timeSpent || 0) / 1000)}s
                          </Text>
                        </View>
                        
                        {/* Show enhanced performance data if available */}
                        {question.metadata && (
                          <View style={styles.studentPerformanceQuestionMetadata}>
                            <Text style={styles.studentPerformanceQuestionMetadataTitle}>Performance Data:</Text>
                            <View style={styles.studentPerformanceQuestionMetadataRow}>
                              <Text style={styles.studentPerformanceQuestionMetadataText}>
                                Difficulty: {question.metadata.difficulty || 'medium'}
                              </Text>
                              <Text style={styles.studentPerformanceQuestionMetadataText}>
                                Complexity: {question.metadata.questionComplexity || 'medium'}
                              </Text>
                            </View>
                            {question.metadata.topicTags && question.metadata.topicTags.length > 0 && (
                              <Text style={styles.studentPerformanceQuestionMetadataText}>
                                Topics: {question.metadata.topicTags.join(', ')}
                              </Text>
                            )}
                          </View>
                        )}
                        
                        {/* Show time breakdown if available */}
                        {question.timeBreakdown && (
                          <View style={styles.studentPerformanceQuestionTimeBreakdown}>
                            <Text style={styles.studentPerformanceQuestionTimeBreakdownTitle}>Time Breakdown:</Text>
                            <View style={styles.studentPerformanceQuestionTimeBreakdownRow}>
                              <Text style={styles.studentPerformanceQuestionTimeBreakdownText}>
                                Reading: {Math.round((question.timeBreakdown.readingTime || 0) / 1000)}s
                              </Text>
                              <Text style={styles.studentPerformanceQuestionTimeBreakdownText}>
                                Thinking: {Math.round((question.timeBreakdown.thinkingTime || 0) / 1000)}s
                              </Text>
                            </View>
                            <View style={styles.studentPerformanceQuestionTimeBreakdownRow}>
                              <Text style={styles.studentPerformanceQuestionTimeBreakdownText}>
                                Answering: {Math.round((question.timeBreakdown.answeringTime || 0) / 1000)}s
                              </Text>
                              <Text style={styles.studentPerformanceQuestionTimeBreakdownText}>
                                Reviewing: {Math.round((question.timeBreakdown.reviewingTime || 0) / 1000)}s
                              </Text>
                            </View>
                          </View>
                        )}
                        
                        {/* Show class averages for this question */}
                        {classAverages?.questionAverages?.[question.questionId] && (
                          <View style={styles.studentPerformanceQuestionClassAverages}>
                            <Text style={styles.studentPerformanceQuestionClassAveragesTitle}>Class Average:</Text>
                            <View style={styles.studentPerformanceQuestionClassAveragesRow}>
                              <Text style={styles.studentPerformanceQuestionClassAveragesText}>
                                Time: {Math.round(classAverages.questionAverages[question.questionId].averageTime / 1000)}s
                              </Text>
                              <Text style={styles.studentPerformanceQuestionClassAveragesText}>
                                Attempts: {Math.round(classAverages.questionAverages[question.questionId].averageAttempts)}
                              </Text>
                            </View>
                          </View>
                        )}
                      </View>
                    ))}
                  </View>
                )}

                {/* Class Comparison */}
                {classAverages && (
                  <View style={styles.studentPerformanceComparisonCard}>
                    <Text style={styles.studentPerformanceCardTitle}>Class Comparison</Text>
                    <View style={styles.studentPerformanceDisclaimerContainer}>
                      <MaterialCommunityIcons name="information" size={14} color="#6b7280" />
                      <Text style={styles.studentPerformanceDisclaimerText}>
                        Averages update as more students complete this activity
                      </Text>
                    </View>
                    <View style={styles.studentPerformanceComparisonRow}>
                      <View style={styles.studentPerformanceComparisonItem}>
                        <Text style={styles.studentPerformanceComparisonLabel}>Student Score</Text>
                        <Text style={styles.studentPerformanceComparisonValue}>
                          {studentPerformanceData?.studentResult?.scorePercentage || 0}%
                        </Text>
                      </View>
                      <View style={styles.studentPerformanceComparisonItem}>
                        <Text style={styles.studentPerformanceComparisonLabel}>Class Average</Text>
                        <Text style={styles.studentPerformanceComparisonValue}>
                          {Math.round(classAverages.averageScore)}%
                        </Text>
                      </View>
                    </View>
                    <View style={styles.studentPerformanceComparisonRow}>
                      <View style={styles.studentPerformanceComparisonItem}>
                        <Text style={styles.studentPerformanceComparisonLabel}>Student Time</Text>
                        <Text style={styles.studentPerformanceComparisonValue}>
                          {Math.round((studentPerformanceData?.studentResult?.totalTimeSpent || 0) / 1000)}s
                        </Text>
                      </View>
                      <View style={styles.studentPerformanceComparisonItem}>
                        <Text style={styles.studentPerformanceComparisonLabel}>Class Average</Text>
                        <Text style={styles.studentPerformanceComparisonValue}>
                          {Math.round(classAverages.averageTime / 1000)}s
                        </Text>
                      </View>
                    </View>
                  </View>
                )}
            </ScrollView>
          ) : (
            <View style={styles.studentPerformanceFullScreenNoData}>
              <Text style={styles.studentPerformanceNoDataText}>No performance data available</Text>
            </View>
          )}
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
    minHeight: height,
  },
  backgroundPattern: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#f8fafc',
    opacity: 0.1,
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: Math.min(20, width * 0.05),
    paddingTop: Math.min(60, height * 0.08),
    paddingBottom: Math.min(100, height * 0.12),
  },
  
  // Header Styles
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    paddingHorizontal: 0,
    paddingVertical: 12,
  },
  avatarContainer: {
    marginRight: 16,
  },
  avatar: {
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
  
  // Announcement Card Styles
  announcementCard: {
    borderRadius: 20,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
    overflow: 'hidden',
  },
  announcementGradient: {
    backgroundColor: '#f0f9ff',
    padding: 24,
    position: 'relative',
  },
  announcementHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  megaphoneIcon: {
    marginRight: 16,
  },
  announcementTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1e293b',
  },
  announcementText: {
    fontSize: 15,
    color: '#64748b',
    lineHeight: 22,
    marginBottom: 20,
  },
  editButton: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1e293b',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  
  // Action Buttons Styles
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 28,
  },
  actionCard: {
    flex: 1,
    borderRadius: 20,
    marginHorizontal: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
    overflow: 'hidden',
  },
  actionGradient1: {
    backgroundColor: '#f0f9ff',
    padding: 24,
    alignItems: 'center',
  },
  actionGradient2: {
    backgroundColor: '#f8fafc',
    padding: 24,
    alignItems: 'center',
  },
  actionIcon: {
    marginBottom: 16,
  },
  actionText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
  },
  
  
  // Classrooms Section Styles
  classroomsSection: {
    marginBottom: 100, // Space for bottom nav
  },
  classHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  headerActions: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    maxWidth: '60%',
    flexWrap: 'wrap',
  },
  sectionTitle: {
    fontSize: Math.max(18, Math.min(22, width * 0.055)),
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: Math.min(20, height * 0.025),
    paddingHorizontal: Math.min(16, width * 0.04),
  },
  classroomCard: {
    backgroundColor: '#ffffff',
    borderRadius: Math.min(20, width * 0.05),
    padding: Math.min(24, width * 0.06),
    marginHorizontal: Math.min(16, width * 0.04),
    marginBottom: Math.min(16, height * 0.02),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    width: width - Math.min(32, width * 0.08),
    alignSelf: 'center',
  },
  classroomHeader: {
    marginBottom: 16,
  },
  classroomTitle: {
    fontSize: Math.max(16, Math.min(20, width * 0.05)),
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: Math.min(6, height * 0.008),
  },
  classroomSubtitle: {
    fontSize: Math.max(13, Math.min(15, width * 0.037)),
    color: '#64748b',
    marginBottom: Math.min(4, height * 0.005),
    fontWeight: '500',
  },
  classroomYear: {
    fontSize: Math.max(12, Math.min(14, width * 0.035)),
    color: '#64748b',
    fontWeight: '500',
  },
  classMetricsContainer: {
    marginTop: 6,
    padding: 12,
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  classMetricItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 6,
  },
  classMetricLabel: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '500',
    minWidth: 80,
  },
  classMetricValue: {
    fontSize: 12,
    color: '#1e293b',
    fontWeight: '600',
    flex: 1,
  },
  exerciseStatusContainer: {
    marginLeft: 'auto',
  },
  exerciseStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Math.min(12, width * 0.03),
    paddingVertical: Math.min(6, height * 0.008),
    borderRadius: Math.min(16, width * 0.04),
    gap: Math.min(6, width * 0.015),
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  exerciseStatusText: {
    fontSize: Math.max(11, Math.min(13, width * 0.032)),
    color: '#ffffff',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  exerciseHeader: {
    marginBottom: Math.min(16, height * 0.02),
  },
  exerciseTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Math.min(12, height * 0.015),
    paddingHorizontal: Math.min(4, width * 0.01),
  },
  exerciseTitle: {
    fontSize: Math.max(18, Math.min(20, width * 0.05)),
    fontWeight: '700',
    color: '#1e293b',
    flex: 1,
    marginLeft: Math.min(8, width * 0.02),
  },
  performanceSummaryCard: {
    backgroundColor: '#ffffff',
    borderRadius: Math.min(8, width * 0.02),
    padding: Math.min(12, width * 0.03),
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  performanceSummaryTitle: {
    fontSize: Math.max(14, Math.min(16, width * 0.04)),
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: Math.min(8, height * 0.01),
    textAlign: 'center',
  },
  performanceMetricsGrid: {
    gap: Math.min(8, height * 0.01),
  },
  performanceMetric: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Math.min(6, height * 0.008),
    paddingHorizontal: Math.min(8, width * 0.02),
    backgroundColor: '#f8fafc',
    borderRadius: Math.min(6, width * 0.015),
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  metricIconContainer: {
    width: Math.min(28, width * 0.07),
    height: Math.min(28, width * 0.07),
    borderRadius: Math.min(14, width * 0.035),
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Math.min(8, width * 0.02),
  },
  metricContent: {
    flex: 1,
  },
  metricLabel: {
    fontSize: Math.max(11, Math.min(13, width * 0.032)),
    color: '#64748b',
    fontWeight: '600',
    marginBottom: Math.min(2, height * 0.003),
  },
  metricValue: {
    fontSize: Math.max(13, Math.min(15, width * 0.037)),
    color: '#1e293b',
    fontWeight: '700',
  },
  studentResultsContainer: {
    marginTop: Math.min(8, height * 0.01),
  },
  studentResultsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Math.min(6, height * 0.008),
  },
  studentResultsTitle: {
    fontSize: Math.max(14, Math.min(16, width * 0.04)),
    fontWeight: '600',
    color: '#374151',
  },
  exportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10b981',
    paddingHorizontal: Math.min(12, width * 0.03),
    paddingVertical: Math.min(6, height * 0.008),
    borderRadius: Math.min(6, width * 0.015),
    gap: Math.min(4, width * 0.01),
  },
  exportButtonText: {
    color: '#ffffff',
    fontSize: Math.max(11, Math.min(12, width * 0.03)),
    fontWeight: '600',
  },
  moreButton: {
    position: 'absolute',
    top: 0,
    right: 0,
    padding: 6,
    borderRadius: 12,
  },
  moreMenu: {
    position: 'absolute',
    top: 28,
    right: 0,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    paddingVertical: 6,
    paddingHorizontal: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 6,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    zIndex: 10,
  },
  moreMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    gap: 8,
  },
  moreMenuText: {
    color: '#1e293b',
    fontSize: 14,
    fontWeight: '600',
  },
  
  // Analytics Styles
  analyticsContainer: {
    marginTop: 20,
  },
  analyticsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  analyticsTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1e293b',
  },
  viewAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#f1f5f9',
    borderRadius: 16,
  },
  viewAllText: {
    fontSize: 14,
    color: '#3b82f6',
    fontWeight: '600',
    marginRight: 4,
  },
  analyticsCards: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  addStudentBtn: {
    alignSelf: 'auto',
    backgroundColor: '#3b82f6',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  addStudentBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  closeClassBtn: {
    alignSelf: 'flex-start',
    backgroundColor: '#ef4444',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginBottom: 8,
  },
  closeClassBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  analyticsCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    marginHorizontal: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  analyticsIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#f8fafc',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  analyticsContent: {
    flex: 1,
  },
  analyticsLabel: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 4,
    fontWeight: '500',
  },
  analyticsValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 4,
  },
  analyticsChange: {
    fontSize: 12,
    color: '#10b981',
    fontWeight: '500',
  },
  quickStats: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '500',
  },
  statDivider: {
    width: 1,
    backgroundColor: '#e2e8f0',
    marginHorizontal: 16,
  },
  
  // Bottom Navigation Styles
  bottomNav: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    paddingVertical: 16,
    paddingHorizontal: 20,
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
    // Active state styling
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
  studentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  studentHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  studentIndex: {
    width: 28,
    color: '#64748b',
    fontWeight: '700',
    textAlign: 'left',
  },
  studentName: {
    flex: 1,
    color: '#111827',
    marginLeft: 6,
  },
  studentCode: {
    color: '#2563eb',
    fontWeight: '600',
  },
  studentActionsWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconBtn: {
    padding: 6,
    borderRadius: 8,
  },
  statusPillActive: {
    backgroundColor: '#dcfce7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusPillInactive: {
    backgroundColor: '#fee2e2',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusText: {
    color: '#111827',
    fontSize: 12,
    fontWeight: '700',
  },
  exportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ef4444',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  exportBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  // Loading Styles
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  loadingText: {
    fontSize: 18,
    color: '#64748b',
    fontWeight: '500',
  },
  // Avatar Image Styles
  avatarImage: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 3,
    borderColor: '#e2e8f0',
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  profileModal: {
    width: '100%',
    maxWidth: 500,
    maxHeight: '90%',
    backgroundColor: '#ffffff',
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 25,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  closeButton: {
    padding: 5,
  },
  profileContent: {
    maxHeight: 400,
    paddingHorizontal: 20,
  },
  // Profile Picture Section
  profilePictureSection: {
    alignItems: 'center',
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    marginBottom: 20,
  },
  profilePicture: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    borderColor: '#e2e8f0',
  },
  profilePicturePlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#e2e8f0',
  },
  changePhotoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3b82f6',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginTop: 10,
  },
  changePhotoText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
  },
  // Info Section
  infoSection: {
    paddingBottom: 20,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  infoLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    flex: 1,
  },
  infoValue: {
    fontSize: 16,
    color: '#1e293b',
    flex: 2,
    textAlign: 'right',
  },
  infoInput: {
    fontSize: 16,
    color: '#1e293b',
    flex: 2,
    textAlign: 'right',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#f9fafb',
  },
  // Elegant form styles (Add Class modal)
  field: {
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 13,
    color: '#475569',
    fontWeight: '700',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  fieldInput: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#111827',
    fontSize: 16,
  },
  segmentWrap: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
    padding: 4,
    gap: 6,
  },
  segmentButton: {
    flex: 1,
    borderRadius: 8,
    alignItems: 'center',
    paddingVertical: 8,
  },
  segmentActive: {
    backgroundColor: '#2563eb',
  },
  segmentText: {
    color: '#64748b',
    fontSize: 14,
    fontWeight: '700',
  },
  segmentTextActive: {
    color: '#ffffff',
  },
  readonlyBox: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    alignItems: 'flex-end',
  },
  readonlyText: {
    color: '#111827',
    fontSize: 16,
  },
  yearButton: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  yearButtonText: {
    color: '#111827',
    fontSize: 16,
  },
  yearMenu: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    maxHeight: 180,
  },
  yearOption: {
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  yearOptionSelected: {
    backgroundColor: '#eff6ff',
  },
  yearOptionText: {
    fontSize: 16,
    color: '#111827',
    textAlign: 'right',
  },
  // Modal Actions
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  editProfileButton: {
    flex: 1,
    backgroundColor: '#3b82f6',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginRight: 10,
  },
  editProfileButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  closeModalButton: {
    flex: 1,
    backgroundColor: '#6b7280',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginLeft: 10,
  },
  closeModalButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#ef4444',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginRight: 10,
  },
  cancelButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  saveButton: {
    flex: 1,
    backgroundColor: '#10b981',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginLeft: 10,
  },
  saveButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  
  // Exercises Library Styles
  exercisesSection: {
    paddingBottom: 100,
  },
  exercisesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  exercisesTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1e293b',
  },
  exercisesActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  refreshButton: {
    padding: 8,
    borderRadius: 8,
  },
  searchButton: {
    padding: 8,
    borderRadius: 8,
  },
  moreOptionsButton: {
    padding: 8,
    borderRadius: 8,
  },
  exercisesTabs: {
    flexDirection: 'row',
    marginBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  exercisesTab: {
    paddingBottom: 12,
    marginRight: 24,
  },
  exercisesTabActive: {
    borderBottomWidth: 2,
    borderBottomColor: '#1e293b',
  },
  exercisesTabText: {
    fontSize: 16,
    color: '#64748b',
    fontWeight: '500',
  },
  exercisesTabTextActive: {
    color: '#1e293b',
    fontWeight: '700',
  },
  exerciseCardsContainer: {
    marginBottom: 24,
  },
  exerciseCard: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  exerciseIcon: {
    marginRight: 16,
  },
  exerciseIconBackground: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#fef3c7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  exerciseContent: {
    flex: 1,
  },
  exerciseDescription: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 8,
  },
  exerciseStats: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  exerciseStat: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '500',
  },
  exerciseStatSeparator: {
    fontSize: 12,
    color: '#64748b',
    marginHorizontal: 8,
  },
  exerciseOptions: {
    padding: 8,
    borderRadius: 8,
  },
  addExerciseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f1f5f9',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 20,
    marginTop: 20,
  },
  addExerciseIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#3b82f6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  addExerciseText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
  },
  
  // Filter and Search Styles
  filterContainer: {
    marginBottom: 20,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#1e293b',
    marginLeft: 8,
  },
  categoryFilterContainer: {
    marginBottom: 8,
  },
  categoryScrollView: {
    maxHeight: 50,
  },
  categoryScrollContent: {
    paddingHorizontal: 4,
    alignItems: 'center',
    paddingVertical: 4,
  },
  categoryFilterButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f1f5f9',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    minWidth: 80,
    alignItems: 'center',
  },
  categoryFilterButtonActive: {
    backgroundColor: '#7c3aed',
    borderColor: '#7c3aed',
  },
  categoryFilterText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#64748b',
  },
  categoryFilterTextActive: {
    color: '#ffffff',
  },
  
  // Category Section Styles
  categorySection: {
    marginBottom: 24,
  },
  categoryHeader: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  
  // Exercise Card Content Styles
  exerciseCardContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  // Top Right Category Badge
  categoryBadgeTopRight: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: '#7c3aed',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    zIndex: 1,
  },
  // Exercise Title Row Styles (deprecated - keeping for compatibility)
  categoryBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#ffffff',
  },
  
  // Empty State Styles
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  emptyStateText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginTop: 12,
    textAlign: 'center',
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 4,
    textAlign: 'center',
    lineHeight: 20,
  },
  
  // Exercise Meta Styles
  exerciseMeta: {
    marginTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  exerciseCreator: {
    fontSize: 10,
    color: '#6b7280',
    fontWeight: '500',
  },
  exerciseDate: {
    fontSize: 10,
    color: '#9ca3af',
    textAlign: 'right',
  },
  
  // Exercise Actions Styles
  exerciseActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  assignButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10b981',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  // Bottom assign button styles
  exerciseBottomActions: {
    marginTop: 12,
    alignItems: 'flex-start',
  },
  assignButtonBottom: {
    backgroundColor: '#10b981',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  assignButtonText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '600',
    marginLeft: 4,
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3b82f6',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  copyButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
  },
  
  // Assignment Card Styles
  assignmentCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  assignmentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  assignmentInfo: {
    flex: 1,
  },
  assignmentTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 4,
  },
  assignmentClass: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '500',
  },
  assignmentOptions: {
    flexDirection: 'row',
    gap: 8,
  },
  assignmentActionButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  
  // Status Toggle Styles
  statusToggleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    marginRight: 8,
    gap: 4,
  },
  statusToggleButtonClosed: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
  },
  statusToggleText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#15803d',
  },
  statusToggleTextClosed: {
    color: '#dc2626',
  },
  assignmentDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  assignmentDetail: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  assignmentDetailText: {
    fontSize: 12,
    color: '#64748b',
    marginLeft: 6,
  },

  // Assignment Stats Styles
  assignmentStats: {
    marginVertical: 12,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#f1f5f9',
  },
  completionStats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 8,
    backgroundColor: '#f8fafc',
  },
  completionIcon: {
    marginRight: 8,
  },
  completionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
    flex: 1,
  },
  completionBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    minWidth: 40,
    alignItems: 'center',
  },
  completionPercentage: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
  },
  progressBarContainer: {
    marginTop: 4,
  },
  progressBar: {
    height: 6,
    backgroundColor: '#e2e8f0',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  timeRemainingDetail: {
    marginTop: 4,
  },

  // Assignment Modal Styles
  assignmentModalContainer: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  assignmentModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  assignmentModalCloseButton: {
    padding: 4,
  },
  assignmentModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
  },
  assignmentModalPlaceholder: {
    width: 32,
  },
  assignmentModalContent: {
    flex: 1,
    paddingHorizontal: 20,
  },
  assignmentModalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    backgroundColor: '#ffffff',
  },

  // Edit Assignment Modal Styles
  editAssignmentForm: {
    paddingVertical: 20,
  },
  editAssignmentTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 24,
  },
  editInputGroup: {
    marginBottom: 20,
  },
  editInputLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 8,
  },
  classDisplay: {
    fontSize: 16,
    color: '#64748b',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  inputNote: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 4,
    fontStyle: 'italic',
  },
  
  // Edit Modal Settings Styles
  editSettingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  editSettingInfo: {
    flex: 1,
    marginRight: 16,
  },
  editSettingTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 4,
  },
  editSettingDescription: {
    fontSize: 14,
    color: '#64748b',
    lineHeight: 20,
  },
  
  // Edit Modal Toggle Styles
  editToggle: {
    width: 48,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#d1d5db',
    padding: 2,
    justifyContent: 'center',
  },
  editToggleActive: {
    backgroundColor: '#3b82f6',
  },
  editToggleThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  editToggleThumbActive: {
    transform: [{ translateX: 20 }],
  },
  dateTimeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  dateTimeText: {
    flex: 1,
    fontSize: 16,
    color: '#1e293b',
    marginLeft: 12,
  },
  editAssignmentInfo: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
  },
  editInfoLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 8,
  },
  editInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  editInfoValue: {
    fontSize: 14,
    color: '#64748b',
  },
  currentDeadlineDisplay: {
    backgroundColor: '#eff6ff',
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#3b82f6',
  },
  currentDeadlineLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1e40af',
    marginBottom: 4,
  },
  currentDeadlineText: {
    fontSize: 14,
    color: '#1e40af',
    fontWeight: '500',
  },

  // Simple Date/Time Input Styles
  simpleDateTimeContainer: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  simpleDateTimeLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 12,
  },
  simpleDateTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  simpleDateTimeText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#64748b',
    width: 60,
  },
  simpleDateTimeInput: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: '#1e293b',
  },

  // Custom Date/Time Picker Modal Styles
  customDateTimeModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 40,
  },
  customDateTimeModal: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#ffffff',
    borderRadius: 20,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 25,
  },
  customDateTimeModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  customDateTimeModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1e293b',
  },
  customDateTimeModalCloseButton: {
    padding: 4,
  },
  customDateTimeModalContent: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  customDateTimeSection: {
    marginBottom: 24,
  },
  customDateTimeLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 12,
  },
  customDateTimeInputs: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  customDateTimeInputGroup: {
    flex: 1,
    marginHorizontal: 4,
  },
  customDateTimeInputLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#64748b',
    marginBottom: 6,
    textAlign: 'center',
  },
  customDateTimeInput: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: '#1e293b',
    textAlign: 'center',
    fontWeight: '600',
  },
  customDateTimeToggle: {
    backgroundColor: '#3b82f6',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  customDateTimeToggleText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  customDateTimePreview: {
    backgroundColor: '#eff6ff',
    borderRadius: 8,
    padding: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#3b82f6',
  },
  customDateTimePreviewLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1e40af',
    marginBottom: 4,
  },
  customDateTimePreviewText: {
    fontSize: 14,
    color: '#1e40af',
    fontWeight: '500',
  },
  customDateTimeModalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  customDateTimeCancelButton: {
    flex: 1,
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginRight: 8,
  },
  customDateTimeCancelButtonText: {
    color: '#64748b',
    fontSize: 16,
    fontWeight: '600',
  },
  customDateTimeConfirmButton: {
    flex: 1,
    backgroundColor: '#3b82f6',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginLeft: 8,
  },
  customDateTimeConfirmButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },

  // Delete Assignment Modal Styles
  deleteModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  deleteModal: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 25,
  },
  deleteModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  deleteModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
    marginLeft: 12,
  },
  deleteModalContent: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  deleteModalText: {
    fontSize: 16,
    color: '#1e293b',
    marginBottom: 16,
    lineHeight: 24,
  },
  deleteAssignmentInfo: {
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  deleteAssignmentTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 4,
  },
  deleteAssignmentClass: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 4,
  },
  deleteAssignmentDeadline: {
    fontSize: 14,
    color: '#64748b',
  },
  deleteWarningText: {
    fontSize: 14,
    color: '#ef4444',
    fontStyle: 'italic',
  },
  deleteModalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  deleteCancelButton: {
    flex: 1,
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  deleteCancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#64748b',
  },
  deleteConfirmButton: {
    flex: 1,
    backgroundColor: '#ef4444',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginLeft: 8,
  },
  deleteConfirmButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  editCancelButton: {
    flex: 1,
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  editCancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#64748b',
  },
  editSaveButton: {
    flex: 1,
    backgroundColor: '#3b82f6',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginLeft: 8,
  },
  editSaveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  buttonDisabled: {
    backgroundColor: '#9ca3af',
  },

  // Student Status Modal Styles
  studentStatusModalContainer: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  studentStatusModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  studentStatusModalCloseButton: {
    padding: 4,
  },
  studentStatusModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
  },
  studentStatusModalPlaceholder: {
    width: 32,
  },
  studentStatusModalContent: {
    flex: 1,
    paddingHorizontal: 20,
  },
  studentStatusModalActions: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    backgroundColor: '#ffffff',
  },
  studentStatusCloseButton: {
    backgroundColor: '#3b82f6',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  studentStatusCloseButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },

  // Student Status Content Styles
  studentStatusHeader: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 16,
    marginVertical: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#3b82f6',
  },
  studentStatusAssignmentTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 4,
  },
  studentStatusClass: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 4,
  },
  studentStatusDeadline: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '500',
  },
  studentListContainer: {
    marginBottom: 20,
  },
  studentListTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 4,
  },
  studentListSubtitle: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 12,
    fontStyle: 'italic',
  },
  studentStatusItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  studentInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  studentAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#3b82f6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  studentAvatarText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
  },
  studentDetails: {
    flex: 1,
  },
  studentStatusName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 2,
  },
  studentId: {
    fontSize: 12,
    color: '#64748b',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  studentStatusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ffffff',
    marginLeft: 4,
  },
  
  // Exercise Results Styles
  resultItem: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  resultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  resultTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
    flex: 1,
    marginRight: 12,
  },
  resultScore: {
    fontSize: 18,
    fontWeight: '700',
    color: '#059669',
  },
  resultDetails: {
    marginBottom: 12,
  },
  resultDetailText: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 4,
  },
  resultProgress: {
    marginTop: 8,
  },
  resultProgressBar: {
    height: 6,
    backgroundColor: '#e2e8f0',
    borderRadius: 3,
    overflow: 'hidden',
  },
  resultProgressFill: {
    height: '100%',
    backgroundColor: '#059669',
    borderRadius: 3,
  },
  
  // Enhanced Results Visualization Styles
  resultsOverviewCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  resultsOverviewTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 16,
  },
  resultsOverviewStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  resultsOverviewStat: {
    alignItems: 'center',
  },
  resultsOverviewStatValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#3b82f6',
    marginBottom: 4,
  },
  resultsOverviewStatLabel: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
  },
  classPerformanceSummary: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  classPerformanceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  classPerformanceText: {
    fontSize: 14,
    color: '#475569',
    marginLeft: 8,
    fontWeight: '500',
  },
  emptyResultsCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderStyle: 'dashed',
  },
  emptyResultsText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#64748b',
    marginTop: 12,
    marginBottom: 4,
  },
  emptyResultsSubtext: {
    fontSize: 14,
    color: '#94a3b8',
    textAlign: 'center',
  },
  resultsList: {
    marginTop: 12,
  },
  resultStudentInfo: {
    flex: 1,
  },
  resultStudentName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 2,
  },
  resultExerciseTitle: {
    fontSize: 14,
    color: '#64748b',
  },
  resultScoreContainer: {
    alignItems: 'flex-end',
  },
  resultRank: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
    fontWeight: '500',
  },
  resultDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  
  // Enhanced Results Table Styles
  exerciseResultsSection: {
    marginBottom: 12,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  exerciseTableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f9ff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  exerciseTableTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e40af',
    marginLeft: 8,
    flex: 1,
  },
  resultsTableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    paddingHorizontal: Math.min(16, width * 0.04),
    paddingVertical: Math.min(14, height * 0.018),
    borderBottomWidth: 2,
    borderBottomColor: '#e2e8f0',
    minWidth: width < 400 ? width * 0.8 : 'auto',
    borderRadius: Math.min(8, width * 0.02),
    marginBottom: Math.min(4, height * 0.005),
  },
  tableHeaderText: {
    fontSize: Math.max(12, Math.min(14, width * 0.035)),
    fontWeight: '700',
    color: '#374151',
    textAlign: 'center',
  },
  
  sortableHeaderCell: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    flex: 1.5,
  },
  
  activeSort: {
    color: '#3b82f6',
    fontWeight: '700',
  },
  resultsTableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Math.min(12, width * 0.03),
    paddingVertical: Math.min(8, height * 0.01),
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    minWidth: width < 400 ? width * 0.8 : 'auto',
    backgroundColor: '#ffffff',
    marginBottom: Math.min(1, height * 0.001),
    borderRadius: Math.min(4, width * 0.01),
  },
  tableRowText: {
    fontSize: Math.max(12, Math.min(14, width * 0.035)),
    color: '#1e293b',
    textAlign: 'center',
  },
  studentNameCell: {
    textAlign: 'left',
    fontWeight: '600',
  },
  tableScrollContainer: {
    maxHeight: height * 0.4,
  },
  tableContainer: {
    minWidth: width < 400 ? width * 0.8 : 'auto',
  },
  scoreCell: {
    fontWeight: '700',
  },
  rankCell: {
    fontWeight: '600',
    color: '#64748b',
  },
  
  // Student menu dropdown styles
  studentMenuDropdown: {
    position: 'absolute',
    top: 30,
    right: 0,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    paddingVertical: 4,
    minWidth: 160,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
    zIndex: 1000,
  },
  studentMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  studentMenuItemDanger: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(239, 68, 68, 0.1)',
  },
  studentMenuText: {
    marginLeft: 8,
    fontSize: 14,
    color: '#374151',
    fontWeight: '500',
  },
  studentMenuTextDanger: {
    color: '#ef4444',
  },
  
  // Parent info modal styles
  parentInfoModal: {
    width: '90%',
    maxWidth: 500,
    maxHeight: '85%',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 25,
  },
  parentInfoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  parentInfoCloseButton: {
    padding: 4,
  },
  parentInfoTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  parentInfoPlaceholder: {
    width: 32,
  },
  parentInfoContent: {
    maxHeight: 400,
    paddingHorizontal: 20,
  },
  parentInfoSection: {
    marginVertical: 16,
  },
  parentInfoSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.1)',
    paddingBottom: 4,
  },
  parentInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
    paddingVertical: 4,
  },
  parentInfoLabel: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '500',
    flex: 1,
  },
  parentInfoValue: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '400',
    flex: 2,
    textAlign: 'right',
  },
  parentInfoCodeValue: {
    fontFamily: 'monospace',
    fontSize: 16,
    fontWeight: 'bold',
    color: '#059669',
    backgroundColor: 'rgba(5, 150, 105, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  parentInfoStatusCompleted: {
    color: '#059669',
    fontWeight: '600',
  },
  parentInfoStatusPending: {
    color: '#f59e0b',
    fontWeight: '600',
  },
  parentInfoImageContainer: {
    flex: 2,
    alignItems: 'flex-end',
  },
  parentInfoImage: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2,
    borderColor: 'rgba(0,0,0,0.1)',
  },
  parentInfoPendingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    padding: 16,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#f59e0b',
  },
  parentInfoPendingText: {
    marginLeft: 12,
    fontSize: 14,
    color: '#92400e',
    lineHeight: 20,
    flex: 1,
  },
  parentInfoActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.1)',
  },
  parentInfoCloseActionButton: {
    backgroundColor: '#3b82f6',
    borderRadius: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    minWidth: 100,
    alignItems: 'center',
  },
  parentInfoCloseActionButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  
  // Student Performance Modal Styles - Full Screen (Updated)
  studentPerformanceFullScreenContainer: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  studentPerformanceFullScreenHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingTop: 50, // Account for status bar
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
  },
  studentPerformanceHeaderContent: {
    flex: 1,
  },
  studentPerformanceFullScreenTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 4,
  },
  studentPerformanceStudentName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#6b7280',
  },
  studentPerformanceCloseButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
  },
  studentPerformanceFullScreenContent: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  studentPerformanceFullScreenLoading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  studentPerformanceLoadingText: {
    fontSize: 16,
    color: '#6b7280',
  },
  studentPerformanceFullScreenNoData: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  studentPerformanceNoDataText: {
    fontSize: 16,
    color: '#6b7280',
  },
  studentPerformanceSection: {
    marginBottom: 20,
  },
  studentPerformanceSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 12,
  },
  studentPerformanceInfo: {
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    padding: 16,
  },
  studentPerformanceName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 4,
  },
  studentPerformanceExercise: {
    fontSize: 14,
    color: '#64748b',
  },
  studentPerformanceCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
  },
  studentPerformanceCardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 16,
  },
  studentPerformanceScoreContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  studentPerformanceScoreText: {
    fontSize: 48,
    fontWeight: '700',
    color: '#3b82f6',
    marginBottom: 4,
  },
  studentPerformanceScoreLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 4,
  },
  studentPerformanceScoreNote: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
  },
  studentPerformanceStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  studentPerformanceStatItem: {
    alignItems: 'center',
  },
  studentPerformanceStatValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 4,
  },
  studentPerformanceStatLabel: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
  },
  studentPerformanceRankingCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
  },
  studentPerformanceMetrics: {
    marginBottom: 20,
  },
  studentPerformanceMetricItem: {
    marginBottom: 16,
  },
  studentPerformanceMetricLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 4,
  },
  studentPerformanceMetricValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 2,
  },
  studentPerformanceMetricComparison: {
    fontSize: 12,
    color: '#64748b',
  },
  studentPerformanceOverallScore: {
    alignItems: 'center',
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  studentPerformanceOverallScoreLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  studentPerformanceOverallScoreValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 4,
  },
  studentPerformanceLevelText: {
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  studentPerformanceActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  studentPerformanceCloseActionButton: {
    backgroundColor: '#3b82f6',
    borderRadius: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    minWidth: 100,
    alignItems: 'center',
  },
  studentPerformanceCloseActionButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  
  // Analysis Card Styles
  studentPerformanceAnalysisCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
  },
  studentPerformanceAnalysisItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  studentPerformanceAnalysisText: {
    flex: 1,
    fontSize: 14,
    color: '#374151',
    marginLeft: 12,
    lineHeight: 20,
  },
  studentPerformanceTimeAnalysisText: {
    fontSize: 14,
    color: '#374151',
    marginBottom: 8,
    lineHeight: 20,
  },
  studentPerformanceTimeComparison: {
    backgroundColor: '#eff6ff',
    borderRadius: 8,
    padding: 12,
  },
  studentPerformanceTimeComparisonText: {
    fontSize: 12,
    color: '#1e40af',
    fontWeight: '600',
  },
  studentPerformanceEncouragementCard: {
    backgroundColor: '#fef2f2',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
  },
  studentPerformanceEncouragementText: {
    flex: 1,
    fontSize: 14,
    color: '#dc2626',
    marginLeft: 12,
    fontWeight: '500',
    lineHeight: 20,
  },
  
  // Class Comparison Styles
  studentPerformanceComparisonCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
  },
  studentPerformanceDisclaimerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    padding: 8,
  },
  studentPerformanceDisclaimerText: {
    fontSize: 12,
    color: '#6b7280',
    marginLeft: 8,
    flex: 1,
  },
  studentPerformanceComparisonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  studentPerformanceComparisonItem: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 12,
    marginHorizontal: 4,
  },
  studentPerformanceComparisonLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 4,
    fontWeight: '500',
  },
  studentPerformanceComparisonValue: {
    fontSize: 16,
    color: '#1e293b',
    fontWeight: '700',
  },
  
  // Question Details Styles
  studentPerformanceQuestionDetailsCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
  },
  studentPerformanceQuestionDetailItem: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  studentPerformanceQuestionDetailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  studentPerformanceQuestionNumber: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
  },
  studentPerformanceQuestionStatus: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  studentPerformanceQuestionStatusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ffffff',
  },
  studentPerformanceQuestionInfo: {
    marginBottom: 8,
  },
  studentPerformanceQuestionInfoLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
    marginBottom: 2,
  },
  studentPerformanceQuestionInfoValue: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
  },
  studentPerformanceQuestionDetailStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  studentPerformanceQuestionDetailStat: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
  },
  studentPerformanceQuestionMetadata: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  studentPerformanceQuestionMetadataTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
    marginBottom: 8,
  },
  studentPerformanceQuestionMetadataRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  studentPerformanceQuestionMetadataText: {
    fontSize: 12,
    color: '#374151',
  },
  studentPerformanceQuestionTimeBreakdown: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  studentPerformanceQuestionTimeBreakdownTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
    marginBottom: 8,
  },
  studentPerformanceQuestionTimeBreakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  studentPerformanceQuestionTimeBreakdownText: {
    fontSize: 12,
    color: '#374151',
  },
  studentPerformanceQuestionClassAverages: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    backgroundColor: '#f1f5f9',
    borderRadius: 6,
    padding: 8,
  },
  studentPerformanceQuestionClassAveragesTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
    marginBottom: 8,
  },
  studentPerformanceQuestionClassAveragesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  studentPerformanceQuestionClassAveragesText: {
    fontSize: 12,
    color: '#374151',
    fontWeight: '500',
  },
  
});