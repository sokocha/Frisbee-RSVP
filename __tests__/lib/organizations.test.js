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
