import { AntDesign, MaterialCommunityIcons } from '@expo/vector-icons';
import { useFonts } from 'expo-font';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Dimensions, Image, ImageBackground, KeyboardAvoidingView, Modal, NativeScrollEvent, NativeSyntheticEvent, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

const { width } = Dimensions.get('window'); // Removed unused height variable

export default function ParentLogin() {
  const router = useRouter();
  const [parentKey, setParentKey] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [fontsLoaded] = useFonts({
    'LeagueSpartan-Bold': require('../assets/fonts/LeagueSpartan-Bold.ttf'),
  });

  const TERMS_KEY = 'parentAgreedToTerms';
  const TERMS_TEXT = `MATH TATAG - TERMS AND CONDITIONS\n\n1. Data Privacy: We comply with the Philippine Data Privacy Act (RA 10173). Your personal information is collected, processed, and stored solely for educational purposes. We do not sell or share your data with third parties except as required by law.\n\n2. Consent: By using this app, you consent to the collection and use of your data for learning analytics, progress tracking, and communication with your school.\n\n3. User Responsibilities: You agree to use this app for lawful, educational purposes only. Do not share your login credentials.\n\n4. Intellectual Property: All content, including lessons and activities, is owned by the app developers and licensors.\n\n5. Limitation of Liability: The app is provided as-is. We are not liable for any damages arising from its use.\n\n6. Updates: We may update these terms. Continued use means you accept the new terms.\n\n7. Contact: For privacy concerns, contact your school or the app administrator.\n\nBy agreeing, you acknowledge you have read and understood these terms in accordance with Philippine law.`;

  const [showTermsModal, setShowTermsModal] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [canCheckAgreement, setCanCheckAgreement] = useState(false);
  const [hasScrolledToEnd, setHasScrolledToEnd] = useState(false);

  useEffect(() => {
    // Show terms modal on mount
    setShowTermsModal(true);
  }, []);

  // Handler for opening terms modal
  const openTerms = () => setShowTermsModal(true);

  // Handler for agreeing
  const handleAgree = () => {
    setShowTermsModal(false);
    setAgreedToTerms(true);
    setCanCheckAgreement(true);
  };

  // Handler for scroll to end
  const handleTermsScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
    if (layoutMeasurement.height + contentOffset.y >= contentSize.height - 20) {
      setHasScrolledToEnd(true);
    }
  };

  const handleLogin = () => {
    setError('');
    setLoading(true);
    
    // Simple validation for demo purposes
    if (!parentKey.trim()) {
      setError('Please enter a Parent Key.');
      setLoading(false);
      return;
    }
    
    // Simulate login process
    setTimeout(() => {
      setLoading(false);
      router.replace('/RoleSelection');
    }, 1000);
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
              onChangeText={setParentKey}
              autoCapitalize="characters"
              autoCorrect={false}
            />
          </View>
          {error ? <Text style={{ color: '#ff5a5a', marginBottom: 8 }}>{error}</Text> : null}
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
            <Text style={{ color: '#ffffff', fontSize: 15, textShadowColor: 'rgba(255, 253, 253, 0.3)', textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 2 }}>
              I agree to the  
              <Text style={{ color: '#00aaff', textDecorationLine: 'underline', textShadowColor: 'rgba(255, 247, 247, 0.3)', textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 2 }} onPress={openTerms}> Terms and Conditions</Text>
            </Text>
          </View>
          <TouchableOpacity style={styles.button} onPress={handleLogin} activeOpacity={0.85} disabled={loading || !agreedToTerms}>
            <Text style={styles.buttonText}>{loading ? 'Logging in...' : 'Login'}</Text>
          </TouchableOpacity>
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
    opacity: 0.3,
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
    shadowOpacity: 0.8,
    shadowRadius: 40,
    shadowOffset: { width: 0, height: 15 },
    elevation: 25,
    marginBottom: 15,
    backdropFilter: 'blur(12px)', // Enhanced spatial blur
    position: 'relative',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)', // Lighter white border
  },
  cardOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.1)', // Lighter overlay inside card
    borderRadius: 28,
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
}); 