import { kv } from '@vercel/kv';
import { verifySession, parseCookies, isSuperAdmin, generateId } from '../../../lib/auth';
import { getOrganizerById, getOrganizationBySlug, createOrganization } from '../../../lib/organizations';
import { setOrgData, ORG_KEY_SUFFIXES, GLOBAL_KEYS, setGlobalData, getGlobalData } from '../../../lib/kv';

// Legacy key names from the original single-tenant system
const LEGACY_KEYS = {
  RSVP_DATA: 'frisbee-rsvp-data',
  SETTINGS: 'frisbee-settings',
  WHITELIST: 'frisbee-whitelist',
  ARCHIVE: 'frisbee-archive',
  LAST_RESET: 'frisbee-last-reset',
  LAST_EMAIL: 'frisbee-last-email',
  SNOOZED: 'frisbee-snoozed',
  EMAIL_STATUS: 'frisbee-email-status',
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Authenticate - only super admin can run migration
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
  if (!organizer || !isSuperAdmin(organizer.email)) {
    return res.status(403).json({ error: 'Super admin access required' });
  }

  try {
    const { slug = 'frisbee', name = 'Lagos Frisbee', location = '1004 Estate, Victoria Island' } = req.body;

    // Check if organization already exists
    let org = await getOrganizationBySlug(slug);

    if (org) {
      return res.status(400).json({
        error: `Organization with slug "${slug}" already exists. Data may already be migrated.`,
        organization: org,
      });
    }

    // Read all legacy data
    console.log('Reading legacy data...');
    const legacyData = {
      rsvpData: await kv.get(LEGACY_KEYS.RSVP_DATA),
      settings: await kv.get(LEGACY_KEYS.SETTINGS),
      whitelist: await kv.get(LEGACY_KEYS.WHITELIST),
      archive: await kv.get(LEGACY_KEYS.ARCHIVE),
      lastReset: await kv.get(LEGACY_KEYS.LAST_RESET),
      lastEmail: await kv.get(LEGACY_KEYS.LAST_EMAIL),
      snoozed: await kv.get(LEGACY_KEYS.SNOOZED),
      emailStatus: await kv.get(LEGACY_KEYS.EMAIL_STATUS),
    };

    console.log('Legacy data found:', {
      hasRsvpData: !!legacyData.rsvpData,
      mainListCount: legacyData.rsvpData?.mainList?.length || 0,
      waitlistCount: legacyData.rsvpData?.waitlist?.length || 0,
      whitelistCount: legacyData.whitelist?.length || 0,
      archiveCount: legacyData.archive?.length || 0,
    });

    // Create the organization
    console.log('Creating organization...');
    org = await createOrganization({
      slug,
      name,
      sport: 'frisbee',
      location,
      timezone: legacyData.settings?.accessPeriod?.timezone || 'Africa/Lagos',
      ownerId: organizerId,
    });

    console.log('Organization created:', org.id);

    // Migrate data to org-namespaced keys
    console.log('Migrating data to org-namespaced keys...');

    if (legacyData.rsvpData) {
      await setOrgData(org.id, ORG_KEY_SUFFIXES.RSVP_DATA, legacyData.rsvpData);
    }

    if (legacyData.settings) {
      await setOrgData(org.id, ORG_KEY_SUFFIXES.SETTINGS, legacyData.settings);
    }

    if (legacyData.whitelist) {
      await setOrgData(org.id, ORG_KEY_SUFFIXES.WHITELIST, legacyData.whitelist);
    }

    if (legacyData.archive) {
      await setOrgData(org.id, ORG_KEY_SUFFIXES.ARCHIVE, legacyData.archive);
    }

    if (legacyData.lastReset) {
      await setOrgData(org.id, ORG_KEY_SUFFIXES.LAST_RESET, legacyData.lastReset);
    }

    if (legacyData.lastEmail) {
      await setOrgData(org.id, ORG_KEY_SUFFIXES.LAST_EMAIL, legacyData.lastEmail);
    }

    if (legacyData.snoozed) {
      await setOrgData(org.id, ORG_KEY_SUFFIXES.SNOOZED, legacyData.snoozed);
    }

    if (legacyData.emailStatus) {
      await setOrgData(org.id, ORG_KEY_SUFFIXES.EMAIL_STATUS, legacyData.emailStatus);
    }

    console.log('Migration complete!');

    return res.status(200).json({
      success: true,
      message: 'Migration completed successfully',
      organization: org,
      migrated: {
        rsvpData: !!legacyData.rsvpData,
        settings: !!legacyData.settings,
        whitelist: legacyData.whitelist?.length || 0,
        archive: legacyData.archive?.length || 0,
        mainList: legacyData.rsvpData?.mainList?.length || 0,
        waitlist: legacyData.rsvpData?.waitlist?.length || 0,
      },
      note: 'Original legacy data has been preserved. You can delete it manually after verifying the migration.',
      accessUrl: `/${slug}`,
      adminUrl: `/${slug}/admin`,
    });
  } catch (error) {
    console.error('Migration error:', error);
    return res.status(500).json({ error: error.message || 'Migration failed' });
  }
}
