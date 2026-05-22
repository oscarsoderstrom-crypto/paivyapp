import { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, useColorScheme, Modal,
  TextInput, Alert,
} from 'react-native';
import { supabase }          from '../../lib/supabase';
import { useAuth }           from '../../hooks/useAuth';
import { Colors }            from '../../constants/colors';
import {
  getVacationBalance, countWorkdays,
  statusBg, statusColor, getCalendarCells,
  isWeekend, isHoliday,
} from '../../lib/helpers';
import { FI_HOLIDAYS }       from '../../constants/holidays';
import type { VacationRequest } from '../../lib/types';

const MONTHS = ['January','February','March','April','May','June',
  'July','August','September','October','November','December'];
const MS = ['Jan','Feb','Mar','Apr','May','Jun',
            'Jul','Aug','Sep','Oct','Nov','Dec'];

export default function VacationScreen() {
  const scheme      = useColorScheme();
  const C           = Colors[scheme as 'light' | 'dark' ?? 'light'];
  const { profile } = useAuth();

  const [vacations, setVacations] = useState<VacationRequest[]>([]);
  const [view,      setView]      = useState<'personal' | 'team' | 'office'>('personal');
  const [modal,     setModal]     = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate,   setEndDate]   = useState('');
  const [year,      setYear]      = useState(new Date().getFullYear());
  const [month,     setMonth]     = useState(new Date().getMonth() + 1);

  useEffect(() => { if (profile) fetchVacations(); }, [profile]);

  const fetchVacations = async () => {
    const { data } = await supabase
      .from('vacation_requests')
      .select('*, profile:profiles(full_name, team_id, team:teams(name,color))')
      .order('start_date');
    if (data) setVacations(data as VacationRequest[]);
  };

  const submitRequest = async () => {
    if (!startDate || !endDate) { Alert.alert('Please enter both dates'); return; }
    if (startDate > endDate)    { Alert.alert('Start date must be before end date'); return; }
    const wd = countWorkdays(startDate, endDate);
    if (bal && wd > bal.remaining) {
      Alert.alert('Not enough vacation days', `You have ${bal.remaining} days left but this request needs ${wd}.`);
      return;
    }
    await supabase.from('vacation_requests').insert({
      user_id:    profile!.id,
      start_date: startDate,
      end_date:   endDate,
      type:       'paid',
      status:     'pending',
    });
    setModal(false); setStartDate(''); setEndDate('');
    fetchVacations();
  };

  const approveReject = async (id: string, status: 'approved' | 'rejected') => {
    await supabase.from('vacation_requests').update({
      status, reviewed_by: profile!.id,
    }).eq('id', id);
    fetchVacations();
  };

  const bal     = profile ? getVacationBalance(profile.id, vacations, profile.accrual_rate) : null;
  const myVacs  = vacations.filter(v => v.user_id === profile?.id);
  const pending = vacations.filter(v => v.status === 'pending');

  const prevMonth = () => { if (month===1){setYear(y=>y-1);setMonth(12);}else setMonth(m=>m-1); };
  const nextMonth = () => { if (month===12){setYear(y=>y+1);setMonth(1);}else setMonth(m=>m+1); };

  const cells   = getCalendarCells(year, month);
  const myVacMap: Record<string, string> = {};
  myVacs.forEach(v => {
    const d = new Date(v.start_date + 'T12:00:00');
    const e = new Date(v.end_date   + 'T12:00:00');
    while (d <= e) {
      const key = d.toISOString().split('T')[0];
      myVacMap[key] = v.status;
      d.setDate(d.getDate() + 1);
    }
  });

  return (
    <View style={[styles.root, { backgroundColor: C.bg }]}>
      <View style={[styles.header, { backgroundColor: C.nav }]}>
        <Text style={styles.title}>Vacation Planner</Text>
        <Text style={styles.subtitle}>Finnish Annual Holidays Act · April 1 reset</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>

        {/* Balance card */}
        {bal && (
          <View style={styles.balCard}>
            <Text style={styles.balLabel}>
              BALANCE · 2024–2025 · {profile?.accrual_rate}d/month
            </Text>
            <Text style={styles.balDays}>
              {bal.remaining}
              <Text style={styles.balSub}> days left</Text>
            </Text>
            <Text style={styles.balUsed}>{bal.used} used of {bal.total} total</Text>
            <View style={styles.barBg}>
              <View style={[styles.barFill,
                { width: `${Math.min((bal.used / bal.total) * 100, 100)}%` as any }]} />
            </View>
          </View>
        )}

        {/* View tabs */}
        <View style={[styles.tabRow, { backgroundColor: C.card, borderColor: C.border }]}>
          {(['personal', 'team', 'office'] as const).map(t => (
            <TouchableOpacity key={t}
              style={[styles.tab, view === t && { backgroundColor: C.nav }]}
              onPress={() => setView(t)}>
              <Text style={[styles.tabText, { color: view === t ? 'white' : C.muted }]}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Personal calendar */}
        {view === 'personal' && (
          <View style={[styles.calCard, { backgroundColor: C.card, borderColor: C.border }]}>
            <View style={styles.monthNav}>
              <TouchableOpacity onPress={prevMonth}
                style={[styles.navBtn, { borderColor: C.border }]}>
                <Text style={{ color: C.text, fontSize: 18 }}>‹</Text>
              </TouchableOpacity>
              <Text style={[styles.monthLabel, { color: C.text }]}>
                {MONTHS[month - 1]} {year}
              </Text>
              <TouchableOpacity onPress={nextMonth}
                style={[styles.navBtn, { borderColor: C.border }]}>
                <Text style={{ color: C.text, fontSize: 18 }}>›</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.dayHeaders}>
              {['Mo','Tu','We','Th','Fr','Sa','Su'].map(d => (
                <Text key={d} style={[styles.dayHeader, { color: C.muted }]}>{d}</Text>
              ))}
            </View>
            <View style={styles.grid}>
              {cells.map((d: string | null, i: number) => {
                if (!d) return <View key={'e' + i} style={styles.cell} />;
                const we  = isWeekend(d);
                const hol = isHoliday(d);
                const vs  = myVacMap[d];
                const dn  = new Date(d + 'T12:00:00').getDate();
                return (
                  <View key={d} style={[styles.cell, {
                    backgroundColor: hol ? C.hol : we ? C.sub
                      : vs ? statusBg(vs) : C.card,
                    borderColor: C.border,
                  }]}>
                    <Text style={[styles.cellNum, {
                      color: hol ? '#B45309' : we ? C.muted : C.text,
                    }]}>{dn}</Text>
                    {vs && !hol && (
                      <View style={[styles.dot, { backgroundColor: statusColor(vs) }]} />
                    )}
                    {hol && (
                      <Text style={styles.holLabel} numberOfLines={1}>
                        {FI_HOLIDAYS[d].split(' ')[0].substring(0, 6)}
                      </Text>
                    )}
                  </View>
                );
              })}
            </View>
            <Text style={[styles.calHint, { color: C.muted }]}>
              🟢 Approved · 🟡 Pending · 🔴 Rejected
            </Text>
          </View>
        )}

        {/* Team / Office placeholder */}
        {view !== 'personal' && (
          <View style={[styles.placeholder, { backgroundColor: C.card, borderColor: C.border }]}>
            <Text style={{ color: C.muted, textAlign: 'center', fontSize: 13 }}>
              {view === 'team' ? '👥 Team timeline' : '🏢 Office timeline'}{'\n'}
              Coming soon
            </Text>
          </View>
        )}

        {/* Request button */}
        <TouchableOpacity style={styles.reqBtn} onPress={() => setModal(true)}>
          <Text style={styles.reqBtnText}>+ Request Vacation</Text>
        </TouchableOpacity>

        {/* My requests */}
        <Text style={[styles.sectionTitle, { color: C.text }]}>My Requests</Text>
        {myVacs.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: C.card, borderColor: C.border }]}>
            <Text style={{ color: C.muted, textAlign: 'center' }}>
              No requests yet
            </Text>
          </View>
        ) : myVacs.map(v => (
          <View key={v.id}
            style={[styles.reqCard, { backgroundColor: C.card, borderColor: C.border }]}>
            <View style={styles.reqRow}>
              <View>
                <Text style={[styles.reqDates, { color: C.text }]}>
                  {v.start_date} → {v.end_date}
                </Text>
                <Text style={[styles.reqDays, { color: C.muted }]}>
                  {countWorkdays(v.start_date, v.end_date)} working days · Paid
                </Text>
              </View>
              <View style={[styles.badge, { backgroundColor: statusBg(v.status) }]}>
                <Text style={[styles.badgeText, { color: statusColor(v.status) }]}>
                  {v.status.charAt(0).toUpperCase() + v.status.slice(1)}
                </Text>
              </View>
            </View>
          </View>
        ))}

        {/* HR approval queue */}
        {profile?.role === 'hr-admin' && pending.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { color: C.text, marginTop: 8 }]}>
              Pending Approvals ({pending.length})
            </Text>
            {pending.map(v => (
              <View key={v.id}
                style={[styles.reqCard, { backgroundColor: C.card, borderColor: '#FFD54F' }]}>
                <Text style={[styles.reqDates, { color: C.text }]}>
                  {(v.profile as any)?.full_name}
                </Text>
                <Text style={[styles.reqDays, { color: C.muted }]}>
                  {v.start_date} → {v.end_date} · {countWorkdays(v.start_date, v.end_date)} days
                </Text>
                <View style={styles.approveBtns}>
                  <TouchableOpacity
                    style={[styles.approveBtn, { backgroundColor: C.green }]}
                    onPress={() => approveReject(v.id, 'approved')}>
                    <Text style={styles.approveBtnText}>✓ Approve</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.approveBtn, { backgroundColor: C.red }]}
                    onPress={() => approveReject(v.id, 'rejected')}>
                    <Text style={styles.approveBtnText}>✗ Reject</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </>
        )}
      </ScrollView>

      {/* Request modal */}
      <Modal visible={modal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: C.card }]}>
            <Text style={[styles.modalTitle, { color: C.text }]}>Request Vacation</Text>
            <Text style={[styles.modalLabel, { color: C.muted }]}>START DATE (YYYY-MM-DD)</Text>
            <TextInput
              style={[styles.modalInput, { borderColor: C.border, color: C.text, backgroundColor: C.bg }]}
              value={startDate}
              onChangeText={setStartDate}
              placeholder="2025-06-16"
              placeholderTextColor={C.muted}
            />
            <Text style={[styles.modalLabel, { color: C.muted }]}>END DATE (YYYY-MM-DD)</Text>
            <TextInput
              style={[styles.modalInput, { borderColor: C.border, color: C.text, backgroundColor: C.bg }]}
              value={endDate}
              onChangeText={setEndDate}
              placeholder="2025-06-27"
              placeholderTextColor={C.muted}
            />
            {startDate && endDate && startDate <= endDate && (
              <Text style={[styles.modalInfo, { color: C.muted }]}>
                {countWorkdays(startDate, endDate)} working days
                {bal ? ` · ${bal.remaining - countWorkdays(startDate, endDate)} days remaining after` : ''}
              </Text>
            )}
            <View style={styles.modalBtns}>
              <TouchableOpacity
                style={[styles.modalBtn, { borderColor: C.border, backgroundColor: C.bg }]}
                onPress={() => setModal(false)}>
                <Text style={{ color: C.muted }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: '#E05C2A', borderColor: '#E05C2A' }]}
                onPress={submitRequest}>
                <Text style={{ color: 'white', fontWeight: '700' }}>Submit</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root:         { flex: 1 },
  header:       { paddingTop: 56, paddingBottom: 16, paddingHorizontal: 20 },
  title:        { fontSize: 24, fontWeight: '800', color: 'white', letterSpacing: -0.5 },
  subtitle:     { fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 },
  scroll:       { padding: 16, paddingBottom: 40 },
  balCard:      { backgroundColor: '#192A3A', borderRadius: 18, padding: 20, marginBottom: 14 },
  balLabel:     { fontSize: 11, color: 'rgba(255,255,255,0.5)', letterSpacing: 0.5, marginBottom: 6 },
  balDays:      { fontSize: 38, fontWeight: '800', color: 'white', letterSpacing: -1 },
  balSub:       { fontSize: 15, fontWeight: '400', opacity: 0.55 },
  balUsed:      { fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 4 },
  barBg:        { height: 6, backgroundColor: 'rgba(255,255,255,0.12)',
                  borderRadius: 3, marginTop: 12, overflow: 'hidden' },
  barFill:      { height: 6, backgroundColor: '#E05C2A', borderRadius: 3 },
  tabRow:       { flexDirection: 'row', gap: 4, borderRadius: 12, padding: 4,
                  borderWidth: 1, marginBottom: 12 },
  tab:          { flex: 1, paddingVertical: 7, borderRadius: 9, alignItems: 'center' },
  tabText:      { fontSize: 13, fontWeight: '600' },
  calCard:      { borderRadius: 14, padding: 14, borderWidth: 1, marginBottom: 14 },
  monthNav:     { flexDirection: 'row', alignItems: 'center',
                  justifyContent: 'space-between', marginBottom: 10 },
  navBtn:       { width: 34, height: 34, borderRadius: 8, borderWidth: 1,
                  alignItems: 'center', justifyContent: 'center' },
  monthLabel:   { fontSize: 15, fontWeight: '700' },
  dayHeaders:   { flexDirection: 'row', marginBottom: 4 },
  dayHeader:    { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '700' },
  grid:         { flexDirection: 'row', flexWrap: 'wrap', gap: 3 },
  cell:         { width: '13.5%', aspectRatio: 0.85, borderRadius: 8, borderWidth: 1,
                  alignItems: 'center', justifyContent: 'center' },
  cellNum:      { fontSize: 12 },
  dot:          { width: 6, height: 6, borderRadius: 3, marginTop: 2 },
  holLabel:     { fontSize: 5.5, color: '#B45309', marginTop: 1 },
  calHint:      { fontSize: 11, textAlign: 'center', marginTop: 10 },
  placeholder:  { borderRadius: 14, borderWidth: 1, padding: 40,
                  alignItems: 'center', marginBottom: 14 },
  reqBtn:       { backgroundColor: '#E05C2A', borderRadius: 12, paddingVertical: 13,
                  alignItems: 'center', marginBottom: 16 },
  reqBtnText:   { color: 'white', fontSize: 15, fontWeight: '700' },
  sectionTitle: { fontSize: 15, fontWeight: '700', marginBottom: 10 },
  emptyCard:    { borderRadius: 12, padding: 20, borderWidth: 1, marginBottom: 8 },
  reqCard:      { borderRadius: 12, padding: 14, borderWidth: 1, marginBottom: 8 },
  reqRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  reqDates:     { fontSize: 14, fontWeight: '700' },
  reqDays:      { fontSize: 12, marginTop: 2 },
  badge:        { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
  badgeText:    { fontSize: 11, fontWeight: '700' },
  approveBtns:  { flexDirection: 'row', gap: 8, marginTop: 12 },
  approveBtn:   { flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center' },
  approveBtnText:{ color: 'white', fontWeight: '700', fontSize: 13 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
                  justifyContent: 'flex-end' },
  modalBox:     { borderRadius: 24, padding: 24, paddingBottom: 36,
                  marginHorizontal: 0 },
  modalTitle:   { fontSize: 18, fontWeight: '800', marginBottom: 16 },
  modalLabel:   { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 6 },
  modalInput:   { borderWidth: 1.5, borderRadius: 10, padding: 12,
                  fontSize: 15, marginBottom: 14 },
  modalInfo:    { fontSize: 13, marginBottom: 14 },
  modalBtns:    { flexDirection: 'row', gap: 10 },
  modalBtn:     { flex: 1, paddingVertical: 13, borderRadius: 12,
                  borderWidth: 1, alignItems: 'center' },
});