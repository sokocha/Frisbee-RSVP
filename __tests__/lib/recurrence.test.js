/**
 * Unit tests for recurrence helpers (lib/recurrence.js)
 */

import { getNthDayOfMonth, getMonthlyPeriodId, getWeeklyPeriodId, getCurrentPeriodId } from '../../lib/recurrence';

// ─────────────────────────────────────────────────────────────
// getNthDayOfMonth
// ─────────────────────────────────────────────────────────────

describe('getNthDayOfMonth', () => {
  test('finds the 1st Saturday of January 2026', () => {
    // January 2026: 1st is Thursday, so 1st Saturday is Jan 3
    const result = getNthDayOfMonth(2026, 0, 6, 1);
    expect(result).not.toBeNull();
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(0);
    expect(result.getDay()).toBe(6); // Saturday
    expect(result.getDate()).toBe(3);
  });

  test('finds the 2nd Saturday of January 2026', () => {
    const result = getNthDayOfMonth(2026, 0, 6, 2);
    expect(result).not.toBeNull();
    expect(result.getDate()).toBe(10);
    expect(result.getDay()).toBe(6);
  });

  test('finds the 3rd Sunday of March 2026', () => {
    // March 2026: 1st is Sunday, so 3rd Sunday is March 15
    const result = getNthDayOfMonth(2026, 2, 0, 3);
    expect(result).not.toBeNull();
    expect(result.getDate()).toBe(15);
    expect(result.getDay()).toBe(0);
  });

  test('finds the 4th Friday of February 2026', () => {
    // February 2026: 1st is Sunday, first Friday is Feb 6
    // Fridays: 6, 13, 20, 27
    const result = getNthDayOfMonth(2026, 1, 5, 4);
    expect(result).not.toBeNull();
    expect(result.getDate()).toBe(27);
    expect(result.getDay()).toBe(5);
  });

  test('returns null when 5th occurrence does not exist', () => {
    // There's no 5th Saturday in most months
    const result = getNthDayOfMonth(2026, 1, 6, 5);
    expect(result).toBeNull();
  });

  test('finds the last Saturday of January 2026', () => {
    // January 2026: Saturdays are 3, 10, 17, 24, 31
    const result = getNthDayOfMonth(2026, 0, 6, 'last');
    expect(result).not.toBeNull();
    expect(result.getDate()).toBe(31);
    expect(result.getDay()).toBe(6);
  });

  test('finds the last Sunday of February 2026', () => {
    // February 2026: 28 days, last day is Saturday Feb 28
    // Sundays: 1, 8, 15, 22 — last Sunday is 22
    const result = getNthDayOfMonth(2026, 1, 0, 'last');
    expect(result).not.toBeNull();
    expect(result.getDate()).toBe(22);
    expect(result.getDay()).toBe(0);
  });

  test('handles leap year February correctly', () => {
    // 2028 is a leap year, February has 29 days
    // Feb 2028: 1st is Tuesday
    // Tuesdays: 1, 8, 15, 22, 29 — last Tuesday is 29
    const result = getNthDayOfMonth(2028, 1, 2, 'last');
    expect(result).not.toBeNull();
    expect(result.getDate()).toBe(29);
    expect(result.getDay()).toBe(2);
  });

  test('finds 1st Monday of every month for a year', () => {
    for (let month = 0; month < 12; month++) {
      const result = getNthDayOfMonth(2026, month, 1, 1);
      expect(result).not.toBeNull();
      expect(result.getDay()).toBe(1); // Monday
      expect(result.getDate()).toBeLessThanOrEqual(7); // Must be in first 7 days
    }
  });
});

// ─────────────────────────────────────────────────────────────
// getMonthlyPeriodId
// ─────────────────────────────────────────────────────────────

describe('getMonthlyPeriodId', () => {
  const originalDate = global.Date;

  afterEach(() => {
    global.Date = originalDate;
  });

  function mockDate(dateString) {
    const fixed = new originalDate(dateString);
    global.Date = class extends originalDate {
      constructor(...args) {
        if (args.length === 0) return fixed;
        return new originalDate(...args);
      }
      static now() { return fixed.getTime(); }
    };
  }

  test('returns monthly period ID for 2nd Saturday in January 2026', () => {
    mockDate('2026-01-10T12:00:00Z');
    const settings = {
      gameInfo: { gameDay: 6, monthlyOccurrence: 2, recurrence: 'monthly' },
    };
    const result = getMonthlyPeriodId(settings, 'UTC');
    expect(result).toBe('2026-M01-2SAT');
  });

  test('returns monthly period ID for last Sunday in March 2026', () => {
    mockDate('2026-03-15T12:00:00Z');
    const settings = {
      gameInfo: { gameDay: 0, monthlyOccurrence: 'last', recurrence: 'monthly' },
    };
    const result = getMonthlyPeriodId(settings, 'UTC');
    expect(result).toBe('2026-M03-LSUN');
  });

  test('returns monthly period ID for 1st Wednesday in December 2026', () => {
    mockDate('2026-12-01T12:00:00Z');
    const settings = {
      gameInfo: { gameDay: 3, monthlyOccurrence: 1, recurrence: 'monthly' },
    };
    const result = getMonthlyPeriodId(settings, 'UTC');
    expect(result).toBe('2026-M12-1WED');
  });
});

// ─────────────────────────────────────────────────────────────
// getWeeklyPeriodId
// ─────────────────────────────────────────────────────────────

describe('getWeeklyPeriodId', () => {
  const originalDate = global.Date;

  afterEach(() => {
    global.Date = originalDate;
  });

  function mockDate(dateString) {
    const fixed = new originalDate(dateString);
    global.Date = class extends originalDate {
      constructor(...args) {
        if (args.length === 0) return fixed;
        return new originalDate(...args);
      }
      static now() { return fixed.getTime(); }
    };
  }

  test('returns weekly period ID format', () => {
    mockDate('2026-01-26T12:00:00Z');
    const result = getWeeklyPeriodId('UTC');
    expect(result).toMatch(/^2026-W\d{2}$/);
  });

  test('returns consistent ID for same week', () => {
    mockDate('2026-01-26T12:00:00Z');
    const monday = getWeeklyPeriodId('UTC');
    mockDate('2026-01-27T12:00:00Z');
    const tuesday = getWeeklyPeriodId('UTC');
    // Both should be the same week
    // Note: due to the calculation method, these should be same week
    expect(monday).toBe(tuesday);
  });
});

// ─────────────────────────────────────────────────────────────
// getCurrentPeriodId
// ─────────────────────────────────────────────────────────────

describe('getCurrentPeriodId', () => {
  const originalDate = global.Date;

  afterEach(() => {
    global.Date = originalDate;
  });

  function mockDate(dateString) {
    const fixed = new originalDate(dateString);
    global.Date = class extends originalDate {
      constructor(...args) {
        if (args.length === 0) return fixed;
        return new originalDate(...args);
      }
      static now() { return fixed.getTime(); }
    };
  }

  test('returns weekly ID when recurrence is weekly', () => {
    mockDate('2026-01-26T12:00:00Z');
    const settings = {
      gameInfo: { recurrence: 'weekly', gameDay: 6 },
    };
    const result = getCurrentPeriodId(settings, 'UTC');
    expect(result).toMatch(/^2026-W\d{2}$/);
  });

  test('returns monthly ID when recurrence is monthly', () => {
    mockDate('2026-01-26T12:00:00Z');
    const settings = {
      gameInfo: { recurrence: 'monthly', gameDay: 6, monthlyOccurrence: 2 },
    };
    const result = getCurrentPeriodId(settings, 'UTC');
    expect(result).toBe('2026-M01-2SAT');
  });

  test('defaults to weekly when recurrence is not set', () => {
    mockDate('2026-01-26T12:00:00Z');
    const settings = {
      gameInfo: { gameDay: 6 },
    };
    const result = getCurrentPeriodId(settings, 'UTC');
    expect(result).toMatch(/^2026-W\d{2}$/);
  });

  test('defaults to weekly when settings is null', () => {
    mockDate('2026-01-26T12:00:00Z');
    const result = getCurrentPeriodId(null, 'UTC');
    expect(result).toMatch(/^2026-W\d{2}$/);
  });
});
