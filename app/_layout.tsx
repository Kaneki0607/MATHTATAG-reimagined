import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';

<<<<<<< HEAD
=======
export const unstable_settings = {
  anchor: '(tabs)',
};

>>>>>>> 3afb019d57f326bfb6f6fa9a9de8ada3cef42aaf
export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
<<<<<<< HEAD
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="RoleSelection" />
        <Stack.Screen name="TeacherLogin" />
        <Stack.Screen name="ParentLogin" />
        <Stack.Screen name="TeacherDashboard" />
      </Stack>
      <StatusBar style="light" hidden={false} translucent={true} />
=======
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      </Stack>
      <StatusBar style="auto" />
>>>>>>> 3afb019d57f326bfb6f6fa9a9de8ada3cef42aaf
    </ThemeProvider>
  );
}
