/**
 * App Metadata Utility
 * Collects comprehensive diagnostic information for technical reports
 */

import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Updates from 'expo-updates';
import { Platform } from 'react-native';

export interface AppMetadata {
  appVersion: string;
  updateId: string | null;
  runtimeVersion: string | null;
  platform: string;
  platformVersion: string;
  deviceInfo: string;
  environment: string;
  buildProfile: string;
  expoVersion: string;
  timestamp: string;
}

/**
 * Collects comprehensive app and device metadata
 * Falls back to "Unknown" for unavailable fields
 */
export const collectAppMetadata = async (): Promise<AppMetadata> => {
  try {
    // Get app version with safe type casting
    const appVersion = Constants.expoConfig?.version || 
                       (Constants.manifest2?.extra?.expoClient as any)?.version ||
                       (Constants.manifest as any)?.version ||
                       '1.0.0';

    // Get update ID (EAS Updates)
    const updateId = Updates.updateId || null;

    // Get runtime version - handle both string and object types
    let runtimeVersion: string | null = null;
    try {
      const rv = Constants.expoConfig?.runtimeVersion || Constants.manifest2?.runtimeVersion;
      if (rv) {
        runtimeVersion = typeof rv === 'string' ? rv : null;
      }
    } catch {
      runtimeVersion = null;
    }

    // Get platform info
    const platform = Platform.OS;
    const platformVersion = Platform.Version?.toString() || 'Unknown';

    // Get device information with safe property access
    let deviceInfo = 'Unknown Device';
    try {
      // For web, use simple browser info
      if (Platform.OS === 'web') {
        deviceInfo = 'Web Browser';
      } 
      // For native platforms, safely access Device properties
      else if (Device && typeof Device === 'object') {
        try {
          const modelName = Device.modelName || null;
          const osName = Device.osName || null;
          const osVersion = Device.osVersion || null;
          const brand = Device.brand || null;
          const deviceName = Device.deviceName || null;
          
          if (modelName && osName && osVersion) {
            deviceInfo = `${modelName} (${osName} ${osVersion})`;
          } else if (brand && deviceName) {
            deviceInfo = `${brand} ${deviceName}`;
          } else if (osName && osVersion) {
            deviceInfo = `${osName} ${osVersion}`;
          } else if (modelName) {
            deviceInfo = modelName;
          } else {
            deviceInfo = `${Platform.OS.charAt(0).toUpperCase() + Platform.OS.slice(1)} Device`;
          }
        } catch (deviceAccessError) {
          console.warn('Device property access error:', deviceAccessError);
          deviceInfo = `${Platform.OS.charAt(0).toUpperCase() + Platform.OS.slice(1)} Device`;
        }
      } else {
        // Fallback if Device module not available
        deviceInfo = `${Platform.OS.charAt(0).toUpperCase() + Platform.OS.slice(1)} Device`;
      }
    } catch (error) {
      console.warn('Failed to get device info:', error);
      deviceInfo = `${Platform.OS.charAt(0).toUpperCase() + Platform.OS.slice(1)} Device`;
    }

    // Get environment/build profile
    const environment = Constants.expoConfig?.extra?.environment ||
                       (__DEV__ ? 'development' : 'production');
    
    const buildProfile = Constants.expoConfig?.extra?.buildProfile ||
                        Constants.manifest2?.extra?.expoClient?.extra?.buildProfile ||
                        'Unknown';

    // Get Expo SDK version with safe type casting
    const expoVersion = Constants.expoConfig?.sdkVersion ||
                       (Constants.manifest as any)?.sdkVersion ||
                       'Unknown';

    return {
      appVersion,
      updateId,
      runtimeVersion,
      platform,
      platformVersion,
      deviceInfo,
      environment,
      buildProfile,
      expoVersion,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('Failed to collect app metadata:', error);
    
    // Return fallback metadata with safe defaults
    let fallbackEnvironment = 'production';
    try {
      fallbackEnvironment = __DEV__ ? 'development' : 'production';
    } catch {
      fallbackEnvironment = 'production';
    }
    
    return {
      appVersion: '1.0.0',
      updateId: null,
      runtimeVersion: null,
      platform: Platform.OS,
      platformVersion: Platform.Version?.toString() || 'Unknown',
      deviceInfo: `${Platform.OS.charAt(0).toUpperCase() + Platform.OS.slice(1)} Device`,
      environment: fallbackEnvironment,
      buildProfile: 'Unknown',
      expoVersion: 'Unknown',
      timestamp: new Date().toISOString()
    };
  }
};

/**
 * Formats metadata for display in SuperAdmin dashboard
 */
export const formatMetadataForDisplay = (metadata: Partial<AppMetadata>): string => {
  const parts: string[] = [];
  
  if (metadata.appVersion) {
    parts.push(`v${metadata.appVersion}`);
  }
  
  if (metadata.updateId) {
    const shortId = metadata.updateId.substring(0, 8);
    parts.push(`Update: ${shortId}`);
  }
  
  if (metadata.platform) {
    const platformName = metadata.platform.charAt(0).toUpperCase() + metadata.platform.slice(1);
    parts.push(platformName);
  }
  
  if (metadata.environment) {
    const env = metadata.environment.charAt(0).toUpperCase() + metadata.environment.slice(1);
    parts.push(env);
  }
  
  return parts.join(' | ');
};

/**
 * Gets a short version string for display in RoleSelection
 */
export const getVersionString = (metadata: Partial<AppMetadata>): string => {
  const parts: string[] = [];
  
  if (metadata.appVersion) {
    parts.push(`Version ${metadata.appVersion}`);
  }
  
  if (metadata.updateId) {
    const shortId = metadata.updateId.substring(0, 8);
    parts.push(`Update ID: ${shortId}`);
  }
  
  if (metadata.platform) {
    parts.push(`Platform: ${metadata.platform.charAt(0).toUpperCase() + metadata.platform.slice(1)}`);
  }
  
  if (metadata.environment) {
    parts.push(`Env: ${metadata.environment.charAt(0).toUpperCase() + metadata.environment.slice(1)}`);
  }
  
  return parts.join(' | ') || 'Version Info Unavailable';
};

