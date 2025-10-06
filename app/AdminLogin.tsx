import { AntDesign } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFonts } from 'expo-font';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Dimensions, Image, ImageBackground, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import TermsAndConditions from '../components/TermsAndConditions';
import { signInUser } from '../lib/firebase-auth';
import { hasAdminAgreedToTerms, recordAdminTermsAgreement } from '../lib/terms-utils';

const { width } = Dimensions.get('window');

// Super Admin UIDs - Add more super admin UIDs to this array
const SUPER_ADMIN_UIDS = [
  'XFDRJABVrIY5tQ07ry3jO9eEnCL2', // First super admin
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

      const { user, error } = await signInUser(email, password);
      
      if (error) {
        Alert.alert('Login Error', error);
        setLoading(false);
        return;
      }
      
      if (user) {
        // Check if user is a super admin
        const isSuperAdmin = SUPER_ADMIN_UIDS.includes(user.uid);
        
        if (isSuperAdmin) {
          // Super admin login
          setCurrentAdminId(user.uid);
          router.replace('/AdminDashboard');
        } else {
          // Regular user trying to access admin - deny access
          Alert.alert(
            'Access Denied', 
            'You do not have admin privileges. Please contact an administrator.',
            [{ text: 'OK' }]
          );
          setLoading(false);
          return;
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
});
