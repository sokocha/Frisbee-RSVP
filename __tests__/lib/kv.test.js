/**
 * Unit tests for the KV helper functions
 */

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
  GLOBAL_KEYS,
  ORG_KEY_SUFFIXES,
  orgKey,
  getOrgData,
  setOrgData,
  deleteOrgData,
  getGlobalData,
  setGlobalData,
  deleteAllOrgData,
} from '../../lib/kv';

// Clear store between tests
beforeEach(() => {
  Object.keys(mockKvStore).forEach(key => delete mockKvStore[key]);
  jest.clearAllMocks();
});

describe('GLOBAL_KEYS', () => {
  it('contains expected keys', () => {
    expect(GLOBAL_KEYS.ORGANIZERS).toBe('playday:organizers');
    expect(GLOBAL_KEYS.ORGANIZATIONS).toBe('playday:organizations');
    expect(GLOBAL_KEYS.MAGIC_TOKENS).toBe('playday:magic-tokens');
    expect(GLOBAL_KEYS.SESSIONS).toBe('playday:sessions');
  });
});

describe('ORG_KEY_SUFFIXES', () => {
  it('contains expected suffixes', () => {
    expect(ORG_KEY_SUFFIXES.RSVP_DATA).toBe('rsvp-data');
    expect(ORG_KEY_SUFFIXES.SETTINGS).toBe('settings');
    expect(ORG_KEY_SUFFIXES.WHITELIST).toBe('whitelist');
    expect(ORG_KEY_SUFFIXES.ARCHIVE).toBe('archive');
    expect(ORG_KEY_SUFFIXES.LAST_RESET).toBe('last-reset');
    expect(ORG_KEY_SUFFIXES.LAST_EMAIL).toBe('last-email');
    expect(ORG_KEY_SUFFIXES.SNOOZED).toBe('snoozed');
    expect(ORG_KEY_SUFFIXES.EMAIL_STATUS).toBe('email-status');
  });
});

describe('orgKey', () => {
  it('generates correct org-scoped key', () => {
    const key = orgKey('my-org-id', 'rsvp-data');
    expect(key).toBe('org:my-org-id:rsvp-data');
  });

  it('throws error for missing orgId', () => {
    expect(() => orgKey(null, 'rsvp-data')).toThrow('orgId is required');
    expect(() => orgKey(undefined, 'rsvp-data')).toThrow('orgId is required');
    expect(() => orgKey('', 'rsvp-data')).toThrow('orgId is required');
  });
});

describe('getOrgData', () => {
  it('returns data when it exists', async () => {
    mockKvStore['org:test-org:rsvp-data'] = { mainList: ['person1'] };

    const data = await getOrgData('test-org', 'rsvp-data');
    expect(data).toEqual({ mainList: ['person1'] });
  });

  it('returns default value when key does not exist', async () => {
    const data = await getOrgData('test-org', 'rsvp-data', { mainList: [], waitlist: [] });
    expect(data).toEqual({ mainList: [], waitlist: [] });
  });

  it('returns null by default when key does not exist', async () => {
    const data = await getOrgData('test-org', 'rsvp-data');
    expect(data).toBeNull();
  });
});

describe('setOrgData', () => {
  it('saves data with correct key', async () => {
    const data = { mainList: ['person1'], waitlist: [] };
    await setOrgData('test-org', 'rsvp-data', data);

    expect(mockKvStore['org:test-org:rsvp-data']).toEqual(data);
  });
});

describe('deleteOrgData', () => {
  it('deletes data with correct key', async () => {
    mockKvStore['org:test-org:rsvp-data'] = { mainList: [] };

    await deleteOrgData('test-org', 'rsvp-data');

    expect(mockKvStore['org:test-org:rsvp-data']).toBeUndefined();
  });
});

describe('getGlobalData', () => {
  it('returns data when it exists', async () => {
    mockKvStore['playday:organizations'] = [{ id: '1' }];

    const data = await getGlobalData('playday:organizations');
    expect(data).toEqual([{ id: '1' }]);
  });

  it('returns default value when key does not exist', async () => {
    const data = await getGlobalData('playday:organizations', []);
    expect(data).toEqual([]);
  });
});

describe('setGlobalData', () => {
  it('saves data with correct key', async () => {
    const data = [{ id: '1', name: 'Test Org' }];
    await setGlobalData('playday:organizations', data);

    expect(mockKvStore['playday:organizations']).toEqual(data);
  });
});

describe('deleteAllOrgData', () => {
  it('deletes all org-scoped data', async () => {
    // Setup mock data for an organization
    mockKvStore['org:test-org:rsvp-data'] = { mainList: [] };
    mockKvStore['org:test-org:settings'] = { mainListLimit: 30 };
    mockKvStore['org:test-org:whitelist'] = [];
    mockKvStore['org:test-org:archive'] = [];
    mockKvStore['org:test-org:last-reset'] = '2026-W01';
    mockKvStore['org:test-org:last-email'] = '2026-W01';
    mockKvStore['org:test-org:snoozed'] = { weekId: '2026-W01', names: [] };
    mockKvStore['org:test-org:email-status'] = {};

    await deleteAllOrgData('test-org');

    // All org data should be deleted
    expect(mockKvStore['org:test-org:rsvp-data']).toBeUndefined();
    expect(mockKvStore['org:test-org:settings']).toBeUndefined();
    expect(mockKvStore['org:test-org:whitelist']).toBeUndefined();
    expect(mockKvStore['org:test-org:archive']).toBeUndefined();
    expect(mockKvStore['org:test-org:last-reset']).toBeUndefined();
    expect(mockKvStore['org:test-org:last-email']).toBeUndefined();
    expect(mockKvStore['org:test-org:snoozed']).toBeUndefined();
    expect(mockKvStore['org:test-org:email-status']).toBeUndefined();
  });
});
