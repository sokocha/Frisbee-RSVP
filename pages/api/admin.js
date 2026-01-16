import { kv } from '@vercel/kv';

const RSVP_KEY = 'frisbee-rsvp-data';
const ADMIN_KEY = 'frisbee-admin-password';
const WHITELIST_KEY = 'frisbee-whitelist';
const SETTINGS_KEY = 'frisbee-settings';
const ARCHIVE_KEY = 'frisbee-archive';

// Admin password - change this or set via environment variables
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'frisbee-admin-2024';

/**
 * Sort people by priority:
 * 1. AIS members first (by earliest timestamp)
 * 2. Non-AIS members second (by earliest timestamp)
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

// Default settings (WAT = UTC+1)
const DEFAULT_SETTINGS = {
  mainListLimit: 30,
  accessPeriod: {
    enabled: true,
    startDay: 4,        // Thursday (0=Sunday, 4=Thursday)
    startHour: 12,      // 12:00 (noon)
    startMinute: 0,
    endDay: 5,          // Friday
    endHour: 10,        // 10:00
    endMinute: 0,
    timezone: 'Africa/Lagos'  // WAT timezone
  },
  email: {
    enabled: false,
    recipients: [],     // Array of email addresses
    subject: 'Weekly Frisbee RSVP List - {{week}}',
    body: 'Please find attached the RSVP list for this week\'s frisbee session.\n\nTotal participants: {{count}}'
  }
};

export default async function handler(req, res) {
  // Verify admin password
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace('Bearer ', '');

  if (token !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method === 'GET') {
    // Get all data including whitelist, settings, and archive
    try {
      const rsvpData = await kv.get(RSVP_KEY) || { mainList: [], waitlist: [] };
      const whitelist = await kv.get(WHITELIST_KEY) || [];
      const settings = await kv.get(SETTINGS_KEY) || DEFAULT_SETTINGS;
      const archive = await kv.get(ARCHIVE_KEY) || [];
      const limit = settings.mainListLimit || 30;

      // Auto-rebalance on load to ensure correct priority order
      const rebalanced = rebalanceLists(rsvpData.mainList, rsvpData.waitlist, limit);

      // Only save if order changed
      const orderChanged = JSON.stringify(rebalanced) !== JSON.stringify(rsvpData);
      if (orderChanged) {
        await kv.set(RSVP_KEY, rebalanced);
      }

      return res.status(200).json({
        mainList: rebalanced.mainList,
        waitlist: rebalanced.waitlist,
        whitelist,
        settings,
        archive
      });
    } catch (error) {
      console.error('Failed to get admin data:', error);
      return res.status(500).json({ error: 'Failed to load data' });
    }
  }

  if (req.method === 'POST') {
    const { action, data } = req.body;

    try {
      if (action === 'add-whitelist') {
        // Add alumni to whitelist and main list
        const { names } = data; // Array of names

        if (!names || !Array.isArray(names) || names.length === 0) {
          return res.status(400).json({ error: 'Names array is required' });
        }

        const rsvpData = await kv.get(RSVP_KEY) || { mainList: [], waitlist: [] };
        let whitelist = await kv.get(WHITELIST_KEY) || [];
        const settings = await kv.get(SETTINGS_KEY) || DEFAULT_SETTINGS;
        const limit = settings.mainListLimit || 30;

        const added = [];
        const skipped = [];

        for (const name of names) {
          const trimmedName = name.trim();
          if (!trimmedName) continue;

          // Check if already in whitelist
          if (whitelist.some(w => w.name.toLowerCase() === trimmedName.toLowerCase())) {
            skipped.push({ name: trimmedName, reason: 'Already in whitelist' });
            continue;
          }

          // Check if already in main list or waitlist
          const allSignups = [...rsvpData.mainList, ...rsvpData.waitlist];
          if (allSignups.some(p => p.name.toLowerCase() === trimmedName.toLowerCase())) {
            skipped.push({ name: trimmedName, reason: 'Already signed up' });
            continue;
          }

          const newPerson = {
            id: Date.now() + Math.random(),
            name: trimmedName,
            timestamp: new Date().toISOString(),
            deviceId: `whitelist-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            isWhitelisted: true
          };

          // Add to whitelist record
          whitelist.push({
            name: trimmedName,
            addedAt: new Date().toISOString()
          });

          // Add the new person to the combined list and rebalance
          const rebalanced = rebalanceLists(
            [...rsvpData.mainList, newPerson],
            rsvpData.waitlist,
            limit
          );
          rsvpData.mainList = rebalanced.mainList;
          rsvpData.waitlist = rebalanced.waitlist;

          added.push(trimmedName);
        }

        await kv.set(RSVP_KEY, rsvpData);
        await kv.set(WHITELIST_KEY, whitelist);

        return res.status(200).json({
          success: true,
          added,
          skipped,
          mainList: rsvpData.mainList,
          waitlist: rsvpData.waitlist,
          whitelist
        });
      }

      if (action === 'remove-whitelist') {
        // Remove someone from whitelist and lists
        const { name } = data;

        if (!name) {
          return res.status(400).json({ error: 'Name is required' });
        }

        const rsvpData = await kv.get(RSVP_KEY) || { mainList: [], waitlist: [] };
        let whitelist = await kv.get(WHITELIST_KEY) || [];

        // Remove from whitelist
        whitelist = whitelist.filter(w => w.name.toLowerCase() !== name.toLowerCase());

        // Remove from main list or waitlist
        const wasInMain = rsvpData.mainList.some(p => p.name.toLowerCase() === name.toLowerCase());
        rsvpData.mainList = rsvpData.mainList.filter(p => p.name.toLowerCase() !== name.toLowerCase());
        rsvpData.waitlist = rsvpData.waitlist.filter(p => p.name.toLowerCase() !== name.toLowerCase());

        // If removed from main list and waitlist has people, promote
        if (wasInMain && rsvpData.waitlist.length > 0) {
          const promoted = rsvpData.waitlist.shift();
          rsvpData.mainList.push(promoted);
        }

        await kv.set(RSVP_KEY, rsvpData);
        await kv.set(WHITELIST_KEY, whitelist);

        return res.status(200).json({
          success: true,
          mainList: rsvpData.mainList,
          waitlist: rsvpData.waitlist,
          whitelist
        });
      }

      if (action === 'remove-person') {
        // Remove any person (not just whitelisted)
        const { personId, isWaitlist } = data;

        const rsvpData = await kv.get(RSVP_KEY) || { mainList: [], waitlist: [] };

        if (isWaitlist) {
          rsvpData.waitlist = rsvpData.waitlist.filter(p => p.id !== personId);
        } else {
          rsvpData.mainList = rsvpData.mainList.filter(p => p.id !== personId);

          // Promote from waitlist if available
          if (rsvpData.waitlist.length > 0) {
            const promoted = rsvpData.waitlist.shift();
            rsvpData.mainList.push(promoted);
          }
        }

        await kv.set(RSVP_KEY, rsvpData);

        return res.status(200).json({
          success: true,
          mainList: rsvpData.mainList,
          waitlist: rsvpData.waitlist
        });
      }

      if (action === 'reset-all') {
        await kv.set(RSVP_KEY, { mainList: [], waitlist: [] });
        await kv.set(WHITELIST_KEY, []);

        return res.status(200).json({
          success: true,
          mainList: [],
          waitlist: [],
          whitelist: []
        });
      }

      if (action === 'reset-signups') {
        // Reset only non-whitelisted signups, keep whitelist intact
        const whitelist = await kv.get(WHITELIST_KEY) || [];
        const rsvpData = await kv.get(RSVP_KEY) || { mainList: [], waitlist: [] };

        // Keep only whitelisted people in main list
        const whitelistedPeople = rsvpData.mainList.filter(p => p.isWhitelisted);

        await kv.set(RSVP_KEY, { mainList: whitelistedPeople, waitlist: [] });

        return res.status(200).json({
          success: true,
          mainList: whitelistedPeople,
          waitlist: [],
          whitelist
        });
      }

      if (action === 'update-settings') {
        // Update settings
        const { settings } = data;

        if (!settings) {
          return res.status(400).json({ error: 'Settings are required' });
        }

        const currentSettings = await kv.get(SETTINGS_KEY) || DEFAULT_SETTINGS;
        const oldLimit = currentSettings.mainListLimit || 30;
        const newLimit = settings.mainListLimit ?? oldLimit;

        const newSettings = {
          ...currentSettings,
          mainListLimit: newLimit,
          accessPeriod: {
            ...currentSettings.accessPeriod,
            ...(settings.accessPeriod || {})
          },
          email: {
            ...(currentSettings.email || DEFAULT_SETTINGS.email),
            ...(settings.email || {})
          }
        };

        await kv.set(SETTINGS_KEY, newSettings);

        // Always rebalance lists based on the new limit
        const rsvpData = await kv.get(RSVP_KEY) || { mainList: [], waitlist: [] };
        const oldMainListIds = new Set(rsvpData.mainList.map(p => p.id));

        const rebalanced = rebalanceLists(rsvpData.mainList, rsvpData.waitlist, newLimit);

        // Calculate who was promoted and demoted
        const promoted = rebalanced.mainList.filter(p => !oldMainListIds.has(p.id));
        const demoted = rebalanced.waitlist.filter(p => oldMainListIds.has(p.id));

        // Always save the rebalanced lists to ensure correct priority order
        await kv.set(RSVP_KEY, rebalanced);

        return res.status(200).json({
          success: true,
          settings: newSettings,
          promoted,
          demoted,
          mainList: rebalanced.mainList,
          waitlist: rebalanced.waitlist
        });
      }

      return res.status(400).json({ error: 'Invalid action' });
    } catch (error) {
      console.error('Admin action failed:', error);
      return res.status(500).json({ error: 'Action failed' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
