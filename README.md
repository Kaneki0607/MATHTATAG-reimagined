# MATHTATAG - Reimagined 🧮

A modern React Native Expo application built with cutting-edge technologies for mathematical learning and engagement.

## 🚀 Quick Setup

Run this single command to set up everything:

```bash
npm run setup
```

This single command will:
- ✅ Install all dependencies with proper peer dependency resolution
- ✅ Create necessary configuration files (babel.config.js, metro.config.js, expo-env.d.ts)
- ✅ Install missing packages (react-native-worklets)
- ✅ Fix Expo package versions
- ✅ Set up the project for immediate development

## 📱 Start Development

After running the setup command, start the development server:

```bash
# Start with cache cleared (recommended)
npm run start:clear

# Or use the regular start command
npm start

# Platform-specific commands
npm run android    # Start on Android
npm run ios        # Start on iOS  
npm run web        # Start on web
```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
