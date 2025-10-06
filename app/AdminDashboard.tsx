import { AntDesign, MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Dimensions, FlatList, Image, Modal, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { getCurrentUser, onAuthChange } from '../lib/firebase-auth';
import { deleteData, readData, updateData, writeData } from '../lib/firebase-database';

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
        >
          <View style={styles.placeholderCard}>
            <Text style={styles.placeholderTitle}>Reports</Text>
            <Text style={styles.placeholderSubtitle}>This section is intentionally blank.</Text>
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
});


