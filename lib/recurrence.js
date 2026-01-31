/**
 * Recurrence helpers for weekly and monthly event scheduling.
 *
 * Used by the RSVP API handler and cron email sender.
 */

/**
 * Find the nth occurrence of a day-of-week in a given month.
 * @param {number} year
 * @param {number} month - 0-indexed (0=January)
 * @param {number} dayOfWeek - 0-6 (0=Sunday)
 * @param {number|string} n - 1-4 or 'last'
 * @returns {Date|null}
 */
export function getNthDayOfMonth(year, month, dayOfWeek, n) {
  if (n === 'last') {
    const lastDay = new Date(year, month + 1, 0);
    let date = lastDay.getDate();
    while (new Date(year, month, date).getDay() !== dayOfWeek) {
      date--;
    }
    return new Date(year, month, date);
  }

  let count = 0;
  for (let date = 1; date <= 31; date++) {
    const d = new Date(year, month, date);
    if (d.getMonth() !== month) break;
    if (d.getDay() === dayOfWeek) {
      count++;
      if (count === n) return d;
    }
  }
  return null;
}

/**
 * Check if RSVP form is currently open based on settings.
 */
export function isFormOpen(settings) {
  if (!settings.accessPeriod?.enabled) {
    return { isOpen: true, message: null };
  }

  const recurrence = settings.gameInfo?.recurrence || 'weekly';

  if (recurrence === 'monthly') {
    return isFormOpenMonthly(settings);
  }

  return isFormOpenWeekly(settings);
}

/**
 * Weekly access period check.
 */
export function isFormOpenWeekly(settings) {
  const now = new Date();
  const timezone = settings.accessPeriod.timezone || 'Africa/Lagos';
  const localTime = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
  const currentDay = localTime.getDay();
  const currentHour = localTime.getHours();
  const currentMinute = localTime.getMinutes();

  const { startDay, startHour, startMinute, endDay, endHour, endMinute } = settings.accessPeriod;

  const currentMins = currentDay * 24 * 60 + currentHour * 60 + currentMinute;
  const startMins = startDay * 24 * 60 + startHour * 60 + startMinute;
  const endMins = endDay * 24 * 60 + endHour * 60 + endMinute;

  let isOpen;
  if (startMins <= endMins) {
    isOpen = currentMins >= startMins && currentMins < endMins;
  } else {
    isOpen = currentMins >= startMins || currentMins < endMins;
  }

  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const formatTime = (h, m) => {
    const hour = h % 12 || 12;
    const minute = m.toString().padStart(2, '0');
    const ampm = h < 12 ? 'AM' : 'PM';
    return `${hour}:${minute} ${ampm}`;
  };

  const message = isOpen
    ? null
    : `RSVP is closed. Opens ${days[startDay]} at ${formatTime(startHour, startMinute)}`;

  let nextOpenTime = null;
  if (!isOpen) {
    let daysUntil = startDay - currentDay;
    if (daysUntil < 0 || (daysUntil === 0 && (currentHour > startHour || (currentHour === startHour && currentMinute >= startMinute)))) {
      daysUntil += 7;
    }

    const targetDate = new Date(localTime);
    targetDate.setDate(targetDate.getDate() + daysUntil);
    targetDate.setHours(startHour, startMinute, 0, 0);

    const utcTime = new Date(targetDate.getTime() - (1 * 60 * 60 * 1000));
    nextOpenTime = utcTime.toISOString();
  }

  // Compute the relevant close time for the current/most-recent period
  let closeTime = null;
  {
    let daysToClose = endDay - currentDay;
    if (isOpen) {
      // Close is upcoming
      if (daysToClose < 0) daysToClose += 7;
      if (daysToClose === 0 && (currentHour > endHour || (currentHour === endHour && currentMinute >= endMinute))) {
        daysToClose += 7;
      }
    } else {
      // Close already passed — find most recent
      if (daysToClose > 0) daysToClose -= 7;
      if (daysToClose === 0 && (currentHour < endHour || (currentHour === endHour && currentMinute < endMinute))) {
        daysToClose -= 7;
      }
    }

    const closeDate = new Date(localTime);
    closeDate.setDate(closeDate.getDate() + daysToClose);
    closeDate.setHours(endHour, endMinute, 0, 0);

    const utcClose = new Date(closeDate.getTime() - (1 * 60 * 60 * 1000));
    closeTime = utcClose.toISOString();
  }

  return { isOpen, message, nextOpenTime, closeTime };
}

/**
 * Monthly access period check.
 * The RSVP window only activates during the week that contains the monthly game occurrence.
 */
export function isFormOpenMonthly(settings) {
  const timezone = settings.accessPeriod.timezone || 'Africa/Lagos';
  const now = new Date();
  const localTime = new Date(now.toLocaleString('en-US', { timeZone: timezone }));

  const gameDay = settings.gameInfo?.gameDay ?? 0;
  const monthlyOccurrence = settings.gameInfo?.monthlyOccurrence ?? 1;
  const { startDay, startHour, startMinute, endDay, endHour, endMinute } = settings.accessPeriod;

  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const formatTime = (h, m) => {
    const hour = h % 12 || 12;
    const minute = m.toString().padStart(2, '0');
    const ampm = h < 12 ? 'AM' : 'PM';
    return `${hour}:${minute} ${ampm}`;
  };

  const year = localTime.getFullYear();
  const month = localTime.getMonth();
  const currentGameDate = getNthDayOfMonth(year, month, gameDay, monthlyOccurrence);

  const prevMonth = month === 0 ? 11 : month - 1;
  const prevYear = month === 0 ? year - 1 : year;
  const prevGameDate = getNthDayOfMonth(prevYear, prevMonth, gameDay, monthlyOccurrence);

  const nextMonth = month === 11 ? 0 : month + 1;
  const nextYear = month === 11 ? year + 1 : year;
  const nextGameDate = getNthDayOfMonth(nextYear, nextMonth, gameDay, monthlyOccurrence);

  const candidates = [prevGameDate, currentGameDate, nextGameDate].filter(Boolean);

  let mostRecentClose = null;
  for (const gameDateObj of candidates) {
    const gameDate = gameDateObj.getDate();
    const gameMonth = gameDateObj.getMonth();
    const gameYear = gameDateObj.getFullYear();

    let openOffset = startDay - gameDay;
    if (openOffset > 0) openOffset -= 7;

    let closeOffset = endDay - gameDay;
    if (closeOffset > 0) closeOffset -= 7;

    const openDate = new Date(gameYear, gameMonth, gameDate + openOffset);
    openDate.setHours(startHour, startMinute, 0, 0);

    const closeDate = new Date(gameYear, gameMonth, gameDate + closeOffset);
    closeDate.setHours(endHour, endMinute, 0, 0);

    let windowOpen, windowClose;
    if (openDate <= closeDate) {
      windowOpen = openDate;
      windowClose = closeDate;
    } else {
      windowOpen = openDate;
      windowClose = new Date(closeDate);
      windowClose.setDate(windowClose.getDate() + 7);
    }

    if (localTime >= windowOpen && localTime < windowClose) {
      const utcClose = new Date(windowClose.getTime() - (1 * 60 * 60 * 1000));
      return { isOpen: true, message: null, closeTime: utcClose.toISOString() };
    }

    // Track the most recent past close time
    if (windowClose <= localTime) {
      if (!mostRecentClose || windowClose > mostRecentClose) {
        mostRecentClose = windowClose;
      }
    }
  }

  // Not in any monthly window
  let nextGameDateObj = null;
  for (const gameDateObj of candidates) {
    if (!gameDateObj) continue;
    let openOffset = startDay - gameDay;
    if (openOffset > 0) openOffset -= 7;
    const openDate = new Date(gameDateObj.getFullYear(), gameDateObj.getMonth(), gameDateObj.getDate() + openOffset);
    openDate.setHours(startHour, startMinute, 0, 0);
    if (openDate > localTime) {
      nextGameDateObj = openDate;
      break;
    }
  }

  if (!nextGameDateObj) {
    const futureMonth = (month + 2) % 12;
    const futureYear = (month + 2) >= 12 ? year + 1 : year;
    const futureGameDate = getNthDayOfMonth(futureYear, futureMonth, gameDay, monthlyOccurrence);
    if (futureGameDate) {
      let openOffset = startDay - gameDay;
      if (openOffset > 0) openOffset -= 7;
      nextGameDateObj = new Date(futureGameDate.getFullYear(), futureGameDate.getMonth(), futureGameDate.getDate() + openOffset);
      nextGameDateObj.setHours(startHour, startMinute, 0, 0);
    }
  }

  const ordinals = { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th', last: 'last' };
  const occLabel = ordinals[monthlyOccurrence] || monthlyOccurrence;
  const message = `RSVP is closed. Opens for the ${occLabel} ${days[gameDay]} of the month`;

  let nextOpenTime = null;
  if (nextGameDateObj) {
    const utcTime = new Date(nextGameDateObj.getTime() - (1 * 60 * 60 * 1000));
    nextOpenTime = utcTime.toISOString();
  }

  let closeTime = null;
  if (mostRecentClose) {
    const utcClose = new Date(mostRecentClose.getTime() - (1 * 60 * 60 * 1000));
    closeTime = utcClose.toISOString();
  }

  return { isOpen: false, message, nextOpenTime, closeTime };
}

/**
 * Get the current period identifier.
 */
export function getCurrentPeriodId(settings, timezone) {
  const recurrence = settings?.gameInfo?.recurrence || 'weekly';

  if (recurrence === 'monthly') {
    return getMonthlyPeriodId(settings, timezone);
  }

  return getWeeklyPeriodId(settings, timezone);
}

/**
 * Weekly period ID anchored to game day.
 * The period rolls over at midnight after game day.
 * E.g., if game is Thursday, the new period starts at midnight Friday (00:00).
 */
export function getWeeklyPeriodId(settings, timezone) {
  const now = new Date();
  const localTime = new Date(now.toLocaleString('en-US', { timeZone: timezone }));

  const gameDay = settings?.gameInfo?.gameDay ?? 0;
  const resetDay = (gameDay + 1) % 7; // Period starts at midnight on this day

  const currentDay = localTime.getDay();

  // How many days ago did the current period start?
  let daysSinceReset = currentDay - resetDay;
  if (daysSinceReset < 0) daysSinceReset += 7;

  // The game date this period leads up to is 6 days after the period start
  const periodStartDate = new Date(localTime);
  periodStartDate.setDate(periodStartDate.getDate() - daysSinceReset);
  periodStartDate.setHours(0, 0, 0, 0);

  const gameDateForPeriod = new Date(periodStartDate);
  gameDateForPeriod.setDate(gameDateForPeriod.getDate() + 6);

  // Compute week number from the game date
  const year = gameDateForPeriod.getFullYear();
  const startOfYear = new Date(year, 0, 1);
  const days = Math.floor((gameDateForPeriod - startOfYear) / (24 * 60 * 60 * 1000));
  const weekNum = Math.ceil((days + startOfYear.getDay() + 1) / 7);

  return `${year}-W${weekNum.toString().padStart(2, '0')}`;
}

/**
 * Monthly period ID anchored to the actual game date.
 * The period rolls over at midnight after the monthly game date.
 * Uses the upcoming game date's month for the period ID.
 */
export function getMonthlyPeriodId(settings, timezone) {
  const now = new Date();
  const localTime = new Date(now.toLocaleString('en-US', { timeZone: timezone }));

  const gameDay = settings?.gameInfo?.gameDay ?? 0;
  const monthlyOccurrence = settings?.gameInfo?.monthlyOccurrence ?? 1;

  const dayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const occ = monthlyOccurrence === 'last' ? 'L' : monthlyOccurrence;

  // Check previous, current, and next months for game dates
  const year = localTime.getFullYear();
  const month = localTime.getMonth();
  const candidates = [];
  for (let offset = -1; offset <= 2; offset++) {
    let m = month + offset;
    let y = year;
    if (m < 0) { m += 12; y--; }
    if (m > 11) { m -= 12; y++; }
    const gameDate = getNthDayOfMonth(y, m, gameDay, monthlyOccurrence);
    if (gameDate) candidates.push(gameDate);
  }

  // Find the upcoming game date whose reset (midnight after) hasn't passed yet.
  // The period boundary is midnight on (gameDate + 1 day).
  let currentPeriodGameDate = null;
  for (const gameDate of candidates) {
    const resetMoment = new Date(gameDate);
    resetMoment.setDate(resetMoment.getDate() + 1);
    resetMoment.setHours(0, 0, 0, 0);
    if (localTime < resetMoment) {
      currentPeriodGameDate = gameDate;
      break;
    }
  }

  // Fallback: if all candidates have passed, look further ahead
  if (!currentPeriodGameDate) {
    let m = month + 3;
    let y = year;
    if (m > 11) { m -= 12; y++; }
    currentPeriodGameDate = getNthDayOfMonth(y, m, gameDay, monthlyOccurrence);
  }

  const gdMonth = (currentPeriodGameDate.getMonth() + 1).toString().padStart(2, '0');
  const gdYear = currentPeriodGameDate.getFullYear();

  return `${gdYear}-M${gdMonth}-${occ}${dayNames[gameDay]}`;
}
