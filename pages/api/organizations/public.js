import { getOrganizations } from '../../../lib/organizations';
import { getOrgData, ORG_KEY_SUFFIXES } from '../../../lib/kv';

/**
 * Public API to get all active organizations for browsing
 * Returns basic info needed for filtering and display
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Prevent caching to ensure visibility changes take effect immediately
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  try {
    const allOrgs = await getOrganizations();

    // Filter to only active AND public organizations
    // Organizations without visibility field or with visibility !== 'public' are excluded
    const activeOrgs = allOrgs.filter(org => org.status === 'active' && org.visibility === 'public');

    // Get additional info for each org (settings for RSVP status)
    const orgsWithInfo = await Promise.all(activeOrgs.map(async (org) => {
      const settings = await getOrgData(org.id, ORG_KEY_SUFFIXES.SETTINGS, {
        mainListLimit: 30,
        accessPeriod: { enabled: false }
      });
      const rsvpData = await getOrgData(org.id, ORG_KEY_SUFFIXES.RSVP_DATA, { mainList: [], waitlist: [] });

      // Check if RSVP is currently open
      let isOpen = true;
      if (settings.accessPeriod?.enabled) {
        const now = new Date();
        const timezone = settings.accessPeriod.timezone || org.timezone || 'Africa/Lagos';
        const localTime = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
        const currentDay = localTime.getDay();
        const currentHour = localTime.getHours();
        const currentMinute = localTime.getMinutes();

        const { startDay, startHour, startMinute, endDay, endHour, endMinute } = settings.accessPeriod;

        const currentMins = currentDay * 24 * 60 + currentHour * 60 + currentMinute;
        const startMins = startDay * 24 * 60 + startHour * 60 + startMinute;
        const endMins = endDay * 24 * 60 + endHour * 60 + endMinute;

        if (startMins <= endMins) {
          isOpen = currentMins >= startMins && currentMins < endMins;
        } else {
          isOpen = currentMins >= startMins || currentMins < endMins;
        }
      }

      // Get game day and time info
      const gameDay = settings.gameInfo?.gameDay;
      const startHour = settings.gameInfo?.startHour;

      return {
        slug: org.slug,
        name: org.name,
        sport: org.sport,
        location: org.location,
        signupCount: rsvpData.mainList?.length || 0,
        maxParticipants: settings.mainListLimit || 30,
        isOpen,
        gameDay: gameDay !== undefined ? gameDay : null,
        startHour: startHour !== undefined ? startHour : null,
      };
    }));

    // Get unique sports and locations for filters
    const sports = [...new Set(orgsWithInfo.map(o => o.sport).filter(Boolean))].sort();
    const locations = [...new Set(orgsWithInfo.map(o => o.location).filter(Boolean))].sort();

    // Get unique game days (only include days that have events)
    const gameDays = [...new Set(orgsWithInfo.map(o => o.gameDay).filter(d => d !== null))].sort((a, b) => a - b);

    return res.status(200).json({
      organizations: orgsWithInfo,
      filters: {
        sports,
        locations,
        gameDays,
      }
    });
  } catch (error) {
    console.error('Failed to get public organizations:', error);
    return res.status(500).json({ error: 'Failed to load organizations' });
  }
}
