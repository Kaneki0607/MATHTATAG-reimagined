import { AntDesign, MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Easing, FlatList, Image, Modal, Platform, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useResponsive } from '../hooks/useResponsive';
import { useResponsiveLayout, useResponsiveValue } from '../hooks/useResponsiveLayout';
import { createAnnouncement } from '../lib/entity-helpers';
import { getCurrentUser, onAuthChange } from '../lib/firebase-auth';
import { deleteData, listenToData, readData, stopListening, updateData } from '../lib/firebase-database';

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

interface TechnicalReport {
  id: string;
  ticketId?: string; // Legacy field for backward compatibility
  ticketNumber: string; // Numeric-only ticket number
  reportedBy: string;
  reportedByEmail: string;
  reportedByName?: string;
  userRole?: 'teacher' | 'parent' | 'admin';
  timestamp: string;
  description: string;
  screenshots: string[];
  status: 'pending' | 'in_progress' | 'resolved';
  priority?: 'low' | 'medium' | 'high' | 'critical';
  category?: string;
  resolvedAt?: string;
  resolvedBy?: string;
  // App metadata fields
  appVersion?: string;
  updateId?: string | null;
  runtimeVersion?: string | null;
  platform?: string;
  platformVersion?: string;
  deviceInfo?: string;
  environment?: string;
  buildProfile?: string;
  expoVersion?: string;
  submittedAt?: string;
}

export default function AdminDashboard() {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const responsive = useResponsive();
  const layout = useResponsiveLayout();
  
  // Responsive values
  const containerPadding = useResponsiveValue({
    mobile: 16,
    tablet: 24,
    desktop: 32,
    default: 16,
  });
  
  const headerHeight = useResponsiveValue({
    mobile: 80,
    tablet: 100,
    desktop: 120,
    default: 80,
  });
  
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

  // Technical reports state
  const [technicalReports, setTechnicalReports] = useState<TechnicalReport[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

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

  // Bottom navigation animation
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 350,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  // Teacher stats (sections and student counts)
  const [teacherStats, setTeacherStats] = useState<Record<string, { sectionCount: number; studentCount: number }>>({});
  const [statsLoading, setStatsLoading] = useState(false);

  const computeTeacherStats = async (teacherList: Teacher[]) => {
    try {
      setStatsLoading(true);
      // Source of truth for classes is /classes; still read /sections for legacy mapping
      const [{ data: classesData }, { data: sectionsData }, { data: studentsData }] = await Promise.all([
        readData('/classes'),
        readData('/sections'),
        readData('/students'),
      ]);
      const classesArray: Array<any & { id: string }> = Object.entries(classesData || {}).map(([id, v]: any) => ({ id, ...(v || {}) }));
      const sectionsArray: Array<any & { id: string }> = Object.entries(sectionsData || {}).map(([id, v]: any) => ({ id, ...(v || {}) }));
      const studentsArray: Array<any & { id: string }> = Object.entries(studentsData || {}).map(([id, v]: any) => ({ id, ...(v || {}) }));

      const result: Record<string, { sectionCount: number; studentCount: number }> = {};

      for (const teacher of teacherList) {
        // Prefer classes for section count; fallback to sections if any exist
        const teacherClassIds = classesArray
          .filter(c => c.teacherId === teacher.uid)
          .map(c => c.id);
        const sectionCount = teacherClassIds.length > 0
          ? teacherClassIds.length
          : sectionsArray.filter(s => s.teacherId === teacher.uid).length;

        const classIdsForCount = teacherClassIds.length > 0
          ? teacherClassIds
          : sectionsArray.filter(s => s.teacherId === teacher.uid).map(s => s.id);

        const studentCount = studentsArray.filter(stu => classIdsForCount.includes(stu.classId || stu.sectionId)).length;
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
        await fetchTechnicalReports();
      } finally {
        setRefreshing(false);
      }
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

  // Load technical reports with real-time updates when Reports tab is selected
  useEffect(() => {
    if (activeTab === 'reports') {
      setLogsLoading(true);
      
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
        setLogsLoading(false);
      });

      // Cleanup listener when leaving Reports tab
      return () => {
        stopListening('/technicalReports');
      };
    }
  }, [activeTab]);

  // Mark technical report as done (resolved)
  const handleMarkReportAsDone = async (reportId: string) => {
    try {
      const user = getCurrentUser();
      const { success, error } = await updateData(`/technicalReports/${reportId}`, {
        status: 'resolved',
        resolvedAt: new Date().toISOString(),
        resolvedBy: user?.uid || 'admin',
      });

      if (success) {
        // Update local state immediately
        setTechnicalReports(prev => 
          prev.map(report => 
            report.id === reportId ? { 
              ...report, 
              status: 'resolved',
              resolvedAt: new Date().toISOString(),
              resolvedBy: user?.uid || 'admin'
            } : report
          )
        );
        Alert.alert('Success', 'Technical report sent to Super Admin successfully.');
      } else {
        console.error('Failed to mark report as done:', error);
        Alert.alert('Error', 'Failed to send report.');
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
            <ActivityIndicator size="large" color="#0ea5e9" />
            <Text style={styles.loadingText}>Loading teachers...</Text>
          </View>
        ) : activeTeachers.length === 0 ? (
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconCircle}>
              <MaterialCommunityIcons name="account-group-outline" size={64} color="#0ea5e9" />
            </View>
            <Text style={styles.emptyTitle}>No Active Teachers</Text>
            <Text style={styles.emptySubtitle}>Active (unblocked) teachers will appear here.</Text>
          </View>
        ) : (
          <FlatList
            data={filteredActiveTeachers}
            keyExtractor={(t) => t.uid}
            refreshing={refreshing}
            onRefresh={onRefresh}
            contentContainerStyle={[styles.teacherList, { padding: 20, paddingTop: 30, paddingBottom: 100 }]}
            ListHeaderComponent={
              <View>
                <View style={styles.teacherPageHeader}>
                  <View style={styles.teacherPageHeaderIcon}>
                    <MaterialCommunityIcons name="account-group" size={32} color="#0ea5e9" />
                  </View>
                  <View style={styles.teacherPageHeaderText}>
                    <Text style={styles.teacherPageTitle}>Teacher Management</Text>
                    <Text style={styles.teacherPageSubtitle}>{filteredActiveTeachers.length} {filteredActiveTeachers.length === 1 ? 'teacher' : 'teachers'} found</Text>
                  </View>
                </View>
                <View style={styles.filtersWrap}>
                  <View style={styles.searchBox}>
                    <View style={styles.searchIconWrapper}>
                      <MaterialIcons name="search" size={20} color="#0ea5e9" />
                    </View>
                    <TextInput
                      style={styles.searchInput}
                      placeholder="Search by name, email, or school"
                      placeholderTextColor="#94a3b8"
                      value={searchQuery}
                      onChangeText={setSearchQuery}
                      returnKeyType="search"
                    />
                    {searchQuery.length > 0 && (
                      <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearSearchButton}>
                        <MaterialIcons name="close" size={18} color="#64748b" />
                      </TouchableOpacity>
                    )}
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
                      <MaterialCommunityIcons name="check-decagram" size={14} color={statusFilter === 'verified' ? '#ffffff' : '#10b981'} />
                      <Text style={[styles.filterChipText, statusFilter === 'verified' && styles.filterChipTextActive]}>Verified</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.filterChip, statusFilter === 'pending' && styles.filterChipActive]}
                      onPress={() => setStatusFilter('pending')}
                    >
                      <MaterialCommunityIcons name="clock-outline" size={14} color={statusFilter === 'pending' ? '#ffffff' : '#f59e0b'} />
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
                        <View style={[styles.avatarPlaceholder, !teacher.isVerified && styles.avatarPlaceholderPending]}>
                          <MaterialCommunityIcons 
                            name="account" 
                            size={28} 
                            color="#ffffff" 
                          />
                        </View>
                      )}
                      {teacher.isVerified && (
                        <View style={styles.verifiedCheckmark}>
                          <MaterialCommunityIcons name="check-decagram" size={18} color="#10b981" />
                        </View>
                      )}
                    </View>
                    <View style={styles.teacherDetails}>
                      <Text style={styles.teacherName}>
                        {teacher.firstName} {teacher.lastName}
                      </Text>
                      <View style={styles.teacherMetaRow}>
                        <MaterialIcons name="email" size={14} color="#64748b" />
                        <Text style={styles.teacherEmail}>{teacher.email}</Text>
                      </View>
                      <View style={styles.teacherMetaRow}>
                        <MaterialIcons name="school" size={14} color="#64748b" />
                        <Text style={styles.teacherSchool}>{teacher.school}</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                  <View style={styles.statusBadges}>
                    {teacher.isVerified ? (
                      <View style={[styles.badge, styles.verifiedBadge]}>
                        <MaterialCommunityIcons name="check-circle" size={14} color="#ffffff" />
                        <Text style={styles.badgeText}>Verified</Text>
                      </View>
                    ) : (
                      <View style={[styles.badge, styles.unverifiedBadge]}>
                        <MaterialCommunityIcons name="clock-outline" size={14} color="#ffffff" />
                        <Text style={styles.badgeText}>Pending</Text>
                      </View>
                    )}
                  </View>
                </View>
                
                <View style={styles.teacherCardDivider} />
                
                <View style={styles.teacherActions}>
                  <TouchableOpacity 
                    style={[styles.actionButton, styles.viewButton]}
                    onPress={() => openTeacherProfile(teacher)}
                  >
                    <MaterialIcons name="visibility" size={18} color="#ffffff" />
                    <Text style={styles.actionButtonText}>View Profile</Text>
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
            <ActivityIndicator size="large" color="#ef4444" />
            <Text style={styles.loadingText}>Loading blocked teachers...</Text>
          </View>
        ) : blockedTeachers.length === 0 ? (
          <View style={styles.emptyContainer}>
            <View style={[styles.emptyIconCircle, styles.emptyIconCircleSuccess]}>
              <MaterialCommunityIcons name="shield-check" size={64} color="#10b981" />
            </View>
            <Text style={styles.emptyTitle}>No Blocked Teachers</Text>
            <Text style={styles.emptySubtitle}>All teachers are currently active. Blocked accounts will appear here.</Text>
          </View>
        ) : (
          <FlatList
            data={blockedTeachers}
            keyExtractor={(t) => t.uid}
            refreshing={refreshing}
            onRefresh={onRefresh}
            contentContainerStyle={[styles.teacherList, { padding: 20, paddingTop: 30, paddingBottom: 100 }]}
            ListHeaderComponent={
              <View>
                <View style={styles.blocklistPageHeader}>
                  <View style={styles.blocklistPageHeaderIcon}>
                    <MaterialIcons name="block" size={32} color="#ef4444" />
                  </View>
                  <View style={styles.blocklistPageHeaderText}>
                    <Text style={styles.blocklistPageTitle}>Blocked Teachers</Text>
                    <Text style={styles.blocklistPageSubtitle}>{blockedTeachers.length} blocked {blockedTeachers.length === 1 ? 'account' : 'accounts'}</Text>
                  </View>
                </View>
              </View>
            }
            renderItem={({ item: teacher }) => (
              <View style={[styles.teacherCard, styles.blockedTeacherCard]}>
                <View style={styles.blockedBanner}>
                  <MaterialIcons name="block" size={16} color="#ef4444" />
                  <Text style={styles.blockedBannerText}>Account Blocked</Text>
                </View>
                
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
                          style={[styles.avatar, styles.avatarBlocked]} 
                        />
                      ) : (
                        <View style={[styles.avatarPlaceholder, styles.avatarPlaceholderBlocked]}>
                          <MaterialCommunityIcons 
                            name="account-off" 
                            size={28} 
                            color="#ffffff" 
                          />
                        </View>
                      )}
                      <View style={styles.blockedOverlay}>
                        <MaterialIcons name="block" size={20} color="#ef4444" />
                      </View>
                    </View>
                    <View style={styles.teacherDetails}>
                      <Text style={styles.teacherName}>
                        {teacher.firstName} {teacher.lastName}
                      </Text>
                      <View style={styles.teacherMetaRow}>
                        <MaterialIcons name="email" size={14} color="#64748b" />
                        <Text style={styles.teacherEmail}>{teacher.email}</Text>
                      </View>
                      <View style={styles.teacherMetaRow}>
                        <MaterialIcons name="school" size={14} color="#64748b" />
                        <Text style={styles.teacherSchool}>{teacher.school}</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                  <View style={styles.statusBadges}>
                    <View style={[styles.badge, styles.blockedBadge]}>
                      <AntDesign name="stop" size={14} color="#ffffff" />
                      <Text style={styles.badgeText}>Blocked</Text>
                    </View>
                  </View>
                </View>

                <View style={styles.teacherCardDivider} />

                <View style={styles.teacherActions}>
                  <TouchableOpacity 
                    style={[styles.actionButton, styles.unblockButton]}
                    onPress={() => confirmToggleBlock(teacher.uid, true)}
                  >
                    <MaterialIcons name="lock-open" size={18} color="#ffffff" />
                    <Text style={styles.actionButtonText}>Unblock</Text>
                  </TouchableOpacity>

                  <TouchableOpacity 
                    style={[styles.actionButton, styles.removeButton]}
                    onPress={() => confirmRemoveTeacher(teacher.uid)}
                  >
                    <MaterialCommunityIcons name="delete-outline" size={18} color="#ffffff" />
                    <Text style={styles.actionButtonText}>Remove Forever</Text>
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
          contentContainerStyle={[styles.scrollContent, { paddingTop: 30 }]}
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
            <View style={styles.reportsPageHeaderIcon}>
              <MaterialCommunityIcons name="chart-box" size={32} color="#0ea5e9" />
            </View>
            <View style={styles.reportsPageHeaderText}>
              <Text style={styles.reportsPageTitle}>Reports & Analytics</Text>
              <Text style={styles.reportsPageSubtitle}>Monitor technical issues and user reports</Text>
            </View>
          </View>

          {/* Technical Reports Section */}
          <View style={styles.reportsCard}>
            <View style={styles.reportsHeader}>
              <View style={styles.reportsHeaderLeft}>
                <View style={styles.reportsIconContainer}>
                  <MaterialCommunityIcons name="bug-outline" size={26} color="#ef4444" />
                </View>
                <View style={styles.reportsHeaderTextContainer}>
                  <Text style={styles.reportsTitle}>Technical Reports</Text>
                  <Text style={styles.reportsSubtitle}>User-submitted technical issues</Text>
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
                  <View 
                    key={report.id} 
                    style={[
                      styles.reportListItem,
                      report.status === 'resolved' && styles.reportListItemResolved,
                    ]}
                  >
                    <View style={styles.reportListItemContent}>
                      <View style={styles.reportListItemLeft}>
                        <MaterialIcons name="confirmation-number" size={22} color="#0ea5e9" />
                        <View style={styles.reportTicketInfo}>
                          <Text style={styles.reportListItemId}>
                            Ticket: {report.ticketNumber || report.ticketId || report.id}
                          </Text>
                          <Text style={styles.reportListItemMeta}>
                            {report.reportedByName || report.reportedByEmail}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.reportListItemActions}>
                        {report.status !== 'resolved' ? (
                          <TouchableOpacity 
                            style={styles.sendToSuperAdminButton}
                            onPress={() => {
                              handleMarkReportAsDone(report.id);
                            }}
                          >
                            <MaterialCommunityIcons name="send" size={16} color="#ffffff" />
                            <Text style={styles.sendToSuperAdminButtonText}>Send</Text>
                          </TouchableOpacity>
                        ) : (
                          <View style={styles.sentBadge}>
                            <MaterialCommunityIcons name="check-circle" size={14} color="#10b981" />
                            <Text style={styles.sentBadgeText}>Sent</Text>
                          </View>
                        )}
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
          
          <View style={{ height: 90 }} />
        </ScrollView>
      )}

      <Animated.View style={[styles.bottomNav, { opacity: fadeAnim }]}>
        <TouchableOpacity style={[styles.navItem, activeTab === 'home' && styles.activeNavItem]} onPress={() => setActiveTab('home')}>
          <AntDesign name="home" size={24} color={activeTab === 'home' ? '#1e293b' : '#9ca3af'} />
          <Text style={[styles.navText, activeTab === 'home' && styles.activeNavText]}>Home</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.navItem, activeTab === 'teacher' && styles.activeNavItem]} onPress={() => setActiveTab('teacher')}>
          <MaterialCommunityIcons name="account-group" size={24} color={activeTab === 'teacher' ? '#1e293b' : '#9ca3af'} />
          <Text style={[styles.navText, activeTab === 'teacher' && styles.activeNavText]}>Teacher</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.navItem, activeTab === 'blocklist' && styles.activeNavItem]} onPress={() => setActiveTab('blocklist')}>
          <MaterialIcons name="block" size={24} color={activeTab === 'blocklist' ? '#1e293b' : '#9ca3af'} />
          <Text style={[styles.navText, activeTab === 'blocklist' && styles.activeNavText]}>Blocklist</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.navItem, activeTab === 'reports' && styles.activeNavItem]} onPress={() => setActiveTab('reports')}>
          <MaterialIcons name="assessment" size={24} color={activeTab === 'reports' ? '#1e293b' : '#9ca3af'} />
          <Text style={[styles.navText, activeTab === 'reports' && styles.activeNavText]}>Reports</Text>
        </TouchableOpacity>
      </Animated.View>

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
                    
                    // Create announcement with readable ID (ANNOUNCEMENT-0001, etc.)
                    const result = await createAnnouncement({
                      title: annTitle.trim(),
                      message: annMessage.trim(),
                      teacherId: 'admin',
                      classIds: ['ALL_PARENTS']
                    });
                    
                    if (result.success) {
                      console.log(`[CreateAnnouncement] Admin created announcement: ${result.announcementId}`);
                      setShowAnnModal(false);
                      setAnnTitle('');
                      setAnnMessage('');
                    } else {
                      Alert.alert('Error', result.error || 'Failed to send announcement');
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

    </View>
  );
}

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
    fontSize: 18,
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
    fontSize: 18,
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
    fontSize: 16,
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
    fontSize: 14,
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
    fontSize: 16,
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
  teacherPageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 20,
    paddingHorizontal: 4,
  },
  teacherPageHeaderIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#eff6ff',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#bfdbfe',
  },
  teacherPageHeaderText: {
    flex: 1,
  },
  teacherPageTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1e293b',
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  teacherPageSubtitle: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '600',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
    paddingHorizontal: 4,
  },
  sectionTitle: {
    fontSize: 16,
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
    paddingTop: 100,
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
    fontSize: 14,
    color: '#64748b',
    marginTop: 16,
    fontWeight: '500',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 80,
    paddingTop: 120,
    backgroundColor: '#ffffff',
    borderRadius: 20,
    marginHorizontal: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 4,
  },
  emptyIconCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#eff6ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 3,
    borderColor: '#bfdbfe',
  },
  emptyIconCircleSuccess: {
    backgroundColor: '#f0fdf4',
    borderColor: '#bbf7d0',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1e293b',
    marginTop: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 20,
  },
  teacherList: {
    gap: 20,
  },
  filtersWrap: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 6,
    gap: 14,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#f8fafc',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 2,
    borderColor: '#e2e8f0',
  },
  searchIconWrapper: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#eff6ff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#0f172a',
    fontWeight: '500',
  },
  clearSearchButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#e2e8f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterChips: {
    flexDirection: 'row',
    gap: 10,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#f1f5f9',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  filterChipActive: {
    backgroundColor: '#0ea5e9',
    borderColor: '#0284c7',
  },
  filterChipText: {
    fontSize: 13,
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
  avatarPlaceholderPending: {
    backgroundColor: '#f59e0b',
    shadowColor: '#f59e0b',
  },
  avatarPlaceholderBlocked: {
    backgroundColor: '#64748b',
    shadowColor: '#64748b',
    opacity: 0.6,
  },
  avatarBlocked: {
    opacity: 0.5,
  },
  verifiedCheckmark: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 2,
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  blockedOverlay: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 3,
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  teacherDetails: {
    flex: 1,
    justifyContent: 'center',
    gap: 6,
  },
  teacherMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  teacherName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1e293b',
    letterSpacing: -0.3,
  },
  teacherEmail: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '500',
  },
  teacherSchool: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '500',
  },
  teacherCardDivider: {
    height: 1,
    backgroundColor: '#f1f5f9',
    marginVertical: 18,
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
    paddingVertical: 7,
    borderRadius: 16,
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
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
    fontSize: 12,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 0.3,
  },
  // Blocklist Styles
  blocklistPageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 20,
    paddingHorizontal: 4,
  },
  blocklistPageHeaderIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#fef2f2',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#fecaca',
  },
  blocklistPageHeaderText: {
    flex: 1,
  },
  blocklistPageTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1e293b',
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  blocklistPageSubtitle: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '600',
  },
  blockedTeacherCard: {
    borderLeftWidth: 4,
    borderLeftColor: '#ef4444',
    backgroundColor: '#fefefe',
  },
  blockedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fef2f2',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  blockedBannerText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#ef4444',
    letterSpacing: 0.3,
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
    minWidth: 140, // Minimum width for responsive layout
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
    fontSize: 14,
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
    fontSize: 14,
    letterSpacing: 0.3,
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
    alignItems: 'center',
    padding: 0,
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    maxHeight: '90%',
    minHeight: '70%',
    width: '92%',
    maxWidth: 460,
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
    fontSize: 16,
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
    fontSize: 18,
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
    fontSize: 18,
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
    fontSize: 18,
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
    fontSize: 20,
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
    fontSize: 18,
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
    fontSize: 15,
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
  // Reports Tab Styles
  reportsPageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 24,
  },
  reportsPageHeaderIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#eff6ff',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#bfdbfe',
  },
  reportsPageHeaderText: {
    flex: 1,
  },
  reportsPageTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1e293b',
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  reportsPageSubtitle: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '600',
  },
  shakeHintCard: {
    backgroundColor: '#eff6ff',
    borderRadius: 20,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 24,
    borderWidth: 3,
    borderColor: '#bfdbfe',
    shadowColor: '#0ea5e9',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  shakeHintIconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#0ea5e9',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 2,
    borderColor: '#bfdbfe',
  },
  shakeHintTextContainer: {
    flex: 1,
  },
  shakeHintTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1e40af',
    marginBottom: 4,
    letterSpacing: -0.3,
  },
  shakeHintText: {
    fontSize: 12,
    color: '#3b82f6',
    fontWeight: '600',
    lineHeight: 19,
  },
  shakeHintBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#0ea5e9',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#0ea5e9',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
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
    paddingBottom: 18,
    borderBottomWidth: 2,
    borderBottomColor: '#f1f5f9',
  },
  reportsHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    flex: 1,
  },
  reportsIconContainer: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#fee2e2',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fecaca',
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  reportsIconContainerWarning: {
    backgroundColor: '#fef3c7',
    borderColor: '#fde68a',
    shadowColor: '#f59e0b',
  },
  reportsHeaderTextContainer: {
    flex: 1,
  },
  reportsTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1e293b',
    letterSpacing: -0.3,
    marginBottom: 2,
  },
  reportsSubtitle: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '600',
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
    fontSize: 12,
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
    fontSize: 13,
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
    fontSize: 16,
    fontWeight: '800',
    color: '#1e293b',
    marginBottom: 6,
  },
  emptyLogsText: {
    fontSize: 13,
    color: '#94a3b8',
    fontWeight: '500',
  },
  reportsList: {
    gap: 16,
  },
  reportItem: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 20,
    borderWidth: 2,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  reportItemResolved: {
    backgroundColor: '#f0fdf4',
    borderColor: '#bbf7d0',
  },
  reportItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  reportItemLeft: {
    flex: 1,
    gap: 8,
    marginRight: 12,
  },
  reportItemTicketRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  reportItemTicketId: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0ea5e9',
    letterSpacing: 0.5,
    backgroundColor: '#eff6ff',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  reportItemUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  reportUserIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f8fafc',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#e2e8f0',
  },
  reportUserInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  reportItemUser: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1e293b',
    letterSpacing: -0.2,
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
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    shadowColor: '#f59e0b',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  reportStatusResolved: {
    backgroundColor: '#10b981',
    shadowColor: '#10b981',
  },
  reportStatusInProgress: {
    backgroundColor: '#3b82f6',
    shadowColor: '#3b82f6',
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
    letterSpacing: 0.4,
  },
  reportItemDescriptionContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#f8fafc',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  reportItemDescription: {
    flex: 1,
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
    fontSize: 18,
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
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingBottom: 48,
    paddingTop: 12,
    gap: 12,
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

  // Simplified Report List Styles
  reportListItem: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  reportListItemResolved: {
    backgroundColor: '#f0fdf4',
    borderColor: '#bbf7d0',
  },
  reportListItemContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  reportListItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    marginRight: 12,
  },
  reportTicketInfo: {
    flex: 1,
    gap: 4,
  },
  reportListItemId: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1e293b',
    letterSpacing: 0.2,
  },
  reportListItemMeta: {
    fontSize: 12,
    fontWeight: '500',
    color: '#64748b',
  },
  reportListItemActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sendToSuperAdminButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0ea5e9',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    gap: 6,
    shadowColor: '#0ea5e9',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
    minWidth: 80,
  },
  sendToSuperAdminButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: 0.3,
  },
  sentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#f0fdf4',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  sentBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#10b981',
  },
  reportListItemRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  reportListItemStatus: {
    backgroundColor: '#f59e0b',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minWidth: 80,
    justifyContent: 'center',
  },
  reportListItemStatusResolved: {
    backgroundColor: '#10b981',
  },
  reportListItemStatusInProgress: {
    backgroundColor: '#3b82f6',
  },
  reportListItemStatusText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: 0.2,
  },

  // Report Details Modal Styles
  reportDetailsModal: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    maxHeight: '85%',
    minHeight: '60%',
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  reportDetailsModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  reportDetailsModalTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  reportDetailsModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
  },
  reportDetailsModalCloseButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#f8fafc',
  },
  reportDetailsModalContent: {
    flex: 1,
    padding: 20,
    minHeight: 200,
  },
  reportDetailsSection: {
    marginBottom: 24,
  },
  reportDetailsSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 12,
  },
  reportDetailsUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  reportDetailsUserIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reportDetailsUserInfo: {
    flex: 1,
  },
  reportDetailsUserName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 4,
  },
  reportDetailsUserRoleBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  reportDetailsUserRoleTeacher: {
    backgroundColor: '#dbeafe',
  },
  reportDetailsUserRoleParent: {
    backgroundColor: '#fce7f3',
  },
  reportDetailsUserRoleAdmin: {
    backgroundColor: '#ede9fe',
  },
  reportDetailsUserRoleText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
  },
  reportDetailsStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  reportDetailsStatusBadge: {
    backgroundColor: '#f59e0b',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  reportDetailsStatusResolved: {
    backgroundColor: '#10b981',
  },
  reportDetailsStatusInProgress: {
    backgroundColor: '#3b82f6',
  },
  reportDetailsStatusText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
  },
  reportDetailsTimeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f9ff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    gap: 12,
  },
  reportDetailsTimeIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#dbeafe',
    justifyContent: 'center',
    alignItems: 'center',
  },
  reportDetailsTimeContent: {
    flex: 1,
  },
  reportDetailsTimeLabel: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '500',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  reportDetailsTime: {
    fontSize: 15,
    color: '#1e293b',
    fontWeight: '600',
  },
  reportDetailsDescriptionContainer: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  reportDetailsDescription: {
    fontSize: 15,
    color: '#374151',
    lineHeight: 22,
  },
  reportDetailsScreenshotsScroll: {
    marginTop: 8,
  },
  reportDetailsScreenshotWrapper: {
    marginRight: 12,
  },
  reportDetailsScreenshot: {
    width: 120,
    height: 120,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
  },
  reportDetailsResolutionInfo: {
    backgroundColor: '#f0fdf4',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  reportDetailsResolutionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  reportDetailsResolutionText: {
    fontSize: 14,
    color: '#059669',
    fontWeight: '500',
  },
  reportDetailsResolutionBy: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '500',
  },
  reportDetailsModalActions: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  reportDetailsMarkDoneButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10b981',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    gap: 8,
  },
  reportDetailsMarkDoneButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
  },
  reportDetailsRemoveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ef4444',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    gap: 8,
  },
  reportDetailsRemoveButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
  },
});


