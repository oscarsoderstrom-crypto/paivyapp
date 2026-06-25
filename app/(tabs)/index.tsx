import { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, useColorScheme, Modal,
} from 'react-native';
import { supabase }        from '../../lib/supabase';
import { useAuth }         from '../../hooks/useAuth';
import { Colors }          from '../../constants/colors';
import { DAY_TYPES }       from '../../constants/dayTypes';
import { FI_HOLIDAYS }     from '../../constants/holidays';
import {
  today, getCalendarCells,
  isWeekend, isHoliday,
  getDateRange, formatDisplay,
  isWorkdayForUser,
  autoEnd, paidMinutes, workedFromStamps,
  formatHm, formatClock,
} from '../../lib/helpers';
import type { WorkLog, DayTypeId } from '../../lib/types';

const MONTHS = ['January','February','March','April','May','June',
  'July','August','September','October','November','December'];

export default function WorkLogScreen() {
  const scheme      = useColorScheme() ?? 'light';
  const C           = Colors[scheme as 'light' | 'dark'];
  const { profile } = useAuth();
  const [logs,  setLogs]  = useState<WorkLog[]>([]);
  const [year,  setYear]  = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);

  const [selectMode, setSelectMode] = useState(false);
  const [rangeStart, setRangeStart] = useState<string | null>(null);
  const [rangeEnd,   setRangeEnd]   = useState<string | null>(null);
  const [picker,     setPicker]     = useState(false);
  const [pendingDays,setPendingDays]= useState<string[]>([]);
  const [nowTick,    setNowTick]    = useState(Date.now());

  const todayStr = today();
  const todayLog = logs.find(l => l.date === todayStr);
  const clockedIn = !!todayLog?.started_at && !todayLog?.ended_at;

  useEffect(() => { if (profile) fetchLogs(); }, [profile, year, month]);

  // Live elapsed timer while a rolling day is open
  useEffect(() => {
    if (profile?.hours_mode !== 'rolling' || !clockedIn) return;
    const id = setInterval(() => setNowTick(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [profile?.hours_mode, clockedIn]);

  const fetchLogs = async () => {
    // Fetch a wider range so trailing days from prev/next months show their logs too
    const start = `${year}-${String(month).padStart(2,'0')}-01`;
    const end   = `${year}-${String(month).padStart(2,'0')}-${new Date(year,month,0).getDate()}`;
    const { data } = await supabase
      .from('work_logs').select('*')
      .eq('user_id', profile!.id)
      .gte('date', start).lte('date', end);
    if (data) setLogs(data as WorkLog[]);
  };

  const handleDayPress = (day: string) => {
    if (selectMode) {
      if (!rangeStart) {
        setRangeStart(day);
        setRangeEnd(null);
      } else {
        const start = day < rangeStart ? day : rangeStart;
        const end   = day < rangeStart ? rangeStart : day;
        const workweek = profile?.workweek ?? 'mon-fri';
        const days = getDateRange(start, end).filter(d => isWorkdayForUser(d, workweek));
        setPendingDays(days);
        setRangeEnd(day);
        setPicker(true);
      }
    } else {
      setPendingDays([day]);
      setPicker(true);
    }
  };

  const markDays = async (type: DayTypeId) => {
    const rows = pendingDays.map(date => ({ user_id: profile!.id, date, type }));
    await supabase.from('work_logs').upsert(rows, { onConflict: 'user_id,date' });
    closePicker();
    fetchLogs();
  };

  const closePicker = () => {
    setPicker(false);
    setSelectMode(false);
    setRangeStart(null);
    setRangeEnd(null);
    setPendingDays([]);
  };

  const markToday = async (type: DayTypeId) => {
    const now      = new Date().toISOString();
    const startISO = todayLog?.started_at ?? now;   // preserve an existing stamp-in
    const row: Record<string, unknown> = {
      user_id: profile!.id, date: todayStr, type, started_at: startISO,
    };
    if (profile!.hours_mode === 'set') {
      row.ended_at       = autoEnd(startISO, profile!.workday_minutes);
      row.worked_minutes = paidMinutes(profile!.workday_minutes, profile!.lunch_minutes);
    } else {
      // rolling: keep any prior end/worked (e.g. correcting the type after ending)
      row.ended_at       = todayLog?.ended_at ?? null;
      row.worked_minutes = todayLog?.worked_minutes ?? null;
    }
    await supabase.from('work_logs').upsert(row, { onConflict: 'user_id,date' });
    fetchLogs();
  };

  const endWorkDay = async () => {
    if (!todayLog?.started_at) return;
    const now    = new Date().toISOString();
    const worked = workedFromStamps(todayLog.started_at, now, profile!.lunch_minutes);
    await supabase.from('work_logs').upsert(
      { user_id: profile!.id, date: todayStr, type: todayLog.type,
        started_at: todayLog.started_at, ended_at: now, worked_minutes: worked },
      { onConflict: 'user_id,date' });
    fetchLogs();
  };

  const inRange = (day: string) => {
    if (!rangeStart) return false;
    const end = rangeEnd ?? rangeStart;
    const lo  = rangeStart < end ? rangeStart : end;
    const hi  = rangeStart < end ? end : rangeStart;
    return day >= lo && day <= hi;
  };

  const logMap = Object.fromEntries(logs.map(l => [l.date, l.type]));
  const cells  = getCalendarCells(year, month);

  const prevMonth = () => { if(month===1){setYear(y=>y-1);setMonth(12);}else setMonth(m=>m-1); };
  const nextMonth = () => { if(month===12){setYear(y=>y+1);setMonth(1);}else setMonth(m=>m+1); };

  return (
    <View style={[styles.root, { backgroundColor: C.bg }]}>
      <View style={[styles.header, { backgroundColor: C.nav }]}>
        <Text style={styles.title}>Work Log</Text>
        <Text style={styles.subtitle}>{MONTHS[month-1]} {year}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>

        {/* Quick today buttons */}
        <View style={[styles.card, { backgroundColor: C.card, borderColor: C.border }]}>
          <Text style={[styles.sectionLabel, { color: C.muted }]}>
            TODAY · {formatDisplay(todayStr)}
          </Text>
          <View style={styles.row}>
            {(['office','home'] as DayTypeId[]).map(t => {
              const dt     = DAY_TYPES.find(d => d.id === t)!;
              const active = logMap[todayStr] === t;
              return (
                <TouchableOpacity key={t}
                  style={[styles.quickBtn,
                    { backgroundColor: active ? dt.color : dt.color + '18' }]}
                  onPress={() => markToday(t)}>
                  <Text style={[styles.quickBtnText,
                    { color: active ? 'white' : dt.color }]}>
                    {dt.emoji}  {dt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Work-hours status (only once stamped in for an office/home day) */}
          {todayLog?.started_at &&
           (todayLog.type === 'office' || todayLog.type === 'home') && (() => {
            const standard = paidMinutes(profile!.workday_minutes, profile!.lunch_minutes);
            const isRolling = profile!.hours_mode === 'rolling';
            return (
              <View style={[styles.hoursBox, { borderColor: C.border }]}>
                {!isRolling ? (
                  // 'Set work time' — end auto-filled
                  <Text style={[styles.hoursText, { color: C.text }]}>
                    🕗 In {formatClock(todayLog.started_at)}
                    {todayLog.ended_at ? ` · Ends ${formatClock(todayLog.ended_at)}` : ''}
                    {'  ·  '}
                    <Text style={{ fontWeight: '800' }}>{formatHm(standard)}</Text>
                  </Text>
                ) : clockedIn ? (
                  // rolling, still open — live elapsed
                  <View>
                    <Text style={[styles.hoursText, { color: C.text }]}>
                      🕗 In since {formatClock(todayLog.started_at)}
                      {'  ·  '}
                      <Text style={{ fontWeight: '800' }}>
                        {formatHm(workedFromStamps(
                          todayLog.started_at, new Date(nowTick).toISOString(),
                          profile!.lunch_minutes))} so far
                      </Text>
                    </Text>
                    <TouchableOpacity
                      style={[styles.endBtn, { backgroundColor: C.accent }]}
                      onPress={endWorkDay}>
                      <Text style={styles.endBtnText}>⏹  End work day</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  // rolling, ended — worked vs standard
                  (() => {
                    const worked = todayLog.worked_minutes ?? 0;
                    const diff   = worked - standard;
                    const diffC  = diff >= 0 ? '#2E7D32' : '#C62828';
                    return (
                      <Text style={[styles.hoursText, { color: C.text }]}>
                        🕗 {formatClock(todayLog.started_at)}–{formatClock(todayLog.ended_at!)}
                        {'  ·  '}
                        <Text style={{ fontWeight: '800' }}>{formatHm(worked)}</Text>
                        {` / ${formatHm(standard)}  `}
                        <Text style={{ color: diffC, fontWeight: '700' }}>
                          {diff >= 0 ? '+' : '−'}{formatHm(Math.abs(diff))}
                        </Text>
                      </Text>
                    );
                  })()
                )}
              </View>
            );
          })()}
        </View>

        {/* Select range toggle */}
        <TouchableOpacity
          style={[styles.selectToggle, {
            backgroundColor: selectMode ? C.accent : C.card,
            borderColor: selectMode ? C.accent : C.border,
          }]}
          onPress={() => {
            setSelectMode(m => !m);
            setRangeStart(null);
            setRangeEnd(null);
          }}>
          <Text style={[styles.selectToggleText,
            { color: selectMode ? 'white' : C.text }]}>
            {selectMode
              ? (rangeStart ? '👆 Now tap the last day' : '👆 Tap the first day')
              : '📅 Select multiple days'}
          </Text>
        </TouchableOpacity>

        {/* Month navigator */}
        <View style={styles.monthNav}>
          <TouchableOpacity onPress={prevMonth}
            style={[styles.navBtn, { backgroundColor: C.card, borderColor: C.border }]}>
            <Text style={{ color: C.text, fontSize: 18 }}>‹</Text>
          </TouchableOpacity>
          <Text style={[styles.monthLabel, { color: C.text }]}>{MONTHS[month-1]} {year}</Text>
          <TouchableOpacity onPress={nextMonth}
            style={[styles.navBtn, { backgroundColor: C.card, borderColor: C.border }]}>
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
          {cells.map((cell, i) => {
            const d    = cell.date;
            const we   = isWeekend(d);
            const hol  = isHoliday(d);
            const type = logMap[d];
            const dt   = type ? DAY_TYPES.find(t => t.id === type) : null;
            const isT  = d === todayStr && cell.currentMonth;
            const sel  = inRange(d);
            return (
              <TouchableOpacity key={d+'_'+i}
                style={[styles.cell, {
                  backgroundColor: sel ? C.accent + '44'
                    : hol ? C.hol : we ? C.sub
                    : dt ? dt.color + '18' : C.card,
                  borderColor: sel ? C.accent : isT ? '#1565C0' : C.border,
                  borderWidth: sel || isT ? 2 : 1,
                  opacity: cell.currentMonth ? 1 : 0.4,
                }]}
                onPress={() => handleDayPress(d)}>
                <Text style={[styles.cellNum, {
                  color: hol ? '#B45309' : we ? C.muted : C.text,
                  fontWeight: isT ? '800' : '500',
                }]}>
                  {new Date(d+'T12:00:00').getDate()}
                </Text>
                {dt && <Text style={styles.cellEmoji}>{dt.emoji}</Text>}
                {hol && !dt && cell.currentMonth && (
                  <Text style={styles.holLabel} numberOfLines={1}>
                    {FI_HOLIDAYS[d].split(' ')[0].substring(0,8)}
                  </Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          {[
            { l:'Office', c:'#1565C0', t:'office' },
            { l:'Home',   c:'#6A1B9A', t:'home' },
            { l:'Sick',   c:'#B71C1C', t:'sick' },
            { l:'Trips',  c:'#E65100', t:'trip-dom' },
          ].map(s => (
            <View key={s.l}
              style={[styles.statCard, { backgroundColor: C.card, borderColor: C.border }]}>
              <Text style={[styles.statNum, { color: s.c }]}>
                {logs.filter(l => l.type === s.t ||
                  (s.t === 'trip-dom' && l.type === 'trip-int')).length}
              </Text>
              <Text style={[styles.statLabel, { color: C.muted }]}>{s.l}</Text>
            </View>
          ))}
        </View>

      </ScrollView>

      {/* Day-type picker */}
      <Modal visible={picker} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: C.card }]}>
            <Text style={[styles.modalTitle, { color: C.text }]}>
              {pendingDays.length === 1
                ? `Mark ${formatDisplay(pendingDays[0])}`
                : `Mark ${pendingDays.length} days`}
            </Text>
            <Text style={[styles.modalSub, { color: C.muted }]}>
              Choose what to log
            </Text>
            {DAY_TYPES.map(dt => (
              <TouchableOpacity key={dt.id}
                style={[styles.typeRow, { borderColor: C.border }]}
                onPress={() => markDays(dt.id as DayTypeId)}>
                <Text style={styles.typeEmoji}>{dt.emoji}</Text>
                <Text style={[styles.typeLabel, { color: C.text }]}>{dt.label}</Text>
                <View style={[styles.typeDot, { backgroundColor: dt.color }]} />
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={[styles.cancelBtn, { borderColor: C.border }]}
              onPress={closePicker}>
              <Text style={{ color: C.muted }}>Cancel</Text>
            </TouchableOpacity>
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
  subtitle:     { fontSize: 13, color: 'rgba(255,255,255,0.4)', marginTop: 2 },
  scroll:       { padding: 16, paddingBottom: 40 },
  card:         { borderRadius: 14, padding: 14, borderWidth: 1, marginBottom: 14 },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 10 },
  row:          { flexDirection: 'row', gap: 8 },
  quickBtn:     { flex: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  quickBtnText: { fontSize: 13, fontWeight: '700' },
  hoursBox:     { marginTop: 12, paddingTop: 12, borderTopWidth: 1 },
  hoursText:    { fontSize: 13, lineHeight: 19 },
  endBtn:       { marginTop: 10, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  endBtnText:   { color: 'white', fontSize: 13, fontWeight: '700' },
  selectToggle: { borderRadius: 12, borderWidth: 1, paddingVertical: 12,
                  alignItems: 'center', marginBottom: 14 },
  selectToggleText: { fontSize: 14, fontWeight: '700' },
  monthNav:     { flexDirection: 'row', alignItems: 'center',
                  justifyContent: 'space-between', marginBottom: 10 },
  navBtn:       { width: 36, height: 36, borderRadius: 8, borderWidth: 1,
                  alignItems: 'center', justifyContent: 'center' },
  monthLabel:   { fontSize: 16, fontWeight: '700' },
  dayHeaders:   { flexDirection: 'row', marginBottom: 4 },
  dayHeader:    { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '700' },
  grid:         { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 14 },
  cell:         { width: '14.28%', aspectRatio: 0.85, borderRadius: 8, borderWidth: 1,
                  alignItems: 'center', justifyContent: 'center', padding: 2 },
  cellNum:      { fontSize: 13 },
  cellEmoji:    { fontSize: 11, marginTop: 1 },
  holLabel:     { fontSize: 6, color: '#B45309', marginTop: 1 },
  statsRow:     { flexDirection: 'row', gap: 8 },
  statCard:     { flex: 1, borderRadius: 10, padding: 10, borderWidth: 1, alignItems: 'center' },
  statNum:      { fontSize: 22, fontWeight: '800', lineHeight: 26 },
  statLabel:    { fontSize: 11, marginTop: 3 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalBox:     { borderRadius: 24, padding: 24, paddingBottom: 36 },
  modalTitle:   { fontSize: 18, fontWeight: '800' },
  modalSub:     { fontSize: 13, marginTop: 2, marginBottom: 16 },
  typeRow:      { flexDirection: 'row', alignItems: 'center', gap: 12,
                  paddingVertical: 13, borderBottomWidth: 1 },
  typeEmoji:    { fontSize: 20 },
  typeLabel:    { fontSize: 15, flex: 1 },
  typeDot:      { width: 12, height: 12, borderRadius: 6 },
  cancelBtn:    { borderRadius: 12, paddingVertical: 13, borderWidth: 1,
                  alignItems: 'center', marginTop: 16 },
});