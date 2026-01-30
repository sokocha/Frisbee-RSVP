import { verifySession, parseCookies, isSuperAdmin } from '../../../../lib/auth';
import { getOrganizerById, getOrganizationBySlug, organizerOwnsOrg, updateOrganization, deleteOrganization } from '../../../../lib/organizations';
import { getOrgData, setOrgData, ORG_KEY_SUFFIXES, deleteAllOrgData } from '../../../../lib/kv';
import { getCurrentPeriodId } from '../../../../lib/recurrence';
import { Resend } from 'resend';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

/**
 * Generate a unique snooze code (6 characters, no confusing chars)
 */
function generateSnoozeCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Send welcome email with snooze code to new whitelist member
 */
async function sendWhitelistWelcomeEmail(email, name, snoozeCode, orgName, slug) {
  if (!resend) {
    console.log('Resend not configured, skipping email for:', email);
    return false;
  }

  try {
    await resend.emails.send({
      from: `${orgName} <noreply@itsplayday.com>`,
      to: email,
      subject: `Welcome to ${orgName} - Your Member Code`,
      html: `
        <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto;">
          <h2>Hi ${name}!</h2>
          <p>You've been added as a VIP member of <strong>${orgName}</strong>.</p>
          <p>Your personal snooze code is:</p>
          <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; text-align: center; margin: 16px 0;">
            <span style="font-size: 28px; font-weight: bold; letter-spacing: 4px; font-family: monospace;">${snoozeCode}</span>
          </div>
          <p>Use this code on the RSVP page if you need to skip a week. You'll automatically return to the list the following week.</p>
          <a href="https://itsplayday.com/${slug}" style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 16px 0;">
            View RSVP Page
          </a>
          <p style="color: #666; font-size: 14px;">Keep this code safe - you'll need it whenever you want to skip a week.</p>
        </div>
      `,
    });
    return true;
  } catch (error) {
    console.error('Failed to send whitelist welcome email:', error);
    return false;
  }
}

/**
 * Sort people by priority
 */
function sortByPriority(people) {
  return [...people].sort((a, b) => {
    if (a.isWhitelisted && !b.isWhitelisted) return -1;
    if (!a.isWhitelisted && b.isWhitelisted) return 1;
    return new Date(a.timestamp) - new Date(b.timestamp);
  });
}

/**
 * Rebalance lists
 */
function rebalanceLists(mainList, waitlist, limit) {
  const allPeople = [...mainList, ...waitlist];
  const sorted = sortByPriority(allPeople);
  return {
    mainList: sorted.slice(0, limit),
    waitlist: sorted.slice(limit)
  };
}

// Default settings
function getDefaultSettings(timezone = 'Africa/Lagos') {
  return {
    mainListLimit: 30,
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
      bcc: [],
      subject: 'Weekly RSVP List - {{week}}',
      body: 'Please find attached the RSVP list for this week.\n\nTotal participants: {{count}}'
    },
    gameInfo: {
      enabled: false,
      gameDay: 0,
      startHour: 17,
      startMinute: 0,
      endHour: 19,
      endMinute: 0,
      location: {
        enabled: false,
        name: '',
        address: '',
        googleMapsUrl: '',
      },
      rules: {
        enabled: false,
        items: [],
      },
      weather: {
        enabled: false,
      },
    }
  };
}

export default async function handler(req, res) {
  const { slug } = req.query;

  // Get organization
  const org = await getOrganizationBySlug(slug);
  if (!org) {
    return res.status(404).json({ error: 'Organization not found' });
  }

  const orgId = org.id;

  // Authenticate organizer
  const cookies = parseCookies(req);
  const sessionToken = cookies.session;

  // Also check Authorization header for API access
  let authToken = sessionToken;
  const authHeader = req.headers.authorization;
  if (!authToken && authHeader?.startsWith('Bearer ')) {
    authToken = authHeader.slice(7);
  }

  if (!authToken) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const organizerId = await verifySession(authToken);
  if (!organizerId) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }

  const organizer = await getOrganizerById(organizerId);
  if (!organizer) {
    return res.status(403).json({ error: 'Organizer not found' });
  }

  // Check permission
  const isAdmin = isSuperAdmin(organizer.email);

  // Check if approved (super admins bypass this check)
  if (organizer.status !== 'approved' && !isAdmin) {
    return res.status(403).json({ error: 'Account not approved' });
  }
  const hasPermission = isAdmin || await organizerOwnsOrg(organizerId, orgId);
  if (!hasPermission) {
    return res.status(403).json({ error: 'You do not have permission to manage this organization' });
  }

  if (req.method === 'GET') {
    try {
      const rsvpData = await getOrgData(orgId, ORG_KEY_SUFFIXES.RSVP_DATA, { mainList: [], waitlist: [] });
      const whitelist = await getOrgData(orgId, ORG_KEY_SUFFIXES.WHITELIST, []);
      const settings = await getOrgData(orgId, ORG_KEY_SUFFIXES.SETTINGS, getDefaultSettings(org.timezone));
      const archive = await getOrgData(orgId, ORG_KEY_SUFFIXES.ARCHIVE, []);
      const emailStatus = await getOrgData(orgId, ORG_KEY_SUFFIXES.EMAIL_STATUS, null);
      const lastEmailWeek = await getOrgData(orgId, ORG_KEY_SUFFIXES.LAST_EMAIL, null);
      const emailLog = await getOrgData(orgId, ORG_KEY_SUFFIXES.EMAIL_LOG, []);
      const limit = settings.mainListLimit || 30;

      const rebalanced = rebalanceLists(rsvpData.mainList, rsvpData.waitlist, limit);
      const orderChanged = JSON.stringify(rebalanced) !== JSON.stringify(rsvpData);
      if (orderChanged) {
        await setOrgData(orgId, ORG_KEY_SUFFIXES.RSVP_DATA, rebalanced);
      }

      const timezone = settings.accessPeriod?.timezone || org.timezone || 'Africa/Lagos';
      const currentWeekId = getCurrentPeriodId(settings, timezone);

      // Prepopulate gameInfo.location with organization's location/streetAddress if not already set
      if (settings.gameInfo?.location) {
        if (!settings.gameInfo.location.area && org.location) {
          settings.gameInfo.location.area = org.location;
        }
        if (!settings.gameInfo.location.address && org.streetAddress) {
          settings.gameInfo.location.address = org.streetAddress;
        }
      }

      return res.status(200).json({
        organization: {
          id: org.id,
          slug: org.slug,
          name: org.name,
          sport: org.sport,
          location: org.location,
          streetAddress: org.streetAddress,
          timezone: org.timezone,
          visibility: org.visibility || 'private',
        },
        mainList: rebalanced.mainList,
        waitlist: rebalanced.waitlist,
        whitelist,
        settings,
        archive,
        emailStatus,
        lastEmailWeek,
        emailLog,
        currentWeekId
      });
    } catch (error) {
      console.error('Failed to get admin data:', error);
      return res.status(500).json({ error: 'Failed to load data' });
    }
  }

  if (req.method === 'POST') {
    const { action, data } = req.body;

    try {
      if (action === 'add-whitelist') {
        // Support both old format (names: string[]) and new format (members: {name, email}[])
        const { names, members } = data;
        const inputMembers = members || (names ? names.map(n => typeof n === 'string' ? { name: n } : n) : []);

        if (!inputMembers || !Array.isArray(inputMembers) || inputMembers.length === 0) {
          return res.status(400).json({ error: 'Members array is required' });
        }

        const rsvpData = await getOrgData(orgId, ORG_KEY_SUFFIXES.RSVP_DATA, { mainList: [], waitlist: [] });
        let whitelist = await getOrgData(orgId, ORG_KEY_SUFFIXES.WHITELIST, []);
        const settings = await getOrgData(orgId, ORG_KEY_SUFFIXES.SETTINGS, getDefaultSettings(org.timezone));
        const limit = settings.mainListLimit || 30;

        const added = [];
        const skipped = [];

        for (const member of inputMembers) {
          const trimmedName = (member.name || '').trim();
          const email = (member.email || '').trim().toLowerCase();
          if (!trimmedName) continue;

          if (whitelist.some(w => w.name.toLowerCase() === trimmedName.toLowerCase())) {
            skipped.push({ name: trimmedName, reason: 'Already in whitelist' });
            continue;
          }

          const allSignups = [...rsvpData.mainList, ...rsvpData.waitlist];
          if (allSignups.some(p => p.name.toLowerCase() === trimmedName.toLowerCase())) {
            skipped.push({ name: trimmedName, reason: 'Already signed up' });
            continue;
          }

          // Generate unique snooze code
          const snoozeCode = generateSnoozeCode();

          const newPerson = {
            id: Date.now() + Math.random(),
            name: trimmedName,
            timestamp: new Date().toISOString(),
            deviceId: `whitelist-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            isWhitelisted: true
          };

          const whitelistEntry = {
            name: trimmedName,
            snoozeCode,
            addedAt: new Date().toISOString()
          };

          // Only add email if provided
          if (email) {
            whitelistEntry.email = email;
          }

          whitelist.push(whitelistEntry);

          const rebalanced = rebalanceLists(
            [...rsvpData.mainList, newPerson],
            rsvpData.waitlist,
            limit
          );
          rsvpData.mainList = rebalanced.mainList;
          rsvpData.waitlist = rebalanced.waitlist;

          // Send welcome email if email provided
          let emailSent = false;
          if (email) {
            emailSent = await sendWhitelistWelcomeEmail(email, trimmedName, snoozeCode, org.name, org.slug);
          }

          added.push({
            name: trimmedName,
            email: email || null,
            snoozeCode,
            emailSent
          });
        }

        await setOrgData(orgId, ORG_KEY_SUFFIXES.RSVP_DATA, rsvpData);
        await setOrgData(orgId, ORG_KEY_SUFFIXES.WHITELIST, whitelist);

        return res.status(200).json({
          success: true,
          added,
          skipped,
          mainList: rsvpData.mainList,
          waitlist: rsvpData.waitlist,
          whitelist
        });
      }

      if (action === 'remove-whitelist') {
        const { name } = data;

        if (!name) {
          return res.status(400).json({ error: 'Name is required' });
        }

        const rsvpData = await getOrgData(orgId, ORG_KEY_SUFFIXES.RSVP_DATA, { mainList: [], waitlist: [] });
        let whitelist = await getOrgData(orgId, ORG_KEY_SUFFIXES.WHITELIST, []);

        whitelist = whitelist.filter(w => w.name.toLowerCase() !== name.toLowerCase());

        const wasInMain = rsvpData.mainList.some(p => p.name.toLowerCase() === name.toLowerCase());
        rsvpData.mainList = rsvpData.mainList.filter(p => p.name.toLowerCase() !== name.toLowerCase());
        rsvpData.waitlist = rsvpData.waitlist.filter(p => p.name.toLowerCase() !== name.toLowerCase());

        if (wasInMain && rsvpData.waitlist.length > 0) {
          const promoted = rsvpData.waitlist.shift();
          rsvpData.mainList.push(promoted);
        }

        await setOrgData(orgId, ORG_KEY_SUFFIXES.RSVP_DATA, rsvpData);
        await setOrgData(orgId, ORG_KEY_SUFFIXES.WHITELIST, whitelist);

        return res.status(200).json({
          success: true,
          mainList: rsvpData.mainList,
          waitlist: rsvpData.waitlist,
          whitelist
        });
      }

      if (action === 'resend-snooze-code') {
        const { memberName, name } = data;
        const targetName = memberName || name;

        if (!targetName) {
          return res.status(400).json({ error: 'Member name is required' });
        }

        const whitelist = await getOrgData(orgId, ORG_KEY_SUFFIXES.WHITELIST, []);
        const member = whitelist.find(w => w.name.toLowerCase() === targetName.toLowerCase());

        if (!member) {
          return res.status(404).json({ error: 'Member not found in whitelist' });
        }

        if (!member.email) {
          return res.status(400).json({ error: 'Member does not have an email address' });
        }

        if (!member.snoozeCode) {
          return res.status(400).json({ error: 'Member does not have a snooze code' });
        }

        const emailSent = await sendWhitelistWelcomeEmail(
          member.email,
          member.name,
          member.snoozeCode,
          org.name,
          org.slug
        );

        return res.status(200).json({
          success: true,
          emailSent,
          message: emailSent ? 'Snooze code email sent' : 'Failed to send email'
        });
      }

      if (action === 'remove-person') {
        const { personId, isWaitlist } = data;

        const rsvpData = await getOrgData(orgId, ORG_KEY_SUFFIXES.RSVP_DATA, { mainList: [], waitlist: [] });

        if (isWaitlist) {
          rsvpData.waitlist = rsvpData.waitlist.filter(p => p.id !== personId);
        } else {
          rsvpData.mainList = rsvpData.mainList.filter(p => p.id !== personId);

          if (rsvpData.waitlist.length > 0) {
            const promoted = rsvpData.waitlist.shift();
            rsvpData.mainList.push(promoted);
          }
        }

        await setOrgData(orgId, ORG_KEY_SUFFIXES.RSVP_DATA, rsvpData);

        return res.status(200).json({
          success: true,
          mainList: rsvpData.mainList,
          waitlist: rsvpData.waitlist
        });
      }

      if (action === 'reset-all') {
        await setOrgData(orgId, ORG_KEY_SUFFIXES.RSVP_DATA, { mainList: [], waitlist: [] });
        await setOrgData(orgId, ORG_KEY_SUFFIXES.WHITELIST, []);

        return res.status(200).json({
          success: true,
          mainList: [],
          waitlist: [],
          whitelist: []
        });
      }

      if (action === 'reset-signups') {
        const whitelist = await getOrgData(orgId, ORG_KEY_SUFFIXES.WHITELIST, []);
        const rsvpData = await getOrgData(orgId, ORG_KEY_SUFFIXES.RSVP_DATA, { mainList: [], waitlist: [] });

        const whitelistedPeople = rsvpData.mainList.filter(p => p.isWhitelisted);

        await setOrgData(orgId, ORG_KEY_SUFFIXES.RSVP_DATA, { mainList: whitelistedPeople, waitlist: [] });

        return res.status(200).json({
          success: true,
          mainList: whitelistedPeople,
          waitlist: [],
          whitelist
        });
      }

      if (action === 'update-settings') {
        const { settings } = data;

        if (!settings) {
          return res.status(400).json({ error: 'Settings are required' });
        }

        const currentSettings = await getOrgData(orgId, ORG_KEY_SUFFIXES.SETTINGS, getDefaultSettings(org.timezone));
        const oldLimit = currentSettings.mainListLimit || 30;
        const newLimit = settings.mainListLimit ?? oldLimit;

        const newSettings = {
          ...currentSettings,
          mainListLimit: newLimit,
          accessPeriod: {
            ...currentSettings.accessPeriod,
            ...(settings.accessPeriod || {})
          },
          email: {
            ...(currentSettings.email || getDefaultSettings().email),
            ...(settings.email || {})
          },
          gameInfo: settings.gameInfo ? {
            ...(currentSettings.gameInfo || getDefaultSettings().gameInfo),
            ...settings.gameInfo,
            location: {
              ...(currentSettings.gameInfo?.location || getDefaultSettings().gameInfo.location),
              ...(settings.gameInfo?.location || {})
            },
            rules: {
              ...(currentSettings.gameInfo?.rules || getDefaultSettings().gameInfo.rules),
              ...(settings.gameInfo?.rules || {})
            },
            weather: {
              ...(currentSettings.gameInfo?.weather || getDefaultSettings().gameInfo.weather),
              ...(settings.gameInfo?.weather || {})
            }
          } : (currentSettings.gameInfo || getDefaultSettings().gameInfo),
          whatsapp: {
            ...(currentSettings.whatsapp || { enabled: false, groupUrl: '' }),
            ...(settings.whatsapp || {})
          }
        };

        await setOrgData(orgId, ORG_KEY_SUFFIXES.SETTINGS, newSettings);

        const rsvpData = await getOrgData(orgId, ORG_KEY_SUFFIXES.RSVP_DATA, { mainList: [], waitlist: [] });
        const oldMainListIds = new Set(rsvpData.mainList.map(p => p.id));

        const rebalanced = rebalanceLists(rsvpData.mainList, rsvpData.waitlist, newLimit);

        const promoted = rebalanced.mainList.filter(p => !oldMainListIds.has(p.id));
        const demoted = rebalanced.waitlist.filter(p => oldMainListIds.has(p.id));

        await setOrgData(orgId, ORG_KEY_SUFFIXES.RSVP_DATA, rebalanced);

        return res.status(200).json({
          success: true,
          settings: newSettings,
          promoted,
          demoted,
          mainList: rebalanced.mainList,
          waitlist: rebalanced.waitlist
        });
      }

      if (action === 'update-visibility') {
        const { visibility } = data;

        if (!visibility || !['private', 'public'].includes(visibility)) {
          return res.status(400).json({ error: 'Invalid visibility value' });
        }

        await updateOrganization(orgId, { visibility });

        return res.status(200).json({
          success: true,
          visibility
        });
      }

      return res.status(400).json({ error: 'Invalid action' });
    } catch (error) {
      console.error('Admin action failed:', error);
      return res.status(500).json({ error: 'Action failed' });
    }
  }

  if (req.method === 'DELETE') {
    try {
      // Delete all organization data from KV
      await deleteAllOrgData(orgId);

      // Delete the organization record
      await deleteOrganization(orgId);

      return res.status(200).json({ success: true });
    } catch (error) {
      console.error('Delete organization failed:', error);
      return res.status(500).json({ error: 'Failed to delete organization' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
