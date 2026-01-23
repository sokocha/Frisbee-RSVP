/**
 * Unit tests for the multi-tenant org RSVP API
 * Tests cover: GET, POST, DELETE, PATCH (snooze/unsnooze) for org-scoped routes
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

import handler from '../../pages/api/org/[slug]/rsvp';

// Helper to create mock request/response with slug
function createMockReqRes(method, slug, body = {}, headers = {}) {
  const req = {
    method,
    body,
    query: { slug },
    headers: {
      host: 'localhost:3000',
      ...headers,
    },
  };

  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };

  return { req, res };
}

// Setup test organization
function setupTestOrg(slug = 'test-org', orgId = 'test-org-id') {
  mockKvStore['playday:organizations'] = [
    {
      id: orgId,
      slug: slug,
      name: 'Test Organization',
      sport: 'frisbee',
      status: 'active',
      ownerId: 'owner-123',
      timezone: 'Africa/Lagos'
    }
  ];

  // Set default settings with access period disabled for testing
  mockKvStore[`org:${orgId}:settings`] = {
    mainListLimit: 30,
    accessPeriod: { enabled: false },
  };

  // Initialize empty RSVP data
  mockKvStore[`org:${orgId}:rsvp-data`] = {
    mainList: [],
    waitlist: []
  };

  // Initialize empty whitelist
  mockKvStore[`org:${orgId}:whitelist`] = [];

  return orgId;
}

// Clear store between tests
beforeEach(() => {
  Object.keys(mockKvStore).forEach(key => delete mockKvStore[key]);
  jest.clearAllMocks();
});

describe('Org RSVP API - GET', () => {
  it('returns 404 for non-existent organization', async () => {
    mockKvStore['playday:organizations'] = [];

    const { req, res } = createMockReqRes('GET', 'non-existent');
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Organization not found' });
  });

  it('returns 403 for inactive organization', async () => {
    mockKvStore['playday:organizations'] = [
      { id: 'org-1', slug: 'inactive-org', status: 'suspended' }
    ];

    const { req, res } = createMockReqRes('GET', 'inactive-org');
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'This organization is not active' });
  });

  it('returns empty lists for new organization', async () => {
    setupTestOrg('new-org');

    const { req, res } = createMockReqRes('GET', 'new-org');
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        organization: expect.objectContaining({
          slug: 'new-org',
          name: 'Test Organization'
        }),
        mainList: [],
        waitlist: [],
        mainListLimit: 30
      })
    );
  });

  it('returns existing RSVP data', async () => {
    const orgId = setupTestOrg('test-org');
    mockKvStore[`org:${orgId}:rsvp-data`] = {
      mainList: [{ id: 1, name: 'John Doe', deviceId: 'device1', timestamp: new Date().toISOString() }],
      waitlist: [],
    };

    const { req, res } = createMockReqRes('GET', 'test-org');
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        mainList: expect.arrayContaining([
          expect.objectContaining({ name: 'John Doe' }),
        ]),
      })
    );
  });

  it('includes access status in response', async () => {
    setupTestOrg('test-org');

    const { req, res } = createMockReqRes('GET', 'test-org');
    await handler(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        accessStatus: expect.objectContaining({
          isOpen: expect.any(Boolean),
        }),
      })
    );
  });
});

describe('Org RSVP API - POST', () => {
  it('requires name and deviceId', async () => {
    setupTestOrg('test-org');

    const { req, res } = createMockReqRes('POST', 'test-org', {});
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Name and deviceId are required' });
  });

  it('rejects empty name', async () => {
    setupTestOrg('test-org');

    const { req, res } = createMockReqRes('POST', 'test-org', { name: '   ', deviceId: 'device1' });
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Name cannot be empty' });
  });

  it('adds person to main list when space available', async () => {
    setupTestOrg('test-org');

    const { req, res } = createMockReqRes('POST', 'test-org', {
      name: 'John Doe',
      deviceId: 'device1'
    });
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        listType: 'main',
        mainList: expect.arrayContaining([
          expect.objectContaining({ name: 'John Doe' }),
        ]),
      })
    );
  });

  it('prevents duplicate device signups', async () => {
    const orgId = setupTestOrg('test-org');
    mockKvStore[`org:${orgId}:rsvp-data`] = {
      mainList: [{ id: 1, name: 'John Doe', deviceId: 'device1', timestamp: new Date().toISOString() }],
      waitlist: [],
    };

    const { req, res } = createMockReqRes('POST', 'test-org', {
      name: 'Jane Doe',
      deviceId: 'device1'
    });
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: "You've already signed up from this device!"
    });
  });

  it('prevents duplicate names', async () => {
    const orgId = setupTestOrg('test-org');
    mockKvStore[`org:${orgId}:rsvp-data`] = {
      mainList: [{ id: 1, name: 'John Doe', deviceId: 'device1', timestamp: new Date().toISOString() }],
      waitlist: [],
    };

    const { req, res } = createMockReqRes('POST', 'test-org', {
      name: 'john doe',
      deviceId: 'device2'
    });
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'This name is already on the list!'
    });
  });

  it('adds to waitlist when main list is full', async () => {
    const orgId = setupTestOrg('test-org');
    mockKvStore[`org:${orgId}:settings`] = {
      mainListLimit: 1,
      accessPeriod: { enabled: false },
    };
    mockKvStore[`org:${orgId}:rsvp-data`] = {
      mainList: [{ id: 1, name: 'First Person', deviceId: 'device1', timestamp: new Date().toISOString() }],
      waitlist: [],
    };

    const { req, res } = createMockReqRes('POST', 'test-org', {
      name: 'Second Person',
      deviceId: 'device2'
    });
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        listType: 'waitlist',
      })
    );
  });

  it('marks whitelisted users appropriately', async () => {
    const orgId = setupTestOrg('test-org');
    mockKvStore[`org:${orgId}:whitelist`] = [
      { name: 'VIP User', deviceId: 'vip-device' }
    ];

    const { req, res } = createMockReqRes('POST', 'test-org', {
      name: 'VIP User',
      deviceId: 'vip-device'
    });
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const response = res.json.mock.calls[0][0];
    expect(response.person.isWhitelisted).toBe(true);
  });

  it('whitelisted member bumps non-whitelisted when list is full', async () => {
    const orgId = setupTestOrg('test-org');
    mockKvStore[`org:${orgId}:settings`] = {
      mainListLimit: 2,
      accessPeriod: { enabled: false },
    };
    mockKvStore[`org:${orgId}:rsvp-data`] = {
      mainList: [
        { id: 1, name: 'VIP Member', deviceId: 'device1', isWhitelisted: true, timestamp: '2026-01-16T10:00:00Z' },
        { id: 2, name: 'Regular User', deviceId: 'device2', timestamp: '2026-01-16T10:30:00Z' },
      ],
      waitlist: [],
    };
    mockKvStore[`org:${orgId}:whitelist`] = [
      { name: 'VIP Member', deviceId: 'device1' },
      { name: 'New VIP', deviceId: 'device3' },
    ];

    const { req, res } = createMockReqRes('POST', 'test-org', {
      name: 'New VIP',
      deviceId: 'device3'
    });
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const response = res.json.mock.calls[0][0];

    // New VIP should be on main list
    expect(response.listType).toBe('main');
    expect(response.mainList.some(p => p.name === 'New VIP' && p.isWhitelisted)).toBe(true);

    // Regular user should be bumped to waitlist
    expect(response.waitlist).toHaveLength(1);
    expect(response.waitlist[0].name).toBe('Regular User');
  });
});

describe('Org RSVP API - DELETE', () => {
  it('requires personId and deviceId', async () => {
    setupTestOrg('test-org');

    const { req, res } = createMockReqRes('DELETE', 'test-org', {});
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'personId and deviceId are required'
    });
  });

  it('removes person from main list', async () => {
    const orgId = setupTestOrg('test-org');
    mockKvStore[`org:${orgId}:rsvp-data`] = {
      mainList: [{ id: 123, name: 'John Doe', deviceId: 'device1', timestamp: new Date().toISOString() }],
      waitlist: [],
    };

    const { req, res } = createMockReqRes('DELETE', 'test-org', {
      personId: 123,
      deviceId: 'device1',
      isWaitlist: false,
    });
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        mainList: [],
      })
    );
  });

  it('promotes from waitlist when main list spot opens', async () => {
    const orgId = setupTestOrg('test-org');
    mockKvStore[`org:${orgId}:rsvp-data`] = {
      mainList: [{ id: 1, name: 'Person One', deviceId: 'device1', timestamp: new Date().toISOString() }],
      waitlist: [{ id: 2, name: 'Person Two', deviceId: 'device2', timestamp: new Date().toISOString() }],
    };

    const { req, res } = createMockReqRes('DELETE', 'test-org', {
      personId: 1,
      deviceId: 'device1',
      isWaitlist: false,
    });
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        promotedPerson: expect.objectContaining({ name: 'Person Two' }),
        mainList: expect.arrayContaining([
          expect.objectContaining({ name: 'Person Two' }),
        ]),
        waitlist: [],
      })
    );
  });

  it('prevents removing someone else\'s signup', async () => {
    const orgId = setupTestOrg('test-org');
    mockKvStore[`org:${orgId}:rsvp-data`] = {
      mainList: [{ id: 123, name: 'John Doe', deviceId: 'device1', timestamp: new Date().toISOString() }],
      waitlist: [],
    };

    const { req, res } = createMockReqRes('DELETE', 'test-org', {
      personId: 123,
      deviceId: 'different-device',
      isWaitlist: false,
    });
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: 'You can only remove your own signup'
    });
  });
});

describe('Org RSVP API - PATCH (snooze)', () => {
  const TEST_PASSWORD = 'frisbee-admin-2024';

  it('requires password', async () => {
    setupTestOrg('test-org');

    const { req, res } = createMockReqRes('PATCH', 'test-org', {
      action: 'snooze',
      personId: 1
    });
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Password is required' });
  });

  it('rejects invalid password', async () => {
    setupTestOrg('test-org');

    const { req, res } = createMockReqRes('PATCH', 'test-org', {
      action: 'snooze',
      personId: 1,
      password: 'wrong-password',
    });
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid password' });
  });

  it('snoozes a whitelisted person', async () => {
    const orgId = setupTestOrg('test-org');
    mockKvStore[`org:${orgId}:rsvp-data`] = {
      mainList: [{
        id: 123,
        name: 'John Doe',
        isWhitelisted: true,
        deviceId: 'device1',
        timestamp: new Date().toISOString(),
      }],
      waitlist: [],
    };

    const { req, res } = createMockReqRes('PATCH', 'test-org', {
      action: 'snooze',
      personId: 123,
      password: TEST_PASSWORD,
    });
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        mainList: [],
      })
    );
  });

  it('prevents snoozing non-whitelisted person', async () => {
    const orgId = setupTestOrg('test-org');
    mockKvStore[`org:${orgId}:rsvp-data`] = {
      mainList: [{
        id: 123,
        name: 'John Doe',
        isWhitelisted: false,
        deviceId: 'device1',
        timestamp: new Date().toISOString(),
      }],
      waitlist: [],
    };

    const { req, res } = createMockReqRes('PATCH', 'test-org', {
      action: 'snooze',
      personId: 123,
      password: TEST_PASSWORD,
    });
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Only whitelisted members can snooze'
    });
  });
});

describe('Org RSVP API - Method not allowed', () => {
  it('returns 405 for unsupported methods', async () => {
    setupTestOrg('test-org');

    const { req, res } = createMockReqRes('OPTIONS', 'test-org');
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(405);
    expect(res.json).toHaveBeenCalledWith({ error: 'Method not allowed' });
  });
});
