import { AntDesign, MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFonts } from 'expo-font';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, BackHandler, Dimensions, Image, ImageBackground, KeyboardAvoidingView, Linking, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import TermsAndConditions from '../components/TermsAndConditions';
import { resendVerificationEmail, resetPassword, signInUser, signUpUser } from '../lib/firebase-auth';
import { readData, writeData } from '../lib/firebase-database';
import { uploadFile } from '../lib/firebase-storage';
import { hasTeacherAgreedToTerms, recordTeacherTermsAgreement } from '../lib/terms-utils';

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

  const [showTermsModal, setShowTermsModal] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  
  // Verification and blocking modal states
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [showBlockedModal, setShowBlockedModal] = useState(false);
  const [unverifiedUser, setUnverifiedUser] = useState<any>(null);
  
  // Forgot password modal states
  const [showForgotPasswordModal, setShowForgotPasswordModal] = useState(false);
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState('');
  const [forgotPasswordLoading, setForgotPasswordLoading] = useState(false);
  
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

  // Version checking state
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<{
    message: string;
    version: string;
    downloadUrl: string;
  } | null>(null);
  const [maintenanceMode, setMaintenanceMode] = useState(false);

  useEffect(() => {
    // Load saved credentials and check terms agreement
    (async () => {
      try {
        const [savedEmail, savedPassword] = await Promise.all([
          AsyncStorage.getItem(STORAGE_EMAIL_KEY),
          AsyncStorage.getItem(STORAGE_PASSWORD_KEY),
        ]);
        if (savedEmail) setEmail(savedEmail);
        if (savedPassword) setPassword(savedPassword);

        // Check if teacher has already agreed to terms
        const hasAgreed = await hasTeacherAgreedToTerms();
        if (hasAgreed) {
          setAgreedToTerms(true);
        } else {
          // Show terms modal only if they haven't agreed yet
          setShowTermsModal(true);
        }

        // Check maintenance status and version
        await checkMaintenanceAndVersion();
      } catch {
        // ignore storage errors, show terms modal as fallback
        setShowTermsModal(true);
      }
    })();
  }, []);

  const checkMaintenanceAndVersion = async () => {
    try {
      const [maintenanceResult, updateResult] = await Promise.all([
        readData('/maintenanceStatus'),
        readData('/updateNotification')
      ]);
      
      // Check maintenance mode first - this blocks all access
      if (maintenanceResult.data && maintenanceResult.data.isEnabled) {
        setMaintenanceMode(true);
        setUpdateInfo({ 
          message: maintenanceResult.data.message, 
          version: '', 
          downloadUrl: '' 
        });
        setShowUpdateModal(true);
        return;
      }

      // Check if app version is outdated - this forces update
      const currentVersion = '1.0.0'; // This should be the current app version
      if (updateResult.data && updateResult.data.isEnabled) {
        const { message, version, downloadUrl } = updateResult.data;
        if (version && version !== currentVersion) {
          setMaintenanceMode(false); // Ensure maintenance mode is false
          setUpdateInfo({ message, version, downloadUrl });
          setShowUpdateModal(true);
        }
      }
    } catch (error) {
      console.error('Failed to check maintenance and version status:', error);
    }
  };


  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please enter both email and password.');
      return;
    }

    setLoading(true);
    
    try {
      const { user, error, emailNotVerified, unverifiedUser: unverified } = await signInUser(email, password);
      
      if (error) {
        if (emailNotVerified && unverified) {
          setUnverifiedUser(unverified);
          setShowVerificationModal(true);
        } else {
          Alert.alert('Login Error', error);
        }
        setLoading(false);
        return;
      }
      
      if (user) {
        // Check teacher verification and blocking status
        const { data: teacherData, error: teacherError } = await readData(`/teachers/${user.uid}`);
        
        if (teacherError) {
          console.error('Error fetching teacher data:', teacherError);
          Alert.alert('Error', 'Failed to verify account status. Please try again.');
          setLoading(false);
          return;
        }
        
        if (teacherData) {
          // Check if account is blocked
          if (teacherData.isBlocked) {
            setShowBlockedModal(true);
            setLoading(false);
            return;
          }
          
          // Check if email is verified
          if (!user.emailVerified || !teacherData.emailVerified) {
            setUnverifiedUser(user);
            setShowVerificationModal(true);
            setLoading(false);
            return;
          }
          
          // Check if account is verified by admin
          if (!teacherData.isVerified) {
            setShowVerificationModal(true);
            setLoading(false);
            return;
          }
          
          // Account is verified and not blocked, proceed to dashboard
          setCurrentUserId(user.uid);
          router.replace('/TeacherDashboard');
        } else {
          Alert.alert('Error', 'Teacher account not found. Please contact support.');
          setLoading(false);
        }
      }
    } catch (error) {
      Alert.alert('Error', 'An unexpected error occurred during login.');
    } finally {
      setLoading(false);
    }
  };

  // Handler for opening terms modal
  const openTerms = () => setShowTermsModal(true);

  // Handler for agreeing to terms
  const handleTermsAgree = async () => {
    setShowTermsModal(false);
    setAgreedToTerms(true);
    
    // Record the agreement
    await recordTeacherTermsAgreement(currentUserId || undefined);
  };

  // Handler for resending verification email
  const handleResendVerification = async () => {
    if (!unverifiedUser) return;
    
    try {
      const { error, alreadyVerified } = await resendVerificationEmail(unverifiedUser);
      
      if (error) {
        Alert.alert('Error', error);
        return;
      }
      
      if (alreadyVerified) {
        // Update database to mark email as verified
        const { success, error: dbError } = await writeData(`/teachers/${unverifiedUser.uid}/emailVerified`, true);
        
        if (success) {
          Alert.alert('Success', 'Your email is already verified! You can now log in.');
          setShowVerificationModal(false);
        } else {
          Alert.alert('Error', 'Email verified but failed to update database. Please try logging in again.');
        }
        return;
      }
      
      Alert.alert(
        'Verification Email Sent', 
        'A new verification email has been sent to your inbox. Please check your email and spam folder. The link will expire in 1 hour.',
        [
          {
            text: 'OK',
            onPress: () => setShowVerificationModal(false)
          }
        ]
      );
    } catch (error) {
      Alert.alert('Error', 'Failed to send verification email. Please try again.');
    }
  };

  // Handler for forgot password
  const handleForgotPassword = async () => {
    if (!forgotPasswordEmail) {
      Alert.alert('Error', 'Please enter your email address.');
      return;
    }

    setForgotPasswordLoading(true);
    
    try {
      const { error } = await resetPassword(forgotPasswordEmail);
      
      if (error) {
        Alert.alert('Error', error);
      } else {
      Alert.alert(
        'Password Reset Email Sent', 
        'A password reset link has been sent to your email. Please check your inbox and spam folder. The link will expire in 1 hour.',
        [
          {
            text: 'OK',
            onPress: () => {
              setShowForgotPasswordModal(false);
              setForgotPasswordEmail('');
            }
          }
        ]
      );
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to send password reset email. Please try again.');
    } finally {
      setForgotPasswordLoading(false);
    }
  };

  // (removed) handler for opening email app

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
        
        // Save teacher data to Firebase Realtime Database with pending verification status
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
          isVerified: false, // Will be set to true after email verification
          isBlocked: false,
          emailVerified: false, // Track email verification status
          pendingVerification: true, // Account is pending email verification
        };
        
        const { success, error: dbError } = await writeData(`/teachers/${user.uid}`, teacherData);
        
        if (success) {
          Alert.alert(
            'Account Created Successfully!', 
            'Your teacher account has been created. A verification email has been sent to your email address. Please check your inbox and spam folder, then click the verification link to activate your account. You will not be able to log in until your email is verified.',
            [
              {
                text: 'OK',
                onPress: () => {
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
                }
              }
            ]
          );
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

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', marginTop: 10, marginBottom: 6, paddingLeft: 20 }}>
            <TouchableOpacity
              style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: '#00aaff', alignItems: 'center', justifyContent: 'center', marginRight: 8 }}
              onPress={() => setAgreedToTerms(v => !v)}
            >
              {agreedToTerms ? (
                <View style={{ width: 14, height: 14, backgroundColor: '#00aaff', borderRadius: 3 }} />
              ) : null}
            </TouchableOpacity>
            <Text style={{ color: '#ffffff', fontSize: 13, textShadowColor: 'rgba(0,0,0,0.3)', textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 2 }}>
              I agree to the 
              <Text style={{ color: '#0000ff', textDecorationLine: 'underline', textShadowColor: 'rgba(255, 247, 247, 0.3)', textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 2 }} onPress={openTerms}> Terms and Conditions</Text>
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
          
          {/* Forgot Password Link */}
          <TouchableOpacity 
            style={styles.forgotPasswordContainer}
            onPress={() => setShowForgotPasswordModal(true)}
          >
            <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
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
      <TermsAndConditions
        visible={showTermsModal}
        onAgree={handleTermsAgree}
        title="Terms and Conditions"
      />

      {/* Email Verification Modal */}
      <Modal visible={showVerificationModal} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.statusModalContent}>
            <View style={styles.statusIconContainer}>
              <AntDesign name="mail" size={48} color="#f59e0b" />
            </View>
            <Text style={styles.statusModalTitle}>Email Verification Required</Text>
            <Text style={styles.statusModalMessage}>
              Your email address needs to be verified before you can access your account. Please check your inbox and spam folder for the verification email we sent you. Click the verification link in the email to activate your account.
            </Text>
            <View style={styles.verificationModalButtons}>
              <TouchableOpacity 
                style={[styles.statusModalButton, styles.resendButton]}
                onPress={handleResendVerification}
              >
                <Text style={styles.statusModalButtonText}>Resend Email</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.statusModalButton, styles.verificationCancelButton]}
                onPress={() => setShowVerificationModal(false)}
              >
                <Text style={styles.statusModalButtonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Account Blocked Modal */}
      <Modal visible={showBlockedModal} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.statusModalContent}>
            <View style={styles.statusIconContainer}>
              <AntDesign name="stop" size={48} color="#ef4444" />
            </View>
            <Text style={styles.statusModalTitle}>Account Blocked</Text>
            <Text style={styles.statusModalMessage}>
              Your account has been blocked by an administrator. Please contact the admin to resolve this issue.
            </Text>
            <TouchableOpacity 
              style={styles.statusModalButton}
              onPress={() => setShowBlockedModal(false)}
            >
              <Text style={styles.statusModalButtonText}>OK</Text>
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
                  onPress={() => setSignUpData(prev => ({ ...prev, agreedToEULA: !prev.agreedToEULA }))}
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
                style={[styles.createButton, (signUpLoading || !signUpData.agreedToEULA) && styles.buttonDisabled]} 
                onPress={handleSignUp}
                disabled={signUpLoading || !signUpData.agreedToEULA}
              >
                <Text style={styles.createButtonText}>
                  {signUpLoading ? 'Creating Account...' : 'Create Account'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      
      {/* Forgot Password Modal */}
      <Modal visible={showForgotPasswordModal} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.forgotPasswordModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Reset Password</Text>
              <TouchableOpacity 
                onPress={() => setShowForgotPasswordModal(false)} 
                style={styles.closeButton}
              >
                <AntDesign name="close" size={24} color="#1e293b" />
              </TouchableOpacity>
            </View>
            
            <Text style={styles.forgotPasswordMessage}>
              Enter your email address and we'll send you a link to reset your password.
            </Text>
            
            <TextInput
              style={styles.forgotPasswordInput}
              placeholder="Email Address"
              placeholderTextColor="#64748b"
              value={forgotPasswordEmail}
              onChangeText={setForgotPasswordEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            
            <View style={styles.forgotPasswordButtons}>
              <TouchableOpacity 
                style={[styles.forgotPasswordButton, styles.cancelForgotButton]}
                onPress={() => setShowForgotPasswordModal(false)}
              >
                <Text style={styles.cancelForgotButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.forgotPasswordButton, styles.sendForgotButton, forgotPasswordLoading && styles.buttonDisabled]}
                onPress={handleForgotPassword}
                disabled={forgotPasswordLoading}
              >
                <Text style={styles.sendForgotButtonText}>
                  {forgotPasswordLoading ? 'Sending...' : 'Send Reset Link'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Update Notification Modal */}
      <Modal 
        visible={showUpdateModal} 
        animationType="fade" 
        transparent
        onRequestClose={() => {
          // Only allow closing if not in maintenance mode
          if (!maintenanceMode) {
            setShowUpdateModal(false);
          }
        }}
      >
        <View style={styles.updateModalOverlay}>
          <View style={styles.updateModalContent}>
            <View style={styles.updateModalHeader}>
              <MaterialIcons 
                name={maintenanceMode ? "build" : "system-update"} 
                size={32} 
                color={maintenanceMode ? "#ef4444" : "#0ea5e9"} 
              />
              <Text style={styles.updateModalTitle}>
                {maintenanceMode ? "Maintenance Mode" : "Update Available"}
              </Text>
            </View>
            
            <Text style={styles.updateModalMessage}>
              {maintenanceMode 
                ? "The app is currently under maintenance. Please try again later."
                : "A new version of the app is available and required. Please update to continue using the app."
              }
            </Text>
            
            {!maintenanceMode && updateInfo?.version && (
              <View style={styles.versionInfo}>
                <Text style={styles.versionLabel}>Latest Version:</Text>
                <Text style={styles.versionText}>{updateInfo.version}</Text>
              </View>
            )}

            <View style={styles.updateModalButtons}>
              {maintenanceMode ? (
                // Maintenance mode - only close button, no access allowed
                <TouchableOpacity
                  style={[styles.updateModalButton, styles.maintenanceCloseButton]}
                  onPress={() => {
                    // Show alert and try to exit
                    Alert.alert(
                      'App Maintenance',
                      'The app is under maintenance. The app will now close.',
                      [
                        {
                          text: 'OK',
                          onPress: () => {
                            // Force close the app
                            if (Platform.OS === 'android') {
                              BackHandler.exitApp();
                            } else {
                              // For iOS, we can't programmatically close, but we can show instructions
                              Alert.alert(
                                'Close App Manually',
                                'Please close this app manually by swiping up from the bottom and swiping the app away.',
                                [{ text: 'OK' }],
                                { cancelable: false }
                              );
                            }
                          },
                          style: 'destructive'
                        }
                      ],
                      { cancelable: false }
                    );
                  }}
                >
                  <Text style={styles.updateModalButtonText}>OK</Text>
                </TouchableOpacity>
              ) : (
                // Update mode - force update, no continue option
                <>
                  {updateInfo?.downloadUrl && (
                    <TouchableOpacity
                      style={[styles.updateModalButton, styles.forceUpdateButton]}
                      onPress={() => {
                        Linking.openURL(updateInfo.downloadUrl);
                      }}
                    >
                      <MaterialIcons name="download" size={20} color="#ffffff" />
                      <Text style={styles.updateModalButtonText}>Update Now</Text>
                    </TouchableOpacity>
                  )}
                  
                  <TouchableOpacity
                    style={[styles.updateModalButton, styles.updateCloseButton]}
                    onPress={() => setShowUpdateModal(false)}
                  >
                    <Text style={styles.updateModalButtonText}>Close App</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        </View>
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
    backgroundColor: 'rgba(0,50,100,0.3)', // Lighter button background
    borderWidth: 1,
    borderColor: 'rgba(0,170,255,0.4)', // Lighter button border
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
    alignItems: 'flex-start',
    paddingLeft: 20,
  },
  signUpText: {
    color: '#ffffff',
    fontSize: 13,
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  signUpLink: {
    color: '#0000ff',
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
  // Status Modal Styles
  statusModalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 32,
    marginHorizontal: 32,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 16,
  },
  statusIconContainer: {
    marginBottom: 20,
  },
  statusModalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 16,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  statusModalMessage: {
    fontSize: 16,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
  },
  statusModalButton: {
    backgroundColor: '#0ea5e9',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
    shadowColor: '#0ea5e9',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  statusModalButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  // Forgot Password Styles
  forgotPasswordContainer: {
    marginTop: 12,
    alignItems: 'center',
  },
  forgotPasswordText: {
    color: '#00aaff',
    fontSize: 14,
    textDecorationLine: 'underline',
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  forgotPasswordModalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 24,
    marginHorizontal: 32,
    width: '90%',
    maxWidth: 400,
  },
  forgotPasswordMessage: {
    fontSize: 16,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 20,
  },
  forgotPasswordInput: {
    backgroundColor: 'rgba(255,255,255,0.8)',
    borderWidth: 1,
    borderColor: 'rgba(0,170,255,0.3)',
    borderRadius: 12,
    paddingHorizontal: 15,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1e293b',
    marginBottom: 20,
  },
  forgotPasswordButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  forgotPasswordButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    marginHorizontal: 5,
  },
  cancelForgotButton: {
    backgroundColor: 'rgba(236, 236, 236, 1)',
    borderWidth: 1,
    borderColor: 'rgba(150,150,150,0.3)',
  },
  sendForgotButton: {
    backgroundColor: '#0ea5e9',
    borderWidth: 1,
    borderColor: 'rgba(0,170,255,0.3)',
  },
  cancelForgotButtonText: {
    color: '#1e293b',
    fontSize: 16,
    fontWeight: '600',
  },
  sendForgotButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  // Verification Modal Button Styles
  verificationModalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    flexWrap: 'wrap',
  },
  resendButton: {
    flex: 1,
    marginRight: 4,
    marginBottom: 8,
    backgroundColor: '#0ea5e9',
    minWidth: 100,
  },
  verificationCancelButton: {
    flex: 1,
    marginLeft: 4,
    marginBottom: 8,
    backgroundColor: '#64748b',
    minWidth: 100,
  },

  // Update Modal Styles
  updateModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  updateModalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 32,
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.3,
    shadowRadius: 30,
    elevation: 15,
  },
  updateModalHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  updateModalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1e293b',
    marginTop: 16,
    textAlign: 'center',
  },
  updateModalMessage: {
    fontSize: 16,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
  },
  versionInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 32,
    padding: 16,
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    width: '100%',
    justifyContent: 'center',
  },
  versionLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#64748b',
    marginRight: 8,
  },
  versionText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0ea5e9',
  },
  downloadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0ea5e9',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    marginBottom: 20,
    gap: 8,
  },
  downloadButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  updateModalButtons: {
    flexDirection: 'row',
    gap: 16,
    width: '100%',
  },
  updateModalButton: {
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueButton: {
    backgroundColor: '#f3f4f6',
  },
  continueButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  updateCloseButton: {
    backgroundColor: '#6b7280',
  },
  maintenanceCloseButton: {
    backgroundColor: '#ef4444',
    flex: 1,
  },
  forceUpdateButton: {
    backgroundColor: '#0ea5e9',
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  updateModalButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
}); 