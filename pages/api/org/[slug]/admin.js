import { verifySession, parseCookies, isSuperAdmin } from '../../../../lib/auth';
import { getOrganizerById, getOrganizationBySlug, organizerOwnsOrg } from '../../../../lib/organizations';
import { getOrgData, setOrgData, ORG_KEY_SUFFIXES } from '../../../../lib/kv';

/**
 * Sort people by priority
 */
function sortByPriority(people) {
  return [...people].sort((a, b) => {
    if (a.isWhitelisted && !b.isWhitelisted) return -1;
    if (!a.isWhitelisted && b.isWhitelisted) return 1;
    return new Date(a.timestamp) - new Date(b.timestamp);
  });
}

/**
 * Rebalance lists
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
    email: {
      enabled: false,
      recipients: [],
      subject: 'Weekly RSVP List - {{week}}',
      body: 'Please find attached the RSVP list for this week.\n\nTotal participants: {{count}}'
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

export default async function handler(req, res) {
  const { slug } = req.query;

  // Get organization
  const org = await getOrganizationBySlug(slug);
  if (!org) {
    return res.status(404).json({ error: 'Organization not found' });
  }

  const orgId = org.id;

  // Authenticate organizer
  const cookies = parseCookies(req);
  const sessionToken = cookies.session;

  // Also check Authorization header for API access
  let authToken = sessionToken;
  const authHeader = req.headers.authorization;
  if (!authToken && authHeader?.startsWith('Bearer ')) {
    authToken = authHeader.slice(7);
  }

  if (!authToken) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const organizerId = await verifySession(authToken);
  if (!organizerId) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }

  const organizer = await getOrganizerById(organizerId);
  if (!organizer) {
    return res.status(403).json({ error: 'Organizer not found' });
  }

  // Check permission
  const isAdmin = isSuperAdmin(organizer.email);

  // Check if approved (super admins bypass this check)
  if (organizer.status !== 'approved' && !isAdmin) {
    return res.status(403).json({ error: 'Account not approved' });
  }
  const hasPermission = isAdmin || await organizerOwnsOrg(organizerId, orgId);
  if (!hasPermission) {
    return res.status(403).json({ error: 'You do not have permission to manage this organization' });
  }

  if (req.method === 'GET') {
    try {
      const rsvpData = await getOrgData(orgId, ORG_KEY_SUFFIXES.RSVP_DATA, { mainList: [], waitlist: [] });
      const whitelist = await getOrgData(orgId, ORG_KEY_SUFFIXES.WHITELIST, []);
      const settings = await getOrgData(orgId, ORG_KEY_SUFFIXES.SETTINGS, getDefaultSettings(org.timezone));
      const archive = await getOrgData(orgId, ORG_KEY_SUFFIXES.ARCHIVE, []);
      const emailStatus = await getOrgData(orgId, ORG_KEY_SUFFIXES.EMAIL_STATUS, null);
      const lastEmailWeek = await getOrgData(orgId, ORG_KEY_SUFFIXES.LAST_EMAIL, null);
      const limit = settings.mainListLimit || 30;

      const rebalanced = rebalanceLists(rsvpData.mainList, rsvpData.waitlist, limit);
      const orderChanged = JSON.stringify(rebalanced) !== JSON.stringify(rsvpData);
      if (orderChanged) {
        await setOrgData(orgId, ORG_KEY_SUFFIXES.RSVP_DATA, rebalanced);
      }

      const timezone = settings.accessPeriod?.timezone || org.timezone || 'Africa/Lagos';
      const currentWeekId = getCurrentWeekId(timezone);

      return res.status(200).json({
        organization: {
          id: org.id,
          slug: org.slug,
          name: org.name,
          sport: org.sport,
          location: org.location,
          timezone: org.timezone,
        },
        mainList: rebalanced.mainList,
        waitlist: rebalanced.waitlist,
        whitelist,
        settings,
        archive,
        emailStatus,
        lastEmailWeek,
        currentWeekId
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
        const { names } = data;

        if (!names || !Array.isArray(names) || names.length === 0) {
          return res.status(400).json({ error: 'Names array is required' });
        }

        const rsvpData = await getOrgData(orgId, ORG_KEY_SUFFIXES.RSVP_DATA, { mainList: [], waitlist: [] });
        let whitelist = await getOrgData(orgId, ORG_KEY_SUFFIXES.WHITELIST, []);
        const settings = await getOrgData(orgId, ORG_KEY_SUFFIXES.SETTINGS, getDefaultSettings(org.timezone));
        const limit = settings.mainListLimit || 30;

        const added = [];
        const skipped = [];

        for (const name of names) {
          const trimmedName = name.trim();
          if (!trimmedName) continue;

          if (whitelist.some(w => w.name.toLowerCase() === trimmedName.toLowerCase())) {
            skipped.push({ name: trimmedName, reason: 'Already in whitelist' });
            continue;
          }

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

          whitelist.push({
            name: trimmedName,
            addedAt: new Date().toISOString()
          });

          const rebalanced = rebalanceLists(
            [...rsvpData.mainList, newPerson],
            rsvpData.waitlist,
            limit
          );
          rsvpData.mainList = rebalanced.mainList;
          rsvpData.waitlist = rebalanced.waitlist;

          added.push(trimmedName);
        }

        await setOrgData(orgId, ORG_KEY_SUFFIXES.RSVP_DATA, rsvpData);
        await setOrgData(orgId, ORG_KEY_SUFFIXES.WHITELIST, whitelist);

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
        const { name } = data;

        if (!name) {
          return res.status(400).json({ error: 'Name is required' });
        }

        const rsvpData = await getOrgData(orgId, ORG_KEY_SUFFIXES.RSVP_DATA, { mainList: [], waitlist: [] });
        let whitelist = await getOrgData(orgId, ORG_KEY_SUFFIXES.WHITELIST, []);

        whitelist = whitelist.filter(w => w.name.toLowerCase() !== name.toLowerCase());

        const wasInMain = rsvpData.mainList.some(p => p.name.toLowerCase() === name.toLowerCase());
        rsvpData.mainList = rsvpData.mainList.filter(p => p.name.toLowerCase() !== name.toLowerCase());
        rsvpData.waitlist = rsvpData.waitlist.filter(p => p.name.toLowerCase() !== name.toLowerCase());

        if (wasInMain && rsvpData.waitlist.length > 0) {
          const promoted = rsvpData.waitlist.shift();
          rsvpData.mainList.push(promoted);
        }

        await setOrgData(orgId, ORG_KEY_SUFFIXES.RSVP_DATA, rsvpData);
        await setOrgData(orgId, ORG_KEY_SUFFIXES.WHITELIST, whitelist);

        return res.status(200).json({
          success: true,
          mainList: rsvpData.mainList,
          waitlist: rsvpData.waitlist,
          whitelist
        });
      }

      if (action === 'remove-person') {
        const { personId, isWaitlist } = data;

        const rsvpData = await getOrgData(orgId, ORG_KEY_SUFFIXES.RSVP_DATA, { mainList: [], waitlist: [] });

        if (isWaitlist) {
          rsvpData.waitlist = rsvpData.waitlist.filter(p => p.id !== personId);
        } else {
          rsvpData.mainList = rsvpData.mainList.filter(p => p.id !== personId);

          if (rsvpData.waitlist.length > 0) {
            const promoted = rsvpData.waitlist.shift();
            rsvpData.mainList.push(promoted);
          }
        }

        await setOrgData(orgId, ORG_KEY_SUFFIXES.RSVP_DATA, rsvpData);

        return res.status(200).json({
          success: true,
          mainList: rsvpData.mainList,
          waitlist: rsvpData.waitlist
        });
      }

      if (action === 'reset-all') {
        await setOrgData(orgId, ORG_KEY_SUFFIXES.RSVP_DATA, { mainList: [], waitlist: [] });
        await setOrgData(orgId, ORG_KEY_SUFFIXES.WHITELIST, []);

        return res.status(200).json({
          success: true,
          mainList: [],
          waitlist: [],
          whitelist: []
        });
      }

      if (action === 'reset-signups') {
        const whitelist = await getOrgData(orgId, ORG_KEY_SUFFIXES.WHITELIST, []);
        const rsvpData = await getOrgData(orgId, ORG_KEY_SUFFIXES.RSVP_DATA, { mainList: [], waitlist: [] });

        const whitelistedPeople = rsvpData.mainList.filter(p => p.isWhitelisted);

        await setOrgData(orgId, ORG_KEY_SUFFIXES.RSVP_DATA, { mainList: whitelistedPeople, waitlist: [] });

        return res.status(200).json({
          success: true,
          mainList: whitelistedPeople,
          waitlist: [],
          whitelist
        });
      }

      if (action === 'update-settings') {
        const { settings } = data;

        if (!settings) {
          return res.status(400).json({ error: 'Settings are required' });
        }

        const currentSettings = await getOrgData(orgId, ORG_KEY_SUFFIXES.SETTINGS, getDefaultSettings(org.timezone));
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
            ...(currentSettings.email || getDefaultSettings().email),
            ...(settings.email || {})
          },
          gameInfo: settings.gameInfo ? {
            ...(currentSettings.gameInfo || getDefaultSettings().gameInfo),
            ...settings.gameInfo,
            location: {
              ...(currentSettings.gameInfo?.location || getDefaultSettings().gameInfo.location),
              ...(settings.gameInfo?.location || {})
            },
            rules: {
              ...(currentSettings.gameInfo?.rules || getDefaultSettings().gameInfo.rules),
              ...(settings.gameInfo?.rules || {})
            },
            weather: {
              ...(currentSettings.gameInfo?.weather || getDefaultSettings().gameInfo.weather),
              ...(settings.gameInfo?.weather || {})
            }
          } : (currentSettings.gameInfo || getDefaultSettings().gameInfo)
        };

        await setOrgData(orgId, ORG_KEY_SUFFIXES.SETTINGS, newSettings);

        const rsvpData = await getOrgData(orgId, ORG_KEY_SUFFIXES.RSVP_DATA, { mainList: [], waitlist: [] });
        const oldMainListIds = new Set(rsvpData.mainList.map(p => p.id));

        const rebalanced = rebalanceLists(rsvpData.mainList, rsvpData.waitlist, newLimit);

        const promoted = rebalanced.mainList.filter(p => !oldMainListIds.has(p.id));
        const demoted = rebalanced.waitlist.filter(p => oldMainListIds.has(p.id));

        await setOrgData(orgId, ORG_KEY_SUFFIXES.RSVP_DATA, rebalanced);

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
