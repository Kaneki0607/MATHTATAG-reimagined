// Expo app configuration with environment variable support
// This file reads from .env file and passes values to the app via expo.extra

require('dotenv').config();

module.exports = {
  expo: {
    name: "MATHTATAG",
    slug: "MATHTATAG",
    version: "1.0.4",
    orientation: "portrait",
    icon: "./assets/images/logo-zoomedout.png",
    scheme: "mathtatagreimagined",
    userInterfaceStyle: "automatic",
    newArchEnabled: true,
    ios: {
      supportsTablet: true,
      icon: "./assets/images/logo-zoomedout.png"
    },
    android: {
      package: "com.mathtatag.reimagined",
      adaptiveIcon: {
        backgroundColor: "#E6F4FE",
        foregroundImage: "./assets/images/and.png"
      },
      edgeToEdgeEnabled: false,
      predictiveBackGestureEnabled: false
    },
    web: {
      output: "static",
      favicon: "./assets/images/logo-transparent.png",
      bundler: "metro"
    },
    plugins: [
      "expo-router",
      [
        "expo-splash-screen",
        {
          image: "./assets/images/splash-icon.png",
          imageWidth: 200,
          resizeMode: "contain",
          backgroundColor: "#ffffff",
          dark: {
            backgroundColor: "#000000"
          }
        }
      ],
      "expo-web-browser"
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: true
    },
    extra: {
      router: {},
      eas: {
        projectId: "f64c3081-3b9d-476a-b777-401604c59e6b"
      },
      // Environment variables accessible via Constants.expoConfig.extra
      geminiApiKey: process.env.GEMINI_API_KEY || '',
      // Firebase configuration from environment variables
      firebaseApiKey: process.env.FIREBASE_API_KEY || '',
      firebaseAuthDomain: process.env.FIREBASE_AUTH_DOMAIN || '',
      firebaseDatabaseURL: process.env.FIREBASE_DATABASE_URL || '',
      firebaseProjectId: process.env.FIREBASE_PROJECT_ID || '',
      firebaseStorageBucket: process.env.FIREBASE_STORAGE_BUCKET || '',
      firebaseMessagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '',
      firebaseAppId: process.env.FIREBASE_APP_ID || '',
      firebaseMeasurementId: process.env.FIREBASE_MEASUREMENT_ID || '',
    },
    runtimeVersion: {
      policy: "appVersion"
    },
    updates: {
      url: "https://u.expo.dev/f64c3081-3b9d-476a-b777-401604c59e6b",
      enabled: true,
      checkAutomatically: "ON_LOAD",
      fallbackToCacheTimeout: 0
    }
  }
};

