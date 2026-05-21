export const Colors = {
  light: {
    bg:     '#F0EDE6',
    nav:    '#192A3A',
    card:   '#FFFFFF',
    text:   '#192A3A',
    muted:  '#8090A4',
    border: '#E3DDD4',
    accent: '#E05C2A',
    hol:    '#FFFDE7',
    sub:    '#F8F5F0',
    green:  '#1B5E20',
    yellow: '#BF360C',
    red:    '#B71C1C',
  },
  dark: {
    bg:     '#0C1520',
    nav:    '#070F1A',
    card:   '#162030',
    text:   '#C8D8E8',
    muted:  '#4A6075',
    bord

cat > constants/dayTypes.ts << 'EOF'
export const DAY_TYPES = [
  { id: 'office',     label: 'In Office',         emoji: '🏢', color: '#1565C0' },
  { id: 'home',       label: 'Work from Home',    emoji: '🏠', color: '#6A1B9A' },
  { id: 'vac-paid',   label: 'Vacation (Paid)',   emoji: '🌴', color: '#1B5E20' },
  { id: 'vac-unpaid', label: 'Vacation (Unpaid)', emoji: '🏖️', color: '#546E7A' },
  { id: 'sick',       label: 'Sick Leave',        emoji: '🤒', color: '#B71C1C' },
  { id: 'trip-dom',   label: 'Work Trip (FI)',    emoji: '🚂', color: '#E65100' },
  { id: 'trip-int',   label: 'Work Trip (INT)',   emoji: '✈️', color: '#880E4F' },
] as const;

export type DayTypeId = typeof DAY_TYPES[number]['id'];
