/**
 * Unit tests for organizations library functions
 */

// Mock crypto.randomUUID for Node versions that don't support it
if (!global.crypto) {
  global.crypto = {};
}
if (!global.crypto.randomUUID) {
  global.crypto.randomUUID = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  };
}

// Mock @vercel/kv
const mockKvStore = {};
jest.mock('@vercel/kv', () => ({
  kv: {
    get: jest.fn((key) => Promise.resolve(mockKvStore[key])),
    set: jest.fn((key, value) => {
      mockKvStore[key] = value;
      return Promise.resolve();
    }),
    del: jest.fn((key) => {
      delete mockKvStore[key];
      return Promise.resolve();
    }),
  },
}));

import {
  validateSlug,
  isSlugTaken,
  getOrganizers,
  getOrganizerById,
  getOrganizerByEmail,
  createOrganizer,
  updateOrganizerStatus,
  getOrganizations,
  getOrganizationById,
  getOrganizationBySlug,
  getOrganizationsByOwner,
  createOrganization,
  updateOrganization,
  organizerOwnsOrg,
} from '../../lib/organizations';

// Clear store between tests
beforeEach(() => {
  Object.keys(mockKvStore).forEach(key => delete mockKvStore[key]);
  jest.clearAllMocks();
});

describe('Slug Validation', () => {
  it('accepts valid slugs', () => {
    expect(validateSlug('my-org').valid).toBe(true);
    expect(validateSlug('org123').valid).toBe(true);
    expect(validateSlug('my-awesome-org').valid).toBe(true);
  });

  it('normalizes slugs to lowercase', () => {
    const result = validateSlug('My-Org');
    expect(result.valid).toBe(true);
    expect(result.normalized).toBe('my-org');
  });

  it('rejects empty slugs', () => {
    expect(validateSlug('').valid).toBe(false);
    expect(validateSlug(null).valid).toBe(false);
    expect(validateSlug(undefined).valid).toBe(false);
  });

  it('rejects short slugs', () => {
    const result = validateSlug('ab');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('at least 3 characters');
  });

  it('rejects long slugs', () => {
    const longSlug = 'a'.repeat(51);
    const result = validateSlug(longSlug);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('50 characters or less');
  });

  it('rejects invalid characters', () => {
    expect(validateSlug('my_org').valid).toBe(false);
    expect(validateSlug('my org').valid).toBe(false);
    expect(validateSlug('my@org').valid).toBe(false);
    expect(validateSlug('MY.org').valid).toBe(false);
  });

  it('rejects slugs starting or ending with hyphens', () => {
    expect(validateSlug('-myorg').valid).toBe(false);
    expect(validateSlug('myorg-').valid).toBe(false);
    expect(validateSlug('-myorg-').valid).toBe(false);
  });

  it('rejects reserved slugs', () => {
    expect(validateSlug('admin').valid).toBe(false);
    expect(validateSlug('api').valid).toBe(false);
    expect(validateSlug('auth').valid).toBe(false);
    expect(validateSlug('dashboard').valid).toBe(false);
  });
});

describe('isSlugTaken', () => {
  it('returns false for available slugs', async () => {
    mockKvStore['playday:organizations'] = [
      { slug: 'existing-org' }
    ];

    const taken = await isSlugTaken('new-org');
    expect(taken).toBe(false);
  });

  it('returns true for taken slugs', async () => {
    mockKvStore['playday:organizations'] = [
      { slug: 'existing-org' }
    ];

    const taken = await isSlugTaken('existing-org');
    expect(taken).toBe(true);
  });

  it('is case-insensitive', async () => {
    mockKvStore['playday:organizations'] = [
      { slug: 'my-org' }
    ];

    const taken = await isSlugTaken('MY-ORG');
    expect(taken).toBe(true);
  });
});

describe('Organizer CRUD', () => {
  describe('getOrganizers', () => {
    it('returns empty array when no organizers exist', async () => {
      const organizers = await getOrganizers();
      expect(organizers).toEqual([]);
    });

    it('returns existing organizers', async () => {
      mockKvStore['playday:organizers'] = [
        { id: '1', email: 'test@example.com', name: 'Test User' }
      ];

      const organizers = await getOrganizers();
      expect(organizers).toHaveLength(1);
      expect(organizers[0].email).toBe('test@example.com');
    });
  });

  describe('getOrganizerById', () => {
    it('returns null for non-existent organizer', async () => {
      mockKvStore['playday:organizers'] = [];

      const organizer = await getOrganizerById('non-existent');
      expect(organizer).toBeNull();
    });

    it('finds organizer by ID', async () => {
      mockKvStore['playday:organizers'] = [
        { id: 'org-123', email: 'test@example.com' }
      ];

      const organizer = await getOrganizerById('org-123');
      expect(organizer).not.toBeNull();
      expect(organizer.email).toBe('test@example.com');
    });
  });

  describe('getOrganizerByEmail', () => {
    it('finds organizer by email (case-insensitive)', async () => {
      mockKvStore['playday:organizers'] = [
        { id: '1', email: 'Test@Example.com' }
      ];

      const organizer = await getOrganizerByEmail('test@example.com');
      expect(organizer).not.toBeNull();
    });
  });

  describe('createOrganizer', () => {
    it('creates a pending organizer', async () => {
      mockKvStore['playday:organizers'] = [];

      const organizer = await createOrganizer({
        email: 'new@example.com',
        name: 'New User',
        intendedSport: 'frisbee',
        intendedLocation: 'Lagos'
      });

      expect(organizer.id).toBeDefined();
      expect(organizer.email).toBe('new@example.com');
      expect(organizer.status).toBe('pending');
      expect(organizer.approvedAt).toBeNull();
    });

    it('throws error for duplicate email', async () => {
      mockKvStore['playday:organizers'] = [
        { id: '1', email: 'existing@example.com' }
      ];

      await expect(createOrganizer({
        email: 'existing@example.com',
        name: 'New User'
      })).rejects.toThrow('already exists');
    });
  });

  describe('updateOrganizerStatus', () => {
    it('approves an organizer', async () => {
      mockKvStore['playday:organizers'] = [
        { id: 'org-1', email: 'test@example.com', status: 'pending', approvedAt: null }
      ];

      const updated = await updateOrganizerStatus('org-1', 'approved');

      expect(updated.status).toBe('approved');
      expect(updated.approvedAt).not.toBeNull();
    });

    it('throws error for non-existent organizer', async () => {
      mockKvStore['playday:organizers'] = [];

      await expect(updateOrganizerStatus('non-existent', 'approved'))
        .rejects.toThrow('Organizer not found');
    });
  });
});

describe('Organization CRUD', () => {
  describe('getOrganizations', () => {
    it('returns empty array when no organizations exist', async () => {
      const orgs = await getOrganizations();
      expect(orgs).toEqual([]);
    });
  });

  describe('getOrganizationBySlug', () => {
    it('finds organization by slug', async () => {
      mockKvStore['playday:organizations'] = [
        { id: 'org-1', slug: 'my-org', name: 'My Org' }
      ];

      const org = await getOrganizationBySlug('my-org');
      expect(org).not.toBeNull();
      expect(org.name).toBe('My Org');
    });

    it('returns null for non-existent slug', async () => {
      mockKvStore['playday:organizations'] = [];

      const org = await getOrganizationBySlug('non-existent');
      expect(org).toBeNull();
    });
  });

  describe('getOrganizationsByOwner', () => {
    it('returns only organizations owned by the organizer', async () => {
      mockKvStore['playday:organizations'] = [
        { id: '1', slug: 'org-1', ownerId: 'owner-a' },
        { id: '2', slug: 'org-2', ownerId: 'owner-b' },
        { id: '3', slug: 'org-3', ownerId: 'owner-a' },
      ];

      const orgs = await getOrganizationsByOwner('owner-a');
      expect(orgs).toHaveLength(2);
      expect(orgs.every(o => o.ownerId === 'owner-a')).toBe(true);
    });
  });

  describe('createOrganization', () => {
    it('creates an organization with default settings', async () => {
      mockKvStore['playday:organizations'] = [];

      const org = await createOrganization({
        slug: 'new-org',
        name: 'New Organization',
        sport: 'frisbee',
        location: 'Lagos',
        timezone: 'Africa/Lagos',
        ownerId: 'owner-123'
      });

      expect(org.id).toBeDefined();
      expect(org.slug).toBe('new-org');
      expect(org.status).toBe('active');
      expect(org.visibility).toBe('public');
      expect(org.ownerId).toBe('owner-123');
    });

    it('normalizes slug on creation', async () => {
      mockKvStore['playday:organizations'] = [];

      const org = await createOrganization({
        slug: 'NEW-ORG',
        name: 'New Organization',
        sport: 'frisbee',
        ownerId: 'owner-123'
      });

      expect(org.slug).toBe('new-org');
    });

    it('throws error for duplicate slug', async () => {
      mockKvStore['playday:organizations'] = [
        { slug: 'existing-org' }
      ];

      await expect(createOrganization({
        slug: 'existing-org',
        name: 'New Org',
        sport: 'tennis',
        ownerId: 'owner-123'
      })).rejects.toThrow('already taken');
    });

    it('throws error for invalid slug', async () => {
      mockKvStore['playday:organizations'] = [];

      await expect(createOrganization({
        slug: 'ab', // too short
        name: 'New Org',
        sport: 'tennis',
        ownerId: 'owner-123'
      })).rejects.toThrow();
    });

    it('stores streetAddress and location on the org record', async () => {
      mockKvStore['playday:organizations'] = [];

      const org = await createOrganization({
        slug: 'street-org',
        name: 'Street Org',
        sport: 'frisbee',
        location: 'Lekki',
        streetAddress: '123 Admiralty Way',
        ownerId: 'owner-123'
      });

      expect(org.location).toBe('Lekki');
      expect(org.streetAddress).toBe('123 Admiralty Way');
    });

    it('uses maxParticipants for mainListLimit in settings', async () => {
      mockKvStore['playday:organizations'] = [];

      const org = await createOrganization({
        slug: 'max-org',
        name: 'Max Org',
        sport: 'frisbee',
        ownerId: 'owner-123',
        maxParticipants: 20,
      });

      const settings = mockKvStore[`org:${org.id}:settings`];
      expect(settings.mainListLimit).toBe(20);
    });

    it('defaults mainListLimit to 30 when maxParticipants not provided', async () => {
      mockKvStore['playday:organizations'] = [];

      const org = await createOrganization({
        slug: 'default-org',
        name: 'Default Org',
        sport: 'frisbee',
        ownerId: 'owner-123',
      });

      const settings = mockKvStore[`org:${org.id}:settings`];
      expect(settings.mainListLimit).toBe(30);
    });

    it('presets organizer email in CC field', async () => {
      mockKvStore['playday:organizations'] = [];

      const org = await createOrganization({
        slug: 'email-org',
        name: 'Email Org',
        sport: 'frisbee',
        ownerId: 'owner-123',
        organizerEmail: 'organizer@example.com',
      });

      const settings = mockKvStore[`org:${org.id}:settings`];
      expect(settings.email.cc).toEqual(['organizer@example.com']);
    });

    it('initializes gameInfo in settings from gameSchedule', async () => {
      mockKvStore['playday:organizations'] = [];

      const org = await createOrganization({
        slug: 'game-org',
        name: 'Game Org',
        sport: 'frisbee',
        ownerId: 'owner-123',
        gameSchedule: {
          gameDay: 6, // Saturday
          startHour: 10,
          startMinute: 30,
          endHour: 12,
          endMinute: 0,
        },
      });

      const settings = mockKvStore[`org:${org.id}:settings`];
      expect(settings.gameInfo.enabled).toBe(true);
      expect(settings.gameInfo.gameDay).toBe(6);
      expect(settings.gameInfo.startHour).toBe(10);
      expect(settings.gameInfo.startMinute).toBe(30);
      expect(settings.gameInfo.endHour).toBe(12);
      expect(settings.gameInfo.endMinute).toBe(0);
    });

    it('defaults recurrence to weekly in gameInfo', async () => {
      mockKvStore['playday:organizations'] = [];

      const org = await createOrganization({
        slug: 'weekly-org',
        name: 'Weekly Org',
        sport: 'frisbee',
        ownerId: 'owner-123',
        gameSchedule: { gameDay: 6, startHour: 10, startMinute: 0, endHour: 12, endMinute: 0 },
      });

      const settings = mockKvStore[`org:${org.id}:settings`];
      expect(settings.gameInfo.recurrence).toBe('weekly');
      expect(settings.gameInfo.monthlyOccurrence).toBeNull();
    });

    it('stores monthly recurrence with occurrence in gameInfo', async () => {
      mockKvStore['playday:organizations'] = [];

      const org = await createOrganization({
        slug: 'monthly-org',
        name: 'Monthly Org',
        sport: 'frisbee',
        ownerId: 'owner-123',
        gameSchedule: {
          gameDay: 6,
          startHour: 10,
          startMinute: 0,
          endHour: 12,
          endMinute: 0,
          recurrence: 'monthly',
          monthlyOccurrence: 2,
        },
      });

      const settings = mockKvStore[`org:${org.id}:settings`];
      expect(settings.gameInfo.recurrence).toBe('monthly');
      expect(settings.gameInfo.monthlyOccurrence).toBe(2);
    });

    it('stores last monthly occurrence in gameInfo', async () => {
      mockKvStore['playday:organizations'] = [];

      const org = await createOrganization({
        slug: 'last-monthly-org',
        name: 'Last Monthly Org',
        sport: 'frisbee',
        ownerId: 'owner-123',
        gameSchedule: {
          gameDay: 0,
          startHour: 9,
          startMinute: 0,
          endHour: 11,
          endMinute: 0,
          recurrence: 'monthly',
          monthlyOccurrence: 'last',
        },
      });

      const settings = mockKvStore[`org:${org.id}:settings`];
      expect(settings.gameInfo.recurrence).toBe('monthly');
      expect(settings.gameInfo.monthlyOccurrence).toBe('last');
      expect(settings.gameInfo.gameDay).toBe(0);
    });

    it('initializes location in gameInfo from org location/streetAddress', async () => {
      mockKvStore['playday:organizations'] = [];

      const org = await createOrganization({
        slug: 'loc-org',
        name: 'Location Org',
        sport: 'frisbee',
        location: 'Lekki',
        streetAddress: '123 Admiralty Way',
        ownerId: 'owner-123',
      });

      const settings = mockKvStore[`org:${org.id}:settings`];
      expect(settings.gameInfo.location.enabled).toBe(true);
      expect(settings.gameInfo.location.area).toBe('Lekki');
      expect(settings.gameInfo.location.address).toBe('123 Admiralty Way');
    });

    it('disables location in gameInfo when no streetAddress', async () => {
      mockKvStore['playday:organizations'] = [];

      const org = await createOrganization({
        slug: 'noloc-org',
        name: 'No Location Org',
        sport: 'frisbee',
        ownerId: 'owner-123',
      });

      const settings = mockKvStore[`org:${org.id}:settings`];
      expect(settings.gameInfo.location.enabled).toBe(false);
    });

    it('initializes empty RSVP data, whitelist, and archive', async () => {
      mockKvStore['playday:organizations'] = [];

      const org = await createOrganization({
        slug: 'init-org',
        name: 'Init Org',
        sport: 'frisbee',
        ownerId: 'owner-123',
      });

      expect(mockKvStore[`org:${org.id}:rsvp-data`]).toEqual({ mainList: [], waitlist: [] });
      expect(mockKvStore[`org:${org.id}:whitelist`]).toEqual([]);
      expect(mockKvStore[`org:${org.id}:archive`]).toEqual([]);
    });
  });

  describe('createOrganization - access period calculation', () => {
    it('disables access period for always-open preset', async () => {
      mockKvStore['playday:organizations'] = [];

      const org = await createOrganization({
        slug: 'open-org',
        name: 'Always Open Org',
        sport: 'frisbee',
        ownerId: 'owner-123',
        rsvpWindowPreset: 'always-open',
        gameSchedule: { gameDay: 6, startHour: 10, startMinute: 0, endHour: 12, endMinute: 0 },
      });

      const settings = mockKvStore[`org:${org.id}:settings`];
      expect(settings.accessPeriod.enabled).toBe(false);
    });

    it('calculates 6-hour preset correctly (close 6h before game start)', async () => {
      mockKvStore['playday:organizations'] = [];

      // Game on Saturday (6) at 17:00-19:00
      const org = await createOrganization({
        slug: 'six-hour-org',
        name: 'Six Hour Org',
        sport: 'frisbee',
        ownerId: 'owner-123',
        rsvpWindowPreset: '6-hours',
        gameSchedule: { gameDay: 6, startHour: 17, startMinute: 0, endHour: 19, endMinute: 0 },
      });

      const settings = mockKvStore[`org:${org.id}:settings`];
      expect(settings.accessPeriod.enabled).toBe(true);
      // Close: 17 - 6 = 11:00 on Saturday
      expect(settings.accessPeriod.endDay).toBe(6);
      expect(settings.accessPeriod.endHour).toBe(11);
      expect(settings.accessPeriod.endMinute).toBe(0);
      // Open: 1 minute after game ends (19:01 on Saturday)
      expect(settings.accessPeriod.startDay).toBe(6);
      expect(settings.accessPeriod.startHour).toBe(19);
      expect(settings.accessPeriod.startMinute).toBe(1);
    });

    it('calculates 24-hour preset with day underflow', async () => {
      mockKvStore['playday:organizations'] = [];

      // Game on Monday (1) at 10:00-12:00
      // 24h before 10:00 Monday = 10:00 Sunday
      const org = await createOrganization({
        slug: 'day-wrap-org',
        name: 'Day Wrap Org',
        sport: 'frisbee',
        ownerId: 'owner-123',
        rsvpWindowPreset: '24-hours',
        gameSchedule: { gameDay: 1, startHour: 10, startMinute: 0, endHour: 12, endMinute: 0 },
      });

      const settings = mockKvStore[`org:${org.id}:settings`];
      expect(settings.accessPeriod.enabled).toBe(true);
      // Close: 10 - 24 = -14 → wraps to Sunday (0) at 10:00
      expect(settings.accessPeriod.endDay).toBe(0);
      expect(settings.accessPeriod.endHour).toBe(10);
      expect(settings.accessPeriod.endMinute).toBe(0);
    });

    it('calculates 48-hour preset wrapping multiple days', async () => {
      mockKvStore['playday:organizations'] = [];

      // Game on Tuesday (2) at 18:00-20:00
      // 48h before 18:00 Tuesday = 18:00 Sunday (day 0)
      const org = await createOrganization({
        slug: 'two-day-org',
        name: 'Two Day Org',
        sport: 'frisbee',
        ownerId: 'owner-123',
        rsvpWindowPreset: '48-hours',
        gameSchedule: { gameDay: 2, startHour: 18, startMinute: 0, endHour: 20, endMinute: 0 },
      });

      const settings = mockKvStore[`org:${org.id}:settings`];
      expect(settings.accessPeriod.enabled).toBe(true);
      // Close: 18 - 48 = -30 → day 2 - 2 = 0 (Sunday), hour 18
      expect(settings.accessPeriod.endDay).toBe(0);
      expect(settings.accessPeriod.endHour).toBe(18);
      expect(settings.accessPeriod.endMinute).toBe(0);
    });

    it('handles open time minute overflow (e.g. game ends at 19:59)', async () => {
      mockKvStore['playday:organizations'] = [];

      const org = await createOrganization({
        slug: 'minute-wrap-org',
        name: 'Minute Wrap Org',
        sport: 'frisbee',
        ownerId: 'owner-123',
        rsvpWindowPreset: '6-hours',
        gameSchedule: { gameDay: 5, startHour: 17, startMinute: 0, endHour: 19, endMinute: 59 },
      });

      const settings = mockKvStore[`org:${org.id}:settings`];
      // Open: 19:59 + 1min = 20:00 on Friday
      expect(settings.accessPeriod.startDay).toBe(5);
      expect(settings.accessPeriod.startHour).toBe(20);
      expect(settings.accessPeriod.startMinute).toBe(0);
    });

    it('handles open time hour overflow (game ends at 23:59)', async () => {
      mockKvStore['playday:organizations'] = [];

      const org = await createOrganization({
        slug: 'hour-wrap-org',
        name: 'Hour Wrap Org',
        sport: 'frisbee',
        ownerId: 'owner-123',
        rsvpWindowPreset: '6-hours',
        gameSchedule: { gameDay: 3, startHour: 22, startMinute: 0, endHour: 23, endMinute: 59 },
      });

      const settings = mockKvStore[`org:${org.id}:settings`];
      // Open: 23:59 + 1min = 00:00 on Thursday (next day)
      expect(settings.accessPeriod.startDay).toBe(4);
      expect(settings.accessPeriod.startHour).toBe(0);
      expect(settings.accessPeriod.startMinute).toBe(0);
    });

    it('uses custom RSVP timing when provided', async () => {
      mockKvStore['playday:organizations'] = [];

      const org = await createOrganization({
        slug: 'custom-org',
        name: 'Custom Org',
        sport: 'frisbee',
        ownerId: 'owner-123',
        rsvpWindowPreset: 'custom',
        gameSchedule: {
          gameDay: 6,
          startHour: 17,
          startMinute: 0,
          endHour: 19,
          endMinute: 0,
          // Custom RSVP timing
          rsvpOpenDay: 4,      // Thursday
          rsvpOpenHour: 12,
          rsvpOpenMinute: 0,
          rsvpCloseDay: 5,     // Friday
          rsvpCloseHour: 10,
          rsvpCloseMinute: 30,
        },
      });

      const settings = mockKvStore[`org:${org.id}:settings`];
      expect(settings.accessPeriod.enabled).toBe(true);
      expect(settings.accessPeriod.startDay).toBe(4);
      expect(settings.accessPeriod.startHour).toBe(12);
      expect(settings.accessPeriod.startMinute).toBe(0);
      expect(settings.accessPeriod.endDay).toBe(5);
      expect(settings.accessPeriod.endHour).toBe(10);
      expect(settings.accessPeriod.endMinute).toBe(30);
    });

    it('defaults timezone to Africa/Lagos when not provided', async () => {
      mockKvStore['playday:organizations'] = [];

      const org = await createOrganization({
        slug: 'tz-org',
        name: 'TZ Org',
        sport: 'frisbee',
        ownerId: 'owner-123',
      });

      const settings = mockKvStore[`org:${org.id}:settings`];
      expect(settings.accessPeriod.timezone).toBe('Africa/Lagos');
    });

    it('uses provided timezone', async () => {
      mockKvStore['playday:organizations'] = [];

      const org = await createOrganization({
        slug: 'custom-tz-org',
        name: 'Custom TZ Org',
        sport: 'frisbee',
        ownerId: 'owner-123',
        timezone: 'America/New_York',
      });

      const settings = mockKvStore[`org:${org.id}:settings`];
      expect(settings.accessPeriod.timezone).toBe('America/New_York');
    });
  });

  describe('updateOrganization', () => {
    it('updates allowed fields', async () => {
      mockKvStore['playday:organizations'] = [
        { id: 'org-1', slug: 'my-org', name: 'Old Name', sport: 'frisbee' }
      ];

      const updated = await updateOrganization('org-1', {
        name: 'New Name',
        location: 'Abuja'
      });

      expect(updated.name).toBe('New Name');
      expect(updated.location).toBe('Abuja');
    });

    it('updates streetAddress field', async () => {
      mockKvStore['playday:organizations'] = [
        { id: 'org-1', slug: 'my-org', name: 'Test Org' }
      ];

      const updated = await updateOrganization('org-1', {
        streetAddress: '456 Main Street',
      });

      expect(updated.streetAddress).toBe('456 Main Street');
    });

    it('updates visibility field', async () => {
      mockKvStore['playday:organizations'] = [
        { id: 'org-1', slug: 'my-org', name: 'Test Org', visibility: 'public' }
      ];

      const updated = await updateOrganization('org-1', {
        visibility: 'private',
      });

      expect(updated.visibility).toBe('private');
    });

    it('updates displayOrder field', async () => {
      mockKvStore['playday:organizations'] = [
        { id: 'org-1', slug: 'my-org', name: 'Test Org' }
      ];

      const updated = await updateOrganization('org-1', {
        displayOrder: 3,
      });

      expect(updated.displayOrder).toBe(3);
    });

    it('ignores non-allowed fields', async () => {
      mockKvStore['playday:organizations'] = [
        { id: 'org-1', slug: 'my-org', name: 'Test Org', ownerId: 'owner-123' }
      ];

      const updated = await updateOrganization('org-1', {
        ownerId: 'hacker-456',
        name: 'New Name',
      });

      expect(updated.ownerId).toBe('owner-123');
      expect(updated.name).toBe('New Name');
    });

    it('sets updatedAt timestamp', async () => {
      mockKvStore['playday:organizations'] = [
        { id: 'org-1', slug: 'my-org', name: 'Test Org' }
      ];

      const updated = await updateOrganization('org-1', { name: 'Updated Org' });

      expect(updated.updatedAt).toBeDefined();
    });

    it('validates new slug when updating slug', async () => {
      mockKvStore['playday:organizations'] = [
        { id: 'org-1', slug: 'my-org', name: 'Test Org' }
      ];

      await expect(updateOrganization('org-1', { slug: 'ab' }))
        .rejects.toThrow();
    });

    it('rejects duplicate slug when updating', async () => {
      mockKvStore['playday:organizations'] = [
        { id: 'org-1', slug: 'my-org', name: 'Org 1' },
        { id: 'org-2', slug: 'taken-org', name: 'Org 2' },
      ];

      await expect(updateOrganization('org-1', { slug: 'taken-org' }))
        .rejects.toThrow('already taken');
    });

    it('throws error for non-existent organization', async () => {
      mockKvStore['playday:organizations'] = [];

      await expect(updateOrganization('non-existent', { name: 'New Name' }))
        .rejects.toThrow('Organization not found');
    });
  });

  describe('organizerOwnsOrg', () => {
    it('returns true when organizer owns the org', async () => {
      mockKvStore['playday:organizations'] = [
        { id: 'org-1', ownerId: 'owner-123' }
      ];

      const owns = await organizerOwnsOrg('owner-123', 'org-1');
      expect(owns).toBe(true);
    });

    it('returns false when organizer does not own the org', async () => {
      mockKvStore['playday:organizations'] = [
        { id: 'org-1', ownerId: 'owner-123' }
      ];

      const owns = await organizerOwnsOrg('other-owner', 'org-1');
      expect(owns).toBe(false);
    });
  });
});
