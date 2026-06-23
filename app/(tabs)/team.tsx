import { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, useColorScheme, Modal, Alert,
} from 'react-native';
import { supabase }  from '../../lib/supabase';
import { useAuth }   from '../../hooks/useAuth';
import { Colors }    from '../../constants/colors';
import { hoursBetween } from '../../lib/helpers';
import type { Profile, Team, Workweek } from '../../lib/types';

const MONTHS = ['January','February','March','April','May','June',
  'July','August','September','October','November','December'];

interface MonthLog {
  user_id:    string;
  type:       string;
  start_time: string | null;
  end_time:   string | null;
}

export default function TeamScreen() {
  const scheme      = useColorScheme();
  const C           = Colors[scheme as 'light' | 'dark' ?? 'light'];
  const { profile } = useAuth();

  const [members,   setMembers]   = useState<Profile[]>([]);
  const [teams,     setTeams]     = useState<Team[]>([]);
  const [monthLogs, setMonthLogs] = useState<MonthLog[]>([]);
  const [showAll,   setShowAll]   = useState(false);
  const [settings,  setSettings]  = useState(false);

  const isMgr = profile?.role === 'manager' || profile?.role === 'hr-admin';
  const now   = new Date();
  const monthName = MONTHS[now.getMonth()];

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    const { data: t } = await supabase.from('teams').select('*');
    const { data: m } = await supabase.from('profiles').select('*, team:teams(*)');

    const y  = now.getFullYear(), mo = now.getMonth() + 1;
    const ms = `${y}-${String(mo).padStart(2,'0')}-01`;
    const me = `${y}-${String(mo).padStart(2,'0')}-${new Date(y, mo, 0).getDate()}`;
    // RLS scopes this: hr-admin sees everyone, a manager sees their own team.
    const { data: wl } = await supabase
      .from('work_logs')
      .select('user_id, type, start_time, end_time')
      .gte('date', ms).lte('date', me);

    if (t)  setTeams(t as Team[]);
    if (m)  setMembers(m as Profile[]);
    if (wl) setMonthLogs(wl as MonthLog[]);
  };

  const adminUpdate = async (userId: string, fields: {
    p_team_id?: string; p_accrual?: number; p_workweek?: Workweek;
  }) => {
    const { error } = await supabase.rpc('admin_update_profile', {
      p_user_id: userId, ...fields,
    });
    if (error) Alert.alert('Error', error.message);
    fetchData();
  };

  const updateTeam     = (userId: string, teamId: string)     => adminUpdate(userId, { p_team_id: teamId });
  const updateAccrual  = (userId: string, rate: number)       => adminUpdate(userId, { p_accrual: rate });
  const updateWorkweek = (userId: string, workweek: Workweek) => adminUpdate(userId, { p_workweek: workweek });

  const setWorkTracking = async (m: Profile, opts: { track?: boolean; daily?: number }) => {
    const { error } = await supabase.rpc('set_work_tracking', {
      p_user_id:     m.id,
      p_track_hours: opts.track ?? m.track_hours,
      p_daily_hours: opts.daily ?? m.daily_hours,
    });
    if (error) Alert.alert('Error', error.message);
    fetchData();
  };

  // Worked hours / overtime for one member this month.
  const overtimeFor = (m: Profile) => {
    const ml = monthLogs.filter(l =>
      l.user_id === m.id && (l.type === 'office' || l.type === 'home'));
    const worked = ml.reduce((s, l) => {
      const h = hoursBetween(l.start_time, l.end_time);
      if (h !== null) return s + h;                              // tracked day
      if (!l.start_time && !l.end_time) return s + m.daily_hours; // whole-day mark
      return s;                                                   // open shift
    }, 0);
    const expected = ml.length * m.daily_hours;
    return { worked, expected, ot: worked - expected, days: ml.length };
  };

  const visibleTeams = isMgr && showAll
    ? teams
    : teams.filter(t => t.id === profile?.team_id);

  const visibleMembers = members.filter(m => visibleTeams.some(t => t.id === m.team_id));
  const orgWorked = visibleMembers.reduce((s, m) => s + overtimeFor(m).worked, 0);
  const orgOt     = visibleMembers.reduce((s, m) => s + overtimeFor(m).ot, 0);
  const fmtOt = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(1)}h`;

  const initials = (name: string) =>
    name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

  return (
    <View style={[styles.root, { backgroundColor: C.bg }]}>
      <View style={[styles.header, { backgroundColor: C.nav }]}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>Team</Text>
            <Text style={styles.subtitle}>Presence & working time</Text>
          </View>
          {isMgr && (
            <View style={styles.headerBtns}>
              <TouchableOpacity
                style={[styles.toggleBtn,
                  { borderColor: showAll ? '#E05C2A' : 'rgba(255,255,255,0.2)',
                    backgroundColor: showAll ? '#E05C2A' : 'transparent' }]}
                onPress={() => setShowAll(s => !s)}>
                <Text style={styles.toggleBtnText}>{showAll ? 'All office' : 'My team'}</Text>
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
        {/* Overtime summary (org when "All office", otherwise the visible team) */}
        {isMgr && (
          <View style={styles.otCard}>
            <Text style={styles.otLabel}>
              OVERTIME · {monthName.toUpperCase()} · {showAll ? 'ORGANIZATION' : 'MY TEAM'}
            </Text>
            <Text style={styles.otBig}>
              {fmtOt(orgOt)}<Text style={styles.otUnit}> this month</Text>
            </Text>
            <Text style={styles.otSub}>
              {orgWorked.toFixed(1)} h worked across {visibleMembers.length} {visibleMembers.length === 1 ? 'person' : 'people'}
            </Text>
          </View>
        )}

        {visibleTeams.map(team => {
          const teamMembers = members.filter(m => m.team_id === team.id);
          const teamOt = teamMembers.reduce((s, m) => s + overtimeFor(m).ot, 0);
          return (
            <View key={team.id} style={styles.teamSection}>
              <View style={styles.teamHeader}>
                <View style={[styles.teamDot, { backgroundColor: team.color }]} />
                <Text style={[styles.teamName, { color: C.text }]}>{team.name}</Text>
                <Text style={[styles.teamCount, { color: C.muted }]}>({teamMembers.length})</Text>
                {isMgr && teamMembers.length > 0 && (
                  <Text style={[styles.teamCount, { color: C.muted }]}> · {fmtOt(teamOt)} OT</Text>
                )}
              </View>
              <View style={[styles.card, { backgroundColor: C.card, borderColor: C.border }]}>
                {teamMembers.map((m, i) => {
                  const roleLabel = m.role === 'hr-admin' ? 'HR Admin'
                    : m.role === 'manager' ? 'Manager' : 'Employee';
                  const o = overtimeFor(m);
                  return (
                    <View key={m.id} style={[styles.memberRow,
                      i < teamMembers.length - 1 && { borderBottomWidth: 1, borderBottomColor: C.border }]}>
                      <View style={[styles.avatar, { backgroundColor: team.color }]}>
                        <Text style={styles.avatarText}>{initials(m.full_name)}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.memberName, { color: C.text }]}>{m.full_name}</Text>
                        <Text style={[styles.memberRole, { color: C.muted }]}>
                          {roleLabel}
                          {isMgr ? ` · ${m.accrual_rate}d/mo · ${m.workweek === 'mon-sun' ? 'Mon–Sun' : 'Mon–Fri'}` : ''}
                        </Text>
                        {isMgr && (
                          <Text style={[styles.memberOt, { color: C.muted }]}>
                            {o.worked.toFixed(1)}h worked · {fmtOt(o.ot)} · {m.track_hours ? `tracked, ${m.daily_hours}h/day` : `whole-day, ${m.daily_hours}h`}
                          </Text>
                        )}
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
              Set team, accrual, workweek, and working-time tracking per user.
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

                    <Text style={[styles.fieldLabel, { color: C.muted }]}>TEAM</Text>
                    <View style={styles.settingsBtns}>
                      {teams.map(t => (
                        <TouchableOpacity key={t.id}
                          style={[styles.teamPill,
                            { borderColor: t.color,
                              backgroundColor: m.team_id === t.id ? t.color : 'transparent' }]}
                          onPress={() => updateTeam(m.id, t.id)}>
                          <Text style={[styles.teamPillText,
                            { color: m.team_id === t.id ? 'white' : t.color }]}>{t.name}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    <Text style={[styles.fieldLabel, { color: C.muted }]}>ACCRUAL (DAYS/MONTH)</Text>
                    <View style={styles.settingsBtns}>
                      {[1.5, 2.0, 2.5].map(r => (
                        <TouchableOpacity key={r}
                          style={[styles.ratePill,
                            { borderColor: C.accent,
                              backgroundColor: m.accrual_rate === r ? C.accent : 'transparent' }]}
                          onPress={() => updateAccrual(m.id, r)}>
                          <Text style={[styles.ratePillText,
                            { color: m.accrual_rate === r ? 'white' : C.accent }]}>{r}d</Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    <Text style={[styles.fieldLabel, { color: C.muted }]}>WORKWEEK</Text>
                    <View style={styles.settingsBtns}>
                      {([
                        { id: 'mon-fri', label: 'Mon–Fri' },
                        { id: 'mon-sun', label: 'Mon–Sun' },
                      ] as { id: Workweek; label: string }[]).map(w => (
                        <TouchableOpacity key={w.id}
                          style={[styles.ratePill,
                            { borderColor: C.accent,
                              backgroundColor: m.workweek === w.id ? C.accent : 'transparent' }]}
                          onPress={() => updateWorkweek(m.id, w.id)}>
                          <Text style={[styles.ratePillText,
                            { color: m.workweek === w.id ? 'white' : C.accent }]}>{w.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    <Text style={[styles.fieldLabel, { color: C.muted }]}>WORK TRACKING</Text>
                    <View style={styles.settingsBtns}>
                      {([
                        { v: false, label: 'Whole day' },
                        { v: true,  label: 'Track hours' },
                      ]).map(o => (
                        <TouchableOpacity key={String(o.v)}
                          style={[styles.ratePill,
                            { borderColor: C.accent,
                              backgroundColor: m.track_hours === o.v ? C.accent : 'transparent' }]}
                          onPress={() => setWorkTracking(m, { track: o.v })}>
                          <Text style={[styles.ratePillText,
                            { color: m.track_hours === o.v ? 'white' : C.accent }]}>{o.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    <Text style={[styles.fieldLabel, { color: C.muted }]}>FULL DAY (HOURS)</Text>
                    <View style={styles.settingsBtns}>
                      {[7, 7.5, 8].map(h => (
                        <TouchableOpacity key={h}
                          style={[styles.ratePill,
                            { borderColor: C.accent,
                              backgroundColor: m.daily_hours === h ? C.accent : 'transparent' }]}
                          onPress={() => setWorkTracking(m, { daily: h })}>
                          <Text style={[styles.ratePillText,
                            { color: m.daily_hours === h ? 'white' : C.accent }]}>{h}h</Text>
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
  otCard:        { backgroundColor: '#192A3A', borderRadius: 16, padding: 18, marginBottom: 16 },
  otLabel:       { fontSize: 11, color: 'rgba(255,255,255,0.5)', letterSpacing: 0.5, marginBottom: 6 },
  otBig:         { fontSize: 32, fontWeight: '800', color: 'white', letterSpacing: -1 },
  otUnit:        { fontSize: 15, fontWeight: '400', opacity: 0.55 },
  otSub:         { fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 4 },
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
  memberOt:      { fontSize: 11, marginTop: 2, fontWeight: '600' },
  modalOverlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalBox:      { borderRadius: 24, padding: 22, paddingBottom: 36, maxHeight: '90%' },
  modalHeader:   { flexDirection: 'row', justifyContent: 'space-between',
                   alignItems: 'center', marginBottom: 6 },
  modalTitle:    { fontSize: 18, fontWeight: '800' },
  modalSub:      { fontSize: 12, marginBottom: 16 },
  settingsRow:   { borderRadius: 12, padding: 12, borderWidth: 1,
                   marginBottom: 8, flexDirection: 'row', gap: 10 },
  fieldLabel:    { fontSize: 9, fontWeight: '700', letterSpacing: 0.5, marginTop: 8, marginBottom: 4 },
  settingsBtns:  { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  teamPill:      { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, borderWidth: 1 },
  teamPillText:  { fontSize: 11, fontWeight: '600' },
  ratePill:      { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20, borderWidth: 1 },
  ratePillText:  { fontSize: 11, fontWeight: '600' },
  saveBtn:       { borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginTop: 10 },
  saveBtnText:   { color: 'white', fontSize: 15, fontWeight: '700' },
});
