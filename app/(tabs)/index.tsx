import { useState, useEffect, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, useColorScheme, Modal, Alert, TextInput,
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
  parseHHMM, hoursBetween, formatHHMM,
} from '../../lib/helpers';
import type { WorkLog, DayTypeId } from '../../lib/types';

const MONTHS = ['January','February','March','April','May','June',
  'July','August','September','October','November','December'];

// "08:01" for the current local time
const currentHHMM = (): string => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

// whole minutes elapsed since an "HH:MM[:SS]" time earlier today
const minutesSince = (start: string): number => {
  const [sh, sm] = start.split(':').map(Number);
  const d = new Date();
  const mins = (d.getHours() * 60 + d.getMinutes()) - (sh * 60 + sm);
  return mins > 0 ? mins : 0;
};

const fmtHM = (mins: number): string =>
  `${Math.floor(mins / 60)}h ${String(Math.round(mins % 60)).padStart(2, '0')}m`;

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

  // Manual hours entry (used to correct past / multi-day office & home logs
  // when the employee is in track-hours mode)
  const [timeModal, setTimeModal] = useState(false);
  const [timeType,  setTimeType]  = useState<DayTypeId | null>(null);
  const [timeDays,  setTimeDays]  = useState<string[]>([]);
  const [startTime, setStartTime] = useState('');
  const [endTime,   setEndTime]   = useState('');

  const [nowTick, setNowTick] = useState(Date.now());

  const todayStr   = today();
  const trackHours = !!profile?.track_hours;
  const dailyHours = profile?.daily_hours ?? 7.5;

  useEffect(() => { if (profile) fetchLogs(); }, [profile, year, month]);

  const fetchLogs = async () => {
    const start = `${year}-${String(month).padStart(2,'0')}-01`;
    const end   = `${year}-${String(month).padStart(2,'0')}-${new Date(year,month,0).getDate()}`;
    const { data } = await supabase
      .from('work_logs').select('*')
      .eq('user_id', profile!.id)
      .gte('date', start).lte('date', end);
    if (data) setLogs(data as WorkLog[]);
  };

  const logMap    = Object.fromEntries(logs.map(l => [l.date, l.type]));
  const logByDate = Object.fromEntries(logs.map(l => [l.date, l])) as Record<string, WorkLog>;
  const cells     = getCalendarCells(year, month);

  const todayLog       = logByDate[todayStr];
  const clockedInOpen  = trackHours && !!todayLog?.start_time && !todayLog?.end_time;
  const completedToday = trackHours && !!todayLog?.start_time && !!todayLog?.end_time;

  // Tick a live elapsed timer while a shift is open
  useEffect(() => {
    if (!clockedInOpen) return;
    const id = setInterval(() => setNowTick(Date.now()), 30000);
    return () => clearInterval(id);
  }, [clockedInOpen]);

  const elapsedMins = useMemo(
    () => (clockedInOpen && todayLog?.start_time ? minutesSince(todayLog.start_time) : 0),
    [nowTick, clockedInOpen, todayLog?.start_time],
  );

  // Worked hours for one day: tracked days use the actual span; whole-day marks
  // (office/home with no times) count as a standard day; open shifts count 0.
  const dayWorkedHours = (log?: WorkLog): number => {
    if (!log || (log.type !== 'office' && log.type !== 'home')) return 0;
    const h = hoursBetween(log.start_time, log.end_time);
    if (h !== null) return h;
    if (!log.start_time && !log.end_time) return dailyHours;
    return 0;
  };

  const workDayLogs   = logs.filter(l => l.type === 'office' || l.type === 'home');
  const workedHours   = workDayLogs.reduce((s, l) => s + dayWorkedHours(l), 0);
  const expectedHours = workDayLogs.length * dailyHours;
  const overtime      = workedHours - expectedHours;

  const overtimeLabel = (hours: number): string => {
    const diff = hours - dailyHours;
    if (Math.abs(diff) < 0.05) return 'on time';
    return diff > 0 ? `+${diff.toFixed(1)}h overtime` : `${diff.toFixed(1)}h short`;
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

  const upsertLogs = async (
    days: string[], type: DayTypeId,
    start: string | null, end: string | null,
  ) => {
    const rows = days.map(date => ({
      user_id: profile!.id, date, type, start_time: start, end_time: end,
    }));
    const { error } = await supabase.from('work_logs')
      .upsert(rows, { onConflict: 'user_id,date' });
    if (error) Alert.alert('Could not save', error.message);
    fetchLogs();
  };

  // Calendar picker: office/home in track-hours mode opens manual entry (so a
  // past day or a range can be corrected); everything else marks immediately.
  const markDays = async (type: DayTypeId) => {
    if (trackHours && (type === 'office' || type === 'home')) {
      setTimeType(type);
      setTimeDays(pendingDays);
      setStartTime(''); setEndTime('');
      setPicker(false);
      setTimeModal(true);
      return;
    }
    await upsertLogs(pendingDays, type, null, null);
    closePicker();
  };

  const closePicker = () => {
    setPicker(false);
    setSelectMode(false);
    setRangeStart(null);
    setRangeEnd(null);
    setPendingDays([]);
  };

  // Whole-day mode: marking today logs a full standard day, no times
  const markTodayWholeDay = (type: DayTypeId) => upsertLogs([todayStr], type, null, null);

  // Track-hours mode: stamp the start time now
  const clockIn = (type: DayTypeId) => upsertLogs([todayStr], type, currentHHMM(), null);

  // Track-hours mode: stamp the end time now and close the shift
  const clockOut = async () => {
    if (!todayLog?.start_time) return;
    const end = currentHHMM();
    if (hoursBetween(todayLog.start_time, end) === null) {
      Alert.alert('Can\'t end yet', 'End time must be after the clock-in time (overnight shifts aren\'t supported).');
      return;
    }
    await upsertLogs([todayStr], todayLog.type as DayTypeId, todayLog.start_time, end);
  };

  const editToday = () => {
    if (!todayLog) return;
    setTimeType(todayLog.type as DayTypeId);
    setTimeDays([todayStr]);
    setStartTime(formatHHMM(todayLog.start_time));
    setEndTime(formatHHMM(todayLog.end_time));
    setTimeModal(true);
  };

  const submitTimed = async () => {
    const s = parseHHMM(startTime);
    const e = parseHHMM(endTime);
    if (!s || !e) {
      Alert.alert('Invalid time', 'Use 24-hour HH:MM, e.g. 08:30 and 16:30.');
      return;
    }
    if (hoursBetween(s, e) === null) {
      Alert.alert('Invalid range', 'End time must be after start time.');
      return;
    }
    await upsertLogs(timeDays, timeType!, s, e);
    setTimeModal(false);
    closePicker();
  };

  const inRange = (day: string) => {
    if (!rangeStart) return false;
    const end = rangeEnd ?? rangeStart;
    const lo  = rangeStart < end ? rangeStart : end;
    const hi  = rangeStart < end ? end : rangeStart;
    return day >= lo && day <= hi;
  };

  const previewHours = hoursBetween(parseHHMM(startTime), parseHHMM(endTime));
  const todayLabel   = todayLog ? DAY_TYPES.find(d => d.id === todayLog.type)?.label : '';

  const prevMonth = () => { if(month===1){setYear(y=>y-1);setMonth(12);}else setMonth(m=>m-1); };
  const nextMonth = () => { if(month===12){setYear(y=>y+1);setMonth(1);}else setMonth(m=>m+1); };

  return (
    <View style={[styles.root, { backgroundColor: C.bg }]}>
      <View style={[styles.header, { backgroundColor: C.nav }]}>
        <Text style={styles.title}>Work Log</Text>
        <Text style={styles.subtitle}>{MONTHS[month-1]} {year}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>

        {/* Today */}
        <View style={[styles.card, { backgroundColor: C.card, borderColor: C.border }]}>
          <Text style={[styles.sectionLabel, { color: C.muted }]}>
            TODAY · {formatDisplay(todayStr)}
          </Text>

          {/* Whole-day mode (or no time tracking): just mark where you work */}
          {!trackHours && (
            <View style={styles.row}>
              {(['office','home'] as DayTypeId[]).map(t => {
                const dt     = DAY_TYPES.find(d => d.id === t)!;
                const active = logMap[todayStr] === t;
                return (
                  <TouchableOpacity key={t}
                    style={[styles.quickBtn, { backgroundColor: active ? dt.color : dt.color + '18' }]}
                    onPress={() => markTodayWholeDay(t)}>
                    <Text style={[styles.quickBtnText, { color: active ? 'white' : dt.color }]}>
                      {dt.emoji}  {dt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* Track-hours mode — not clocked in yet: clock in */}
          {trackHours && !todayLog?.start_time && (
            <>
              <Text style={[styles.todayHint, { color: C.muted }]}>
                Clock in when you start your day.
              </Text>
              <View style={styles.row}>
                {(['office','home'] as DayTypeId[]).map(t => {
                  const dt = DAY_TYPES.find(d => d.id === t)!;
                  return (
                    <TouchableOpacity key={t}
                      style={[styles.quickBtn, { backgroundColor: dt.color + '18' }]}
                      onPress={() => clockIn(t)}>
                      <Text style={[styles.quickBtnText, { color: dt.color }]}>
                        {dt.emoji}  {dt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}

          {/* Track-hours mode — shift open: live timer + End workday */}
          {clockedInOpen && (
            <View>
              <View style={styles.clockRow}>
                <View style={styles.clockDot} />
                <Text style={[styles.clockText, { color: C.text }]}>
                  {todayLabel} · clocked in {formatHHMM(todayLog!.start_time)}
                </Text>
              </View>
              <Text style={[styles.elapsedBig, { color: C.text }]}>{fmtHM(elapsedMins)}</Text>
              <TouchableOpacity style={styles.endBtn} onPress={clockOut}>
                <Text style={styles.endBtnText}>⏹  End workday</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Track-hours mode — shift complete: result */}
          {completedToday && (
            <View>
              <Text style={[styles.doneText, { color: C.text }]}>
                ✅ {todayLabel} · {formatHHMM(todayLog!.start_time)}–{formatHHMM(todayLog!.end_time)}
              </Text>
              <Text style={[styles.doneSub, { color: C.muted }]}>
                Worked {fmtHM((hoursBetween(todayLog!.start_time, todayLog!.end_time) ?? 0) * 60)}
                {'  ·  '}{overtimeLabel(hoursBetween(todayLog!.start_time, todayLog!.end_time) ?? 0)}
              </Text>
              <TouchableOpacity style={[styles.editBtn, { borderColor: C.border }]} onPress={editToday}>
                <Text style={{ color: C.muted, fontSize: 13, fontWeight: '600' }}>Edit times</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Select range toggle */}
        <TouchableOpacity
          style={[styles.selectToggle, {
            backgroundColor: selectMode ? C.accent : C.card,
            borderColor: selectMode ? C.accent : C.border,
          }]}
          onPress={() => { setSelectMode(m => !m); setRangeStart(null); setRangeEnd(null); }}>
          <Text style={[styles.selectToggleText, { color: selectMode ? 'white' : C.text }]}>
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
            const hrs  = hoursBetween(logByDate[d]?.start_time, logByDate[d]?.end_time);
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
                {trackHours && cell.currentMonth && hrs !== null && (
                  <Text style={[styles.cellHrs, { color: C.muted }]}>{hrs.toFixed(1)}h</Text>
                )}
                {hol && !dt && cell.currentMonth && (
                  <Text style={styles.holLabel} numberOfLines={1}>
                    {FI_HOLIDAYS[d].split(' ')[0].substring(0,8)}
                  </Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Working-time summary (track-hours mode only) */}
        {trackHours && (
          <View style={styles.timeCard}>
            <Text style={styles.timeLabel}>WORKING TIME · {MONTHS[month-1].toUpperCase()}</Text>
            <Text style={styles.timeHours}>
              {workedHours.toFixed(1)}<Text style={styles.timeUnit}> h worked</Text>
            </Text>
            <Text style={styles.timeSub}>
              {expectedHours.toFixed(1)} h expected · {overtime >= 0 ? '+' : ''}{overtime.toFixed(1)} h {overtime >= 0 ? 'overtime' : 'under'}
            </Text>
          </View>
        )}

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
            <Text style={[styles.modalSub, { color: C.muted }]}>Choose what to log</Text>
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

      {/* Manual hours entry (corrections in track-hours mode) */}
      <Modal visible={timeModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: C.card }]}>
            <Text style={[styles.modalTitle, { color: C.text }]}>
              {timeType ? DAY_TYPES.find(d => d.id === timeType)?.label : ''}
            </Text>
            <Text style={[styles.modalSub, { color: C.muted }]}>
              {timeDays.length === 1
                ? `${formatDisplay(timeDays[0])} · enter working hours`
                : `${timeDays.length} days · enter working hours`}
            </Text>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.timeFieldLabel, { color: C.muted }]}>START</Text>
                <TextInput
                  style={[styles.timeInput, { borderColor: C.border, color: C.text, backgroundColor: C.bg }]}
                  value={startTime} onChangeText={setStartTime}
                  placeholder="08:30" placeholderTextColor={C.muted}
                  keyboardType="numbers-and-punctuation"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.timeFieldLabel, { color: C.muted }]}>END</Text>
                <TextInput
                  style={[styles.timeInput, { borderColor: C.border, color: C.text, backgroundColor: C.bg }]}
                  value={endTime} onChangeText={setEndTime}
                  placeholder="16:30" placeholderTextColor={C.muted}
                  keyboardType="numbers-and-punctuation"
                />
              </View>
            </View>
            {previewHours !== null && (
              <Text style={[styles.modalSub, { color: C.muted, marginTop: 12 }]}>
                {previewHours.toFixed(1)} working hours
              </Text>
            )}
            <View style={styles.timeBtns}>
              <TouchableOpacity
                style={[styles.timeBtn, { borderColor: C.border, backgroundColor: C.bg }]}
                onPress={() => { setTimeModal(false); closePicker(); }}>
                <Text style={{ color: C.muted }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.timeBtn, { backgroundColor: C.accent, borderColor: C.accent }]}
                onPress={submitTimed}>
                <Text style={{ color: 'white', fontWeight: '700' }}>Save</Text>
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
  subtitle:     { fontSize: 13, color: 'rgba(255,255,255,0.4)', marginTop: 2 },
  scroll:       { padding: 16, paddingBottom: 40 },
  card:         { borderRadius: 14, padding: 14, borderWidth: 1, marginBottom: 14 },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 10 },
  todayHint:    { fontSize: 12, marginBottom: 10 },
  row:          { flexDirection: 'row', gap: 8 },
  quickBtn:     { flex: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  quickBtnText: { fontSize: 13, fontWeight: '700' },
  clockRow:     { flexDirection: 'row', alignItems: 'center', gap: 8 },
  clockDot:     { width: 10, height: 10, borderRadius: 5, backgroundColor: '#2E7D32' },
  clockText:    { fontSize: 14, fontWeight: '700' },
  elapsedBig:   { fontSize: 34, fontWeight: '800', letterSpacing: -1, marginTop: 6 },
  endBtn:       { backgroundColor: '#C62828', borderRadius: 12, paddingVertical: 13,
                  alignItems: 'center', marginTop: 12 },
  endBtnText:   { color: 'white', fontSize: 15, fontWeight: '700' },
  doneText:     { fontSize: 15, fontWeight: '700' },
  doneSub:      { fontSize: 13, marginTop: 4 },
  editBtn:      { borderRadius: 10, borderWidth: 1, paddingVertical: 9,
                  alignItems: 'center', marginTop: 12 },
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
  cellHrs:      { fontSize: 7.5, fontWeight: '700', marginTop: 1 },
  holLabel:     { fontSize: 6, color: '#B45309', marginTop: 1 },
  timeCard:     { backgroundColor: '#192A3A', borderRadius: 16, padding: 18, marginBottom: 14 },
  timeLabel:    { fontSize: 11, color: 'rgba(255,255,255,0.5)', letterSpacing: 0.5, marginBottom: 6 },
  timeHours:    { fontSize: 34, fontWeight: '800', color: 'white', letterSpacing: -1 },
  timeUnit:     { fontSize: 16, fontWeight: '400', opacity: 0.55 },
  timeSub:      { fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 4 },
  timeFieldLabel:{ fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 6 },
  timeInput:    { borderWidth: 1.5, borderRadius: 10, padding: 12, fontSize: 16 },
  timeBtns:     { flexDirection: 'row', gap: 10, marginTop: 18 },
  timeBtn:      { flex: 1, paddingVertical: 13, borderRadius: 12, borderWidth: 1, alignItems: 'center' },
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
