import { FI_HOLIDAYS } from '../constants/holidays';
import type { VacationRequest, VacationBalance } from './types';

export const formatDate = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export const today = (): string => formatDate(new Date());

// "2026-03-22" → "22.03.2026" (Finnish display format)
export const formatDisplay = (d: string): string => {
  if (!d || d.length !== 10) return d;
  const [y, m, day] = d.split('-');
  return `${day}.${m}.${y}`;
};

// "2026-03-22" → "22.03" (short form for tight spaces like Gantt blocks)
export const formatDisplayShort = (d: string): string => {
  if (!d || d.length !== 10) return d;
  const [, m, day] = d.split('-');
  return `${day}.${m}`;
};

// "22.03.2026" → "2026-03-22"; returns null if invalid
export const parseDisplay = (d: string): string | null => {
  const m = d.trim().match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})$/);
  if (!m) return null;
  const day   = m[1].padStart(2, '0');
  const month = m[2].padStart(2, '0');
  const year  = m[3];
  return `${year}-${month}-${day}`;
};

export const isWeekend = (dateStr: string): boolean => {
  const d = new Date(dateStr + 'T12:00:00').getDay();
  return d === 0 || d === 6;
};

export const isHoliday = (dateStr: string): boolean =>
  !!FI_HOLIDAYS[dateStr];

export const isNonWorkday = (dateStr: string): boolean =>
  isWeekend(dateStr) || isHoliday(dateStr);

export const getDateRange = (start: string, end: string): string[] => {
  const dates: string[] = [];
  const d = new Date(start + 'T12:00:00');
  const e = new Date(end + 'T12:00:00');
  while (d <= e) {
    dates.push(formatDate(d));
    d.setDate(d.getDate() + 1);
  }
  return dates;
};

export const countWorkdays = (start: string, end: string): number =>
  getDateRange(start, end).filter(d => !isNonWorkday(d)).length;

export const getVacationBalance = (
  userId: string,
  vacations: VacationRequest[],
  accrualRate: number = 2.5,
): VacationBalance => {
  const total = Math.floor(accrualRate * 12);
  const used  = vacations
    .filter(v => v.user_id === userId && v.status !== 'rejected')
    .reduce((sum, v) => sum + countWorkdays(v.start_date, v.end_date), 0);
  return { total, used, remaining: total - used };
};

// New: calendar cells include trailing days from previous/next months
export interface CalendarCell {
  date:         string;
  currentMonth: boolean;
}

export const getCalendarCells = (year: number, month: number): CalendarCell[] => {
  const cells: CalendarCell[] = [];
  const firstDay = (new Date(year, month - 1, 1).getDay() + 6) % 7;

  // Trailing days from previous month
  if (firstDay > 0) {
    const prevLastDay = new Date(year, month - 1, 0).getDate();
    let py = year, pm = month - 1;
    if (pm === 0) { pm = 12; py--; }
    for (let i = firstDay - 1; i >= 0; i--) {
      const day = prevLastDay - i;
      cells.push({
        date: `${py}-${String(pm).padStart(2,'0')}-${String(day).padStart(2,'0')}`,
        currentMonth: false,
      });
    }
  }

  // Current month
  const daysInMonth = new Date(year, month, 0).getDate();
  for (let i = 1; i <= daysInMonth; i++) {
    cells.push({
      date: `${year}-${String(month).padStart(2,'0')}-${String(i).padStart(2,'0')}`,
      currentMonth: true,
    });
  }

  // Leading days from next month to fill the last row
  const remaining = (7 - (cells.length % 7)) % 7;
  if (remaining > 0) {
    let ny = year, nm = month + 1;
    if (nm === 13) { nm = 1; ny++; }
    for (let i = 1; i <= remaining; i++) {
      cells.push({
        date: `${ny}-${String(nm).padStart(2,'0')}-${String(i).padStart(2,'0')}`,
        currentMonth: false,
      });
    }
  }

  return cells;
};
// Is this date a "workday" for a user, considering their workweek setting?
// - Mon-Fri user: weekdays only (excludes weekends + holidays)
// - Mon-Sun user: every day except holidays
export const isWorkdayForUser = (
  date: string,
  workweek: 'mon-fri' | 'mon-sun' = 'mon-fri',
): boolean => {
  if (isHoliday(date)) return false;
  if (workweek === 'mon-sun') return true;
  return !isWeekend(date);
};
export const statusColor = (s: string) =>
  s === 'approved' ? '#2E7D32' : s === 'pending' ? '#BF360C' : '#C62828';

export const statusBg = (s: string) =>
  s === 'approved' ? '#E8F5E9' : s === 'pending' ? '#FFF3E0' : '#FFEBEE';