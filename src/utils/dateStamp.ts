import type { DateFormat } from '@/types/settings';

export const DATE_FORMATS: readonly { id: DateFormat; label: string }[] = [
  { id: 'apostrophe', label: "'YY MM DD" },
  { id: 'dotted-full', label: 'YYYY.MM.DD' },
  { id: 'dotted-short', label: 'YY.MM.DD' },
  { id: 'us', label: 'MM/DD/YYYY' },
];

export function formatDateStamp(ms: number, format: DateFormat): string {
  const d = new Date(ms);
  const yyyy = String(d.getFullYear());
  const yy = yyyy.slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  switch (format) {
    case 'apostrophe':
      return `'${yy} ${mm} ${dd}`;
    case 'dotted-full':
      return `${yyyy}.${mm}.${dd}`;
    case 'dotted-short':
      return `${yy}.${mm}.${dd}`;
    case 'us':
      return `${mm}/${dd}/${yyyy}`;
  }
}
