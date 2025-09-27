import { AntDesign } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFonts } from 'expo-font';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Dimensions, Image, ImageBackground, KeyboardAvoidingView, Modal, NativeScrollEvent, NativeSyntheticEvent, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { signInUser, signUpUser } from '../lib/firebase-auth';
import { writeData } from '../lib/firebase-database';
import { uploadFile } from '../lib/firebase-storage';

const { width } = Dimensions.get('window'); // Removed unused height variable

export default function TeacherLogin() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fontsLoaded] = useFonts({
    'LeagueSpartan-Bold': require('../assets/fonts/LeagueSpartan-Bold.ttf'),
  });

  const TERMS_KEY = 'teacherAgreedToTerms';
  const TERMS_TEXT = `MATH TATAG - TERMS AND CONDITIONS\n\n1. Data Privacy: We comply with the Philippine Data Privacy Act (RA 10173). Your personal information is collected, processed, and stored solely for educational purposes. We do not sell or share your data with third parties except as required by law.\n\n2. Consent: By using this app, you consent to the collection and use of your data for learning analytics, progress tracking, and communication with your school.\n\n3. User Responsibilities: You agree to use this app for lawful, educational purposes only. Do not share your login credentials.\n\n4. Intellectual Property: All content, including lessons and activities, is owned by the app developers and licensors.\n\n5. Limitation of Liability: The app is provided as-is. We are not liable for any damages arising from its use.\n\n6. Updates: We may update these terms. Continued use means you accept the new terms.\n\n7. Contact: For privacy concerns, contact your school or the app administrator.\n\nBy agreeing, you acknowledge you have read and understood these terms in accordance with Philippine law.`;

  const [showTermsModal, setShowTermsModal] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [canCheckAgreement, setCanCheckAgreement] = useState(false);
  const [hasScrolledToEnd, setHasScrolledToEnd] = useState(false);
  
  // Remember me keys
  const STORAGE_EMAIL_KEY = 'teacher_email';
  const STORAGE_PASSWORD_KEY = 'teacher_password';
  
  // Sign Up Modal States
  const [showSignUpModal, setShowSignUpModal] = useState(false);
  const [signUpData, setSignUpData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    school: '',
    schoolOther: '',
    gender: '',
    agreedToEULA: false,
    profilePicture: null as string | null
  });
  const [signUpLoading, setSignUpLoading] = useState(false);

  useEffect(() => {
    // Show terms modal on mount
    setShowTermsModal(true);
    // Load saved credentials
    (async () => {
      try {
        const [savedEmail, savedPassword] = await Promise.all([
          AsyncStorage.getItem(STORAGE_EMAIL_KEY),
          AsyncStorage.getItem(STORAGE_PASSWORD_KEY),
        ]);
        if (savedEmail) setEmail(savedEmail);
        if (savedPassword) setPassword(savedPassword);
      } catch {
        // ignore storage errors
      }
    })();
  }, []);


  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please enter both email and password.');
      return;
    }

    setLoading(true);
    
    try {
      const { user, error } = await signInUser(email, password);
      
      if (error) {
        Alert.alert('Login Error', error);
        setLoading(false);
        return;
      }
      
      if (user) {
        router.replace('/TeacherDashboard');
      }
    } catch (error) {
      Alert.alert('Error', 'An unexpected error occurred during login.');
    } finally {
      setLoading(false);
    }
  };

  // Handler for opening terms modal
  const openTerms = () => setShowTermsModal(true);

  // Handler for agreeing
  const handleAgree = () => {
    setShowTermsModal(false);
    setAgreedToTerms(true);
    setCanCheckAgreement(true);
  };

  // Sign Up Handlers
  const openSignUp = () => setShowSignUpModal(true);
  const closeSignUp = () => setShowSignUpModal(false);
  
  const handleSignUpInputChange = (field: string, value: string) => {
    setSignUpData(prev => ({ ...prev, [field]: value }));
    // Auto-save to AsyncStorage for persistence
    const updatedData = { ...signUpData, [field]: value };
    // You can implement AsyncStorage here if needed for persistence
  };

  const pickImage = async () => {
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

      if (!result.canceled && result.assets[0]) {
        setSignUpData(prev => ({ ...prev, profilePicture: result.assets[0].uri }));
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to pick image');
      console.error('Image picker error:', error);
    }
  };

  const takePhoto = async () => {
    try {
      // Request camera permissions
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
        setSignUpData(prev => ({ ...prev, profilePicture: result.assets[0].uri }));
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to take photo');
      console.error('Camera error:', error);
    }
  };

  const handleSignUp = async () => {
    setSignUpLoading(true);
    
    // Simple validation
    if (!signUpData.firstName || !signUpData.lastName || !signUpData.email || !signUpData.phone || !signUpData.password || !signUpData.gender) {
      Alert.alert('Error', 'Please fill in all required fields.');
      setSignUpLoading(false);
      return;
    }
    
    if (!signUpData.school && !signUpData.schoolOther) {
      Alert.alert('Error', 'Please select a school or enter other school name.');
      setSignUpLoading(false);
      return;
    }
    
    if (signUpData.password !== signUpData.confirmPassword) {
      Alert.alert('Error', 'Passwords do not match.');
      setSignUpLoading(false);
      return;
    }
    
    if (!signUpData.agreedToEULA) {
      Alert.alert('Error', 'Please agree to the Terms and Conditions.');
      setSignUpLoading(false);
      return;
    }
    
    try {
      // Create Firebase Auth account
      const { user, error } = await signUpUser(
        signUpData.email, 
        signUpData.password, 
        `${signUpData.firstName} ${signUpData.lastName}`
      );
      
      if (error) {
        Alert.alert('Registration Error', error);
        setSignUpLoading(false);
        return;
      }
      
      if (user) {
        let profilePictureUrl = '';
        
        // Upload profile picture to Firebase Storage if provided
        if (signUpData.profilePicture) {
          try {
            const response = await fetch(signUpData.profilePicture);
            const blob = await response.blob();
            const timestamp = Date.now();
            const filename = `teachers/profiles/${user.uid}_${timestamp}.jpg`;
            
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
        
        // Save teacher data to Firebase Realtime Database
        const teacherData = {
          firstName: signUpData.firstName,
          lastName: signUpData.lastName,
          email: signUpData.email,
          phone: signUpData.phone,
          school: signUpData.school === 'Others' ? signUpData.schoolOther : signUpData.school,
          gender: signUpData.gender,
          profilePictureUrl: profilePictureUrl || '',
          uid: user.uid,
          createdAt: new Date().toISOString(),
        };
        
        const { success, error: dbError } = await writeData(`/teachers/${user.uid}`, teacherData);
        
        if (success) {
          Alert.alert('Success', 'Account created successfully! You can now login.');
          setShowSignUpModal(false);
          // Reset form
          setSignUpData({
            firstName: '',
            lastName: '',
            email: '',
            phone: '',
            password: '',
            confirmPassword: '',
            school: '',
            schoolOther: '',
            gender: '',
            agreedToEULA: false,
            profilePicture: null
          });
        } else {
          Alert.alert('Error', `Failed to save teacher data: ${dbError}`);
        }
      }
    } catch (error) {
      Alert.alert('Error', 'An unexpected error occurred during registration.');
    } finally {
      setSignUpLoading(false);
    }
  };

  // Handler for scroll to end
  const handleTermsScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
    if (layoutMeasurement.height + contentOffset.y >= contentSize.height - 20) {
      setHasScrolledToEnd(true);
    }
  };

  if (!fontsLoaded) return null;

  return (
    <ImageBackground
      source={require('../assets/images/bg2.jpg')}
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
          {/* Teacher icon */}
          <View style={styles.logoBox}>
            <Image
              source={require('../assets/images/Logo.png')}
              style={styles.logoImage}
              resizeMode="contain"
            />
          </View>
          {/* Dark overlay inside card */}
          <View style={styles.cardOverlay} pointerEvents="none" />
          <Text style={styles.title}>Login as Teacher</Text>
          <View style={styles.inputWrap}>
            <AntDesign name="mail" size={22} color="#ffffff" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor="#ffffff"
              value={email}
              onChangeText={async (v) => {
                setEmail(v);
                try { await AsyncStorage.setItem(STORAGE_EMAIL_KEY, v); } catch {}
              }}
              autoCapitalize="none"
              keyboardType="email-address"
            />
          </View>
          <View style={styles.inputWrap}>
            <AntDesign name="lock" size={22} color="#ffffff" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor="#ffffff"
              value={password}
              onChangeText={async (v) => {
                setPassword(v);
                try { await AsyncStorage.setItem(STORAGE_PASSWORD_KEY, v); } catch {}
              }}
              secureTextEntry={!showPassword}
            />
            <TouchableOpacity
              style={styles.eyeIcon}
              onPress={() => setShowPassword(!showPassword)}
            >
              <AntDesign
                name={showPassword ? 'eye' : 'eye-invisible'}
                size={20}
                color="#ffffff"
              />
            </TouchableOpacity>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10, marginBottom: 6 }}>
            <TouchableOpacity
              style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: '#00aaff', alignItems: 'center', justifyContent: 'center', marginRight: 8 }}
              disabled={!canCheckAgreement}
              onPress={() => canCheckAgreement && setAgreedToTerms(v => !v)}
            >
              {agreedToTerms ? (
                <View style={{ width: 14, height: 14, backgroundColor: '#00aaff', borderRadius: 3 }} />
              ) : null}
            </TouchableOpacity>
            <Text style={{ color: '#ffffff', fontSize: 15, textShadowColor: 'rgba(0,0,0,0.3)', textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 2 }}>
              I agree to the 
              <Text style={{ color: '#00aaff', textDecorationLine: 'underline', textShadowColor: 'rgba(255, 247, 247, 0.3)', textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 2 }} onPress={openTerms}> Terms and Conditions</Text>
            </Text>
          </View>
          <TouchableOpacity 
            style={[styles.button, loading && styles.buttonDisabled]} 
            onPress={handleLogin} 
            activeOpacity={0.85}
            disabled={loading || !agreedToTerms}
          >
            <Text style={styles.buttonText}>
              {loading ? 'Logging in...' : 'Login'}
            </Text>
          </TouchableOpacity>
          
          {/* Sign Up Link */}
          <View style={styles.signUpContainer}>
            <Text style={styles.signUpText}>
              Don't have an account yet? 
              <Text style={styles.signUpLink} onPress={openSignUp}>
                {' '}Sign Up
              </Text>
            </Text>
          </View>
        </View>
      </KeyboardAvoidingView>
      <Modal visible={showTermsModal} animationType="slide" transparent>
        <View style={{ flex: 1, backgroundColor: 'srgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ width: '90%', maxWidth: 420, backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: 18, padding: 0, overflow: 'hidden', maxHeight: '85%', borderWidth: 2, borderColor: 'rgba(35, 177, 248, 0.4)', shadowColor: '#00aaff', shadowOpacity: 0.5, shadowRadius: 15, shadowOffset: { width: 0, height: 8 }, elevation: 15 }}>
            <Text style={{ fontWeight: 'bold', fontSize: 20, color: 'rgb(40, 127, 214)', textAlign: 'center', marginTop: 18, marginBottom: 8 }}>Terms and Conditions</Text>
            <ScrollView style={{ paddingHorizontal: 18, paddingBottom: 18, maxHeight: 380 }} onScroll={handleTermsScroll} scrollEventThrottle={16} showsVerticalScrollIndicator={true}>
              <Text style={{ fontSize: 15, color: '#1e293b', lineHeight: 22 }}>{TERMS_TEXT}</Text>
            </ScrollView>
            <TouchableOpacity
              style={{ backgroundColor: hasScrolledToEnd ? 'rgb(40, 127, 214)' : 'rgba(236, 236, 236, 1)', borderRadius: 16, margin: 18, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: hasScrolledToEnd ? 'rgba(0,170,255,0.3)' : 'rgba(150,150,150,0.2)' }}
              disabled={!hasScrolledToEnd}
              onPress={handleAgree}
            >
              <Text style={{ color: '#ffffff', fontWeight: 'bold', fontSize: 16 }}>Agree</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      
      {/* Sign Up Modal */}
      <Modal visible={showSignUpModal} animationType="slide" transparent>
        <KeyboardAvoidingView 
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.signUpModal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Create Teacher Account</Text>
              <TouchableOpacity onPress={closeSignUp} style={styles.closeButton}>
                <AntDesign name="close" size={24} color="#1e293b" />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.signUpForm} showsVerticalScrollIndicator={false}>
              {/* Personal Information */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Personal Information</Text>
                
                <View style={styles.inputRow}>
                  <View style={styles.halfInput}>
                    <TextInput
                      style={styles.signUpInput}
                      placeholder="First Name *"
                      placeholderTextColor="#1e293b"
                      value={signUpData.firstName}
                      onChangeText={(value) => handleSignUpInputChange('firstName', value)}
                    />
                  </View>
                  <View style={styles.halfInput}>
                    <TextInput
                      style={styles.signUpInput}
                      placeholder="Last Name *"
                      placeholderTextColor="#1e293b"
                      value={signUpData.lastName}
                      onChangeText={(value) => handleSignUpInputChange('lastName', value)}
                    />
                  </View>
                </View>
                
                <TextInput
                  style={styles.signUpInput}
                  placeholder="Email Address *"
                  placeholderTextColor="#1e293b"
                  value={signUpData.email}
                  onChangeText={(value) => handleSignUpInputChange('email', value)}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
                
                <TextInput
                  style={styles.signUpInput}
                  placeholder="Phone Number *"
                  placeholderTextColor="#1e293b"
                  value={signUpData.phone}
                  onChangeText={(value) => handleSignUpInputChange('phone', value)}
                  keyboardType="phone-pad"
                />
                
                {/* Gender Selection */}
                <View style={styles.genderContainer}>
                  <Text style={styles.genderLabel}>Gender *</Text>
                  <View style={styles.genderOptions}>
                    <TouchableOpacity 
                      style={[styles.genderOption, signUpData.gender === 'Male' && styles.genderOptionSelected]}
                      onPress={() => handleSignUpInputChange('gender', 'Male')}
                    >
                      <Text style={[styles.genderOptionText, signUpData.gender === 'Male' && styles.genderOptionTextSelected]}>
                        Male
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                      style={[styles.genderOption, signUpData.gender === 'Female' && styles.genderOptionSelected]}
                      onPress={() => handleSignUpInputChange('gender', 'Female')}
                    >
                      <Text style={[styles.genderOptionText, signUpData.gender === 'Female' && styles.genderOptionTextSelected]}>
                        Female
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
                
                {/* Profile Picture Section */}
                <View style={styles.photoSection}>
                  <Text style={styles.photoLabel}>Profile Picture (Optional)</Text>
                  <View style={styles.photoContainer}>
                    {signUpData.profilePicture ? (
                      <View style={styles.photoPreview}>
                        <Image source={{ uri: signUpData.profilePicture }} style={styles.photoPreviewImage} />
                        <TouchableOpacity 
                          style={styles.removePhotoButton}
                          onPress={() => setSignUpData(prev => ({ ...prev, profilePicture: null }))}
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
              
              {/* Professional Information */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Professional Information</Text>
                
                <View style={styles.dropdownContainer}>
                  <Text style={styles.dropdownLabel}>School/Institution *</Text>
                  <View style={styles.dropdown}>
                    <TouchableOpacity 
                      style={[styles.dropdownOption, signUpData.school === 'Camohaguin Elementary School' && styles.dropdownOptionSelected]}
                      onPress={() => handleSignUpInputChange('school', 'Camohaguin Elementary School')}
                    >
                      <Text style={[styles.dropdownOptionText, signUpData.school === 'Camohaguin Elementary School' && styles.dropdownOptionTextSelected]}>
                        Camohaguin Elementary School
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                      style={[styles.dropdownOption, signUpData.school === 'Others' && styles.dropdownOptionSelected]}
                      onPress={() => handleSignUpInputChange('school', 'Others')}
                    >
                      <Text style={[styles.dropdownOptionText, signUpData.school === 'Others' && styles.dropdownOptionTextSelected]}>
                        Others
                      </Text>
                    </TouchableOpacity>
                  </View>
                  
                  {signUpData.school === 'Others' && (
                    <TextInput
                      style={styles.signUpInput}
                      placeholder="Enter school name *"
                      placeholderTextColor="#1e293b"
                      value={signUpData.schoolOther}
                      onChangeText={(value) => handleSignUpInputChange('schoolOther', value)}
                    />
                  )}
                </View>
              </View>
              
              {/* Security */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Security</Text>
                
                <TextInput
                  style={styles.signUpInput}
                  placeholder="Password *"
                  placeholderTextColor="#1e293b"
                  value={signUpData.password}
                  onChangeText={(value) => handleSignUpInputChange('password', value)}
                  secureTextEntry
                />
                
                <TextInput
                  style={styles.signUpInput}
                  placeholder="Confirm Password *"
                  placeholderTextColor="#1e293b"
                  value={signUpData.confirmPassword}
                  onChangeText={(value) => handleSignUpInputChange('confirmPassword', value)}
                  secureTextEntry
                />
              </View>
              
              {/* EULA Agreement */}
              <View style={styles.eulaContainer}>
                <TouchableOpacity
                  style={styles.eulaCheckbox}
                  onPress={() => handleSignUpInputChange('agreedToEULA', String(!signUpData.agreedToEULA))}
                >
                  <View style={[styles.eulaCheckboxView, signUpData.agreedToEULA && styles.eulaCheckboxChecked]}>
                    {signUpData.agreedToEULA && (
                      <AntDesign name="check" size={16} color="#fff" />
                    )}
                  </View>
                  <Text style={styles.eulaText}>
                    I agree to the{' '}
                    <Text style={styles.eulaLink} onPress={openTerms}>
                      Terms and Conditions
                    </Text>
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
            
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelButton} onPress={closeSignUp}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.createButton, signUpLoading && styles.buttonDisabled]} 
                onPress={handleSignUp}
                disabled={signUpLoading}
              >
                <Text style={styles.createButtonText}>
                  {signUpLoading ? 'Creating Account...' : 'Create Account'}
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
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    opacity: 0.3,
  },
  card: {
    width: '90%',
    maxWidth: 400,
    backgroundColor: 'rgba(255, 255, 255, 0.13)', // Even lighter spatial background
    borderRadius: 28,
    paddingVertical: 36,
    paddingHorizontal: 24,
    alignItems: 'center',
    shadowColor: '#00aaff', // Blue spatial glow
    shadowOpacity: 0.8,
    shadowRadius: 40,
    shadowOffset: { width: 0, height: 15 },
    elevation: 25,
    marginBottom: 15,
    backdropFilter: 'blur(12px)', // Enhanced spatial blur
    position: 'relative',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)', // Even lighter white border
  },
  cardOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.05)', // Even lighter overlay inside card
    borderRadius: 28,
    zIndex: 1,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255, 255, 255, 0.95)', // Even lighter icon background
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: -50,
    shadowColor: '#00aaff',
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    borderWidth: 1,
    borderColor: 'rgba(0, 170, 255, 0.2)', // Even lighter spatial border
    zIndex: 2,
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
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    backgroundColor: 'rgba(0,50,100,0.1)', // Even lighter input background
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: 'rgba(0,170,255,0.2)', // Even lighter spatial border
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
  eyeIcon: {
    padding: 12,
    marginRight: 8,
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
    backgroundColor: 'rgba(0,50,100,0.2)', // Even lighter button background
    borderWidth: 1,
    borderColor: 'rgba(0,170,255,0.3)', // Even lighter button border
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
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
  signUpContainer: {
    marginTop: 16,
    alignItems: 'center',
  },
  signUpText: {
    color: '#ffffff',
    fontSize: 15,
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  signUpLink: {
    color: '#00aaff',
    fontWeight: 'bold',
    textDecorationLine: 'underline',
    textShadowColor: 'rgba(255, 247, 247, 0.3)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  // Sign Up Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  signUpModal: {
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
  signUpForm: {
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
  signUpInput: {
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
  // Dropdown Styles
  dropdownContainer: {
    marginBottom: 10,
  },
  dropdownLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 8,
  },
  dropdown: {
    backgroundColor: 'rgba(255,255,255,0.8)',
    borderWidth: 1,
    borderColor: 'rgba(0,170,255,0.3)',
    borderRadius: 12,
    marginBottom: 10,
  },
  dropdownOption: {
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,170,255,0.1)',
  },
  dropdownOptionSelected: {
    backgroundColor: 'rgba(0,170,255,0.1)',
  },
  dropdownOptionText: {
    fontSize: 16,
    color: '#1e293b',
  },
  dropdownOptionTextSelected: {
    color: 'rgb(40, 127, 214)',
    fontWeight: '600',
  },
  // EULA Styles
  eulaContainer: {
    marginTop: 20,
    marginBottom: 10,
  },
  eulaCheckbox: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  eulaCheckboxView: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#00aaff',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  eulaCheckboxChecked: {
    backgroundColor: '#00aaff',
  },
  eulaText: {
    fontSize: 14,
    color: '#1e293b',
    marginLeft: 8,
    flex: 1,
  },
  eulaLink: {
    color: 'rgb(40, 127, 214)',
    textDecorationLine: 'underline',
    fontWeight: '600',
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
  // Gender Selection Styles
  genderContainer: {
    marginBottom: 10,
  },
  genderLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 8,
  },
  genderOptions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  genderOption: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.8)',
    borderWidth: 1,
    borderColor: 'rgba(0,170,255,0.3)',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 15,
    marginHorizontal: 5,
    alignItems: 'center',
  },
  genderOptionSelected: {
    backgroundColor: 'rgba(0,170,255,0.1)',
    borderColor: 'rgb(40, 127, 214)',
  },
  genderOptionText: {
    fontSize: 16,
    color: '#1e293b',
    fontWeight: '500',
  },
  genderOptionTextSelected: {
    color: 'rgb(40, 127, 214)',
    fontWeight: '600',
  },
}); 