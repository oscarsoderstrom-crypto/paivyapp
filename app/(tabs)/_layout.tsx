import { Tabs }                  from 'expo-router';
import { Text }                  from 'react-native';
import { useState, useEffect }   from 'react';
import { supabase }              from '../../lib/supabase';
import { useAuth }               from '../../hooks/useAuth';

function TabIcon({ emoji, focused }: { emoji: string; focused: boolean }) {
  return (
    <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.45 }}>
      {emoji}
    </Text>
  );
}

export default function TabLayout() {
  const { profile } = useAuth();
  const [pending, setPending] = useState(0);

  useEffect(() => {
    if (!profile) return;

    const fetchPending = async () => {
      if (profile.role !== 'hr-admin') { setPending(0); return; }
      const { count } = await supabase
        .from('vacation_requests')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');
      setPending(count ?? 0);
    };

    fetchPending();

    const channel = supabase
      .channel('vacation-badge')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'vacation_requests' },
        () => fetchPending())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [profile]);

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
          tabBarIcon: ({ focused }) => <TabIcon emoji="🌴" focused={focused} />,
          tabBarBadge: pending > 0 ? pending : undefined,
          tabBarBadgeStyle: { backgroundColor: '#E05C2A', fontSize: 11 } }} />
      <Tabs.Screen name="team"
        options={{ title: 'Team',
          tabBarIcon: ({ focused }) => <TabIcon emoji="👥" focused={focused} /> }} />
      <Tabs.Screen name="profile"
        options={{ title: 'Profile',
          tabBarIcon: ({ focused }) => <TabIcon emoji="👤" focused={focused} /> }} />
    </Tabs>
  );
}