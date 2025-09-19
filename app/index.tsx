import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Animated, Dimensions, Image, ImageBackground, StyleSheet, View } from 'react-native';

const { width, height } = Dimensions.get('window');

export default function Index() {
  const router = useRouter();
  const bounceAnim = useRef(new Animated.Value(0.5)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const versionAnim = useRef(new Animated.Value(0)).current;
  const heartbeatAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Logo bounce
    Animated.spring(bounceAnim, {
      toValue: 1,
      friction: 4,
      tension: 80,
      useNativeDriver: true,
    }).start();
    
    // Logo fade in
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 1000,
      useNativeDriver: true,
    }).start();
    
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
    
    // Start heartbeat after initial animations
    setTimeout(heartbeat, 1000);
    
    // Version pop-in
    setTimeout(() => {
      Animated.spring(versionAnim, {
        toValue: 1,
        friction: 5,
        tension: 60,
        useNativeDriver: true,
      }).start();
    }, 1200);
    
    // Navigate after 2s
    const timer = setTimeout(() => {
      router.replace('/RoleSelection');
    }, 2000);
    return () => clearTimeout(timer);
  }, [router, bounceAnim, fadeAnim, versionAnim, heartbeatAnim]);

  return (
    <ImageBackground
      source={require('../assets/images/bg2.jpg')}
      style={styles.background}
      resizeMode="cover"
      imageStyle={{ opacity: 1 }}
    >
      <View style={styles.container}>
        <Animated.View style={{ 
          alignItems: 'center', 
          transform: [{ scale: Animated.multiply(bounceAnim, heartbeatAnim) }],
          opacity: fadeAnim
        }}>
          <Image
            source={require('../assets/images/Logo.png')}
            style={styles.logoImage}
            resizeMode="contain"
          />
        </Animated.View>
        <Animated.Text style={[styles.version, { transform: [{ scale: versionAnim }] }]}>V1.1</Animated.Text>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: '#f8fafc', // Modern light background
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    height: '100%',
  },
  logoImage: {
    width: width * 2.0, // Slightly reduced logo size for the card
    height: width * 2.0,
    maxWidth: 600,
    maxHeight: 600,
  },
  version: {
    position: 'absolute',
    bottom: height * 0.04,
    color: '#64748b', // Modern slate color
    fontSize: 13,
    letterSpacing: 1,
    fontWeight: '500',
    alignSelf: 'center',
    opacity: 0.8,
    transform: [{ scale: 0 }], // initial scale for animation
  },
}); 