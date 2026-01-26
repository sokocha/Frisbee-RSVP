/**
 * Unit tests for formatting helpers (lib/format.js)
 */

import { formatNextOpen } from '../../lib/format';

describe('formatNextOpen', () => {
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

  test('returns "soon" when target is in the past', () => {
    mockDate('2026-02-01T12:00:00Z');
    expect(formatNextOpen('2026-01-30T12:00:00Z')).toBe('soon');
  });

  test('returns "soon" when target equals now', () => {
    mockDate('2026-02-01T12:00:00Z');
    expect(formatNextOpen('2026-02-01T12:00:00Z')).toBe('soon');
  });

  test('returns minutes only when less than 1 hour away', () => {
    mockDate('2026-02-01T12:00:00Z');
    expect(formatNextOpen('2026-02-01T12:45:00Z')).toBe('in 45m');
  });

  test('returns 1 minute for very short durations', () => {
    mockDate('2026-02-01T12:00:00Z');
    expect(formatNextOpen('2026-02-01T12:01:00Z')).toBe('in 1m');
  });

  test('returns hours and minutes when less than 1 day away', () => {
    mockDate('2026-02-01T12:00:00Z');
    // 5 hours 30 minutes later
    expect(formatNextOpen('2026-02-01T17:30:00Z')).toBe('in 5h 30m');
  });

  test('returns hours only when no remaining minutes', () => {
    mockDate('2026-02-01T12:00:00Z');
    expect(formatNextOpen('2026-02-01T15:00:00Z')).toBe('in 3h');
  });

  test('returns days and hours when less than 7 days away', () => {
    mockDate('2026-02-01T12:00:00Z');
    // 3 days 5 hours later
    expect(formatNextOpen('2026-02-04T17:00:00Z')).toBe('in 3d 5h');
  });

  test('returns days only when no remaining hours', () => {
    mockDate('2026-02-01T12:00:00Z');
    expect(formatNextOpen('2026-02-04T12:00:00Z')).toBe('in 3d');
  });

  test('returns month and day when 7+ days away', () => {
    mockDate('2026-02-01T12:00:00Z');
    expect(formatNextOpen('2026-02-10T09:00:00Z')).toBe('Feb 10');
  });

  test('returns month and day for far future dates', () => {
    mockDate('2026-01-15T12:00:00Z');
    expect(formatNextOpen('2026-03-05T09:00:00Z')).toBe('Mar 5');
  });

  test('handles exactly 7 days (shows date not relative)', () => {
    mockDate('2026-02-01T12:00:00Z');
    expect(formatNextOpen('2026-02-08T12:00:00Z')).toBe('Feb 8');
  });

  test('handles exactly 1 day', () => {
    mockDate('2026-02-01T12:00:00Z');
    expect(formatNextOpen('2026-02-02T12:00:00Z')).toBe('in 1d');
  });

  test('handles exactly 1 hour', () => {
    mockDate('2026-02-01T12:00:00Z');
    expect(formatNextOpen('2026-02-01T13:00:00Z')).toBe('in 1h');
  });
});
