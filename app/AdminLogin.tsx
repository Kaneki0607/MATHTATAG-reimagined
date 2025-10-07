import { AntDesign } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFonts } from 'expo-font';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Dimensions, Image, ImageBackground, KeyboardAvoidingView, Modal, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import TermsAndConditions from '../components/TermsAndConditions';
import { readData } from '../lib/firebase-database';
import { hasAdminAgreedToTerms, recordAdminTermsAgreement } from '../lib/terms-utils';

const { width } = Dimensions.get('window');

// Super Admin UIDs - Add more super admin UIDs to this array
// Super Admins (Developers) have access to SuperAdminDashboard
// Regular Admins (School Admins) have access to AdminDashboard
const SUPER_ADMIN_UIDS = [
  'XFDRJABVrIY5tQ07ry3jO9eEnCL2', // Super admin 1
  '3mXL3wcXCQQg90kKC6mvRyN0uk12', // Super admin 2
  'v48KBqVpsMTDCAIb2wiZAgXRnj73', // Super admin 3
  // Add more super admin UIDs here as needed
];

export default function AdminLogin() {
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
  const [currentAdminId, setCurrentAdminId] = useState<string | null>(null);
  const [showCustomAlert, setShowCustomAlert] = useState(false);
  const [customAlertTitle, setCustomAlertTitle] = useState<string>('');
  const [customAlertMessage, setCustomAlertMessage] = useState<string>('');
  
  // Remember me keys
  const STORAGE_EMAIL_KEY = 'admin_email';
  const STORAGE_PASSWORD_KEY = 'admin_password';

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

        // Check if admin has already agreed to terms
        const hasAgreed = await hasAdminAgreedToTerms();
        if (hasAgreed) {
          setAgreedToTerms(true);
        } else {
          // Show terms modal only if they haven't agreed yet
          setShowTermsModal(true);
        }
      } catch {
        // ignore storage errors, show terms modal as fallback
        setShowTermsModal(true);
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
      // Admin login doesn't require email verification - use raw signInWithEmailAndPassword
      const auth = require('../lib/firebase-auth').getAuthInstance();
      const { signInWithEmailAndPassword } = require('firebase/auth');
      const { user } = await signInWithEmailAndPassword(auth, email, password);
      
      if (user) {
        // Check if user is a super admin (developer)
        const isSuperAdmin = SUPER_ADMIN_UIDS.includes(user.uid);

        if (isSuperAdmin) {
          // Super admin (developer) login - route to SuperAdminDashboard
          setCurrentAdminId(user.uid);
          router.replace('/SuperAdminDashboard' as any);
        } else {
          // Verify regular admin permission in Firebase before routing
          try {
            const { data: adminData } = await readData(`/admins/${user.uid}`);
            const hasAdminAccess = !!adminData && (adminData.isAdmin === true || adminData === true);

            if (hasAdminAccess) {
              setCurrentAdminId(user.uid);
              router.replace('/AdminDashboard' as any);
            } else {
              // Show custom alert modal for insufficient permissions
              setCustomAlertTitle('Access Denied');
              setCustomAlertMessage('Your account does not have admin privileges. Please contact a super admin to request access.');
              setShowCustomAlert(true);
            }
          } catch (e) {
            // Fallback error
            setCustomAlertTitle('Login Error');
            setCustomAlertMessage('Unable to verify admin permissions at this time. Please try again later.');
            setShowCustomAlert(true);
          }
        }
      }
    } catch (error: any) {
      Alert.alert('Login Error', error.message || 'An unexpected error occurred during login.');
      setLoading(false);
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
    await recordAdminTermsAgreement(currentAdminId || undefined);
  };

  if (!fontsLoaded) return null;

  return (
    <ImageBackground
      source={require('../assets/images/bg.jpg')}
      style={styles.background}
      resizeMode="cover"
      imageStyle={{ opacity: 1 }}
    >
      {/* Custom Alert Modal */}
      <Modal visible={showCustomAlert} transparent animationType="fade" onRequestClose={() => setShowCustomAlert(false)}>
        <View style={styles.alertOverlay}>
          <View style={styles.alertCard}>
            <Text style={styles.alertTitle}>{customAlertTitle}</Text>
            <Text style={styles.alertMessage}>{customAlertMessage}</Text>
            <TouchableOpacity style={styles.alertButton} onPress={() => setShowCustomAlert(false)}>
              <Text style={styles.alertButtonText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      {/* Gradient overlay for depth */}
      <View style={styles.gradientOverlay} pointerEvents="none" />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.card}>
          {/* Admin icon */}
          <View style={styles.logoBox}>
            <Image
              source={require('../assets/images/Logo.png')}
              style={styles.logoImage}
              resizeMode="contain"
            />
          </View>
          {/* Dark overlay inside card */}
          <View style={styles.cardOverlay} pointerEvents="none" />
          <Text style={styles.title}>Login as Admin</Text>
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
        </View>
      </KeyboardAvoidingView>
      <TermsAndConditions
        visible={showTermsModal}
        onAgree={handleTermsAgree}
        title="Terms and Conditions"
      />
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
    shadowOpacity: 0.,
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
  alertOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  alertCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 10,
  },
  alertTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 8,
  },
  alertMessage: {
    fontSize: 14,
    color: '#475569',
    lineHeight: 20,
    marginBottom: 16,
  },
  alertButton: {
    alignSelf: 'flex-end',
    backgroundColor: '#0ea5e9',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  alertButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
});
