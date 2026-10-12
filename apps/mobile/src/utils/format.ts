import { daysBetween, type IsoDate } from '@ahlan/shared';

/**
 * Display formatting.
 *
 * Every date and time an inspector sees is rendered in the stadium's own time
 * zone, never the device's: somebody travelling between venues must still see
 * the day the record belongs to.
 */

export function formatPercent(value: number | null, fallback = '—'): string {
  return value === null ? fallback : `${value.toFixed(1)}%`;
}

export function formatPercentExact(value: number | null, fallback = '—'): string {
  return value === null ? fallback : `${value.toFixed(2)}%`;
}

export function formatInt(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : new Intl.NumberFormat().format(value);
}

/** Man-hours arrive as a 2dp decimal string and are shown with separators. */
export function formatDecimal(value: string | null | undefined): string {
  if (!value) return '—';
  const [whole = '0', fraction = '00'] = value.split('.');
  return `${new Intl.NumberFormat().format(Number(whole))}.${fraction}`;
}

export function formatTime(instant: number | Date, timeZone: string, locale = 'en'): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(instant);
}

export function formatDate(instant: number | Date, timeZone: string, locale = 'en'): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    day: 'numeric',
    month: 'short',
  }).format(instant);
}

/**
 * "Tuesday, 6 October", for a screen heading.
 *
 * The locale is passed explicitly rather than left to the platform default:
 * the app's language is a setting the user chose, and an Arabic session
 * showing an English weekday is the one place the translation visibly leaks.
 */
export function formatLongDate(instant: number | Date, locale = 'en'): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(instant);
}

/** Clock time in the device's own zone, for "last synced at". */
export function formatLocalTime(instant: number | Date, locale = 'en'): string {
  return new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(instant);
}

export function formatDateTime(instant: number | Date, timeZone: string, locale = 'en'): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(instant);
}

/** "2h 15m" style countdown, for the EOD submission window. */
export function formatCountdown(ms: number): string {
  if (ms <= 0) return '0m';
  const totalMinutes = Math.floor(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

/** Relative day label, for list rows: "Today", "Yesterday" or a date. */
export function relativeDay(
  date: IsoDate,
  today: IsoDate,
  labels: { today: string; yesterday: string },
  locale = 'en',
): string {
  const diff = daysBetween(date, today);
  if (diff === 0) return labels.today;
  if (diff === 1) return labels.yesterday;
  return new Intl.DateTimeFormat(locale, {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
  }).format(new Date(`${date}T00:00:00Z`));
}

/** "4 minutes ago" for the last-synced line. */
export function timeAgo(timestamp: number | null, neverLabel: string): string {
  if (!timestamp) return neverLabel;
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part.charAt(0).toUpperCase()).join('') || '?';
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
