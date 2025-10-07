import { AntDesign, MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Dimensions, FlatList, Image, Modal, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { getCurrentUser, onAuthChange } from '../lib/firebase-auth';
import { deleteData, pushData, readData, updateData, writeData } from '../lib/firebase-database';

type TabKey = 'home' | 'teachers' | 'admins' | 'apikeys' | 'logs';

interface Admin {
  uid: string;
  email: string;
  firstName?: string;
  lastName?: string;
  createdAt?: string;
  isAdmin?: boolean;
}

interface Teacher {
  uid: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  school?: string;
  gender?: string;
  profilePictureUrl?: string;
  createdAt: string;
  isVerified?: boolean;
  isBlocked?: boolean;
  isAdmin?: boolean; // New field to track admin access
}

interface Log {
  id: string;
  message: string;
  timestamp: string;
  teacherId?: string;
}

interface ElevenKey {
  id: string;
  key: string;
  status?: string;
  creditsRemaining?: number;
  addedAt?: string;
  lastUsed?: string;
}

export default function SuperAdminDashboard() {
  const [activeTab, setActiveTab] = useState<TabKey>('home');
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [apiKeys, setApiKeys] = useState<ElevenKey[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  // API Key bulk add modal state
  const [showAddKeysModal, setShowAddKeysModal] = useState(false);
  const [bulkKeysText, setBulkKeysText] = useState('');
  const [addingKeys, setAddingKeys] = useState(false);
  const [addResultsMsg, setAddResultsMsg] = useState<string | null>(null);
  
  // Modal state
  const [showTeacherModal, setShowTeacherModal] = useState(false);
  const [selectedTeacher, setSelectedTeacher] = useState<Teacher | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  // Super admin identity
  const [superAdminName, setSuperAdminName] = useState<string>('');
  useEffect(() => {
    const setFromUser = () => {
      const u = getCurrentUser();
      if (u) {
        const display = u.displayName || u.email || 'Super Admin';
        setSuperAdminName(display as string);
      }
    };
    setFromUser();
    const unsub = onAuthChange(() => setFromUser());
    return () => { if (typeof unsub === 'function') unsub(); };
  }, []);

  // Fetch all data
  const fetchAll = async () => {
    setLoading(true);
    try {
      const [teachersRes, adminsRes, logsRes, keysRes] = await Promise.all([
        readData('/teachers'),
        readData('/admins'),
        readData('/teacherLogs'),
        readData('/elevenlabsKeys'),
      ]);

      // Teachers
      if (teachersRes.data) {
        const teachersList: Teacher[] = Object.entries(teachersRes.data).map(([uid, data]: [string, any]) => ({
          uid,
          ...data,
          isVerified: data.isVerified || false,
          isBlocked: data.isBlocked || false,
          isAdmin: data.isAdmin || false,
        }));
        setTeachers(teachersList);
      }

      // Admins
      if (adminsRes.data) {
        const adminsList: Admin[] = Object.entries(adminsRes.data).map(([uid, data]: [string, any]) => ({
          uid,
          ...data,
        }));
        setAdmins(adminsList);
      }

      // Logs
      if (logsRes.data) {
        const logsList: Log[] = Object.entries(logsRes.data).map(([id, data]: [string, any]) => ({
          id,
          ...data,
        })).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 300);
        setLogs(logsList);
      }

      // API Keys
      if (keysRes.data) {
        const keysList: ElevenKey[] = Object.entries(keysRes.data).map(([id, data]: [string, any]) => ({
          id,
          ...data,
        }));
        setApiKeys(keysList);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, [activeTab]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
  };

  // Grant admin access to teacher
  const grantAdminAccess = async (teacherId: string, teacherEmail: string, teacherData: Teacher) => {
    try {
      setActionBusy(true);
      
      // Update teacher record to mark as admin
      await updateData(`/teachers/${teacherId}`, {
        isAdmin: true,
        adminGrantedAt: new Date().toISOString(),
      });

      // Create admin record
      await writeData(`/admins/${teacherId}`, {
        email: teacherEmail,
        firstName: teacherData.firstName,
        lastName: teacherData.lastName,
        createdAt: new Date().toISOString(),
        isAdmin: true,
        grantedBy: 'superadmin',
      });

      // Update local state
      setTeachers(prev => prev.map(t => 
        t.uid === teacherId ? { ...t, isAdmin: true } : t
      ));
      if (selectedTeacher?.uid === teacherId) {
        setSelectedTeacher(prev => prev ? { ...prev, isAdmin: true } : null);
      }

      Alert.alert('Success', `Admin access granted to ${teacherData.firstName} ${teacherData.lastName}`);
      await fetchAll(); // Refresh to update admins list
    } catch (error) {
      console.error('Failed to grant admin access:', error);
      Alert.alert('Error', 'Failed to grant admin access');
    } finally {
      setActionBusy(false);
    }
  };

  // Revoke admin access from teacher
  const revokeAdminAccess = async (teacherId: string, teacherData: Teacher) => {
    try {
      setActionBusy(true);
      
      // Update teacher record
      await updateData(`/teachers/${teacherId}`, {
        isAdmin: false,
        adminRevokedAt: new Date().toISOString(),
      });

      // Remove admin record
      await deleteData(`/admins/${teacherId}`);

      // Update local state
      setTeachers(prev => prev.map(t => 
        t.uid === teacherId ? { ...t, isAdmin: false } : t
      ));
      if (selectedTeacher?.uid === teacherId) {
        setSelectedTeacher(prev => prev ? { ...prev, isAdmin: false } : null);
      }

      Alert.alert('Success', `Admin access revoked from ${teacherData.firstName} ${teacherData.lastName}`);
      await fetchAll(); // Refresh to update admins list
    } catch (error) {
      console.error('Failed to revoke admin access:', error);
      Alert.alert('Error', 'Failed to revoke admin access');
    } finally {
      setActionBusy(false);
    }
  };

  const openTeacherProfile = (teacher: Teacher) => {
    setSelectedTeacher(teacher);
    setShowTeacherModal(true);
  };

  const closeTeacherProfile = () => {
    setShowTeacherModal(false);
    setSelectedTeacher(null);
  };

  const normalized = (v: string | undefined | null) => (v || '').toString().trim().toLowerCase();
  const matchesSearch = (item: any) => {
    const q = normalized(searchQuery);
    return !q || 
      normalized(item.firstName).includes(q) ||
      normalized(item.lastName).includes(q) ||
      normalized(item.email).includes(q) ||
      normalized(item.school).includes(q) ||
      normalized(item.message).includes(q) ||
      normalized(item.key).includes(q);
  };

  const filteredTeachers = teachers.filter(matchesSearch);
  const filteredAdmins = admins.filter(matchesSearch);
  const filteredLogs = logs.filter(matchesSearch);
  const filteredKeys = apiKeys.filter(matchesSearch);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Home Tab */}
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
            {/* Header Section */}
            <View style={styles.adminHeader}>
              <View style={styles.adminAvatarContainer}>
                <View style={styles.adminAvatar}>
                  <MaterialIcons name="admin-panel-settings" size={40} color="#0ea5e9" />
                </View>
              </View>
              <View style={styles.adminWelcomeText}>
                <Text style={styles.adminWelcomeLabel}>Welcome,</Text>
                <View style={styles.adminNameRow}>
                  <Text style={styles.adminWelcomeTitle}>Super Admin{superAdminName ? ` ${superAdminName}` : ''}</Text>
                </View>
              </View>
            </View>

            {/* Stats Cards */}
            <View style={styles.statsGrid}>
              <View style={[styles.statCard, { backgroundColor: '#0ea5e9' }]}>
                <MaterialCommunityIcons name="account-group" size={32} color="#ffffff" />
                <Text style={styles.statNumber}>{teachers.length}</Text>
                <Text style={styles.statLabel}>Teachers</Text>
              </View>
              <View style={[styles.statCard, { backgroundColor: '#10b981' }]}>
                <MaterialIcons name="admin-panel-settings" size={32} color="#ffffff" />
                <Text style={styles.statNumber}>{admins.length}</Text>
                <Text style={styles.statLabel}>Admins</Text>
              </View>
              <View style={[styles.statCard, { backgroundColor: '#f59e0b' }]}>
                <MaterialCommunityIcons name="key" size={32} color="#ffffff" />
                <Text style={styles.statNumber}>{apiKeys.length}</Text>
                <Text style={styles.statLabel}>API Keys</Text>
              </View>
              <View style={[styles.statCard, { backgroundColor: '#8b5cf6' }]}>
                <MaterialIcons name="receipt-long" size={32} color="#ffffff" />
                <Text style={styles.statNumber}>{logs.length}</Text>
                <Text style={styles.statLabel}>Logs</Text>
        </View>
      </View>

            {/* Quick Stats */}
            <View style={styles.overviewCard}>
              <Text style={styles.overviewTitle}>System Overview</Text>
              <View style={styles.overviewRow}>
                <Text style={styles.overviewLabel}>Verified Teachers:</Text>
                <Text style={styles.overviewValue}>{teachers.filter(t => t.isVerified).length}</Text>
              </View>
              <View style={styles.overviewRow}>
                <Text style={styles.overviewLabel}>Pending Teachers:</Text>
                <Text style={styles.overviewValue}>{teachers.filter(t => !t.isVerified).length}</Text>
              </View>
              <View style={styles.overviewRow}>
                <Text style={styles.overviewLabel}>Blocked Teachers:</Text>
                <Text style={styles.overviewValue}>{teachers.filter(t => t.isBlocked).length}</Text>
              </View>
              <View style={styles.overviewRow}>
                <Text style={styles.overviewLabel}>Teachers with Admin Access:</Text>
                <Text style={styles.overviewValue}>{teachers.filter(t => t.isAdmin).length}</Text>
              </View>
              <View style={styles.overviewRow}>
                <Text style={styles.overviewLabel}>Active API Keys:</Text>
                <Text style={styles.overviewValue}>{apiKeys.filter(k => k.status === 'active').length}</Text>
              </View>
            </View>
          </View>
          <View style={{ height: 90 }} />
        </ScrollView>
      )}

      {/* Teachers Tab */}
      {activeTab === 'teachers' && (
        loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#0ea5e9" />
            <Text style={styles.loadingText}>Loading teachers...</Text>
          </View>
        ) : (
          <FlatList
            data={filteredTeachers}
            keyExtractor={(t) => t.uid}
            refreshing={refreshing}
            onRefresh={onRefresh}
            contentContainerStyle={[styles.listContent, { paddingBottom: 100 }]}
            ListHeaderComponent={
              <View>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Teacher Management</Text>
                  <Text style={styles.sectionSubtitle}>{teachers.length} total</Text>
                </View>
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
              </View>
            }
            renderItem={({ item: teacher }) => (
              <TouchableOpacity
                style={styles.teacherCard}
                onPress={() => openTeacherProfile(teacher)}
                activeOpacity={0.7}
              >
                <View style={styles.teacherHeader}>
                  <View style={styles.avatarContainer}>
                    {teacher.profilePictureUrl ? (
                      <Image source={{ uri: teacher.profilePictureUrl }} style={styles.avatar} />
                    ) : (
                      <View style={styles.avatarPlaceholder}>
                        <MaterialCommunityIcons name="account" size={24} color="#ffffff" />
                      </View>
                    )}
                  </View>
                  <View style={styles.teacherDetails}>
                    <Text style={styles.teacherName}>{teacher.firstName} {teacher.lastName}</Text>
                    <Text style={styles.teacherEmail}>{teacher.email}</Text>
                    <Text style={styles.teacherSchool}>{teacher.school || 'No school'}</Text>
                  </View>
                </View>
                <View style={styles.statusBadges}>
                  {teacher.isVerified && (
                    <View style={[styles.badge, styles.verifiedBadge]}>
                      <MaterialCommunityIcons name="check-circle" size={12} color="#ffffff" />
                      <Text style={styles.badgeText}>Verified</Text>
                    </View>
                  )}
                  {teacher.isBlocked && (
                    <View style={[styles.badge, styles.blockedBadge]}>
                      <AntDesign name="stop" size={12} color="#ffffff" />
                      <Text style={styles.badgeText}>Blocked</Text>
                    </View>
                  )}
                  {teacher.isAdmin && (
                    <View style={[styles.badge, styles.adminBadge]}>
                      <MaterialIcons name="admin-panel-settings" size={12} color="#ffffff" />
                      <Text style={styles.badgeText}>Admin</Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <MaterialCommunityIcons name="account-group-outline" size={48} color="#9ca3af" />
                <Text style={styles.emptyTitle}>No Teachers Found</Text>
        </View>
            }
          />
        )
      )}

      {/* Admins Tab */}
      {activeTab === 'admins' && (
        <FlatList
          data={filteredAdmins}
          keyExtractor={(a) => a.uid}
          refreshing={refreshing}
          onRefresh={onRefresh}
          contentContainerStyle={[styles.listContent, { paddingBottom: 100 }]}
          ListHeaderComponent={
            <View>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Admin Accounts</Text>
                <Text style={styles.sectionSubtitle}>{admins.length} total</Text>
              </View>
              <View style={styles.searchBox}>
                <MaterialIcons name="search" size={18} color="#94a3b8" />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search admins"
                  placeholderTextColor="#94a3b8"
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                />
              </View>
            </View>
          }
          renderItem={({ item: admin }) => (
            <View style={styles.adminCard}>
              <View style={styles.adminCardLeft}>
                <View style={styles.adminCardAvatar}>
                  <MaterialIcons name="admin-panel-settings" size={24} color="#ffffff" />
                </View>
                <View>
                  <Text style={styles.adminCardName}>{admin.firstName || admin.email} {admin.lastName || ''}</Text>
                  <Text style={styles.adminCardEmail}>{admin.email}</Text>
                  {admin.createdAt && (
                    <Text style={styles.adminCardDate}>
                      Joined: {new Date(admin.createdAt).toLocaleDateString()}
                    </Text>
                  )}
                </View>
              </View>
              <View style={[styles.badge, styles.adminBadge]}>
                <MaterialIcons name="verified-user" size={12} color="#ffffff" />
                <Text style={styles.badgeText}>Admin</Text>
              </View>
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <MaterialIcons name="admin-panel-settings" size={48} color="#9ca3af" />
              <Text style={styles.emptyTitle}>No Admins Found</Text>
        </View>
          }
        />
      )}

      {/* API Keys Tab */}
      {activeTab === 'apikeys' && (
        <FlatList
          data={filteredKeys}
          keyExtractor={(k) => k.id}
          refreshing={refreshing}
          onRefresh={onRefresh}
          contentContainerStyle={[styles.listContent, { paddingBottom: 100 }]}
          ListHeaderComponent={
            <View>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>ElevenLabs API Keys</Text>
                <Text style={styles.sectionSubtitle}>{apiKeys.length} total</Text>
              </View>
              <View style={styles.searchBox}>
                <MaterialIcons name="search" size={18} color="#94a3b8" />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search API keys"
                  placeholderTextColor="#94a3b8"
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                />
              </View>
              <TouchableOpacity
                style={styles.addKeysButton}
                onPress={() => {
                  setBulkKeysText('');
                  setAddResultsMsg(null);
                  setShowAddKeysModal(true);
                }}
                activeOpacity={0.85}
              >
                <MaterialCommunityIcons name="key-plus" size={18} color="#ffffff" />
                <Text style={styles.addKeysButtonText}>Add API Keys</Text>
              </TouchableOpacity>
            </View>
          }
          renderItem={({ item: apiKey }) => (
            <View style={styles.apiKeyCard}>
              <View style={styles.apiKeyHeader}>
                <MaterialCommunityIcons name="key" size={24} color="#0ea5e9" />
                <Text style={styles.apiKeyText}>{apiKey.key?.slice(0, 15)}...</Text>
                <View style={{ flex: 1 }} />
                <TouchableOpacity
                  onPress={async () => {
                    // Confirm delete
                    try {
                      await deleteData(`/elevenlabsKeys/${apiKey.id}`);
                      await onRefresh();
                    } catch {}
                  }}
                  style={styles.deleteKeyButton}
                  activeOpacity={0.8}
                >
                  <MaterialCommunityIcons name="trash-can-outline" size={18} color="#ef4444" />
                  <Text style={styles.deleteKeyText}>Delete</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.apiKeyDetails}>
                <View style={styles.apiKeyRow}>
                  <Text style={styles.apiKeyLabel}>Status:</Text>
                  <View style={[
                    styles.badge,
                    apiKey.status === 'active' ? styles.activeBadge :
                    apiKey.status === 'low_credits' ? styles.warningBadge :
                    styles.errorBadge
                  ]}>
                    <Text style={styles.badgeText}>{apiKey.status || 'unknown'}</Text>
                  </View>
                </View>
                <View style={styles.apiKeyRow}>
                  <Text style={styles.apiKeyLabel}>Credits:</Text>
                  <Text style={styles.apiKeyValue}>{apiKey.creditsRemaining ?? 'unknown'}</Text>
                </View>
                {apiKey.lastUsed && (
                  <View style={styles.apiKeyRow}>
                    <Text style={styles.apiKeyLabel}>Last Used:</Text>
                    <Text style={styles.apiKeyValue}>
                      {new Date(apiKey.lastUsed).toLocaleString()}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <MaterialCommunityIcons name="key-outline" size={48} color="#9ca3af" />
              <Text style={styles.emptyTitle}>No API Keys Found</Text>
        </View>
          }
        />
      )}

      {/* Logs Tab */}
      {activeTab === 'logs' && (
        <FlatList
          data={filteredLogs}
          keyExtractor={(l) => l.id}
          refreshing={refreshing}
          onRefresh={onRefresh}
          contentContainerStyle={[styles.listContent, { paddingBottom: 100 }]}
          ListHeaderComponent={
            <View>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Teacher Activity Logs</Text>
                <Text style={styles.sectionSubtitle}>Latest 300 entries</Text>
              </View>
              <View style={styles.searchBox}>
                <MaterialIcons name="search" size={18} color="#94a3b8" />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search logs"
                  placeholderTextColor="#94a3b8"
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                />
              </View>
            </View>
          }
          renderItem={({ item: log }) => (
            <View style={styles.logCard}>
              <View style={styles.logHeader}>
                <MaterialIcons name="receipt-long" size={18} color="#64748b" />
                <Text style={styles.logTime}>{new Date(log.timestamp).toLocaleString()}</Text>
              </View>
              <Text style={styles.logMessage}>{log.message}</Text>
              {log.teacherId && (
                <Text style={styles.logTeacherId}>Teacher ID: {log.teacherId}</Text>
              )}
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <MaterialIcons name="receipt-long" size={48} color="#9ca3af" />
              <Text style={styles.emptyTitle}>No Logs Found</Text>
            </View>
          }
        />
      )}

      {/* Bottom Navigation */}
      <View style={styles.bottomNav}>
        <TouchableOpacity
          style={[styles.navItem, activeTab === 'home' && styles.activeNavItem]}
          onPress={() => setActiveTab('home')}
        >
          <View style={[styles.activeIndicator, activeTab === 'home' ? styles.activeIndicatorOn : undefined]} />
          <AntDesign name="home" size={26} color={activeTab === 'home' ? '#0ea5e9' : '#9ca3af'} />
          <Text style={[styles.navText, activeTab === 'home' && styles.activeNavText]}>Home</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.navItem, activeTab === 'teachers' && styles.activeNavItem]}
          onPress={() => setActiveTab('teachers')}
        >
          <View style={[styles.activeIndicator, activeTab === 'teachers' ? styles.activeIndicatorOn : undefined]} />
          <MaterialCommunityIcons name="account-group" size={26} color={activeTab === 'teachers' ? '#0ea5e9' : '#9ca3af'} />
          <Text style={[styles.navText, activeTab === 'teachers' && styles.activeNavText]}>Teachers</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.navItem, activeTab === 'admins' && styles.activeNavItem]}
          onPress={() => setActiveTab('admins')}
        >
          <View style={[styles.activeIndicator, activeTab === 'admins' ? styles.activeIndicatorOn : undefined]} />
          <MaterialIcons name="admin-panel-settings" size={26} color={activeTab === 'admins' ? '#0ea5e9' : '#9ca3af'} />
          <Text style={[styles.navText, activeTab === 'admins' && styles.activeNavText]}>Admins</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.navItem, activeTab === 'apikeys' && styles.activeNavItem]}
          onPress={() => setActiveTab('apikeys')}
        >
          <View style={[styles.activeIndicator, activeTab === 'apikeys' ? styles.activeIndicatorOn : undefined]} />
          <MaterialCommunityIcons name="key" size={26} color={activeTab === 'apikeys' ? '#0ea5e9' : '#9ca3af'} />
          <Text style={[styles.navText, activeTab === 'apikeys' && styles.activeNavText]}>API Keys</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.navItem, activeTab === 'logs' && styles.activeNavItem]}
          onPress={() => setActiveTab('logs')}
        >
          <View style={[styles.activeIndicator, activeTab === 'logs' ? styles.activeIndicatorOn : undefined]} />
          <MaterialIcons name="receipt-long" size={26} color={activeTab === 'logs' ? '#0ea5e9' : '#9ca3af'} />
          <Text style={[styles.navText, activeTab === 'logs' && styles.activeNavText]}>Logs</Text>
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
              <TouchableOpacity style={styles.closeButton} onPress={closeTeacherProfile}>
                <AntDesign name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>

            {selectedTeacher && (
              <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
                <View style={styles.profileSection}>
                  <View style={styles.profileAvatarContainer}>
                    {selectedTeacher.profilePictureUrl ? (
                      <Image source={{ uri: selectedTeacher.profilePictureUrl }} style={styles.profileAvatar} />
                    ) : (
                      <View style={styles.profileAvatarPlaceholder}>
                        <MaterialCommunityIcons name="account" size={48} color="#ffffff" />
                      </View>
                    )}
                  </View>
                  
                  <Text style={styles.profileName}>
                    {selectedTeacher.firstName} {selectedTeacher.lastName}
                  </Text>
                  
                  <View style={styles.profileBadges}>
                    {selectedTeacher.isVerified && (
                      <View style={[styles.profileBadge, styles.verifiedBadge]}>
                        <MaterialCommunityIcons name="check-circle" size={16} color="#ffffff" />
                        <Text style={styles.profileBadgeText}>Verified</Text>
                      </View>
                    )}
                    {selectedTeacher.isBlocked && (
                      <View style={[styles.profileBadge, styles.blockedBadge]}>
                        <AntDesign name="stop" size={16} color="#ffffff" />
                        <Text style={styles.profileBadgeText}>Blocked</Text>
                      </View>
                    )}
                    {selectedTeacher.isAdmin && (
                      <View style={[styles.profileBadge, styles.adminBadge]}>
                        <MaterialIcons name="admin-panel-settings" size={16} color="#ffffff" />
                        <Text style={styles.profileBadgeText}>Admin</Text>
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
                      <Text style={styles.detailValue}>{selectedTeacher.school || 'Not provided'}</Text>
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

                {/* Admin Access Control */}
                <View style={styles.modalActionsContainer}>
                  {!selectedTeacher.isAdmin ? (
                    <TouchableOpacity
                      style={[styles.modalActionButton, styles.grantAdminButton, actionBusy && { opacity: 0.7 }]}
                      disabled={actionBusy}
                      onPress={() => grantAdminAccess(selectedTeacher.uid, selectedTeacher.email, selectedTeacher)}
                    >
                      {actionBusy ? (
                        <ActivityIndicator size="small" color="#ffffff" />
                      ) : (
                        <MaterialIcons name="admin-panel-settings" size={18} color="#ffffff" />
                      )}
                      <Text style={styles.modalActionText}>Grant Admin Access</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={[styles.modalActionButton, styles.revokeAdminButton, actionBusy && { opacity: 0.7 }]}
                      disabled={actionBusy}
                      onPress={() => revokeAdminAccess(selectedTeacher.uid, selectedTeacher)}
                    >
                      {actionBusy ? (
                        <ActivityIndicator size="small" color="#ffffff" />
                      ) : (
                        <MaterialIcons name="remove-moderator" size={18} color="#ffffff" />
                      )}
                      <Text style={styles.modalActionText}>Revoke Admin Access</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Add API Keys Modal */}
      <Modal visible={showAddKeysModal} transparent animationType="slide" onRequestClose={() => setShowAddKeysModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add ElevenLabs API Keys</Text>
              <TouchableOpacity style={styles.closeButton} onPress={() => setShowAddKeysModal(false)}>
                <AntDesign name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              <View style={{ paddingHorizontal: 28, paddingTop: 20, gap: 12 }}>
                <Text style={{ color: '#475569' }}>Paste one or many keys below. The system will auto-detect keys starting with "sk_".</Text>
                <TextInput
                  value={bulkKeysText}
                  onChangeText={setBulkKeysText}
                  placeholder={'Paste keys here...\nsk_XXXX...\nsk_YYYY...'}
                  placeholderTextColor="#94a3b8"
                  style={styles.bulkInput}
                  multiline
                  textAlignVertical="top"
                />
                {addResultsMsg ? (
                  <Text style={{ color: '#64748b' }}>{addResultsMsg}</Text>
                ) : null}
              </View>
            </ScrollView>
            <View style={{ flexDirection: 'row', gap: 12, paddingHorizontal: 24, paddingBottom: 24 }}>
              <TouchableOpacity
                style={[styles.actionButtonBase, { backgroundColor: '#f1f5f9' }]}
                onPress={() => setShowAddKeysModal(false)}
                disabled={addingKeys}
              >
                <Text style={{ color: '#0f172a', fontWeight: '700' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButtonBase, { backgroundColor: '#0ea5e9' }]}
                disabled={addingKeys}
                onPress={async () => {
                  if (!bulkKeysText.trim()) return;
                  setAddingKeys(true);
                  try {
                    // Extract keys with regex, allow variable length hex after sk_
                    const matches = (bulkKeysText.match(/sk_[a-f0-9]{20,}/gi) || []).map(k => k.trim());
                    const unique = Array.from(new Set(matches));
                    if (unique.length === 0) {
                      setAddResultsMsg('No valid keys detected. Make sure each begins with "sk_".');
                    } else {
                      // Filter out keys already present
                      const existingSet = new Set(apiKeys.map(k => (k.key || '').toLowerCase()));
                      const toAdd = unique.filter(k => !existingSet.has(k.toLowerCase()));
                      let success = 0;
                      let failed = 0;
                      for (const key of toAdd) {
                        try {
                          await pushData('/elevenlabsKeys', { key, status: 'active', addedAt: new Date().toISOString() });
                          success++;
                        } catch {
                          failed++;
                        }
                      }
                      setAddResultsMsg(`Detected ${unique.length} key(s). Added ${success}${failed ? `, Failed ${failed}` : ''}${toAdd.length !== unique.length ? `, Skipped ${unique.length - toAdd.length} duplicate(s)` : ''}.`);
                      await onRefresh();
                    }
                  } finally {
                    setAddingKeys(false);
                  }
                }}
              >
                {addingKeys ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={{ color: '#ffffff', fontWeight: '700' }}>Add Keys</Text>
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
    paddingTop: 60,
  },
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
    backgroundColor: '#e0f2fe',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#0ea5e9',
    shadowColor: '#0ea5e9',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
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
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statCard: {
    flex: 1,
    minWidth: (width - 64) / 2,
    backgroundColor: '#0ea5e9',
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  statNumber: {
    fontSize: 32,
    fontWeight: '800',
    color: '#ffffff',
    marginTop: 8,
  },
  statLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
    marginTop: 4,
    opacity: 0.9,
  },
  overviewCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  overviewTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1e293b',
    marginBottom: 16,
  },
  overviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  overviewLabel: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '500',
  },
  overviewValue: {
    fontSize: 14,
    color: '#1e293b',
    fontWeight: '700',
  },
  listContent: {
    padding: 20,
    gap: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#1e293b',
    letterSpacing: -0.5,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '600',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#0f172a',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
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
  teacherCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 20,
    marginHorizontal: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 6,
  },
  teacherHeader: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  avatarContainer: {
    marginRight: 16,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 3,
    borderColor: '#f1f5f9',
  },
  avatarPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#0ea5e9',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#f1f5f9',
  },
  teacherDetails: {
    flex: 1,
    justifyContent: 'center',
  },
  teacherName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1e293b',
    marginBottom: 4,
  },
  teacherEmail: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 2,
  },
  teacherSchool: {
    fontSize: 13,
    color: '#94a3b8',
  },
  statusBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    gap: 4,
  },
  verifiedBadge: {
    backgroundColor: '#10b981',
  },
  blockedBadge: {
    backgroundColor: '#ef4444',
  },
  adminBadge: {
    backgroundColor: '#8b5cf6',
  },
  activeBadge: {
    backgroundColor: '#10b981',
  },
  warningBadge: {
    backgroundColor: '#f59e0b',
  },
  errorBadge: {
    backgroundColor: '#ef4444',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#ffffff',
  },
  adminCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 20,
    marginHorizontal: 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 6,
  },
  adminCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    flex: 1,
  },
  adminCardAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#8b5cf6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  adminCardName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
  },
  adminCardEmail: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 2,
  },
  adminCardDate: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 4,
  },
  apiKeyCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 20,
    marginHorizontal: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 6,
  },
  apiKeyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  deleteKeyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(239,68,68,0.08)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  deleteKeyText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ef4444',
  },
  apiKeyText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
    fontFamily: 'monospace',
  },
  apiKeyDetails: {
    gap: 8,
  },
  apiKeyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  apiKeyLabel: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '500',
  },
  apiKeyValue: {
    fontSize: 13,
    color: '#1e293b',
    fontWeight: '600',
  },
  logCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 4,
  },
  logHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  logTime: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '600',
  },
  logMessage: {
    fontSize: 14,
    color: '#1e293b',
    lineHeight: 20,
  },
  logTeacherId: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 6,
    fontStyle: 'italic',
  },
  bottomNav: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 8,
  },
  addKeysButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#0ea5e9',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    marginTop: 8,
  },
  addKeysButtonText: {
    color: '#ffffff',
    fontWeight: '700',
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
  },
  activeNavItem: {},
  navText: {
    fontSize: 11,
    color: '#9ca3af',
    marginTop: 4,
    fontWeight: '500',
  },
  activeNavText: {
    color: '#0ea5e9',
    fontWeight: '700',
  },
  activeIndicator: {
    position: 'absolute',
    top: -8,
    width: 24,
    height: 3,
    borderRadius: 999,
    backgroundColor: 'transparent',
  },
  activeIndicatorOn: {
    backgroundColor: '#0ea5e9',
  },
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
  bulkInput: {
    minHeight: 160,
    borderRadius: 14,
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    color: '#0f172a',
    fontSize: 14,
  },
  actionButtonBase: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 14,
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
    gap: 12,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  profileBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 4,
  },
  profileBadgeText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
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
    gap: 16,
    paddingVertical: 8,
  },
  detailContent: {
    flex: 1,
  },
  detailLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#64748b',
    marginBottom: 4,
  },
  detailValue: {
    fontSize: 16,
    color: '#1e293b',
    fontWeight: '600',
  },
  modalActionsContainer: {
    paddingHorizontal: 28,
    paddingBottom: 32,
    marginTop: -8,
  },
  modalActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
  grantAdminButton: {
    backgroundColor: '#8b5cf6',
  },
  revokeAdminButton: {
    backgroundColor: '#ef4444',
  },
  modalActionText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 15,
    letterSpacing: 0.3,
  },
});
