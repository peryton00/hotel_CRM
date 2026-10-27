/**
 * Date Range Utilities for Reporting, Financials, COGS, and Wastage Analytics.
 * Handles inclusive calendar day boundaries, local time conversions,
 * month/year rollovers, custom range validations, and empty state checks.
 */

export type DateRangePreset =
  | 'today'
  | 'yesterday'
  | 'last_7_days'
  | 'last_30_days'
  | 'this_month'
  | 'previous_month'
  | 'custom'
  | 'all';

export interface DateRangeFilter {
  preset: DateRangePreset;
  label: string;
  startDate: string; // ISO or YYYY-MM-DD
  endDate: string; // ISO or YYYY-MM-DD
  startMs: number; // Inclusive start timestamp in ms (00:00:00.000 local)
  endMs: number; // Inclusive end timestamp in ms (23:59:59.999 local)
  isValid: boolean;
  errorMessage?: string;
}

/**
 * Formats a Date object to local YYYY-MM-DD string.
 */
export function formatLocalDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Creates start-of-day Date (00:00:00.000 local).
 */
export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

/**
 * Creates end-of-day Date (23:59:59.999 local).
 */
export function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

/**
 * Parses YYYY-MM-DD into a local Date object.
 */
export function parseLocalYmd(ymd: string): Date | null {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const [y, m, d] = ymd.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  if (isNaN(date.getTime())) return null;
  return date;
}

/**
 * Authoritative factory for DateRangeFilter based on preset and optional custom dates.
 * Reference date defaults to now (can be overridden for deterministic testing).
 */
export function computeDateRange(
  preset: DateRangePreset,
  customStart?: string,
  customEnd?: string,
  referenceNow = new Date(),
): DateRangeFilter {
  const now = referenceNow;

  switch (preset) {
    case 'today': {
      const start = startOfDay(now);
      const end = endOfDay(now);
      return {
        preset,
        label: 'Today',
        startDate: formatLocalDate(start),
        endDate: formatLocalDate(end),
        startMs: start.getTime(),
        endMs: end.getTime(),
        isValid: true,
      };
    }

    case 'yesterday': {
      const yest = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      const start = startOfDay(yest);
      const end = endOfDay(yest);
      return {
        preset,
        label: 'Yesterday',
        startDate: formatLocalDate(start),
        endDate: formatLocalDate(end),
        startMs: start.getTime(),
        endMs: end.getTime(),
        isValid: true,
      };
    }

    case 'last_7_days': {
      // 7 days inclusive: 6 days ago 00:00 to today 23:59:59.999
      const past = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
      const start = startOfDay(past);
      const end = endOfDay(now);
      return {
        preset,
        label: 'Last 7 Days',
        startDate: formatLocalDate(start),
        endDate: formatLocalDate(end),
        startMs: start.getTime(),
        endMs: end.getTime(),
        isValid: true,
      };
    }

    case 'last_30_days': {
      // 30 days inclusive: 29 days ago 00:00 to today 23:59:59.999
      const past = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);
      const start = startOfDay(past);
      const end = endOfDay(now);
      return {
        preset,
        label: 'Last 30 Days',
        startDate: formatLocalDate(start),
        endDate: formatLocalDate(end),
        startMs: start.getTime(),
        endMs: end.getTime(),
        isValid: true,
      };
    }

    case 'this_month': {
      // 1st of current month 00:00 to end of current month
      const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      const end = endOfDay(lastDayOfMonth);
      return {
        preset,
        label: 'This Month',
        startDate: formatLocalDate(start),
        endDate: formatLocalDate(end),
        startMs: start.getTime(),
        endMs: end.getTime(),
        isValid: true,
      };
    }

    case 'previous_month': {
      // 1st of previous month to last day of previous month
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
      const lastDayOfPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0);
      const end = endOfDay(lastDayOfPrevMonth);
      return {
        preset,
        label: 'Previous Month',
        startDate: formatLocalDate(start),
        endDate: formatLocalDate(end),
        startMs: start.getTime(),
        endMs: end.getTime(),
        isValid: true,
      };
    }

    case 'custom': {
      if (!customStart || !customEnd) {
        return {
          preset,
          label: 'Custom Range',
          startDate: customStart || '',
          endDate: customEnd || '',
          startMs: 0,
          endMs: 0,
          isValid: false,
          errorMessage: 'Both start date and end date are required for a custom range.',
        };
      }

      const parsedStart = parseLocalYmd(customStart);
      const parsedEnd = parseLocalYmd(customEnd);

      if (!parsedStart || !parsedEnd) {
        return {
          preset,
          label: 'Custom Range',
          startDate: customStart,
          endDate: customEnd,
          startMs: 0,
          endMs: 0,
          isValid: false,
          errorMessage: 'Invalid date format. Expected YYYY-MM-DD.',
        };
      }

      const start = startOfDay(parsedStart);
      const end = endOfDay(parsedEnd);

      if (end.getTime() < start.getTime()) {
        return {
          preset,
          label: 'Custom Range',
          startDate: customStart,
          endDate: customEnd,
          startMs: start.getTime(),
          endMs: end.getTime(),
          isValid: false,
          errorMessage: 'End date cannot be earlier than start date.',
        };
      }

      return {
        preset,
        label: `${customStart} to ${customEnd}`,
        startDate: customStart,
        endDate: customEnd,
        startMs: start.getTime(),
        endMs: end.getTime(),
        isValid: true,
      };
    }

    case 'all':
    default: {
      return {
        preset: 'all',
        label: 'All Time',
        startDate: '',
        endDate: '',
        startMs: 0,
        endMs: Number.MAX_SAFE_INTEGER,
        isValid: true,
      };
    }
  }
}

/**
 * Checks whether an ISO date string or millisecond timestamp falls inclusively within the range.
 */
export function isTimestampInRange(
  timestamp: string | number | undefined | null,
  range: DateRangeFilter,
): boolean {
  if (!range.isValid) return false;
  if (!timestamp) return false;

  const ms = typeof timestamp === 'number' ? timestamp : new Date(timestamp).getTime();
  if (isNaN(ms)) return false;

  if (range.preset === 'all') return true;

  return ms >= range.startMs && ms <= range.endMs;
}
