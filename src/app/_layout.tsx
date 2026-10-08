import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { Toast } from '@/components/common/Toast';
import { APP_MAX_WIDTH, colors } from '@/constants/theme';
import { startAutosave } from '@/services/editProject';

export default function RootLayout() {
  useEffect(() => startAutosave(), []);

  return (
    <GestureHandlerRootView style={styles.root}>
      <StatusBar style="dark" />
      <View style={styles.column}>
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
          <Stack.Screen name="recipes/index" />
        </Stack>
        <Toast />
      </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  // Phone-width column, centred on wide (desktop web) windows.
  column: {
    flex: 1,
    width: '100%',
    maxWidth: APP_MAX_WIDTH,
    alignSelf: 'center',
    overflow: 'hidden',
  },
});
