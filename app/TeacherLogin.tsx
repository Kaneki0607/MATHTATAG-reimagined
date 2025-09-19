import { AntDesign, MaterialIcons } from '@expo/vector-icons';
import { useFonts } from 'expo-font';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Dimensions, Image, ImageBackground, KeyboardAvoidingView, Modal, NativeScrollEvent, NativeSyntheticEvent, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

const { width } = Dimensions.get('window'); // Removed unused height variable

export default function TeacherLogin() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
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
  
  // Sign Up Modal States
  const [showSignUpModal, setShowSignUpModal] = useState(false);
  const [signUpData, setSignUpData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
    school: '',
    subject: '',
    phoneNumber: ''
  });
  const [signUpLoading, setSignUpLoading] = useState(false);

  useEffect(() => {
    // Show terms modal on mount
    setShowTermsModal(true);
  }, []);


  const handleLogin = () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please enter both email and password.');
      return;
    }

    setLoading(true);
    
    // Simulate login process
    setTimeout(() => {
      setLoading(false);
      router.replace('/TeacherDashboard');
    }, 1000);
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
  };

  const handleSignUp = () => {
    setSignUpLoading(true);
    
    // Simple validation
    if (!signUpData.firstName || !signUpData.lastName || !signUpData.email || !signUpData.password) {
      alert('Please fill in all required fields.');
      setSignUpLoading(false);
      return;
    }
    
    if (signUpData.password !== signUpData.confirmPassword) {
      alert('Passwords do not match.');
      setSignUpLoading(false);
      return;
    }
    
    // Simulate sign up process
    setTimeout(() => {
      setSignUpLoading(false);
      alert('Account created successfully! You can now login.');
      setShowSignUpModal(false);
      // Reset form
      setSignUpData({
        firstName: '',
        lastName: '',
        email: '',
        password: '',
        confirmPassword: '',
        school: '',
        subject: '',
        phoneNumber: ''
      });
    }, 2000);
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
          <View style={styles.iconCircle}>
            <MaterialIcons name="school" size={38} color="#00aaff" />
          </View>
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
              onChangeText={setEmail}
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
              onChangeText={setPassword}
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
          
          {/* Remember Me Checkbox */}
          <View style={styles.rememberMeContainer}>
            <TouchableOpacity
              style={styles.checkboxContainer}
              onPress={() => setRememberMe(!rememberMe)}
            >
              <View style={[styles.checkbox, rememberMe && styles.checkboxChecked]}>
                {rememberMe && (
                  <AntDesign name="check" size={16} color="#fff" />
                )}
              </View>
              <Text style={styles.rememberMeText}>Remember Me</Text>
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
                  placeholder="Phone Number"
                  placeholderTextColor="#1e293b"
                  value={signUpData.phoneNumber}
                  onChangeText={(value) => handleSignUpInputChange('phoneNumber', value)}
                  keyboardType="phone-pad"
                />
              </View>
              
              {/* Professional Information */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Professional Information</Text>
                
                <TextInput
                  style={styles.signUpInput}
                  placeholder="School/Institution *"
                  placeholderTextColor="#1e293b"
                  value={signUpData.school}
                  onChangeText={(value) => handleSignUpInputChange('school', value)}
                />
                
                <TextInput
                  style={styles.signUpInput}
                  placeholder="Subject/Department"
                  placeholderTextColor="#1e293b"
                  value={signUpData.subject}
                  onChangeText={(value) => handleSignUpInputChange('subject', value)}
                />
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
  rememberMeContainer: {
    width: '100%',
    marginBottom: 16,
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#00aaff',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  checkboxChecked: {
    backgroundColor: '#00aaff',
  },
  rememberMeText: {
    fontSize: 16,
    color: '#ffffff',
    fontWeight: '500',
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
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
}); 