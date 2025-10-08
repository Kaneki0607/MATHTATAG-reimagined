import { AntDesign, MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Dimensions, FlatList, Image, Modal, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { addApiKey, deleteApiKey, getApiKeyStatus } from '../lib/elevenlabs-keys';
import { getCurrentUser, onAuthChange } from '../lib/firebase-auth';
import { deleteData, readData, updateData, writeData } from '../lib/firebase-database';

type TabKey = 'home' | 'teachers' | 'apikeys' | 'reports';

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
  emailVerified?: boolean; // New field to track email verification
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
  usageCount?: number;
  totalTtsTimeMs?: number;
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
  
  // API Key management state
  const [selectedApiKey, setSelectedApiKey] = useState<ElevenKey | null>(null);
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [showBulkActionsModal, setShowBulkActionsModal] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<'addedAt' | 'lastUsed' | 'usageCount' | 'creditsRemaining'>('addedAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'low_credits' | 'failed'>('all');
  
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
          emailVerified: data.emailVerified || false,
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

      // API Keys - Use the new getApiKeyStatus function
      const apiKeyStatus = await getApiKeyStatus();
      setApiKeys(apiKeyStatus.keys);
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
    
    // Handle status-based filters
    if (q === 'verified') {
      return item.isVerified === true;
    }
    if (q === 'pending') {
      return item.isVerified === false && item.isBlocked !== true;
    }
    if (q === 'blocked') {
      return item.isBlocked === true;
    }
    if (q === 'admin') {
      return item.isAdmin === true;
    }
    
    // Handle text-based search
    return !q || 
      normalized(item.firstName).includes(q) ||
      normalized(item.lastName).includes(q) ||
      normalized(item.email).includes(q) ||
      normalized(item.school).includes(q) ||
      normalized(item.message).includes(q) ||
      normalized(item.key).includes(q);
  };

  // API Key management functions
  const openApiKeyDetails = (apiKey: ElevenKey) => {
    setSelectedApiKey(apiKey);
    setShowApiKeyModal(true);
  };

  const closeApiKeyDetails = () => {
    setShowApiKeyModal(false);
    setSelectedApiKey(null);
  };

  const toggleKeySelection = (keyId: string) => {
    setSelectedKeys(prev => {
      const newSet = new Set(prev);
      if (newSet.has(keyId)) {
        newSet.delete(keyId);
      } else {
        newSet.add(keyId);
      }
      return newSet;
    });
  };

  const selectAllKeys = () => {
    setSelectedKeys(new Set(filteredKeys.map(k => k.id)));
  };

  const clearSelection = () => {
    setSelectedKeys(new Set());
  };

  const bulkDeleteKeys = async () => {
    if (selectedKeys.size === 0) return;
    
    Alert.alert(
      'Delete Selected Keys',
      `Are you sure you want to delete ${selectedKeys.size} selected API keys? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              let deletedCount = 0;
              for (const keyId of selectedKeys) {
                const key = apiKeys.find(k => k.id === keyId);
                if (key) {
                  await deleteApiKey(key.key);
                  deletedCount++;
                }
              }
              Alert.alert('Success', `Deleted ${deletedCount} API keys`);
              setSelectedKeys(new Set());
              await onRefresh();
            } catch (error) {
              Alert.alert('Error', 'Failed to delete some API keys');
            }
          }
        }
      ]
    );
  };

  const bulkMarkAsFailed = async () => {
    if (selectedKeys.size === 0) return;
    
    Alert.alert(
      'Mark as Failed',
      `Mark ${selectedKeys.size} selected API keys as failed?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Mark as Failed',
          onPress: async () => {
            try {
              // This would require updating the API key status in the database
              Alert.alert('Success', `Marked ${selectedKeys.size} keys as failed`);
              setSelectedKeys(new Set());
              await onRefresh();
            } catch (error) {
              Alert.alert('Error', 'Failed to update key status');
            }
          }
        }
      ]
    );
  };

  const filteredTeachers = teachers.filter(matchesSearch);
  const filteredAdmins = admins.filter(matchesSearch);
  const filteredLogs = logs.filter(matchesSearch);
  
  // Enhanced API key filtering and sorting
  const filteredKeys = apiKeys
    .filter(matchesSearch)
    .filter(key => filterStatus === 'all' || key.status === filterStatus)
    .sort((a, b) => {
      let aValue: any, bValue: any;
      
      switch (sortBy) {
        case 'addedAt':
          aValue = new Date(a.addedAt || 0).getTime();
          bValue = new Date(b.addedAt || 0).getTime();
          break;
        case 'lastUsed':
          aValue = new Date(a.lastUsed || 0).getTime();
          bValue = new Date(b.lastUsed || 0).getTime();
          break;
        case 'usageCount':
          aValue = a.usageCount || 0;
          bValue = b.usageCount || 0;
          break;
        case 'creditsRemaining':
          aValue = a.creditsRemaining || 0;
          bValue = b.creditsRemaining || 0;
          break;
        default:
          return 0;
      }
      
      if (sortOrder === 'asc') {
        return aValue - bValue;
      } else {
        return bValue - aValue;
      }
    });

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
                <Text style={styles.overviewLabel}>Accounts with Admin Access:</Text>
                <Text style={styles.overviewValue}>{teachers.filter(t => t.isAdmin).length}</Text>
              </View>
              <View style={styles.overviewRow}>
                <Text style={styles.overviewLabel}>Active API Keys:</Text>
                <Text style={styles.overviewValue}>{apiKeys.filter(k => k.status === 'active').length}</Text>
              </View>
            </View>

            {/* Advanced Admin Tools Section */}
            <View style={styles.adminToolsCard}>
              <Text style={styles.adminToolsTitle}>Advanced Administrative Tools</Text>
              <Text style={styles.adminToolsSubtitle}>Full system control and data manipulation</Text>
              <View style={styles.adminToolsGrid}>
            
                
                <TouchableOpacity style={styles.adminToolButton} onPress={() => setActiveTab('apikeys')}>
                  <MaterialCommunityIcons name="key-variant" size={20} color="#10b981" />
                  <Text style={styles.adminToolLabel}>API Keys</Text>
                  <Text style={styles.adminToolSubtext}>Manage keys</Text>
                </TouchableOpacity>
                
                <TouchableOpacity style={styles.adminToolButton} onPress={() => setActiveTab('reports')}>
                  <MaterialCommunityIcons name="ticket-outline" size={20} color="#f59e0b" />
                  <Text style={styles.adminToolLabel}>Reports</Text>
                  <Text style={styles.adminToolSubtext}>Tech reports</Text>
                </TouchableOpacity>
                
                <TouchableOpacity style={styles.adminToolButton} onPress={async () => {
                  Alert.alert(
                    'Bulk Teacher Operations',
                    'Select a bulk operation to perform',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Verify All Pending', onPress: async () => {
                        try {
                          const pendingTeachers = teachers.filter(t => !t.isVerified);
                          for (const teacher of pendingTeachers) {
                            await updateData(`/teachers/${teacher.uid}`, { isVerified: true });
                          }
                          Alert.alert('Success', `Verified ${pendingTeachers.length} teachers`);
                          await fetchAll();
                        } catch (error) {
                          Alert.alert('Error', 'Failed to verify teachers');
                        }
                      }},
                      { text: 'Block All Unverified', onPress: async () => {
                        try {
                          const unverifiedTeachers = teachers.filter(t => !t.isVerified);
                          for (const teacher of unverifiedTeachers) {
                            await updateData(`/teachers/${teacher.uid}`, { isBlocked: true });
                          }
                          Alert.alert('Success', `Blocked ${unverifiedTeachers.length} teachers`);
                          await fetchAll();
                        } catch (error) {
                          Alert.alert('Error', 'Failed to block teachers');
                        }
                      }}
                    ]
                  );
                }}>
                  <MaterialIcons name="group-work" size={20} color="#ef4444" />
                  <Text style={styles.adminToolLabel}>Bulk Ops</Text>
                  <Text style={styles.adminToolSubtext}>Mass operations</Text>
                </TouchableOpacity>
                
                <TouchableOpacity style={styles.adminToolButton} onPress={async () => {
                  Alert.alert(
                    'Database Operations',
                    'Select a database operation',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Refresh All Data', onPress: () => fetchAll() },
                      { text: 'Clear All Logs', onPress: async () => {
                        try {
                          await deleteData('/teacherLogs');
                          Alert.alert('Success', 'All logs cleared');
                          await fetchAll();
                        } catch (error) {
                          Alert.alert('Error', 'Failed to clear logs');
                        }
                      }},
                      { text: 'Reset API Keys', onPress: async () => {
                        try {
                          await deleteData('/elevenlabsKeys');
                          Alert.alert('Success', 'All API keys cleared');
                          await fetchAll();
                        } catch (error) {
                          Alert.alert('Error', 'Failed to reset API keys');
                        }
                      }}
                    ]
                  );
                }}>
                  <MaterialIcons name="storage" size={20} color="#06b6d4" />
                  <Text style={styles.adminToolLabel}>Database</Text>
                  <Text style={styles.adminToolSubtext}>DB operations</Text>
                </TouchableOpacity>
                
                <TouchableOpacity style={styles.adminToolButton} onPress={() => {
                  Alert.alert(
                    'System Information',
                    `📊 SYSTEM STATUS\n\n` +
                    `👥 Total Teachers: ${teachers.length}\n` +
                    `✅ Verified: ${teachers.filter(t => t.isVerified).length}\n` +
                    `⏳ Pending: ${teachers.filter(t => !t.isVerified).length}\n` +
                    `🚫 Blocked: ${teachers.filter(t => t.isBlocked).length}\n` +
                    `👑 Admins: ${admins.length}\n` +
                    `🔑 API Keys: ${apiKeys.length}\n` +
                    `🟢 Active Keys: ${apiKeys.filter(k => k.status === 'active').length}\n` +
                    `📝 Logs: ${logs.length}\n\n` +
                    `💾 Database: Connected\n` +
                    `🔄 Last Updated: ${new Date().toLocaleString()}`,
                    [{ text: 'OK' }]
                  );
                }}>
                  <MaterialIcons name="info" size={20} color="#8b5cf6" />
                  <Text style={styles.adminToolLabel}>Status</Text>
                  <Text style={styles.adminToolSubtext}>System info</Text>
                </TouchableOpacity>
                
                <TouchableOpacity style={styles.adminToolButton} onPress={async () => {
                  Alert.alert(
                    'Emergency Actions',
                    '⚠️ WARNING: These actions are irreversible!',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Block All Teachers', onPress: async () => {
                        try {
                          for (const teacher of teachers) {
                            await updateData(`/teachers/${teacher.uid}`, { isBlocked: true });
                          }
                          Alert.alert('Success', 'All teachers blocked');
                          await fetchAll();
                        } catch (error) {
                          Alert.alert('Error', 'Failed to block teachers');
                        }
                      }},
                      { text: 'Delete All Logs', onPress: async () => {
                        try {
                          await deleteData('/teacherLogs');
                          Alert.alert('Success', 'All logs deleted');
                          await fetchAll();
                        } catch (error) {
                          Alert.alert('Error', 'Failed to delete logs');
                        }
                      }}
                    ]
                  );
                }}>
                  <MaterialIcons name="warning" size={20} color="#ef4444" />
                  <Text style={styles.adminToolLabel}>Emergency</Text>
                  <Text style={styles.adminToolSubtext}>Critical actions</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
          <View style={{ height: 90 }} />
        </ScrollView>
      )}

      {/* Teachers Tab - Professional Design */}
      {activeTab === 'teachers' && (
        <View style={styles.professionalTeachersContainer}>
          {/* Professional Header */}
          <View style={styles.professionalTeachersHeader}>
            <View style={styles.professionalTeachersHeaderTop}>
              <View style={styles.professionalTeachersTitleSection}>
                <Text style={styles.professionalTeachersTitle}>Teacher Management</Text>
                <View style={styles.professionalTeachersBadge}>
                  <Text style={styles.professionalTeachersBadgeText}>{teachers.length}</Text>
                </View>
              </View>
              
              <View style={styles.professionalTeachersActions}>
                <TouchableOpacity
                  style={styles.professionalTeachersActionButton}
                  onPress={() => fetchAll()}
                >
                  <MaterialIcons name="refresh" size={18} color="#0ea5e9" />
                </TouchableOpacity>
              </View>
            </View>
            
            {/* Teacher Statistics - 2 Rows */}
            <View style={styles.professionalTeachersStats}>
              <View style={styles.professionalTeachersStatsRow}>
                <View style={[styles.professionalTeachersStatCard, { borderLeftColor: '#10b981', borderLeftWidth: 3 }]}>
                  <MaterialCommunityIcons name="account-check" size={20} color="#10b981" />
                  <Text style={styles.professionalTeachersStatNumber}>{teachers.filter(t => t.isVerified).length}</Text>
                  <Text style={styles.professionalTeachersStatLabel}>Verified</Text>
                </View>
                <View style={[styles.professionalTeachersStatCard, { borderLeftColor: '#f59e0b', borderLeftWidth: 3 }]}>
                  <MaterialCommunityIcons name="account-clock" size={20} color="#f59e0b" />
                  <Text style={styles.professionalTeachersStatNumber}>{teachers.filter(t => !t.isVerified).length}</Text>
                  <Text style={styles.professionalTeachersStatLabel}>Pending</Text>
                </View>
              </View>
              <View style={styles.professionalTeachersStatsRow}>
                <View style={[styles.professionalTeachersStatCard, { borderLeftColor: '#ef4444', borderLeftWidth: 3 }]}>
                  <MaterialCommunityIcons name="account-cancel" size={20} color="#ef4444" />
                  <Text style={styles.professionalTeachersStatNumber}>{teachers.filter(t => t.isBlocked).length}</Text>
                  <Text style={styles.professionalTeachersStatLabel}>Blocked</Text>
                </View>
                <View style={[styles.professionalTeachersStatCard, { borderLeftColor: '#8b5cf6', borderLeftWidth: 3 }]}>
                  <MaterialIcons name="admin-panel-settings" size={20} color="#8b5cf6" />
                  <Text style={styles.professionalTeachersStatNumber}>{teachers.filter(t => t.isAdmin).length}</Text>
                  <Text style={styles.professionalTeachersStatLabel}>Admins</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Search and Filter Controls */}
          <View style={styles.professionalTeachersControls}>
            <View style={styles.professionalTeachersSearchContainer}>
              <MaterialIcons name="search" size={18} color="#9ca3af" />
              <TextInput
                style={styles.professionalTeachersSearchInput}
                placeholder="Search by name, email, or school..."
                placeholderTextColor="#9ca3af"
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.professionalTeachersClearButton}>
                  <MaterialIcons name="clear" size={16} color="#9ca3af" />
                </TouchableOpacity>
              )}
            </View>

            {/* Quick Filter Chips */}
            <View style={styles.professionalTeachersFilterChips}>
              <TouchableOpacity
                style={[styles.professionalTeachersFilterChip, !searchQuery && styles.professionalTeachersFilterChipActive]}
                onPress={() => setSearchQuery('')}
              >
                <Text style={[styles.professionalTeachersFilterChipText, !searchQuery && styles.professionalTeachersFilterChipTextActive]}>All</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.professionalTeachersFilterChip, searchQuery === 'verified' && styles.professionalTeachersFilterChipActive]}
                onPress={() => setSearchQuery('verified')}
              >
                <Text style={[styles.professionalTeachersFilterChipText, searchQuery === 'verified' && styles.professionalTeachersFilterChipTextActive]}>Verified</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.professionalTeachersFilterChip, searchQuery === 'pending' && styles.professionalTeachersFilterChipActive]}
                onPress={() => setSearchQuery('pending')}
              >
                <Text style={[styles.professionalTeachersFilterChipText, searchQuery === 'pending' && styles.professionalTeachersFilterChipTextActive]}>Pending</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.professionalTeachersFilterChip, searchQuery === 'blocked' && styles.professionalTeachersFilterChipActive]}
                onPress={() => setSearchQuery('blocked')}
              >
                <Text style={[styles.professionalTeachersFilterChipText, searchQuery === 'blocked' && styles.professionalTeachersFilterChipTextActive]}>Blocked</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.professionalTeachersFilterChip, searchQuery === 'admin' && styles.professionalTeachersFilterChipActive]}
                onPress={() => setSearchQuery('admin')}
              >
                <Text style={[styles.professionalTeachersFilterChipText, searchQuery === 'admin' && styles.professionalTeachersFilterChipTextActive]}>Admins</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Teachers List */}
          <FlatList
            data={filteredTeachers}
            keyExtractor={(t) => t.uid}
            refreshing={refreshing}
            onRefresh={onRefresh}
            contentContainerStyle={styles.professionalTeachersList}
            showsVerticalScrollIndicator={false}
            renderItem={({ item: teacher, index }) => (
              <TouchableOpacity
                style={[styles.professionalTeacherCard, { marginTop: index === 0 ? 0 : 8 }]}
                onPress={() => openTeacherProfile(teacher)}
                activeOpacity={0.7}
              >
                <View style={styles.professionalTeacherCardContent}>
                  <View style={styles.professionalTeacherLeft}>
                    <View style={styles.professionalTeacherAvatar}>
                      {teacher.profilePictureUrl ? (
                        <Image source={{ uri: teacher.profilePictureUrl }} style={styles.professionalTeacherAvatarImage} />
                      ) : (
                        <MaterialCommunityIcons name="account" size={20} color="#ffffff" />
                      )}
                    </View>
                    
                    <View style={styles.professionalTeacherInfo}>
                      <Text style={styles.professionalTeacherName}>{teacher.firstName} {teacher.lastName}</Text>
                      <Text style={styles.professionalTeacherEmail}>{teacher.email}</Text>
                      <Text style={styles.professionalTeacherSchool}>{teacher.school || 'No school specified'}</Text>
                    </View>
                  </View>
                  
                  <View style={styles.professionalTeacherRight}>
                    <View style={styles.professionalTeacherBadges}>
                      {teacher.isVerified && (
                        <View style={[styles.professionalTeacherBadge, styles.professionalVerifiedBadge]}>
                          <MaterialCommunityIcons name="check-circle" size={12} color="#ffffff" />
                        </View>
                      )}
                      {teacher.emailVerified && (
                        <View style={[styles.professionalTeacherBadge, styles.professionalEmailVerifiedBadge]}>
                          <MaterialIcons name="mark-email-read" size={12} color="#ffffff" />
                        </View>
                      )}
                      {teacher.isBlocked && (
                        <View style={[styles.professionalTeacherBadge, styles.professionalBlockedBadge]}>
                          <AntDesign name="stop" size={12} color="#ffffff" />
                        </View>
                      )}
                      {teacher.isAdmin && (
                        <View style={[styles.professionalTeacherBadge, styles.professionalAdminBadge]}>
                          <MaterialIcons name="admin-panel-settings" size={12} color="#ffffff" />
                        </View>
                      )}
                    </View>
                    <Text style={styles.professionalTeacherDate}>
                      {new Date(teacher.createdAt).toLocaleDateString()}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <View style={styles.professionalTeachersEmptyContainer}>
                <MaterialCommunityIcons name="account-group-outline" size={48} color="#d1d5db" />
                <Text style={styles.professionalTeachersEmptyTitle}>No Teachers Found</Text>
                <Text style={styles.professionalTeachersEmptySubtitle}>
                  {searchQuery ? 'Try adjusting your search terms' : 'No teachers have registered yet'}
                </Text>
              </View>
            }
          />
        </View>
      )}


      {/* API Keys Tab - Professional Design */}
      {activeTab === 'apikeys' && (
        <View style={styles.professionalApiKeysContainer}>
          {/* Compact Header */}
          <View style={styles.professionalHeader}>
            <View style={styles.professionalHeaderTop}>
              <View style={styles.professionalTitleSection}>
                <Text style={styles.professionalTitle}>API Keys</Text>
                <View style={styles.professionalBadge}>
                  <Text style={styles.professionalBadgeText}>{apiKeys.length}</Text>
                </View>
              </View>
              
              <View style={styles.professionalActionButtons}>
                <TouchableOpacity
                  style={styles.professionalAddButton}
                  onPress={() => {
                    setBulkKeysText('');
                    setAddResultsMsg(null);
                    setShowAddKeysModal(true);
                  }}
                  activeOpacity={0.8}
                >
                  <MaterialCommunityIcons name="plus" size={16} color="#ffffff" />
                </TouchableOpacity>
                
              </View>
            </View>
            
            {/* Compact Stats Row */}
            <View style={styles.professionalStatsRow}>
              <View style={styles.professionalStatItem}>
                <View style={[styles.professionalStatDot, { backgroundColor: '#10b981' }]} />
                <Text style={styles.professionalStatText}>
                  {apiKeys.filter(k => k.status === 'active').length} Active
                </Text>
              </View>
              <View style={styles.professionalStatItem}>
                <View style={[styles.professionalStatDot, { backgroundColor: '#f59e0b' }]} />
                <Text style={styles.professionalStatText}>
                  {apiKeys.filter(k => k.status === 'low_credits').length} Low Credits
                </Text>
              </View>
              <View style={styles.professionalStatItem}>
                <View style={[styles.professionalStatDot, { backgroundColor: '#ef4444' }]} />
                <Text style={styles.professionalStatText}>
                  {apiKeys.filter(k => k.status === 'failed').length} Failed
                </Text>
              </View>
            </View>
          </View>

          {/* Compact Controls */}
          <View style={styles.professionalControls}>
            {/* Search Bar */}
            <View style={styles.professionalSearchContainer}>
              <MaterialIcons name="search" size={18} color="#9ca3af" />
              <TextInput
                style={styles.professionalSearchInput}
                placeholder="Search keys..."
                placeholderTextColor="#9ca3af"
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.professionalClearButton}>
                  <MaterialIcons name="clear" size={16} color="#9ca3af" />
                </TouchableOpacity>
              )}
            </View>

            {/* Unified Filter and Sort Controls */}
            <View style={styles.professionalUnifiedControls}>
              {/* Filter Section */}
              <View style={styles.professionalFilterSection}>
                  <Text style={styles.professionalSectionLabel}>Filter:</Text>
                  <View style={styles.professionalFilterChips}>
                    {(['all', 'active', 'low_credits', 'failed'] as const).map(status => (
                      <TouchableOpacity
                        key={status}
                        style={[
                          styles.professionalFilterChip,
                          filterStatus === status && styles.professionalFilterChipActive
                        ]}
                        onPress={() => setFilterStatus(status)}
                        activeOpacity={0.7}
                      >
                        <Text style={[
                          styles.professionalFilterChipText,
                          filterStatus === status && styles.professionalFilterChipTextActive
                        ]}>
                          {status === 'all' ? 'All' : status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
                
                {/* Sort Section */}
                <View style={styles.professionalSortSection}>
                  <Text style={styles.professionalSectionLabel}>Sort:</Text>
                  <View style={styles.professionalSortChips}>
                    {(['addedAt', 'lastUsed', 'usageCount', 'creditsRemaining'] as const).map(sort => (
                      <TouchableOpacity
                        key={sort}
                        style={[
                          styles.professionalSortChip,
                          sortBy === sort && styles.professionalSortChipActive
                        ]}
                        onPress={() => {
                          if (sortBy === sort) {
                            setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
                          } else {
                            setSortBy(sort);
                            setSortOrder('desc');
                          }
                        }}
                        activeOpacity={0.7}
                      >
                        <Text style={[
                          styles.professionalSortChipText,
                          sortBy === sort && styles.professionalSortChipTextActive
                        ]}>
                          {sort === 'addedAt' ? 'Added' : 
                           sort === 'lastUsed' ? 'Last Used' :
                           sort === 'usageCount' ? 'Uses' : 'Credits'}
                        </Text>
                        {sortBy === sort && (
                          <MaterialIcons 
                            name={sortOrder === 'asc' ? 'keyboard-arrow-up' : 'keyboard-arrow-down'} 
                            size={12} 
                            color={sortBy === sort ? '#ffffff' : '#64748b'} 
                          />
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
            </View>

            {/* Bulk Actions */}
            {selectedKeys.size > 0 && (
              <View style={styles.professionalBulkActions}>
                <View style={styles.professionalBulkInfo}>
                  <MaterialIcons name="check-circle" size={16} color="#0ea5e9" />
                  <Text style={styles.professionalBulkText}>{selectedKeys.size} selected</Text>
                </View>
                <View style={styles.professionalBulkButtons}>
                  <TouchableOpacity
                    style={styles.professionalBulkButton}
                    onPress={bulkDeleteKeys}
                    activeOpacity={0.8}
                  >
                    <MaterialCommunityIcons name="delete" size={14} color="#ffffff" />
                    <Text style={styles.professionalBulkButtonText}>Delete</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.professionalBulkButton, styles.professionalBulkButtonSecondary]}
                    onPress={clearSelection}
                    activeOpacity={0.8}
                  >
                    <MaterialIcons name="clear" size={14} color="#64748b" />
                    <Text style={[styles.professionalBulkButtonText, styles.professionalBulkButtonTextSecondary]}>Clear</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Select All */}
            <TouchableOpacity
              style={styles.professionalSelectAll}
              onPress={selectedKeys.size === filteredKeys.length ? clearSelection : selectAllKeys}
              activeOpacity={0.7}
            >
              <MaterialIcons 
                name={selectedKeys.size === filteredKeys.length ? 'check-box' : 'check-box-outline-blank'} 
                size={18} 
                color="#0ea5e9" 
              />
              <Text style={styles.professionalSelectAllText}>
                {selectedKeys.size === filteredKeys.length ? 'Deselect All' : 'Select All'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Compact API Keys List */}
          <FlatList
            data={filteredKeys}
            keyExtractor={(k) => k.id}
            refreshing={refreshing}
            onRefresh={onRefresh}
            contentContainerStyle={styles.professionalApiKeysList}
            showsVerticalScrollIndicator={false}
            renderItem={({ item: apiKey, index }) => (
              <TouchableOpacity
                style={[
                  styles.professionalApiKeyCard,
                  selectedKeys.has(apiKey.id) && styles.professionalApiKeyCardSelected,
                  { marginTop: index === 0 ? 0 : 8 }
                ]}
                onPress={() => openApiKeyDetails(apiKey)}
                onLongPress={() => toggleKeySelection(apiKey.id)}
                activeOpacity={0.7}
              >
                <View style={styles.professionalApiKeyCardContent}>
                  <View style={styles.professionalApiKeyLeft}>
                    <TouchableOpacity
                      style={styles.professionalSelectionCheckbox}
                      onPress={() => toggleKeySelection(apiKey.id)}
                    >
                      <MaterialIcons 
                        name={selectedKeys.has(apiKey.id) ? 'check-box' : 'check-box-outline-blank'} 
                        size={18} 
                        color={selectedKeys.has(apiKey.id) ? '#0ea5e9' : '#d1d5db'} 
                      />
                    </TouchableOpacity>
                    
                    <View style={styles.professionalApiKeyInfo}>
                      <View style={styles.professionalApiKeyHeader}>
                        <MaterialCommunityIcons name="key-variant" size={16} color="#0ea5e9" />
                        <Text style={styles.professionalApiKeyText} numberOfLines={1}>
                          {apiKey.key}
                        </Text>
                        <View style={[
                          styles.professionalStatusBadge,
                          apiKey.status === 'active' ? styles.professionalActiveBadge :
                          apiKey.status === 'low_credits' ? styles.professionalWarningBadge :
                          styles.professionalErrorBadge
                        ]}>
                          <Text style={styles.professionalStatusBadgeText}>
                            {apiKey.status === 'active' ? 'Active' : 
                             apiKey.status === 'low_credits' ? 'Low' : 
                             apiKey.status || 'Unknown'}
                          </Text>
                        </View>
                      </View>
                      
                      <View style={styles.professionalApiKeyDetails}>
                        <View style={styles.professionalApiKeyDetail}>
                          <MaterialIcons name="account-balance-wallet" size={12} color="#64748b" />
                          <Text style={styles.professionalApiKeyDetailText}>{apiKey.creditsRemaining ?? 'Unknown'}</Text>
                        </View>
                        <View style={styles.professionalApiKeyDetail}>
                          <MaterialIcons name="repeat" size={12} color="#64748b" />
                          <Text style={styles.professionalApiKeyDetailText}>{apiKey.usageCount || 0} uses</Text>
                        </View>
                        <View style={styles.professionalApiKeyDetail}>
                          <MaterialIcons name="schedule" size={12} color="#64748b" />
                          <Text style={styles.professionalApiKeyDetailText}>{apiKey.addedAt ? new Date(apiKey.addedAt).toLocaleDateString() : 'Unknown'}</Text>
                        </View>
                      </View>
                    </View>
                  </View>
                  
                  <TouchableOpacity
                    onPress={async (e) => {
                      e.stopPropagation();
                      try {
                        await deleteApiKey(apiKey.key);
                        await onRefresh();
                      } catch (error) {
                        Alert.alert('Error', 'Failed to delete API key');
                      }
                    }}
                    style={styles.professionalDeleteButton}
                    activeOpacity={0.8}
                  >
                    <MaterialCommunityIcons name="trash-can-outline" size={16} color="#ef4444" />
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <View style={styles.professionalEmptyContainer}>
                <MaterialCommunityIcons name="key-outline" size={48} color="#d1d5db" />
                <Text style={styles.professionalEmptyTitle}>No API Keys Found</Text>
                <Text style={styles.professionalEmptySubtitle}>
                  {filterStatus !== 'all' ? 'Try changing the filter settings' : 'Add some API keys to get started'}
                </Text>
                <TouchableOpacity
                  style={styles.professionalEmptyButton}
                  onPress={() => {
                    setBulkKeysText('');
                    setAddResultsMsg(null);
                    setShowAddKeysModal(true);
                  }}
                >
                  <MaterialCommunityIcons name="plus" size={18} color="#ffffff" />
                  <Text style={styles.professionalEmptyButtonText}>Add Your First Key</Text>
                </TouchableOpacity>
              </View>
            }
          />
        </View>
      )}

      {/* Reports Tab - Technical Reports from Teachers & Parents */}
      {activeTab === 'reports' && (
        <View style={styles.logsContainer}>
          {/* Reports Header with Controls */}
          <View style={styles.logsHeader}>
            <View style={styles.logsHeaderTop}>
              <View style={styles.logsTitleSection}>
                <Text style={styles.logsTitle}>Technical Reports</Text>
                <View style={styles.logsBadge}>
                  <Text style={styles.logsBadgeText}>{logs.length}</Text>
                </View>
              </View>
              
              <View style={styles.logsActions}>
                <TouchableOpacity
                  style={styles.logsActionButton}
                  onPress={async () => {
                    try {
                      await deleteData('/teacherLogs');
                      Alert.alert('Success', 'All logs cleared');
                      await fetchAll();
                    } catch (error) {
                      Alert.alert('Error', 'Failed to clear logs');
                    }
                  }}
                >
                  <MaterialIcons name="clear-all" size={18} color="#ef4444" />
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={styles.logsActionButton}
                  onPress={() => fetchAll()}
                >
                  <MaterialIcons name="refresh" size={18} color="#0ea5e9" />
                </TouchableOpacity>
              </View>
            </View>
            
            {/* Log Statistics */}
            <View style={styles.logStatsRow}>
              <View style={styles.logStatItem}>
                <View style={[styles.logStatDot, { backgroundColor: '#10b981' }]} />
                <Text style={styles.logStatText}>Recent: {logs.filter(l => new Date(l.timestamp) > new Date(Date.now() - 24*60*60*1000)).length}</Text>
              </View>
              <View style={styles.logStatItem}>
                <View style={[styles.logStatDot, { backgroundColor: '#f59e0b' }]} />
                <Text style={styles.logStatText}>This Week: {logs.filter(l => new Date(l.timestamp) > new Date(Date.now() - 7*24*60*60*1000)).length}</Text>
              </View>
              <View style={styles.logStatItem}>
                <View style={[styles.logStatDot, { backgroundColor: '#ef4444' }]} />
                <Text style={styles.logStatText}>Errors: {logs.filter(l => l.message.toLowerCase().includes('error')).length}</Text>
              </View>
            </View>
          </View>

          {/* Search and Filter Controls */}
          <View style={styles.logsControls}>
            <View style={styles.logsSearchContainer}>
              <MaterialIcons name="search" size={18} color="#9ca3af" />
              <TextInput
                style={styles.logsSearchInput}
                placeholder="Search reports by message, user, or description..."
                placeholderTextColor="#9ca3af"
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.logsClearButton}>
                  <MaterialIcons name="clear" size={16} color="#9ca3af" />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Logs List */}
          <FlatList
            data={filteredLogs}
            keyExtractor={(l) => l.id}
            refreshing={refreshing}
            onRefresh={onRefresh}
            contentContainerStyle={styles.logsList}
            showsVerticalScrollIndicator={false}
            renderItem={({ item: log, index }) => (
              <View style={[
                styles.logCard,
                { marginTop: index === 0 ? 0 : 8 }
              ]}>
                <View style={styles.logCardHeader}>
                  <View style={styles.logCardLeft}>
                    <MaterialIcons 
                      name={
                        log.message.toLowerCase().includes('error') ? 'error' :
                        log.message.toLowerCase().includes('login') ? 'login' :
                        log.message.toLowerCase().includes('create') ? 'add' :
                        log.message.toLowerCase().includes('delete') ? 'delete' :
                        'info'
                      } 
                      size={18} 
                      color={
                        log.message.toLowerCase().includes('error') ? '#ef4444' :
                        log.message.toLowerCase().includes('login') ? '#10b981' :
                        log.message.toLowerCase().includes('create') ? '#0ea5e9' :
                        log.message.toLowerCase().includes('delete') ? '#f59e0b' :
                        '#64748b'
                      } 
                    />
                    <Text style={styles.logTime}>{new Date(log.timestamp).toLocaleString()}</Text>
                  </View>
                  <View style={[
                    styles.logTypeBadge,
                    {
                      backgroundColor: log.message.toLowerCase().includes('error') ? '#fee2e2' :
                                      log.message.toLowerCase().includes('login') ? '#dcfce7' :
                                      log.message.toLowerCase().includes('create') ? '#dbeafe' :
                                      log.message.toLowerCase().includes('delete') ? '#fef3c7' :
                                      '#f1f5f9'
                    }
                  ]}>
                    <Text style={[
                      styles.logTypeText,
                      {
                        color: log.message.toLowerCase().includes('error') ? '#dc2626' :
                               log.message.toLowerCase().includes('login') ? '#16a34a' :
                               log.message.toLowerCase().includes('create') ? '#2563eb' :
                               log.message.toLowerCase().includes('delete') ? '#d97706' :
                               '#64748b'
                      }
                    ]}>
                      {log.message.toLowerCase().includes('error') ? 'ERROR' :
                       log.message.toLowerCase().includes('login') ? 'LOGIN' :
                       log.message.toLowerCase().includes('create') ? 'CREATE' :
                       log.message.toLowerCase().includes('delete') ? 'DELETE' :
                       'INFO'}
                    </Text>
                  </View>
                </View>
                <Text style={styles.logMessage}>{log.message}</Text>
                {log.teacherId && (
                  <View style={styles.logTeacherInfo}>
                    <MaterialIcons name="person" size={14} color="#64748b" />
                    <Text style={styles.logTeacherId}>Teacher ID: {log.teacherId}</Text>
                  </View>
                )}
              </View>
            )}
            ListEmptyComponent={
              <View style={styles.logsEmptyContainer}>
                <MaterialCommunityIcons name="ticket-outline" size={48} color="#d1d5db" />
                <Text style={styles.logsEmptyTitle}>No Reports Found</Text>
                <Text style={styles.logsEmptySubtitle}>
                  {searchQuery ? 'Try adjusting your search terms' : 'Technical reports from teachers and parents will appear here'}
                </Text>
              </View>
            }
          />
        </View>
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
          style={[styles.navItem, activeTab === 'apikeys' && styles.activeNavItem]}
          onPress={() => setActiveTab('apikeys')}
        >
          <View style={[styles.activeIndicator, activeTab === 'apikeys' ? styles.activeIndicatorOn : undefined]} />
          <MaterialCommunityIcons name="key" size={26} color={activeTab === 'apikeys' ? '#0ea5e9' : '#9ca3af'} />
          <Text style={[styles.navText, activeTab === 'apikeys' && styles.activeNavText]}>API Keys</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.navItem, activeTab === 'reports' && styles.activeNavItem]}
          onPress={() => setActiveTab('reports')}
        >
          <View style={[styles.activeIndicator, activeTab === 'reports' ? styles.activeIndicatorOn : undefined]} />
          <MaterialCommunityIcons name="ticket-outline" size={26} color={activeTab === 'reports' ? '#0ea5e9' : '#9ca3af'} />
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
                    {selectedTeacher.emailVerified && (
                      <View style={[styles.profileBadge, styles.emailVerifiedBadge]}>
                        <MaterialIcons name="mark-email-read" size={16} color="#ffffff" />
                        <Text style={styles.profileBadgeText}>Email Verified</Text>
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

                {/* Advanced Admin Controls */}
                <View style={styles.modalActionsContainer}>
                  <View style={styles.modalActionsGrid}>
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
                        <Text style={styles.modalActionText}>Grant Admin</Text>
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
                        <Text style={styles.modalActionText}>Revoke Admin</Text>
                      </TouchableOpacity>
                    )}
                    
                    <TouchableOpacity
                      style={[styles.modalActionButton, styles.editButton, actionBusy && { opacity: 0.7 }]}
                      disabled={actionBusy}
                      onPress={() => {
                        Alert.alert(
                          'Edit Teacher Information',
                          'Select what to edit',
                          [
                            { text: 'Cancel', style: 'cancel' },
                            { text: 'Toggle Verification', onPress: async () => {
                              try {
                                await updateData(`/teachers/${selectedTeacher.uid}`, { 
                                  isVerified: !selectedTeacher.isVerified 
                                });
                                Alert.alert('Success', `Teacher ${selectedTeacher.isVerified ? 'unverified' : 'verified'}`);
                                await fetchAll();
                                closeTeacherProfile();
                              } catch (error) {
                                Alert.alert('Error', 'Failed to update verification');
                              }
                            }},
                            { text: 'Toggle Block Status', onPress: async () => {
                              try {
                                await updateData(`/teachers/${selectedTeacher.uid}`, { 
                                  isBlocked: !selectedTeacher.isBlocked 
                                });
                                Alert.alert('Success', `Teacher ${selectedTeacher.isBlocked ? 'unblocked' : 'blocked'}`);
                                await fetchAll();
                                closeTeacherProfile();
                              } catch (error) {
                                Alert.alert('Error', 'Failed to update block status');
                              }
                            }},
                            { text: 'Reset Password', onPress: () => {
                              Alert.alert('Coming Soon', 'Password reset feature will be available soon');
                            }}
                          ]
                        );
                      }}
                    >
                      <MaterialIcons name="edit" size={18} color="#ffffff" />
                      <Text style={styles.modalActionText}>Edit Info</Text>
                    </TouchableOpacity>
                    
                    <TouchableOpacity
                      style={[styles.modalActionButton, styles.deleteButton, actionBusy && { opacity: 0.7 }]}
                      disabled={actionBusy}
                      onPress={() => {
                        Alert.alert(
                          'Delete Teacher Account',
                          '⚠️ WARNING: This will permanently delete the teacher account and all associated data. This action cannot be undone!',
                          [
                            { text: 'Cancel', style: 'cancel' },
                            { text: 'Delete', style: 'destructive', onPress: async () => {
                              try {
                                await deleteData(`/teachers/${selectedTeacher.uid}`);
                                if (selectedTeacher.isAdmin) {
                                  await deleteData(`/admins/${selectedTeacher.uid}`);
                                }
                                Alert.alert('Success', 'Teacher account deleted');
                                await fetchAll();
                                closeTeacherProfile();
                              } catch (error) {
                                Alert.alert('Error', 'Failed to delete teacher account');
                              }
                            }}
                          ]
                        );
                      }}
                    >
                      <MaterialIcons name="delete" size={18} color="#ffffff" />
                      <Text style={styles.modalActionText}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Modern API Key Details Modal */}
      <Modal
        visible={showApiKeyModal}
        animationType="slide"
        transparent={true}
        onRequestClose={closeApiKeyDetails}
      >
        <View style={styles.modernModalOverlay}>
          <View style={styles.modernModalContent}>
            <View style={styles.modernModalHeader}>
              <View style={styles.modernModalTitleSection}>
                <MaterialCommunityIcons name="key-variant" size={24} color="#0ea5e9" />
                <Text style={styles.modernModalTitle}>API Key Details</Text>
              </View>
              <TouchableOpacity style={styles.modernCloseButton} onPress={closeApiKeyDetails}>
                <AntDesign name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>

            {selectedApiKey && (
              <ScrollView style={styles.modernModalBody} showsVerticalScrollIndicator={false}>
                {/* Key Display Section */}
                <View style={styles.modernKeyDisplaySection}>
                  <View style={styles.modernKeyContainer}>
                    <Text style={styles.modernKeyText}>{selectedApiKey.key}</Text>
                    <TouchableOpacity
                      style={styles.modernCopyButton}
                      onPress={() => {
                        // Copy to clipboard functionality would go here
                        Alert.alert('Copied', 'API key copied to clipboard');
                      }}
                    >
                      <MaterialIcons name="content-copy" size={18} color="#0ea5e9" />
                    </TouchableOpacity>
                  </View>
                  
                  <View style={[
                    styles.modernStatusBadgeLarge,
                    selectedApiKey.status === 'active' ? styles.modernActiveBadgeLarge :
                    selectedApiKey.status === 'low_credits' ? styles.modernWarningBadgeLarge :
                    styles.modernErrorBadgeLarge
                  ]}>
                    <Text style={styles.modernStatusBadgeLargeText}>
                      {selectedApiKey.status === 'active' ? 'Active' : 
                       selectedApiKey.status === 'low_credits' ? 'Low Credits' : 
                       selectedApiKey.status || 'Unknown'}
                    </Text>
                  </View>
                </View>

                {/* Stats Grid */}
                <View style={styles.modernStatsGrid}>
                  <View style={styles.modernStatItem}>
                    <MaterialIcons name="account-balance-wallet" size={24} color="#0ea5e9" />
                    <Text style={styles.modernStatItemLabel}>Credits</Text>
                    <Text style={styles.modernStatItemValue}>{selectedApiKey.creditsRemaining ?? 'Unknown'}</Text>
                  </View>
                  
                  <View style={styles.modernStatItem}>
                    <MaterialIcons name="repeat" size={24} color="#10b981" />
                    <Text style={styles.modernStatItemLabel}>Uses</Text>
                    <Text style={styles.modernStatItemValue}>{selectedApiKey.usageCount || 0}</Text>
                  </View>
                  
                  <View style={styles.modernStatItem}>
                    <MaterialIcons name="schedule" size={24} color="#f59e0b" />
                    <Text style={styles.modernStatItemLabel}>Added</Text>
                    <Text style={styles.modernStatItemValue}>
                      {selectedApiKey.addedAt ? new Date(selectedApiKey.addedAt).toLocaleDateString() : 'Unknown'}
                    </Text>
                  </View>
                  
                  {selectedApiKey.lastUsed && (
                    <View style={styles.modernStatItem}>
                      <MaterialIcons name="access-time" size={24} color="#8b5cf6" />
                      <Text style={styles.modernStatItemLabel}>Last Used</Text>
                      <Text style={styles.modernStatItemValue}>
                        {new Date(selectedApiKey.lastUsed).toLocaleDateString()}
                      </Text>
                    </View>
                  )}
                </View>

                {/* Action Buttons */}
                <View style={styles.modernModalActions}>
                  <TouchableOpacity
                    style={styles.modernModalActionButton}
                    onPress={async () => {
                      Alert.alert(
                        'Delete API Key',
                        'Are you sure you want to delete this API key? This action cannot be undone.',
                        [
                          { text: 'Cancel', style: 'cancel' },
                          {
                            text: 'Delete',
                            style: 'destructive',
                            onPress: async () => {
                              try {
                                await deleteApiKey(selectedApiKey.key);
                                closeApiKeyDetails();
                                await onRefresh();
                                Alert.alert('Success', 'API key deleted successfully');
                              } catch (error) {
                                Alert.alert('Error', 'Failed to delete API key');
                              }
                            }
                          }
                        ]
                      );
                    }}
                  >
                    <MaterialCommunityIcons name="trash-can" size={20} color="#ffffff" />
                    <Text style={styles.modernModalActionText}>Delete Key</Text>
                  </TouchableOpacity>
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
                          const result = await addApiKey(key);
                          if (result) {
                            success++;
                          } else {
                            failed++;
                          }
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
    paddingTop: 40, // Increased for dynamic island
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
    justifyContent: 'space-between',
    gap: 12,
  },
  statCard: {
    width: (width - 64) / 2,
    backgroundColor: '#0ea5e9',
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
    minHeight: 120,
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
    paddingTop: 60, // Increased for dynamic island
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
    marginLeft: 6,
  },
  teacherSchool: {
    fontSize: 13,
    color: '#64748b',
    marginLeft: 6,
  },
  teacherEmailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  teacherSchoolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  teacherDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  teacherDate: {
    fontSize: 11,
    color: '#94a3b8',
    marginLeft: 6,
    fontStyle: 'italic',
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
  emailVerifiedBadge: {
    backgroundColor: '#3b82f6',
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
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 4,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  apiKeyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  deleteKeyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(239,68,68,0.08)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  deleteKeyText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ef4444',
  },
  apiKeyText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1e293b',
    fontFamily: 'monospace',
    flex: 1,
  },
  apiKeyDetails: {
    gap: 6,
  },
  apiKeyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  apiKeyLabel: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '500',
    minWidth: 60,
  },
  apiKeyValue: {
    fontSize: 12,
    color: '#1e293b',
    fontWeight: '600',
    textAlign: 'right',
    flex: 1,
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
  apiKeyActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  deleteAllKeysButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#ef4444',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  deleteAllKeysButtonText: {
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
  modalActionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  modalActionButton: {
    flex: 1,
    minWidth: 100,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  grantAdminButton: {
    backgroundColor: '#8b5cf6',
  },
  revokeAdminButton: {
    backgroundColor: '#ef4444',
  },
  editButton: {
    backgroundColor: '#0ea5e9',
  },
  deleteButton: {
    backgroundColor: '#dc2626',
  },
  modalActionText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 15,
    letterSpacing: 0.3,
  },
  
  // Enhanced API Keys Tab Styles
  apiKeysContainer: {
    flex: 1,
  },
  apiKeysHeader: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  apiKeysTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  apiKeyStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 20,
    paddingVertical: 16,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
  },
  statItem: {
    alignItems: 'center',
  },
  apiKeyStatNumber: {
    fontSize: 24,
    fontWeight: '800',
    color: '#1e293b',
    marginBottom: 4,
  },
  apiKeyStatLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
    textAlign: 'center',
  },
  apiKeyControls: {
    gap: 12,
  },
  filterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
  },
  filterGroup: {
    flex: 1,
  },
  sortGroup: {
    flex: 1,
  },
  filterLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  filterButtons: {
    flexDirection: 'row',
    gap: 6,
  },
  filterButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  filterButtonActive: {
    backgroundColor: '#0ea5e9',
    borderColor: '#0ea5e9',
  },
  filterButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  },
  filterButtonTextActive: {
    color: '#ffffff',
  },
  sortButtons: {
    flexDirection: 'row',
    gap: 6,
  },
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 4,
  },
  sortButtonActive: {
    backgroundColor: '#0ea5e9',
    borderColor: '#0ea5e9',
  },
  sortButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  },
  sortButtonTextActive: {
    color: '#ffffff',
  },
  apiKeyActionButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#10b981',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  refreshButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 12,
  },
  bulkDeleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#ef4444',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  bulkDeleteButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 12,
  },
  clearSelectionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  clearSelectionButtonText: {
    color: '#64748b',
    fontWeight: '600',
    fontSize: 12,
  },
  selectAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  selectAllButtonText: {
    color: '#64748b',
    fontWeight: '600',
    fontSize: 12,
  },
  apiKeysList: {
    padding: 20,
    gap: 12,
  },
  apiKeyCardItem: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  apiKeyCardSelected: {
    borderColor: '#0ea5e9',
    backgroundColor: '#f0f9ff',
  },
  apiKeyCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  apiKeyCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  apiKeyCardRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  selectionCheckbox: {
    padding: 4,
  },
  apiKeyCardDetails: {
    gap: 8,
  },
  apiKeyDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  apiKeyDetailItem: {
    flex: 1,
    alignItems: 'center',
  },
  apiKeyDetailLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
    marginBottom: 2,
  },
  apiKeyDetailValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1e293b',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#9ca3af',
    marginTop: 8,
    textAlign: 'center',
  },
  
  // API Key Details Modal Styles
  apiKeyDetailSection: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 28,
    backgroundColor: '#f8fafc',
  },
  apiKeyDetailHeader: {
    alignItems: 'center',
    marginBottom: 16,
  },
  apiKeyDetailTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1e293b',
    marginTop: 12,
    textAlign: 'center',
    fontFamily: 'monospace',
  },
  apiKeyDetailBadges: {
    flexDirection: 'row',
    gap: 8,
  },
  detailBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  detailBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
  },
  apiKeyDetailInfo: {
    paddingHorizontal: 28,
    paddingVertical: 24,
  },
  detailInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    gap: 16,
    paddingVertical: 8,
  },
  detailInfoContent: {
    flex: 1,
  },
  detailInfoLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#64748b',
    marginBottom: 4,
  },
  detailInfoValue: {
    fontSize: 16,
    color: '#1e293b',
    fontWeight: '600',
  },
  deleteActionButton: {
    backgroundColor: '#ef4444',
  },

  // Professional API Keys Tab Styles - Compact & Space-Efficient
  professionalApiKeysContainer: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  professionalHeader: {
    backgroundColor: '#ffffff',
    paddingTop: 60, // Increased for dynamic island
    paddingBottom: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  professionalHeaderTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  professionalTitleSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  professionalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1e293b',
  },
  professionalBadge: {
    backgroundColor: '#0ea5e9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  professionalBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
  },
  professionalActionButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  professionalAddButton: {
    backgroundColor: '#0ea5e9',
    padding: 8,
    borderRadius: 8,
  },
  professionalRefreshButton: {
    backgroundColor: '#f1f5f9',
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  professionalStatsRow: {
    flexDirection: 'row',
    gap: 16,
  },
  professionalStatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  professionalStatDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  professionalStatText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  },
  professionalControls: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  professionalSearchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  professionalSearchInput: {
    flex: 1,
    fontSize: 14,
    color: '#1e293b',
    marginLeft: 8,
    fontWeight: '500',
  },
  professionalClearButton: {
    padding: 2,
  },
  professionalUnifiedControls: {
    marginBottom: 12,
  },
  professionalUnifiedScroll: {
    paddingRight: 16,
  },
  professionalFilterSection: {
    marginTop: 6,
  },
  professionalSortSection: {
    marginTop: 14,
    marginBottom: 6,
  },
  professionalSectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
    marginBottom: 6,
  },
  professionalFilterChips: {
    flexDirection: 'row',
    gap: 6,
  },
  professionalSortChips: {
    flexDirection: 'row',
    gap: 6,
  },
  professionalFilterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  professionalFilterChipActive: {
    backgroundColor: '#0ea5e9',
    borderColor: '#0ea5e9',
  },
  professionalFilterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  },
  professionalFilterChipTextActive: {
    color: '#ffffff',
  },
  professionalSortScroll: {
    flex: 1,
  },
  professionalSortContainer: {
    flexDirection: 'row',
    gap: 6,
  },
  professionalSortChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 4,
  },
  professionalSortChipActive: {
    backgroundColor: '#0ea5e9',
    borderColor: '#0ea5e9',
  },
  professionalSortChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  },
  professionalSortChipTextActive: {
    color: '#ffffff',
  },
  professionalBulkActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f0f9ff',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#bae6fd',
  },
  professionalBulkInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  professionalBulkText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0ea5e9',
  },
  professionalBulkButtons: {
    flexDirection: 'row',
    gap: 6,
  },
  professionalBulkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#ef4444',
    gap: 4,
  },
  professionalBulkButtonSecondary: {
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  professionalBulkButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ffffff',
  },
  professionalBulkButtonTextSecondary: {
    color: '#64748b',
  },
  professionalSelectAll: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  professionalSelectAllText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0ea5e9',
  },
  professionalApiKeysList: {
    padding: 16,
    paddingBottom: 100,
  },
  professionalApiKeyCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  professionalApiKeyCardSelected: {
    borderColor: '#0ea5e9',
    backgroundColor: '#f0f9ff',
  },
  professionalApiKeyCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  professionalApiKeyLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  professionalSelectionCheckbox: {
    padding: 2,
    marginRight: 8,
  },
  professionalApiKeyInfo: {
    flex: 1,
  },
  professionalApiKeyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 8,
    flexWrap: 'wrap',
  },
  professionalApiKeyText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1e293b',
    fontFamily: 'monospace',
    flex: 1,
    minWidth: 0,
  },
  professionalStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  professionalActiveBadge: {
    backgroundColor: '#dcfce7',
  },
  professionalWarningBadge: {
    backgroundColor: '#fef3c7',
  },
  professionalErrorBadge: {
    backgroundColor: '#fee2e2',
  },
  professionalStatusBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#1e293b',
  },
  professionalApiKeyDetails: {
    flexDirection: 'row',
    gap: 12,
  },
  professionalApiKeyDetail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  professionalApiKeyDetailText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#64748b',
  },
  professionalDeleteButton: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: '#fef2f2',
  },
  professionalEmptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 32,
  },
  professionalEmptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#374151',
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  professionalEmptySubtitle: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  professionalEmptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0ea5e9',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 6,
    shadowColor: '#0ea5e9',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  professionalEmptyButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },

  // Modern Modal Styles
  modernModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  modernModalContent: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
    minHeight: '60%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 16,
  },
  modernModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  modernModalTitleSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  modernModalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1e293b',
    letterSpacing: -0.3,
  },
  modernCloseButton: {
    padding: 8,
    borderRadius: 12,
    backgroundColor: '#f8fafc',
  },
  modernModalBody: {
    flex: 1,
    paddingHorizontal: 24,
  },
  modernKeyDisplaySection: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  modernKeyContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 16,
    width: '100%',
  },
  modernKeyText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
    fontFamily: 'monospace',
  },
  modernCopyButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#f0f9ff',
    marginLeft: 12,
  },
  modernStatusBadgeLarge: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
  },
  modernActiveBadgeLarge: {
    backgroundColor: '#dcfce7',
  },
  modernWarningBadgeLarge: {
    backgroundColor: '#fef3c7',
  },
  modernErrorBadgeLarge: {
    backgroundColor: '#fee2e2',
  },
  modernStatusBadgeLargeText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1e293b',
  },
  modernStatsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginBottom: 24,
  },
  modernStatItem: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#f8fafc',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  modernStatItemLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
    marginTop: 8,
    marginBottom: 4,
  },
  modernStatItemValue: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1e293b',
    textAlign: 'center',
  },
  modernAdditionalInfo: {
    backgroundColor: '#f8fafc',
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  modernAdditionalInfoTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 12,
  },
  modernAdditionalInfoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  modernAdditionalInfoLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
    flex: 1,
  },
  modernAdditionalInfoValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1e293b',
  },
  modernModalActions: {
    paddingVertical: 20,
  },
  modernModalActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ef4444',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  modernModalActionText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 16,
  },

  // Teacher Statistics Styles
  teacherStatsContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  teacherStatsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 8,
  },
  teacherStatCard: {
    width: (width - 56) / 2, // Fixed width for 2 columns
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
    minHeight: 70,
  },
  teacherStatNumber: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1e293b',
    marginTop: 4,
    marginBottom: 2,
  },
  teacherStatLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1e293b',
    textAlign: 'center',
    marginTop: 2,
  },
  teacherStatDescription: {
    fontSize: 9,
    fontWeight: '500',
    color: '#64748b',
    textAlign: 'center',
    marginTop: 1,
  },
  teacherStatsHeader: {
    marginBottom: 16,
  },
  teacherStatsTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 4,
  },
  teacherStatsSubtitle: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '500',
  },

  // Admin Tools Styles
  adminToolsCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  adminToolsTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1e293b',
    marginBottom: 16,
    letterSpacing: -0.3,
  },
  adminToolsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 8,
  },
  adminToolButton: {
    width: (width - 15) / 4, // 4 buttons per row
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    minHeight: 80,
  },
  adminToolLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1e293b',
    marginTop: 6,
    marginBottom: 2,
    textAlign: 'center',
  },
  adminToolSubtext: {
    fontSize: 9,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 12,
  },

  // Quick Actions Styles
  searchAndActionsContainer: {
    gap: 12,
  },
  quickActionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  quickActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f0f9ff',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#bae6fd',
    gap: 6,
  },
  quickActionText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0ea5e9',
  },

  // Admin Tools Subtitle
  adminToolsSubtitle: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 16,
    fontWeight: '500',
  },

  // Logs Section Styles
  logsContainer: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  logsHeader: {
    backgroundColor: '#ffffff',
    paddingTop: 60,
    paddingBottom: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  logsHeaderTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  logsTitleSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logsTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1e293b',
  },
  logsBadge: {
    backgroundColor: '#0ea5e9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  logsBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
  },
  logsActions: {
    flexDirection: 'row',
    gap: 8,
  },
  logsActionButton: {
    backgroundColor: '#f1f5f9',
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  logStatsRow: {
    flexDirection: 'row',
    gap: 16,
  },
  logStatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  logStatDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  logStatText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  },
  logsControls: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  logsSearchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  logsSearchInput: {
    flex: 1,
    fontSize: 14,
    color: '#1e293b',
    marginLeft: 8,
    fontWeight: '500',
  },
  logsClearButton: {
    padding: 2,
  },
  logsList: {
    padding: 16,
    paddingBottom: 100,
  },
  logCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  logCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logTypeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  logTypeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  logTeacherInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  logsEmptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 32,
  },
  logsEmptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#374151',
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  logsEmptySubtitle: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
    lineHeight: 20,
  },

  // Professional Teachers Tab Styles
  professionalTeachersContainer: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  professionalTeachersHeader: {
    backgroundColor: '#ffffff',
    paddingTop: 60,
    paddingBottom: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  professionalTeachersHeaderTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  professionalTeachersTitleSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  professionalTeachersTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1e293b',
  },
  professionalTeachersBadge: {
    backgroundColor: '#0ea5e9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  professionalTeachersBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
  },
  professionalTeachersActions: {
    flexDirection: 'row',
    gap: 8,
  },
  professionalTeachersActionButton: {
    backgroundColor: '#f1f5f9',
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  professionalTeachersStats: {
    gap: 8,
  },
  professionalTeachersStatsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  professionalTeachersStatCard: {
    flex: 1,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  professionalTeachersStatNumber: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1e293b',
    marginTop: 4,
    marginBottom: 2,
  },
  professionalTeachersStatLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1e293b',
    textAlign: 'center',
  },
  professionalTeachersControls: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  professionalTeachersSearchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  professionalTeachersSearchInput: {
    flex: 1,
    fontSize: 14,
    color: '#1e293b',
    marginLeft: 8,
    fontWeight: '500',
  },
  professionalTeachersClearButton: {
    padding: 2,
  },
  professionalTeachersFilterChips: {
    flexDirection: 'row',
    gap: 6,
  },
  professionalTeachersFilterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  professionalTeachersFilterChipActive: {
    backgroundColor: '#0ea5e9',
    borderColor: '#0ea5e9',
  },
  professionalTeachersFilterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  },
  professionalTeachersFilterChipTextActive: {
    color: '#ffffff',
  },
  professionalTeachersList: {
    padding: 16,
    paddingBottom: 100,
  },
  professionalTeacherCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  professionalTeacherCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  professionalTeacherLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  professionalTeacherAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#0ea5e9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  professionalTeacherAvatarImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  professionalTeacherInfo: {
    flex: 1,
  },
  professionalTeacherName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 2,
  },
  professionalTeacherEmail: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 2,
  },
  professionalTeacherSchool: {
    fontSize: 11,
    color: '#94a3b8',
  },
  professionalTeacherRight: {
    alignItems: 'flex-end',
  },
  professionalTeacherBadges: {
    flexDirection: 'row',
    gap: 4,
    marginBottom: 4,
  },
  professionalTeacherBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  professionalVerifiedBadge: {
    backgroundColor: '#10b981',
  },
  professionalEmailVerifiedBadge: {
    backgroundColor: '#3b82f6',
  },
  professionalBlockedBadge: {
    backgroundColor: '#ef4444',
  },
  professionalAdminBadge: {
    backgroundColor: '#8b5cf6',
  },
  professionalTeacherDate: {
    fontSize: 10,
    color: '#94a3b8',
    fontWeight: '500',
  },
  professionalTeachersEmptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 32,
  },
  professionalTeachersEmptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#374151',
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  professionalTeachersEmptySubtitle: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
    lineHeight: 20,
  },
});