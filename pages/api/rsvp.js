import { kv } from '@vercel/kv';

const RSVP_KEY = 'frisbee-rsvp-data';
const SETTINGS_KEY = 'frisbee-settings';
const ARCHIVE_KEY = 'frisbee-archive';
const LAST_RESET_KEY = 'frisbee-last-reset';
const LAST_EMAIL_KEY = 'frisbee-last-email';
const SNOOZED_KEY = 'frisbee-snoozed';
const DEFAULT_MAIN_LIST_LIMIT = 30;

/**
 * Sort people by priority:
 * 1. AIS members first (by earliest timestamp)
 * 2. Non-AIS members second (by earliest timestamp)
 *
 * Within each group, earlier timestamp = higher priority
 */
function sortByPriority(people) {
  return [...people].sort((a, b) => {
    // AIS members come first
    if (a.isWhitelisted && !b.isWhitelisted) return -1;
    if (!a.isWhitelisted && b.isWhitelisted) return 1;
    // Within same category, earlier timestamp wins
    return new Date(a.timestamp) - new Date(b.timestamp);
  });
}

/**
 * Rebalance mainList and waitlist based on the limit.
 * Combines both lists, sorts by priority, then splits at the limit.
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
const DEFAULT_SETTINGS = {
  mainListLimit: 30,
  accessPeriod: {
    enabled: true,
    startDay: 4,        // Thursday
    startHour: 12,      // 12:00 (noon)
    startMinute: 0,
    endDay: 5,          // Friday
    endHour: 10,        // 10:00
    endMinute: 0,
    timezone: 'Africa/Lagos'
  }
};

// Check if RSVP form is currently open
function isFormOpen(settings) {
  if (!settings.accessPeriod.enabled) {
    return { isOpen: true, message: null };
  }

  const now = new Date();
  const watTime = new Date(now.toLocaleString('en-US', { timeZone: settings.accessPeriod.timezone }));
  const currentDay = watTime.getDay();
  const currentHour = watTime.getHours();
  const currentMinute = watTime.getMinutes();

  const { startDay, startHour, startMinute, endDay, endHour, endMinute } = settings.accessPeriod;

  // Convert to minutes since start of week for easier comparison
  const currentMins = currentDay * 24 * 60 + currentHour * 60 + currentMinute;
  const startMins = startDay * 24 * 60 + startHour * 60 + startMinute;
  const endMins = endDay * 24 * 60 + endHour * 60 + endMinute;

  let isOpen;
  if (startMins <= endMins) {
    isOpen = currentMins >= startMins && currentMins < endMins;
  } else {
    // Wraps around week
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
    : `RSVP is closed. Opens ${days[startDay]} at ${formatTime(startHour, startMinute)} WAT`;

  return { isOpen, message };
}

// Check if we just transitioned to closed state (for auto-email)
function shouldSendEmail(settings) {
  if (!settings.accessPeriod.enabled) {
    return false;
  }

  const now = new Date();
  const watTime = new Date(now.toLocaleString('en-US', { timeZone: settings.accessPeriod.timezone }));
  const currentDay = watTime.getDay();
  const currentHour = watTime.getHours();
  const currentMinute = watTime.getMinutes();

  const { endDay, endHour, endMinute } = settings.accessPeriod;

  // Check if we're within 5 minutes after the close time
  const currentMins = currentDay * 24 * 60 + currentHour * 60 + currentMinute;
  const endMins = endDay * 24 * 60 + endHour * 60 + endMinute;

  // Within 5 minutes after close time
  const diff = currentMins - endMins;
  return diff >= 0 && diff <= 5;
}

// Get the current week identifier (year-week format)
function getCurrentWeekId(timezone) {
  const now = new Date();
  const watTime = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
  const year = watTime.getFullYear();
  // Get week number
  const startOfYear = new Date(year, 0, 1);
  const days = Math.floor((watTime - startOfYear) / (24 * 60 * 60 * 1000));
  const weekNum = Math.ceil((days + startOfYear.getDay() + 1) / 7);
  return `${year}-W${weekNum.toString().padStart(2, '0')}`;
}

// Check if we need to reset and archive
async function checkAndResetIfNeeded(settings) {
  if (!settings.accessPeriod.enabled) {
    return false;
  }

  const timezone = settings.accessPeriod.timezone || 'Africa/Lagos';
  const currentWeekId = getCurrentWeekId(timezone);
  const lastReset = await kv.get(LAST_RESET_KEY);

  // Check if form is currently open and we haven't reset for this week yet
  const accessStatus = isFormOpen(settings);

  if (accessStatus.isOpen && lastReset !== currentWeekId) {
    // Archive the current list
    const rsvpData = await kv.get(RSVP_KEY) || { mainList: [], waitlist: [] };

    // Only archive if there's data
    if (rsvpData.mainList.length > 0 || rsvpData.waitlist.length > 0) {
      const archive = await kv.get(ARCHIVE_KEY) || [];

      // Create archive entry
      const archiveEntry = {
        weekId: lastReset || 'unknown',
        archivedAt: new Date().toISOString(),
        mainList: rsvpData.mainList,
        waitlist: rsvpData.waitlist
      };

      // Add to archive (keep last 12 weeks)
      archive.unshift(archiveEntry);
      if (archive.length > 12) {
        archive.pop();
      }

      await kv.set(ARCHIVE_KEY, archive);
    }

    // Reset: keep only whitelisted people (who aren't snoozed)
    const snoozedData = await kv.get(SNOOZED_KEY) || { weekId: null, names: [] };
    const whitelistedPeople = rsvpData.mainList.filter(p => p.isWhitelisted);
    await kv.set(RSVP_KEY, { mainList: whitelistedPeople, waitlist: [] });

    // Clear snoozed list for new week
    await kv.set(SNOOZED_KEY, { weekId: currentWeekId, names: [] });

    // Mark this week as reset
    await kv.set(LAST_RESET_KEY, currentWeekId);

    return true;
  }

  return false;
}

// Send email via internal API call
async function triggerAutoEmail(settings, req) {
  if (!settings.email?.enabled || !settings.email?.recipients?.length) {
    return;
  }

  const timezone = settings.accessPeriod?.timezone || 'Africa/Lagos';
  const weekId = getCurrentWeekId(timezone);
  const lastEmail = await kv.get(LAST_EMAIL_KEY);

  // Don't send if already sent for this week
  if (lastEmail === weekId) {
    return;
  }

  // Check if we should send (within 5 mins of close time)
  if (!shouldSendEmail(settings)) {
    return;
  }

  try {
    // Get the host from the request
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers.host;

    await fetch(`${protocol}://${host}/api/send-list`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-call': process.env.RESEND_API_KEY
      },
      body: JSON.stringify({})
    });
  } catch (error) {
    console.error('Failed to trigger auto-email:', error);
  }
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    // Get current RSVP data and settings
    try {
      const settings = await kv.get(SETTINGS_KEY) || DEFAULT_SETTINGS;

      // Check if we need to auto-reset for the new week
      await checkAndResetIfNeeded(settings);

      // Check if we should auto-send email (when access period closes)
      triggerAutoEmail(settings, req);

      const data = await kv.get(RSVP_KEY) || { mainList: [], waitlist: [] };
      const accessStatus = isFormOpen(settings);
      const mainListLimit = settings.mainListLimit || DEFAULT_MAIN_LIST_LIMIT;

      // Auto-rebalance on GET to ensure correct priority order
      const rebalanced = rebalanceLists(data.mainList, data.waitlist, mainListLimit);
      const orderChanged = JSON.stringify(rebalanced) !== JSON.stringify(data);
      if (orderChanged) {
        await kv.set(RSVP_KEY, rebalanced);
      }

      // Get snoozed list for this week
      const timezone = settings.accessPeriod?.timezone || 'Africa/Lagos';
      const currentWeekId = getCurrentWeekId(timezone);
      const snoozedData = await kv.get(SNOOZED_KEY) || { weekId: currentWeekId, names: [] };
      const snoozedEntries = snoozedData.weekId === currentWeekId ? snoozedData.names : [];
      // Extract display names for frontend (handle both old string format and new object format)
      const snoozedNames = snoozedEntries.map(entry =>
        typeof entry === 'string' ? entry : (entry.snapshot?.name || entry.nameLC)
      );

      // Get whitelist to check if requester is whitelisted
      const whitelist = await kv.get('frisbee-whitelist') || [];

      return res.status(200).json({
        mainList: rebalanced.mainList,
        waitlist: rebalanced.waitlist,
        mainListLimit,
        accessStatus: {
          isOpen: accessStatus.isOpen,
          message: accessStatus.message
        },
        accessPeriod: settings.accessPeriod,
        snoozedNames,
        whitelist: whitelist.map(w => ({ name: w.name, deviceId: w.deviceId }))
      });
    } catch (error) {
      console.error('Failed to get RSVP data:', error);
      return res.status(500).json({ error: 'Failed to load data' });
    }
  }

  if (req.method === 'POST') {
    // Add new RSVP
    const { name, deviceId } = req.body;

    if (!name || !deviceId) {
      return res.status(400).json({ error: 'Name and deviceId are required' });
    }

    const trimmedName = name.trim();
    if (!trimmedName) {
      return res.status(400).json({ error: 'Name cannot be empty' });
    }

    try {
      // Check if form is open
      const settings = await kv.get(SETTINGS_KEY) || DEFAULT_SETTINGS;
      const accessStatus = isFormOpen(settings);

      if (!accessStatus.isOpen) {
        return res.status(403).json({ error: accessStatus.message });
      }

      const data = await kv.get(RSVP_KEY) || { mainList: [], waitlist: [] };
      const { mainList, waitlist } = data;

      // Check if device already signed up
      const allSignups = [...mainList, ...waitlist];
      if (allSignups.some(p => p.deviceId === deviceId)) {
        return res.status(400).json({ error: "You've already signed up from this device!" });
      }

      // Check if name already exists
      if (allSignups.some(p => p.name.toLowerCase() === trimmedName.toLowerCase())) {
        return res.status(400).json({ error: 'This name is already on the list!' });
      }

      // Check if this person is on the whitelist
      const whitelist = await kv.get('frisbee-whitelist') || [];
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

      // Add new person and rebalance both lists by priority
      const rebalanced = rebalanceLists([...mainList, newPerson], waitlist, mainListLimit);
      const newMainList = rebalanced.mainList;
      const newWaitlist = rebalanced.waitlist;

      // Determine where the new person ended up
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

      await kv.set(RSVP_KEY, { mainList: newMainList, waitlist: newWaitlist });

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
    // Remove RSVP
    const { personId, deviceId, isWaitlist } = req.body;

    if (!personId || !deviceId) {
      return res.status(400).json({ error: 'personId and deviceId are required' });
    }

    try {
      // Check if form is open for removal too
      const settings = await kv.get(SETTINGS_KEY) || DEFAULT_SETTINGS;
      const accessStatus = isFormOpen(settings);

      if (!accessStatus.isOpen) {
        return res.status(403).json({ error: accessStatus.message });
      }

      const data = await kv.get(RSVP_KEY) || { mainList: [], waitlist: [] };
      let { mainList, waitlist } = data;

      // Find the person
      const list = isWaitlist ? waitlist : mainList;
      const person = list.find(p => p.id === personId);

      if (!person) {
        return res.status(404).json({ error: 'Person not found' });
      }

      // Verify device ownership
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

        // Promote from waitlist if available
        if (waitlist.length > 0) {
          promotedPerson = waitlist[0];
          mainList = [...mainList, promotedPerson];
          waitlist = waitlist.slice(1);
          message = `Spot opened! ${promotedPerson.name} promoted from waitlist`;
        } else {
          message = 'Removed from main list';
        }
      }

      await kv.set(RSVP_KEY, { mainList, waitlist });

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

  if (req.method === 'PUT') {
    // Reset all RSVPs (admin)
    const { action } = req.body;

    if (action === 'reset') {
      try {
        await kv.set(RSVP_KEY, { mainList: [], waitlist: [] });
        return res.status(200).json({
          success: true,
          message: 'All RSVPs cleared',
          mainList: [],
          waitlist: []
        });
      } catch (error) {
        console.error('Failed to reset RSVPs:', error);
        return res.status(500).json({ error: 'Failed to reset RSVPs' });
      }
    }

    return res.status(400).json({ error: 'Invalid action' });
  }

  if (req.method === 'PATCH') {
    // Snooze/unsnooze a whitelisted person (password-protected)
    const { action, personId, personName, password } = req.body;

    if (!password) {
      return res.status(400).json({ error: 'Password is required' });
    }

    // Verify password (use same password as whitelist/AIS members)
    const AIS_PASSWORD = process.env.AIS_PASSWORD || process.env.ADMIN_PASSWORD || 'frisbee-admin-2024';
    if (password !== AIS_PASSWORD) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    try {
      const settings = await kv.get(SETTINGS_KEY) || DEFAULT_SETTINGS;
      const data = await kv.get(RSVP_KEY) || { mainList: [], waitlist: [] };
      let { mainList, waitlist } = data;
      const mainListLimit = settings.mainListLimit || DEFAULT_MAIN_LIST_LIMIT;

      /* ───────────────────────────  SNOOZE  ─────────────────────────── */
      if (action === 'snooze') {
        // Find the person in main list by ID
        const person = mainList.find(p => p.id === personId);

        if (!person) {
          return res.status(404).json({ error: 'Person not found on main list' });
        }

        if (!person.isWhitelisted) {
          return res.status(400).json({ error: 'Only whitelisted members can snooze' });
        }

        // Remove from main list
        mainList = mainList.filter(p => p.id !== personId);

        // ── Store snapshot for later restore ──
        const timezone = settings.accessPeriod?.timezone || 'Africa/Lagos';
        const currentWeekId = getCurrentWeekId(timezone);
        const snoozedData = await kv.get(SNOOZED_KEY) || { weekId: currentWeekId, names: [] };

        // If it's a new week, reset the snoozed list
        if (snoozedData.weekId !== currentWeekId) {
          snoozedData.weekId = currentWeekId;
          snoozedData.names = [];
        }

        const nameLC = person.name.toLowerCase();
        // Store full snapshot (including original timestamp) keyed by lowercase name
        const alreadySnooze = snoozedData.names.some(
          entry => (typeof entry === 'string' ? entry : entry.nameLC) === nameLC
        );
        if (!alreadySnooze) {
          snoozedData.names.push({
            nameLC,
            snapshot: {
              id: person.id,
              name: person.name,
              timestamp: person.timestamp,   // <-- preserve original timestamp
              isWhitelisted: person.isWhitelisted,
              deviceId: person.deviceId
            }
          });
        }

        // Rebalance after removal (promotes waitlist automatically)
        const rebalanced = rebalanceLists(mainList, waitlist, mainListLimit);
        mainList = rebalanced.mainList;
        waitlist = rebalanced.waitlist;

        await kv.set(RSVP_KEY, { mainList, waitlist });
        await kv.set(SNOOZED_KEY, snoozedData);

        // Extract updated snoozed names for frontend
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

      /* ──────────────────────────  UNSNOOZE  ─────────────────────────── */
      if (action === 'unsnooze') {
        const timezone = settings.accessPeriod?.timezone || 'Africa/Lagos';
        const currentWeekId = getCurrentWeekId(timezone);
        const snoozedData = await kv.get(SNOOZED_KEY) || { weekId: currentWeekId, names: [] };

        const nameLC = personName?.toLowerCase();

        // Find the snoozed entry (handle both old string format and new object format)
        const idx = snoozedData.names.findIndex(entry =>
          (typeof entry === 'string' ? entry : entry.nameLC) === nameLC
        );

        if (idx === -1) {
          return res.status(400).json({ error: 'This person is not currently snoozed' });
        }

        // Check if form is open
        const accessStatus = isFormOpen(settings);
        if (!accessStatus.isOpen) {
          return res.status(403).json({ error: accessStatus.message });
        }

        // Extract snapshot (or build fallback for legacy string entries)
        const entry = snoozedData.names[idx];
        let restored;

        if (typeof entry === 'object' && entry.snapshot) {
          // New format - use stored snapshot with original timestamp
          restored = { ...entry.snapshot };
        } else {
          // Legacy string format - need to build person from whitelist
          const whitelist = await kv.get('frisbee-whitelist') || [];
          const whitelistPerson = whitelist.find(w => w.name.toLowerCase() === nameLC);
          if (!whitelistPerson) {
            return res.status(400).json({ error: 'Could not find whitelist entry' });
          }
          restored = {
            id: Date.now(),
            name: whitelistPerson.name,
            timestamp: new Date().toISOString(),  // fallback - no original available
            isWhitelisted: true
          };
        }

        // Remove from snoozed list
        snoozedData.names.splice(idx, 1);
        await kv.set(SNOOZED_KEY, snoozedData);

        // Rebalance with the returning AIS member (original timestamp preserved)
        const rebalanced = rebalanceLists([...mainList, restored], waitlist, mainListLimit);
        mainList = rebalanced.mainList;
        waitlist = rebalanced.waitlist;

        // Determine where the person ended up
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

        await kv.set(RSVP_KEY, { mainList, waitlist });

        // Extract updated snoozed names for frontend
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
