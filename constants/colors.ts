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
    border: '#1C2E40',
    accent: '#E05C2A',
    hol:    '#1F1A04',
    sub:    '#111C28',
    green:  '#2E7D32',
    yellow: '#E64A19',
    red:    '#C62828',
  },
} as const;

export type Theme = typeof Colors.light | typeof Colors.dark;