import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
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
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        {/* Route files under /app are auto-registered. Ensure these files exist at app/TeacherLogin.tsx and app/TeacherDashboard.tsx */}
        <Stack.Screen name="TeacherLogin" />
        <Stack.Screen name="TeacherDashboard" />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      </Stack>
      <StatusBar style="light" hidden={false} translucent={true} />
    </ThemeProvider>
  );
}
