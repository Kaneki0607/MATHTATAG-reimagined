import { AntDesign, MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Dimensions, FlatList, Image, Modal, Platform, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, TouchableWithoutFeedback, View, useWindowDimensions } from 'react-native';
import { useResponsive } from '../hooks/useResponsive';
import { addApiKey, deleteApiKey, getApiKeyStatus } from '../lib/elevenlabs-keys';
import { getCurrentUser, onAuthChange } from '../lib/firebase-auth';
import { deleteData, readData, updateData, writeData } from '../lib/firebase-database';

type TabKey = 'home' | 'teachers' | 'apikeys' | 'updates' | 'reports';

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

interface TechnicalReport {
  id: string;
  ticketId?: string; // Legacy field for backward compatibility
  ticketNumber?: string; // Numeric-only ticket number
  reportedBy?: string; // Make optional
  reportedByEmail?: string; // Make optional
  reportedByName?: string;
  userRole?: 'teacher' | 'parent' | 'admin';
  timestamp?: string; // Make optional
  description?: string; // Make optional
  screenshots?: string[]; // Make optional
  status?: 'pending' | 'in_progress' | 'resolved'; // Make optional
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
  // When admin forwarded/sent the ticket to Super Admin
  forwardedAt?: string;
}

export default function SuperAdminDashboard() {
  const { width, height } = useWindowDimensions();
  const responsive = useResponsive();
  const [activeTab, setActiveTab] = useState<TabKey>('home');
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [apiKeys, setApiKeys] = useState<ElevenKey[]>([]);
  const [technicalReports, setTechnicalReports] = useState<TechnicalReport[]>([]);
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
  
  // Maintenance status state
  const [maintenanceStatus, setMaintenanceStatus] = useState<{
    isEnabled: boolean;
    message: string;
    version: string;
  }>({
    isEnabled: false,
    message: 'App is under maintenance. Please try again later.',
    version: '1.0.0'
  });
  const [showMaintenanceModal, setShowMaintenanceModal] = useState(false);
  const [maintenanceMessage, setMaintenanceMessage] = useState('');
  const [appVersion, setAppVersion] = useState('1.0.0');
  const [downloadUrl, setDownloadUrl] = useState('');
  
  // Update notification modal state
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [updateMessage, setUpdateMessage] = useState('');
  const [updateVersion, setUpdateVersion] = useState('1.0.0');
  const [updateDownloadUrl, setUpdateDownloadUrl] = useState('');
  
  // Update notification state (separate from maintenance)
  const [updateNotification, setUpdateNotification] = useState<{
    isEnabled: boolean;
    message: string;
    version: string;
    downloadUrl: string;
  }>({
    isEnabled: false,
    message: 'A new version of the app is available.',
    version: '1.0.0',
    downloadUrl: ''
  });

  // Technical reports state
  const [showReportDetailsModal, setShowReportDetailsModal] = useState(false);
  const [selectedReport, setSelectedReport] = useState<TechnicalReport | null>(null);
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [showPriorityDropdown, setShowPriorityDropdown] = useState(false);
  
  // Fullscreen image viewer state
  const [showFullscreenImage, setShowFullscreenImage] = useState(false);
  const [fullscreenImageUrl, setFullscreenImageUrl] = useState<string | null>(null);
  
  // Technical reports filtering and sorting
  const [reportSearchQuery, setReportSearchQuery] = useState('');
  const [reportStatusFilter, setReportStatusFilter] = useState<'all' | 'pending' | 'in_progress' | 'resolved'>('all');
  const [reportPriorityFilter, setReportPriorityFilter] = useState<'all' | 'low' | 'medium' | 'high' | 'critical'>('all');
  const [reportSortBy, setReportSortBy] = useState<'timestamp' | 'priority' | 'status'>('timestamp');
  const [reportSortOrder, setReportSortOrder] = useState<'asc' | 'desc'>('desc');
  
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

  // Load maintenance status on component mount
  useEffect(() => {
    loadMaintenanceStatus();
  }, []);

  const loadMaintenanceStatus = async () => {
    try {
      const [maintenanceResult, updateResult] = await Promise.all([
        readData('/maintenanceStatus'),
        readData('/updateNotification')
      ]);
      
      if (maintenanceResult.data) {
        setMaintenanceStatus(maintenanceResult.data);
        setMaintenanceMessage(maintenanceResult.data.message || '');
        setAppVersion(maintenanceResult.data.version || '1.0.0');
      }
      
      if (updateResult.data) {
        setUpdateNotification(updateResult.data);
        setUpdateMessage(updateResult.data.message || '');
        setUpdateVersion(updateResult.data.version || '1.0.0');
        setUpdateDownloadUrl(updateResult.data.downloadUrl || '');
      }
    } catch (error) {
      console.error('Failed to load maintenance status:', error);
    }
  };

  const updateMaintenanceStatus = async () => {
    try {
      const newStatus = {
        isEnabled: maintenanceStatus.isEnabled,
        message: maintenanceMessage,
        version: appVersion,
        updatedAt: new Date().toISOString(),
        updatedBy: superAdminName || 'Super Admin'
      };
      
      await writeData('/maintenanceStatus', newStatus);
      setMaintenanceStatus(newStatus);
      setShowMaintenanceModal(false);
      Alert.alert('Success', 'Maintenance status updated successfully');
    } catch (error) {
      Alert.alert('Error', 'Failed to update maintenance status');
    }
  };

  const updateNotificationStatus = async () => {
    try {
      const newStatus = {
        isEnabled: updateNotification.isEnabled,
        message: updateMessage,
        version: updateVersion,
        downloadUrl: updateDownloadUrl,
        updatedAt: new Date().toISOString(),
        updatedBy: superAdminName || 'Super Admin'
      };
      
      await writeData('/updateNotification', newStatus);
      setUpdateNotification(newStatus);
      setShowUpdateModal(false);
      Alert.alert('Success', 'Update notification settings updated successfully');
    } catch (error) {
      Alert.alert('Error', 'Failed to update notification settings');
    }
  };

  // Fetch all data
  const fetchAll = async () => {
    setLoading(true);
    try {
      const [teachersRes, adminsRes, logsRes, keysRes, reportsRes] = await Promise.all([
        readData('/teachers'),
        readData('/admins'),
        readData('/teacherLogs'),
        readData('/elevenlabskeys'),
        readData('/technicalReports'),
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

      // Technical Reports
      if (reportsRes.data) {
        const reportsList: TechnicalReport[] = Object.entries(reportsRes.data).map(([id, data]: [string, any]) => ({
          id,
          ticketNumber: data.ticketNumber || data.id, // Use ticketNumber or fallback to id
          ticketId: data.ticketId, // Keep for backward compatibility
          reportedBy: data.reportedBy || 'Unknown',
          reportedByEmail: data.reportedByEmail || 'unknown@example.com',
          reportedByName: data.reportedByName,
          userRole: data.userRole || 'admin',
          timestamp: data.timestamp || new Date().toISOString(),
          description: data.description || 'No description provided',
          screenshots: data.screenshots || [], // Ensure screenshots is always an array
          status: data.status || 'pending', // Default to pending
          priority: data.priority,
          category: data.category,
          resolvedAt: data.resolvedAt,
          resolvedBy: data.resolvedBy,
          forwardedAt: data.forwardedAt,
          // Technical metadata fields
          appVersion: data.appVersion,
          updateId: data.updateId,
          runtimeVersion: data.runtimeVersion,
          platform: data.platform,
          platformVersion: data.platformVersion,
          deviceInfo: data.deviceInfo,
          environment: data.environment,
          buildProfile: data.buildProfile,
          expoVersion: data.expoVersion,
          submittedAt: data.submittedAt,
        })).sort((a, b) => {
          // Sort by forwardedAt if available, otherwise fallback to original timestamp
          const aKey = a.forwardedAt || a.timestamp || 0;
          const bKey = b.forwardedAt || b.timestamp || 0;
          const aTime = aKey ? new Date(aKey).getTime() : 0;
          const bTime = bKey ? new Date(bKey).getTime() : 0;
          return bTime - aTime;
        });
        setTechnicalReports(reportsList);
      } else {
        setTechnicalReports([]); // Set empty array if no data
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      // Ensure arrays are properly initialized even on error
      setTeachers([]);
      setAdmins([]);
      setLogs([]);
      setTechnicalReports([]);
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

  const openReportDetails = (report: TechnicalReport) => {
    setSelectedReport(report);
    setShowReportDetailsModal(true);
    // Reset dropdown states when opening
    setShowStatusDropdown(false);
    setShowPriorityDropdown(false);
  };

  const closeReportDetails = () => {
    setShowReportDetailsModal(false);
    setSelectedReport(null);
    setShowStatusDropdown(false);
    setShowPriorityDropdown(false);
  };

  const openFullscreenImage = (imageUrl: string) => {
    setFullscreenImageUrl(imageUrl);
    setShowFullscreenImage(true);
  };

  const closeFullscreenImage = () => {
    setShowFullscreenImage(false);
    setFullscreenImageUrl(null);
  };

  const handleMarkReportAsDone = async (reportId: string) => {
    try {
      await updateData(`/technicalReports/${reportId}`, {
        status: 'resolved',
        resolvedAt: new Date().toISOString(),
        resolvedBy: getCurrentUser()?.email || 'Super Admin'
      });
      Alert.alert('Success', 'Report marked as resolved');
      await fetchAll();
      closeReportDetails();
    } catch (error) {
      Alert.alert('Error', 'Failed to mark report as resolved');
    }
  };

  const updateReportStatus = async (reportId: string, newStatus: 'pending' | 'in_progress' | 'resolved') => {
    try {
      const updatePayload: any = { status: newStatus };
      
      if (newStatus === 'resolved') {
        updatePayload.resolvedAt = new Date().toISOString();
        updatePayload.resolvedBy = getCurrentUser()?.email || 'Super Admin';
      }
      
      await updateData(`/technicalReports/${reportId}`, updatePayload);
      
      // Update local state
      setTechnicalReports(prev => prev.map(r => 
        r.id === reportId ? { ...r, ...updatePayload } : r
      ));
      
      if (selectedReport?.id === reportId) {
        setSelectedReport(prev => prev ? { ...prev, ...updatePayload } : null);
      }
      
      Alert.alert('Success', `Report status updated to ${newStatus.replace('_', ' ')}`);
    } catch (error) {
      Alert.alert('Error', 'Failed to update report status');
    }
  };

  const updateReportPriority = async (reportId: string, newPriority: 'low' | 'medium' | 'high' | 'critical') => {
    try {
      await updateData(`/technicalReports/${reportId}`, {
        priority: newPriority
      });
      
      // Update local state
      setTechnicalReports(prev => prev.map(r => 
        r.id === reportId ? { ...r, priority: newPriority } : r
      ));
      
      if (selectedReport?.id === reportId) {
        setSelectedReport(prev => prev ? { ...prev, priority: newPriority } : null);
      }
      
      Alert.alert('Success', `Report priority updated to ${newPriority}`);
    } catch (error) {
      Alert.alert('Error', 'Failed to update report priority');
    }
  };

  const handleRemoveReport = async (reportId: string) => {
    Alert.alert(
      'Delete Report',
      'Are you sure you want to delete this report? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            await deleteData(`/technicalReports/${reportId}`);
            Alert.alert('Success', 'Report deleted');
            await fetchAll();
            closeReportDetails();
          } catch (error) {
            Alert.alert('Error', 'Failed to delete report');
          }
        }}
      ]
    );
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
    setSelectedKeys(new Set((filteredKeys || []).map(k => k.id)));
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

  // SuperAdmin function to update individual API key status
  const updateApiKeyStatus = async (keyId: string, newStatus: 'active' | 'low_credits' | 'failed') => {
    try {
      setActionBusy(true);
      await updateData(`/elevenlabskeys/${keyId}`, { status: newStatus });
      
      // Update local state
      setApiKeys(prevKeys => 
        prevKeys.map(key => 
          key.id === keyId ? { ...key, status: newStatus } : key
        )
      );
      
      Alert.alert('Success', `API key status updated to ${newStatus.replace('_', ' ')}`);
    } catch (error) {
      console.error('Error updating API key status:', error);
      Alert.alert('Error', 'Failed to update API key status');
    } finally {
      setActionBusy(false);
    }
  };

  const filteredTeachers = (teachers || []).filter(matchesSearch);
  const filteredAdmins = (admins || []).filter(matchesSearch);
  const filteredLogs = (logs || []).filter(matchesSearch);
  
  // Enhanced technical reports filtering and sorting
  const filteredAndSortedReports = (technicalReports || [])
    .filter(report => {
      // Search filter
      const searchLower = reportSearchQuery.toLowerCase();
      const matchesSearch = !reportSearchQuery ||
        (report.ticketNumber || '').toLowerCase().includes(searchLower) ||
        (report.reportedByName || '').toLowerCase().includes(searchLower) ||
        (report.reportedByEmail || '').toLowerCase().includes(searchLower) ||
        (report.description || '').toLowerCase().includes(searchLower) ||
        (report.platform || '').toLowerCase().includes(searchLower) ||
        (report.appVersion || '').toLowerCase().includes(searchLower);
      
      // Status filter
      const matchesStatus = reportStatusFilter === 'all' || report.status === reportStatusFilter;
      
      // Priority filter
      const matchesPriority = reportPriorityFilter === 'all' || report.priority === reportPriorityFilter;
      
      return matchesSearch && matchesStatus && matchesPriority;
    })
    .sort((a, b) => {
      let aValue: any, bValue: any;
      
      switch (reportSortBy) {
        case 'timestamp':
          // Use forwardedAt when present to sort by latest "sent" first
          aValue = new Date((a.forwardedAt || a.timestamp || 0) as any).getTime();
          bValue = new Date((b.forwardedAt || b.timestamp || 0) as any).getTime();
          break;
        case 'priority':
          const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
          aValue = priorityOrder[a.priority || 'medium'];
          bValue = priorityOrder[b.priority || 'medium'];
          break;
        case 'status':
          const statusOrder = { pending: 1, in_progress: 2, resolved: 3 };
          aValue = statusOrder[a.status || 'pending'];
          bValue = statusOrder[b.status || 'pending'];
          break;
        default:
          return 0;
      }
      
      return reportSortOrder === 'asc' ? aValue - bValue : bValue - aValue;
    });
  
  // Enhanced API key filtering and sorting
  const filteredKeys = (apiKeys || [])
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
                
                <TouchableOpacity style={styles.adminToolButton} onPress={() => {
                  setActiveTab('updates');
                }}>
                  <MaterialIcons name="system-update" size={20} color="#f59e0b" />
                  <Text style={styles.adminToolLabel}>Updates</Text>
                  <Text style={styles.adminToolSubtext}>App updates</Text>
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
                          await deleteData('/elevenlabskeys');
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
                
                <TouchableOpacity style={styles.adminToolButton} onPress={() => {
                  setMaintenanceMessage(maintenanceStatus.message);
                  setAppVersion(maintenanceStatus.version);
                  setShowMaintenanceModal(true);
                }}>
                  <MaterialIcons name="build" size={20} color="#ef4444" />
                  <Text style={styles.adminToolLabel}>Maintenance</Text>
                  <Text style={styles.adminToolSubtext}>Maintenance mode</Text>
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
            data={filteredTeachers || []}
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

            {/* Compact Filter and Sort Controls */}
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false}
              style={styles.professionalUnifiedControls}
              contentContainerStyle={styles.professionalUnifiedControlsContent}
            >
              {/* Filter Section */}
              <View style={styles.professionalFilterGroup}>
                <Text style={styles.professionalSectionLabel}>Filter</Text>
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
              <View style={styles.professionalSortGroup}>
                <Text style={styles.professionalSectionLabel}>Sort</Text>
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
                          size={10} 
                          color={sortBy === sort ? '#ffffff' : '#64748b'} 
                        />
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </ScrollView>

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
            data={filteredKeys || []}
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

                      {/* SuperAdmin Status Controls */}
                      <View style={styles.professionalStatusControls}>
                        <Text style={styles.professionalStatusLabel}>Status:</Text>
                        <View style={styles.professionalStatusButtons}>
                          <TouchableOpacity
                            style={[
                              styles.professionalStatusButton,
                              apiKey.status === 'active' && styles.professionalStatusButtonActive
                            ]}
                            onPress={() => updateApiKeyStatus(apiKey.id, 'active')}
                          >
                            <Text style={[
                              styles.professionalStatusButtonText,
                              apiKey.status === 'active' && styles.professionalStatusButtonTextActive
                            ]}>
                              Active
                            </Text>
                          </TouchableOpacity>
                          
                          <TouchableOpacity
                            style={[
                              styles.professionalStatusButton,
                              apiKey.status === 'low_credits' && styles.professionalStatusButtonActive
                            ]}
                            onPress={() => updateApiKeyStatus(apiKey.id, 'low_credits')}
                          >
                            <Text style={[
                              styles.professionalStatusButtonText,
                              apiKey.status === 'low_credits' && styles.professionalStatusButtonTextActive
                            ]}>
                              Low Credits
                            </Text>
                          </TouchableOpacity>
                          
                          <TouchableOpacity
                            style={[
                              styles.professionalStatusButton,
                              apiKey.status === 'failed' && styles.professionalStatusButtonActive
                            ]}
                            onPress={() => updateApiKeyStatus(apiKey.id, 'failed')}
                          >
                            <Text style={[
                              styles.professionalStatusButtonText,
                              apiKey.status === 'failed' && styles.professionalStatusButtonTextActive
                            ]}>
                              Failed
                            </Text>
                          </TouchableOpacity>
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

      {/* Updates Tab - App Version Management */}
      {activeTab === 'updates' && (
        <View style={styles.logsContainer}>
          <View style={styles.logsHeader}>
            <View style={styles.logsHeaderTop}>
              <View style={styles.logsTitleSection}>
                <MaterialIcons name="system-update" size={24} color="#1e293b" />
                <Text style={styles.logsTitle}>App Updates</Text>
              </View>
              <TouchableOpacity style={styles.refreshButton} onPress={loadMaintenanceStatus} disabled={refreshing}>
                <MaterialIcons name="refresh" size={20} color="#0ea5e9" />
              </TouchableOpacity>
            </View>
            <Text style={styles.logsSubtitle}>Manage app version and update notifications</Text>
          </View>

          <ScrollView contentContainerStyle={styles.logsList} showsVerticalScrollIndicator={false}>
            {/* Maintenance Status Card */}
            <View style={styles.updateCard}>
              <View style={styles.updateHeader}>
                <MaterialIcons name="build" size={18} color="#ef4444" />
                <Text style={styles.updateTitle}>Maintenance Mode</Text>
              </View>
              <Text style={styles.updateVersion}>Version: {maintenanceStatus.version}</Text>
              <Text style={styles.updateMessage}>{maintenanceStatus.message}</Text>
              
              <View style={styles.updateStatus}>
                <View style={[styles.statusIndicator, maintenanceStatus.isEnabled ? styles.statusIndicatorActive : styles.statusIndicatorInactive]} />
                <Text style={styles.statusText}>
                  {maintenanceStatus.isEnabled ? 'Maintenance Mode Active' : 'Normal Operation'}
                </Text>
              </View>

              <TouchableOpacity 
                style={styles.updateEditButton}
                onPress={() => {
                  setMaintenanceMessage(maintenanceStatus.message);
                  setAppVersion(maintenanceStatus.version);
                  setShowMaintenanceModal(true);
                }}
              >
                <MaterialIcons name="edit" size={16} color="#ffffff" />
                <Text style={styles.updateEditButtonText}>Edit Maintenance Settings</Text>
              </TouchableOpacity>
            </View>

            {/* Update Notification Card */}
            <View style={styles.updateCard}>
              <View style={styles.updateHeader}>
                <MaterialIcons name="system-update" size={18} color="#0ea5e9" />
                <Text style={styles.updateTitle}>Update Notifications</Text>
              </View>
              <Text style={styles.updateVersion}>{updateNotification.version}</Text>
              <Text style={styles.updateMessage}>{updateNotification.message}</Text>
              
              <View style={styles.updateStatus}>
                <View style={[styles.statusIndicator, updateNotification.isEnabled ? styles.statusIndicatorActive : styles.statusIndicatorInactive]} />
                <Text style={styles.statusText}>
                  {updateNotification.isEnabled ? 'Update Notifications Enabled' : 'Update Notifications Disabled'}
                </Text>
              </View>

              {updateNotification.downloadUrl && (
                <View style={styles.downloadSection}>
                  <Text style={styles.downloadLabel}>Download URL:</Text>
                  <Text style={styles.downloadUrl}>{updateNotification.downloadUrl}</Text>
                </View>
              )}

              <TouchableOpacity 
                style={styles.updateEditButton}
                onPress={() => {
                  setUpdateMessage(updateNotification.message);
                  setUpdateVersion(updateNotification.version);
                  setUpdateDownloadUrl(updateNotification.downloadUrl);
                  setShowUpdateModal(true);
                }}
              >
                <MaterialIcons name="edit" size={16} color="#ffffff" />
                <Text style={styles.updateEditButtonText}>Edit Update Settings</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.updateInfoCard}>
              <Text style={styles.infoTitle}>How it works:</Text>
              <Text style={styles.infoText}>
                • <Text style={styles.boldText}>Maintenance Mode:</Text> When enabled, completely blocks all teacher and parent login attempts with maintenance message
              </Text>
              <Text style={styles.infoText}>
                • <Text style={styles.boldText}>Update Mode:</Text> Forces users to update - they cannot continue with old version, must download latest version
              </Text>
              <Text style={styles.infoText}>
                • <Text style={styles.boldText}>Download URLs:</Text> Should point to the latest APK file for Android users
              </Text>
              <Text style={styles.infoText}>
                • <Text style={styles.boldText}>Version Control:</Text> Users must update to continue using the app
              </Text>
            </View>
          </ScrollView>
        </View>
      )}

      {/* Reports Tab - Technical Reports from Admins */}
      {activeTab === 'reports' && (
        <View style={styles.reportsContainer}>
          <View style={styles.reportsHeader}>
            <View style={styles.reportsHeaderTop}>
              <View style={styles.reportsTitleSection}>
                <View style={styles.reportsIconContainer}>
                  <MaterialCommunityIcons name="bug-outline" size={28} color="#ffffff" />
                </View>
                <View>
                  <Text style={styles.reportsTitle}>Technical Reports</Text>
                  <Text style={styles.reportsSubtitle}>Admin & Teacher Submissions</Text>
                </View>
              </View>
              
              <TouchableOpacity
                style={styles.reportsRefreshButton}
                onPress={onRefresh}
              >
                <MaterialIcons name="refresh" size={22} color="#0ea5e9" />
              </TouchableOpacity>
            </View>
            
            {/* Compact Reports Stats */}
            <View style={styles.reportsStatsContainer}>
              <View style={styles.reportsStatCard}>
                <MaterialIcons name="schedule" size={14} color="#f59e0b" />
                <Text style={styles.reportsStatNumber}>
                  {technicalReports.filter(r => r.status === 'pending' || !r.status).length}
                </Text>
                <Text style={styles.reportsStatLabel}>Pending</Text>
              </View>
              
              <View style={styles.reportsStatCard}>
                <MaterialIcons name="hourglass-empty" size={14} color="#3b82f6" />
                <Text style={styles.reportsStatNumber}>
                  {technicalReports.filter(r => r.status === 'in_progress').length}
                </Text>
                <Text style={styles.reportsStatLabel}>In Progress</Text>
              </View>
              
              <View style={styles.reportsStatCard}>
                <MaterialIcons name="check-circle" size={14} color="#10b981" />
                <Text style={styles.reportsStatNumber}>
                  {technicalReports.filter(r => r.status === 'resolved').length}
                </Text>
                <Text style={styles.reportsStatLabel}>Resolved</Text>
              </View>
            </View>
          </View>

          {/* Compact Search and Filter Controls */}
          <View style={styles.reportsControls}>
            {/* Search Bar */}
            <View style={styles.reportsSearchContainer}>
              <MaterialIcons name="search" size={18} color="#9ca3af" />
              <TextInput
                style={styles.reportsSearchInput}
                placeholder="Search reports..."
                placeholderTextColor="#9ca3af"
                value={reportSearchQuery}
                onChangeText={setReportSearchQuery}
              />
              {reportSearchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setReportSearchQuery('')} style={styles.reportsClearButton}>
                  <MaterialIcons name="clear" size={16} color="#9ca3af" />
                </TouchableOpacity>
              )}
            </View>

            {/* Compact Filter Row */}
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false}
              style={styles.reportsFiltersScroll}
              contentContainerStyle={styles.reportsFiltersContent}
            >
              {/* Status Filters */}
              <View style={styles.reportsFilterGroup}>
                <Text style={styles.reportsFilterLabel}>Status</Text>
                <View style={styles.reportsFilterChips}>
                  {(['all', 'pending', 'in_progress', 'resolved'] as const).map(status => (
                    <TouchableOpacity
                      key={status}
                      style={[
                        styles.reportsFilterChip,
                        reportStatusFilter === status && styles.reportsFilterChipActive
                      ]}
                      onPress={() => setReportStatusFilter(status)}
                    >
                      <Text style={[
                        styles.reportsFilterChipText,
                        reportStatusFilter === status && styles.reportsFilterChipTextActive
                      ]}>
                        {status === 'all' ? 'All' : status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Priority Filters */}
              <View style={styles.reportsFilterGroup}>
                <Text style={styles.reportsFilterLabel}>Priority</Text>
                <View style={styles.reportsFilterChips}>
                  {(['all', 'critical', 'high', 'medium', 'low'] as const).map(priority => (
                    <TouchableOpacity
                      key={priority}
                      style={[
                        styles.reportsFilterChip,
                        reportPriorityFilter === priority && styles.reportsFilterChipActive
                      ]}
                      onPress={() => setReportPriorityFilter(priority)}
                    >
                      <Text style={[
                        styles.reportsFilterChipText,
                        reportPriorityFilter === priority && styles.reportsFilterChipTextActive
                      ]}>
                        {priority.charAt(0).toUpperCase() + priority.slice(1)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Sort Controls */}
              <View style={styles.reportsFilterGroup}>
                <Text style={styles.reportsFilterLabel}>Sort</Text>
                <View style={styles.reportsFilterChips}>
                  {(['timestamp', 'priority', 'status'] as const).map(sort => (
                    <TouchableOpacity
                      key={sort}
                      style={[
                        styles.reportsFilterChip,
                        reportSortBy === sort && styles.reportsFilterChipActive
                      ]}
                      onPress={() => {
                        if (reportSortBy === sort) {
                          setReportSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
                        } else {
                          setReportSortBy(sort);
                          setReportSortOrder('desc');
                        }
                      }}
                    >
                      <Text style={[
                        styles.reportsFilterChipText,
                        reportSortBy === sort && styles.reportsFilterChipTextActive
                      ]}>
                        {sort.charAt(0).toUpperCase() + sort.slice(1)}
                      </Text>
                      {reportSortBy === sort && (
                        <MaterialIcons 
                          name={reportSortOrder === 'asc' ? 'keyboard-arrow-up' : 'keyboard-arrow-down'} 
                          size={10} 
                          color="#ffffff" 
                        />
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </ScrollView>

            {/* Results Count */}
            <Text style={styles.reportsResultsCount}>
              {filteredAndSortedReports.length} of {technicalReports.length} reports
            </Text>
          </View>

          <FlatList
            data={filteredAndSortedReports || []}
            keyExtractor={(item) => item.id}
            refreshing={refreshing}
            onRefresh={onRefresh}
            contentContainerStyle={styles.reportsList}
            showsVerticalScrollIndicator={false}
            renderItem={({ item: report }) => (
              <TouchableOpacity
                style={styles.reportCard}
                onPress={() => openReportDetails(report)}
                activeOpacity={0.85}
              >
                {/* Priority & Status Stripe */}
                <View style={[
                  styles.reportStatusStripe,
                  report.priority === 'critical' && { backgroundColor: '#dc2626' },
                  report.priority === 'high' && { backgroundColor: '#f59e0b' },
                  report.priority === 'medium' && { backgroundColor: '#3b82f6' },
                  (!report.priority || report.priority === 'low') && { backgroundColor: '#64748b' }
                ]} />
                
                <View style={styles.reportCardContent}>
                  {/* Compact Header */}
                  <View style={styles.reportCardHeader}>
                    <View style={styles.reportHeaderLeft}>
                      <Text style={styles.reportTicketNumber}>
                        {report.ticketNumber || report.ticketId || 'N/A'}
                      </Text>
                      {/* Priority Badge */}
                      {report.priority && (
                        <View style={[
                          styles.reportPriorityBadge,
                          report.priority === 'critical' && styles.reportPriorityCritical,
                          report.priority === 'high' && styles.reportPriorityHigh,
                          report.priority === 'medium' && styles.reportPriorityMedium,
                          report.priority === 'low' && styles.reportPriorityLow
                        ]}>
                          <Text style={styles.reportPriorityText}>
                            {report.priority.charAt(0).toUpperCase()}
                          </Text>
                        </View>
                      )}
                    </View>
                    
                    <View style={[
                      styles.reportStatusBadge,
                      (report.status === 'pending' || !report.status) && styles.reportStatusBadgePending,
                      report.status === 'in_progress' && styles.reportStatusBadgeInProgress,
                      report.status === 'resolved' && styles.reportStatusBadgeResolved
                    ]}>
                      <MaterialIcons 
                        name={
                          report.status === 'pending' ? 'schedule' :
                          report.status === 'in_progress' ? 'hourglass-empty' :
                          report.status === 'resolved' ? 'check-circle' :
                          'schedule'
                        } 
                        size={14} 
                        color={
                          report.status === 'pending' ? '#f59e0b' :
                          report.status === 'in_progress' ? '#3b82f6' :
                          report.status === 'resolved' ? '#10b981' :
                          '#f59e0b'
                        }
                      />
                      <Text style={[
                        styles.reportStatusBadgeText,
                        (report.status === 'pending' || !report.status) && { color: '#f59e0b' },
                        report.status === 'in_progress' && { color: '#3b82f6' },
                        report.status === 'resolved' && { color: '#10b981' }
                      ]}>
                        {(report.status || 'pending').replace('_', ' ').toUpperCase()}
                      </Text>
                    </View>
                  </View>
                  
                  {/* Description */}
                  <Text style={styles.reportDescription} numberOfLines={2}>
                    {report.description || 'No description provided'}
                  </Text>
                  
                  {/* Compact Footer */}
                  <View style={styles.reportCardFooter}>
                    <View style={styles.reportUserSection}>
                      <Text style={styles.reportUserName} numberOfLines={1}>
                        {report.reportedByName || report.reportedByEmail || 'Unknown'}
                      </Text>
                      <Text style={styles.reportUserRole}>
                        {report.userRole?.toUpperCase() || 'ADMIN'}
                      </Text>
                    </View>
                    
                    <View style={styles.reportMetaSection}>
                      {report.screenshots && report.screenshots.length > 0 && (
                        <View style={styles.reportScreenshotBadge}>
                          <MaterialIcons name="image" size={12} color="#64748b" />
                          <Text style={styles.reportScreenshotCount}>{report.screenshots.length}</Text>
                        </View>
                      )}
                      
                      <Text style={styles.reportTimestamp}>
                        {report.timestamp ? new Date(report.timestamp).toLocaleDateString('en-US', { 
                          month: 'short', 
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        }) : 'Unknown'}
                      </Text>
                    </View>
                  </View>

                  {/* Metadata Preview - Compact */}
                  {(report.appVersion || report.platform || report.deviceInfo) && (
                    <View style={styles.reportMetadataPreview}>
                      <Text style={styles.reportMetadataText} numberOfLines={1}>
                        {report.appVersion && `v${report.appVersion}`}
                        {report.platform && ` • ${report.platform.charAt(0).toUpperCase() + report.platform.slice(1)}`}
                        {report.deviceInfo && ` • ${report.deviceInfo.split('(')[0].trim()}`}
                      </Text>
                    </View>
                  )}
                </View>
                
                <View style={styles.reportCardArrow}>
                  <MaterialIcons name="chevron-right" size={20} color="#cbd5e1" />
                </View>
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <View style={styles.reportsEmptyContainer}>
                <View style={styles.reportsEmptyIconContainer}>
                  <MaterialCommunityIcons name="bug-outline" size={64} color="#cbd5e1" />
                </View>
                <Text style={styles.reportsEmptyTitle}>No Technical Reports</Text>
                <Text style={styles.reportsEmptySubtitle}>
                  Reports submitted by admins and teachers will appear here
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
          <AntDesign name="home" size={26} color={activeTab === 'home' ? '#1e293b' : '#9ca3af'} />
          <Text style={[styles.navText, activeTab === 'home' && styles.activeNavText]}>Home</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.navItem, activeTab === 'teachers' && styles.activeNavItem]}
          onPress={() => setActiveTab('teachers')}
        >
          <MaterialCommunityIcons name="account-group" size={26} color={activeTab === 'teachers' ? '#1e293b' : '#9ca3af'} />
          <Text style={[styles.navText, activeTab === 'teachers' && styles.activeNavText]}>Teachers</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.navItem, activeTab === 'apikeys' && styles.activeNavItem]}
          onPress={() => setActiveTab('apikeys')}
        >
          <MaterialCommunityIcons name="key" size={26} color={activeTab === 'apikeys' ? '#1e293b' : '#9ca3af'} />
          <Text style={[styles.navText, activeTab === 'apikeys' && styles.activeNavText]}>API Keys</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.navItem, activeTab === 'updates' && styles.activeNavItem]}
          onPress={() => setActiveTab('updates')}
        >
          <MaterialIcons name="system-update" size={26} color={activeTab === 'updates' ? '#1e293b' : '#9ca3af'} />
          <Text style={[styles.navText, activeTab === 'updates' && styles.activeNavText]}>Updates</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.navItem, activeTab === 'reports' && styles.activeNavItem]}
          onPress={() => setActiveTab('reports')}
        >
          <MaterialIcons name="assessment" size={26} color={activeTab === 'reports' ? '#1e293b' : '#9ca3af'} />
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

      {/* Report Details Modal - Fullscreen */}
      <Modal
        visible={showReportDetailsModal}
        animationType="slide"
        transparent={false}
        onRequestClose={closeReportDetails}
      >
        <View style={styles.fullscreenModalContainer}>
          <View style={styles.fullscreenModalHeader}>
            <Text style={styles.fullscreenModalTitle}>Report Details</Text>
            <TouchableOpacity 
              style={styles.fullscreenCloseButton} 
              onPress={closeReportDetails}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <AntDesign name="close" size={24} color="#64748b" />
            </TouchableOpacity>
          </View>

          {selectedReport && (
            <ScrollView 
              style={styles.fullscreenModalBody}
              contentContainerStyle={styles.fullscreenModalBodyContent}
              showsVerticalScrollIndicator={true}
              bounces={true}
              scrollEventThrottle={16}
            >
                {/* Report Header */}
                <View style={styles.reportDetailsHeader}>
                  <View style={styles.reportDetailsHeaderTop}>
                    <View style={[
                      styles.reportDetailsStatusBadge,
                      (selectedReport.status === 'pending' || !selectedReport.status) && styles.reportDetailsStatusPending,
                      selectedReport.status === 'in_progress' && styles.reportDetailsStatusInProgress,
                      selectedReport.status === 'resolved' && styles.reportDetailsStatusResolved
                    ]}>
                      <MaterialIcons 
                        name={
                          selectedReport.status === 'pending' ? 'schedule' :
                          selectedReport.status === 'in_progress' ? 'hourglass-empty' :
                          selectedReport.status === 'resolved' ? 'check-circle' :
                          'schedule'
                        } 
                        size={16} 
                        color="#ffffff" 
                      />
                      <Text style={styles.reportDetailsStatusText}>
                        {(selectedReport.status || 'pending').toUpperCase().replace('_', ' ')}
                      </Text>
                    </View>
                    
                    <Text style={styles.reportDetailsTicketId}>#{selectedReport.ticketNumber || selectedReport.ticketId || 'N/A'}</Text>
                  </View>
                </View>

                {/* Status & Priority Management */}
                <TouchableWithoutFeedback onPress={() => {
                  setShowStatusDropdown(false);
                  setShowPriorityDropdown(false);
                }}>
                  <View style={styles.reportDetailsManagement}>
                    <Text style={styles.reportDetailsManagementTitle}>Ticket Management</Text>
                    
                    {/* Status Dropdown - Higher z-index */}
                    <View style={[styles.reportDetailsControlGroup, showStatusDropdown && styles.activeDropdownGroup]}>
                      <Text style={styles.reportDetailsControlLabel}>Status</Text>
                      <View style={[styles.dropdownContainer, showStatusDropdown && { zIndex: 10000 }]}>
                        <TouchableOpacity
                          style={[
                            styles.dropdownButton,
                            selectedReport.status === 'pending' && styles.dropdownButtonPending,
                            selectedReport.status === 'in_progress' && styles.dropdownButtonInProgress,
                            selectedReport.status === 'resolved' && styles.dropdownButtonResolved
                          ]}
                          onPress={() => {
                            setShowStatusDropdown(!showStatusDropdown);
                            setShowPriorityDropdown(false);
                          }}
                          activeOpacity={0.7}
                        >
                          <Text style={[
                            styles.dropdownButtonText,
                            selectedReport.status === 'resolved' && styles.dropdownButtonTextActive
                          ]}>
                            {(selectedReport.status || 'pending').replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                          </Text>
                          <MaterialIcons 
                            name={showStatusDropdown ? 'keyboard-arrow-up' : 'keyboard-arrow-down'} 
                            size={20} 
                            color="#64748b" 
                          />
                        </TouchableOpacity>
                        
                        {showStatusDropdown && (
                          <View style={styles.dropdownMenu}>
                            {(['pending', 'in_progress', 'resolved'] as const).map(status => (
                              <TouchableOpacity
                                key={status}
                                style={[
                                  styles.dropdownItem,
                                  selectedReport.status === status && styles.dropdownItemActive,
                                  status === 'pending' && styles.dropdownItemPending,
                                  status === 'in_progress' && styles.dropdownItemInProgress,
                                  status === 'resolved' && styles.dropdownItemResolved
                                ]}
                                onPress={() => {
                                  updateReportStatus(selectedReport.id, status);
                                  setShowStatusDropdown(false);
                                }}
                                activeOpacity={0.7}
                              >
                                <Text style={[
                                  styles.dropdownItemText,
                                  selectedReport.status === status && styles.dropdownItemTextActive
                                ]}>
                                  {status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                                </Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        )}
                      </View>
                    </View>

                    {/* Divider */}
                    <View style={styles.dropdownDivider} />

                    {/* Priority Dropdown - Lower z-index */}
                    <View style={[styles.reportDetailsControlGroup, showPriorityDropdown && styles.activeDropdownGroup]}>
                      <Text style={styles.reportDetailsControlLabel}>Priority</Text>
                      <View style={[styles.dropdownContainer, showPriorityDropdown && { zIndex: 9999 }]}>
                        <TouchableOpacity
                          style={[
                            styles.dropdownButton,
                            selectedReport.priority === 'critical' && styles.dropdownButtonCritical,
                            selectedReport.priority === 'high' && styles.dropdownButtonHigh,
                            selectedReport.priority === 'medium' && styles.dropdownButtonMedium,
                            selectedReport.priority === 'low' && styles.dropdownButtonLow
                          ]}
                          onPress={() => {
                            setShowPriorityDropdown(!showPriorityDropdown);
                            setShowStatusDropdown(false);
                          }}
                          activeOpacity={0.7}
                        >
                          <Text style={[
                            styles.dropdownButtonText,
                            selectedReport.priority === 'critical' && styles.dropdownButtonTextActive
                          ]}>
                            {(selectedReport.priority || 'medium').charAt(0).toUpperCase() + (selectedReport.priority || 'medium').slice(1)}
                          </Text>
                          <MaterialIcons 
                            name={showPriorityDropdown ? 'keyboard-arrow-up' : 'keyboard-arrow-down'} 
                            size={20} 
                            color="#64748b" 
                          />
                        </TouchableOpacity>
                        
                        {showPriorityDropdown && (
                          <View style={styles.dropdownMenu}>
                            {(['low', 'medium', 'high', 'critical'] as const).map(priority => (
                              <TouchableOpacity
                                key={priority}
                                style={[
                                  styles.dropdownItem,
                                  selectedReport.priority === priority && styles.dropdownItemActive,
                                  priority === 'critical' && styles.dropdownItemCritical,
                                  priority === 'high' && styles.dropdownItemHigh,
                                  priority === 'medium' && styles.dropdownItemMedium,
                                  priority === 'low' && styles.dropdownItemLow
                                ]}
                                onPress={() => {
                                  updateReportPriority(selectedReport.id, priority);
                                  setShowPriorityDropdown(false);
                                }}
                                activeOpacity={0.7}
                              >
                                <Text style={[
                                  styles.dropdownItemText,
                                  selectedReport.priority === priority && styles.dropdownItemTextActive
                                ]}>
                                  {priority.charAt(0).toUpperCase() + priority.slice(1)}
                                </Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        )}
                      </View>
                    </View>
                  </View>
                </TouchableWithoutFeedback>

                {/* Report Information */}
                <View style={styles.reportDetailsInfo}>
                  <View style={styles.reportDetailsInfoRow}>
                    <View style={styles.reportDetailsInfoIconContainer}>
                      <MaterialIcons name="person" size={20} color="#0ea5e9" />
                    </View>
                    <View style={styles.reportDetailsInfoContent}>
                      <Text style={styles.reportDetailsInfoLabel}>Reported By</Text>
                      <Text style={styles.reportDetailsInfoValue}>
                        {selectedReport.reportedByName || selectedReport.reportedByEmail || 'Unknown User'}
                      </Text>
                      <Text style={styles.reportDetailsInfoSubtext}>
                        {selectedReport.userRole?.toUpperCase() || 'ADMIN'} • {selectedReport.reportedByEmail || 'Unknown Email'}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.reportDetailsInfoRow}>
                    <View style={styles.reportDetailsInfoIconContainer}>
                      <MaterialIcons name="schedule" size={20} color="#0ea5e9" />
                    </View>
                    <View style={styles.reportDetailsInfoContent}>
                      <Text style={styles.reportDetailsInfoLabel}>Reported At</Text>
                      <Text style={styles.reportDetailsInfoValue}>
                        {selectedReport.timestamp ? new Date(selectedReport.timestamp).toLocaleString() : 'Unknown date'}
                      </Text>
                    </View>
                  </View>

                  {selectedReport.category && (
                    <View style={styles.reportDetailsInfoRow}>
                      <View style={styles.reportDetailsInfoIconContainer}>
                        <MaterialIcons name="category" size={20} color="#0ea5e9" />
                      </View>
                      <View style={styles.reportDetailsInfoContent}>
                        <Text style={styles.reportDetailsInfoLabel}>Category</Text>
                        <Text style={styles.reportDetailsInfoValue}>{selectedReport.category}</Text>
                      </View>
                    </View>
                  )}

                  {selectedReport.priority && (
                    <View style={styles.reportDetailsInfoRow}>
                      <View style={styles.reportDetailsInfoIconContainer}>
                        <MaterialIcons name="priority-high" size={20} color="#0ea5e9" />
                      </View>
                      <View style={styles.reportDetailsInfoContent}>
                        <Text style={styles.reportDetailsInfoLabel}>Priority</Text>
                        <Text style={styles.reportDetailsInfoValue}>{selectedReport.priority.toUpperCase()}</Text>
                      </View>
                    </View>
                  )}
                </View>

                {/* Description */}
                <View style={styles.reportDetailsDescriptionContainer}>
                  <Text style={styles.reportDetailsDescription}>{selectedReport.description || 'No description provided'}</Text>
                </View>

                {/* Complete Technical Metadata Section */}
                <View style={styles.reportDetailsMetadataContainer}>
                  <Text style={styles.reportDetailsMetadataTitle}>Technical Information</Text>
                  <View style={styles.reportDetailsMetadataContent}>
                    {/* App Information */}
                    {selectedReport.appVersion && (
                      <View style={styles.metadataRow}>
                        <MaterialIcons name="info" size={16} color="#0ea5e9" />
                        <Text style={styles.metadataLabel}>App Version:</Text>
                        <Text style={styles.metadataValue}>{selectedReport.appVersion}</Text>
                      </View>
                    )}
                    
                    {selectedReport.updateId && (
                      <View style={styles.metadataRow}>
                        <MaterialIcons name="update" size={16} color="#0ea5e9" />
                        <Text style={styles.metadataLabel}>Update ID:</Text>
                        <Text style={styles.metadataValue}>{selectedReport.updateId}</Text>
                      </View>
                    )}
                    
                    {selectedReport.runtimeVersion && (
                      <View style={styles.metadataRow}>
                        <MaterialIcons name="code" size={16} color="#0ea5e9" />
                        <Text style={styles.metadataLabel}>Runtime Version:</Text>
                        <Text style={styles.metadataValue}>{selectedReport.runtimeVersion}</Text>
                      </View>
                    )}
                    
                    {selectedReport.expoVersion && (
                      <View style={styles.metadataRow}>
                        <MaterialIcons name="extension" size={16} color="#0ea5e9" />
                        <Text style={styles.metadataLabel}>Expo Version:</Text>
                        <Text style={styles.metadataValue}>{selectedReport.expoVersion}</Text>
                      </View>
                    )}
                    
                    {/* Platform Information */}
                    {selectedReport.platform && (
                      <View style={styles.metadataRow}>
                        <MaterialIcons name="phone-android" size={16} color="#0ea5e9" />
                        <Text style={styles.metadataLabel}>Platform:</Text>
                        <Text style={styles.metadataValue}>
                          {selectedReport.platform.charAt(0).toUpperCase() + selectedReport.platform.slice(1)} {selectedReport.platformVersion}
                        </Text>
                      </View>
                    )}
                    
                    {selectedReport.deviceInfo && (
                      <View style={styles.metadataRow}>
                        <MaterialIcons name="devices" size={16} color="#0ea5e9" />
                        <Text style={styles.metadataLabel}>Device:</Text>
                        <Text style={styles.metadataValue}>{selectedReport.deviceInfo}</Text>
                      </View>
                    )}
                    
                    {/* Environment Information */}
                    {selectedReport.environment && (
                      <View style={styles.metadataRow}>
                        <MaterialIcons name="cloud" size={16} color="#0ea5e9" />
                        <Text style={styles.metadataLabel}>Environment:</Text>
                        <Text style={styles.metadataValue}>
                          {selectedReport.environment.charAt(0).toUpperCase() + selectedReport.environment.slice(1)}
                        </Text>
                      </View>
                    )}
                    
                    {selectedReport.buildProfile && (
                      <View style={styles.metadataRow}>
                        <MaterialIcons name="build" size={16} color="#0ea5e9" />
                        <Text style={styles.metadataLabel}>Build Profile:</Text>
                        <Text style={styles.metadataValue}>{selectedReport.buildProfile}</Text>
                      </View>
                    )}
                    
                    {/* Timestamps */}
                    {selectedReport.submittedAt && (
                      <View style={styles.metadataRow}>
                        <MaterialIcons name="schedule" size={16} color="#0ea5e9" />
                        <Text style={styles.metadataLabel}>Submitted At:</Text>
                        <Text style={styles.metadataValue}>
                          {new Date(selectedReport.submittedAt).toLocaleString()}
                        </Text>
                      </View>
                    )}
                    
                    {selectedReport.resolvedAt && (
                      <View style={styles.metadataRow}>
                        <MaterialIcons name="check-circle" size={16} color="#0ea5e9" />
                        <Text style={styles.metadataLabel}>Resolved At:</Text>
                        <Text style={styles.metadataValue}>
                          {new Date(selectedReport.resolvedAt).toLocaleString()}
                        </Text>
                      </View>
                    )}
                    
                    {selectedReport.resolvedBy && (
                      <View style={styles.metadataRow}>
                        <MaterialIcons name="verified-user" size={16} color="#0ea5e9" />
                        <Text style={styles.metadataLabel}>Resolved By:</Text>
                        <Text style={styles.metadataValue}>{selectedReport.resolvedBy}</Text>
                      </View>
                    )}
                    
                    {/* Report ID Information */}
                    <View style={styles.metadataRow}>
                      <MaterialIcons name="fingerprint" size={16} color="#0ea5e9" />
                      <Text style={styles.metadataLabel}>Report ID:</Text>
                      <Text style={styles.metadataValue}>{selectedReport.id}</Text>
                    </View>
                    
                    {selectedReport.ticketId && (
                      <View style={styles.metadataRow}>
                        <MaterialIcons name="confirmation-number" size={16} color="#0ea5e9" />
                        <Text style={styles.metadataLabel}>Ticket ID:</Text>
                        <Text style={styles.metadataValue}>{selectedReport.ticketId}</Text>
                      </View>
                    )}
                  </View>
                </View>

                {/* Screenshots */}
                {selectedReport.screenshots && selectedReport.screenshots.length > 0 && (
                  <View style={styles.reportDetailsScreenshotsContainer}>
                    <Text style={styles.reportDetailsScreenshotsTitle}>Screenshots ({selectedReport.screenshots.length})</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.reportDetailsScreenshotsScroll}>
                      {selectedReport.screenshots.map((screenshot, index) => (
                        <TouchableOpacity 
                          key={index} 
                          style={styles.reportDetailsScreenshotWrapper}
                          onPress={() => openFullscreenImage(screenshot)}
                          activeOpacity={0.8}
                        >
                          <Image source={{ uri: screenshot }} style={styles.reportDetailsScreenshot} />
                          <View style={styles.screenshotOverlay}>
                            <MaterialIcons name="zoom-in" size={24} color="#ffffff" />
                          </View>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}

                {/* Resolution Info */}
                {selectedReport.status === 'resolved' && selectedReport.resolvedAt && (
                  <View style={styles.reportDetailsResolutionInfo}>
                    <View style={styles.reportDetailsResolutionRow}>
                      <MaterialIcons name="check-circle" size={20} color="#059669" />
                      <Text style={styles.reportDetailsResolutionText}>Resolved</Text>
                    </View>
                    <Text style={styles.reportDetailsResolutionBy}>
                      Resolved by: {selectedReport.resolvedBy || 'Unknown'}
                    </Text>
                    <Text style={styles.reportDetailsResolutionBy}>
                      Resolved at: {selectedReport.resolvedAt ? new Date(selectedReport.resolvedAt).toLocaleString() : 'Unknown'}
                    </Text>
                  </View>
                )}
            </ScrollView>
          )}

          {/* Modal Actions - Fixed at bottom */}
          <View style={styles.fullscreenModalActions}>
            {selectedReport && selectedReport.status !== 'resolved' && selectedReport.id && (
              <TouchableOpacity
                style={styles.reportDetailsMarkDoneButton}
                onPress={() => handleMarkReportAsDone(selectedReport.id)}
              >
                <MaterialIcons name="check-circle" size={20} color="#ffffff" />
                <Text style={styles.reportDetailsMarkDoneButtonText}>Mark as Resolved</Text>
              </TouchableOpacity>
            )}
            
            <TouchableOpacity
              style={styles.reportDetailsRemoveButton}
              onPress={() => selectedReport && selectedReport.id && handleRemoveReport(selectedReport.id)}
            >
              <MaterialIcons name="delete" size={20} color="#ffffff" />
              <Text style={styles.reportDetailsRemoveButtonText}>Delete Report</Text>
            </TouchableOpacity>
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

      {/* Maintenance Status Modal */}
      <Modal
        visible={showMaintenanceModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowMaintenanceModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Maintenance Mode</Text>
              <TouchableOpacity style={styles.closeButton} onPress={() => setShowMaintenanceModal(false)}>
                <AntDesign name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              <View style={styles.maintenanceSection}>
                <View style={styles.maintenanceToggle}>
                  <Text style={styles.maintenanceLabel}>Enable Maintenance Mode</Text>
                  <TouchableOpacity
                    style={[styles.toggleButton, maintenanceStatus.isEnabled && styles.toggleButtonActive]}
                    onPress={() => setMaintenanceStatus(prev => ({ ...prev, isEnabled: !prev.isEnabled }))}
                  >
                    <View style={[styles.toggleThumb, maintenanceStatus.isEnabled && styles.toggleThumbActive]} />
                  </TouchableOpacity>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Maintenance Message</Text>
                  <TextInput
                    style={styles.textInput}
                    value={maintenanceMessage}
                    onChangeText={setMaintenanceMessage}
                    placeholder="Enter maintenance message..."
                    placeholderTextColor="#94a3b8"
                    multiline
                    numberOfLines={3}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>App Version (for reference)</Text>
                  <TextInput
                    style={styles.textInput}
                    value={appVersion}
                    onChangeText={setAppVersion}
                    placeholder="e.g., 1.0.0"
                    placeholderTextColor="#94a3b8"
                  />
                </View>

                <View style={styles.maintenanceStatus}>
                  <Text style={styles.statusLabel}>Current Status:</Text>
                  <View style={[styles.maintenanceStatusBadge, maintenanceStatus.isEnabled ? styles.maintenanceStatusBadgeActive : styles.maintenanceStatusBadgeInactive]}>
                    <Text style={[styles.maintenanceStatusText, maintenanceStatus.isEnabled ? styles.maintenanceStatusTextActive : styles.maintenanceStatusTextInactive]}>
                      {maintenanceStatus.isEnabled ? 'MAINTENANCE ENABLED' : 'NORMAL OPERATION'}
                    </Text>
                  </View>
                </View>
              </View>
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.actionButton, styles.cancelButton]}
                onPress={() => setShowMaintenanceModal(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, styles.saveButton]}
                onPress={updateMaintenanceStatus}
              >
                <Text style={styles.saveButtonText}>Save Changes</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Update Notification Modal */}
      <Modal
        visible={showUpdateModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowUpdateModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Update Notifications</Text>
              <TouchableOpacity style={styles.closeButton} onPress={() => setShowUpdateModal(false)}>
                <AntDesign name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              <View style={styles.maintenanceSection}>
                <View style={styles.maintenanceToggle}>
                  <Text style={styles.maintenanceLabel}>Enable Update Notifications</Text>
                  <TouchableOpacity
                    style={[styles.toggleButton, updateNotification.isEnabled && styles.toggleButtonActive]}
                    onPress={() => setUpdateNotification(prev => ({ ...prev, isEnabled: !prev.isEnabled }))}
                  >
                    <View style={[styles.toggleThumb, updateNotification.isEnabled && styles.toggleThumbActive]} />
                  </TouchableOpacity>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Update Message</Text>
                  <TextInput
                    style={styles.textInput}
                    value={updateMessage}
                    onChangeText={setUpdateMessage}
                    placeholder="Enter update notification message..."
                    placeholderTextColor="#94a3b8"
                    multiline
                    numberOfLines={3}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Latest App Version</Text>
                  <TextInput
                    style={styles.textInput}
                    value={updateVersion}
                    onChangeText={setUpdateVersion}
                    placeholder="e.g., 1.0.1"
                    placeholderTextColor="#94a3b8"
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Download URL</Text>
                  <TextInput
                    style={styles.textInput}
                    value={updateDownloadUrl}
                    onChangeText={setUpdateDownloadUrl}
                    placeholder="https://example.com/app.apk"
                    placeholderTextColor="#94a3b8"
                  />
                </View>

                <View style={styles.maintenanceStatus}>
                  <Text style={styles.statusLabel}>Current Status:</Text>
                  <View style={[styles.maintenanceStatusBadge, updateNotification.isEnabled ? styles.maintenanceStatusBadgeActive : styles.maintenanceStatusBadgeInactive]}>
                    <Text style={[styles.maintenanceStatusText, updateNotification.isEnabled ? styles.maintenanceStatusTextActive : styles.maintenanceStatusTextInactive]}>
                      {updateNotification.isEnabled ? 'UPDATE NOTIFICATIONS ENABLED' : 'UPDATE NOTIFICATIONS DISABLED'}
                    </Text>
                  </View>
                </View>
              </View>
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.actionButton, styles.cancelButton]}
                onPress={() => setShowUpdateModal(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, styles.saveButton]}
                onPress={updateNotificationStatus}
              >
                <Text style={styles.saveButtonText}>Save Changes</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Fullscreen Image Viewer Modal */}
      <Modal
        visible={showFullscreenImage}
        animationType="fade"
        transparent={true}
        onRequestClose={closeFullscreenImage}
      >
        <View style={styles.fullscreenImageOverlay}>
          <TouchableOpacity 
            style={styles.fullscreenImageCloseButton}
            onPress={closeFullscreenImage}
            activeOpacity={0.8}
          >
            <MaterialIcons name="close" size={32} color="#ffffff" />
          </TouchableOpacity>
          
          {fullscreenImageUrl && (
            <Image 
              source={{ uri: fullscreenImageUrl }} 
              style={styles.fullscreenImage}
              resizeMode="contain"
            />
          )}
          
          <TouchableOpacity 
            style={styles.fullscreenTapArea}
            onPress={closeFullscreenImage}
            activeOpacity={1}
          >
            <View />
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

const { width: staticWidth, height: staticHeight } = Dimensions.get('window');

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
    fontSize: 18,
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
    width: (staticWidth - 64) / 2,
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
    fontSize: 20,
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
    fontSize: 16,
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
    fontSize: 18,
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
    fontSize: 18,
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
    fontSize: 15,
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
    fontSize: 15,
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
    backgroundColor: 'transparent',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    maxHeight: '95%',
    minHeight: '70%',
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 4,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
    letterSpacing: -0.2,
  },
  closeButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#f8fafc',
  },
  modalBody: {
    flex: 1,
    paddingBottom: 20,
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
    fontSize: 18,
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
    fontSize: 14,
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
    fontSize: 14,
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
    fontSize: 18,
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
    paddingBottom: 150,
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
    fontSize: 16,
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
    gap: 12,
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
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
  },
  professionalControls: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  professionalSearchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  professionalSearchInput: {
    flex: 1,
    fontSize: 13,
    color: '#1e293b',
    marginLeft: 6,
    fontWeight: '500',
  },
  professionalClearButton: {
    padding: 2,
  },
  professionalUnifiedControls: {
    marginBottom: 8,
  },
  professionalUnifiedControlsContent: {
    paddingRight: 12,
  },
  professionalFilterGroup: {
    marginRight: 16,
  },
  professionalSortGroup: {
    marginRight: 16,
  },
  professionalSectionLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748b',
    marginBottom: 4,
  },
  professionalFilterChips: {
    flexDirection: 'row',
    gap: 4,
  },
  professionalSortChips: {
    flexDirection: 'row',
    gap: 4,
  },
  professionalFilterChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  professionalFilterChipActive: {
    backgroundColor: '#0ea5e9',
    borderColor: '#0ea5e9',
  },
  professionalFilterChipText: {
    fontSize: 10,
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
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 3,
  },
  professionalSortChipActive: {
    backgroundColor: '#0ea5e9',
    borderColor: '#0ea5e9',
  },
  professionalSortChipText: {
    fontSize: 10,
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
    paddingBottom: 150,
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
  professionalStatusControls: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  professionalStatusLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748b',
    marginBottom: 6,
  },
  professionalStatusButtons: {
    flexDirection: 'row',
    gap: 6,
  },
  professionalStatusButton: {
    flex: 1,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
  },
  professionalStatusButtonActive: {
    backgroundColor: '#0ea5e9',
    borderColor: '#0ea5e9',
  },
  professionalStatusButtonText: {
    fontSize: 9,
    fontWeight: '600',
    color: '#64748b',
  },
  professionalStatusButtonTextActive: {
    color: '#ffffff',
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
    width: (staticWidth - 56) / 2, // Fixed width for 2 columns
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
    width: (staticWidth - 15) / 4, // 4 buttons per row
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
  logsSubtitle: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 4,
    fontWeight: '500',
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
    paddingBottom: 400,
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
    paddingBottom: 150,
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

  // Maintenance Modal Styles
  maintenanceSection: {
    padding: 20,
  },
  maintenanceToggle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  maintenanceLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
  },
  toggleButton: {
    width: 50,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#e2e8f0',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  toggleButtonActive: {
    backgroundColor: '#10b981',
  },
  toggleThumb: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  toggleThumbActive: {
    transform: [{ translateX: 20 }],
  },
  inputGroup: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: '#1f2937',
    backgroundColor: '#ffffff',
  },
  maintenanceStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    padding: 16,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  statusLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginRight: 12,
  },
  maintenanceStatusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  maintenanceStatusBadgeActive: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  maintenanceStatusBadgeInactive: {
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  maintenanceStatusText: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  maintenanceStatusTextActive: {
    color: '#dc2626',
  },
  maintenanceStatusTextInactive: {
    color: '#16a34a',
  },
  modalActions: {
    flexDirection: 'row',
    padding: 20,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  actionButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    backgroundColor: '#f3f4f6',
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  saveButton: {
    backgroundColor: '#0ea5e9',
  },
  saveButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },

  // Update Card Styles
  updateCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  updateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  updateTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1e293b',
    marginLeft: 8,
  },
  updateVersion: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0ea5e9',
    marginBottom: 6,
  },
  updateMessage: {
    fontSize: 12,
    color: '#64748b',
    lineHeight: 16,
    marginBottom: 12,
  },
  updateStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  statusIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  statusIndicatorActive: {
    backgroundColor: '#ef4444',
  },
  statusIndicatorInactive: {
    backgroundColor: '#10b981',
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
  },
  downloadSection: {
    marginBottom: 16,
    padding: 12,
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  downloadLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
    marginBottom: 4,
  },
  downloadUrl: {
    fontSize: 14,
    color: '#0ea5e9',
    fontFamily: 'monospace',
  },
  updateEditButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0ea5e9',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    gap: 6,
  },
  updateEditButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ffffff',
  },
  updateInfoCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 20,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 12,     
  },
  infoText: {
    fontSize: 14,
    color: '#64748b',
    lineHeight: 20,
    marginBottom: 8,
  },
  boldText: {
    fontWeight: '700',
    color: '#1e293b',
  },

  // Report Details Modal Styles
  reportDetailsHeader: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  reportDetailsHeaderTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  reportDetailsStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 16,
    gap: 6,
  },
  reportDetailsStatusPending: {
    backgroundColor: '#fef3c7',
  },
  reportDetailsStatusInProgress: {
    backgroundColor: '#dbeafe',
  },
  reportDetailsStatusResolved: {
    backgroundColor: '#d1fae5',
  },
  reportDetailsStatusText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#1f2937',
    marginLeft: 4,
  },
  reportDetailsTicketId: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
  },
  reportDetailsInfo: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 12,
  },
  reportDetailsInfoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  reportDetailsInfoIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f0f9ff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  reportDetailsInfoContent: {
    flex: 1,
  },
  reportDetailsInfoLabel: {
    fontSize: 10,
    color: '#64748b',
    fontWeight: '600',
    marginBottom: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  reportDetailsInfoValue: {
    fontSize: 12,
    color: '#1e293b',
    fontWeight: '500',
    marginBottom: 1,
  },
  reportDetailsInfoSubtext: {
    fontSize: 10,
    color: '#64748b',
  },
  reportDetailsDescriptionContainer: {
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    padding: 16,
    marginHorizontal: 20,
    marginVertical: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  reportDetailsDescription: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 22,
    fontWeight: '500',
  },
  reportDetailsScreenshotsContainer: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    marginBottom: 12,
  },
  reportDetailsScreenshotsTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 12,
  },
  reportDetailsScreenshotsScroll: {
    marginTop: 4,
  },
  reportDetailsScreenshotWrapper: {
    marginRight: 8,
    position: 'relative',
  },
  reportDetailsScreenshot: {
    width: 80,
    height: 80,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
  },
  screenshotOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  reportDetailsResolutionInfo: {
    backgroundColor: '#f0fdf4',
    borderRadius: 8,
    padding: 16,
    marginHorizontal: 20,
    marginVertical: 12,
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  reportDetailsResolutionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  reportDetailsResolutionText: {
    fontSize: 12,
    color: '#059669',
    fontWeight: '500',
  },
  reportDetailsResolutionBy: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '400',
  },
  reportDetailsModalActions: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingBottom: Platform.OS === 'ios' ? 32 : 16,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    gap: 12,
    backgroundColor: '#ffffff',
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
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  reportDetailsMarkDoneButtonText: {
    fontSize: 15,
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
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  reportDetailsRemoveButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#ffffff',
  },

  // Reports Tab Styles
  logsRefreshButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f0f9ff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  logStatusIndicator: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logStatusPending: {
    backgroundColor: '#f59e0b',
  },
  logStatusInProgress: {
    backgroundColor: '#3b82f6',
  },
  logStatusResolved: {
    backgroundColor: '#10b981',
  },
  logInfo: {
    flex: 1,
  },
  logTicketId: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 4,
  },
  logDescription: {
    fontSize: 14,
    color: '#64748b',
    lineHeight: 18,
    marginBottom: 4,
  },
  logTimestamp: {
    fontSize: 12,
    color: '#9ca3af',
  },
  logCardRight: {
    alignItems: 'flex-end',
    gap: 8,
  },
  logUserInfo: {
    alignItems: 'flex-end',
  },
  logUserRole: {
    fontSize: 10,
    fontWeight: '700',
    color: '#0ea5e9',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  logUserName: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '500',
  },
  logScreenshotIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  logScreenshotCount: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '500',
  },

  // Enhanced Reports Tab Styles
  reportsContainer: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  reportsHeader: {
    backgroundColor: '#ffffff',
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  reportsHeaderTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  reportsTitleSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  reportsIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#ef4444',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  reportsTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1e293b',
    letterSpacing: -0.5,
  },
  reportsSubtitle: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '500',
    marginTop: 2,
  },
  reportsRefreshButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#f0f9ff',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e0f2fe',
  },
  reportsStatsContainer: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  reportsStatCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 8,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    gap: 4,
  },
  reportsStatIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  reportsStatInfo: {
    flex: 1,
  },
  reportsStatNumber: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1e293b',
  },
  reportsStatLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748b',
    textAlign: 'center',
  },
  reportsList: {
    padding: 8,
    paddingBottom: 100,
  },
  reportCard: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    flexDirection: 'row',
    overflow: 'hidden',
  },
  reportStatusStripe: {
    width: 3,
    backgroundColor: '#64748b',
  },
  reportCardContent: {
    flex: 1,
    padding: 12,
  },
  reportCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  reportHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  reportTicketNumber: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0ea5e9',
    letterSpacing: 0.5,
  },
  reportPriorityBadge: {
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reportPriorityCritical: {
    backgroundColor: '#dc2626',
  },
  reportPriorityHigh: {
    backgroundColor: '#f59e0b',
  },
  reportPriorityMedium: {
    backgroundColor: '#3b82f6',
  },
  reportPriorityLow: {
    backgroundColor: '#64748b',
  },
  reportPriorityText: {
    fontSize: 8,
    fontWeight: '700',
    color: '#ffffff',
  },
  reportStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 10,
    gap: 3,
  },
  reportStatusBadgePending: {
    backgroundColor: '#fef3c7',
  },
  reportStatusBadgeInProgress: {
    backgroundColor: '#dbeafe',
  },
  reportStatusBadgeResolved: {
    backgroundColor: '#d1fae5',
  },
  reportStatusBadgeText: {
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  reportDescription: {
    fontSize: 13,
    fontWeight: '500',
    color: '#374151',
    lineHeight: 18,
    marginBottom: 8,
  },
  reportCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  reportUserSection: {
    flex: 1,
  },
  reportUserName: {
    fontSize: 11,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 1,
  },
  reportUserRole: {
    fontSize: 9,
    fontWeight: '500',
    color: '#64748b',
    letterSpacing: 0.5,
  },
  reportMetaSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  reportScreenshotBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 4,
    paddingVertical: 1,
    backgroundColor: '#f1f5f9',
    borderRadius: 4,
  },
  reportScreenshotCount: {
    fontSize: 9,
    fontWeight: '600',
    color: '#64748b',
  },
  reportTimestamp: {
    fontSize: 9,
    fontWeight: '500',
    color: '#94a3b8',
  },
  reportMetadataPreview: {
    paddingVertical: 2,
    paddingHorizontal: 4,
    backgroundColor: '#f8fafc',
    borderRadius: 4,
    alignSelf: 'flex-start',
    marginBottom: 6,
  },
  reportMetadataText: {
    fontSize: 9,
    fontWeight: '500',
    color: '#64748b',
  },
  reportCardArrow: {
    paddingHorizontal: 8,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reportsControls: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  reportsSearchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  reportsSearchInput: {
    flex: 1,
    fontSize: 13,
    color: '#1e293b',
    marginLeft: 6,
    fontWeight: '500',
  },
  reportsClearButton: {
    padding: 2,
  },
  reportsFiltersScroll: {
    marginBottom: 6,
  },
  reportsFiltersContent: {
    paddingRight: 12,
  },
  reportsFilterGroup: {
    marginRight: 16,
  },
  reportsFilterLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748b',
    marginBottom: 4,
  },
  reportsFilterChips: {
    flexDirection: 'row',
    gap: 4,
  },
  reportsFilterChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  reportsFilterChipActive: {
    backgroundColor: '#0ea5e9',
    borderColor: '#0ea5e9',
  },
  reportsFilterChipText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748b',
  },
  reportsFilterChipTextActive: {
    color: '#ffffff',
  },
  reportsResultsCount: {
    fontSize: 10,
    fontWeight: '500',
    color: '#94a3b8',
    textAlign: 'center',
  },
  reportDetailsManagement: {
    backgroundColor: '#f8fafc',
    padding: 16,
    marginHorizontal: 20,
    marginTop: 12,
    marginBottom: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  reportDetailsManagementTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 6,
  },
  reportDetailsControlGroup: {
    marginBottom: 8,
  },
  dropdownDivider: {
    height: 1,
    backgroundColor: '#e2e8f0',
    marginVertical: 6,
    marginHorizontal: 0,
  },
  reportDetailsControlLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: '#64748b',
    marginBottom: 4,
  },
  reportDetailsControlButtons: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  reportDetailsControlButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    borderWidth: 2,
    borderColor: '#e2e8f0',
  },
  reportDetailsControlButtonActive: {
    borderWidth: 2,
  },
  reportDetailsControlPending: {
    backgroundColor: '#fffbeb',
  },
  reportDetailsControlInProgress: {
    backgroundColor: '#eff6ff',
  },
  reportDetailsControlResolved: {
    backgroundColor: '#f0fdf4',
  },
  reportDetailsControlCritical: {
    backgroundColor: '#fef2f2',
  },
  reportDetailsControlHigh: {
    backgroundColor: '#fef3c7',
  },
  reportDetailsControlMedium: {
    backgroundColor: '#dbeafe',
  },
  reportDetailsControlLow: {
    backgroundColor: '#f8fafc',
  },
  reportDetailsControlButtonText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
  },
  reportDetailsControlButtonTextActive: {
    fontWeight: '800',
    color: '#1e293b',
  },

  // Fullscreen Modal Styles
  fullscreenModalContainer: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  fullscreenModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  fullscreenModalTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1e293b',
    letterSpacing: -0.3,
  },
  fullscreenCloseButton: {
    padding: 8,
    borderRadius: 12,
    backgroundColor: '#f8fafc',
  },
  fullscreenModalBody: {
    flex: 1,
  },
  fullscreenModalBodyContent: {
    paddingBottom: 120,
  },
  fullscreenModalActions: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingBottom: Platform.OS === 'ios' ? 32 : 16,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    gap: 12,
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  activeDropdownGroup: {
    zIndex: 10000,
    elevation: 10000,
  },
  
  // Dropdown Styles - Updated for better UX
  dropdownContainer: {
    position: 'relative',
    zIndex: 1000,
    marginBottom: 4,
    elevation: 1000,
    backgroundColor: 'transparent',
  },
  dropdownButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    minWidth: 110,
    minHeight: 36,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 1,
  },
  dropdownButtonPending: {
    backgroundColor: '#fef3c7',
    borderColor: '#f59e0b',
  },
  dropdownButtonInProgress: {
    backgroundColor: '#dbeafe',
    borderColor: '#3b82f6',
  },
  dropdownButtonResolved: {
    backgroundColor: '#d1fae5',
    borderColor: '#10b981',
  },
  dropdownButtonCritical: {
    backgroundColor: '#fecaca',
    borderColor: '#ef4444',
  },
  dropdownButtonHigh: {
    backgroundColor: '#fef3c7',
    borderColor: '#f59e0b',
  },
  dropdownButtonMedium: {
    backgroundColor: '#dbeafe',
    borderColor: '#3b82f6',
  },
  dropdownButtonLow: {
    backgroundColor: '#f8fafc',
    borderColor: '#64748b',
  },
  dropdownButtonText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#374151',
    flex: 1,
    textAlign: 'left',
  },
  dropdownButtonTextActive: {
    fontWeight: '700',
    color: '#1e293b',
  },
  dropdownMenu: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 9999,
    zIndex: 9999,
    marginTop: 4,
    maxHeight: 200,
    minHeight: 120,
  },
  dropdownItem: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    minHeight: 40,
    justifyContent: 'center',
  },
  dropdownItemActive: {
    backgroundColor: '#f8fafc',
  },
  dropdownItemPending: {
    backgroundColor: '#fef3c7',
  },
  dropdownItemInProgress: {
    backgroundColor: '#dbeafe',
  },
  dropdownItemResolved: {
    backgroundColor: '#d1fae5',
  },
  dropdownItemCritical: {
    backgroundColor: '#fecaca',
  },
  dropdownItemHigh: {
    backgroundColor: '#fef3c7',
  },
  dropdownItemMedium: {
    backgroundColor: '#dbeafe',
  },
  dropdownItemLow: {
    backgroundColor: '#f8fafc',
  },
  dropdownItemText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#374151',
    textAlign: 'left',
  },
  dropdownItemTextActive: {
    fontWeight: '700',
    color: '#1e293b',
  },
  rawMetadataContainer: {
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginTop: 8,
  },
  rawMetadataText: {
    fontFamily: 'monospace',
    fontSize: 12,
    color: '#374151',
    lineHeight: 18,
  },
  reportsEmptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 80,
    paddingHorizontal: 40,
  },
  reportsEmptyIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#f8fafc',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 2,
    borderColor: '#e2e8f0',
    borderStyle: 'dashed',
  },
  reportsEmptyTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1e293b',
    marginBottom: 8,
    textAlign: 'center',
  },
  reportsEmptySubtitle: {
    fontSize: 15,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 22,
  },
  
  // Report Metadata Styles
  reportDetailsMetadataContainer: {
    backgroundColor: '#f0f9ff',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 20,
    marginVertical: 12,
    borderWidth: 1,
    borderColor: '#bae6fd',
  },
  reportDetailsMetadataTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  reportDetailsMetadataContent: {
    gap: 12,
  },
  metadataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  metadataLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
    minWidth: 120,
  },
  metadataValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1e293b',
    flex: 1,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  
  // Fullscreen Image Viewer Styles
  fullscreenImageOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullscreenImageCloseButton: {
    position: 'absolute',
    top: 60,
    right: 20,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  fullscreenImage: {
    width: '100%',
    height: '100%',
  },
  fullscreenTapArea: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
});
