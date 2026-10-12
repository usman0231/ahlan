import {
  EOD_DEFAULT_WORKFORCE_CATEGORIES,
  EOD_MAX_HOURS_PER_PERSON,
  compareDecimals,
  eodWorkforceTotals,
  normalizeLegacyWorkforceEntry,
  toDecimalString,
  workforceManHours,
  type EodWorkforceEntry,
} from '@ahlan/shared';

/**
 * EOD workforce rows: parsing what is stored, and the arithmetic the form
 * shows while the inspector types.
 *
 * Man-hours = personnel x hours, computed by the shared fixed-point helper
 * (`workforceManHours`) - the same function the API uses when it recomputes
 * the figure on arrival - so the device never does float maths on a number
 * that ends up in an official report.
 */

/** One editable row. Inputs stay strings so a half-typed "7." is not lost. */
export interface WorkforceRow {
  /** Stable React key; never sent to the server. */
  key: string;
  /** Stored value. For a default row this is the English constant. */
  category: string;
  personnel: string;
  hours: string;
}

const DEFAULT_CATEGORIES: readonly string[] = EOD_DEFAULT_WORKFORCE_CATEGORIES;

/** True for a row whose category is one of the shared defaults (label translated). */
export function isDefaultCategory(category: string): boolean {
  return DEFAULT_CATEGORIES.includes(category);
}

/** i18n key suffix for a default category, e.g. "LOC Staff" -> "locStaff". */
export function categoryKey(category: string): string {
  return category
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((part, index) => (index === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)))
    .join('');
}

let rowCounter = 0;
export function newRowKey(): string {
  rowCounter += 1;
  return `row-${Date.now().toString(36)}-${rowCounter}`;
}

/** The rows a new report starts with: every default category, zeroed. */
export function defaultWorkforceRows(): WorkforceRow[] {
  return DEFAULT_CATEGORIES.map((category) => ({
    key: newRowKey(),
    category,
    personnel: '',
    hours: '',
  }));
}

/**
 * Parses `workforce_json` defensively. Accepts the current shape and the
 * pre-wave-2 `{ contractor, headcount, manHours }` shape (existing drafts on
 * devices), mapped exactly as the API maps it; man-hours are always
 * recomputed, never trusted from storage. Corrupt input yields [].
 */
export function parseWorkforceJson(json: string | null | undefined): EodWorkforceEntry[] {
  if (!json) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const entries: EodWorkforceEntry[] = [];
  for (const raw of parsed) {
    const normalized = normalizeLegacyWorkforceEntry(raw);
    if (normalized === null || typeof normalized !== 'object') continue;
    const entry = normalized as Record<string, unknown>;
    const personnel = toPersonnel(entry.personnel);
    const hours = toHours(entry.hours);
    entries.push({
      category: typeof entry.category === 'string' ? entry.category : '',
      personnel,
      hours,
      manHours: workforceManHours({ personnel, hours }),
    });
  }
  return entries;
}

export function entriesToRows(entries: readonly EodWorkforceEntry[]): WorkforceRow[] {
  return entries.map((entry) => ({
    key: newRowKey(),
    category: entry.category,
    personnel: entry.personnel > 0 ? String(entry.personnel) : '',
    hours: compareDecimals(entry.hours, '0') > 0 ? trimHours(entry.hours) : '',
  }));
}

/** Rows to the stored/pushed shape. Blank custom rows are dropped. */
export function rowsToEntries(rows: readonly WorkforceRow[]): EodWorkforceEntry[] {
  return rows
    .filter((row) => row.category.trim().length > 0)
    .map((row) => {
      const personnel = toPersonnel(row.personnel);
      const hours = toHours(row.hours);
      return {
        category: row.category.trim(),
        personnel,
        hours,
        manHours: workforceManHours({ personnel, hours }),
      };
    });
}

/** Live man-hours for one row, as a 2dp string. */
export function rowManHours(row: Pick<WorkforceRow, 'personnel' | 'hours'>): string {
  return workforceManHours({ personnel: toPersonnel(row.personnel), hours: toHours(row.hours) });
}

export function rowTotals(rows: readonly WorkforceRow[]): {
  totalHeadcount: number;
  totalManHours: string;
} {
  return eodWorkforceTotals(
    rows.map((row) => ({ personnel: toPersonnel(row.personnel), hours: toHours(row.hours) })),
  );
}

/** Keeps digits only; personnel is a whole number of people. */
export function sanitizePersonnelInput(text: string): string {
  return text.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, 6);
}

/**
 * Keeps one decimal point and at most two decimals, and caps at 24 - an
 * inspector cannot record more hours per person than a day has.
 */
export function sanitizeHoursInput(text: string): string {
  const normalized = text.replace(',', '.').replace(/[^0-9.]/g, '');
  const [whole = '', ...rest] = normalized.split('.');
  const hasPoint = normalized.includes('.');
  const fraction = rest.join('').slice(0, 2);
  const value = `${whole.slice(0, 2)}${hasPoint ? `.${fraction}` : ''}`;
  if (value === '' || value === '.') return value;
  try {
    if (compareDecimals(value, EOD_MAX_HOURS_PER_PERSON) > 0) return '24';
  } catch {
    return '';
  }
  return value;
}

/** Whether a row's hours input is out of range (shown as a field error). */
export function hoursOutOfRange(text: string): boolean {
  if (text.trim() === '') return false;
  try {
    const value = toDecimalString(text);
    return compareDecimals(value, '0') < 0 || compareDecimals(value, EOD_MAX_HOURS_PER_PERSON) > 0;
  } catch {
    return true;
  }
}

function toPersonnel(value: unknown): number {
  const number = typeof value === 'number' ? value : Number(String(value ?? '').trim() || 0);
  return Number.isInteger(number) && number > 0 ? number : 0;
}

function toHours(value: unknown): string {
  try {
    const text = typeof value === 'number' || typeof value === 'string' ? String(value) : '0';
    const decimal = toDecimalString(text === '' || text === '.' ? '0' : text);
    if (compareDecimals(decimal, '0') < 0) return '0.00';
    if (compareDecimals(decimal, EOD_MAX_HOURS_PER_PERSON) > 0) return EOD_MAX_HOURS_PER_PERSON;
    return decimal;
  } catch {
    return '0.00';
  }
}

/** "8.50" -> "8.5", "8.00" -> "8": what a person would have typed. */
function trimHours(hours: string): string {
  return hours.replace(/\.?0+$/, '');
}
