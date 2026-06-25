import { useState, useEffect, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, useColorScheme, Modal, TextInput,
} from 'react-native';
import { supabase }  from '../../lib/supabase';
import { useAuth }   from '../../hooks/useAuth';
import { Colors }    from '../../constants/colors';
import type { Theme } from '../../constants/colors';
import {
  minutesToHoursLabel, paidMinutes,
  overtimeMinutes, formatSignedHm,
} from '../../lib/helpers';
import type { Profile, Team, Workweek, HoursMode } from '../../lib/types';

// Shared work-hours controls — reused for per-user rows and the bulk-per-team block.
const WORKDAY_PRESETS = [450, 480];      // 7.5h, 8h (presence incl. lunch)
const LUNCH_PRESETS   = [0, 30, 45, 60];

function HoursControls({
  C, mode, workdayMin, lunchMin, onMode, onWorkday, onLunch,
}: {
  C:          Theme;
  mode:       HoursMode;
  workdayMin: number;
  lunchMin:   number;
  onMode:     (m: HoursMode) => void;
  onWorkday:  (min: number) => void;
  onLunch:    (min: number) => void;
}) {
  const [custom, setCustom] = useState('');
  const isPreset = WORKDAY_PRESETS.includes(workdayMin);

  const commitCustom = () => {
    const h = parseFloat(custom.replace(',', '.'));
    if (h > 0 && h <= 24) onWorkday(Math.round(h * 60));
    setCustom('');
  };

  return (
    <>
      <Text style={[styles.fieldLabel, { color: C.muted }]}>WORK HOURS MODE</Text>
      <View style={styles.settingsBtns}>
        {([
          { id: 'set',     label: 'Set work time' },
          { id: 'rolling', label: 'Rolling' },
        ] as { id: HoursMode; label: string }[]).map(o => (
          <TouchableOpacity key={o.id}
            style={[styles.ratePill,
              { borderColor: C.accent,
                backgroundColor: mode === o.id ? C.accent : 'transparent' }]}
            onPress={() => onMode(o.id)}>
            <Text style={[styles.ratePillText,
              { color: mode === o.id ? 'white' : C.accent }]}>{o.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={[styles.fieldLabel, { color: C.muted }]}>WORKDAY LENGTH (incl. lunch)</Text>
      <View style={styles.settingsBtns}>
        {WORKDAY_PRESETS.map(p => (
          <TouchableOpacity key={p}
            style={[styles.ratePill,
              { borderColor: C.accent,
                backgroundColor: workdayMin === p ? C.accent : 'transparent' }]}
            onPress={() => onWorkday(p)}>
            <Text style={[styles.ratePillText,
              { color: workdayMin === p ? 'white' : C.accent }]}>
              {minutesToHoursLabel(p)}
            </Text>
          </TouchableOpacity>
        ))}
        {!isPreset && (
          <View style={[styles.ratePill, { borderColor: C.accent, backgroundColor: C.accent }]}>
            <Text style={[styles.ratePillText, { color: 'white' }]}>
              {minutesToHoursLabel(workdayMin)}
            </Text>
          </View>
        )}
        <TextInput
          style={[styles.customInput, { borderColor: C.border, color: C.text }]}
          placeholder="Custom h"
          placeholderTextColor={C.muted}
          keyboardType="decimal-pad"
          value={custom}
          onChangeText={setCustom}
          onSubmitEditing={commitCustom}
          onBlur={commitCustom}
        />
      </View>

      <Text style={[styles.fieldLabel, { color: C.muted }]}>LUNCH BREAK</Text>
      <View style={styles.settingsBtns}>
        {LUNCH_PRESETS.map(l => (
          <TouchableOpacity key={l}
            style={[styles.ratePill,
              { borderColor: C.accent,
                backgroundColor: lunchMin === l ? C.accent : 'transparent' }]}
            onPress={() => onLunch(l)}>
            <Text style={[styles.ratePillText,
              { color: lunchMin === l ? 'white' : C.accent }]}>{l}m</Text>
          </TouchableOpacity>
        ))}
      </View>
    </>
  );
}

export default function TeamScreen() {
  const scheme      = useColorScheme();
  const C           = Colors[scheme as 'light' | 'dark' ?? 'light'];
  const { profile } = useAuth();

  const [members,   setMembers]   = useState<Profile[]>([]);
  const [teams,     setTeams]     = useState<Team[]>([]);
  const [otLogs,    setOtLogs]    = useState<{ user_id: string; worked_minutes: number | null; ended_at: string | null }[]>([]);
  const [showAll,   setShowAll]   = useState(false);
  const [settings,  setSettings]  = useState(false);

  // Bulk-per-team work-hours selection (HR only)
  const [bulkTeam,    setBulkTeam]    = useState<string | null>(null);
  const [bulkMode,    setBulkMode]    = useState<HoursMode>('set');
  const [bulkWorkday, setBulkWorkday] = useState(480);
  const [bulkLunch,   setBulkLunch]   = useState(30);

  const isMgr = profile?.role === 'manager' || profile?.role === 'hr-admin';
  const isHr  = profile?.role === 'hr-admin';

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    const { data: t } = await supabase.from('teams').select('*');
    const { data: m } = await supabase
      .from('profiles')
      .select('*, team:teams(*)');
    if (t) setTeams(t as Team[]);
    if (m) setMembers(m as Profile[]);

    // Overtime source data — RLS limits this to the rows the viewer may see
    // (hr-admin: everyone; manager: their team; employee: only self).
    const { data: l } = await supabase
      .from('work_logs')
      .select('user_id, worked_minutes, ended_at')
      .not('ended_at', 'is', null);
    if (l) setOtLogs(l as any[]);
  };

  // Net overtime per user (rolling-mode members only), vs each member's standard day.
  const otByUser = useMemo(() => {
    const map: Record<string, number> = {};
    members.forEach(m => {
      if (m.hours_mode !== 'rolling') return;
      const mine     = otLogs.filter(l => l.user_id === m.id);
      const standard = paidMinutes(m.workday_minutes, m.lunch_minutes);
      map[m.id] = overtimeMinutes(mine, standard);
    });
    return map;
  }, [members, otLogs]);

  const teamOvertime = (teamId: string) =>
    members
      .filter(m => m.team_id === teamId && m.hours_mode === 'rolling')
      .reduce((sum, m) => sum + (otByUser[m.id] ?? 0), 0);

  const updateTeam = async (userId: string, teamId: string) => {
    await supabase.from('profiles').update({ team_id: teamId }).eq('id', userId);
    fetchData();
  };

  const updateAccrual = async (userId: string, rate: number) => {
    await supabase.from('profiles').update({ accrual_rate: rate }).eq('id', userId);
    fetchData();
  };

  const updateWorkweek = async (userId: string, workweek: Workweek) => {
    await supabase.from('profiles').update({ workweek }).eq('id', userId);
    fetchData();
  };

  const updateHours = async (userId: string, patch: Partial<Profile>) => {
    await supabase.from('profiles').update(patch).eq('id', userId);
    fetchData();
  };

  const bulkApplyHours = async () => {
    if (!bulkTeam) return;
    await supabase.from('profiles')
      .update({ hours_mode: bulkMode, workday_minutes: bulkWorkday, lunch_minutes: bulkLunch })
      .eq('team_id', bulkTeam);
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
                {isMgr && teamMembers.some(m => m.hours_mode === 'rolling') && (() => {
                  const ot = teamOvertime(team.id);
                  return (
                    <Text style={[styles.teamOt,
                      { color: ot >= 0 ? '#2E7D32' : '#C62828' }]}>
                      ⏱ {formatSignedHm(ot)} OT
                    </Text>
                  );
                })()}
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
                          {isMgr ? ` · ${m.accrual_rate}d/mo · ${m.workweek === 'mon-sun' ? 'Mon–Sun' : 'Mon–Fri'}` : ''}
                          {isMgr ? ` · ${m.hours_mode === 'rolling' ? 'Rolling' : 'Set'} ${minutesToHoursLabel(m.workday_minutes)}` : ''}
                        </Text>
                      </View>
                      {isMgr && m.hours_mode === 'rolling' && (
                        <View style={[styles.otBadge,
                          { backgroundColor: (otByUser[m.id] ?? 0) >= 0 ? '#E8F5E9' : '#FFEBEE' }]}>
                          <Text style={[styles.otBadgeText,
                            { color: (otByUser[m.id] ?? 0) >= 0 ? '#2E7D32' : '#C62828' }]}>
                            {formatSignedHm(otByUser[m.id] ?? 0)}
                          </Text>
                          <Text style={styles.otBadgeLabel}>OT</Text>
                        </View>
                      )}
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
              Set team, vacation accrual, workweek, and work hours per user.
            </Text>
            <ScrollView>

              {/* Bulk apply work hours to an entire team (HR only) */}
              {isHr && (
                <View style={[styles.bulkBox, { backgroundColor: C.bg, borderColor: C.accent }]}>
                  <Text style={[styles.bulkTitle, { color: C.text }]}>
                    ⚡ Bulk-set work hours for a team
                  </Text>
                  <Text style={[styles.fieldLabel, { color: C.muted }]}>TEAM</Text>
                  <View style={styles.settingsBtns}>
                    {teams.map(t => (
                      <TouchableOpacity key={t.id}
                        style={[styles.teamPill,
                          { borderColor: t.color,
                            backgroundColor: bulkTeam === t.id ? t.color : 'transparent' }]}
                        onPress={() => setBulkTeam(t.id)}>
                        <Text style={[styles.teamPillText,
                          { color: bulkTeam === t.id ? 'white' : t.color }]}>{t.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <HoursControls
                    C={C}
                    mode={bulkMode}
                    workdayMin={bulkWorkday}
                    lunchMin={bulkLunch}
                    onMode={setBulkMode}
                    onWorkday={setBulkWorkday}
                    onLunch={setBulkLunch}
                  />

                  <TouchableOpacity
                    style={[styles.bulkApplyBtn,
                      { backgroundColor: bulkTeam ? C.accent : C.border }]}
                    disabled={!bulkTeam}
                    onPress={bulkApplyHours}>
                    <Text style={styles.bulkApplyText}>
                      {bulkTeam
                        ? `Apply to all in ${teams.find(t => t.id === bulkTeam)?.name}`
                        : 'Pick a team first'}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

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
                            { color: m.team_id === t.id ? 'white' : t.color }]}>
                            {t.name}
                          </Text>
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
                            { color: m.accrual_rate === r ? 'white' : C.accent }]}>
                            {r}d
                          </Text>
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
                            { color: m.workweek === w.id ? 'white' : C.accent }]}>
                            {w.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    {isHr && (
                      <HoursControls
                        C={C}
                        mode={m.hours_mode}
                        workdayMin={m.workday_minutes}
                        lunchMin={m.lunch_minutes}
                        onMode={v => updateHours(m.id, { hours_mode: v })}
                        onWorkday={v => updateHours(m.id, { workday_minutes: v })}
                        onLunch={v => updateHours(m.id, { lunch_minutes: v })}
                      />
                    )}
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
  teamOt:        { fontSize: 12, fontWeight: '700', marginLeft: 'auto' },
  otBadge:       { alignItems: 'center', borderRadius: 8,
                   paddingHorizontal: 8, paddingVertical: 3, minWidth: 52 },
  otBadgeText:   { fontSize: 12, fontWeight: '800' },
  otBadgeLabel:  { fontSize: 8, fontWeight: '700', color: '#90A4AE', letterSpacing: 0.5 },
  card:          { borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
  memberRow:     { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  avatar:        { width: 36, height: 36, borderRadius: 18,
                   alignItems: 'center', justifyContent: 'center' },
  avatarText:    { color: 'white', fontSize: 12, fontWeight: '700' },
  memberName:    { fontSize: 14, fontWeight: '600' },
  memberRole:    { fontSize: 11, marginTop: 1 },
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
  teamPill:      { paddingHorizontal: 8, paddingVertical: 3,
                   borderRadius: 20, borderWidth: 1 },
  teamPillText:  { fontSize: 11, fontWeight: '600' },
  ratePill:      { paddingHorizontal: 10, paddingVertical: 3,
                   borderRadius: 20, borderWidth: 1 },
  ratePillText:  { fontSize: 11, fontWeight: '600' },
  customInput:   { minWidth: 64, paddingHorizontal: 10, paddingVertical: 3,
                   borderRadius: 20, borderWidth: 1, fontSize: 11 },
  bulkBox:       { borderRadius: 12, padding: 12, borderWidth: 1,
                   borderStyle: 'dashed', marginBottom: 12 },
  bulkTitle:     { fontSize: 13, fontWeight: '800', marginBottom: 4 },
  bulkApplyBtn:  { borderRadius: 10, paddingVertical: 11,
                   alignItems: 'center', marginTop: 12 },
  bulkApplyText: { color: 'white', fontSize: 13, fontWeight: '700' },
  saveBtn:       { borderRadius: 12, paddingVertical: 13,
                   alignItems: 'center', marginTop: 10 },
  saveBtnText:   { color: 'white', fontSize: 15, fontWeight: '700' },
});