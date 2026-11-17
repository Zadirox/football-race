const RU_MONTHS_GENITIVE = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
] as const;

function parseDateInput(value: string | number | Date): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const raw = String(value).trim();
  if (!raw) return null;
  // Treat plain YYYY-MM-DD as a calendar date (avoid TZ shifting by parsing parts).
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const da = Number(m[3]);
    const d = new Date(y, mo - 1, da);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "16 ноября" (без года) — удобно для списков дней/матчей. */
export function formatRuDayMonth(value: string | number | Date | null | undefined): string {
  if (value == null) return '—';
  const d = parseDateInput(value);
  if (!d) return '—';
  const day = d.getDate();
  const month = RU_MONTHS_GENITIVE[d.getMonth()] ?? '';
  return month ? `${day} ${month}` : String(day);
}

/** "16 ноября 2026" */
export function formatRuDayMonthYear(value: string | number | Date | null | undefined): string {
  if (value == null) return '—';
  const d = parseDateInput(value);
  if (!d) return '—';
  const day = d.getDate();
  const month = RU_MONTHS_GENITIVE[d.getMonth()] ?? '';
  const year = d.getFullYear();
  return month ? `${day} ${month} ${year}` : String(year);
}

export function formatRuDateRange(
  from: string | number | Date | null | undefined,
  to: string | number | Date | null | undefined,
): string {
  const a = formatRuDayMonthYear(from);
  const b = formatRuDayMonthYear(to);
  if (a === '—' && b === '—') return '—';
  return `${a} — ${b}`;
}

export function formatRuTimeMsk(value: string | number | Date | null | undefined): string {
  if (value == null) return '—';
  const d = typeof value === 'string' || typeof value === 'number' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Moscow',
  });
}

/** "16 ноября, 21:45 МСК" */
export function formatRuDateTimeMsk(value: string | number | Date | null | undefined): string {
  if (value == null) return '—';
  const d = typeof value === 'string' || typeof value === 'number' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  const dayMonth = d.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    timeZone: 'Europe/Moscow',
  });
  const time = d.toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Moscow',
  });
  return `${dayMonth}, ${time} МСК`;
}

/** Коротко для админских списков: "16 ноя, 21:45" МСК */
export function formatRuShortDateTimeMsk(value: string | number | Date | null | undefined): string {
  if (value == null) return '—';
  const d = typeof value === 'string' || typeof value === 'number' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Moscow',
  });
}

/** "16 ноября, 21:45" в МСК (без суффикса), для kickoff/компактных меток. */
export function formatRuKickoffMsk(value: string | number | Date | null | undefined): string {
  if (value == null) return '—';
  const d = typeof value === 'string' || typeof value === 'number' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Moscow',
  });
}
