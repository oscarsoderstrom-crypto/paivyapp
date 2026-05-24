import { useEffect }     from 'react';
import { Stack, router } from 'expo-router';
import { StatusBar }     from 'expo-status-bar';
import { View, ActivityIndicator } from 'react-native';
import { useAuth }       from '../hooks/useAuth';

export default function RootLayout() {
  const { profile, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (profile) router.replace('/(tabs)');
    else         router.replace('/(auth)/login');
  }, [profile, loading]);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#192A3A' }}>
        <ActivityIndicator color="#E05C2A" size="large" />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}