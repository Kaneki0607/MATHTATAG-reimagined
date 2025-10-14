import { MaterialIcons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Image, ImageBackground, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const { width, height } = Dimensions.get('window');

export default function Index() {
  const router = useRouter();
  const [isCheckingConnection, setIsCheckingConnection] = useState(false);
  const [hasInternet, setHasInternet] = useState(true);
  const [showNoInternet, setShowNoInternet] = useState(false);
  
  const bounceAnim = useRef(new Animated.Value(0.5)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const versionAnim = useRef(new Animated.Value(0)).current;
  const heartbeatAnim = useRef(new Animated.Value(1)).current;
  const noInternetAnim = useRef(new Animated.Value(0)).current;

  const checkInternetConnection = async () => {
    const startTime = Date.now();
    
    try {
      setIsCheckingConnection(true);
      
      // Try to fetch from Google to check internet connectivity with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
      
      const response = await fetch('https://www.google.com', {
        method: 'HEAD',
        mode: 'no-cors',
        cache: 'no-cache',
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      // Ensure minimum display time of 1.5 seconds
      const elapsedTime = Date.now() - startTime;
      const remainingTime = Math.max(0, 1500 - elapsedTime);
      
      await new Promise(resolve => setTimeout(resolve, remainingTime));
      
      // If we get here, we have internet
      setHasInternet(true);
      setShowNoInternet(false);
      
      // Navigate to role selection after a short delay
      setTimeout(() => {
        try {
          router.replace('/RoleSelection');
        } catch (navigationError) {
          console.error('Navigation error:', navigationError);
          // Fallback: try again after a short delay
          setTimeout(() => {
            try {
              router.replace('/RoleSelection');
            } catch (retryError) {
              console.error('Retry navigation error:', retryError);
            }
          }, 500);
        }
      }, 1000);
      
    } catch (error) {
      console.error('Internet connection check failed:', error);
      
      // Ensure minimum display time of 1.5 seconds even on error
      const elapsedTime = Date.now() - startTime;
      const remainingTime = Math.max(0, 1500 - elapsedTime);
      
      await new Promise(resolve => setTimeout(resolve, remainingTime));
      
      // No internet connection or any other error
      setHasInternet(false);
      setShowNoInternet(true);
      
      // Animate the no internet message
      try {
        Animated.spring(noInternetAnim, {
          toValue: 1,
          friction: 4,
          tension: 80,
          useNativeDriver: true,
        }).start();
      } catch (animationError) {
        console.error('Animation error:', animationError);
        // Fallback: set opacity directly
        noInternetAnim.setValue(1);
      }
    } finally {
      try {
        setIsCheckingConnection(false);
      } catch (stateError) {
        console.error('State update error:', stateError);
      }
    }
  };

  const retryConnection = () => {
    try {
      setShowNoInternet(false);
      noInternetAnim.setValue(0);
      checkInternetConnection();
    } catch (error) {
      console.error('Retry connection error:', error);
      // Fallback: show error state
      setShowNoInternet(true);
    }
  };

  useEffect(() => {
    try {
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
        try {
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
        } catch (heartbeatError) {
          console.error('Heartbeat animation error:', heartbeatError);
        }
      };
      
      // Start heartbeat after initial animations
      setTimeout(heartbeat, 1000);
      
      // Version pop-in
      setTimeout(() => {
        try {
          Animated.spring(versionAnim, {
            toValue: 1,
            friction: 5,
            tension: 60,
            useNativeDriver: true,
          }).start();
        } catch (versionError) {
          console.error('Version animation error:', versionError);
        }
      }, 1200);
      
      // Check internet connection after 2s
      const timer = setTimeout(() => {
        try {
          checkInternetConnection();
        } catch (connectionError) {
          console.error('Connection check error:', connectionError);
          // Fallback: show no internet state
          setHasInternet(false);
          setShowNoInternet(true);
        }
      }, 2000);
      
      return () => {
        try {
          clearTimeout(timer);
        } catch (cleanupError) {
          console.error('Cleanup error:', cleanupError);
        }
      };
    } catch (useEffectError) {
      console.error('useEffect error:', useEffectError);
      // Fallback: try to navigate directly after a delay
      setTimeout(() => {
        try {
          router.replace('/RoleSelection');
        } catch (fallbackError) {
          console.error('Fallback navigation error:', fallbackError);
        }
      }, 3000);
    }
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
        <Animated.Text style={[styles.version, { transform: [{ scale: versionAnim }] }]}>
          V{Constants.expoConfig?.version || '1.0.0'}
        </Animated.Text>

        {/* Internet Connection Check UI */}
        {isCheckingConnection && (
          <Animated.View style={[styles.connectionCheck, { opacity: fadeAnim }]}>
            <MaterialIcons name="wifi-find" size={32} color="#ffffff" />
            <Text style={styles.connectionText}>Checking internet connection...</Text>
          </Animated.View>
        )}

        {/* No Internet Connection UI */}
        {showNoInternet && (
          <Animated.View style={[
            styles.noInternetContainer, 
            { 
              transform: [{ scale: noInternetAnim }],
              opacity: noInternetAnim
            }
          ]}>
            <View style={styles.noInternetCard}>
              <MaterialIcons name="wifi-off" size={48} color="#ef4444" />
              <Text style={styles.noInternetTitle}>No Internet Connection</Text>
              <Text style={styles.noInternetMessage}>
                This app requires an internet connection to run. Please check your connection and try again.
              </Text>
              <TouchableOpacity style={styles.retryButton} onPress={retryConnection}>
                <MaterialIcons name="refresh" size={20} color="#ffffff" />
                <Text style={styles.retryButtonText}>Try Again</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        )}
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
  connectionCheck: {
    position: 'absolute',
    bottom: height * 0.15,
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  connectionText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '500',
    marginTop: 8,
  },
  noInternetContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  noInternetCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 30,
    alignItems: 'center',
    maxWidth: width * 0.85,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 10,
    },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  noInternetTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1f2937',
    marginTop: 16,
    marginBottom: 12,
    textAlign: 'center',
  },
  noInternetMessage: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
  },
  retryButton: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 25,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    shadowColor: '#3b82f6',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
}); 