import { AntDesign, MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Animated, Easing, Image, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
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

export default function ParentDashboard() {
  const router = useRouter();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const translateAnim = useRef(new Animated.Value(16)).current;
  
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
  
  // Navigation state
  const [activeSection, setActiveSection] = useState('home');
  
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

  // Load parent data on component mount
  useEffect(() => {
    loadParentData();
  }, []);

  // Load announcements when parent data is available
  useEffect(() => {
    if (parentData) {
      loadAnnouncements();
    }
  }, [parentData]);

  const loadParentData = async () => {
    try {
      // Get parent key from AsyncStorage
      const parentKey = await AsyncStorage.getItem('parent_key');
      
      if (parentKey) {
        // Load parent data from Firebase
        const result = await readData(`/parents/${parentKey}`);
        if (result.data) {
          setParentData(result.data);
        } else {
          // No data found, show registration modal
          setShowRegistrationModal(true);
        }
      } else {
        // No parent key, redirect to login
        router.replace('/ParentLogin');
      }
    } catch (error) {
      console.error('Failed to load parent data:', error);
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
    }
  };

  const markAnnouncementAsRead = async (announcementId: string) => {
    try {
      const parentKey = await AsyncStorage.getItem('parent_key');
      if (!parentKey) {
        console.log('No parent key found');
        return;
      }

      const announcement = announcements.find(a => a.id === announcementId);
      if (!announcement) {
        console.log('Announcement not found:', announcementId);
        return;
      }

      // Check if already read
      if (announcement.readBy && announcement.readBy.includes(parentKey)) {
        console.log('Announcement already read');
        return;
      }

      console.log('Marking announcement as read:', announcementId, 'for parent:', parentKey);

      // Add parent to readBy array
      const updatedReadBy = [...(announcement.readBy || []), parentKey];
      
      // Update in Firebase
      const { success, error } = await writeData(`/announcements/${announcementId}/readBy`, updatedReadBy);
      
      if (success) {
        console.log('Successfully updated Firebase');
        
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
      
      // Save parent data to Firebase
      const parentData = {
        firstName: registrationData.firstName,
        lastName: registrationData.lastName,
        email: registrationData.email,
        mobile: registrationData.mobile,
        profilePictureUrl: profilePictureUrl,
        parentKey: parentKey,
        createdAt: new Date().toISOString(),
      };
      
      const { success, error: dbError } = await writeData(`/parents/${parentKey}`, parentData);
      
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

      let profilePictureUrl = parentData?.profilePictureUrl || '';
      
      // Upload new profile picture if provided
      if (profileEditData.profilePicture) {
        try {
          const response = await fetch(profileEditData.profilePicture);
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
      
      // Update parent data in Firebase
      const updatedParentData: ParentData = {
        ...parentData!,
        firstName: profileEditData.firstName,
        lastName: profileEditData.lastName,
        email: profileEditData.email,
        mobile: profileEditData.mobile,
        profilePictureUrl: profilePictureUrl,
      };
      
      const { success, error: dbError } = await writeData(`/parents/${parentKey}`, updatedParentData);
      
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

  return (
    <View style={styles.container}>
      <View style={styles.backgroundPattern} />

      <Animated.View style={{ flex: 1, opacity: fadeAnim, transform: [{ translateY: translateAnim }] }}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
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
                  <MaterialIcons name="person" size={24} color="#64748b" />
                </View>
              )}
            </TouchableOpacity>
            <View style={styles.welcomeText}>
              <Text style={styles.welcomeLabel}>Welcome,</Text>
              <Text style={styles.welcomeTitle}>
                {parentData ? `${parentData.firstName} ${parentData.lastName}` : 'Loading...'}
              </Text>
            </View>
          </View>
        </View>


        {/* Home Section */}
        {activeSection === 'home' && (
          <>
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
                    
                    // Debug logging
                    console.log('Announcement:', announcement.id, 'ParentKey:', parentKey, 'ReadBy:', announcement.readBy, 'IsRead:', isRead);
                    
                    return (
                      <TouchableOpacity 
                        key={announcement.id} 
                        style={[
                          styles.announcementCardHorizontal,
                          !isRead && styles.unreadAnnouncementCard
                        ]}
                        onPress={() => openAnnouncementModal(announcement)}
                      >
                        

                        <View style={styles.announcementContent}>
                          <View style={styles.announcementIcon}>
                            <View style={styles.announcementIconContainer}>
                              <MaterialIcons name="campaign" size={16} color="#ffffff" />
                            </View>
                            <Text style={styles.announcementTitleText}>{announcement.title}</Text>
                          </View>
                          <Text style={styles.announcementDescription} numberOfLines={3}>
                            {announcement.message}
                          </Text>
                          
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

            <View style={styles.studentProfileSection}>
              <Text style={styles.studentProfileTitle}>Overview Student Profile</Text>

            <View style={styles.studentProfileCard}>
              <View style={styles.studentHeader}>
                <View style={styles.studentAvatar}>
                  <MaterialIcons name="person" size={28} color="#64748b" />
                </View>
                <View style={styles.studentInfo}>
                  <Text style={styles.studentName}>Ken Cas</Text>
                  <Text style={styles.studentId}>ID: Jbfwwhqwrh8</Text>
                  <Text style={styles.studentGrade}>Grade 1 Mabait</Text>
                </View>
                <View style={styles.awardIcon}>
                  <MaterialCommunityIcons name="medal" size={24} color="#fbbf24" />
                </View>
              </View>

              <View style={styles.progressSection}>
                <View style={styles.progressCircle}>
                  <Text style={styles.progressText}>58%</Text>
                </View>
                <Text style={styles.progressDescription}>58% of Quarter 2 activities completed</Text>
              </View>

              <View style={styles.metricsGrid}>
                <View style={styles.metricCard}>
                  <View style={styles.metricIcon}>
                    <MaterialCommunityIcons name="bookshelf" size={24} color="#3b82f6" />
                  </View>
                  <Text style={styles.metricText}>85% Overall Average</Text>
                </View>

                <View style={styles.metricCard}>
                  <View style={styles.metricIcon}>
                    <MaterialCommunityIcons name="dice-2" size={24} color="#8b5cf6" />
                  </View>
                  <Text style={styles.metricText}>Last Played: Subtraction Game</Text>
                </View>

                <View style={styles.metricCard}>
                  <View style={styles.metricIcon}>
                    <MaterialIcons name="star" size={24} color="#fbbf24" />
                  </View>
                  <Text style={styles.metricText}>Strongest Competency Patterns and Sequences</Text>
                </View>

                <View style={styles.metricCard}>
                  <View style={styles.metricIcon}>
                    <MaterialIcons name="warning" size={24} color="#f59e0b" />
                  </View>
                  <Text style={styles.metricText}>Needs Improvement Subtraction with borrowing</Text>
                </View>
              </View>

              <View style={styles.feedbackCard}>
                <View style={styles.feedbackIcon}>
                  <MaterialIcons name="info" size={20} color="#3b82f6" />
                </View>
                <Text style={styles.feedbackText}>
                  This week, Lino improved in subtraction but struggled with fractions. Try practicing with real coins at home.
                </Text>
              </View>
            </View>
          </View>
          </>
        )}

        {/* Tasks Section */}
        {activeSection === 'tasks' && (
          <View style={styles.tasksSection}>
            <Text style={styles.sectionTitle}>Student Tasks</Text>
            <View style={styles.tasksCard}>
              <View style={styles.taskItem}>
                <View style={styles.taskIcon}>
                  <MaterialCommunityIcons name="math-compass" size={24} color="#3b82f6" />
                </View>
                <View style={styles.taskContent}>
                  <Text style={styles.taskTitle}>Math Practice - Addition</Text>
                  <Text style={styles.taskDescription}>Complete 10 addition problems</Text>
                  <Text style={styles.taskDueDate}>Due: Tomorrow</Text>
                </View>
                <View style={styles.taskStatus}>
                  <Text style={styles.taskStatusText}>Pending</Text>
                </View>
              </View>

              <View style={styles.taskItem}>
                <View style={styles.taskIcon}>
                  <MaterialCommunityIcons name="book-open-variant" size={24} color="#8b5cf6" />
                </View>
                <View style={styles.taskContent}>
                  <Text style={styles.taskTitle}>Reading Assignment</Text>
                  <Text style={styles.taskDescription}>Read Chapter 3 of English book</Text>
                  <Text style={styles.taskDueDate}>Due: Friday</Text>
                </View>
                <View style={styles.taskStatus}>
                  <Text style={styles.taskStatusText}>In Progress</Text>
                </View>
              </View>

              <View style={styles.taskItem}>
                <View style={styles.taskIcon}>
                  <MaterialCommunityIcons name="palette" size={24} color="#f59e0b" />
                </View>
                <View style={styles.taskContent}>
                  <Text style={styles.taskTitle}>Art Project</Text>
                  <Text style={styles.taskDescription}>Create a family portrait</Text>
                  <Text style={styles.taskDueDate}>Due: Next Week</Text>
                </View>
                <View style={styles.taskStatus}>
                  <Text style={styles.taskStatusText}>Not Started</Text>
                </View>
              </View>
            </View>
          </View>
        )}

        {/* History Section */}
        {activeSection === 'history' && (
          <View style={styles.historySection}>
            <Text style={styles.sectionTitle}>Activity History</Text>
            <View style={styles.historyCard}>
              <View style={styles.historyItem}>
                <View style={styles.historyIcon}>
                  <MaterialCommunityIcons name="check-circle" size={20} color="#10b981" />
                </View>
                <View style={styles.historyContent}>
                  <Text style={styles.historyTitle}>Math Quiz Completed</Text>
                  <Text style={styles.historyDescription}>Scored 85% on Addition Quiz</Text>
                  <Text style={styles.historyDate}>2 hours ago</Text>
                </View>
              </View>

              <View style={styles.historyItem}>
                <View style={styles.historyIcon}>
                  <MaterialCommunityIcons name="book-open" size={20} color="#3b82f6" />
                </View>
                <View style={styles.historyContent}>
                  <Text style={styles.historyTitle}>Reading Session</Text>
                  <Text style={styles.historyDescription}>Completed 30 minutes of reading</Text>
                  <Text style={styles.historyDate}>Yesterday</Text>
                </View>
              </View>

              <View style={styles.historyItem}>
                <View style={styles.historyIcon}>
                  <MaterialCommunityIcons name="gamepad-variant" size={20} color="#8b5cf6" />
                </View>
                <View style={styles.historyContent}>
                  <Text style={styles.historyTitle}>Math Game Played</Text>
                  <Text style={styles.historyDescription}>Subtraction Game - Level 3</Text>
                  <Text style={styles.historyDate}>2 days ago</Text>
                </View>
              </View>

              <View style={styles.historyItem}>
                <View style={styles.historyIcon}>
                  <MaterialCommunityIcons name="pencil" size={20} color="#f59e0b" />
                </View>
                <View style={styles.historyContent}>
                  <Text style={styles.historyTitle}>Writing Exercise</Text>
                  <Text style={styles.historyDescription}>Completed handwriting practice</Text>
                  <Text style={styles.historyDate}>3 days ago</Text>
                </View>
              </View>
            </View>
          </View>
        )}
      </ScrollView>
      </Animated.View>

      <Animated.View style={[styles.bottomNav, { opacity: fadeAnim }] }>
        <TouchableOpacity 
          style={[styles.navItem, activeSection === 'home' && styles.activeNavItem]}
          onPress={() => setActiveSection('home')}
        >
          <MaterialIcons name="home" size={24} color={activeSection === 'home' ? "#000000" : "#9ca3af"} />
          <Text style={[styles.navText, activeSection === 'home' && styles.activeNavText]}>Home</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.navItem, activeSection === 'tasks' && styles.activeNavItem]}
          onPress={() => setActiveSection('tasks')}
        >
          <MaterialCommunityIcons name="clipboard-check" size={24} color={activeSection === 'tasks' ? "#000000" : "#9ca3af"} />
          <Text style={[styles.navText, activeSection === 'tasks' && styles.activeNavText]}>Tasks</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.navItem, activeSection === 'history' && styles.activeNavItem]}
          onPress={() => setActiveSection('history')}
        >
          <MaterialCommunityIcons name="clock-outline" size={24} color={activeSection === 'history' ? "#000000" : "#9ca3af"} />
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
      <Modal visible={showAnnouncementModal} animationType="fade" transparent>
        <View style={styles.announcementModalOverlay}>
          <View style={styles.announcementModal}>
            <View style={styles.announcementModalHeader}>
              <Text style={styles.announcementModalTitle}>Announcement Details</Text>
              <TouchableOpacity onPress={closeAnnouncementModal} style={styles.announcementModalCloseButton}>
                <AntDesign name="close" size={24} color="#1e293b" />
              </TouchableOpacity>
            </View>
            
            {selectedAnnouncement && (
              <ScrollView 
                style={styles.announcementModalScrollView}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.announcementModalContent}
              >
                <View style={styles.announcementModalCard}>
                  <View style={styles.announcementModalCardHeader}>
                    <View style={styles.announcementModalIcon}>
                      <View style={styles.announcementIconContainer}>
                        <MaterialIcons name="campaign" size={20} color="#ffffff" />
                      </View>
                      <Text style={styles.announcementModalCardTitle}>{selectedAnnouncement.title}</Text>
                    </View>
                  </View>
                  
                  <View style={styles.announcementModalCardBody}>
                    <Text style={styles.announcementModalMessage}>{selectedAnnouncement.message}</Text>
                  </View>
                  
                  <View style={styles.announcementModalCardFooter}>
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
            )}
            
            <View style={styles.announcementModalActions}>
              <TouchableOpacity style={styles.closeAnnouncementButton} onPress={closeAnnouncementModal}>
                <Text style={styles.closeAnnouncementButtonText}>Close</Text>
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
    paddingHorizontal: 20,
    paddingTop: 60,
  },
  header: {
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
  },
  profileImagePlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#e2e8f0',
  },
  welcomeText: {
    flex: 1,
  },
  welcomeLabel: {
    fontSize: 16,
    color: '#64748b',
    marginBottom: 4,
    fontWeight: '500',
  },
  welcomeTitle: {
    fontSize: 20,
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
    fontSize: 20,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 16,
  },
  tasksSection: {
    marginBottom: 100,
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
  taskItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  taskIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#f8fafc',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  taskContent: {
    flex: 1,
  },
  taskTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 4,
  },
  taskDescription: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 4,
  },
  taskDueDate: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '500',
  },
  taskStatus: {
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  taskStatusText: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '600',
  },
  historySection: {
    marginBottom: 100,
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
  announcementModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 40,
  },
  announcementModal: {
    width: '100%',
    maxWidth: 500,
    maxHeight: '90%',
    backgroundColor: '#ffffff',
    borderRadius: 20,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 25,
  },
  announcementModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  announcementModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1e293b',
  },
  announcementModalCloseButton: {
    padding: 4,
  },
  announcementModalScrollView: {
    flex: 1,
  },
  announcementModalContent: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  announcementModalCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  announcementModalCardHeader: {
    marginBottom: 16,
  },
  announcementModalIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  announcementModalCardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
    marginLeft: 12,
    flex: 1,
  },
  announcementModalCardBody: {
    marginBottom: 20,
  },
  announcementModalMessage: {
    fontSize: 16,
    color: '#1e293b',
    lineHeight: 24,
  },
  announcementModalCardFooter: {
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
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
    flex: 1,
  },
  announcementModalActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    backgroundColor: '#ffffff',
  },
  closeAnnouncementButton: {
    backgroundColor: '#3b82f6',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 32,
    alignItems: 'center',
  },
  closeAnnouncementButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});

