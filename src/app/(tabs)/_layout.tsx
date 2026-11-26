import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../design';
import { TabIcon } from '../../ui/icons';

export default function TabsLayout() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: t.color.text.link,
        tabBarInactiveTintColor: t.color.text.muted,
        tabBarStyle: {
          backgroundColor: t.color.bg.surface,
          borderTopColor: t.color.border.subtle,
          // a custom height replaces the default, so the home-indicator inset is added here
          height: t.component.tabBar.height + insets.bottom,
        },
        tabBarLabelStyle: t.typography[t.component.tabBar.text],
        headerStyle: { backgroundColor: t.color.bg.surface },
        headerTitleStyle: t.navigation.headerTitle,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Squad', tabBarIcon: ({ color, size }) => <TabIcon name="squad" color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="match"
        options={{ title: 'Match', tabBarIcon: ({ color, size }) => <TabIcon name="match" color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="plan"
        options={{ title: 'Plan', tabBarIcon: ({ color, size }) => <TabIcon name="plan" color={color} size={size} /> }}
      />
    </Tabs>
  );
}
