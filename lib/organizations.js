import { GLOBAL_KEYS, getGlobalData, setGlobalData, ORG_KEY_SUFFIXES, setOrgData } from './kv';
import { generateId } from './auth';

/**
 * Organization and Organizer CRUD helpers
 */

// Default settings for new organizations
export const DEFAULT_ORG_SETTINGS = {
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
  },
  email: {
    enabled: false,
    recipients: [],
    cc: [],
    bcc: [],
    subject: 'Weekly {{sport}} RSVP List - {{week}}',
    body: 'Please find attached the RSVP list for this week\'s {{sport}} session.\n\nTotal participants: {{count}}'
  },
  whatsapp: {
    enabled: false,
    groupUrl: '',
  }
};

/**
 * Validate a slug (URL-safe, lowercase, alphanumeric with hyphens)
 */
export function validateSlug(slug) {
  if (!slug || typeof slug !== 'string') {
    return { valid: false, error: 'Slug is required' };
  }

  const normalized = slug.toLowerCase().trim();

  if (normalized.length < 3) {
    return { valid: false, error: 'Slug must be at least 3 characters' };
  }

  if (normalized.length > 50) {
    return { valid: false, error: 'Slug must be 50 characters or less' };
  }

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized)) {
    return { valid: false, error: 'Slug can only contain lowercase letters, numbers, and hyphens (not at start/end)' };
  }

  // Reserved slugs
  const reserved = ['admin', 'api', 'auth', 'dashboard', 'super-admin', 'login', 'logout', 'settings', 'help', 'about'];
  if (reserved.includes(normalized)) {
    return { valid: false, error: 'This slug is reserved' };
  }

  return { valid: true, normalized };
}

/**
 * Check if a slug is already taken
 */
export async function isSlugTaken(slug) {
  const orgs = await getGlobalData(GLOBAL_KEYS.ORGANIZATIONS, []);
  return orgs.some(o => o.slug === slug.toLowerCase());
}

// ─────────────────────────────────────────────────────────────
// ORGANIZER CRUD
// ─────────────────────────────────────────────────────────────

/**
 * Get all organizers
 */
export async function getOrganizers() {
  return getGlobalData(GLOBAL_KEYS.ORGANIZERS, []);
}

/**
 * Get organizer by ID
 */
export async function getOrganizerById(id) {
  const organizers = await getOrganizers();
  return organizers.find(o => o.id === id) || null;
}

/**
 * Get organizer by email
 */
export async function getOrganizerByEmail(email) {
  const organizers = await getOrganizers();
  return organizers.find(o => o.email.toLowerCase() === email.toLowerCase()) || null;
}

/**
 * Create an organizer (pending approval)
 */
export async function createOrganizer({ email, name, intendedSport, intendedLocation }) {
  const organizers = await getOrganizers();

  // Check if email already exists
  if (organizers.some(o => o.email.toLowerCase() === email.toLowerCase())) {
    throw new Error('An organizer with this email already exists');
  }

  const organizer = {
    id: generateId(),
    email: email.toLowerCase(),
    name: name.trim(),
    intendedSport: intendedSport?.trim() || null,
    intendedLocation: intendedLocation?.trim() || null,
    status: 'pending', // pending | approved | rejected
    createdAt: new Date().toISOString(),
    approvedAt: null,
  };

  organizers.push(organizer);
  await setGlobalData(GLOBAL_KEYS.ORGANIZERS, organizers);

  return organizer;
}

/**
 * Update organizer status (approve/reject)
 */
export async function updateOrganizerStatus(id, status) {
  const organizers = await getOrganizers();
  const index = organizers.findIndex(o => o.id === id);

  if (index === -1) {
    throw new Error('Organizer not found');
  }

  organizers[index].status = status;
  if (status === 'approved') {
    organizers[index].approvedAt = new Date().toISOString();
  }

  await setGlobalData(GLOBAL_KEYS.ORGANIZERS, organizers);
  return organizers[index];
}

/**
 * Delete an organizer
 */
export async function deleteOrganizer(id) {
  const organizers = await getOrganizers();
  const filtered = organizers.filter(o => o.id !== id);
  await setGlobalData(GLOBAL_KEYS.ORGANIZERS, filtered);
}

// ─────────────────────────────────────────────────────────────
// ORGANIZATION CRUD
// ─────────────────────────────────────────────────────────────

/**
 * Get all organizations
 */
export async function getOrganizations() {
  return getGlobalData(GLOBAL_KEYS.ORGANIZATIONS, []);
}

/**
 * Get organization by ID
 */
export async function getOrganizationById(id) {
  const orgs = await getOrganizations();
  return orgs.find(o => o.id === id) || null;
}

/**
 * Get organization by slug
 */
export async function getOrganizationBySlug(slug) {
  const orgs = await getOrganizations();
  return orgs.find(o => o.slug === slug.toLowerCase()) || null;
}

/**
 * Get organizations owned by an organizer
 */
export async function getOrganizationsByOwner(ownerId) {
  const orgs = await getOrganizations();
  return orgs.filter(o => o.ownerId === ownerId);
}

/**
 * Calculate access period based on RSVP window preset
 *
 * Presets:
 * - 'always-open': RSVP window is disabled (always accepting signups)
 * - '6-hours': Closes 6 hours before game
 * - '12-hours': Closes 12 hours before game
 * - '24-hours': Closes 24 hours before game
 *
 * Opens immediately after close time (so list reopens for next week)
 */
function calculateAccessPeriod(gameDay, gameStartHour, gameStartMinute, timezone, rsvpWindowPreset = '6-hours') {
  // If always-open, return disabled access period
  if (rsvpWindowPreset === 'always-open') {
    return {
      enabled: false,
      startDay: 0,
      startHour: 0,
      startMinute: 0,
      endDay: 0,
      endHour: 0,
      endMinute: 0,
      timezone: timezone || 'Africa/Lagos',
    };
  }

  // Calculate hours before game based on preset
  const hoursBefore = {
    '6-hours': 6,
    '12-hours': 12,
    '24-hours': 24,
  }[rsvpWindowPreset] || 6;

  // Calculate close time by subtracting hours from game start time
  let closeDay = gameDay;
  let closeHour = gameStartHour - hoursBefore;
  const closeMinute = gameStartMinute;

  // Handle hour underflow (go to previous day(s))
  while (closeHour < 0) {
    closeHour += 24;
    closeDay -= 1;
  }
  // Handle day underflow
  if (closeDay < 0) {
    closeDay += 7;
  }

  // Open time is 1 minute after close time
  // This means the list opens right after closing (for the next week)
  let openMinute = closeMinute + 1;
  let openHour = closeHour;
  let openDay = closeDay;

  if (openMinute >= 60) {
    openMinute = 0;
    openHour += 1;
  }
  if (openHour >= 24) {
    openHour = 0;
    openDay = (openDay + 1) % 7;
  }

  return {
    enabled: true,
    startDay: openDay,
    startHour: openHour,
    startMinute: openMinute,
    endDay: closeDay,
    endHour: closeHour,
    endMinute: closeMinute,
    timezone: timezone || 'Africa/Lagos',
  };
}

/**
 * Create a new organization
 */
export async function createOrganization({ slug, name, sport, location, streetAddress, timezone, ownerId, maxParticipants, gameSchedule, organizerEmail, rsvpWindowPreset }) {
  // Validate slug
  const slugValidation = validateSlug(slug);
  if (!slugValidation.valid) {
    throw new Error(slugValidation.error);
  }

  // Check if slug is taken
  if (await isSlugTaken(slugValidation.normalized)) {
    throw new Error('This slug is already taken');
  }

  const orgs = await getOrganizations();

  const organization = {
    id: generateId(),
    slug: slugValidation.normalized,
    name: name.trim(),
    sport: sport.trim().toLowerCase(),
    location: location?.trim() || null,
    streetAddress: streetAddress?.trim() || null,
    timezone: timezone || 'Africa/Lagos',
    ownerId,
    status: 'active', // pending | active | suspended
    visibility: 'public', // public | private - public by default
    createdAt: new Date().toISOString(),
  };

  orgs.push(organization);
  await setGlobalData(GLOBAL_KEYS.ORGANIZATIONS, orgs);

  // Calculate access period based on RSVP window preset
  const gameDay = gameSchedule?.gameDay ?? 0;
  const gameStartHour = gameSchedule?.startHour ?? 17;
  const gameStartMinute = gameSchedule?.startMinute ?? 0;
  const accessPeriod = calculateAccessPeriod(gameDay, gameStartHour, gameStartMinute, timezone, rsvpWindowPreset);

  // Initialize org settings with sport-specific defaults
  const settings = {
    ...DEFAULT_ORG_SETTINGS,
    mainListLimit: maxParticipants || DEFAULT_ORG_SETTINGS.mainListLimit,
    accessPeriod,
    email: {
      ...DEFAULT_ORG_SETTINGS.email,
      subject: DEFAULT_ORG_SETTINGS.email.subject.replace('{{sport}}', sport),
      body: DEFAULT_ORG_SETTINGS.email.body.replace('{{sport}}', sport),
      // Preset organizer email in CC field
      cc: organizerEmail ? [organizerEmail] : [],
    },
    gameInfo: {
      enabled: true,
      gameDay: gameDay,
      startHour: gameStartHour,
      startMinute: gameStartMinute,
      endHour: gameSchedule?.endHour ?? 19,
      endMinute: gameSchedule?.endMinute ?? 0,
      location: {
        enabled: !!streetAddress,
        area: location || '',
        address: streetAddress || '',
        googleMapsUrl: '',
      },
      rules: {
        enabled: false,
        items: [],
      },
      weather: {
        enabled: false,
      },
    },
  };

  await setOrgData(organization.id, ORG_KEY_SUFFIXES.SETTINGS, settings);
  await setOrgData(organization.id, ORG_KEY_SUFFIXES.RSVP_DATA, { mainList: [], waitlist: [] });
  await setOrgData(organization.id, ORG_KEY_SUFFIXES.WHITELIST, []);
  await setOrgData(organization.id, ORG_KEY_SUFFIXES.ARCHIVE, []);

  return organization;
}

/**
 * Update organization
 */
export async function updateOrganization(id, updates) {
  const orgs = await getOrganizations();
  const index = orgs.findIndex(o => o.id === id);

  if (index === -1) {
    throw new Error('Organization not found');
  }

  // If updating slug, validate and check availability
  if (updates.slug && updates.slug !== orgs[index].slug) {
    const slugValidation = validateSlug(updates.slug);
    if (!slugValidation.valid) {
      throw new Error(slugValidation.error);
    }
    if (await isSlugTaken(slugValidation.normalized)) {
      throw new Error('This slug is already taken');
    }
    updates.slug = slugValidation.normalized;
  }

  // Only allow certain fields to be updated
  const allowedFields = ['slug', 'name', 'sport', 'location', 'streetAddress', 'timezone', 'status', 'displayOrder', 'visibility'];
  for (const key of Object.keys(updates)) {
    if (allowedFields.includes(key)) {
      orgs[index][key] = updates[key];
    }
  }

  orgs[index].updatedAt = new Date().toISOString();
  await setGlobalData(GLOBAL_KEYS.ORGANIZATIONS, orgs);

  return orgs[index];
}

/**
 * Delete organization (and all its data)
 */
export async function deleteOrganization(id) {
  const orgs = await getOrganizations();
  const filtered = orgs.filter(o => o.id !== id);
  await setGlobalData(GLOBAL_KEYS.ORGANIZATIONS, filtered);

  // Note: Caller should also call deleteAllOrgData(id) from kv.js
}

/**
 * Check if an organizer owns an organization
 */
export async function organizerOwnsOrg(organizerId, orgId) {
  const org = await getOrganizationById(orgId);
  return org && org.ownerId === organizerId;
}

/**
 * Get public organization info (for display)
 */
export function getPublicOrgInfo(org) {
  return {
    id: org.id,
    slug: org.slug,
    name: org.name,
    sport: org.sport,
    location: org.location,
  };
}
