import { Tabs } from 'expo-router';
import { Text } from 'react-native';

function TabIcon({ emoji, focused }: { emoji: string; focused: boolean }) {
  return (
    <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.45 }}>
      {emoji}
    </Text>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#192A3A',
          borderTopColor: 'rgba(255,255,255,0.08)',
        },
        tabBarActiveTintColor:   '#E05C2A',
        tabBarInactiveTintColor: 'rgba(255,255,255,0.42)',
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen name="index"
        options={{ title: 'Work Log',
          tabBarIcon: ({ focused }) => <TabIcon emoji="📅" focused={focused} /> }} />
      <Tabs.Screen name="vacation"
        options={{ title: 'Vacation',
          tabBarIcon: ({ focused }) => <TabIcon emoji="🌴" focused={focused} /> }} />
      <Tabs.Screen name="team"
        options={{ title: 'Team',
          tabBarIcon: ({ focused }) => <TabIcon emoji="👥" focused={focused} /> }} />
      <Tabs.Screen name="profile"
        options={{ title: 'Profile',
          tabBarIcon: ({ focused }) => <TabIcon emoji="👤" focused={focused} /> }} />
    </Tabs>
  );
}
