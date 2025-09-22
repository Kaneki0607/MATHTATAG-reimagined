import { AntDesign, MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
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
import { readData, updateData } from '../lib/firebase-database';
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

export default function TeacherDashboard() {
  const router = useRouter();
  const [teacherData, setTeacherData] = useState<TeacherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState<TeacherData | null>(null);
  const [uploading, setUploading] = useState(false);

  // Auth state
  const [currentUserId, setCurrentUserId] = useState<string | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = onAuthChange((user) => {
      setCurrentUserId(user?.uid);
      if (user?.uid) {
        fetchTeacherData(user.uid);
      } else {
        router.replace('/TeacherLogin');
      }
    });
    return unsubscribe;
  }, []);

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
             <TouchableOpacity style={styles.editButton}>
               <AntDesign name="edit" size={20} color="#ffffff" />
             </TouchableOpacity>
           </View>
         </View>

         {/* Action Buttons */}
         <View style={styles.actionButtons}>
           <TouchableOpacity style={styles.actionCard}>
             <View style={styles.actionGradient1}>
               <View style={styles.actionIcon}>
                 <MaterialCommunityIcons name="book-open-variant" size={28} color="#3182ce" />
               </View>
               <Text style={styles.actionText}>Add Class</Text>
             </View>
           </TouchableOpacity>
           
           <TouchableOpacity style={styles.actionCard}>
             <View style={styles.actionGradient2}>
               <View style={styles.actionIcon}>
                 <MaterialCommunityIcons name="target" size={28} color="#38a169" />
               </View>
               <Text style={styles.actionText}>Add Exercise</Text>
             </View>
           </TouchableOpacity>
         </View>

         {/* Classrooms Section */}
         <View style={styles.classroomsSection}>
           <View style={styles.classroomCard}>
             <Text style={styles.sectionTitle}>Classrooms</Text>
             <View style={styles.classroomHeader}>
               <Text style={styles.classroomTitle}>Section Masikap</Text>
               <Text style={styles.classroomSubtitle}>Camohaguin Elementary School</Text>
               <Text style={styles.classroomYear}>SY: 25-26</Text>
             </View>
            
             {/* Analytics Section */}
             <View style={styles.analyticsContainer}>
               <View style={styles.analyticsHeader}>
                 <Text style={styles.analyticsTitle}>Performance Analytics</Text>
                 <TouchableOpacity style={styles.viewAllButton}>
                   <Text style={styles.viewAllText}>View All</Text>
                   <AntDesign name="arrow-right" size={14} color="#3b82f6" />
                 </TouchableOpacity>
               </View>
               
               {/* Analytics Cards */}
               <View style={styles.analyticsCards}>
                 <View style={styles.analyticsCard}>
                   <View style={styles.analyticsIcon}>
                     <MaterialCommunityIcons name="chart-line" size={24} color="#10b981" />
                   </View>
                   <View style={styles.analyticsContent}>
                     <Text style={styles.analyticsLabel}>Overall Performance</Text>
                     <Text style={styles.analyticsValue}>85%</Text>
                     <Text style={styles.analyticsChange}>+5% from last week</Text>
                   </View>
                 </View>
                 
                 <View style={styles.analyticsCard}>
                   <View style={styles.analyticsIcon}>
                     <MaterialCommunityIcons name="account-group" size={24} color="#3b82f6" />
                   </View>
                   <View style={styles.analyticsContent}>
                     <Text style={styles.analyticsLabel}>Active Students</Text>
                     <Text style={styles.analyticsValue}>24</Text>
                     <Text style={styles.analyticsChange}>All students engaged</Text>
                   </View>
                 </View>
               </View>
               
               {/* Quick Stats */}
               <View style={styles.quickStats}>
                 <View style={styles.statItem}>
                   <Text style={styles.statValue}>12</Text>
                   <Text style={styles.statLabel}>Assignments</Text>
                 </View>
                 <View style={styles.statDivider} />
                 <View style={styles.statItem}>
                   <Text style={styles.statValue}>8</Text>
                   <Text style={styles.statLabel}>Completed</Text>
                 </View>
                 <View style={styles.statDivider} />
                 <View style={styles.statItem}>
                   <Text style={styles.statValue}>4</Text>
                   <Text style={styles.statLabel}>Pending</Text>
                 </View>
               </View>
             </View>
          </View>
        </View>
      </ScrollView>

      {/* Bottom Navigation */}
      <View style={styles.bottomNav}>
        <TouchableOpacity style={[styles.navItem, styles.activeNavItem]}>
          <AntDesign name="home" size={24} color="#000000" />
          <Text style={[styles.navText, styles.activeNavText]}>Home</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.navItem}>
          <MaterialIcons name="list" size={24} color="#9ca3af" />
          <Text style={styles.navText}>List</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.navItem}>
          <MaterialCommunityIcons name="account-group" size={24} color="#9ca3af" />
          <Text style={styles.navText}>Class</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.navItem}>
          <MaterialCommunityIcons name="chart-bar" size={24} color="#9ca3af" />
          <Text style={styles.navText}>Reports</Text>
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
    paddingTop: 20,
  },
  
  // Header Styles
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 32,
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
