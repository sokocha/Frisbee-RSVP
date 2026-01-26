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

  return { isOpen, message, nextOpenTime };
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
      return { isOpen: true, message: null };
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

  return { isOpen: false, message, nextOpenTime };
}

/**
 * Get the current period identifier.
 */
export function getCurrentPeriodId(settings, timezone) {
  const recurrence = settings?.gameInfo?.recurrence || 'weekly';

  if (recurrence === 'monthly') {
    return getMonthlyPeriodId(settings, timezone);
  }

  return getWeeklyPeriodId(timezone);
}

export function getWeeklyPeriodId(timezone) {
  const now = new Date();
  const localTime = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
  const year = localTime.getFullYear();
  const startOfYear = new Date(year, 0, 1);
  const days = Math.floor((localTime - startOfYear) / (24 * 60 * 60 * 1000));
  const weekNum = Math.ceil((days + startOfYear.getDay() + 1) / 7);
  return `${year}-W${weekNum.toString().padStart(2, '0')}`;
}

export function getMonthlyPeriodId(settings, timezone) {
  const now = new Date();
  const localTime = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
  const year = localTime.getFullYear();
  const month = localTime.getMonth();

  const gameDay = settings?.gameInfo?.gameDay ?? 0;
  const monthlyOccurrence = settings?.gameInfo?.monthlyOccurrence ?? 1;

  const dayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const occ = monthlyOccurrence === 'last' ? 'L' : monthlyOccurrence;
  const monthStr = (month + 1).toString().padStart(2, '0');

  return `${year}-M${monthStr}-${occ}${dayNames[gameDay]}`;
}
