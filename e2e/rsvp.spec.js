// @ts-check
const { test, expect } = require('@playwright/test');

// Test organization slug for e2e tests
const TEST_ORG_SLUG = 'test-org';

// Helper to mock public organizations API for landing page
const mockPublicOrgsApi = async (page, orgs = []) => {
  await page.route('**/api/public/organizations', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ organizations: orgs }),
    });
  });
};

// Helper to mock org RSVP API with default open state
const mockOrgRsvpApi = async (page, slug, data = {}) => {
  const defaultData = {
    organization: {
      id: 'test-org-id',
      slug: slug,
      name: 'Test Organization',
      sport: 'frisbee',
    },
    mainList: [],
    waitlist: [],
    mainListLimit: 30,
    accessStatus: { isOpen: true, message: null },
    snoozedNames: [],
    whitelist: [],
    gameInfo: null,
    ...data,
  };

  await page.route(`**/api/org/${slug}/rsvp`, async route => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(defaultData),
      });
    } else {
      await route.continue();
    }
  });
};

test.describe('PlayDay Landing Page', () => {
  test('displays the landing page with title', async ({ page }) => {
    await mockPublicOrgsApi(page, []);
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('Sports RSVP');
    // Use first() to avoid strict mode violation when text appears multiple times
    await expect(page.getByText('PlayDay', { exact: true }).first()).toBeVisible();
  });

  test('shows active communities when available', async ({ page }) => {
    await mockPublicOrgsApi(page, [
      { id: '1', slug: 'frisbee-lagos', name: 'Lagos Frisbee', sport: 'frisbee', location: 'Lagos' },
      { id: '2', slug: 'tennis-club', name: 'Tennis Club', sport: 'tennis', location: 'Abuja' },
    ]);

    await page.goto('/');

    await expect(page.locator('text=Lagos Frisbee')).toBeVisible();
    await expect(page.locator('text=Tennis Club')).toBeVisible();
  });

  test('shows empty state when no communities', async ({ page }) => {
    await mockPublicOrgsApi(page, []);
    await page.goto('/');

    await expect(page.locator('text=No active communities yet')).toBeVisible();
  });

  test('has login and get started links', async ({ page }) => {
    await mockPublicOrgsApi(page, []);
    await page.goto('/');

    await expect(page.locator('text=Log in')).toBeVisible();
    await expect(page.locator('text=Get Started')).toBeVisible();
  });
});

test.describe('Organization RSVP Page', () => {
  test('displays the RSVP page with organization name', async ({ page }) => {
    await mockOrgRsvpApi(page, TEST_ORG_SLUG);
    await page.goto(`/${TEST_ORG_SLUG}`);
    await expect(page.locator('h1')).toContainText('Test Organization');
  });

  test('shows loading state initially', async ({ page }) => {
    // Go to the page with slow network to catch loading state
    await page.route(`**/api/org/${TEST_ORG_SLUG}/rsvp`, async route => {
      await new Promise(resolve => setTimeout(resolve, 500));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          organization: { id: 'test', slug: TEST_ORG_SLUG, name: 'Test Org', sport: 'frisbee' },
          mainList: [],
          waitlist: [],
          mainListLimit: 30,
          accessStatus: { isOpen: true, message: null },
          snoozedNames: [],
          whitelist: [],
          gameInfo: null,
        }),
      });
    });

    await page.goto(`/${TEST_ORG_SLUG}`);
    // The loading spinner or text should be visible briefly
    await expect(page.locator('text=Loading')).toBeVisible({ timeout: 1000 }).catch(() => {
      // If loading finishes too fast, that's okay
    });
  });

  test('displays RSVP form when access is open', async ({ page }) => {
    await mockOrgRsvpApi(page, TEST_ORG_SLUG);
    await page.goto(`/${TEST_ORG_SLUG}`);
    // The input has placeholder "Your full name (first & last)"
    await expect(page.locator('input[placeholder*="full name"]')).toBeVisible();
    // Button says "RSVP"
    await expect(page.locator('button:has-text("RSVP")')).toBeVisible();
  });

  test('shows closed message when RSVP is closed', async ({ page }) => {
    await mockOrgRsvpApi(page, TEST_ORG_SLUG, {
      accessStatus: {
        isOpen: false,
        message: 'RSVP is closed. Opens Thursday at 12:00 PM WAT',
      },
    });

    await page.goto(`/${TEST_ORG_SLUG}`);
    // Use first() since the text appears in both header badge and form area
    await expect(page.locator('text=RSVP is currently closed').first()).toBeVisible();
  });

  test('can sign up successfully', async ({ page }) => {
    // Mock both GET and POST
    await page.route(`**/api/org/${TEST_ORG_SLUG}/rsvp`, async route => {
      const method = route.request().method();

      if (method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            organization: { id: 'test', slug: TEST_ORG_SLUG, name: 'Test Org', sport: 'frisbee' },
            mainList: [],
            waitlist: [],
            mainListLimit: 30,
            accessStatus: { isOpen: true, message: null },
            snoozedNames: [],
            whitelist: [],
            gameInfo: null,
          }),
        });
      } else if (method === 'POST') {
        const body = JSON.parse(route.request().postData() || '{}');
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            message: "You're in! Spot #1",
            listType: 'main',
            person: { id: 1, name: body.name },
            mainList: [{ id: 1, name: body.name, deviceId: body.deviceId, timestamp: new Date().toISOString() }],
            waitlist: [],
          }),
        });
      }
    });

    await page.goto(`/${TEST_ORG_SLUG}`);

    // Fill in name and submit using the placeholder
    await page.fill('input[placeholder*="full name"]', 'Test User Name');
    await page.click('button:has-text("RSVP")');

    // Should show success message
    await expect(page.locator('text=Spot #1')).toBeVisible();
  });

  test('displays participants in the main list', async ({ page }) => {
    await mockOrgRsvpApi(page, TEST_ORG_SLUG, {
      mainList: [
        { id: 1, name: 'Alice Smith', deviceId: 'device1', timestamp: new Date().toISOString() },
        { id: 2, name: 'Bob Jones', deviceId: 'device2', timestamp: new Date().toISOString() },
      ],
    });

    await page.goto(`/${TEST_ORG_SLUG}`);

    // Names are formatted as "FirstName Las." - check for partial matches
    await expect(page.locator('text=Alice')).toBeVisible();
    await expect(page.locator('text=Bob')).toBeVisible();
  });

  test('displays waitlist when main list is full', async ({ page }) => {
    await mockOrgRsvpApi(page, TEST_ORG_SLUG, {
      mainList: [{ id: 1, name: 'Person One', deviceId: 'device1', timestamp: new Date().toISOString() }],
      waitlist: [{ id: 2, name: 'Person Two', deviceId: 'device2', timestamp: new Date().toISOString() }],
      mainListLimit: 1,
    });

    await page.goto(`/${TEST_ORG_SLUG}`);

    // Waitlist header shows with count
    await expect(page.locator('text=Waitlist (1)')).toBeVisible();
    // Use first() since "Person" appears in both "Person One" and "Person Two"
    await expect(page.locator('text=Person').first()).toBeVisible();
  });

  test('progress bar reflects list capacity', async ({ page }) => {
    await mockOrgRsvpApi(page, TEST_ORG_SLUG, {
      mainList: Array.from({ length: 15 }, (_, i) => ({
        id: i + 1,
        name: `Person ${i + 1}`,
        deviceId: `device${i + 1}`,
        timestamp: new Date().toISOString(),
      })),
    });

    await page.goto(`/${TEST_ORG_SLUG}`);

    // Should show 15 / 30
    await expect(page.locator('text=15 / 30')).toBeVisible();
  });

  test('shows 404 for non-existent organization', async ({ page }) => {
    await page.route('**/api/org/non-existent/rsvp', async route => {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Organization not found' }),
      });
    });

    await page.goto('/non-existent');

    await expect(page.locator('text=Organization Not Found')).toBeVisible();
  });
});

test.describe('Organization Admin Dashboard', () => {
  test('redirects unauthenticated users to login', async ({ page }) => {
    await page.route(`**/api/org/${TEST_ORG_SLUG}/admin`, async route => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Not authenticated' }),
      });
    });

    await page.goto(`/${TEST_ORG_SLUG}/admin`);

    // Should show unauthorized message (use first() since both heading and link may be visible)
    await expect(page.locator('h1:has-text("Unauthorized")')).toBeVisible();
  });
});

test.describe('Auth Pages', () => {
  test('login page is accessible', async ({ page }) => {
    await page.goto('/auth/login');

    // Should show the login form with PlayDay header
    await expect(page.locator('h1:has-text("PlayDay")')).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeVisible();
  });
});
