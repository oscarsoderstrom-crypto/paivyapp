export const DAY_TYPES = [
  { id: 'office',     label: 'In Office',         emoji: '🏢', color: '#1565C0' },
  { id: 'home',       label: 'Work from Home',    emoji: '🏠', color: '#6A1B9A' },
  { id: 'vac-paid',   label: 'Vacation (Paid)',   emoji: '🌴', color: '#1B5E20' },
  { id: 'vac-unpaid', label: 'Vacation (Unpaid)', emoji: '🏖️', color: '#546E7A' },
  { id: 'sick',       label: 'Sick Leave',        emoji: '🤒', color: '#B71C1C' },
  { id: 'trip-dom',   label: 'Work Trip (FI)',    emoji: '🚂', color: '#E65100' },
  { id: 'trip-int',   label: 'Work Trip (INT)',   emoji: '✈️', color: '#880E4F' },
  { id: 'off',        label: 'Day Off / No Shift',emoji: '🌙', color: '#78909C' },
] as const;

export type DayTypeId = typeof DAY_TYPES[number]['id'];