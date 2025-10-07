import { AntDesign, MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Accelerometer } from 'expo-sensors';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Dimensions, FlatList, Image, Modal, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { getCurrentUser, onAuthChange } from '../lib/firebase-auth';
import { deleteData, listenToData, readData, stopListening, updateData, writeData } from '../lib/firebase-database';
import { uploadFile } from '../lib/firebase-storage';

type TabKey = 'home' | 'teacher' | 'blocklist' | 'reports';

interface Teacher {
  uid: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  school: string;
  gender: string;
  profilePictureUrl: string;
  createdAt: string;
  isVerified?: boolean;
  isBlocked?: boolean;
}

interface ErrorLog {
  id: string;
  timestamp: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
  source?: string;
  userId?: string;
  userEmail?: string;
}

interface TechnicalReport {
  id: string;
  reportedBy: string;
  reportedByEmail: string;
  reportedByName?: string;
  userRole?: 'teacher' | 'parent' | 'admin';
  timestamp: string;
  description: string;
  screenshots: string[];
  status: 'pending' | 'in_progress' | 'resolved';
}

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<TabKey>('home');
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(false);
  const [showTeacherModal, setShowTeacherModal] = useState(false);
  const [selectedTeacher, setSelectedTeacher] = useState<Teacher | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  // Teacher Management filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'verified' | 'pending'>('all');
  // Confirmation panel state
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [confirmTitle, setConfirmTitle] = useState('');
  const [confirmMessage, setConfirmMessage] = useState('');
  const [confirmPrimaryLabel, setConfirmPrimaryLabel] = useState('Confirm');
  const [confirmDestructive, setConfirmDestructive] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState<null | (() => Promise<void>)>(null);

  // Admin announcement state
  const [showAnnModal, setShowAnnModal] = useState(false);
  const [annTitle, setAnnTitle] = useState('');
  const [annMessage, setAnnMessage] = useState('');
  const [sendingAnn, setSendingAnn] = useState(false);

  // Error logs and technical reports state
  const [errorLogs, setErrorLogs] = useState<ErrorLog[]>([]);
  const [technicalReports, setTechnicalReports] = useState<TechnicalReport[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logSearchQuery, setLogSearchQuery] = useState('');
  const [logSeverityFilter, setLogSeverityFilter] = useState<'all' | 'error' | 'warning' | 'info'>('all');
  
  // Technical Report Modal state
  const [showTechReportModal, setShowTechReportModal] = useState(false);
  const [reportDescription, setReportDescription] = useState('');
  const [reportScreenshots, setReportScreenshots] = useState<string[]>([]);
  const [submittingReport, setSubmittingReport] = useState(false);
  
  // Shake detection state
  const [shakeSubscription, setShakeSubscription] = useState<any>(null);

  // Admin identity for welcome header
  const [adminName, setAdminName] = useState<string>('');
  useEffect(() => {
    const setFromUser = () => {
      const u = getCurrentUser();
      if (u) {
        const display = u.displayName || u.email || 'Admin';
        setAdminName(display as string);
      }
    };
    setFromUser();
    const unsub = onAuthChange(() => setFromUser());
    return () => { if (typeof unsub === 'function') unsub(); };
  }, []);

  // Teacher stats (sections and student counts)
  const [teacherStats, setTeacherStats] = useState<Record<string, { sectionCount: number; studentCount: number }>>({});
  const [statsLoading, setStatsLoading] = useState(false);

  const computeTeacherStats = async (teacherList: Teacher[]) => {
    try {
      setStatsLoading(true);
      const [{ data: sectionsData }, { data: studentsData }] = await Promise.all([
        readData('/sections'),
        readData('/students'),
      ]);
      const sectionsArray: Array<any & { id: string }> = Object.entries(sectionsData || {}).map(([id, v]: any) => ({ id, ...(v || {}) }));
      const studentsArray: Array<any & { id: string }> = Object.entries(studentsData || {}).map(([id, v]: any) => ({ id, ...(v || {}) }));

      const result: Record<string, { sectionCount: number; studentCount: number }> = {};

      for (const teacher of teacherList) {
        const teacherSectionIds = sectionsArray
          .filter(s => s.teacherId === teacher.uid)
          .map(s => s.id);
        const sectionCount = teacherSectionIds.length;
        const studentCount = studentsArray.filter(stu => teacherSectionIds.includes(stu.classId || stu.sectionId)).length;
        result[teacher.uid] = { sectionCount, studentCount };
      }

      setTeacherStats(result);
    } catch (e) {
      // ignore silently for admin overview
    } finally {
      setStatsLoading(false);
    }
  };

  // Recompute stats when teachers change and on home view
  useEffect(() => {
    if (teachers.length > 0 && (activeTab === 'home' || activeTab === 'teacher' || activeTab === 'blocklist')) {
      computeTeacherStats(teachers);
    }
  }, [teachers, activeTab]);

  // Fetch all teachers from Firebase
  const fetchTeachers = async () => {
    setLoading(true);
    try {
      const { data, error } = await readData('/teachers');
      if (error) {
        console.error('Error fetching teachers:', error);
        return;
      }
      
      if (data) {
        const teachersList: Teacher[] = Object.entries(data).map(([uid, teacherData]: [string, any]) => ({
          uid,
          ...teacherData,
          isVerified: teacherData.isVerified || false,
          isBlocked: teacherData.isBlocked || false,
        }));
        setTeachers(teachersList);
      }
    } catch (error) {
      console.error('Error fetching teachers:', error);
    } finally {
      setLoading(false);
    }
  };

  // Verify teacher account
  const verifyTeacher = async (teacherId: string) => {
    try {
      const { success, error } = await updateData(`/teachers/${teacherId}`, {
        isVerified: true,
        verifiedAt: new Date().toISOString(),
      });
      
      if (success) {
        setTeachers(prev => prev.map(teacher => 
          teacher.uid === teacherId ? { ...teacher, isVerified: true } : teacher
        ));
        // Keep modal view in sync
        setSelectedTeacher(prev => (prev && prev.uid === teacherId) ? { ...prev, isVerified: true } : prev);
      } else {
        console.error('Failed to verify teacher', error);
      }
    } catch (error) {
      console.error('Failed to verify teacher');
    }
  };

  // Perform block/unblock teacher (no confirmation UI here)
  const performToggleBlock = async (teacherId: string, isBlocked: boolean) => {
    try {
      const { success, error } = await updateData(`/teachers/${teacherId}`, {
        isBlocked: !isBlocked,
        blockedAt: !isBlocked ? new Date().toISOString() : null,
      });
      if (success) {
        setTeachers(prev => prev.map(teacher => 
          teacher.uid === teacherId ? { ...teacher, isBlocked: !isBlocked } : teacher
        ));
        // Keep modal view in sync
        setSelectedTeacher(prev => (prev && prev.uid === teacherId) ? { ...prev, isBlocked: !isBlocked } : prev);
        // If we just blocked a teacher, close the profile and switch to Blocklist
        if (!isBlocked) {
          closeTeacherProfile();
          setActiveTab('blocklist');
        }
      } else {
        console.error('Failed to toggle block', error);
      }
    } catch (error) {
      console.error('Failed to toggle block');
    }
  };

  // Open confirmation for block/unblock
  const confirmToggleBlock = (teacherId: string, isBlocked: boolean) => {
    const nextIsBlocked = !isBlocked;
    const actionTitle = nextIsBlocked ? 'Block Teacher' : 'Unblock Teacher';
    const actionMessage = nextIsBlocked
      ? 'Are you sure you want to block this teacher? They will be moved to the Blocklist.'
      : 'Are you sure you want to unblock this teacher? They will return to the active list.';
    setConfirmTitle(actionTitle);
    setConfirmMessage(actionMessage);
    setConfirmPrimaryLabel(nextIsBlocked ? 'Block' : 'Unblock');
    setConfirmDestructive(nextIsBlocked);
    setPendingAction(() => async () => {
      await performToggleBlock(teacherId, isBlocked);
    });
    setConfirmVisible(true);
  };

  // Permanently remove teacher account (no confirmation UI here)
  const performRemoveTeacher = async (teacherId: string) => {
    try {
      const { success, error } = await deleteData(`/teachers/${teacherId}`);
      if (success) {
        setTeachers(prev => prev.filter(t => t.uid !== teacherId));
        if (selectedTeacher?.uid === teacherId) {
          closeTeacherProfile();
        }
      } else {
        console.error('Failed to remove teacher', error);
      }
    } catch (err) {
      console.error('Failed to remove teacher');
    }
  };

  const confirmRemoveTeacher = (teacherId: string) => {
    setConfirmTitle('Remove Teacher');
    setConfirmMessage('This will permanently delete the teacher account and its data. This action cannot be undone.');
    setConfirmPrimaryLabel('Remove');
    setConfirmDestructive(true);
    setPendingAction(() => async () => {
      await performRemoveTeacher(teacherId);
    });
    setConfirmVisible(true);
  };

  // Open teacher profile modal
  const openTeacherProfile = (teacher: Teacher) => {
    setSelectedTeacher(teacher);
    setShowTeacherModal(true);
  };

  // Close teacher profile modal
  const closeTeacherProfile = () => {
    setShowTeacherModal(false);
    setSelectedTeacher(null);
  };

  // Load teachers when relevant tabs are selected (including home for overview)
  useEffect(() => {
    if (activeTab === 'teacher' || activeTab === 'blocklist' || activeTab === 'home') {
      fetchTeachers();
    }
  }, [activeTab]);

  const activeTeachers = teachers.filter(t => !t.isBlocked);
  const blockedTeachers = teachers.filter(t => t.isBlocked);

  const normalized = (v: string | undefined | null) => (v || '').toString().trim().toLowerCase();
  const matchesTeacherFilters = (t: Teacher) => {
    const q = normalized(searchQuery);
    const matchesText = !q ||
      normalized(t.firstName).includes(q) ||
      normalized(t.lastName).includes(q) ||
      normalized(`${t.firstName} ${t.lastName}`).includes(q) ||
      normalized(t.email).includes(q) ||
      normalized(t.school).includes(q);
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'verified' && !!t.isVerified) ||
      (statusFilter === 'pending' && !t.isVerified);
    return matchesText && matchesStatus;
  };
  const filteredActiveTeachers = activeTeachers.filter(matchesTeacherFilters);

  const onRefresh = async () => {
    if (activeTab === 'teacher' || activeTab === 'blocklist' || activeTab === 'home') {
      setRefreshing(true);
      try {
        await fetchTeachers();
      } finally {
        setRefreshing(false);
      }
    }
    if (activeTab === 'reports') {
      setRefreshing(true);
      try {
        await Promise.all([fetchErrorLogs(), fetchTechnicalReports()]);
      } finally {
        setRefreshing(false);
      }
    }
  };

  // Fetch error logs from Firebase
  const fetchErrorLogs = async () => {
    setLogsLoading(true);
    try {
      const { data, error } = await readData('/errorLogs');
      if (error) {
        console.error('Error fetching logs:', error);
        return;
      }
      
      if (data) {
        const logsList: ErrorLog[] = Object.entries(data).map(([id, logData]: [string, any]) => ({
          id,
          ...logData,
        })).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        setErrorLogs(logsList);
      } else {
        setErrorLogs([]);
      }
    } catch (error) {
      console.error('Error fetching logs:', error);
    } finally {
      setLogsLoading(false);
    }
  };

  // Fetch technical reports from Firebase
  const fetchTechnicalReports = async () => {
    try {
      const { data, error } = await readData('/technicalReports');
      if (error) {
        console.error('Error fetching reports:', error);
        return;
      }
      
      if (data) {
        const reportsList: TechnicalReport[] = Object.entries(data).map(([id, reportData]: [string, any]) => ({
          id,
          ...reportData,
          // Ensure screenshots is always an array
          screenshots: reportData.screenshots || [],
          // Ensure status has a default
          status: reportData.status || 'pending',
        })).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        setTechnicalReports(reportsList);
      } else {
        setTechnicalReports([]);
      }
    } catch (error) {
      console.error('Error fetching reports:', error);
      setTechnicalReports([]); // Set empty array on error
    }
  };

  // Load logs with real-time updates when Reports tab is selected
  useEffect(() => {
    if (activeTab === 'reports') {
      setLogsLoading(true);
      
      // Set up real-time listener for error logs
      const unsubscribeErrorLogs = listenToData('/errorLogs', (data) => {
        if (data) {
          const logsList: ErrorLog[] = Object.entries(data).map(([id, logData]: [string, any]) => ({
            id,
            ...logData,
          })).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
          setErrorLogs(logsList);
        } else {
          setErrorLogs([]);
        }
        setLogsLoading(false);
      });

      // Set up real-time listener for technical reports
      const unsubscribeTechnicalReports = listenToData('/technicalReports', (data) => {
        if (data) {
          const reportsList: TechnicalReport[] = Object.entries(data).map(([id, reportData]: [string, any]) => ({
            id,
            ...reportData,
            // Ensure screenshots is always an array
            screenshots: reportData.screenshots || [],
            // Ensure status has a default
            status: reportData.status || 'pending',
          })).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
          setTechnicalReports(reportsList);
        } else {
          setTechnicalReports([]);
        }
      });

      // Cleanup listeners when leaving Reports tab
      return () => {
        stopListening('/errorLogs');
        stopListening('/technicalReports');
      };
    }
  }, [activeTab]);

  // Shake detection for Reports tab
  useEffect(() => {
    if (activeTab === 'reports') {
      let lastShake = 0;
      const SHAKE_THRESHOLD = 2.5;
      const SHAKE_TIMEOUT = 1000; // Prevent multiple triggers

      const subscription = Accelerometer.addListener(({ x, y, z }) => {
        const acceleration = Math.sqrt(x * x + y * y + z * z);
        const now = Date.now();

        if (acceleration > SHAKE_THRESHOLD && now - lastShake > SHAKE_TIMEOUT) {
          lastShake = now;
          setShowTechReportModal(true);
        }
      });

      Accelerometer.setUpdateInterval(100);
      setShakeSubscription(subscription);

      return () => {
        subscription?.remove();
      };
    } else {
      // Clean up when leaving Reports tab
      shakeSubscription?.remove();
      setShakeSubscription(null);
    }
  }, [activeTab]);

  // Pick image from gallery
  const pickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please grant permission to access photos.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: 0.8,
        selectionLimit: 5 - reportScreenshots.length, // Max 5 total screenshots
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

  // Take photo with camera
  const takePhoto = async () => {
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

  // Remove screenshot
  const removeScreenshot = (uri: string) => {
    setReportScreenshots(prev => prev.filter(s => s !== uri));
  };

  // Submit technical report
  const submitTechnicalReport = async () => {
    if (!reportDescription.trim()) {
      Alert.alert('Missing Information', 'Please describe the problem.');
      return;
    }

    setSubmittingReport(true);
    try {
      const user = getCurrentUser();
      const timestamp = new Date().toISOString();
      const reportId = `report_${Date.now()}`;

      // Upload screenshots to Firebase Storage
      const uploadedUrls: string[] = [];
      for (let i = 0; i < reportScreenshots.length; i++) {
        const uri = reportScreenshots[i];
        const fileName = `technical-reports/${reportId}/screenshot_${i + 1}.jpg`;
        
        // Convert URI to Blob for upload
        const response = await fetch(uri);
        const blob = await response.blob();
        const { downloadURL } = await uploadFile(fileName, blob);
        if (downloadURL) {
          uploadedUrls.push(downloadURL);
        }
      }

      const report: TechnicalReport = {
        id: reportId,
        reportedBy: user?.uid || 'unknown',
        reportedByEmail: user?.email || 'unknown',
        timestamp,
        description: reportDescription.trim(),
        screenshots: uploadedUrls,
        status: 'pending',
      };

      const { success, error } = await writeData(`/technicalReports/${reportId}`, report);
      
      if (success) {
        Alert.alert('Success', 'Your technical report has been submitted to the Super Admin.');
        setShowTechReportModal(false);
        setReportDescription('');
        setReportScreenshots([]);
        fetchTechnicalReports(); // Refresh the list
      } else {
        throw new Error(error || 'Failed to submit report');
      }
    } catch (error) {
      console.error('Error submitting report:', error);
      Alert.alert('Error', 'Failed to submit report. Please try again.');
    } finally {
      setSubmittingReport(false);
    }
  };

  // Mark technical report as done (resolved)
  const handleMarkReportAsDone = async (reportId: string) => {
    try {
      const { success, error } = await updateData(`/technicalReports/${reportId}`, {
        status: 'resolved',
        resolvedAt: new Date().toISOString(),
      });

      if (success) {
        // Update local state immediately
        setTechnicalReports(prev => 
          prev.map(report => 
            report.id === reportId ? { ...report, status: 'resolved' } : report
          )
        );
        Alert.alert('Success', 'Technical report marked as resolved.');
      } else {
        console.error('Failed to mark report as done:', error);
        Alert.alert('Error', 'Failed to update report status.');
      }
    } catch (error) {
      console.error('Error marking report as done:', error);
      Alert.alert('Error', 'Failed to update report status.');
    }
  };

  // Remove resolved technical report
  const handleRemoveReport = async (reportId: string) => {
    Alert.alert(
      'Remove Report',
      'Are you sure you want to permanently remove this technical report?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              const { success, error } = await deleteData(`/technicalReports/${reportId}`);
              
              if (success) {
                // Update local state immediately
                setTechnicalReports(prev => prev.filter(report => report.id !== reportId));
                Alert.alert('Success', 'Technical report removed.');
              } else {
                console.error('Failed to remove report:', error);
                Alert.alert('Error', 'Failed to remove report.');
              }
            } catch (error) {
              console.error('Error removing report:', error);
              Alert.alert('Error', 'Failed to remove report.');
            }
          }
        }
      ]
    );
  };

  // Filter error logs
  const filteredErrorLogs = errorLogs.filter(log => {
    const matchesSearch = !logSearchQuery || 
      log.message.toLowerCase().includes(logSearchQuery.toLowerCase()) ||
      log.source?.toLowerCase().includes(logSearchQuery.toLowerCase()) ||
      log.userEmail?.toLowerCase().includes(logSearchQuery.toLowerCase());
    
    const matchesSeverity = logSeverityFilter === 'all' || log.severity === logSeverityFilter;
    
    return matchesSearch && matchesSeverity;
  });

  return (
    <View style={styles.container}>
      {activeTab === 'home' && (
        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={["#0ea5e9"]}
              tintColor="#0ea5e9"
            />
          }
        >
          <View style={{ gap: 20 }}>
            {/* Header Section (match other dashboards) */}
            <View style={styles.adminHeader}>
              <View style={styles.adminAvatarContainer}>
                <View style={styles.adminAvatar}>
                  <MaterialIcons name="person" size={40} color="#4a5568" />
                </View>
              </View>
              <View style={styles.adminWelcomeText}>
                <Text style={styles.adminWelcomeLabel}>Welcome,</Text>
                <View style={styles.adminNameRow}>
                  <Text style={styles.adminWelcomeTitle}>Admin{adminName ? ` ${adminName}` : ''}</Text>
                </View>
              </View>
            </View>

            {/* Create Announcement (All Parents) */}
            <View style={styles.announcementCard}>
              <View style={styles.announcementHeaderRow}>
                <View style={styles.announcementTitleWrap}>
                  <MaterialCommunityIcons name="bullhorn" size={22} color="#0ea5e9" />
                  <Text style={styles.announcementCardTitle}>Create Announcement</Text>
                </View>
                <View style={styles.announcementQuickBadge}>
                  <Text style={styles.announcementQuickBadgeText}>All Parents</Text>
                </View>
              </View>
              <Text style={styles.announcementCardText}>
                Send a platform-wide announcement to all parents. Use this for important updates and reminders.
              </Text>
              <TouchableOpacity style={styles.announcementPrimaryButton} onPress={() => setShowAnnModal(true)}>
                <MaterialCommunityIcons name="pencil" size={18} color="#ffffff" />
                <Text style={styles.announcementPrimaryButtonText}>Create Announcement</Text>
              </TouchableOpacity>
            </View>

            {/* Teachers Overview List */}
            <View style={styles.homeTeachersCard}>
              <View style={styles.homeTeachersHeader}>
                <Text style={styles.homeTeachersTitle}>Teachers</Text>
                <Text style={styles.homeTeachersSubtitle}>{teachers.length} total</Text>
              </View>
              {loading ? (
                <View style={styles.loadingContainer}>
                  <Text style={styles.loadingText}>Loading teachers...</Text>
                </View>
              ) : teachers.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <MaterialCommunityIcons name="account-group-outline" size={42} color="#9ca3af" />
                  <Text style={styles.emptyTitle}>No Teachers Found</Text>
                </View>
              ) : (
                <View style={styles.homeTeachersList}>
                  {teachers.map((t) => {
                    const isBlocked = !!t.isBlocked;
                    const isVerified = !!t.isVerified;
                    const dotStyle = isBlocked ? styles.dotBlocked : (isVerified ? styles.dotVerified : styles.dotPending);
                    const statusText = isBlocked ? 'Blocked' : (isVerified ? 'Verified' : 'Pending');
                    return (
                      <View key={t.uid} style={styles.homeTeacherRow}>
                        <View style={styles.homeTeacherLeft}>
                          {t.profilePictureUrl ? (
                            <Image source={{ uri: t.profilePictureUrl }} style={styles.homeTeacherAvatar} />
                          ) : (
                            <View style={styles.homeTeacherAvatarPlaceholder}>
                              <MaterialCommunityIcons name="account" size={18} color="#ffffff" />
                            </View>
                          )}
                          <View style={styles.homeTeacherInfo}>
                            <Text style={styles.homeTeacherName}>{t.firstName} {t.lastName}</Text>
                            <Text style={styles.homeTeacherMeta}>{t.school || '—'}</Text>
                            <View style={styles.homeTeacherMetaRow}>
                              <MaterialCommunityIcons name="account-multiple" size={12} color="#94a3b8" />
                              <Text style={styles.homeTeacherMeta}>{(teacherStats[t.uid]?.sectionCount ?? 0)} section(s)</Text>
                              <Text style={styles.homeTeacherMetaSeparator}>•</Text>
                              <MaterialCommunityIcons name="account" size={12} color="#94a3b8" />
                              <Text style={styles.homeTeacherMeta}>{(teacherStats[t.uid]?.studentCount ?? 0)} student(s)</Text>
                            </View>
                          </View>
                        </View>
                        <View style={styles.homeTeacherRight}>
                          <View style={[styles.statusDot, dotStyle]} />
                          <Text style={styles.homeTeacherStatusText}>{statusText}</Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          </View>
          <View style={{ height: 90 }} />
        </ScrollView>
      )}

      {activeTab === 'teacher' && (
        loading ? (
          <View style={styles.loadingContainer}>
            <Text style={styles.loadingText}>Loading teachers...</Text>
          </View>
        ) : activeTeachers.length === 0 ? (
          <View style={styles.emptyContainer}>
            <MaterialCommunityIcons name="account-group-outline" size={48} color="#9ca3af" />
            <Text style={styles.emptyTitle}>No Active Teachers</Text>
            <Text style={styles.emptySubtitle}>Active (unblocked) teachers will appear here.</Text>
          </View>
        ) : (
          <FlatList
            data={filteredActiveTeachers}
            keyExtractor={(t) => t.uid}
            refreshing={refreshing}
            onRefresh={onRefresh}
            contentContainerStyle={[styles.teacherList, { padding: 20, paddingBottom: 100 }]}
            ListHeaderComponent={
              <View>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Teacher Management</Text>
                </View>
                <View style={styles.filtersWrap}>
                  <View style={styles.searchBox}>
                    <MaterialIcons name="search" size={18} color="#94a3b8" />
                    <TextInput
                      style={styles.searchInput}
                      placeholder="Search by name, email, or school"
                      placeholderTextColor="#94a3b8"
                      value={searchQuery}
                      onChangeText={setSearchQuery}
                      returnKeyType="search"
                    />
                  </View>
                  <View style={styles.filterChips}>
                    <TouchableOpacity
                      style={[styles.filterChip, statusFilter === 'all' && styles.filterChipActive]}
                      onPress={() => setStatusFilter('all')}
                    >
                      <Text style={[styles.filterChipText, statusFilter === 'all' && styles.filterChipTextActive]}>All</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.filterChip, statusFilter === 'verified' && styles.filterChipActive]}
                      onPress={() => setStatusFilter('verified')}
                    >
                      <Text style={[styles.filterChipText, statusFilter === 'verified' && styles.filterChipTextActive]}>Verified</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.filterChip, statusFilter === 'pending' && styles.filterChipActive]}
                      onPress={() => setStatusFilter('pending')}
                    >
                      <Text style={[styles.filterChipText, statusFilter === 'pending' && styles.filterChipTextActive]}>Pending</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            }
            renderItem={({ item: teacher }) => (
              <View style={styles.teacherCard}>
                <View style={styles.teacherHeader}>
                  <TouchableOpacity 
                    style={styles.teacherInfo}
                    onPress={() => openTeacherProfile(teacher)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.avatarContainer}>
                      {teacher.profilePictureUrl ? (
                        <Image 
                          source={{ uri: teacher.profilePictureUrl }} 
                          style={styles.avatar} 
                        />
                      ) : (
                        <View style={styles.avatarPlaceholder}>
                          <MaterialCommunityIcons 
                            name="account" 
                            size={24} 
                            color="#ffffff" 
                          />
                        </View>
                      )}
                    </View>
                    <View style={styles.teacherDetails}>
                      <Text style={styles.teacherName}>
                        {teacher.firstName} {teacher.lastName}
                      </Text>
                      <Text style={styles.teacherEmail}>{teacher.email}</Text>
                      <Text style={styles.teacherSchool}>{teacher.school}</Text>
                    </View>
                  </TouchableOpacity>
                  <View style={styles.statusBadges}>
                    {teacher.isVerified ? (
                      <View style={[styles.badge, styles.verifiedBadge]}>
                        <MaterialCommunityIcons name="check-circle" size={12} color="#ffffff" />
                        <Text style={styles.badgeText}>Verified</Text>
                      </View>
                    ) : (
                      <View style={[styles.badge, styles.unverifiedBadge]}>
                        <MaterialCommunityIcons name="clock-outline" size={12} color="#ffffff" />
                        <Text style={styles.badgeText}>Pending</Text>
                      </View>
                    )}
                    {teacher.isBlocked && (
                      <View style={[styles.badge, styles.blockedBadge]}>
                        <AntDesign name="stop" size={12} color="#ffffff" />
                        <Text style={styles.badgeText}>Blocked</Text>
                      </View>
                    )}
                  </View>
                </View>
                
                <View style={styles.teacherActions}>
                  <TouchableOpacity 
                    style={[styles.actionButton, styles.viewButton]}
                    onPress={() => openTeacherProfile(teacher)}
                  >
                    <MaterialIcons name="visibility" size={16} color="#ffffff" />
                    <Text style={styles.actionButtonText}>View</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          />
        )
      )}

      {activeTab === 'blocklist' && (
        loading ? (
          <View style={styles.loadingContainer}>
            <Text style={styles.loadingText}>Loading blocked teachers...</Text>
          </View>
        ) : blockedTeachers.length === 0 ? (
          <View style={styles.emptyContainer}>
            <MaterialIcons name="block" size={48} color="#9ca3af" />
            <Text style={styles.emptyTitle}>No Blocked Teachers</Text>
            <Text style={styles.emptySubtitle}>Blocked teachers will appear here.</Text>
          </View>
        ) : (
          <FlatList
            data={blockedTeachers}
            keyExtractor={(t) => t.uid}
            refreshing={refreshing}
            onRefresh={onRefresh}
            contentContainerStyle={[styles.teacherList, { padding: 20, paddingBottom: 100 }]}
            ListHeaderComponent={
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Blocked Teachers</Text>
              </View>
            }
            renderItem={({ item: teacher }) => (
              <View style={styles.teacherCard}>
                <View style={styles.teacherHeader}>
                  <TouchableOpacity 
                    style={styles.teacherInfo}
                    onPress={() => openTeacherProfile(teacher)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.avatarContainer}>
                      {teacher.profilePictureUrl ? (
                        <Image 
                          source={{ uri: teacher.profilePictureUrl }} 
                          style={styles.avatar} 
                        />
                      ) : (
                        <View style={styles.avatarPlaceholder}>
                          <MaterialCommunityIcons 
                            name="account" 
                            size={24} 
                            color="#ffffff" 
                          />
                        </View>
                      )}
                    </View>
                    <View style={styles.teacherDetails}>
                      <Text style={styles.teacherName}>
                        {teacher.firstName} {teacher.lastName}
                      </Text>
                      <Text style={styles.teacherEmail}>{teacher.email}</Text>
                      <Text style={styles.teacherSchool}>{teacher.school}</Text>
                    </View>
                  </TouchableOpacity>
                  <View style={styles.statusBadges}>
                    <View style={[styles.badge, styles.blockedBadge]}>
                      <AntDesign name="stop" size={12} color="#ffffff" />
                      <Text style={styles.badgeText}>Blocked</Text>
                    </View>
                  </View>
                </View>

                <View style={styles.teacherActions}>
                  <TouchableOpacity 
                    style={[styles.actionButton, styles.unblockButton]}
                    onPress={() => confirmToggleBlock(teacher.uid, true)}
                  >
                    <MaterialIcons name="lock-open" size={16} color="#ffffff" />
                    <Text style={styles.actionButtonText}>Unblock</Text>
                  </TouchableOpacity>

                  <TouchableOpacity 
                    style={[styles.actionButton, styles.removeButton]}
                    onPress={() => confirmRemoveTeacher(teacher.uid)}
                  >
                    <MaterialCommunityIcons name="delete-outline" size={16} color="#ffffff" />
                    <Text style={styles.actionButtonText}>Remove</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          />
        )
      )}

      {activeTab === 'reports' && (
        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={["#0ea5e9"]}
              tintColor="#0ea5e9"
            />
          }
        >
          {/* Page Header */}
          <View style={styles.reportsPageHeader}>
            <View>
              <Text style={styles.reportsPageTitle}>Reports & Logs</Text>
              <Text style={styles.reportsPageSubtitle}>Monitor system health and technical issues</Text>
            </View>
          </View>

          {/* Shake to report hint */}
          <View style={styles.shakeHintCard}>
            <View style={styles.shakeHintIconContainer}>
              <MaterialCommunityIcons name="cellphone" size={28} color="#0ea5e9" />
            </View>
            <View style={styles.shakeHintTextContainer}>
              <Text style={styles.shakeHintTitle}>Quick Report</Text>
              <Text style={styles.shakeHintText}>Shake your device to report a technical problem</Text>
            </View>
          </View>

          {/* Technical Reports Section */}
          <View style={styles.reportsCard}>
            <View style={styles.reportsHeader}>
              <View style={styles.reportsHeaderLeft}>
                <View style={styles.reportsIconContainer}>
                  <MaterialCommunityIcons name="bug" size={24} color="#ef4444" />
                </View>
                <View>
                  <Text style={styles.reportsTitle}>Technical Reports</Text>
                  <Text style={styles.reportsSubtitle}>User-submitted issues</Text>
                </View>
              </View>
              <View style={styles.reportsBadge}>
                <Text style={styles.reportsBadgeText}>{technicalReports.length}</Text>
              </View>
            </View>
            
            {logsLoading ? (
              <View style={styles.logsLoadingContainer}>
                <ActivityIndicator size="small" color="#0ea5e9" />
                <Text style={styles.logsLoadingText}>Loading reports...</Text>
              </View>
            ) : technicalReports.length === 0 ? (
              <View style={styles.emptyLogsContainer}>
                <View style={styles.emptyLogsIconContainer}>
                  <MaterialCommunityIcons name="check-circle-outline" size={48} color="#10b981" />
                </View>
                <Text style={styles.emptyLogsTitle}>All Clear!</Text>
                <Text style={styles.emptyLogsText}>No technical reports submitted yet</Text>
              </View>
            ) : (
              <View style={styles.reportsList}>
                {technicalReports.map(report => (
                  <View key={report.id} style={styles.reportItem}>
                    <View style={styles.reportItemHeader}>
                      <View style={styles.reportItemLeft}>
                        <View style={styles.reportItemUserRow}>
                          <MaterialCommunityIcons 
                            name={report.userRole === 'teacher' ? 'account-tie' : 
                                  report.userRole === 'parent' ? 'account-heart' : 'account-circle'} 
                            size={16} 
                            color="#64748b" 
                          />
                          <Text style={styles.reportItemUser}>
                            {report.reportedByName || report.reportedByEmail}
                          </Text>
                          {report.userRole && (
                            <View style={[
                              styles.reportUserRoleBadge,
                              report.userRole === 'teacher' && styles.reportUserRoleTeacher,
                              report.userRole === 'parent' && styles.reportUserRoleParent,
                              report.userRole === 'admin' && styles.reportUserRoleAdmin,
                            ]}>
                              <Text style={styles.reportUserRoleText}>
                                {report.userRole === 'teacher' ? 'Teacher' : 
                                 report.userRole === 'parent' ? 'Parent' : 'Admin'}
                              </Text>
                            </View>
                          )}
                        </View>
                        <View style={styles.reportItemTimeRow}>
                          <MaterialIcons name="access-time" size={14} color="#94a3b8" />
                          <Text style={styles.reportItemTime}>
                            {new Date(report.timestamp).toLocaleString()}
                          </Text>
                        </View>
                      </View>
                      <View style={[
                        styles.reportStatusBadge,
                        report.status === 'resolved' && styles.reportStatusResolved,
                        report.status === 'in_progress' && styles.reportStatusInProgress,
                      ]}>
                        <View style={[
                          styles.reportStatusDot,
                          report.status === 'resolved' && styles.reportStatusDotResolved,
                          report.status === 'in_progress' && styles.reportStatusDotInProgress,
                        ]} />
                        <Text style={styles.reportStatusText}>
                          {report.status === 'pending' ? 'Pending' : 
                           report.status === 'in_progress' ? 'In Progress' : 'Resolved'}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.reportItemDescriptionContainer}>
                      <Text style={styles.reportItemDescription}>{report.description}</Text>
                    </View>
                    {report.screenshots && report.screenshots.length > 0 && (
                      <View style={styles.reportScreenshotsContainer}>
                        <View style={styles.reportScreenshotsHeader}>
                          <MaterialIcons name="photo-library" size={16} color="#64748b" />
                          <Text style={styles.reportScreenshotsLabel}>
                            {report.screenshots.length} screenshot{report.screenshots.length > 1 ? 's' : ''} attached
                          </Text>
                        </View>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.reportScreenshotsScroll}>
                          {report.screenshots.map((url, idx) => (
                            <View key={idx} style={styles.reportScreenshotWrapper}>
                              <Image source={{ uri: url }} style={styles.reportScreenshotThumb} />
                            </View>
                          ))}
                        </ScrollView>
                      </View>
                    )}
                    
                    {/* Action Buttons */}
                    <View style={styles.reportActionsContainer}>
                      {report.status !== 'resolved' ? (
                        <TouchableOpacity 
                          style={styles.markDoneButton}
                          onPress={() => handleMarkReportAsDone(report.id)}
                        >
                          <MaterialCommunityIcons name="check-circle" size={18} color="#ffffff" />
                          <Text style={styles.markDoneButtonText}>Mark as Done</Text>
                        </TouchableOpacity>
                      ) : (
                        <TouchableOpacity 
                          style={styles.removeReportButton}
                          onPress={() => handleRemoveReport(report.id)}
                        >
                          <MaterialCommunityIcons name="delete-outline" size={18} color="#ffffff" />
                          <Text style={styles.removeReportButtonText}>Remove</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Error Logs Section */}
          <View style={styles.reportsCard}>
            <View style={styles.reportsHeader}>
              <View style={styles.reportsHeaderLeft}>
                <View style={[styles.reportsIconContainer, styles.reportsIconContainerWarning]}>
                  <MaterialIcons name="error-outline" size={24} color="#f59e0b" />
                </View>
                <View>
                  <Text style={styles.reportsTitle}>Error Logs</Text>
                  <Text style={styles.reportsSubtitle}>System diagnostics</Text>
                </View>
              </View>
              <View style={[styles.reportsBadge, styles.reportsBadgeWarning]}>
                <Text style={styles.reportsBadgeText}>{errorLogs.length}</Text>
              </View>
            </View>

            {/* Search and filter */}
            <View style={styles.logsFiltersWrap}>
              <View style={styles.searchBox}>
                <MaterialIcons name="search" size={20} color="#94a3b8" />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search logs by message, source, or user..."
                  placeholderTextColor="#94a3b8"
                  value={logSearchQuery}
                  onChangeText={setLogSearchQuery}
                  returnKeyType="search"
                />
              </View>
              <View style={styles.filterChips}>
                <TouchableOpacity
                  style={[styles.filterChip, logSeverityFilter === 'all' && styles.filterChipActive]}
                  onPress={() => setLogSeverityFilter('all')}
                >
                  <Text style={[styles.filterChipText, logSeverityFilter === 'all' && styles.filterChipTextActive]}>All</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.filterChip, logSeverityFilter === 'error' && styles.filterChipActive]}
                  onPress={() => setLogSeverityFilter('error')}
                >
                  <Text style={[styles.filterChipText, logSeverityFilter === 'error' && styles.filterChipTextActive]}>Errors</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.filterChip, logSeverityFilter === 'warning' && styles.filterChipActive]}
                  onPress={() => setLogSeverityFilter('warning')}
                >
                  <Text style={[styles.filterChipText, logSeverityFilter === 'warning' && styles.filterChipTextActive]}>Warnings</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.filterChip, logSeverityFilter === 'info' && styles.filterChipActive]}
                  onPress={() => setLogSeverityFilter('info')}
                >
                  <Text style={[styles.filterChipText, logSeverityFilter === 'info' && styles.filterChipTextActive]}>Info</Text>
                </TouchableOpacity>
              </View>
            </View>

            {logsLoading ? (
              <View style={styles.logsLoadingContainer}>
                <ActivityIndicator size="small" color="#0ea5e9" />
                <Text style={styles.logsLoadingText}>Loading logs...</Text>
              </View>
            ) : filteredErrorLogs.length === 0 ? (
              <View style={styles.emptyLogsContainer}>
                <View style={styles.emptyLogsIconContainer}>
                  <MaterialCommunityIcons name="check-circle-outline" size={48} color="#10b981" />
                </View>
                <Text style={styles.emptyLogsTitle}>
                  {errorLogs.length === 0 ? 'All Clear!' : 'No Matches'}
                </Text>
                <Text style={styles.emptyLogsText}>
                  {errorLogs.length === 0 ? 'No error logs found' : 'Try adjusting your filters'}
                </Text>
              </View>
            ) : (
              <View style={styles.logsList}>
                {filteredErrorLogs.map(log => (
                  <View key={log.id} style={[
                    styles.logItem,
                    log.severity === 'error' && styles.logItemError,
                    log.severity === 'warning' && styles.logItemWarning,
                    log.severity === 'info' && styles.logItemInfo,
                  ]}>
                    <View style={styles.logItemHeader}>
                      <View style={[
                        styles.logSeverityBadge,
                        log.severity === 'error' && styles.logSeverityError,
                        log.severity === 'warning' && styles.logSeverityWarning,
                        log.severity === 'info' && styles.logSeverityInfo,
                      ]}>
                        <MaterialIcons 
                          name={log.severity === 'error' ? 'error' : log.severity === 'warning' ? 'warning' : 'info'} 
                          size={12} 
                          color="#ffffff" 
                        />
                        <Text style={styles.logSeverityText}>
                          {log.severity.toUpperCase()}
                        </Text>
                      </View>
                      <View style={styles.logItemTimeContainer}>
                        <MaterialIcons name="access-time" size={12} color="#94a3b8" />
                        <Text style={styles.logItemTime}>
                          {new Date(log.timestamp).toLocaleString()}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.logItemMessage}>{log.message}</Text>
                    {(log.source || log.userEmail) && (
                      <View style={styles.logItemMeta}>
                        {log.source && (
                          <View style={styles.logItemMetaRow}>
                            <MaterialIcons name="code" size={12} color="#64748b" />
                            <Text style={styles.logItemSource}>{log.source}</Text>
                          </View>
                        )}
                        {log.userEmail && (
                          <View style={styles.logItemMetaRow}>
                            <MaterialCommunityIcons name="account" size={12} color="#64748b" />
                            <Text style={styles.logItemUser}>{log.userEmail}</Text>
                          </View>
                        )}
                      </View>
                    )}
                  </View>
                ))}
              </View>
            )}
          </View>
          
          <View style={{ height: 90 }} />
        </ScrollView>
      )}

      <View style={styles.bottomNav}>
        <TouchableOpacity style={[styles.navItem, activeTab === 'home' && styles.activeNavItem]} onPress={() => setActiveTab('home')}>
          <View style={[styles.activeIndicator, activeTab === 'home' ? styles.activeIndicatorOn : undefined]} />
          <AntDesign name="home" size={26} color={activeTab === 'home' ? '#0f172a' : '#9ca3af'} />
          <Text style={[styles.navText, activeTab === 'home' && styles.activeNavText]}>Home</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.navItem, activeTab === 'teacher' && styles.activeNavItem]} onPress={() => setActiveTab('teacher')}>
          <View style={[styles.activeIndicator, activeTab === 'teacher' ? styles.activeIndicatorOn : undefined]} />
          <MaterialCommunityIcons name="account-group" size={26} color={activeTab === 'teacher' ? '#0f172a' : '#9ca3af'} />
          <Text style={[styles.navText, activeTab === 'teacher' && styles.activeNavText]}>Teacher</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.navItem, activeTab === 'blocklist' && styles.activeNavItem]} onPress={() => setActiveTab('blocklist')}>
          <View style={[styles.activeIndicator, activeTab === 'blocklist' ? styles.activeIndicatorOn : undefined]} />
          <MaterialIcons name="block" size={26} color={activeTab === 'blocklist' ? '#0f172a' : '#9ca3af'} />
          <Text style={[styles.navText, activeTab === 'blocklist' && styles.activeNavText]}>Blocklist</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.navItem, activeTab === 'reports' && styles.activeNavItem]} onPress={() => setActiveTab('reports')}>
          <View style={[styles.activeIndicator, activeTab === 'reports' ? styles.activeIndicatorOn : undefined]} />
          <MaterialIcons name="assessment" size={26} color={activeTab === 'reports' ? '#0f172a' : '#9ca3af'} />
          <Text style={[styles.navText, activeTab === 'reports' && styles.activeNavText]}>Reports</Text>
        </TouchableOpacity>
      </View>

      {/* Teacher Profile Modal */}
      <Modal
        visible={showTeacherModal}
        animationType="slide"
        transparent={true}
        onRequestClose={closeTeacherProfile}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Teacher Profile</Text>
              <TouchableOpacity 
                style={styles.closeButton}
                onPress={closeTeacherProfile}
              >
                <AntDesign name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>

            {selectedTeacher && (
              <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
                <View style={styles.profileSection}>
                  <View style={styles.profileAvatarContainer}>
                    {selectedTeacher.profilePictureUrl ? (
                      <Image 
                        source={{ uri: selectedTeacher.profilePictureUrl }} 
                        style={styles.profileAvatar} 
                      />
                    ) : (
                      <View style={styles.profileAvatarPlaceholder}>
                        <MaterialCommunityIcons 
                          name="account" 
                          size={48} 
                          color="#ffffff" 
                        />
                      </View>
                    )}
                  </View>
                  
                  <Text style={styles.profileName}>
                    {selectedTeacher.firstName} {selectedTeacher.lastName}
                  </Text>
                  
                  <View style={styles.profileBadges}>
                    {selectedTeacher.isVerified ? (
                      <View style={[styles.profileBadge, styles.verifiedBadge]}>
                        <MaterialCommunityIcons name="check-circle" size={16} color="#ffffff" />
                        <Text style={styles.profileBadgeText}>Verified</Text>
                      </View>
                    ) : (
                      <View style={[styles.profileBadge, styles.unverifiedBadge]}>
                        <MaterialCommunityIcons name="clock-outline" size={16} color="#ffffff" />
                        <Text style={styles.profileBadgeText}>Pending Verification</Text>
                      </View>
                    )}
                    {selectedTeacher.isBlocked && (
                      <View style={[styles.profileBadge, styles.blockedBadge]}>
                        <AntDesign name="stop" size={16} color="#ffffff" />
                        <Text style={styles.profileBadgeText}>Blocked</Text>
                      </View>
                    )}
                  </View>
                </View>

                <View style={styles.detailsSection}>
                  <Text style={styles.detailsTitle}>Personal Information</Text>
                  
                  <View style={styles.detailRow}>
                    <MaterialIcons name="email" size={20} color="#64748b" />
                    <View style={styles.detailContent}>
                      <Text style={styles.detailLabel}>Email</Text>
                      <Text style={styles.detailValue}>{selectedTeacher.email}</Text>
                    </View>
                  </View>

                  <View style={styles.detailRow}>
                    <MaterialIcons name="phone" size={20} color="#64748b" />
                    <View style={styles.detailContent}>
                      <Text style={styles.detailLabel}>Phone</Text>
                      <Text style={styles.detailValue}>{selectedTeacher.phone || 'Not provided'}</Text>
                    </View>
                  </View>

                  <View style={styles.detailRow}>
                    <MaterialIcons name="school" size={20} color="#64748b" />
                    <View style={styles.detailContent}>
                      <Text style={styles.detailLabel}>School</Text>
                      <Text style={styles.detailValue}>{selectedTeacher.school}</Text>
                    </View>
                  </View>

                  <View style={styles.detailRow}>
                    <MaterialIcons name="person" size={20} color="#64748b" />
                    <View style={styles.detailContent}>
                      <Text style={styles.detailLabel}>Gender</Text>
                      <Text style={styles.detailValue}>{selectedTeacher.gender || 'Not specified'}</Text>
                    </View>
                  </View>

                  <View style={styles.detailRow}>
                    <MaterialIcons name="calendar-today" size={20} color="#64748b" />
                    <View style={styles.detailContent}>
                      <Text style={styles.detailLabel}>Joined</Text>
                      <Text style={styles.detailValue}>
                        {new Date(selectedTeacher.createdAt).toLocaleDateString()}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Inline actions at the bottom of the info popup */}
                <View style={styles.modalActionsContainer}>
                  {!selectedTeacher.isVerified && (
                    <TouchableOpacity
                      style={[styles.modalActionButton, styles.verifyButton, actionBusy && { opacity: 0.7 }]}
                      disabled={actionBusy}
                      onPress={async () => {
                        if (actionBusy) return;
                        setActionBusy(true);
                        try {
                          await verifyTeacher(selectedTeacher.uid);
                        } finally {
                          setActionBusy(false);
                        }
                      }}
                    >
                      {actionBusy ? (
                        <ActivityIndicator size="small" color="#ffffff" />
                      ) : (
                        <AntDesign name="check" size={18} color="#ffffff" />
                      )}
                      <Text style={styles.modalActionText}>Verify</Text>
                    </TouchableOpacity>
                  )}

                  {!selectedTeacher.isBlocked ? (
                    <TouchableOpacity
                      style={[styles.modalActionButton, styles.blockButton, actionBusy && { opacity: 0.7 }]}
                      disabled={actionBusy}
                      onPress={async () => {
                        if (actionBusy) return;
                        setActionBusy(true);
                        try {
                          await performToggleBlock(selectedTeacher.uid, false);
                        } finally {
                          setActionBusy(false);
                        }
                      }}
                    >
                      {actionBusy ? (
                        <ActivityIndicator size="small" color="#ffffff" />
                      ) : (
                        <MaterialIcons name="block" size={18} color="#ffffff" />
                      )}
                      <Text style={styles.modalActionText}>Block</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={[styles.modalActionButton, styles.unblockButton, actionBusy && { opacity: 0.7 }]}
                      disabled={actionBusy}
                      onPress={async () => {
                        if (actionBusy) return;
                        setActionBusy(true);
                        try {
                          await performToggleBlock(selectedTeacher.uid, true);
                        } finally {
                          setActionBusy(false);
                        }
                      }}
                    >
                      {actionBusy ? (
                        <ActivityIndicator size="small" color="#ffffff" />
                      ) : (
                        <MaterialIcons name="lock-open" size={18} color="#ffffff" />
                      )}
                      <Text style={styles.modalActionText}>Unblock</Text>
                    </TouchableOpacity>
                  )}
                </View>

              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Confirmation Panel Modal */}
      <Modal
        visible={confirmVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => !confirmLoading && setConfirmVisible(false)}
      >
        <View style={styles.confirmModalOverlay}>
          <View style={styles.confirmModalContent}>
            <Text style={styles.confirmModalTitle}>{confirmTitle}</Text>
            <Text style={styles.confirmModalMessage}>{confirmMessage}</Text>
            <View style={styles.confirmActions}>
              <TouchableOpacity
                style={[styles.confirmButton, styles.confirmCancelButton]}
                disabled={confirmLoading}
                onPress={() => setConfirmVisible(false)}
              >
                <Text style={styles.confirmCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.confirmButton,
                  styles.confirmPrimaryButton,
                  confirmDestructive && styles.confirmPrimaryDestructive,
                ]}
                disabled={confirmLoading || !pendingAction}
                onPress={async () => {
                  if (!pendingAction) return;
                  setConfirmLoading(true);
                  try {
                    await pendingAction();
                    setConfirmVisible(false);
                  } finally {
                    setConfirmLoading(false);
                    setPendingAction(null);
                  }
                }}
              >
                <Text style={styles.confirmPrimaryText}>{confirmPrimaryLabel}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Admin Announcement Modal */}
      <Modal visible={showAnnModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.announcementModal}>
            <View style={styles.announcementModalHeader}>
              <View style={styles.announcementModalTitleContainer}>
                <MaterialCommunityIcons name="bullhorn" size={24} color="#0ea5e9" />
                <Text style={styles.announcementModalTitle}>Create New Announcement</Text>
              </View>
              <TouchableOpacity onPress={() => setShowAnnModal(false)} style={styles.closeButton}>
                <AntDesign name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.announcementModalContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <View style={styles.announcementForm}>
                <View style={styles.announcementField}>
                  <Text style={styles.announcementFieldLabel}>Title</Text>
                  <TextInput
                    style={styles.announcementFieldInput}
                    value={annTitle}
                    onChangeText={setAnnTitle}
                    placeholder="e.g., System Maintenance, School Update"
                    placeholderTextColor="#94a3b8"
                  />
                </View>
                <View style={styles.announcementField}>
                  <Text style={styles.announcementFieldLabel}>Message</Text>
                  <TextInput
                    style={[styles.announcementFieldInput, styles.announcementMessageInput]}
                    value={annMessage}
                    onChangeText={setAnnMessage}
                    placeholder="Write your announcement message here..."
                    placeholderTextColor="#94a3b8"
                    multiline
                    textAlignVertical="top"
                  />
                </View>
                <View style={styles.announcementField}>
                  <Text style={styles.announcementFieldLabel}>Send To</Text>
                  <View style={styles.announcementRecipientPill}>
                    <MaterialCommunityIcons name="account-group" size={16} color="#ffffff" />
                    <Text style={styles.announcementRecipientPillText}>All Parents</Text>
                  </View>
                </View>
              </View>
            </ScrollView>
            <View style={styles.announcementModalFooter}>
              <TouchableOpacity style={styles.announcementCancelButton} onPress={() => setShowAnnModal(false)} disabled={sendingAnn}>
                <Text style={styles.announcementCancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.announcementSendButton, (!annTitle.trim() || !annMessage.trim()) && styles.announcementSendButtonDisabled]}
                disabled={sendingAnn || !annTitle.trim() || !annMessage.trim()}
                onPress={async () => {
                  if (!annTitle.trim() || !annMessage.trim()) return;
                  try {
                    setSendingAnn(true);
                    const now = new Date();
                    const id = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}-${Math.random().toString(36).slice(2,6).toUpperCase()}`;
                    const payload = {
                      id,
                      classIds: ['ALL_PARENTS'],
                      dateTime: now.toISOString(),
                      message: annMessage.trim(),
                      title: annTitle.trim(),
                      teacherId: 'admin',
                    };
                    const { success } = await writeData(`/announcements/${id}`, payload);
                    if (success) {
                      setShowAnnModal(false);
                      setAnnTitle('');
                      setAnnMessage('');
                    }
                  } finally {
                    setSendingAnn(false);
                  }
                }}
              >
                {sendingAnn ? (
                  <View style={styles.announcementLoadingContainer}>
                    <ActivityIndicator size="small" color="#ffffff" />
                    <Text style={styles.announcementSendButtonText}>Sending...</Text>
                  </View>
                ) : (
                  <View style={styles.announcementSendContainer}>
                    <MaterialCommunityIcons name="send" size={18} color="#ffffff" />
                    <Text style={styles.announcementSendButtonText}>Send</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Technical Report Modal */}
      <Modal visible={showTechReportModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
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
                style={styles.closeButton}
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
                  Please describe the issue you're experiencing. Be as detailed as possible and attach screenshots if available.
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
                    You can attach up to 5 screenshots
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
                            onPress={() => removeScreenshot(uri)}
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
                      onPress={takePhoto}
                      disabled={submittingReport || reportScreenshots.length >= 5}
                    >
                      <MaterialIcons name="photo-camera" size={20} color="#0ea5e9" />
                      <Text style={styles.screenshotButtonText}>Take Photo</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.screenshotButton}
                      onPress={pickImage}
                      disabled={submittingReport || reportScreenshots.length >= 5}
                    >
                      <MaterialIcons name="photo-library" size={20} color="#0ea5e9" />
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
                    <ActivityIndicator size="small" color="#ffffff" />
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
        </View>
      </Modal>
    </View>
  );
}

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f1f5f9',
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 100,
  },
  placeholderCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 24,
    borderWidth: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  placeholderTitle: {
    color: '#1e293b',
    fontSize: 20,
    fontWeight: '700',
  },
  placeholderSubtitle: {
    color: '#64748b',
    marginTop: 8,
    fontSize: 15,
  },
  welcomeHeader: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 24,
    borderWidth: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  welcomeTitle: {
    color: '#1e293b',
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  welcomeSubtitle: {
    color: '#64748b',
    marginTop: 6,
    fontSize: 14,
  },
  // Admin Home - Announcement Card
  announcementCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 24,
    borderWidth: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  announcementHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  announcementTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  announcementCardTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1e293b',
    letterSpacing: -0.3,
  },
  announcementQuickBadge: {
    backgroundColor: '#0ea5e9',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  announcementQuickBadgeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  announcementCardText: {
    color: '#475569',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
    marginBottom: 16,
  },
  announcementPrimaryButton: {
    backgroundColor: '#0ea5e9',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  announcementPrimaryButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 15,
    letterSpacing: 0.3,
  },
  // Home - Teachers overview styles
  homeTeachersCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 20,
    borderWidth: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 6,
  },
  homeTeachersHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  homeTeachersTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1e293b',
  },
  homeTeachersSubtitle: {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: '600',
  },
  homeTeachersList: {
    gap: 12,
  },
  homeTeacherRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  homeTeacherLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  homeTeacherAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: '#f1f5f9',
  },
  homeTeacherAvatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#0ea5e9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  homeTeacherInfo: {
    flex: 1,
  },
  homeTeacherName: {
    fontSize: 14,
    color: '#1e293b',
    fontWeight: '700',
  },
  homeTeacherEmail: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 2,
  },
  homeTeacherMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  homeTeacherMeta: {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: '600',
  },
  homeTeacherMetaSeparator: {
    fontSize: 12,
    color: '#cbd5e1',
    fontWeight: '700',
  },
  homeTeacherRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  dotVerified: {
    backgroundColor: '#10b981',
  },
  dotPending: {
    backgroundColor: '#f59e0b',
  },
  dotBlocked: {
    backgroundColor: '#ef4444',
  },
  homeTeacherStatusText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
  },
  // Teacher Management Styles
  teacherSection: {
    flex: 1,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
    paddingHorizontal: 4,
  },
  sectionTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#1e293b',
    letterSpacing: -0.5,
  },
  refreshButton: {
    // deprecated: replaced by pull-to-refresh
    display: 'none',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
    backgroundColor: '#ffffff',
    borderRadius: 20,
    marginHorizontal: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 4,
  },
  loadingText: {
    fontSize: 16,
    color: '#64748b',
    marginTop: 16,
    fontWeight: '500',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 80,
    backgroundColor: '#ffffff',
    borderRadius: 20,
    marginHorizontal: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 4,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#374151',
    marginTop: 20,
  },
  emptySubtitle: {
    fontSize: 15,
    color: '#9ca3af',
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 22,
  },
  teacherList: {
    gap: 20,
  },
  filtersWrap: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
    gap: 10,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#0f172a',
  },
  filterChips: {
    flexDirection: 'row',
    gap: 8,
  },
  filterChip: {
    backgroundColor: '#f1f5f9',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  filterChipActive: {
    backgroundColor: '#0ea5e9',
  },
  filterChipText: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '700',
  },
  filterChipTextActive: {
    color: '#ffffff',
  },
  teacherCard: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 24,
    borderWidth: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 6,
    marginHorizontal: 4,
  },
  teacherHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  teacherInfo: {
    flexDirection: 'row',
    flex: 1,
  },
  avatarContainer: {
    marginRight: 20,
  },
  avatar: {
    width: 70,
    height: 70,
    borderRadius: 35,
    borderWidth: 3,
    borderColor: '#f1f5f9',
  },
  avatarPlaceholder: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#0ea5e9',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#f1f5f9',
    shadowColor: '#0ea5e9',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  teacherDetails: {
    flex: 1,
    justifyContent: 'center',
  },
  teacherName: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1e293b',
    marginBottom: 6,
    letterSpacing: -0.3,
  },
  teacherEmail: {
    fontSize: 15,
    color: '#64748b',
    marginBottom: 4,
    fontWeight: '500',
  },
  teacherSchool: {
    fontSize: 14,
    color: '#94a3b8',
    fontWeight: '500',
  },
  statusBadges: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  verifiedBadge: {
    backgroundColor: '#10b981',
  },
  unverifiedBadge: {
    backgroundColor: '#f59e0b',
  },
  blockedBadge: {
    backgroundColor: '#ef4444',
  },
  badgeText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: 0.2,
  },
  teacherActions: {
    flexDirection: 'row',
    gap: 16,
    flexWrap: 'wrap',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 16,
    gap: 8,
    flex: 1,
    minWidth: (width - 120) / 2, // Responsive button width for 2 buttons
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
  verifyButton: {
    backgroundColor: '#10b981',
  },
  blockButton: {
    backgroundColor: '#ef4444',
  },
  unblockButton: {
    backgroundColor: '#0ea5e9',
  },
  removeButton: {
    backgroundColor: '#ef4444',
  },
  viewButton: {
    backgroundColor: '#6366f1',
  },
  actionButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: 0.3,
  },
  // Inline modal action buttons
  modalActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 14,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
  modalActionText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 15,
    letterSpacing: 0.3,
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    maxHeight: '90%',
    minHeight: '70%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingVertical: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1e293b',
    letterSpacing: -0.5,
  },
  closeButton: {
    padding: 8,
    borderRadius: 12,
    backgroundColor: '#f8fafc',
  },
  modalBody: {
    flex: 1,
  },
  // Header Styles (aligned with other dashboards)
  adminHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    paddingHorizontal: 0,
    paddingVertical: 12,
  },
  adminAvatarContainer: {
    marginRight: 16,
  },
  adminAvatar: {
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
  adminAvatarImage: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 3,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  adminWelcomeText: {
    flex: 1,
  },
  adminWelcomeLabel: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 4,
    fontWeight: '500',
  },
  adminWelcomeTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1e293b',
  },
  adminNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  // Admin Announcement Modal Styles
  announcementModal: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    maxHeight: '90%',
    minHeight: '60%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 16,
  },
  announcementModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingVertical: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  announcementModalTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  announcementModalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1e293b',
    letterSpacing: -0.3,
  },
  announcementModalContent: {
    flex: 1,
  },
  announcementForm: {
    paddingHorizontal: 28,
    paddingVertical: 20,
    gap: 18,
  },
  announcementField: {
    gap: 10,
  },
  announcementFieldLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#64748b',
  },
  announcementFieldInput: {
    backgroundColor: '#f8fafc',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    color: '#0f172a',
  },
  announcementMessageInput: {
    height: 140,
  },
  announcementRecipientPill: {
    alignSelf: 'flex-start',
    backgroundColor: '#0ea5e9',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  announcementRecipientPillText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 13,
  },
  announcementModalFooter: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  announcementCancelButton: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f1f5f9',
  },
  announcementCancelButtonText: {
    color: '#0f172a',
    fontWeight: '700',
    fontSize: 15,
  },
  announcementSendButton: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0ea5e9',
  },
  announcementSendButtonDisabled: {
    opacity: 0.6,
  },
  announcementLoadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  announcementSendContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  announcementSendButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 15,
  },
  // Confirmation Modal Styles
  confirmModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  confirmModalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    width: '90%',
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 16,
  },
  confirmModalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1e293b',
    marginBottom: 10,
    letterSpacing: -0.3,
  },
  confirmModalMessage: {
    fontSize: 15,
    color: '#475569',
    lineHeight: 22,
    marginBottom: 20,
  },
  confirmActions: {
    flexDirection: 'row',
    gap: 12,
  },
  confirmButton: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmCancelButton: {
    backgroundColor: '#f1f5f9',
  },
  confirmCancelText: {
    color: '#0f172a',
    fontWeight: '700',
    fontSize: 15,
  },
  confirmPrimaryButton: {
    backgroundColor: '#0ea5e9',
  },
  confirmPrimaryDestructive: {
    backgroundColor: '#ef4444',
  },
  confirmPrimaryText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 15,
  },
  profileSection: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 28,
    backgroundColor: '#f8fafc',
  },
  profileAvatarContainer: {
    marginBottom: 20,
  },
  profileAvatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 4,
    borderColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  profileAvatarPlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#0ea5e9',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: '#ffffff',
    shadowColor: '#0ea5e9',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  profileName: {
    fontSize: 26,
    fontWeight: '800',
    color: '#1e293b',
    marginBottom: 20,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  profileBadges: {
    flexDirection: 'row',
    gap: 16,
  },
  profileBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 4,
  },
  profileBadgeText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: 0.3,
  },
  detailsSection: {
    paddingHorizontal: 28,
    paddingVertical: 32,
  },
  detailsTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1e293b',
    marginBottom: 24,
    letterSpacing: -0.3,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    gap: 20,
    paddingVertical: 8,
  },
  detailContent: {
    flex: 1,
  },
  detailLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#64748b',
    marginBottom: 6,
    letterSpacing: 0.2,
  },
  detailValue: {
    fontSize: 17,
    color: '#1e293b',
    fontWeight: '600',
    lineHeight: 24,
  },
  modalActionsContainer: {
    flexDirection: 'row',
    gap: 16,
    paddingHorizontal: 28,
    paddingBottom: 32,
    marginTop: -8,
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
  activeNavItem: {},
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
  activeIndicator: {
    position: 'absolute',
    top: -8,
    width: 28,
    height: 3,
    borderRadius: 999,
    backgroundColor: 'transparent',
  },
  activeIndicatorOn: {
    backgroundColor: '#0ea5e9',
  },
  // Reports Tab Styles
  reportsPageHeader: {
    marginBottom: 24,
  },
  reportsPageTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: '#1e293b',
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  reportsPageSubtitle: {
    fontSize: 15,
    color: '#64748b',
    fontWeight: '500',
  },
  shakeHintCard: {
    backgroundColor: '#eff6ff',
    borderRadius: 20,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 24,
    borderWidth: 2,
    borderColor: '#bfdbfe',
    shadowColor: '#0ea5e9',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  shakeHintIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#0ea5e9',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  shakeHintTextContainer: {
    flex: 1,
  },
  shakeHintTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1e40af',
    marginBottom: 4,
  },
  shakeHintText: {
    fontSize: 14,
    color: '#1e40af',
    fontWeight: '500',
    lineHeight: 20,
  },
  reportsCard: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 24,
    marginBottom: 24,
    borderWidth: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  reportsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  reportsHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  reportsIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#fee2e2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  reportsIconContainerWarning: {
    backgroundColor: '#fef3c7',
  },
  reportsTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1e293b',
    letterSpacing: -0.3,
  },
  reportsSubtitle: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '500',
    marginTop: 2,
  },
  reportsBadge: {
    backgroundColor: '#ef4444',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    minWidth: 36,
    alignItems: 'center',
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  reportsBadgeWarning: {
    backgroundColor: '#f59e0b',
    shadowColor: '#f59e0b',
  },
  reportsBadgeText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  logsLoadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 40,
  },
  logsLoadingText: {
    fontSize: 15,
    color: '#64748b',
    fontWeight: '600',
  },
  emptyLogsContainer: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyLogsIconContainer: {
    marginBottom: 16,
  },
  emptyLogsTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1e293b',
    marginBottom: 6,
  },
  emptyLogsText: {
    fontSize: 14,
    color: '#94a3b8',
    fontWeight: '500',
  },
  reportsList: {
    gap: 16,
  },
  reportItem: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 18,
    borderWidth: 2,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  reportItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  reportItemLeft: {
    flex: 1,
    gap: 6,
  },
  reportItemUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  reportItemUser: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1e293b',
  },
  reportUserRoleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    marginLeft: 8,
  },
  reportUserRoleTeacher: {
    backgroundColor: '#dbeafe',
  },
  reportUserRoleParent: {
    backgroundColor: '#fce7f3',
  },
  reportUserRoleAdmin: {
    backgroundColor: '#f3e8ff',
  },
  reportUserRoleText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#1e293b',
    letterSpacing: 0.5,
  },
  reportItemTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  reportItemTime: {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: '500',
  },
  reportStatusBadge: {
    backgroundColor: '#f59e0b',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  reportStatusResolved: {
    backgroundColor: '#10b981',
  },
  reportStatusInProgress: {
    backgroundColor: '#3b82f6',
  },
  reportStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#ffffff',
  },
  reportStatusDotResolved: {
    backgroundColor: '#ffffff',
  },
  reportStatusDotInProgress: {
    backgroundColor: '#ffffff',
  },
  reportStatusText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 0.3,
  },
  reportItemDescriptionContainer: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  reportItemDescription: {
    fontSize: 14,
    color: '#1e293b',
    lineHeight: 21,
    fontWeight: '500',
  },
  reportScreenshotsContainer: {
    marginTop: 4,
  },
  reportScreenshotsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  reportScreenshotsLabel: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '600',
  },
  reportScreenshotsScroll: {
    flexDirection: 'row',
    marginHorizontal: -4,
  },
  reportScreenshotWrapper: {
    marginHorizontal: 4,
  },
  reportScreenshotThumb: {
    width: 100,
    height: 100,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
    borderWidth: 2,
    borderColor: '#e2e8f0',
  },
  reportActionsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  markDoneButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10b981',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    gap: 8,
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  markDoneButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: 0.3,
  },
  removeReportButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ef4444',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    gap: 8,
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  removeReportButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: 0.3,
  },
  logsFiltersWrap: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 14,
    marginBottom: 20,
    gap: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  logsList: {
    gap: 12,
  },
  logItem: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 14,
    borderLeftWidth: 4,
    borderLeftColor: '#e2e8f0',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  logItemError: {
    borderLeftColor: '#ef4444',
    backgroundColor: '#fef2f2',
  },
  logItemWarning: {
    borderLeftColor: '#f59e0b',
    backgroundColor: '#fffbeb',
  },
  logItemInfo: {
    borderLeftColor: '#3b82f6',
    backgroundColor: '#eff6ff',
  },
  logItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  logSeverityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  logSeverityError: {
    backgroundColor: '#ef4444',
  },
  logSeverityWarning: {
    backgroundColor: '#f59e0b',
  },
  logSeverityInfo: {
    backgroundColor: '#3b82f6',
  },
  logSeverityText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 0.5,
  },
  logItemTimeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  logItemTime: {
    fontSize: 11,
    color: '#94a3b8',
    fontWeight: '600',
  },
  logItemMessage: {
    fontSize: 14,
    color: '#1e293b',
    lineHeight: 20,
    marginBottom: 8,
    fontWeight: '500',
  },
  logItemMeta: {
    flexDirection: 'row',
    gap: 16,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  logItemMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  logItemSource: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '600',
  },
  logItemUser: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '600',
  },
  // Technical Report Modal Styles
  techReportModal: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    maxHeight: '90%',
    minHeight: '70%',
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
    color: '#0ea5e9',
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
    backgroundColor: '#ef4444',
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


