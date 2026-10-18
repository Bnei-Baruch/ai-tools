import type { ErrorCategory } from '../../api/review';

export const CATEGORIES: { id: ErrorCategory; key: string; label: string; hint: string; example: string }[] = [
  {
    id: 'A', key: '1', label: 'משנה משמעות',
    hint: 'מילה אחרת, "לא" שנשמט, מונח שהוחלף; דיבור שלא נכתב או טקסט שלא נאמר',
    example: 'נאמר "אי אפשר להשיג", נכתב "אפשר להשיג"',
  },
  {
    id: 'B', key: '2', label: 'מונח / שם / ציטוט שגוי',
    hint: 'המשמעות מובנת, אבל מונח, שם או ציטוט כתוב לא נכון',
    example: 'נאמר "בעל הסולם", נכתב "בעל הסולן"',
  },
  {
    id: 'C', key: '3', label: 'זניח',
    hint: 'פיסוק, כתיב, מילות מילוי',
    example: 'חסר פסיק; "אמא" במקום "אימא"; "אה" מיותר',
  },
];

