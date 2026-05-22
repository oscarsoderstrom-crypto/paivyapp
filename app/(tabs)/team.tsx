import { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, useColorScheme, Modal,
} from 'react-native';
import { supabase }  from '../../lib/supabase';
import { useAuth }   from '../../hooks/useAuth';
import { Colors }    from '../../constants/colors';
import type { Profile, Team } from '../../lib/types';

export default function TeamScreen() {
  const scheme      = useColorScheme();
  const C           = Colors[scheme as 'light' | 'dark' ?? 'light'];
  const { profile } = useAuth();

  const [members,   setMembers]   = useState<Profile[]>([]);
  const [teams,     setTeams]     = useState<Team[]>([]);
  const [showAll,   setShowAll]   = useState(false);
  const [settings,  setSettings]  = useState(false);

  const isMgr = profile?.role === 'manager' || profile?.role === 'hr-admin';

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    const { data: t } = await supabase.from('teams').select('*');
    const { data: m } = await supabase
      .from('profiles')
      .select('*, team:teams(*)');
    if (t) setTeams(t as Team[]);
    if (m) setMembers(m as Profile[]);
  };

  const updateTeam = async (userId: string, teamId: string) => {
    await supabase.from('profiles').update({ team_id: teamId }).eq('id', userId);
    fetchData();
  };

  const updateAccrual = async (userId: string, rate: number) => {
    await supabase.from('profiles').update({ accrual_rate: rate }).eq('id', userId);
    fetchData();
  };

  const visibleTeams = isMgr && showAll
    ? teams
    : teams.filter(t => t.id === profile?.team_id);

  const initials = (name: string) =>
    name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

  return (
    <View style={[styles.root, { backgroundColor: C.bg }]}>
      <View style={[styles.header, { backgroundColor: C.nav }]}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>Team</Text>
            <Text style={styles.subtitle}>Today's presence</Text>
          </View>
          {isMgr && (
            <View style={styles.headerBtns}>
              <TouchableOpacity
                style={[styles.toggleBtn,
                  { borderColor: showAll ? '#E05C2A' : 'rgba(255,255,255,0.2)',
                    backgroundColor: showAll ? '#E05C2A' : 'transparent' }]}
                onPress={() => setShowAll(s => !s)}>
                <Text style={styles.toggleBtnText}>
                  {showAll ? 'All office' : 'My team'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.toggleBtn,
                  { borderColor: 'rgba(255,255,255,0.2)', backgroundColor: 'transparent' }]}
                onPress={() => setSettings(true)}>
                <Text style={styles.toggleBtnText}>⚙ Manage</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {visibleTeams.map(team => {
          const teamMembers = members.filter(m => m.team_id === team.id);
          return (
            <View key={team.id} style={styles.teamSection}>
              <View style={styles.teamHeader}>
                <View style={[styles.teamDot, { backgroundColor: team.color }]} />
                <Text style={[styles.teamName, { color: C.text }]}>{team.name}</Text>
                <Text style={[styles.teamCount, { color: C.muted }]}>
                  ({teamMembers.length})
                </Text>
              </View>
              <View style={[styles.card, { backgroundColor: C.card, borderColor: C.border }]}>
                {teamMembers.map((m, i) => {
                  const roleLabel = m.role === 'hr-admin' ? 'HR Admin'
                    : m.role === 'manager' ? 'Manager' : 'Employee';
                  return (
                    <View key={m.id} style={[styles.memberRow,
                      i < teamMembers.length - 1 && { borderBottomWidth: 1, borderBottomColor: C.border }]}>
                      <View style={[styles.avatar, { backgroundColor: team.color }]}>
                        <Text style={styles.avatarText}>{initials(m.full_name)}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.memberName, { color: C.text }]}>
                          {m.full_name}
                        </Text>
                        <Text style={[styles.memberRole, { color: C.muted }]}>
                          {roleLabel}
                          {isMgr ? ` · ${m.accrual_rate}d/mo` : ''}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          );
        })}
      </ScrollView>

      {/* Settings modal */}
      <Modal visible={settings} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: C.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: C.text }]}>Team Settings</Text>
              <TouchableOpacity onPress={() => setSettings(false)}>
                <Text style={{ fontSize: 24, color: C.muted }}>×</Text>
              </TouchableOpacity>
            </View>
            <Text style={[styles.modalSub, { color: C.muted }]}>
              Reassign teams and set accrual rates.
            </Text>
            <ScrollView>
              {members.map(m => (
                <View key={m.id}
                  style={[styles.settingsRow, { backgroundColor: C.bg, borderColor: C.border }]}>
                  <View style={[styles.avatar, { backgroundColor:
                    teams.find(t => t.id === m.team_id)?.color ?? '#6B7280' }]}>
                    <Text style={styles.avatarText}>{initials(m.full_name)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.memberName, { color: C.text }]}>{m.full_name}</Text>
                    <View style={styles.settingsBtns}>
                      {teams.map(t => (
                        <TouchableOpacity key={t.id}
                          style={[styles.teamPill,
                            { borderColor: t.color,
                              backgroundColor: m.team_id === t.id ? t.color : 'transparent' }]}
                          onPress={() => updateTeam(m.id, t.id)}>
                          <Text style={[styles.teamPillText,
                            { color: m.team_id === t.id ? 'white' : t.color }]}>
                            {t.name}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <View style={styles.settingsBtns}>
                      {[1.5, 2.0, 2.5].map(r => (
                        <TouchableOpacity key={r}
                          style={[styles.ratePill,
                            { borderColor: C.accent,
                              backgroundColor: m.accrual_rate === r ? C.accent : 'transparent' }]}
                          onPress={() => updateAccrual(m.id, r)}>
                          <Text style={[styles.ratePillText,
                            { color: m.accrual_rate === r ? 'white' : C.accent }]}>
                            {r}d
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                </View>
              ))}
            </ScrollView>
            <TouchableOpacity
              style={[styles.saveBtn, { backgroundColor: C.nav }]}
              onPress={() => setSettings(false)}>
              <Text style={styles.saveBtnText}>Done</Text>
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
  headerRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  title:         { fontSize: 24, fontWeight: '800', color: 'white', letterSpacing: -0.5 },
  subtitle:      { fontSize: 13, color: 'rgba(255,255,255,0.4)', marginTop: 2 },
  headerBtns:    { flexDirection: 'row', gap: 6, marginTop: 4 },
  toggleBtn:     { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  toggleBtnText: { color: 'white', fontSize: 11, fontWeight: '600' },
  scroll:        { padding: 16, paddingBottom: 40 },
  teamSection:   { marginBottom: 16 },
  teamHeader:    { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 8 },
  teamDot:       { width: 10, height: 10, borderRadius: 5 },
  teamName:      { fontSize: 15, fontWeight: '700' },
  teamCount:     { fontSize: 12 },
  card:          { borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
  memberRow:     { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  avatar:        { width: 36, height: 36, borderRadius: 18,
                   alignItems: 'center', justifyContent: 'center' },
  avatarText:    { color: 'white', fontSize: 12, fontWeight: '700' },
  memberName:    { fontSize: 14, fontWeight: '600' },
  memberRole:    { fontSize: 11, marginTop: 1 },
  modalOverlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalBox:      { borderRadius: 24, padding: 22, paddingBottom: 36, maxHeight: '85%' },
  modalHeader:   { flexDirection: 'row', justifyContent: 'space-between',
                   alignItems: 'center', marginBottom: 6 },
  modalTitle:    { fontSize: 18, fontWeight: '800' },
  modalSub:      { fontSize: 12, marginBottom: 16 },
  settingsRow:   { borderRadius: 12, padding: 12, borderWidth: 1,
                   marginBottom: 8, flexDirection: 'row', gap: 10 },
  settingsBtns:  { flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap' },
  teamPill:      { paddingHorizontal: 8, paddingVertical: 3,
                   borderRadius: 20, borderWidth: 1 },
  teamPillText:  { fontSize: 11, fontWeight: '600' },
  ratePill:      { paddingHorizontal: 10, paddingVertical: 3,
                   borderRadius: 20, borderWidth: 1 },
  ratePillText:  { fontSize: 11, fontWeight: '600' },
  saveBtn:       { borderRadius: 12, paddingVertical: 13,
                   alignItems: 'center', marginTop: 10 },
  saveBtnText:   { color: 'white', fontSize: 15, fontWeight: '700' },
});