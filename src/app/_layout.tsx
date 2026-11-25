import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { colors } from '../ui/theme';

export default function RootLayout() {
  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ contentStyle: { backgroundColor: colors.bg } }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="share" options={{ presentation: 'modal', title: 'Share' }} />
        <Stack.Screen name="player/[id]" options={{ presentation: 'modal', title: 'Player' }} />
        <Stack.Screen name="team" options={{ presentation: 'modal', title: 'Team' }} />
        <Stack.Screen name="join/[code]" options={{ title: 'Join team' }} />
      </Stack>
    </>
  );
}
