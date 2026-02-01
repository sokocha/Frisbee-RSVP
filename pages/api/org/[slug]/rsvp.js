import { getOrganizationBySlug, organizerOwnsOrg } from '../../../../lib/organizations';
import { getOrgData, setOrgData, ORG_KEY_SUFFIXES } from '../../../../lib/kv';
import { verifySession, parseCookies, isSuperAdmin } from '../../../../lib/auth';
import { getOrganizerById } from '../../../../lib/organizations';
import { isFormOpen, getCurrentPeriodId } from '../../../../lib/recurrence';

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
    },
    gameInfo: {
      enabled: false,
      gameDay: 0,
      startHour: 17,
      startMinute: 0,
      endHour: 19,
      endMinute: 0,
      location: {
        enabled: false,
        name: '',
        address: '',
        googleMapsUrl: '',
      },
      rules: {
        enabled: false,
        items: [],
      },
      weather: {
        enabled: false,
      },
    }
  };
}

// ─────────────────────────────────────────────────────────────
// Reset / archive
// ─────────────────────────────────────────────────────────────

// Check if we need to reset and archive
async function checkAndResetIfNeeded(orgId, settings) {
  if (!settings.accessPeriod?.enabled) {
    return false;
  }

  const timezone = settings.accessPeriod.timezone || 'Africa/Lagos';
  const currentPeriodId = getCurrentPeriodId(settings, timezone);
  const lastReset = await getOrgData(orgId, ORG_KEY_SUFFIXES.LAST_RESET);

  const accessStatus = isFormOpen(settings);

  if (accessStatus.isOpen && lastReset !== currentPeriodId) {
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
    await setOrgData(orgId, ORG_KEY_SUFFIXES.SNOOZED, { weekId: currentPeriodId, names: [] });
    await setOrgData(orgId, ORG_KEY_SUFFIXES.LAST_RESET, currentPeriodId);

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
      const currentPeriodId = getCurrentPeriodId(settings, timezone);
      const snoozedData = await getOrgData(orgId, ORG_KEY_SUFFIXES.SNOOZED, { weekId: currentPeriodId, names: [] });
      const snoozedEntries = snoozedData.weekId === currentPeriodId ? snoozedData.names : [];
      const snoozedNames = snoozedEntries.map(entry =>
        typeof entry === 'string' ? entry : (entry.snapshot?.name || entry.nameLC)
      );

      const whitelist = await getOrgData(orgId, ORG_KEY_SUFFIXES.WHITELIST, []);

      // Prepare gameInfo for public display (only if enabled)
      const gameInfo = settings.gameInfo?.enabled ? {
        enabled: true,
        recurrence: settings.gameInfo.recurrence || 'weekly',
        monthlyOccurrence: settings.gameInfo.monthlyOccurrence || null,
        gameDay: settings.gameInfo.gameDay,
        startHour: settings.gameInfo.startHour,
        startMinute: settings.gameInfo.startMinute,
        endHour: settings.gameInfo.endHour,
        endMinute: settings.gameInfo.endMinute,
        location: settings.gameInfo.location?.enabled ? settings.gameInfo.location : null,
        rules: settings.gameInfo.rules?.enabled ? settings.gameInfo.rules : null,
        weather: settings.gameInfo.weather?.enabled ? settings.gameInfo.weather : null,
      } : null;

      // Prepare whatsapp info for public display (only if enabled)
      const whatsapp = settings.whatsapp?.enabled && settings.whatsapp?.groupUrl ? {
        enabled: true,
        groupUrl: settings.whatsapp.groupUrl,
      } : null;

      // Check if current user is an organizer for this organization
      let isOrganizer = false;
      const cookies = parseCookies(req);
      const sessionToken = cookies.session;
      if (sessionToken) {
        const organizerId = await verifySession(sessionToken);
        if (organizerId) {
          const organizer = await getOrganizerById(organizerId);
          if (organizer) {
            const isAdmin = isSuperAdmin(organizer.email);
            isOrganizer = isAdmin || await organizerOwnsOrg(organizerId, orgId);
          }
        }
      }

      // Check if email has been sent for the current period
      const emailEnabled = !!(settings?.email?.enabled && settings?.email?.recipients?.length);
      const lastEmailPeriod = await getOrgData(orgId, ORG_KEY_SUFFIXES.LAST_EMAIL, null);
      const emailSentForPeriod = emailEnabled && lastEmailPeriod === currentPeriodId;

      return res.status(200).json({
        organization: {
          slug: org.slug,
          name: org.name,
          sport: org.sport,
          location: org.location,
          visibility: org.visibility || 'public',
        },
        mainList: rebalanced.mainList,
        waitlist: rebalanced.waitlist,
        mainListLimit,
        accessStatus: {
          isOpen: accessStatus.isOpen,
          message: accessStatus.message,
          nextOpenTime: accessStatus.nextOpenTime,
          closeTime: accessStatus.closeTime || null,
          emailEnabled,
          emailSentForPeriod,
        },
        snoozedNames,
        whitelist: whitelist.map(w => ({ name: w.name, deviceId: w.deviceId })),
        gameInfo,
        whatsapp,
        isOrganizer,
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
      const emailEnabled = !!(settings?.email?.enabled && settings?.email?.recipients?.length);

      if (emailEnabled) {
        // When email is enabled, dropouts are blocked once the email has been sent
        const timezone = settings.accessPeriod?.timezone || org.timezone || 'Africa/Lagos';
        const periodId = getCurrentPeriodId(settings, timezone);
        const lastEmailPeriod = await getOrgData(orgId, ORG_KEY_SUFFIXES.LAST_EMAIL, null);
        if (lastEmailPeriod === periodId) {
          return res.status(403).json({ error: 'The list has already been sent. Dropouts are no longer possible.' });
        }
      } else if (!accessStatus.isOpen) {
        // When email is not enabled, dropouts are blocked when the window closes
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

      // Log the dropout event
      const timezone = settings.accessPeriod?.timezone || org.timezone || 'Africa/Lagos';
      const periodId = getCurrentPeriodId(settings, timezone);
      const dropoutEntry = {
        name: person.name,
        timestamp: new Date().toISOString(),
        list: isWaitlist ? 'waitlist' : 'main',
        periodId,
      };
      const dropoutLog = await getOrgData(orgId, ORG_KEY_SUFFIXES.DROPOUT_LOG, []);
      dropoutLog.unshift(dropoutEntry);
      if (dropoutLog.length > 50) dropoutLog.length = 50;
      await setOrgData(orgId, ORG_KEY_SUFFIXES.DROPOUT_LOG, dropoutLog);

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
    const { action, personId, personName, snoozeCode, password } = req.body;

    // Authenticate via snooze code (new method) or password (legacy)
    const whitelist = await getOrgData(orgId, ORG_KEY_SUFFIXES.WHITELIST, []);
    let authenticatedMember = null;

    if (snoozeCode) {
      // Find member by snooze code
      authenticatedMember = whitelist.find(w => w.snoozeCode === snoozeCode.toUpperCase());
      if (!authenticatedMember) {
        return res.status(401).json({ error: 'Invalid snooze code' });
      }
    } else if (password) {
      // Legacy password authentication
      const MEMBER_PASSWORD = process.env.AIS_PASSWORD || process.env.ADMIN_PASSWORD || 'frisbee-admin-2024';
      if (password !== MEMBER_PASSWORD) {
        return res.status(401).json({ error: 'Invalid password' });
      }
    } else {
      return res.status(400).json({ error: 'Snooze code is required' });
    }

    try {
      const settings = await getOrgData(orgId, ORG_KEY_SUFFIXES.SETTINGS, getDefaultSettings(org.timezone));
      const data = await getOrgData(orgId, ORG_KEY_SUFFIXES.RSVP_DATA, { mainList: [], waitlist: [] });
      let { mainList, waitlist } = data;
      const mainListLimit = settings.mainListLimit || DEFAULT_MAIN_LIST_LIMIT;

      if (action === 'snooze') {
        // If authenticated via snooze code, find the person by their whitelist name
        let person;
        if (authenticatedMember) {
          person = mainList.find(p => p.name.toLowerCase() === authenticatedMember.name.toLowerCase());
        } else {
          person = mainList.find(p => p.id === personId);
        }

        if (!person) {
          return res.status(404).json({ error: 'You are not currently on the main list' });
        }

        if (!person.isWhitelisted) {
          return res.status(400).json({ error: 'Only members can snooze' });
        }

        mainList = mainList.filter(p => p.id !== person.id);

        const timezone = settings.accessPeriod?.timezone || org.timezone || 'Africa/Lagos';
        const currentPeriodId = getCurrentPeriodId(settings, timezone);
        const snoozedData = await getOrgData(orgId, ORG_KEY_SUFFIXES.SNOOZED, { weekId: currentPeriodId, names: [] });

        if (snoozedData.weekId !== currentPeriodId) {
          snoozedData.weekId = currentPeriodId;
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
        const currentPeriodId = getCurrentPeriodId(settings, timezone);
        const snoozedData = await getOrgData(orgId, ORG_KEY_SUFFIXES.SNOOZED, { weekId: currentPeriodId, names: [] });

        // Use authenticated member's name if available, otherwise use personName
        const nameLC = authenticatedMember
          ? authenticatedMember.name.toLowerCase()
          : personName?.toLowerCase();

        const idx = snoozedData.names.findIndex(entry =>
          (typeof entry === 'string' ? entry : entry.nameLC) === nameLC
        );

        if (idx === -1) {
          return res.status(400).json({ error: 'You are not currently snoozed' });
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
