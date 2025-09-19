import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Animated, Dimensions, Image, ImageBackground, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const { width } = Dimensions.get('window');
const LOGO_WIDTH = width * 0.55;

export default function RoleSelection() {
  const router = useRouter();
  const heartbeatAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Heartbeat animation
    const heartbeat = () => {
      Animated.sequence([
        Animated.timing(heartbeatAnim, {
          toValue: 1.1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(heartbeatAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(heartbeatAnim, {
          toValue: 1.15,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(heartbeatAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start(() => {
        // Repeat heartbeat every 1.5 seconds
        setTimeout(heartbeat, 1500);
      });
    };
    
    // Start heartbeat after a short delay
    setTimeout(heartbeat, 500);
  }, [heartbeatAnim]);

  return (
    <ImageBackground
      source={require('../assets/images/bg2.jpg')}
      style={styles.background}
      resizeMode="cover"
      imageStyle={{ opacity: 1 }}
    >
      <View style={styles.container}>
        <View style={styles.card}>
          <View style={styles.logoBox}>
            <Animated.View style={{ 
              transform: [{ scale: heartbeatAnim }]
            }}>
              <Image
                source={require('../assets/images/Logo.png')}
                style={styles.logoImage}
                resizeMode="contain"
              />
            </Animated.View>
          </View>
          <Text style={styles.title}>Select your role</Text>
          <View style={styles.buttonContainer}>
            <TouchableOpacity style={styles.roleButton} onPress={() => router.push('/TeacherLogin')}>
              <MaterialIcons name="school" size={26} color="#fff" style={styles.roleIcon} />
              <Text style={styles.roleButtonText}>Teacher</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.roleButton} onPress={() => router.push('/ParentLogin')}>
              <MaterialCommunityIcons name="account-group" size={26} color="#fff" style={styles.roleIcon} />
              <Text style={styles.roleButtonText}>Parent</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    height: '100%',
    backgroundColor: '#f8fafc', // Modern light background
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  card: {
    width: '90%',
    maxWidth: 400,
    backgroundColor: 'rgba(255, 255, 255, 0.13)', // White colored blur
    borderRadius: 28,
    paddingTop: 10,
    paddingBottom: 35,
    paddingHorizontal: 24,
    alignItems: 'center',
    shadowColor: '#000000', // Enhanced shadow for glass effect
    shadowOpacity: 0.5,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 12 },
    elevation: 20,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.5)', // More visible glass border
    marginBottom: -8,
    backdropFilter: 'blur(8px)', // Slight blur inside the card
  },
  logoBox: {
    alignItems: 'center',
    marginBottom: -50,
    marginTop: -55,
  },
  logoImage: {
    width: width * 1.0, // Increased logo size for the card
    height: width * 9.9,
    maxWidth: 350,
    maxHeight: 350,
  },
  title: {
    fontSize: 30,
    fontWeight: '700',
    marginBottom: 10,
    color: '#ffffff', // White text for glass theme
    textAlign: 'center',
    letterSpacing: 0.5,
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  buttonContainer: {
    flexDirection: 'column',
    alignItems: 'center',
    width: '100%',
    marginTop: 8,
  },
  roleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.25)', // Glass button background
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 24,
    marginVertical: 8,
    width: '100%',
    maxWidth: 320,
    elevation: 4,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)', // Glass button border
  },
  roleIcon: {
    marginRight: 16,
  },
  roleButtonText: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '600',
    letterSpacing: 0.5,
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
}); 
