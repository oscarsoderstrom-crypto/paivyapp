import { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, useColorScheme,
} from 'react-native';
import { supabase }        from '../../lib/supabase';
import { useAuth }         from '../../hooks/useAuth';
import { Colors }          from '../../constants/colors';
import { DAY_TYPES }       from '../../constants/dayTypes';
import { FI_HOLIDAYS }     from '../../constants/holidays';
import {
  today, getCalendarCells,
  isWeekend, isHoliday,
} from '../../lib/helpers';
import type { WorkLog, DayTypeId } from '../../lib/types';

const MONTHS = ['January','February','March','April','May','June',
  'July','August','September','October','November','December'];

export default function WorkLogScreen() {
  const scheme      = useColorScheme() ?? 'light';
  const C = Colors[scheme as 'light' | 'dark'];
  const { profile } = useAuth();
  const [logs,  setLogs]  = useState<WorkLog[]>([]);
  const [year,  setYear]  = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const todayStr = today();

  useEffect(() => { if (profile) fetchLogs(); }, [profile, year, month]);

  const fetchLogs = async () => {
    const start = `${year}-${String(month).padStart(2,'0')}-01`;
    const end   = `${year}-${String(month).padStart(2,'0')}-${new Date(year,month,0).getDate()}`;
    const { data } = await supabase
      .from('work_logs')
      .select('*')
      .eq('user_id', profile!.id)
      .gte('date', start)
      .lte('date', end);
    if (data) setLogs(data as WorkLog[]);
  };

  const markDay = async (date: string, type: DayTypeId) => {
    await supabase.from('work_logs').upsert(
      { user_id: profile!.id, date, type },
      { onConflict: 'user_id,date' }
    );
    fetchLogs();
  };

  const logMap = Object.fromEntries(logs.map(l => [l.date, l.type]));
  const cells  = getCalendarCells(year, month);

  const prevMonth = () => {
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
  };

  return (
    <View style={[styles.root, { backgroundColor: C.bg }]}>
      <View style={[styles.header, { backgroundColor: C.nav }]}>
        <Text style={styles.title}>Work Log</Text>
        <Text style={styles.subtitle}>{MONTHS[month - 1]} {year}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>

        {/* Quick today buttons */}
        <View style={[styles.card, { backgroundColor: C.card, borderColor: C.border }]}>
          <Text style={[styles.sectionLabel, { color: C.muted }]}>
            TODAY · {todayStr}
          </Text>
          <View style={styles.row}>
            {(['office', 'home'] as DayTypeId[]).map(t => {
              const dt     = DAY_TYPES.find(d => d.id === t)!;
              const active = logMap[todayStr] === t;
              return (
                <TouchableOpacity
                  key={t}
                  style={[styles.quickBtn,
                    { backgroundColor: active ? dt.color : dt.color + '18' }]}
                  onPress={() => markDay(todayStr, t)}
                >
                  <Text style={[styles.quickBtnText,
                    { color: active ? 'white' : dt.color }]}>
                    {dt.emoji}  {dt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Month navigator */}
        <View style={styles.monthNav}>
          <TouchableOpacity
            onPress={prevMonth}
            style={[styles.navBtn, { backgroundColor: C.card, borderColor: C.border }]}
          >
            <Text style={{ color: C.text, fontSize: 18 }}>‹</Text>
          </TouchableOpacity>
          <Text style={[styles.monthLabel, { color: C.text }]}>
            {MONTHS[month - 1]} {year}
          </Text>
          <TouchableOpacity
            onPress={nextMonth}
            style={[styles.navBtn, { backgroundColor: C.card, borderColor: C.border }]}
          >
            <Text style={{ color: C.text, fontSize: 18 }}>›</Text>
          </TouchableOpacity>
        </View>

        {/* Day headers */}
        <View style={styles.dayHeaders}>
          {['Mo','Tu','We','Th','Fr','Sa','Su'].map(d => (
            <Text key={d} style={[styles.dayHeader, { color: C.muted }]}>{d}</Text>
          ))}
        </View>

        {/* Calendar grid */}
        <View style={styles.grid}>
          {cells.map((d: string | null, i: number) => {
            if (!d) return <View key={'e' + i} style={styles.cell} />;
            const we   = isWeekend(d);
            const hol  = isHoliday(d);
            const type = logMap[d];
            const dt   = type ? DAY_TYPES.find(t => t.id === type) : null;
            const isT  = d === todayStr;
            return (
              <TouchableOpacity
                key={d}
                style={[styles.cell, {
                  backgroundColor: hol ? C.hol : we ? C.sub
                    : dt ? dt.color + '18' : C.card,
                  borderColor: isT ? '#1565C0' : C.border,
                  borderWidth: isT ? 2 : 1,
                }]}
                onPress={() => !we && !hol && markDay(d, 'office')}
                disabled={we || hol}
              >
                <Text style={[styles.cellNum, {
                  color:      hol ? '#B45309' : we ? C.muted : C.text,
                  fontWeight: isT ? '800' : '500',
                }]}>
                  {new Date(d + 'T12:00:00').getDate()}
                </Text>
                {dt && !hol && (
                  <Text style={styles.cellEmoji}>{dt.emoji}</Text>
                )}
                {hol && (
                  <Text style={[styles.holLabel]} numberOfLines={1}>
                    {FI_HOLIDAYS[d].split(' ')[0].substring(0, 8)}
                  </Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          {[
            { l: 'Office', c: '#1565C0', t: 'office' },
            { l: 'Home',   c: '#6A1B9A', t: 'home'   },
            { l: 'Sick',   c: '#B71C1C', t: 'sick'   },
            { l: 'Trips',  c: '#E65100', t: 'trip-dom'},
          ].map(s => (
            <View key={s.l}
              style={[styles.statCard, { backgroundColor: C.card, borderColor: C.border }]}>
              <Text style={[styles.statNum, { color: s.c }]}>
                {logs.filter((l: WorkLog) => l.type === s.t as DayTypeId ||
                  (s.t === 'trip-dom' && l.type === 'trip-int')).length}
              </Text>
              <Text style={[styles.statLabel, { color: C.muted }]}>{s.l}</Text>
            </View>
          ))}
        </View>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root:       { flex: 1 },
  header:     { paddingTop: 56, paddingBottom: 16, paddingHorizontal: 20 },
  title:      { fontSize: 24, fontWeight: '800', color: 'white', letterSpacing: -0.5 },
  subtitle:   { fontSize: 13, color: 'rgba(255,255,255,0.4)', marginTop: 2 },
  scroll:     { padding: 16, paddingBottom: 40 },
  card:       { borderRadius: 14, padding: 14, borderWidth: 1, marginBottom: 14 },
  sectionLabel:{ fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 10 },
  row:        { flexDirection: 'row', gap: 8 },
  quickBtn:   { flex: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  quickBtnText:{ fontSize: 13, fontWeight: '700' },
  monthNav:   { flexDirection: 'row', alignItems: 'center',
                justifyContent: 'space-between', marginBottom: 10 },
  navBtn:     { width: 36, height: 36, borderRadius: 8, borderWidth: 1,
                alignItems: 'center', justifyContent: 'center' },
  monthLabel: { fontSize: 16, fontWeight: '700' },
  dayHeaders: { flexDirection: 'row', marginBottom: 4 },
  dayHeader:  { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '700' },
  grid:       { flexDirection: 'row', flexWrap: 'wrap', gap: 3, marginBottom: 14 },
  cell:       { width: '13.5%', aspectRatio: 0.85, borderRadius: 8, borderWidth: 1,
                alignItems: 'center', justifyContent: 'center', padding: 2 },
  cellNum:    { fontSize: 13 },
  cellEmoji:  { fontSize: 11, marginTop: 1 },
  holLabel:   { fontSize: 6, color: '#B45309', marginTop: 1 },
  statsRow:   { flexDirection: 'row', gap: 8 },
  statCard:   { flex: 1, borderRadius: 10, padding: 10, borderWidth: 1, alignItems: 'center' },
  statNum:    { fontSize: 22, fontWeight: '800', lineHeight: 26 },
  statLabel:  { fontSize: 11, marginTop: 3 },
});