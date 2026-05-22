import { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, useColorScheme, Switch, Alert,
} from 'react-native';
import { useAuth }  from '../../hooks/useAuth';
import { Colors }   from '../../constants/colors';
import { getVacationBalance } from '../../lib/helpers';
import type { VacationRequest } from '../../lib/types';

interface Props {
  vacations?: VacationRequest[];
}

export default function ProfileScreen({ vacations = [] }: Props) {
  const scheme          = useColorScheme();
  const C               = Colors[scheme as 'light' | 'dark' ?? 'light'];
  const { profile, signOut } = useAuth();
  const [darkMode, setDarkMode] = useState(scheme === 'dark');

  if (!profile) return null;

  const team      = (profile as any).team;
  const bal       = getVacationBalance(profile.id, vacations, profile.accrual_rate);
  const roleLabel = profile.role === 'hr-admin' ? 'HR Admin'
    : profile.role === 'manager' ? 'Manager' : 'Employee';
  const initials  = profile.full_name
    .split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();

  const handleSignOut = () => {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: signOut },
    ]);
  };

  return (
    <View style={[styles.root, { backgroundColor: C.bg }]}>
      <View style={[styles.header, { backgroundColor: C.nav }]}>
        <Text style={styles.title}>Profile</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>

        {/* User card */}
        <View style={[styles.card, { backgroundColor: C.card, borderColor: C.border }]}>
          <View style={styles.userRow}>
            <View style={[styles.avatar,
              { backgroundColor: team?.color ?? '#6B7280' }]}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.name, { color: C.text }]}>{profile.full_name}</Text>
              <Text style={[styles.email, { color: C.muted }]}>{profile.email}</Text>
              <View style={styles.pillRow}>
                {team && (
                  <View style={[styles.pill,
                    { backgroundColor: team.color + '22' }]}>
                    <Text style={[styles.pillText, { color: team.color }]}>
                      {team.name}
                    </Text>
                  </View>
                )}
                <View style={[styles.pill, { backgroundColor: C.sub }]}>
                  <Text style={[styles.pillText, { color: C.muted }]}>{roleLabel}</Text>
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* Vacation balance */}
        <View style={styles.balCard}>
          <Text style={styles.balHeader}>VACATION BALANCE 2024–2025</Text>
          <View style={styles.balRow}>
            {[
              { l: 'Total', v: bal.total },
              { l: 'Used',  v: bal.used },
              { l: 'Left',  v: bal.remaining },
            ].map(s => (
              <View key={s.l} style={styles.balItem}>
                <Text style={styles.balNum}>{s.v}</Text>
                <Text style={styles.balLabel}>{s.l}</Text>
              </View>
            ))}
          </View>
          <View style={styles.barBg}>
            <View style={[styles.barFill,
              { width: `${Math.min((bal.used / bal.total) * 100, 100)}%` as any }]} />
          </View>
          <Text style={styles.balNote}>
            {profile.accrual_rate} days/month · Resets April 1 · Finnish Annual Holidays Act
          </Text>
        </View>

        {/* Settings */}
        <View style={[styles.card, { backgroundColor: C.card, borderColor: C.border }]}>
          <Text style={[styles.sectionLabel, { color: C.muted }]}>SETTINGS</Text>
          <View style={styles.settingRow}>
            <Text style={[styles.settingLabel, { color: C.text }]}>Dark mode</Text>
            <Switch
              value={darkMode}
              onValueChange={setDarkMode}
              trackColor={{ false: C.border, true: '#E05C2A' }}
              thumbColor="white"
            />
          </View>
        </View>

        {/* App info */}
        <View style={[styles.card, { backgroundColor: C.card, borderColor: C.border }]}>
          <Text style={[styles.sectionLabel, { color: C.muted }]}>ABOUT</Text>
          <Text style={[styles.infoText, { color: C.text }]}>Päivy · v1.0.0</Text>
          <Text style={[styles.infoNote, { color: C.muted }]}>
            Office presence &amp; vacation manager for Finland.{'\n'}
            Follows Finnish Annual Holidays Act (vuosilomalaki).
          </Text>
        </View>

        {/* Sign out */}
        <TouchableOpacity
          style={[styles.signOutBtn, { borderColor: C.red }]}
          onPress={handleSignOut}>
          <Text style={[styles.signOutText, { color: C.red }]}>Sign Out</Text>
        </TouchableOpacity>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root:        { flex: 1 },
  header:      { paddingTop: 56, paddingBottom: 16, paddingHorizontal: 20 },
  title:       { fontSize: 24, fontWeight: '800', color: 'white', letterSpacing: -0.5 },
  scroll:      { padding: 16, paddingBottom: 40 },
  card:        { borderRadius: 16, padding: 16, borderWidth: 1, marginBottom: 14 },
  userRow:     { flexDirection: 'row', gap: 14, alignItems: 'center' },
  avatar:      { width: 60, height: 60, borderRadius: 30,
                 alignItems: 'center', justifyContent: 'center' },
  avatarText:  { color: 'white', fontSize: 20, fontWeight: '800' },
  name:        { fontSize: 18, fontWeight: '800', letterSpacing: -0.5 },
  email:       { fontSize: 13, marginTop: 2 },
  pillRow:     { flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap' },
  pill:        { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
  pillText:    { fontSize: 11, fontWeight: '700' },
  balCard:     { backgroundColor: '#192A3A', borderRadius: 18,
                 padding: 20, marginBottom: 14 },
  balHeader:   { fontSize: 11, color: 'rgba(255,255,255,0.5)',
                 letterSpacing: 0.5, marginBottom: 14 },
  balRow:      { flexDirection: 'row', marginBottom: 14 },
  balItem:     { flex: 1, alignItems: 'center' },
  balNum:      { fontSize: 32, fontWeight: '800', color: 'white', letterSpacing: -1 },
  balLabel:    { fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 2 },
  barBg:       { height: 6, backgroundColor: 'rgba(255,255,255,0.12)',
                 borderRadius: 3, overflow: 'hidden', marginBottom: 10 },
  barFill:     { height: 6, backgroundColor: '#E05C2A', borderRadius: 3 },
  balNote:     { fontSize: 11, color: 'rgba(255,255,255,0.35)' },
  sectionLabel:{ fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 12 },
  settingRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  settingLabel:{ fontSize: 15 },
  infoText:    { fontSize: 15, fontWeight: '600', marginBottom: 6 },
  infoNote:    { fontSize: 13, lineHeight: 20 },
  signOutBtn:  { borderRadius: 14, borderWidth: 1.5, padding: 15,
                 alignItems: 'center', marginTop: 4 },
  signOutText: { fontSize: 15, fontWeight: '700' },
});