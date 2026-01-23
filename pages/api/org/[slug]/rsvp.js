import { getOrganizationBySlug } from '../../../../lib/organizations';
import { getOrgData, setOrgData, ORG_KEY_SUFFIXES } from '../../../../lib/kv';

const DEFAULT_MAIN_LIST_LIMIT = 30;

/**
 * Sort people by priority:
 * 1. Whitelisted members first (by earliest timestamp)
 * 2. Non-whitelisted members second (by earliest timestamp)
 */
function sortByPriority(people) {
  return [...people].sort((a, b) => {
    if (a.isWhitelisted && !b.isWhitelisted) return -1;
    if (!a.isWhitelisted && b.isWhitelisted) return 1;
    return new Date(a.timestamp) - new Date(b.timestamp);
  });
}

/**
 * Rebalance mainList and waitlist based on the limit.
 */
function rebalanceLists(mainList, waitlist, limit) {
  const allPeople = [...mainList, ...waitlist];
  const sorted = sortByPriority(allPeople);
  return {
    mainList: sorted.slice(0, limit),
    waitlist: sorted.slice(limit)
  };
}

// Default settings
function getDefaultSettings(timezone = 'Africa/Lagos') {
  return {
    mainListLimit: 30,
    accessPeriod: {
      enabled: true,
      startDay: 4,
      startHour: 12,
      startMinute: 0,
      endDay: 5,
      endHour: 10,
      endMinute: 0,
      timezone
    }
  };
}

// Check if RSVP form is currently open
function isFormOpen(settings) {
  if (!settings.accessPeriod?.enabled) {
    return { isOpen: true, message: null };
  }

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

    // Approximate UTC conversion
    const utcTime = new Date(targetDate.getTime() - (1 * 60 * 60 * 1000));
    nextOpenTime = utcTime.toISOString();
  }

  return { isOpen, message, nextOpenTime };
}

// Get the current week identifier
function getCurrentWeekId(timezone) {
  const now = new Date();
  const localTime = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
  const year = localTime.getFullYear();
  const startOfYear = new Date(year, 0, 1);
  const days = Math.floor((localTime - startOfYear) / (24 * 60 * 60 * 1000));
  const weekNum = Math.ceil((days + startOfYear.getDay() + 1) / 7);
  return `${year}-W${weekNum.toString().padStart(2, '0')}`;
}

// Check if we need to reset and archive
async function checkAndResetIfNeeded(orgId, settings) {
  if (!settings.accessPeriod?.enabled) {
    return false;
  }

  const timezone = settings.accessPeriod.timezone || 'Africa/Lagos';
  const currentWeekId = getCurrentWeekId(timezone);
  const lastReset = await getOrgData(orgId, ORG_KEY_SUFFIXES.LAST_RESET);

  const accessStatus = isFormOpen(settings);

  if (accessStatus.isOpen && lastReset !== currentWeekId) {
    const rsvpData = await getOrgData(orgId, ORG_KEY_SUFFIXES.RSVP_DATA, { mainList: [], waitlist: [] });

    if (rsvpData.mainList.length > 0 || rsvpData.waitlist.length > 0) {
      const archive = await getOrgData(orgId, ORG_KEY_SUFFIXES.ARCHIVE, []);

      const archiveEntry = {
        weekId: lastReset || 'unknown',
        archivedAt: new Date().toISOString(),
        mainList: rsvpData.mainList,
        waitlist: rsvpData.waitlist
      };

      archive.unshift(archiveEntry);
      if (archive.length > 12) {
        archive.pop();
      }

      await setOrgData(orgId, ORG_KEY_SUFFIXES.ARCHIVE, archive);
    }

    const whitelistedPeople = rsvpData.mainList.filter(p => p.isWhitelisted);
    await setOrgData(orgId, ORG_KEY_SUFFIXES.RSVP_DATA, { mainList: whitelistedPeople, waitlist: [] });
    await setOrgData(orgId, ORG_KEY_SUFFIXES.SNOOZED, { weekId: currentWeekId, names: [] });
    await setOrgData(orgId, ORG_KEY_SUFFIXES.LAST_RESET, currentWeekId);

    return true;
  }

  return false;
}

export default async function handler(req, res) {
  const { slug } = req.query;

  // Get organization by slug
  const org = await getOrganizationBySlug(slug);
  if (!org) {
    return res.status(404).json({ error: 'Organization not found' });
  }

  if (org.status !== 'active') {
    return res.status(403).json({ error: 'This organization is not active' });
  }

  const orgId = org.id;

  if (req.method === 'GET') {
    try {
      const settings = await getOrgData(orgId, ORG_KEY_SUFFIXES.SETTINGS, getDefaultSettings(org.timezone));

      await checkAndResetIfNeeded(orgId, settings);

      const data = await getOrgData(orgId, ORG_KEY_SUFFIXES.RSVP_DATA, { mainList: [], waitlist: [] });
      const accessStatus = isFormOpen(settings);
      const mainListLimit = settings.mainListLimit || DEFAULT_MAIN_LIST_LIMIT;

      const rebalanced = rebalanceLists(data.mainList, data.waitlist, mainListLimit);
      const orderChanged = JSON.stringify(rebalanced) !== JSON.stringify(data);
      if (orderChanged) {
        await setOrgData(orgId, ORG_KEY_SUFFIXES.RSVP_DATA, rebalanced);
      }

      const timezone = settings.accessPeriod?.timezone || org.timezone || 'Africa/Lagos';
      const currentWeekId = getCurrentWeekId(timezone);
      const snoozedData = await getOrgData(orgId, ORG_KEY_SUFFIXES.SNOOZED, { weekId: currentWeekId, names: [] });
      const snoozedEntries = snoozedData.weekId === currentWeekId ? snoozedData.names : [];
      const snoozedNames = snoozedEntries.map(entry =>
        typeof entry === 'string' ? entry : (entry.snapshot?.name || entry.nameLC)
      );

      const whitelist = await getOrgData(orgId, ORG_KEY_SUFFIXES.WHITELIST, []);

      return res.status(200).json({
        organization: {
          slug: org.slug,
          name: org.name,
          sport: org.sport,
          location: org.location,
        },
        mainList: rebalanced.mainList,
        waitlist: rebalanced.waitlist,
        mainListLimit,
        accessStatus: {
          isOpen: accessStatus.isOpen,
          message: accessStatus.message,
          nextOpenTime: accessStatus.nextOpenTime
        },
        snoozedNames,
        whitelist: whitelist.map(w => ({ name: w.name, deviceId: w.deviceId }))
      });
    } catch (error) {
      console.error('Failed to get RSVP data:', error);
      return res.status(500).json({ error: 'Failed to load data' });
    }
  }

  if (req.method === 'POST') {
    const { name, deviceId } = req.body;

    if (!name || !deviceId) {
      return res.status(400).json({ error: 'Name and deviceId are required' });
    }

    const trimmedName = name.trim();
    if (!trimmedName) {
      return res.status(400).json({ error: 'Name cannot be empty' });
    }

    try {
      const settings = await getOrgData(orgId, ORG_KEY_SUFFIXES.SETTINGS, getDefaultSettings(org.timezone));
      const accessStatus = isFormOpen(settings);

      if (!accessStatus.isOpen) {
        return res.status(403).json({ error: accessStatus.message });
      }

      const data = await getOrgData(orgId, ORG_KEY_SUFFIXES.RSVP_DATA, { mainList: [], waitlist: [] });
      const { mainList, waitlist } = data;

      const allSignups = [...mainList, ...waitlist];
      if (allSignups.some(p => p.deviceId === deviceId)) {
        return res.status(400).json({ error: "You've already signed up from this device!" });
      }

      if (allSignups.some(p => p.name.toLowerCase() === trimmedName.toLowerCase())) {
        return res.status(400).json({ error: 'This name is already on the list!' });
      }

      const whitelist = await getOrgData(orgId, ORG_KEY_SUFFIXES.WHITELIST, []);
      const whitelistEntry = whitelist.find(w =>
        w.name.toLowerCase() === trimmedName.toLowerCase() ||
        w.deviceId === deviceId
      );
      const isWhitelisted = !!whitelistEntry;

      const newPerson = {
        id: Date.now(),
        name: trimmedName,
        timestamp: new Date().toISOString(),
        deviceId: deviceId,
        ...(isWhitelisted && { isWhitelisted: true })
      };

      const mainListLimit = settings.mainListLimit || DEFAULT_MAIN_LIST_LIMIT;

      const rebalanced = rebalanceLists([...mainList, newPerson], waitlist, mainListLimit);
      const newMainList = rebalanced.mainList;
      const newWaitlist = rebalanced.waitlist;

      const isOnMainList = newMainList.some(p => p.id === newPerson.id);
      const position = isOnMainList
        ? newMainList.findIndex(p => p.id === newPerson.id) + 1
        : newWaitlist.findIndex(p => p.id === newPerson.id) + 1;

      let message = '';
      let listType = '';

      if (isOnMainList) {
        message = `You're in! Spot #${position}`;
        listType = 'main';
      } else {
        message = `Main list full. You're #${position} on the waitlist`;
        listType = 'waitlist';
      }

      await setOrgData(orgId, ORG_KEY_SUFFIXES.RSVP_DATA, { mainList: newMainList, waitlist: newWaitlist });

      return res.status(200).json({
        success: true,
        message,
        listType,
        person: newPerson,
        mainList: newMainList,
        waitlist: newWaitlist
      });
    } catch (error) {
      console.error('Failed to add RSVP:', error);
      return res.status(500).json({ error: 'Failed to save RSVP' });
    }
  }

  if (req.method === 'DELETE') {
    const { personId, deviceId, isWaitlist } = req.body;

    if (!personId || !deviceId) {
      return res.status(400).json({ error: 'personId and deviceId are required' });
    }

    try {
      const settings = await getOrgData(orgId, ORG_KEY_SUFFIXES.SETTINGS, getDefaultSettings(org.timezone));
      const accessStatus = isFormOpen(settings);

      if (!accessStatus.isOpen) {
        return res.status(403).json({ error: accessStatus.message });
      }

      const data = await getOrgData(orgId, ORG_KEY_SUFFIXES.RSVP_DATA, { mainList: [], waitlist: [] });
      let { mainList, waitlist } = data;

      const list = isWaitlist ? waitlist : mainList;
      const person = list.find(p => p.id === personId);

      if (!person) {
        return res.status(404).json({ error: 'Person not found' });
      }

      if (person.deviceId !== deviceId) {
        return res.status(403).json({ error: 'You can only remove your own signup' });
      }

      let message = '';
      let promotedPerson = null;

      if (isWaitlist) {
        waitlist = waitlist.filter(p => p.id !== personId);
        message = 'Removed from waitlist';
      } else {
        mainList = mainList.filter(p => p.id !== personId);

        if (waitlist.length > 0) {
          promotedPerson = waitlist[0];
          mainList = [...mainList, promotedPerson];
          waitlist = waitlist.slice(1);
          message = `Spot opened! ${promotedPerson.name} promoted from waitlist`;
        } else {
          message = 'Removed from main list';
        }
      }

      await setOrgData(orgId, ORG_KEY_SUFFIXES.RSVP_DATA, { mainList, waitlist });

      return res.status(200).json({
        success: true,
        message,
        promotedPerson,
        mainList,
        waitlist
      });
    } catch (error) {
      console.error('Failed to remove RSVP:', error);
      return res.status(500).json({ error: 'Failed to remove RSVP' });
    }
  }

  if (req.method === 'PATCH') {
    // Snooze/unsnooze for whitelisted members
    const { action, personId, personName, password } = req.body;

    if (!password) {
      return res.status(400).json({ error: 'Password is required' });
    }

    // Use org-specific password or fall back to global
    const MEMBER_PASSWORD = process.env.AIS_PASSWORD || process.env.ADMIN_PASSWORD || 'frisbee-admin-2024';
    if (password !== MEMBER_PASSWORD) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    try {
      const settings = await getOrgData(orgId, ORG_KEY_SUFFIXES.SETTINGS, getDefaultSettings(org.timezone));
      const data = await getOrgData(orgId, ORG_KEY_SUFFIXES.RSVP_DATA, { mainList: [], waitlist: [] });
      let { mainList, waitlist } = data;
      const mainListLimit = settings.mainListLimit || DEFAULT_MAIN_LIST_LIMIT;

      if (action === 'snooze') {
        const person = mainList.find(p => p.id === personId);

        if (!person) {
          return res.status(404).json({ error: 'Person not found on main list' });
        }

        if (!person.isWhitelisted) {
          return res.status(400).json({ error: 'Only whitelisted members can snooze' });
        }

        mainList = mainList.filter(p => p.id !== personId);

        const timezone = settings.accessPeriod?.timezone || org.timezone || 'Africa/Lagos';
        const currentWeekId = getCurrentWeekId(timezone);
        const snoozedData = await getOrgData(orgId, ORG_KEY_SUFFIXES.SNOOZED, { weekId: currentWeekId, names: [] });

        if (snoozedData.weekId !== currentWeekId) {
          snoozedData.weekId = currentWeekId;
          snoozedData.names = [];
        }

        const nameLC = person.name.toLowerCase();
        const alreadySnoozed = snoozedData.names.some(
          entry => (typeof entry === 'string' ? entry : entry.nameLC) === nameLC
        );
        if (!alreadySnoozed) {
          snoozedData.names.push({
            nameLC,
            snapshot: {
              id: person.id,
              name: person.name,
              timestamp: person.timestamp,
              isWhitelisted: person.isWhitelisted,
              deviceId: person.deviceId
            }
          });
        }

        const rebalanced = rebalanceLists(mainList, waitlist, mainListLimit);
        mainList = rebalanced.mainList;
        waitlist = rebalanced.waitlist;

        await setOrgData(orgId, ORG_KEY_SUFFIXES.RSVP_DATA, { mainList, waitlist });
        await setOrgData(orgId, ORG_KEY_SUFFIXES.SNOOZED, snoozedData);

        const updatedSnoozedNames = snoozedData.names.map(entry =>
          typeof entry === 'string' ? entry : (entry.snapshot?.name || entry.nameLC)
        );

        return res.status(200).json({
          success: true,
          message: `${person.name} is now skipping this week. They'll be back next week!`,
          mainList,
          waitlist,
          snoozedNames: updatedSnoozedNames
        });
      }

      if (action === 'unsnooze') {
        const timezone = settings.accessPeriod?.timezone || org.timezone || 'Africa/Lagos';
        const currentWeekId = getCurrentWeekId(timezone);
        const snoozedData = await getOrgData(orgId, ORG_KEY_SUFFIXES.SNOOZED, { weekId: currentWeekId, names: [] });

        const nameLC = personName?.toLowerCase();

        const idx = snoozedData.names.findIndex(entry =>
          (typeof entry === 'string' ? entry : entry.nameLC) === nameLC
        );

        if (idx === -1) {
          return res.status(400).json({ error: 'This person is not currently snoozed' });
        }

        const accessStatus = isFormOpen(settings);
        if (!accessStatus.isOpen) {
          return res.status(403).json({ error: accessStatus.message });
        }

        const entry = snoozedData.names[idx];
        let restored;

        if (typeof entry === 'object' && entry.snapshot) {
          restored = { ...entry.snapshot };
        } else {
          const whitelist = await getOrgData(orgId, ORG_KEY_SUFFIXES.WHITELIST, []);
          const whitelistPerson = whitelist.find(w => w.name.toLowerCase() === nameLC);
          if (!whitelistPerson) {
            return res.status(400).json({ error: 'Could not find whitelist entry' });
          }
          restored = {
            id: Date.now(),
            name: whitelistPerson.name,
            timestamp: new Date().toISOString(),
            isWhitelisted: true
          };
        }

        snoozedData.names.splice(idx, 1);
        await setOrgData(orgId, ORG_KEY_SUFFIXES.SNOOZED, snoozedData);

        const rebalanced = rebalanceLists([...mainList, restored], waitlist, mainListLimit);
        mainList = rebalanced.mainList;
        waitlist = rebalanced.waitlist;

        const isOnMainList = mainList.some(p => p.id === restored.id);
        const position = isOnMainList
          ? mainList.findIndex(p => p.id === restored.id) + 1
          : waitlist.findIndex(p => p.id === restored.id) + 1;

        let message = '';
        let listType = '';

        if (isOnMainList) {
          message = `Welcome back ${restored.name}! You're in spot #${position}`;
          listType = 'main';
        } else {
          message = `Main list is full. ${restored.name} is #${position} on the waitlist`;
          listType = 'waitlist';
        }

        await setOrgData(orgId, ORG_KEY_SUFFIXES.RSVP_DATA, { mainList, waitlist });

        const updatedSnoozedNames = snoozedData.names.map(entry =>
          typeof entry === 'string' ? entry : (entry.snapshot?.name || entry.nameLC)
        );

        return res.status(200).json({
          success: true,
          message,
          listType,
          person: restored,
          mainList,
          waitlist,
          snoozedNames: updatedSnoozedNames
        });
      }

      return res.status(400).json({ error: 'Invalid action' });
    } catch (error) {
      console.error('Snooze error:', error);
      return res.status(500).json({ error: 'Failed to process snooze request' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
