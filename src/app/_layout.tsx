import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { DesignProvider, useAppFonts, useTheme } from '../design';
import { useSync } from '../sync/useSync';

// keep the splash screen up until the fonts are ready, so text never jumps from one font to another
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  useSync();
  const [fontsLoaded, fontError] = useAppFonts();
  const ready = fontsLoaded || fontError !== null;
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);
  if (!ready) return null;
  return (
    <DesignProvider customFont={fontsLoaded}>
      <AppStack />
    </DesignProvider>
  );
}

function AppStack() {
  const t = useTheme();
  return (
    <>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          contentStyle: { backgroundColor: t.color.bg.canvas },
          headerStyle: { backgroundColor: t.color.bg.surface },
          headerTintColor: t.color.text.link,
          headerTitleStyle: t.navigation.headerTitle,
          headerBackTitleStyle: t.navigation.headerBackTitle,
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="share" options={{ presentation: 'modal', title: 'Share' }} />
        <Stack.Screen name="player/[id]" options={{ presentation: 'modal', title: 'Player' }} />
        <Stack.Screen name="team" options={{ presentation: 'modal', title: 'Team' }} />
        <Stack.Screen name="join/[code]" options={{ title: 'Join team' }} />
        <Stack.Screen name="privacy" options={{ presentation: 'modal', title: 'Privacy' }} />
      </Stack>
    </>
  );
}
