import { useState, useEffect, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { supabase }            from '../lib/supabase';
import {
  isWeekend, isHoliday,
  countWorkdays, getVacationBalance,
  formatDisplayShort, today as todayHelper,
} from '../lib/helpers';
import type { VacationRequest, Profile, Team } from '../lib/types';
import type { Theme }          from '../constants/colors';

const DAY_W   = 14;
const ROW_H   = 48;
const LABEL_W = 110;

const MF = ['Jan','Feb','Mar','Apr','May','Jun',
            'Jul','Aug','Sep','Oct','Nov','Dec'];

function statusColor(s: string) {
  return s === 'approved' ? '#2E7D32' : s === 'pending' ? '#BF360C' : '#C62828';
}

interface MonthDef { y: number; m: number; }

interface Props {
  currentUserId:   string;
  currentUserRole: string;
  vacations:       VacationRequest[];
  months3:         MonthDef[];
  accruals:        Record<string, number>;
  C:               Theme;
}

export default function GanttTimeline({
  currentUserId, currentUserRole, vacations, months3, accruals, C,
}: Props) {
  const [users,   setUsers]   = useState<Profile[]>([]);
  const [teams,   setTeams]   = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);

  const isMgr    = currentUserRole === 'manager' || currentUserRole === 'hr-admin';
  const todayStr = todayHelper();

  useEffect(() => {
    Promise.all([
      supabase.from('teams').select('*'),
      supabase.from('profiles').select('*, team:teams(*)'),
    ]).then(([t, m]) => {
      if (t.data) setTeams(t.data as Team[]);
      if (m.data) setUsers(m.data as Profile[]);
      setLoading(false);
    });
  }, []);

  const allDays = useMemo(() =>
    months3.flatMap(({ y, m }) => {
      const n = new Date(y, m, 0).getDate();
      return Array.from({ length: n }, (_, i) =>
        `${y}-${String(m).padStart(2,'0')}-${String(i+1).padStart(2,'0')}`
      );
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

  const totalW     = allDays.length * DAY_W;
  const todayIndex = allDays.indexOf(todayStr);

  const initials = (name: string) =>
    name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

  const shortName = (name: string) => {
    const parts = name.split(' ');
    if (parts.length === 1) return parts[0];
    return `${parts[0]} ${parts[parts.length - 1][0]}.`;
  };

  // Loading state
  if (loading) {
    return (
      <View style={[s.wrap, { borderColor: C.border, backgroundColor: C.card }]}>
        <View style={s.emptyState}>
          <Text style={s.emptyEmoji}>⏳</Text>
          <Text style={[s.emptyText, { color: C.muted }]}>Loading timeline…</Text>
        </View>
      </View>
    );
  }

  // Empty state — only current user (or none)
  if (users.length <= 1) {
    return (
      <View style={[s.wrap, { borderColor: C.border, backgroundColor: C.card }]}>
        <View style={s.emptyState}>
          <Text style={s.emptyEmoji}>👥</Text>
          <Text style={[s.emptyTitle, { color: C.text }]}>
            {users.length === 0 ? 'No team members yet' : 'Just you so far'}
          </Text>
          <Text style={[s.emptyText, { color: C.muted }]}>
            {isMgr
              ? 'Invite colleagues from the Profile tab — the team timeline will come alive once 2+ people are here.'
              : 'When more people join the office, you\'ll see everyone\'s vacation schedule here.'}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[s.wrap, { borderColor: C.border }]}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>

          {/* Month headers */}
          <View style={[s.row, { backgroundColor: C.sub }]}>
            <View style={[s.label, { height: 30 }]}>
              <Text style={[s.labelText, { color: C.muted, paddingLeft: 8 }]}>MEMBER</Text>
            </View>
            {months3.map(({ y, m }, idx) => {
              const days = new Date(y, m, 0).getDate();
              const isCurrent = idx === 0;
              return (
                <View key={`${y}-${m}`}
                  style={[s.monthHeader, {
                    width: days * DAY_W,
                    borderColor: C.border,
                    backgroundColor: isCurrent ? C.accent + '15' : 'transparent',
                  }]}>
                  <Text style={[s.monthText, {
                    color: isCurrent ? C.accent : C.text,
                    fontWeight: isCurrent ? '800' : '700',
                  }]}>{MF[m-1]} {y}</Text>
                </View>
              );
            })}
          </View>

          {/* Day numbers — show 1st of month + every Monday */}
          <View style={[s.row, { backgroundColor: C.sub }]}>
            <View style={[s.label, { height: 20 }]} />
            {allDays.map(d => {
              const dt  = new Date(d + 'T12:00:00');
              const dn  = dt.getDate();
              const dow = dt.getDay();
              const hol = isHoliday(d);
              const we  = isWeekend(d);
              const isToday = d === todayStr;
              const show = dn === 1 || dow === 1;
              return (
                <View key={d} style={[s.dayNumCell, {
                  width: DAY_W,
                  backgroundColor: isToday ? C.accent + '30'
                    : hol ? C.hol : we ? C.sub : 'transparent',
                  borderLeftWidth: dn === 1 ? 1 : 0,
                  borderLeftColor: C.border,
                }]}>
                  {show && <Text style={[s.dayNum, {
                    color: isToday ? C.accent : C.muted,
                    fontWeight: isToday ? '700' : '500',
                  }]}>{dn}</Text>}
                </View>
              );
            })}
          </View>

          {/* User rows */}
          {users.map(u => {
            const uv   = vacations.filter(v => v.user_id === u.id);
            const team = teams.find(t => t.id === u.team_id);
            const bal  = getVacationBalance(u.id, vacations, accruals[u.id] || 2.5);
            const isCurrentUser = u.id === currentUserId;
            return (
              <View key={u.id} style={[s.row, {
                height: ROW_H,
                borderTopWidth: 1,
                borderTopColor: C.border,
                backgroundColor: isCurrentUser ? C.accent + '08' : 'transparent',
              }]}>
                {/* Team-coloured left stripe + label */}
                <View style={[s.label, {
                  height: ROW_H,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  paddingHorizontal: 8,
                  borderLeftWidth: 3,
                  borderLeftColor: team?.color ?? '#6B7280',
                }]}>
                  <View style={[s.avatar, { backgroundColor: team?.color ?? '#6B7280' }]}>
                    <Text style={s.avatarText}>{initials(u.full_name)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.userName, { color: C.text }]} numberOfLines={1}>
                      {shortName(u.full_name)}
                    </Text>
                    {isMgr && (
                      <Text style={[s.userDays, { color: C.muted }]}>{bal.remaining}d left</Text>
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
                    const isToday = d === todayStr;
                    return (
                      <View key={d} style={{
                        position: 'absolute', left: i * DAY_W,
                        width: DAY_W, height: ROW_H,
                        backgroundColor: isToday ? C.accent + '15'
                          : hol ? C.hol + '60'
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
                        top: 8, height: 32,
                        backgroundColor: statusColor(v.status),
                        borderRadius: 16, zIndex: 2,
                        alignItems: 'center', justifyContent: 'center',
                        overflow: 'hidden',
                        paddingHorizontal: 4,
                      }}>
                        {blockW > 60 && (
                          <Text style={s.blockDateText} numberOfLines={1}>
                            {formatDisplayShort(v.start_date)} – {formatDisplayShort(v.end_date)}
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

          {/* Office count row (managers only) */}
          {isMgr && (
            <View style={[s.row, {
              height: 38, backgroundColor: C.sub,
              borderTopWidth: 2, borderTopColor: C.border,
            }]}>
              <View style={[s.label, { height: 38, justifyContent: 'center', paddingHorizontal: 8 }]}>
                <Text style={[s.labelText, { color: C.muted }]}>IN OFFICE</Text>
                <Text style={[s.userDays, { color: C.muted }]}>of {users.length}</Text>
              </View>
              <View style={{ width: totalW, height: 38, position: 'relative' }}>
                {allDays.map((d, i) => {
                  const dn  = new Date(d + 'T12:00:00').getDate();
                  const hol = isHoliday(d);
                  const we  = isWeekend(d);
                  const isToday = d === todayStr;
                  if (hol || we) return (
                    <View key={d} style={{
                      position: 'absolute', left: i * DAY_W,
                      width: DAY_W, height: 38,
                      backgroundColor: hol ? C.hol + '40' : C.sub,
                      borderLeftWidth: dn === 1 ? 1 : 0,
                      borderLeftColor: C.border,
                    }} />
                  );
                  const onVac  = (dailyVac[d] || []).length;
                  const present = users.length - onVac;
                  const pct    = onVac / users.length;
                  const bg     = isToday ? C.accent + '25'
                    : pct >= 0.5 ? '#FFEBEE'
                    : pct >= 0.3 ? '#FFF3E0'
                    : onVac > 0  ? '#E8F5E9' : 'transparent';
                  return (
                    <View key={d} style={{
                      position: 'absolute', left: i * DAY_W,
                      width: DAY_W, height: 38,
                      backgroundColor: bg,
                      borderLeftWidth: dn === 1 ? 1 : 0,
                      borderLeftColor: C.border,
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      {onVac > 0 && (
                        <Text style={{ color: '#1A2B3A', fontWeight: '800', fontSize: 9 }}>
                          {present}
                        </Text>
                      )}
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          {/* Today vertical line — draws across all rows */}
          {todayIndex >= 0 && (
            <View style={{
              position: 'absolute',
              left: LABEL_W + todayIndex * DAY_W + DAY_W / 2 - 1,
              top: 0,
              bottom: 0,
              width: 2,
              backgroundColor: C.accent,
              opacity: 0.55,
              zIndex: 10,
            }} pointerEvents="none" />
          )}

        </View>
      </ScrollView>

      {/* Legend */}
      <View style={[s.legend, { borderTopColor: C.border, backgroundColor: C.sub }]}>
        {[{c:'#2E7D32',l:'Approved'},{c:'#BF360C',l:'Pending'},{c:'#C62828',l:'Rejected'}].map(x => (
          <View key={x.l} style={s.legendItem}>
            <View style={[s.legendDot, { backgroundColor: x.c }]} />
            <Text style={[s.legendText, { color: C.muted }]}>{x.l}</Text>
          </View>
        ))}
        <View style={s.legendItem}>
          <View style={[s.legendLine, { backgroundColor: C.accent }]} />
          <Text style={[s.legendText, { color: C.muted }]}>Today</Text>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap:          { borderRadius: 14, borderWidth: 1, overflow: 'hidden', marginBottom: 14 },
  emptyState:    { padding: 32, alignItems: 'center', gap: 8 },
  emptyEmoji:    { fontSize: 36, marginBottom: 4 },
  emptyTitle:    { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  emptyText:     { fontSize: 13, textAlign: 'center', lineHeight: 18, paddingHorizontal: 20 },
  row:           { flexDirection: 'row' },
  label:         { width: LABEL_W, flexShrink: 0 },
  labelText:     { fontSize: 10, fontWeight: '700', letterSpacing: 0.4 },
  monthHeader:   { borderLeftWidth: 1, justifyContent: 'center', paddingLeft: 6 },
  monthText:     { fontSize: 11 },
  dayNumCell:    { height: 20, alignItems: 'center', justifyContent: 'center' },
  dayNum:        { fontSize: 8 },
  avatar:        { width: 24, height: 24, borderRadius: 12,
                   alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  avatarText:    { color: 'white', fontSize: 9, fontWeight: '700' },
  userName:      { fontSize: 11, fontWeight: '600' },
  userDays:      { fontSize: 9, marginTop: 1 },
  blockDateText: { color: 'white', fontSize: 8, opacity: 0.9 },
  blockDayText:  { color: 'white', fontSize: 9, fontWeight: '700' },
  legend:        { flexDirection: 'row', flexWrap: 'wrap', gap: 14,
                   padding: 10, borderTopWidth: 1, alignItems: 'center' },
  legendItem:    { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot:     { width: 10, height: 10, borderRadius: 5 },
  legendLine:    { width: 2, height: 12, opacity: 0.7 },
  legendText:    { fontSize: 11 },
});