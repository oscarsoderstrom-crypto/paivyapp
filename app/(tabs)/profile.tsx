import { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, useColorScheme, Switch, Alert,
  Modal, TextInput, Share,
} from 'react-native';
import { useAuth }  from '../../hooks/useAuth';
import { Colors }   from '../../constants/colors';
import { getVacationBalance } from '../../lib/helpers';
import { supabase } from '../../lib/supabase';
import type { VacationRequest, Team } from '../../lib/types';

export default function ProfileScreen() {
  const scheme               = useColorScheme();
  const C                    = Colors[scheme as 'light' | 'dark' ?? 'light'];
  const { profile, signOut } = useAuth();

  const [vacations,    setVacations]    = useState<VacationRequest[]>([]);
  const [teams,        setTeams]        = useState<Team[]>([]);
  const [invitations,  setInvitations]  = useState<any[]>([]);
  const [inviteModal,  setInviteModal]  = useState(false);
  const [codeModal,    setCodeModal]    = useState(false);
  const [inviteCode,   setInviteCode]   = useState('');
  const [inviteEmail,  setInviteEmail]  = useState('');
  const [inviteTeam,   setInviteTeam]   = useState('');
  const [inviteRole,   setInviteRole]   = useState<'employee'|'manager'>('employee');
  const [saving,       setSaving]       = useState(false);

  useEffect(() => {
    if (!profile) return;
    fetchVacations();
    fetchTeams();
    if (profile.role === 'hr-admin') fetchInvitations();
  }, [profile]);

  const fetchVacations = async () => {
    const { data } = await supabase.from('vacation_requests').select('*');
    if (data) setVacations(data as VacationRequest[]);
  };

  const fetchTeams = async () => {
    const { data } = await supabase.from('teams').select('*');
    if (data) { setTeams(data as Team[]); if (data.length > 0) setInviteTeam(data[0].id); }
  };

  const fetchInvitations = async () => {
    const { data } = await supabase
      .from('invitations')
      .select('*')
      .is('accepted_at', null)
      .order('created_at', { ascending: false });
    if (data) setInvitations(data);
  };

  const sendInvite = async () => {
    if (!inviteEmail.trim()) { Alert.alert('Please enter an email'); return; }
    if (!inviteTeam)         { Alert.alert('Please select a team');  return; }
    setSaving(true);

    const { data, error } = await supabase.from('invitations').insert({
      email:      inviteEmail.toLowerCase().trim(),
      invited_by: profile!.id,
      team_id:    inviteTeam,
      role:       inviteRole,
    }).select().single();

    setSaving(false);

    if (error) {
      Alert.alert('Error', error.message.includes('unique')
        ? 'An invitation for this email already exists.'
        : error.message);
      return;
    }

    const code = (data as any).token.slice(0, 8);
    setInviteCode(code);
    setInviteModal(false);
    setInviteEmail('');
    setCodeModal(true);
    fetchInvitations();
  };

  const shareCode = async () => {
    await Share.share({
      message: `You've been invited to Päivy!\n\nDownload Expo Go, scan your office QR code, then register with:\n• Your email: ${inviteEmail || 'your work email'}\n• Invite code: ${inviteCode}`,
    });
  };

  if (!profile) return null;

  const team      = (profile as any).team;
  const bal       = getVacationBalance(profile.id, vacations, profile.accrual_rate);
  const roleLabel = profile.role === 'hr-admin' ? 'HR Admin'
    : profile.role === 'manager' ? 'Manager' : 'Employee';
  const initials  = profile.full_name
    .split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();

  const handleSignOut = () => {
    Alert.alert('Sign out', 'Are you sure?', [
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
            <View style={[styles.avatar, { backgroundColor: team?.color ?? '#6B7280' }]}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.name, { color: C.text }]}>{profile.full_name}</Text>
              <Text style={[styles.email, { color: C.muted }]}>{profile.email}</Text>
              <View style={styles.pillRow}>
                {team && (
                  <View style={[styles.pill, { backgroundColor: team.color + '22' }]}>
                    <Text style={[styles.pillText, { color: team.color }]}>{team.name}</Text>
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
            {[{l:'Total',v:bal.total},{l:'Used',v:bal.used},{l:'Left',v:bal.remaining}].map(s => (
              <View key={s.l} style={styles.balItem}>
                <Text style={styles.balNum}>{s.v}</Text>
                <Text style={styles.balLabel}>{s.l}</Text>
              </View>
            ))}
          </View>
          <View style={styles.barBg}>
            <View style={[styles.barFill,
              { width: `${Math.min((bal.used/bal.total)*100,100)}%` as any }]} />
          </View>
          <Text style={styles.balNote}>
            {profile.accrual_rate} days/month · Resets April 1 · Finnish Annual Holidays Act
          </Text>
        </View>

        {/* HR Admin — Invite users */}
        {profile.role === 'hr-admin' && (
          <View style={[styles.card, { backgroundColor: C.card, borderColor: C.border }]}>
            <Text style={[styles.sectionLabel, { color: C.muted }]}>MANAGE USERS</Text>
            <TouchableOpacity
              style={[styles.inviteBtn, { backgroundColor: C.accent }]}
              onPress={() => setInviteModal(true)}
            >
              <Text style={styles.inviteBtnText}>+ Invite User</Text>
            </TouchableOpacity>

            {invitations.length > 0 && (
              <View style={{ marginTop: 14 }}>
                <Text style={[styles.subLabel, { color: C.muted }]}>PENDING INVITES</Text>
                {invitations.map((inv: any) => (
                  <View key={inv.id}
                    style={[styles.inviteRow, { borderColor: C.border }]}>
                    <View>
                      <Text style={[styles.inviteEmail, { color: C.text }]}>{inv.email}</Text>
                      <Text style={[styles.inviteMeta, { color: C.muted }]}>
                        Code: {inv.token.slice(0, 8)} · {inv.role}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Sign out */}
        <TouchableOpacity
          style={[styles.signOutBtn, { borderColor: C.red }]}
          onPress={handleSignOut}
        >
          <Text style={[styles.signOutText, { color: C.red }]}>Sign Out</Text>
        </TouchableOpacity>

      </ScrollView>

      {/* ── Invite modal ── */}
      <Modal visible={inviteModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: C.card }]}>
            <Text style={[styles.modalTitle, { color: C.text }]}>Invite User</Text>

            <Text style={[styles.fieldLabel, { color: C.muted }]}>EMAIL</Text>
            <TextInput
              style={[styles.input, { borderColor: C.border, color: C.text, backgroundColor: C.bg }]}
              placeholder="colleague@company.fi"
              placeholderTextColor={C.muted}
              value={inviteEmail}
              onChangeText={setInviteEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />

            <Text style={[styles.fieldLabel, { color: C.muted }]}>TEAM</Text>
            <View style={styles.pillSelect}>
              {teams.map(t => (
                <TouchableOpacity key={t.id}
                  style={[styles.selectPill, {
                    borderColor: t.color,
                    backgroundColor: inviteTeam === t.id ? t.color : 'transparent',
                  }]}
                  onPress={() => setInviteTeam(t.id)}
                >
                  <Text style={[styles.selectPillText,
                    { color: inviteTeam === t.id ? 'white' : t.color }]}>
                    {t.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.fieldLabel, { color: C.muted }]}>ROLE</Text>
            <View style={styles.pillSelect}>
              {(['employee','manager'] as const).map(r => (
                <TouchableOpacity key={r}
                  style={[styles.selectPill, {
                    borderColor: C.accent,
                    backgroundColor: inviteRole === r ? C.accent : 'transparent',
                  }]}
                  onPress={() => setInviteRole(r)}
                >
                  <Text style={[styles.selectPillText,
                    { color: inviteRole === r ? 'white' : C.accent }]}>
                    {r.charAt(0).toUpperCase() + r.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalBtns}>
              <TouchableOpacity
                style={[styles.modalBtn, { borderColor: C.border, backgroundColor: C.bg }]}
                onPress={() => setInviteModal(false)}
              >
                <Text style={{ color: C.muted }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: C.accent, borderColor: C.accent }]}
                onPress={sendInvite}
                disabled={saving}
              >
                <Text style={{ color: 'white', fontWeight: '700' }}>
                  {saving ? 'Sending...' : 'Create Invite'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Code reveal modal ── */}
      <Modal visible={codeModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: C.card }]}>
            <Text style={[styles.modalTitle, { color: C.text }]}>Invite Created!</Text>
            <Text style={[styles.codeHint, { color: C.muted }]}>
              Share this code with your colleague. They'll use it to register in the app.
            </Text>
            <View style={[styles.codeBox, { backgroundColor: C.bg, borderColor: C.border }]}>
              <Text style={[styles.codeText, { color: C.accent }]}>{inviteCode}</Text>
            </View>
            <Text style={[styles.codeHint, { color: C.muted, marginBottom: 16 }]}>
              The code is the first 8 characters they enter when registering.
              It expires in 7 days.
            </Text>
            <TouchableOpacity style={[styles.shareBtn, { backgroundColor: C.nav }]}
              onPress={shareCode}>
              <Text style={styles.shareBtnText}>Share via WhatsApp / Email</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.doneBtn, { borderColor: C.border }]}
              onPress={() => setCodeModal(false)}>
              <Text style={{ color: C.muted }}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root:          { flex: 1 },
  header:        { paddingTop: 56, paddingBottom: 16, paddingHorizontal: 20 },
  title:         { fontSize: 24, fontWeight: '800', color: 'white', letterSpacing: -0.5 },
  scroll:        { padding: 16, paddingBottom: 40 },
  card:          { borderRadius: 16, padding: 16, borderWidth: 1, marginBottom: 14 },
  userRow:       { flexDirection: 'row', gap: 14, alignItems: 'center' },
  avatar:        { width: 60, height: 60, borderRadius: 30,
                   alignItems: 'center', justifyContent: 'center' },
  avatarText:    { color: 'white', fontSize: 20, fontWeight: '800' },
  name:          { fontSize: 18, fontWeight: '800', letterSpacing: -0.5 },
  email:         { fontSize: 13, marginTop: 2 },
  pillRow:       { flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap' },
  pill:          { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
  pillText:      { fontSize: 11, fontWeight: '700' },
  balCard:       { backgroundColor: '#192A3A', borderRadius: 18, padding: 20, marginBottom: 14 },
  balHeader:     { fontSize: 11, color: 'rgba(255,255,255,0.5)',
                   letterSpacing: 0.5, marginBottom: 14 },
  balRow:        { flexDirection: 'row', marginBottom: 14 },
  balItem:       { flex: 1, alignItems: 'center' },
  balNum:        { fontSize: 32, fontWeight: '800', color: 'white', letterSpacing: -1 },
  balLabel:      { fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 2 },
  barBg:         { height: 6, backgroundColor: 'rgba(255,255,255,0.12)',
                   borderRadius: 3, overflow: 'hidden', marginBottom: 10 },
  barFill:       { height: 6, backgroundColor: '#E05C2A', borderRadius: 3 },
  balNote:       { fontSize: 11, color: 'rgba(255,255,255,0.35)' },
  sectionLabel:  { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 12 },
  subLabel:      { fontSize: 10, fontWeight: '700', letterSpacing: 0.5, marginBottom: 8 },
  inviteBtn:     { borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  inviteBtnText: { color: 'white', fontSize: 14, fontWeight: '700' },
  inviteRow:     { borderBottomWidth: 1, paddingVertical: 10 },
  inviteEmail:   { fontSize: 13, fontWeight: '600' },
  inviteMeta:    { fontSize: 11, marginTop: 2 },
  signOutBtn:    { borderRadius: 14, borderWidth: 1.5, padding: 15,
                   alignItems: 'center', marginTop: 4 },
  signOutText:   { fontSize: 15, fontWeight: '700' },
  modalOverlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalBox:      { borderRadius: 24, padding: 24, paddingBottom: 36 },
  modalTitle:    { fontSize: 18, fontWeight: '800', marginBottom: 16 },
  fieldLabel:    { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 6 },
  input:         { borderWidth: 1.5, borderRadius: 10, padding: 12,
                   fontSize: 15, marginBottom: 14 },
  pillSelect:    { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 16 },
  selectPill:    { paddingHorizontal: 14, paddingVertical: 7,
                   borderRadius: 20, borderWidth: 1.5 },
  selectPillText:{ fontSize: 13, fontWeight: '600' },
  modalBtns:     { flexDirection: 'row', gap: 10, marginTop: 4 },
  modalBtn:      { flex: 1, paddingVertical: 13, borderRadius: 12,
                   borderWidth: 1, alignItems: 'center' },
  codeBox:       { borderRadius: 14, borderWidth: 1, padding: 20,
                   alignItems: 'center', marginVertical: 16 },
  codeText:      { fontSize: 32, fontWeight: '800', letterSpacing: 4 },
  codeHint:      { fontSize: 13, textAlign: 'center', lineHeight: 20 },
  shareBtn:      { borderRadius: 12, paddingVertical: 13,
                   alignItems: 'center', marginBottom: 10 },
  shareBtnText:  { color: 'white', fontSize: 14, fontWeight: '700' },
  doneBtn:       { borderRadius: 12, paddingVertical: 13,
                   borderWidth: 1, alignItems: 'center' },
});