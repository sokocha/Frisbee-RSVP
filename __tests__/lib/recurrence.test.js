/**
 * Unit tests for recurrence helpers (lib/recurrence.js)
 */

import { getNthDayOfMonth, getMonthlyPeriodId, getWeeklyPeriodId, getCurrentPeriodId, isFormOpen, isFormOpenWeekly, isFormOpenMonthly } from '../../lib/recurrence';

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
    // 2nd Saturday of Jan 2026 is Jan 10. On Jan 10 at noon, we are still in that period.
    mockDate('2026-01-10T12:00:00Z');
    const settings = {
      gameInfo: { gameDay: 6, monthlyOccurrence: 2, recurrence: 'monthly' },
    };
    const result = getMonthlyPeriodId(settings, 'UTC');
    expect(result).toBe('2026-M01-2SAT');
  });

  test('returns monthly period ID for last Sunday in March 2026', () => {
    // Last Sunday of Mar 2026 is Mar 29. On Mar 15, we are leading up to that game.
    mockDate('2026-03-15T12:00:00Z');
    const settings = {
      gameInfo: { gameDay: 0, monthlyOccurrence: 'last', recurrence: 'monthly' },
    };
    const result = getMonthlyPeriodId(settings, 'UTC');
    expect(result).toBe('2026-M03-LSUN');
  });

  test('returns monthly period ID for 1st Wednesday in December 2026', () => {
    // 1st Wednesday of Dec 2026 is Dec 2. On Dec 1, we are leading up to that game.
    mockDate('2026-12-01T12:00:00Z');
    const settings = {
      gameInfo: { gameDay: 3, monthlyOccurrence: 1, recurrence: 'monthly' },
    };
    const result = getMonthlyPeriodId(settings, 'UTC');
    expect(result).toBe('2026-M12-1WED');
  });

  test('rolls to next month period after midnight following game day', () => {
    // 2nd Saturday of Jan 2026 is Jan 10.
    // At midnight Jan 11 (day after game), the period should roll to February.
    // 2nd Saturday of Feb 2026 is Feb 14.
    mockDate('2026-01-11T00:00:00Z');
    const settings = {
      gameInfo: { gameDay: 6, monthlyOccurrence: 2, recurrence: 'monthly' },
    };
    const result = getMonthlyPeriodId(settings, 'UTC');
    expect(result).toBe('2026-M02-2SAT');
  });

  test('stays in current period on game day before midnight', () => {
    // 2nd Saturday of Jan 2026 is Jan 10.
    // At 11pm on Jan 10, we are still in the Jan period.
    mockDate('2026-01-10T23:00:00Z');
    const settings = {
      gameInfo: { gameDay: 6, monthlyOccurrence: 2, recurrence: 'monthly' },
    };
    const result = getMonthlyPeriodId(settings, 'UTC');
    expect(result).toBe('2026-M01-2SAT');
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
    const settings = { gameInfo: { gameDay: 4 } }; // Thursday
    const result = getWeeklyPeriodId(settings, 'UTC');
    expect(result).toMatch(/^2026-W\d{2}$/);
  });

  test('returns consistent ID within same game-week period', () => {
    const settings = { gameInfo: { gameDay: 4 } }; // Thursday game
    // Jan 26 is Monday, Jan 27 is Tuesday — both before Thursday game
    mockDate('2026-01-26T12:00:00Z');
    const monday = getWeeklyPeriodId(settings, 'UTC');
    mockDate('2026-01-27T12:00:00Z');
    const tuesday = getWeeklyPeriodId(settings, 'UTC');
    expect(monday).toBe(tuesday);
  });

  test('period changes at midnight after game day', () => {
    const settings = { gameInfo: { gameDay: 4 } }; // Thursday game
    // Jan 29 2026 is Thursday (game day), Jan 30 is Friday (reset day)
    mockDate('2026-01-29T23:59:00Z'); // Thursday 11:59pm - still current period
    const beforeReset = getWeeklyPeriodId(settings, 'UTC');
    mockDate('2026-01-30T00:00:00Z'); // Friday midnight - new period
    const afterReset = getWeeklyPeriodId(settings, 'UTC');
    expect(beforeReset).not.toBe(afterReset);
  });

  test('game day stays in current period', () => {
    const settings = { gameInfo: { gameDay: 4 } }; // Thursday game
    // Jan 29 2026 is Thursday
    mockDate('2026-01-29T12:00:00Z'); // Thursday noon
    const onGameDay = getWeeklyPeriodId(settings, 'UTC');
    mockDate('2026-01-28T12:00:00Z'); // Wednesday (day before game)
    const dayBefore = getWeeklyPeriodId(settings, 'UTC');
    expect(onGameDay).toBe(dayBefore);
  });

  test('handles null settings by defaulting gameDay to Sunday', () => {
    mockDate('2026-01-26T12:00:00Z');
    const result = getWeeklyPeriodId(null, 'UTC');
    expect(result).toMatch(/^2026-W\d{2}$/);
  });

  test('handles Saturday game day (wrap around to Sunday reset)', () => {
    const settings = { gameInfo: { gameDay: 6 } }; // Saturday game
    // Jan 31 2026 is Saturday (game day)
    mockDate('2026-01-31T23:00:00Z'); // Saturday 11pm - current period
    const saturdayNight = getWeeklyPeriodId(settings, 'UTC');
    // Feb 1 2026 is Sunday (reset day)
    mockDate('2026-02-01T00:00:00Z'); // Sunday midnight - new period
    const sundayMidnight = getWeeklyPeriodId(settings, 'UTC');
    expect(saturdayNight).not.toBe(sundayMidnight);
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
    // Jan 26 is after Jan 10 (2nd Sat) reset, so should be Feb period
    expect(result).toBe('2026-M02-2SAT');
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

// ─────────────────────────────────────────────────────────────
// isFormOpen
// ─────────────────────────────────────────────────────────────

describe('isFormOpen', () => {
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

  test('returns open when accessPeriod is not enabled', () => {
    const settings = { accessPeriod: { enabled: false } };
    const result = isFormOpen(settings);
    expect(result.isOpen).toBe(true);
    expect(result.message).toBeNull();
  });

  test('returns open when accessPeriod is missing', () => {
    const settings = {};
    const result = isFormOpen(settings);
    expect(result.isOpen).toBe(true);
    expect(result.message).toBeNull();
  });

  test('delegates to weekly logic when recurrence is weekly', () => {
    // Monday 9am → Wednesday 6pm window, current time Tuesday noon = open
    mockDate('2026-01-27T12:00:00Z');
    const settings = {
      accessPeriod: {
        enabled: true,
        timezone: 'UTC',
        startDay: 1, startHour: 9, startMinute: 0,
        endDay: 3, endHour: 18, endMinute: 0,
      },
      gameInfo: { recurrence: 'weekly', gameDay: 3 },
    };
    const result = isFormOpen(settings);
    expect(result.isOpen).toBe(true);
  });

  test('delegates to weekly logic by default when recurrence is not set', () => {
    mockDate('2026-01-27T12:00:00Z');
    const settings = {
      accessPeriod: {
        enabled: true,
        timezone: 'UTC',
        startDay: 1, startHour: 9, startMinute: 0,
        endDay: 3, endHour: 18, endMinute: 0,
      },
      gameInfo: { gameDay: 3 },
    };
    const result = isFormOpen(settings);
    expect(result.isOpen).toBe(true);
  });

  test('delegates to monthly logic when recurrence is monthly', () => {
    // 2nd Saturday of Jan 2026 is Jan 10.
    // Window: Wed Jan 7 9am → Fri Jan 9 6pm
    // Jan 5 is outside window = closed
    mockDate('2026-01-05T12:00:00Z');
    const settings = {
      accessPeriod: {
        enabled: true,
        timezone: 'UTC',
        startDay: 3, startHour: 9, startMinute: 0,
        endDay: 5, endHour: 18, endMinute: 0,
      },
      gameInfo: { recurrence: 'monthly', gameDay: 6, monthlyOccurrence: 2 },
    };
    const result = isFormOpen(settings);
    expect(result.isOpen).toBe(false);
    expect(result.message).toContain('2nd');
    expect(result.message).toContain('Saturday');
  });
});

// ─────────────────────────────────────────────────────────────
// isFormOpenWeekly
// ─────────────────────────────────────────────────────────────

describe('isFormOpenWeekly', () => {
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

  // Helper: Wednesday=3, opens Mon 9am, closes Wed 6pm
  const weeklySettings = {
    accessPeriod: {
      enabled: true,
      timezone: 'UTC',
      startDay: 1, startHour: 9, startMinute: 0,   // Monday 9:00 AM
      endDay: 3, endHour: 18, endMinute: 0,          // Wednesday 6:00 PM
    },
    gameInfo: { recurrence: 'weekly', gameDay: 3 },
  };

  test('returns open when current time is within window', () => {
    // Tuesday Jan 27 2026 at noon — between Mon 9am and Wed 6pm
    mockDate('2026-01-27T12:00:00Z');
    const result = isFormOpenWeekly(weeklySettings);
    expect(result.isOpen).toBe(true);
    expect(result.message).toBeNull();
  });

  test('returns open at exact start time', () => {
    // Monday Jan 26 2026 at 9:00 AM
    mockDate('2026-01-26T09:00:00Z');
    const result = isFormOpenWeekly(weeklySettings);
    expect(result.isOpen).toBe(true);
  });

  test('returns closed just before start time', () => {
    // Monday Jan 26 2026 at 8:59 AM
    mockDate('2026-01-26T08:59:00Z');
    const result = isFormOpenWeekly(weeklySettings);
    expect(result.isOpen).toBe(false);
    expect(result.message).toContain('Monday');
    expect(result.message).toContain('9:00 AM');
  });

  test('returns closed at exact end time', () => {
    // Wednesday Jan 28 2026 at 6:00 PM
    mockDate('2026-01-28T18:00:00Z');
    const result = isFormOpenWeekly(weeklySettings);
    expect(result.isOpen).toBe(false);
  });

  test('returns closed after end time', () => {
    // Thursday Jan 29 2026 at noon — after Wed 6pm close
    mockDate('2026-01-29T12:00:00Z');
    const result = isFormOpenWeekly(weeklySettings);
    expect(result.isOpen).toBe(false);
  });

  test('provides nextOpenTime when closed', () => {
    // Thursday Jan 29 2026 — closed, next open is Monday Feb 2
    mockDate('2026-01-29T12:00:00Z');
    const result = isFormOpenWeekly(weeklySettings);
    expect(result.isOpen).toBe(false);
    expect(result.nextOpenTime).toBeTruthy();
  });

  test('handles wrapping window (start > end across week boundary)', () => {
    // Window: Saturday 8am → Monday 8am (wraps over Sunday)
    const wrappingSettings = {
      accessPeriod: {
        enabled: true,
        timezone: 'UTC',
        startDay: 6, startHour: 8, startMinute: 0,  // Saturday 8am
        endDay: 1, endHour: 8, endMinute: 0,          // Monday 8am
      },
      gameInfo: { recurrence: 'weekly', gameDay: 6 },
    };

    // Sunday Jan 25 2026 at noon — should be inside wrapping window
    mockDate('2026-01-25T12:00:00Z');
    const result = isFormOpenWeekly(wrappingSettings);
    expect(result.isOpen).toBe(true);
  });

  test('wrapping window: closed before start', () => {
    const wrappingSettings = {
      accessPeriod: {
        enabled: true,
        timezone: 'UTC',
        startDay: 6, startHour: 8, startMinute: 0,
        endDay: 1, endHour: 8, endMinute: 0,
      },
      gameInfo: { recurrence: 'weekly', gameDay: 6 },
    };

    // Friday Jan 30 2026 at noon — before Saturday 8am start
    mockDate('2026-01-30T12:00:00Z');
    const result = isFormOpenWeekly(wrappingSettings);
    expect(result.isOpen).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────
// isFormOpenMonthly
// ─────────────────────────────────────────────────────────────

describe('isFormOpenMonthly', () => {
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

  // 2nd Saturday of the month, RSVP opens Wednesday 9am, closes Friday 6pm
  // (relative to game day Saturday: Wed=-3, Fri=-1)
  const monthlySettings = {
    accessPeriod: {
      enabled: true,
      timezone: 'UTC',
      startDay: 3, startHour: 9, startMinute: 0,   // Wednesday 9am
      endDay: 5, endHour: 18, endMinute: 0,          // Friday 6pm
    },
    gameInfo: { recurrence: 'monthly', gameDay: 6, monthlyOccurrence: 2 },
  };

  test('returns open during the monthly RSVP window', () => {
    // 2nd Saturday of Jan 2026 is Jan 10.
    // Window: Wed Jan 7 9am → Fri Jan 9 6pm
    // Thursday Jan 8 at noon — inside window
    mockDate('2026-01-08T12:00:00Z');
    const result = isFormOpenMonthly(monthlySettings);
    expect(result.isOpen).toBe(true);
  });

  test('returns closed outside the monthly RSVP window', () => {
    // 2nd Saturday of Jan 2026 is Jan 10.
    // Monday Jan 5 — before Wed Jan 7 window opens
    mockDate('2026-01-05T12:00:00Z');
    const result = isFormOpenMonthly(monthlySettings);
    expect(result.isOpen).toBe(false);
  });

  test('returns closed after window closes', () => {
    // 2nd Saturday of Jan 2026 is Jan 10.
    // Saturday Jan 10 at noon — window closed at Fri 6pm
    mockDate('2026-01-10T12:00:00Z');
    const result = isFormOpenMonthly(monthlySettings);
    expect(result.isOpen).toBe(false);
  });

  test('returns closed message with occurrence label', () => {
    mockDate('2026-01-05T12:00:00Z');
    const result = isFormOpenMonthly(monthlySettings);
    expect(result.isOpen).toBe(false);
    expect(result.message).toContain('2nd');
    expect(result.message).toContain('Saturday');
  });

  test('provides nextOpenTime when closed', () => {
    mockDate('2026-01-05T12:00:00Z');
    const result = isFormOpenMonthly(monthlySettings);
    expect(result.isOpen).toBe(false);
    expect(result.nextOpenTime).toBeTruthy();
  });

  test('handles last occurrence of month', () => {
    const lastSettings = {
      accessPeriod: {
        enabled: true,
        timezone: 'UTC',
        startDay: 4, startHour: 9, startMinute: 0,   // Thursday 9am
        endDay: 6, endHour: 18, endMinute: 0,          // Saturday 6pm
      },
      gameInfo: { recurrence: 'monthly', gameDay: 0, monthlyOccurrence: 'last' },
    };

    // Last Sunday of Jan 2026 is Jan 25.
    // Window: Thu Jan 22 9am → Sat Jan 24 6pm
    // Friday Jan 23 at noon — inside window
    mockDate('2026-01-23T12:00:00Z');
    const result = isFormOpenMonthly(lastSettings);
    expect(result.isOpen).toBe(true);
  });

  test('closed message uses "last" label for last occurrence', () => {
    const lastSettings = {
      accessPeriod: {
        enabled: true,
        timezone: 'UTC',
        startDay: 4, startHour: 9, startMinute: 0,
        endDay: 6, endHour: 18, endMinute: 0,
      },
      gameInfo: { recurrence: 'monthly', gameDay: 0, monthlyOccurrence: 'last' },
    };

    // Well outside window
    mockDate('2026-01-10T12:00:00Z');
    const result = isFormOpenMonthly(lastSettings);
    expect(result.isOpen).toBe(false);
    expect(result.message).toContain('last');
    expect(result.message).toContain('Sunday');
  });
});
