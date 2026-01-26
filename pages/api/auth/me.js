import { verifySession, parseCookies, isSuperAdmin } from '../../../lib/auth';
import { getOrganizerById, getOrganizationsByOwner } from '../../../lib/organizations';
import { getOrgData, ORG_KEY_SUFFIXES } from '../../../lib/kv';

// Check if RSVP window is currently open
function getWindowStatus(settings, timezone) {
  if (!settings?.accessPeriod?.enabled) {
    return { status: 'always_open', label: 'Always Open' };
  }

  const now = new Date();
  const localTime = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
  const currentDay = localTime.getDay();
  const currentHour = localTime.getHours();
  const currentMinute = localTime.getMinutes();

  const { startDay, startHour, startMinute, endDay, endHour, endMinute } = settings.accessPeriod;

  const currentTotalMinutes = currentDay * 24 * 60 + currentHour * 60 + currentMinute;
  const startTotalMinutes = startDay * 24 * 60 + startHour * 60 + startMinute;
  const endTotalMinutes = endDay * 24 * 60 + endHour * 60 + endMinute;

  let isOpen = false;
  if (startTotalMinutes <= endTotalMinutes) {
    isOpen = currentTotalMinutes >= startTotalMinutes && currentTotalMinutes < endTotalMinutes;
  } else {
    isOpen = currentTotalMinutes >= startTotalMinutes || currentTotalMinutes < endTotalMinutes;
  }

  if (isOpen) {
    // Calculate time until close
    let minutesUntilClose = endTotalMinutes - currentTotalMinutes;
    if (minutesUntilClose < 0) minutesUntilClose += 7 * 24 * 60;
    return {
      status: 'open',
      label: 'Open',
      minutesUntilChange: minutesUntilClose
    };
  } else {
    // Calculate time until open
    let minutesUntilOpen = startTotalMinutes - currentTotalMinutes;
    if (minutesUntilOpen < 0) minutesUntilOpen += 7 * 24 * 60;
    return {
      status: 'closed',
      label: 'Closed',
      minutesUntilChange: minutesUntilOpen
    };
  }
}

// Format minutes into human-readable string
function formatTimeUntil(minutes) {
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 24 * 60) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }
  const days = Math.floor(minutes / (24 * 60));
  const hours = Math.floor((minutes % (24 * 60)) / 60);
  return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
}

// Get default settings
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

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get session from cookie
    const cookies = parseCookies(req);
    const sessionToken = cookies.session;

    if (!sessionToken) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const organizerId = await verifySession(sessionToken);

    if (!organizerId) {
      return res.status(401).json({ error: 'Invalid or expired session' });
    }

    const organizer = await getOrganizerById(organizerId);

    if (!organizer) {
      return res.status(401).json({ error: 'Organizer not found' });
    }

    // Get organizations owned by this organizer
    const organizations = await getOrganizationsByOwner(organizerId);

    // Fetch stats for each organization
    const orgsWithStats = await Promise.all(organizations.map(async (org) => {
      const settings = await getOrgData(org.id, ORG_KEY_SUFFIXES.SETTINGS, getDefaultSettings(org.timezone));
      const rsvpData = await getOrgData(org.id, ORG_KEY_SUFFIXES.RSVP_DATA, { mainList: [], waitlist: [] });
      const timezone = settings?.accessPeriod?.timezone || org.timezone || 'Africa/Lagos';

      // Get window status
      const windowStatus = getWindowStatus(settings, timezone);

      // Find last signup time
      const allSignups = [...(rsvpData.mainList || []), ...(rsvpData.waitlist || [])];
      let lastSignup = null;
      if (allSignups.length > 0) {
        const sorted = allSignups.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        lastSignup = sorted[0]?.timestamp;
      }

      return {
        id: org.id,
        slug: org.slug,
        name: org.name,
        sport: org.sport,
        location: org.location,
        status: org.status,
        displayOrder: org.displayOrder || 0,
        stats: {
          mainListCount: rsvpData.mainList?.length || 0,
          waitlistCount: rsvpData.waitlist?.length || 0,
          mainListLimit: settings?.mainListLimit || 30,
          lastSignup,
          windowStatus: windowStatus.status,
          windowLabel: windowStatus.label,
          windowTimeUntilChange: windowStatus.minutesUntilChange
            ? formatTimeUntil(windowStatus.minutesUntilChange)
            : null,
        },
      };
    }));

    // Sort by displayOrder
    orgsWithStats.sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));

    return res.status(200).json({
      organizer: {
        id: organizer.id,
        email: organizer.email,
        name: organizer.name,
        status: organizer.status,
        isSuperAdmin: isSuperAdmin(organizer.email),
      },
      organizations: orgsWithStats,
    });
  } catch (error) {
    console.error('Get me error:', error);
    return res.status(500).json({ error: 'Failed to get user info' });
  }
}
