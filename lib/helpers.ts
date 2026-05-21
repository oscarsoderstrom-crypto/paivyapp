import { FI_HOLIDAYS } from '../constants/holidays';
import type { VacationRequest, VacationBalance } from './types';

export const formatDate = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export const today = (): string => formatDate(new Date());

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

export const getCalendarCells = (year: number, month: number): (string | null)[] => {
  const cells: (string | null)[] = [];
  const firstDay = (new Date(year, month - 1, 1).getDay() + 6) % 7;
  for (let i = 0; i < firstDay; i++) cells.push(null);
  const daysInMonth = new Date(year, month, 0).getDate();
  for (let i = 1; i <= daysInMonth; i++) {
    cells.push(`${year}-${String(month).padStart(2, '0')}-${String(i).padStart(2, '0')}`);
  }
  return cells;
};

export const statusColor = (s: string) =>
  s === 'approved' ? '#2E7D32' : s === 'pending' ? '#BF360C' : '#C62828';

export const statusBg = (s: string) =>
  s === 'approved' ? '#E8F5E9' : s === 'pending' ? '#FFF3E0' : '#FFEBEE';
