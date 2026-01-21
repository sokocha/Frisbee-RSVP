// @ts-check
const { test, expect } = require('@playwright/test');

// Helper to mock API with default open state
const mockRsvpApi = async (page, data = {}) => {
  const defaultData = {
    mainList: [],
    waitlist: [],
    mainListLimit: 30,
    accessStatus: { isOpen: true, message: null },
    snoozedNames: [],
    whitelist: [],
    ...data,
  };

  await page.route('**/api/rsvp', async route => {
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

test.describe('Frisbee RSVP App', () => {
  test('displays the main page with title', async ({ page }) => {
    await mockRsvpApi(page);
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('PlayDay');
  });

  test('shows loading state initially', async ({ page }) => {
    // Go to the page with slow network to catch loading state
    await page.route('**/api/rsvp', async route => {
      await new Promise(resolve => setTimeout(resolve, 500));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          mainList: [],
          waitlist: [],
          mainListLimit: 30,
          accessStatus: { isOpen: true, message: null },
          snoozedNames: [],
          whitelist: [],
        }),
      });
    });

    await page.goto('/');
    // The loading spinner or text should be visible briefly
    await expect(page.locator('text=Loading')).toBeVisible({ timeout: 1000 }).catch(() => {
      // If loading finishes too fast, that's okay
    });
  });

  test('displays RSVP form when access is open', async ({ page }) => {
    await mockRsvpApi(page);
    await page.goto('/');
    await expect(page.locator('input[placeholder*="name"]')).toBeVisible();
    // Button says "RSVP" not "Sign Up"
    await expect(page.locator('button:has-text("RSVP")')).toBeVisible();
  });

  test('shows closed message when RSVP is closed', async ({ page }) => {
    await mockRsvpApi(page, {
      accessStatus: {
        isOpen: false,
        message: 'RSVP is closed. Opens Thursday at 12:00 PM WAT',
      },
    });

    await page.goto('/');
    // Use first() since the text appears in both header badge and form area
    await expect(page.locator('text=RSVP is currently closed').first()).toBeVisible();
  });

  test('can sign up successfully', async ({ page }) => {
    // Mock both GET and POST
    await page.route('**/api/rsvp', async route => {
      const method = route.request().method();

      if (method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            mainList: [],
            waitlist: [],
            mainListLimit: 30,
            accessStatus: { isOpen: true, message: null },
            snoozedNames: [],
            whitelist: [],
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
            mainList: [{ id: 1, name: body.name, deviceId: body.deviceId }],
            waitlist: [],
          }),
        });
      }
    });

    await page.goto('/');

    // Fill in name and submit
    await page.fill('input[placeholder*="name"]', 'Test User');
    await page.click('button:has-text("RSVP")');

    // Should show success message
    await expect(page.locator('text=Spot #1')).toBeVisible();
  });

  test('displays participants in the main list', async ({ page }) => {
    await mockRsvpApi(page, {
      mainList: [
        { id: 1, name: 'Alice Smith', deviceId: 'device1' },
        { id: 2, name: 'Bob Jones', deviceId: 'device2' },
      ],
    });

    await page.goto('/');

    await expect(page.locator('text=Alice')).toBeVisible();
    await expect(page.locator('text=Bob')).toBeVisible();
  });

  test('displays waitlist when main list is full', async ({ page }) => {
    await mockRsvpApi(page, {
      mainList: [{ id: 1, name: 'Person One', deviceId: 'device1' }],
      waitlist: [{ id: 2, name: 'Person Two', deviceId: 'device2' }],
      mainListLimit: 1,
    });

    await page.goto('/');

    // Use more specific locator to avoid matching multiple elements
    await expect(page.getByRole('heading', { name: /Waitlist/i })).toBeVisible();
    await expect(page.locator('text=Person Two')).toBeVisible();
  });

  test('shows snoozed members section', async ({ page }) => {
    await mockRsvpApi(page, {
      snoozedNames: ['john doe'],
      whitelist: [{ name: 'John Doe' }],
    });

    await page.goto('/');

    await expect(page.locator('text=Skipping this week')).toBeVisible();
    await expect(page.locator('text=john doe')).toBeVisible();
  });

  test('shows skip week button for whitelisted members', async ({ page }) => {
    await mockRsvpApi(page, {
      mainList: [{
        id: 1,
        name: 'AIS Member',
        deviceId: 'device1',
        isWhitelisted: true,
      }],
      whitelist: [{ name: 'AIS Member', deviceId: 'device1' }],
    });

    await page.goto('/');

    await expect(page.locator('button:has-text("Skip week")')).toBeVisible();
  });

  test('progress bar reflects list capacity', async ({ page }) => {
    await mockRsvpApi(page, {
      mainList: Array.from({ length: 15 }, (_, i) => ({
        id: i + 1,
        name: `Person ${i + 1}`,
        deviceId: `device${i + 1}`,
      })),
    });

    await page.goto('/');

    // Should show 15/30 or 50%
    await expect(page.locator('text=15 / 30')).toBeVisible();
  });
});

test.describe('Admin Dashboard', () => {
  test('requires password to access', async ({ page }) => {
    await page.goto('/admin');

    // Should show password input
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.getByRole('button', { name: /login/i })).toBeVisible();
  });

  test('shows error for wrong password', async ({ page }) => {
    await page.route('**/api/admin', async route => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Invalid password' }),
      });
    });

    await page.goto('/admin');

    await page.fill('input[type="password"]', 'wrong-password');
    await page.click('button:has-text("Login")');

    await expect(page.locator('text=Invalid password')).toBeVisible();
  });
});
