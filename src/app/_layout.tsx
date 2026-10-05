import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { Toast } from '@/components/common/Toast';
import { colors } from '@/constants/theme';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          animation: 'slide_from_right',
          animationDuration: 250,
        }}
      >
        <Stack.Screen name="index" options={{ animation: 'fade' }} />
        <Stack.Screen name="editor/index" options={{ animation: 'fade_from_bottom', gestureEnabled: false }} />
        <Stack.Screen name="library/index" />
        <Stack.Screen name="filters/index" />
        <Stack.Screen name="filters/[id]" options={{ animation: 'fade' }} />
        <Stack.Screen name="favorites/index" />
        <Stack.Screen name="settings/index" />
      </Stack>
      <Toast />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
});
