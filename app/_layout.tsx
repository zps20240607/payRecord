import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, useColorScheme } from 'react-native';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ColorProvider, useColors } from '../constants/theme';
import { useThemeStore } from '../stores/useThemeStore';

function ThemedApp() {
  const colors = useColors();
  const mode = useThemeStore((s) => s.mode);
  const systemScheme = useColorScheme();
  const dark = mode === 'system' ? systemScheme === 'dark' : mode === 'dark';

  return (
    <>
      <BottomSheetModalProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="add" options={{ presentation: 'modal' }} />
          <Stack.Screen name="search" options={{ presentation: 'modal' }} />
          <Stack.Screen name="budget" options={{ presentation: 'modal' }} />
          <Stack.Screen name="record/[id]" />
          <Stack.Screen name="day" options={{ presentation: 'modal' }} />
          <Stack.Screen name="months" options={{ presentation: 'modal' }} />
          <Stack.Screen name="settings" options={{ presentation: 'modal' }} />
          <Stack.Screen name="recurring" options={{ presentation: 'modal' }} />
          <Stack.Screen name="report" />
          <Stack.Screen name="feedback" options={{ presentation: 'modal' }} />
        </Stack>
      </BottomSheetModalProvider>
      <StatusBar style={dark ? 'light' : 'dark'} />
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={styles.root}>
        <ColorProvider>
          <ThemedApp />
        </ColorProvider>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
