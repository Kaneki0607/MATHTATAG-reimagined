import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Animated, BackHandler, Dimensions, Image, ImageBackground, Linking, Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { collectAppMetadata, getVersionString, type AppMetadata } from '../lib/app-metadata';
import { readData } from '../lib/firebase-database';

const { width } = Dimensions.get('window');
const LOGO_WIDTH = width * 0.75;

export default function RoleSelection() {
  const router = useRouter();
  const heartbeatAnim = useRef(new Animated.Value(1)).current;
  const [metadata, setMetadata] = useState<AppMetadata | null>(null);
  
  // Maintenance and version check state
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<{
    message: string;
    version: string;
    downloadUrl: string;
  } | null>(null);
  const [maintenanceMode, setMaintenanceMode] = useState(false);

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
      // Use the actual app version from Constants instead of hardcoded value
      const currentVersion = Constants.expoConfig?.version || '1.0.0';
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

  // Check maintenance and version on mount
  useEffect(() => {
    checkMaintenanceAndVersion();
  }, []);

  // Collect app metadata on mount (non-blocking, won't crash if fails)
  useEffect(() => {
    const loadMetadata = async () => {
      try {
        const data = await collectAppMetadata();
        setMetadata(data);
        console.log('App metadata loaded successfully:', data);
      } catch (error) {
        console.error('Failed to load app metadata (non-critical):', error);
        // Don't set metadata - component will simply not show version info
        // This prevents crashes while still allowing the app to function
      }
    };
    
    // Run asynchronously to not block component mount
    loadMetadata().catch(err => {
      console.warn('Metadata loading promise rejected (non-critical):', err);
    });
  }, []);

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
      <View style={styles.overlay} />
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
            <TouchableOpacity style={styles.roleButton} onPress={() => router.push('/AdminLogin')}>
              <MaterialCommunityIcons name="account-circle" size={26} color="#fff" style={styles.roleIcon} />
              <Text style={styles.roleButtonText}>Admin</Text>
            </TouchableOpacity>
          </View>
        </View>
        
        {/* Version Info Display for Debugging */}
        {metadata && (
          <View style={styles.versionInfoContainer}>
            <Text style={styles.versionInfoText}>
              {getVersionString(metadata)}
            </Text>
            <Text style={styles.versionInfoSubtext}>
              {metadata.deviceInfo}
            </Text>
          </View>
        )}
      </View>

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

const styles = StyleSheet.create({
  background: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    height: '100%',
    backgroundColor: '#f8fafc', // Modern light background
  },
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(0,0,0,0.2)',
    zIndex: 0,
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    position: 'relative',
    zIndex: 1,
  },
  card: {
    width: '90%',
    maxWidth: 400,
    backgroundColor: 'rgba(255, 255, 255, 0.13)', // White colored blur
    borderRadius: 28,
    paddingTop: 0.2,
    paddingBottom: 20,
    paddingHorizontal: 10,
    alignItems: 'center',
    alignSelf: 'center',
    shadowColor: 'transparent',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.5)', // More visible glass border
    marginBottom: 8,
  },
  logoBox: {
    alignItems: 'center',
    marginBottom: -50,
    marginTop: -40,
  },
  logoImage: {
    width: LOGO_WIDTH,
    height: LOGO_WIDTH,
    maxWidth: 550,
    maxHeight: 550,
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
    elevation: 0,
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)', // Glass button border
  },
  roleIcon: {
    marginRight: 16,
    width: 26,
    height: 26,
    textAlign: 'center',
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
  versionInfoContainer: {
    position: 'absolute',
    bottom: 20,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  versionInfoText: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.7)',
    fontWeight: '500',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
    marginBottom: 4,
  },
  versionInfoSubtext: {
    fontSize: 9,
    color: 'rgba(255, 255, 255, 0.5)',
    fontWeight: '400',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
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
    borderRadius: 20,
    padding: 30,
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 10,
    },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  updateModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    gap: 12,
  },
  updateModalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1e293b',
    flex: 1,
  },
  updateModalMessage: {
    fontSize: 15,
    color: '#64748b',
    lineHeight: 22,
    marginBottom: 20,
  },
  versionInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#f1f5f9',
    padding: 12,
    borderRadius: 10,
    marginBottom: 20,
  },
  versionLabel: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '500',
  },
  versionText: {
    fontSize: 16,
    color: '#0ea5e9',
    fontWeight: '700',
  },
  updateModalButtons: {
    flexDirection: 'column',
    gap: 12,
  },
  updateModalButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    gap: 8,
  },
  forceUpdateButton: {
    backgroundColor: '#0ea5e9',
  },
  maintenanceCloseButton: {
    backgroundColor: '#ef4444',
  },
  updateCloseButton: {
    backgroundColor: '#64748b',
  },
  updateModalButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
}); 