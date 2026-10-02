import { Tabs } from 'expo-router';
import { colors } from '../../ui/theme';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarLabelStyle: { fontSize: 14, fontWeight: '600' },
        tabBarIconStyle: { display: 'none' },
        headerStyle: { backgroundColor: colors.card },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Squad' }} />
      <Tabs.Screen name="match" options={{ title: 'Match' }} />
      <Tabs.Screen name="plan" options={{ title: 'Plan' }} />
    </Tabs>
  );
}
