// Vercel Cron Job - runs every hour to check if any organization's RSVP window has closed
// Each organization has its own access period settings

import { getOrganizations } from '../../../lib/organizations';
import { getOrgData, ORG_KEY_SUFFIXES } from '../../../lib/kv';
import { getCurrentPeriodId } from '../../../lib/recurrence';

// Default settings for reference
function getDefaultSettings(timezone = 'Africa/Lagos') {
  return {
    accessPeriod: {
      enabled: true,
      startDay: 4,
      startHour: 12,
      startMinute: 0,
      endDay: 5,
      endHour: 10,
      endMinute: 0,
      timezone
    },
    email: {
      enabled: false,
      recipients: [],
      cc: [],
      bcc: []
    }
  };
}

// Check if the access period just closed (within the last 70 minutes to catch the cron window)
function shouldSendEmail(settings, timezone, lastEmailPeriod) {
  if (!settings?.accessPeriod?.enabled) return false;
  if (!settings?.email?.enabled) return false;
  if (!settings?.email?.recipients?.length) return false;

  const now = new Date();
  const localTime = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
  const currentDay = localTime.getDay();
  const currentHour = localTime.getHours();
  const currentMinute = localTime.getMinutes();

  const { endDay, endHour, endMinute } = settings.accessPeriod;

  // Calculate minutes since the start of the week (Sunday 00:00)
  const currentTotalMinutes = currentDay * 24 * 60 + currentHour * 60 + currentMinute;
  const endTotalMinutes = endDay * 24 * 60 + endHour * 60 + endMinute;

  // Calculate minutes since the window closed
  let minutesSinceClosed = currentTotalMinutes - endTotalMinutes;

  // Handle week wrap-around (if we're before the end time in the weekly cycle)
  if (minutesSinceClosed < 0) {
    minutesSinceClosed += 7 * 24 * 60; // Add a full week
  }

  const periodId = getCurrentPeriodId(settings, timezone);

  // Check if we already sent for this period
  if (lastEmailPeriod === periodId) {
    return false;
  }

  // Send if window closed in the last 70 minutes
  if (minutesSinceClosed >= 0 && minutesSinceClosed <= 70) {
    return true;
  }

  // Also check: if the window is currently closed and we haven't sent yet this period
  // This catches cases where the cron might have been missed
  const isCurrentlyOpen = isAccessPeriodOpen(settings, timezone);
  if (!isCurrentlyOpen && minutesSinceClosed > 0 && minutesSinceClosed < 7 * 24 * 60 - 120) {
    return true;
  }

  return false;
}

// Helper to check if access period is currently open
function isAccessPeriodOpen(settings, timezone) {
  if (!settings?.accessPeriod?.enabled) return true;

  const now = new Date();
  const localTime = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
  const currentDay = localTime.getDay();
  const currentHour = localTime.getHours();
  const currentMinute = localTime.getMinutes();

  const { startDay, startHour, startMinute, endDay, endHour, endMinute } = settings.accessPeriod;

  const currentTotalMinutes = currentDay * 24 * 60 + currentHour * 60 + currentMinute;
  const startTotalMinutes = startDay * 24 * 60 + startHour * 60 + startMinute;
  const endTotalMinutes = endDay * 24 * 60 + endHour * 60 + endMinute;

  // Handle wrap-around (e.g., Friday to Monday)
  if (startTotalMinutes <= endTotalMinutes) {
    return currentTotalMinutes >= startTotalMinutes && currentTotalMinutes < endTotalMinutes;
  } else {
    return currentTotalMinutes >= startTotalMinutes || currentTotalMinutes < endTotalMinutes;
  }
}

export default async function handler(req, res) {
  // Verify this is a cron request (Vercel adds this header)
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;

  // Allow cron requests from Vercel or authenticated manual triggers
  const isVercelCron = authHeader === `Bearer ${cronSecret}`;
  const isManualTrigger = authHeader === `Bearer ${process.env.ADMIN_PASSWORD}`;

  if (!isVercelCron && !isManualTrigger) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const results = {
    processed: 0,
    sent: [],
    skipped: [],
    failed: [],
  };

  try {
    // Get all organizations
    const organizations = await getOrganizations();

    if (!organizations || organizations.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No organizations found',
        results
      });
    }

    // Determine base URL for API calls
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000';

    // Check each organization
    for (const org of organizations) {
      results.processed++;

      try {
        const settings = await getOrgData(org.id, ORG_KEY_SUFFIXES.SETTINGS, getDefaultSettings(org.timezone));
        const timezone = settings?.accessPeriod?.timezone || org.timezone || 'Africa/Lagos';
        const lastEmailWeek = await getOrgData(org.id, ORG_KEY_SUFFIXES.LAST_EMAIL, null);

        // Check if this org's window just closed
        if (!shouldSendEmail(settings, timezone, lastEmailWeek)) {
          results.skipped.push({
            slug: org.slug,
            reason: 'Not time to send or already sent'
          });
          continue;
        }

        // Trigger email send for this org
        const response = await fetch(`${baseUrl}/api/org/${org.slug}/send-list`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${cronSecret}`
          },
          body: JSON.stringify({ force: false })
        });

        const data = await response.json();

        if (response.ok && data.success) {
          results.sent.push({
            slug: org.slug,
            message: data.message,
            weekId: data.weekId
          });
          console.log(`Cron: Email sent for ${org.slug}`);
        } else if (data.skipped) {
          results.skipped.push({
            slug: org.slug,
            reason: data.message || data.error
          });
        } else {
          results.failed.push({
            slug: org.slug,
            error: data.error || 'Unknown error'
          });
          console.error(`Cron: Failed for ${org.slug}:`, data.error);
        }
      } catch (error) {
        results.failed.push({
          slug: org.slug,
          error: error.message
        });
        console.error(`Cron: Error processing ${org.slug}:`, error);
      }
    }

    console.log('Cron completed:', results);

    return res.status(200).json({
      success: true,
      message: `Processed ${results.processed} organizations`,
      results
    });

  } catch (error) {
    console.error('Cron: Fatal error', error);
    return res.status(500).json({
      error: 'Failed to process organizations',
      details: error.message,
      results
    });
  }
}
