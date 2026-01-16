/**
 * Unit tests for the RSVP API
 * Tests cover: GET, POST, DELETE, PUT (reset), PATCH (snooze/unsnooze)
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
  },
}));

import handler from '../../pages/api/rsvp';

// Helper to create mock request/response
function createMockReqRes(method, body = {}, headers = {}) {
  const req = {
    method,
    body,
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

// Clear store between tests
beforeEach(() => {
  Object.keys(mockKvStore).forEach(key => delete mockKvStore[key]);
  jest.clearAllMocks();
});

describe('RSVP API', () => {
  describe('GET /api/rsvp', () => {
    it('returns empty lists when no data exists', async () => {
      const { req, res } = createMockReqRes('GET');

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          mainList: [],
          waitlist: [],
        })
      );
    });

    it('returns existing RSVP data', async () => {
      mockKvStore['frisbee-rsvp-data'] = {
        mainList: [{ id: 1, name: 'John Doe', deviceId: 'device1' }],
        waitlist: [],
      };

      const { req, res } = createMockReqRes('GET');
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          mainList: [{ id: 1, name: 'John Doe', deviceId: 'device1' }],
          waitlist: [],
        })
      );
    });

    it('includes access status in response', async () => {
      const { req, res } = createMockReqRes('GET');

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

  describe('POST /api/rsvp', () => {
    beforeEach(() => {
      // Disable access period for testing
      mockKvStore['frisbee-settings'] = {
        mainListLimit: 30,
        accessPeriod: { enabled: false },
      };
    });

    it('requires name and deviceId', async () => {
      const { req, res } = createMockReqRes('POST', {});

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Name and deviceId are required' });
    });

    it('rejects empty name', async () => {
      const { req, res } = createMockReqRes('POST', { name: '   ', deviceId: 'device1' });

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Name cannot be empty' });
    });

    it('adds person to main list when space available', async () => {
      const { req, res } = createMockReqRes('POST', {
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
      mockKvStore['frisbee-rsvp-data'] = {
        mainList: [{ id: 1, name: 'John Doe', deviceId: 'device1' }],
        waitlist: [],
      };

      const { req, res } = createMockReqRes('POST', {
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
      mockKvStore['frisbee-rsvp-data'] = {
        mainList: [{ id: 1, name: 'John Doe', deviceId: 'device1' }],
        waitlist: [],
      };

      const { req, res } = createMockReqRes('POST', {
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
      mockKvStore['frisbee-settings'] = {
        mainListLimit: 1,
        accessPeriod: { enabled: false },
      };
      mockKvStore['frisbee-rsvp-data'] = {
        mainList: [{ id: 1, name: 'First Person', deviceId: 'device1' }],
        waitlist: [],
      };

      const { req, res } = createMockReqRes('POST', {
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

    it('bumps non-whitelisted user when whitelisted user signs up to full list', async () => {
      mockKvStore['frisbee-settings'] = {
        mainListLimit: 2,
        accessPeriod: { enabled: false },
      };
      mockKvStore['frisbee-rsvp-data'] = {
        mainList: [
          { id: 1, name: 'AIS Member', deviceId: 'device1', isWhitelisted: true },
          { id: 2, name: 'Regular User', deviceId: 'device2' },
        ],
        waitlist: [],
      };
      // Set up whitelist with the new AIS member
      mockKvStore['frisbee-whitelist'] = [
        { name: 'AIS Member', deviceId: 'device1' },
        { name: 'New AIS Member', deviceId: 'device3' },
      ];

      const { req, res } = createMockReqRes('POST', {
        name: 'New AIS Member',
        deviceId: 'device3'
      });

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const response = res.json.mock.calls[0][0];

      // New AIS member should be on main list
      expect(response.listType).toBe('main');
      expect(response.mainList).toHaveLength(2);
      expect(response.mainList.some(p => p.name === 'New AIS Member' && p.isWhitelisted)).toBe(true);

      // Regular user should be bumped to waitlist
      expect(response.waitlist).toHaveLength(1);
      expect(response.waitlist[0].name).toBe('Regular User');
      expect(response.bumpedPerson.name).toBe('Regular User');
    });

    it('adds whitelisted user to waitlist when all main list spots are whitelisted', async () => {
      mockKvStore['frisbee-settings'] = {
        mainListLimit: 2,
        accessPeriod: { enabled: false },
      };
      mockKvStore['frisbee-rsvp-data'] = {
        mainList: [
          { id: 1, name: 'AIS Member 1', deviceId: 'device1', isWhitelisted: true },
          { id: 2, name: 'AIS Member 2', deviceId: 'device2', isWhitelisted: true },
        ],
        waitlist: [],
      };
      mockKvStore['frisbee-whitelist'] = [
        { name: 'AIS Member 1', deviceId: 'device1' },
        { name: 'AIS Member 2', deviceId: 'device2' },
        { name: 'AIS Member 3', deviceId: 'device3' },
      ];

      const { req, res } = createMockReqRes('POST', {
        name: 'AIS Member 3',
        deviceId: 'device3'
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
  });

  describe('DELETE /api/rsvp', () => {
    beforeEach(() => {
      mockKvStore['frisbee-settings'] = {
        mainListLimit: 30,
        accessPeriod: { enabled: false },
      };
    });

    it('requires personId and deviceId', async () => {
      const { req, res } = createMockReqRes('DELETE', {});

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'personId and deviceId are required'
      });
    });

    it('removes person from main list', async () => {
      mockKvStore['frisbee-rsvp-data'] = {
        mainList: [{ id: 123, name: 'John Doe', deviceId: 'device1' }],
        waitlist: [],
      };

      const { req, res } = createMockReqRes('DELETE', {
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
      mockKvStore['frisbee-rsvp-data'] = {
        mainList: [{ id: 1, name: 'Person One', deviceId: 'device1' }],
        waitlist: [{ id: 2, name: 'Person Two', deviceId: 'device2' }],
      };

      const { req, res } = createMockReqRes('DELETE', {
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

    it('prevents removing someone else signup', async () => {
      mockKvStore['frisbee-rsvp-data'] = {
        mainList: [{ id: 123, name: 'John Doe', deviceId: 'device1' }],
        waitlist: [],
      };

      const { req, res } = createMockReqRes('DELETE', {
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

  describe('PUT /api/rsvp (reset)', () => {
    it('clears all RSVPs on reset action', async () => {
      mockKvStore['frisbee-rsvp-data'] = {
        mainList: [{ id: 1, name: 'John' }],
        waitlist: [{ id: 2, name: 'Jane' }],
      };

      const { req, res } = createMockReqRes('PUT', { action: 'reset' });

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'All RSVPs cleared',
        mainList: [],
        waitlist: [],
      });
    });

    it('rejects invalid action', async () => {
      const { req, res } = createMockReqRes('PUT', { action: 'invalid' });

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid action' });
    });
  });

  describe('PATCH /api/rsvp (snooze)', () => {
    const TEST_PASSWORD = 'frisbee-admin-2024';

    beforeEach(() => {
      mockKvStore['frisbee-settings'] = {
        mainListLimit: 30,
        accessPeriod: { enabled: false, timezone: 'Africa/Lagos' },
      };
    });

    it('requires password', async () => {
      const { req, res } = createMockReqRes('PATCH', {
        action: 'snooze',
        personId: 1
      });

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Password is required' });
    });

    it('rejects invalid password', async () => {
      const { req, res } = createMockReqRes('PATCH', {
        action: 'snooze',
        personId: 1,
        password: 'wrong-password',
      });

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid password' });
    });

    it('snoozes a whitelisted person', async () => {
      mockKvStore['frisbee-rsvp-data'] = {
        mainList: [{
          id: 123,
          name: 'John Doe',
          isWhitelisted: true,
          deviceId: 'device1',
        }],
        waitlist: [],
      };

      const { req, res } = createMockReqRes('PATCH', {
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
      mockKvStore['frisbee-rsvp-data'] = {
        mainList: [{
          id: 123,
          name: 'John Doe',
          isWhitelisted: false,
          deviceId: 'device1',
        }],
        waitlist: [],
      };

      const { req, res } = createMockReqRes('PATCH', {
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

  describe('Method not allowed', () => {
    it('returns 405 for unsupported methods', async () => {
      const { req, res } = createMockReqRes('OPTIONS');

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(405);
      expect(res.json).toHaveBeenCalledWith({ error: 'Method not allowed' });
    });
  });
});
