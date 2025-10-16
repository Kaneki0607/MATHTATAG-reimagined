import { AntDesign } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFonts } from 'expo-font';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Dimensions, Image, ImageBackground, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import TermsAndConditions from '../components/TermsAndConditions';
import { readData, writeData } from '../lib/firebase-database';
import { uploadFile } from '../lib/firebase-storage';
import { hasParentAgreedToTerms, recordParentTermsAgreement } from '../lib/terms-utils';

const { width } = Dimensions.get('window'); // Removed unused height variable

export default function ParentLogin() {
  const router = useRouter();
  const [parentKey, setParentKey] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [fontsLoaded] = useFonts({
    'LeagueSpartan-Bold': require('../assets/fonts/LeagueSpartan-Bold.ttf'),
  });

  const [showTermsModal, setShowTermsModal] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [currentParentId, setCurrentParentId] = useState<string | null>(null);
  
  // Parent Registration Modal States
  const [showRegistrationModal, setShowRegistrationModal] = useState(false);
  const [registrationData, setRegistrationData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    mobile: '',
    profilePicture: null as string | null
  });
  const [registrationLoading, setRegistrationLoading] = useState(false);
  
  
  // Remember parent key
  const STORAGE_PARENT_KEY = 'parent_key';

  useEffect(() => {
    // Load saved parent key and check terms agreement
    (async () => {
      try {
        const savedKey = await AsyncStorage.getItem(STORAGE_PARENT_KEY);
        if (savedKey) {
          setParentKey(savedKey);
          
          // Check if this parent has already agreed to terms
          const hasAgreed = await hasParentAgreedToTerms();
          if (hasAgreed) {
            setAgreedToTerms(true);
          } else {
            // Show terms modal only if they haven't agreed yet
            setShowTermsModal(true);
          }
        } else {
          // No saved key, show terms modal for new users
          setShowTermsModal(true);
        }

      } catch {
        // ignore storage errors, show terms modal as fallback
        setShowTermsModal(true);
      }
    })();
  }, []);


  // Handler for opening terms modal
  const openTerms = () => setShowTermsModal(true);

  // Handler for agreeing to terms
  const handleTermsAgree = async () => {
    setShowTermsModal(false);
    setAgreedToTerms(true);
    
        // Record the agreement
        await recordParentTermsAgreement(currentParentId || undefined);
  };

  // Registration handlers
  const openRegistration = () => setShowRegistrationModal(true);
  const closeRegistration = () => setShowRegistrationModal(false);
  
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
      let profilePictureUrl = '';
      
      // Upload profile picture if provided
      if (registrationData.profilePicture) {
        try {
          const response = await fetch(registrationData.profilePicture);
          const blob = await response.blob();
          const timestamp = Date.now();
          const filename = `parents/profiles/${parentKey.trim()}_${timestamp}.jpg`;
          
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
      
      // Resolve login code to actual parent ID
      const parentIdResult = await readData(`/parentLoginCodes/${parentKey.trim()}`);
      if (!parentIdResult.data) {
        Alert.alert('Error', 'Invalid parent key. Please contact your teacher.');
        setRegistrationLoading(false);
        return;
      }
      
      const actualParentId = parentIdResult.data;
      
      // Save parent data to Firebase under the correct parent ID
      const parentData = {
        firstName: registrationData.firstName,
        lastName: registrationData.lastName,
        email: registrationData.email,
        mobile: registrationData.mobile,
        profilePictureUrl: profilePictureUrl,
        parentKey: parentKey.trim(),
        createdAt: new Date().toISOString(),
        parentId: actualParentId,
        infoStatus: 'completed',
      };
      
      const { success, error: dbError } = await writeData(`/parents/${actualParentId}`, parentData);
      
      if (success) {
        // Save parent key to storage
        await AsyncStorage.setItem(STORAGE_PARENT_KEY, parentKey.trim());
        Alert.alert('Success', 'Registration completed successfully!');
        setShowRegistrationModal(false);
        router.replace('/ParentDashboard');
        
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

  const handleLogin = async () => {
    setError('');
    setLoading(true);
    
    // Simple validation
    if (!parentKey.trim()) {
      setError('Please enter a Parent Key.');
      setLoading(false);
      return;
    }

    try {
      // First, resolve the login code to get the actual parent ID
      const parentIdResult = await readData(`/parentLoginCodes/${parentKey.trim()}`);
      
      if (!parentIdResult.data) {
        setError('Invalid parent key. Please contact your teacher.');
        setLoading(false);
        return;
      }
      
      const actualParentId = parentIdResult.data;
      setCurrentParentId(actualParentId);
      
      // Check if parent profile exists
      const parentProfileResult = await readData(`/parents/${actualParentId}`);
      
      if (parentProfileResult.data && parentProfileResult.data.infoStatus === 'completed') {
        // Parent profile is complete, save key and navigate to dashboard
        await AsyncStorage.setItem(STORAGE_PARENT_KEY, parentKey.trim());
        setLoading(false);
        router.replace('/ParentDashboard');
      } else {
        // Parent profile doesn't exist or is incomplete, show registration modal
        setLoading(false);
        setShowRegistrationModal(true);
      }
    } catch (error) {
      setLoading(false);
      setError('Failed to verify parent key. Please try again.');
    }
  };

  if (!fontsLoaded) return null;

  return (
    <ImageBackground
      source={require('../assets/images/bg.jpg')}
      style={styles.background}
      resizeMode="cover"
      imageStyle={{ opacity: 1 }}
    >
      {/* Gradient overlay for depth */}
      <View style={styles.gradientOverlay} pointerEvents="none" />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.card}>
          {/* Parent icon */}
          
          <View style={styles.logoBox}>
            <Image
              source={require('../assets/images/Logo.png')}
              style={styles.logoImage}
              resizeMode="contain"
            />
          </View>
          {/* Dark overlay inside card */}
          <View style={styles.cardOverlay} pointerEvents="none" />
          <Text style={styles.title}>Parent Login</Text>
          <View style={styles.inputWrap}>
            <AntDesign name="idcard" size={22} color="#ffffff" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Enter Parent Key"
              placeholderTextColor="#ffffff"
              value={parentKey}
              onChangeText={async (v) => {
                setParentKey(v);
                try { await AsyncStorage.setItem(STORAGE_PARENT_KEY, v); } catch {}
              }}
              autoCapitalize="characters"
              autoCorrect={false}
            />
          </View>
          {error ? <Text style={{ color: '#ff5a5a', marginBottom: 8 }}>{error}</Text> : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', marginTop: 10, marginBottom: 6, paddingLeft: 20 }}>
            <TouchableOpacity
              style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: '#00aaff', alignItems: 'center', justifyContent: 'center', marginRight: 8 }}
              onPress={() => setAgreedToTerms(v => !v)}
            >
              {agreedToTerms ? (
                <View style={{ width: 14, height: 14, backgroundColor: '#00aaff', borderRadius: 3 }} />
              ) : null}
            </TouchableOpacity>
            <Text style={{ color: '#ffffff', fontSize: 13, textShadowColor: 'rgba(255, 253, 253, 0.3)', textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 2 }}>
              I agree to the  
              <Text style={{ color: '#0000ff', textDecorationLine: 'underline', textShadowColor: 'rgba(255, 247, 247, 0.3)', textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 2 }} onPress={openTerms}> Terms and Conditions</Text>
            </Text>
          </View>
          <TouchableOpacity style={styles.button} onPress={handleLogin} activeOpacity={0.85} disabled={loading || !agreedToTerms}>
            <Text style={styles.buttonText}>{loading ? 'Logging in...' : 'Login'}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
      <TermsAndConditions
        visible={showTermsModal}
        onAgree={handleTermsAgree}
        title="Terms and Conditions"
      />
      
      {/* Parent Registration Modal */}
      <Modal visible={showRegistrationModal} animationType="slide" transparent>
        <KeyboardAvoidingView 
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.registrationModal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Complete Your Profile</Text>
              <TouchableOpacity onPress={closeRegistration} style={styles.closeButton}>
                <AntDesign name="close" size={24} color="#1e293b" />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.registrationForm} showsVerticalScrollIndicator={false}>
              {/* Terms and Conditions Section */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Terms and Conditions</Text>
                <View style={styles.termsContainer}>
                  <View style={styles.termsCheckboxContainer}>
                    <TouchableOpacity
                      style={[styles.termsCheckbox, agreedToTerms && styles.termsCheckboxChecked]}
                      onPress={() => setAgreedToTerms(!agreedToTerms)}
                    >
                      {agreedToTerms && <AntDesign name="check" size={14} color="#ffffff" />}
                    </TouchableOpacity>
                    <Text style={styles.termsCheckboxText}>
                      I agree to the{' '}
                      <Text style={styles.termsLink} onPress={openTerms}>
                        Terms and Conditions
                      </Text>
                    </Text>
                  </View>
                  <Text style={styles.termsNote}>
                    You must agree to the terms and conditions to complete registration.
                  </Text>
                </View>
              </View>

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
              <TouchableOpacity style={styles.cancelButton} onPress={closeRegistration}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.createButton, (registrationLoading || !agreedToTerms) && styles.buttonDisabled]} 
                onPress={handleRegistration}
                disabled={registrationLoading || !agreedToTerms}
              >
                <Text style={styles.createButtonText}>
                  {registrationLoading ? 'Creating Profile...' : 'Complete Registration'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

    </ImageBackground>
  );
}

const LOGO_WIDTH = width * 0.55;

const styles = StyleSheet.create({
  background: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: '#0a0a0a', // Dark spatial background
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: 24,
  },
  gradientOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
    backgroundColor: 'rgba(0,20,40,0.2)',
    opacity: 0.9,
  },
  card: {
    width: '90%',
    maxWidth: 400,
    backgroundColor: 'rgba(255, 255, 255, 0.13)', // Lighter spatial background
    borderRadius: 28,
    paddingVertical: 36,
    paddingHorizontal: 24,
    alignItems: 'center',
    shadowColor: '#00aaff', // Blue spatial glow
    shadowOpacity: 0.5,
    shadowRadius: 40,
    shadowOffset: { width: 0, height: 15 },
    elevation: 25,
    marginBottom: 15,
    backdropFilter: 'blur(30px)', // Enhanced spatial blur
    position: 'relative',
    overflow: 'hidden',
    borderWidth: 0,
    borderColor: 'rgba(255,255,255,0.5)', // Lighter white border
  },
  cardOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.1)', // Lighter overlay inside card
    borderRadius: 20,
    zIndex: 1,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255, 255, 255, 0.9)', // Lighter icon background
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: -50,
    shadowColor: '#00aaff',
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    borderWidth: 1,
    borderColor: 'rgba(0, 170, 255, 0.3)', // Lighter spatial border
    zIndex: 2,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    backgroundColor: 'rgba(0,50,100,0.2)', // Lighter input background
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: 'rgba(0,170,255,0.3)', // Lighter spatial border
    marginBottom: 16,
    shadowColor: '#00aaff',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  inputIcon: {
    marginLeft: 16,
    marginRight: 8,
    color: '#ffffff', // White icon
  },
  input: {
    flex: 1,
    height: 48,
    fontSize: 17,
    color: '#ffffff', // White text for spatial theme
    paddingHorizontal: 0,
    backgroundColor: 'transparent',
  },
  button: {
    width: '100%',
    borderRadius: 30,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 10,
    elevation: 6,
    shadowColor: '#00aaff',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 15,
    backgroundColor: 'rgba(0,50,100,0.3)', // Lighter button background
    borderWidth: 1,
    borderColor: 'rgba(0,170,255,0.4)', // Lighter button border
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: 'bold',
    letterSpacing: 1,
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  logoBox: {
    alignItems: 'center',
    marginTop: -50,
    marginBottom: -50,
    zIndex: 2,
  },
  logoImage: {
    width: width * 0.6, // Responsive logo size
    height: width * 0.5,
    maxWidth: 200,
    maxHeight: 200,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#ffffff', // White text for spatial theme
    marginBottom: 24,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
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
  // Terms section styles for registration modal
  termsContainer: {
    backgroundColor: 'rgba(255,255,255,0.8)',
    borderWidth: 1,
    borderColor: 'rgba(0,170,255,0.3)',
    borderRadius: 12,
    padding: 15,
  },
  termsCheckboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  termsCheckbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: 'rgba(0,170,255,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    backgroundColor: 'transparent',
  },
  termsCheckboxChecked: {
    backgroundColor: 'rgb(40, 127, 214)',
    borderColor: 'rgb(40, 127, 214)',
  },
  termsCheckboxText: {
    fontSize: 14,
    color: '#1e293b',
    flex: 1,
  },
  termsLink: {
    color: 'rgb(40, 127, 214)',
    textDecorationLine: 'underline',
    fontWeight: '600',
  },
  termsNote: {
    fontSize: 12,
    color: '#64748b',
    fontStyle: 'italic',
  },

}); 