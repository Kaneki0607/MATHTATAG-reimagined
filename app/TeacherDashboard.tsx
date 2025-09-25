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
  View
} from 'react-native';
import { onAuthChange, signOutUser } from '../lib/firebase-auth';
import { deleteData, pushData, readData, updateData, writeData } from '../lib/firebase-database';
import { uploadFile } from '../lib/firebase-storage';

const { width, height } = Dimensions.get('window');

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
  // List modal state
  const [showListModal, setShowListModal] = useState(false);
  const [studentsByClass, setStudentsByClass] = useState<Record<string, any[]>>({});
  const [parentsById, setParentsById] = useState<Record<string, any>>({});
  const [assignmentsByClass, setAssignmentsByClass] = useState<Record<string, { total: number; completed: number; pending: number }>>({});
  const [classAnalytics, setClassAnalytics] = useState<Record<string, { performance?: number; change?: number }>>({});

  // Auth state
  const [currentUserId, setCurrentUserId] = useState<string | undefined>(undefined);
  // Overflow menu state per-class (three dots)
  const [openMenuClassId, setOpenMenuClassId] = useState<string | null>(null);
  // Local navigation state to keep bottom nav persistent
  const [activeTab, setActiveTab] = useState<'home' | 'list' | 'class' | 'reports'>('home');

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
      const [{ data: students }, { data: parents }] = [
        await readData('/students'),
        await readData('/parents'),
      ];
      const parentsMap: Record<string, any> = Object.entries(parents || {}).reduce((acc: any, [id, v]: any) => {
        acc[id] = { id, ...(v || {}) };
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
    } catch {
      // ignore
    }
  };

  const loadAssignments = async (classIds: string[]) => {
    try {
      const { data } = await readData('/assignments');
      const stats: Record<string, { total: number; completed: number; pending: number }> = {};
      Object.entries(data || {}).forEach(([id, v]: any) => {
        const a = { id, ...(v || {}) };
        if (!classIds.includes(a.classId)) return;
        if (!stats[a.classId]) stats[a.classId] = { total: 0, completed: 0, pending: 0 };
        stats[a.classId].total += 1;
        if (a.status === 'completed') stats[a.classId].completed += 1;
        else stats[a.classId].pending += 1;
      });
      setAssignmentsByClass(stats);
    } catch {
      setAssignmentsByClass({});
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

  const escapeHtml = (value: string) =>
    value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

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
               
              <TouchableOpacity style={styles.actionCard} onPress={() => router.push('../CreateExercise')}>
                <View style={styles.actionGradient2}>
                  <View style={styles.actionIcon}>
                    <MaterialCommunityIcons name="abacus" size={28} color="#38a169" />
                  </View>
                  <Text style={styles.actionText}>Add Exercise</Text>
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
                           <Text style={styles.statLabel}>Assignments</Text>
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
                  <>
                    <View style={styles.studentHeaderRow}>
                      <Text style={[styles.studentIndex, { width: 28 }]}>#</Text>
                      <Text style={[styles.studentName, { fontWeight: '700', color: '#374151' }]}>Student Name</Text>
                      <Text style={[styles.studentCode, { color: '#374151' }]}>Parent Access Code</Text>
                    </View>
                    {(studentsByClass[cls.id] || []).map((s: any, idx: number) => {
                      const p = s.parentId ? parentsById[s.parentId] : undefined;
                      return (
                        <View key={s.studentId} style={styles.studentRow}>
                          <Text style={styles.studentIndex}>{idx + 1}.</Text>
                          <Text style={styles.studentName}>{s.nickname}</Text>
                          <View style={styles.studentActionsWrap}>
                            <TouchableOpacity
                              accessibilityLabel="Edit student"
                              onPress={() => {
                                setSelectedClassForStudent({ id: cls.id, name: cls.name });
                                setStudentNickname(String(s.nickname || ''));
                                setStudentGender(String(s.gender || 'male') === 'female' ? 'female' : 'male');
                                setShowAddStudentModal(true);
                              }}
                              style={styles.iconBtn}
                            >
                              <MaterialIcons name="edit" size={18} color="#64748b" />
                            </TouchableOpacity>
                            <TouchableOpacity
                              accessibilityLabel="Delete student"
                              onPress={() => {
                                Alert.alert(
                                  'Delete Student',
                                  `Remove "${s.nickname}" from ${cls.name}? This cannot be undone.`,
                                  [
                                    { text: 'Cancel', style: 'cancel' },
                                    {
                                      text: 'Delete',
                                      style: 'destructive',
                                      onPress: async () => {
                                        try {
                                          await deleteData(`/students/${s.studentId}`);
                                          if (s.parentId) {
                                            // Optional: orphan parent cleanup can be handled server-side; keep code simple here
                                          }
                                          await loadStudentsAndParents([cls.id]);
                                          Alert.alert('Removed', 'Student deleted.');
                                        } catch (e) {
                                          Alert.alert('Error', 'Failed to delete student.');
                                        }
                                      },
                                    },
                                  ]
                                );
                              }}
                              style={styles.iconBtn}
                            >
                              <MaterialIcons name="delete" size={18} color="#ef4444" />
                            </TouchableOpacity>
                            <Text style={styles.studentCode}>{p?.loginCode || '—'}</Text>
                          </View>
                        </View>
                      );
                    })}
                  </>
                )}
               </View>
             ))}
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
                            <Text style={styles.statLabel}>Assignments</Text>
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
        
        <TouchableOpacity style={[styles.navItem, activeTab === 'reports' && styles.activeNavItem]} onPress={() => setActiveTab('reports')}>
          <MaterialCommunityIcons name="chart-bar" size={24} color={activeTab === 'reports' ? '#000000' : '#9ca3af'} />
          <Text style={[styles.navText, activeTab === 'reports' && styles.activeNavText]}>Reports</Text>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
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
    paddingHorizontal: 20,
    paddingTop: 60,
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
    fontSize: 22,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 20,
  },
  classroomCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  classroomHeader: {
    marginBottom: 24,
  },
  classroomTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 6,
  },
  classroomSubtitle: {
    fontSize: 15,
    color: '#64748b',
    marginBottom: 4,
    fontWeight: '500',
  },
  classroomYear: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '500',
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
});
