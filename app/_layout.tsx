import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack
          screenOptions={{
            headerShown: false,
            animation: 'slide_from_right',
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="RoleSelection" />
          <Stack.Screen name="ParentLogin" />
          <Stack.Screen name="TeacherLogin" />
          <Stack.Screen name="AdminLogin" />
          <Stack.Screen name="ParentDashboard" />
          <Stack.Screen name="TeacherDashboard" />
          <Stack.Screen name="AdminDashboard" />
          <Stack.Screen name="SuperAdminDashboard" />
          <Stack.Screen name="CreateExercise" />
          <Stack.Screen name="StudentExerciseAnswering" />
        </Stack>
        <StatusBar style="light" hidden={false} translucent={true} />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
