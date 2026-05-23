import { useState, useEffect, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { supabase }            from '../lib/supabase';
import {
  isWeekend, isHoliday,
  countWorkdays, getVacationBalance,
} from '../lib/helpers';
import { FI_HOLIDAYS }         from '../constants/holidays';
import type { VacationRequest, Profile, Team } from '../lib/types';
import type { Theme }          from '../constants/colors';

const DAY_W   = 13;
const ROW_H   = 44;
const LABEL_W = 100;

const MF = ['January','February','March','April','May','June',
            'July','August','September','October','November','December'];

function statusColor(s: string) {
  return s === 'approved' ? '#2E7D32' : s === 'pending' ? '#BF360C' : '#C62828';
}

interface MonthDef { y: number; m: number; }

interface Props {
  currentUserId: string;
  currentUserRole: string;
  vacations: VacationRequest[];
  months3: MonthDef[];
  accruals: Record<string, number>;
  C: Theme;
}

export default function GanttTimeline({
  currentUserId, currentUserRole, vacations, months3, accruals, C,
}: Props) {
  const [users,  setUsers]  = useState<Profile[]>([]);
  const [teams,  setTeams]  = useState<Team[]>([]);

  const isMgr = currentUserRole === 'manager' || currentUserRole === 'hr-admin';

  useEffect(() => {
    supabase.from('teams').select('*').then(({ data }) => { if (data) setTeams(data as Team[]); });
    supabase.from('profiles').select('*, team:teams(*)').then(({ data }) => { if (data) setUsers(data as Profile[]); });
  }, []);

  const allDays = useMemo(() =>
    months3.flatMap(({ y, m }) => {
      const n = new Date(y, m, 0).getDate();
      return Array.from({ length: n }, (_, i) => {
        return `${y}-${String(m).padStart(2,'0')}-${String(i+1).padStart(2,'0')}`;
      });
    })
  , [months3]);

  const dailyVac = useMemo(() => {
    const map: Record<string, string[]> = {};
    vacations.filter(v => v.status !== 'rejected').forEach(v => {
      const d = new Date(v.start_date + 'T12:00:00');
      const e = new Date(v.end_date   + 'T12:00:00');
      while (d <= e) {
        const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        if (!map[key]) map[key] = [];
        map[key].push(v.user_id);
        d.setDate(d.getDate() + 1);
      }
    });
    return map;
  }, [vacations]);

  const totalW = allDays.length * DAY_W;

  const initials = (name: string) =>
    name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

  if (users.length === 0) {
    return (
      <View style={[s.empty, { borderColor: C.border }]}>
        <Text style={{ color: C.muted }}>Loading timeline...</Text>
      </View>
    );
  }

  return (
    <View style={[s.wrap, { borderColor: C.border }]}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>

          {/* ── Month headers ── */}
          <View style={[s.row, { backgroundColor: C.sub }]}>
            <View style={[s.label, { height: 28 }]}>
              <Text style={[s.labelText, { color: C.muted }]}>MEMBER</Text>
            </View>
            {months3.map(({ y, m }) => {
              const days = new Date(y, m, 0).getDate();
              return (
                <View key={`${y}-${m}`}
                  style={[s.monthHeader, { width: days * DAY_W, borderColor: C.border }]}>
                  <Text style={[s.monthText, { color: C.text }]}>{MF[m-1].slice(0,3)} {y}</Text>
                </View>
              );
            })}
          </View>

          {/* ── Day numbers ── */}
          <View style={[s.row, { backgroundColor: C.sub }]}>
            <View style={[s.label, { height: 18 }]} />
            {allDays.map(d => {
              const dn  = new Date(d + 'T12:00:00').getDate();
              const hol = isHoliday(d);
              const we  = isWeekend(d);
              const show = dn === 1 || dn % 5 === 0;
              return (
                <View key={d} style={[s.dayNumCell, {
                  width: DAY_W,
                  backgroundColor: hol ? C.hol : we ? C.sub : 'transparent',
                  borderLeftWidth: dn === 1 ? 1 : 0,
                  borderLeftColor: C.border,
                }]}>
                  {show && <Text style={[s.dayNum, { color: C.muted }]}>{dn}</Text>}
                </View>
              );
            })}
          </View>

          {/* ── User rows ── */}
          {users.map(u => {
            const uv   = vacations.filter(v => v.user_id === u.id);
            const team = teams.find(t => t.id === u.team_id);
            const bal  = getVacationBalance(u.id, vacations, accruals[u.id] || 2.5);
            return (
              <View key={u.id} style={[s.row, {
                height: ROW_H, borderTopWidth: 1, borderTopColor: C.border,
              }]}>
                {/* Left label */}
                <View style={[s.label, { height: ROW_H, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8 }]}>
                  <View style={[s.avatar, { backgroundColor: team?.color ?? '#6B7280' }]}>
                    <Text style={s.avatarText}>{initials(u.full_name)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.userName, { color: C.text }]} numberOfLines={1}>
                      {u.full_name.split(' ')[0]}
                    </Text>
                    {isMgr && (
                      <Text style={[s.userDays, { color: C.muted }]}>{bal.remaining}d</Text>
                    )}
                  </View>
                </View>

                {/* Timeline area */}
                <View style={{ width: totalW, height: ROW_H, position: 'relative' }}>
                  {/* Background cells */}
                  {allDays.map((d, i) => {
                    const dn  = new Date(d + 'T12:00:00').getDate();
                    const hol = isHoliday(d);
                    const we  = isWeekend(d);
                    return (
                      <View key={d} style={{
                        position: 'absolute', left: i * DAY_W,
                        width: DAY_W, height: ROW_H,
                        backgroundColor: hol ? C.hol + '60'
                          : we ? C.sub + '80' : 'transparent',
                        borderLeftWidth: dn === 1 ? 1 : 0,
                        borderLeftColor: C.border,
                      }} />
                    );
                  })}

                  {/* Vacation blocks */}
                  {uv.map(v => {
                    const first = allDays[0];
                    const last  = allDays[allDays.length - 1];
                    if (v.end_date < first || v.start_date > last) return null;
                    const es = v.start_date < first ? first : v.start_date;
                    const ee = v.end_date   > last  ? last  : v.end_date;
                    const si = allDays.indexOf(es);
                    const ei = allDays.indexOf(ee);
                    if (si < 0 || ei < 0) return null;
                    const blockW = (ei - si + 1) * DAY_W;
                    const wd = countWorkdays(v.start_date, v.end_date);
                    return (
                      <View key={v.id} style={{
                        position: 'absolute',
                        left: si * DAY_W, width: blockW,
                        top: 7, height: 30,
                        backgroundColor: statusColor(v.status),
                        borderRadius: 15, zIndex: 2,
                        alignItems: 'center', justifyContent: 'center',
                        overflow: 'hidden',
                      }}>
                        {blockW > 50 && (
                          <Text style={s.blockDateText}>
                            {v.start_date.slice(5)} – {v.end_date.slice(5)}
                          </Text>
                        )}
                        {blockW > 24 && (
                          <Text style={s.blockDayText}>{wd}d</Text>
                        )}
                      </View>
                    );
                  })}
                </View>
              </View>
            );
          })}

          {/* ── Office count row (managers only) ── */}
          {isMgr && (
            <View style={[s.row, {
              height: 34, backgroundColor: C.sub,
              borderTopWidth: 2, borderTopColor: C.border,
            }]}>
              <View style={[s.label, { height: 34, justifyContent: 'center', paddingHorizontal: 8 }]}>
                <Text style={[s.labelText, { color: C.muted }]}>IN OFFICE</Text>
                <Text style={[s.userDays, { color: C.muted }]}>/{users.length}</Text>
              </View>
              <View style={{ width: totalW, height: 34, position: 'relative' }}>
                {allDays.map((d, i) => {
                  const dn  = new Date(d + 'T12:00:00').getDate();
                  const hol = isHoliday(d);
                  const we  = isWeekend(d);
                  if (hol || we) return (
                    <View key={d} style={{
                      position: 'absolute', left: i * DAY_W,
                      width: DAY_W, height: 34,
                      backgroundColor: hol ? C.hol + '40' : C.sub,
                      borderLeftWidth: dn === 1 ? 1 : 0,
                      borderLeftColor: C.border,
                    }} />
                  );
                  const onVac  = (dailyVac[d] || []).length;
                  const present = users.length - onVac;
                  const pct    = onVac / users.length;
                  const bg     = pct >= 0.5 ? '#FFEBEE'
                    : pct >= 0.3 ? '#FFF3E0'
                    : onVac > 0  ? '#E8F5E9' : 'transparent';
                  return (
                    <View key={d} style={{
                      position: 'absolute', left: i * DAY_W,
                      width: DAY_W, height: 34,
                      backgroundColor: bg,
                      borderLeftWidth: dn === 1 ? 1 : 0,
                      borderLeftColor: C.border,
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      {onVac > 0 && (
                        <Text style={[s.dayNum, { color: '#1A2B3A', fontWeight: '800' }]}>
                          {present}
                        </Text>
                      )}
                    </View>
                  );
                })}
              </View>
            </View>
          )}

        </View>
      </ScrollView>

      {/* Legend */}
      <View style={[s.legend, { borderTopColor: C.border }]}>
        {[{c:'#2E7D32',l:'Approved'},{c:'#BF360C',l:'Pending'},{c:'#C62828',l:'Rejected'}].map(x => (
          <View key={x.l} style={s.legendItem}>
            <View style={[s.legendDot, { backgroundColor: x.c }]} />
            <Text style={[s.legendText, { color: C.muted }]}>{x.l}</Text>
          </View>
        ))}
        {isMgr && (
          <View style={[s.legendItem, { marginLeft: 'auto' }]}>
            <View style={[s.legendDot, { backgroundColor: '#E8F5E9', borderWidth: 1, borderColor: '#2E7D32' }]} />
            <Text style={[s.legendText, { color: C.muted }]}>Office count</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap:          { borderRadius: 14, borderWidth: 1, overflow: 'hidden', marginBottom: 14 },
  empty:         { borderRadius: 14, borderWidth: 1, padding: 40, alignItems: 'center' },
  row:           { flexDirection: 'row' },
  label:         { width: LABEL_W, flexShrink: 0 },
  labelText:     { fontSize: 10, fontWeight: '700', letterSpacing: 0.4 },
  monthHeader:   { borderLeftWidth: 1, justifyContent: 'center', paddingLeft: 6 },
  monthText:     { fontSize: 11, fontWeight: '700' },
  dayNumCell:    { height: 18, alignItems: 'center', justifyContent: 'center' },
  dayNum:        { fontSize: 7 },
  avatar:        { width: 22, height: 22, borderRadius: 11,
                   alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  avatarText:    { color: 'white', fontSize: 8, fontWeight: '700' },
  userName:      { fontSize: 11, fontWeight: '600' },
  userDays:      { fontSize: 9, marginTop: 1 },
  blockDateText: { color: 'white', fontSize: 8, opacity: 0.9 },
  blockDayText:  { color: 'white', fontSize: 9, fontWeight: '700' },
  legend:        { flexDirection: 'row', flexWrap: 'wrap', gap: 12,
                   padding: 10, borderTopWidth: 1, alignItems: 'center' },
  legendItem:    { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot:     { width: 10, height: 10, borderRadius: 5 },
  legendText:    { fontSize: 11 },
});