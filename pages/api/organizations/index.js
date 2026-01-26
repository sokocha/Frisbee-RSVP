import { verifySession, parseCookies, isSuperAdmin } from '../../../lib/auth';
import {
  getOrganizerById,
  getOrganizations,
  getOrganizationsByOwner,
  createOrganization,
  validateSlug,
  isSlugTaken,
} from '../../../lib/organizations';

export default async function handler(req, res) {
  // Authenticate
  const cookies = parseCookies(req);
  const sessionToken = cookies.session;

  if (!sessionToken) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const organizerId = await verifySession(sessionToken);
  if (!organizerId) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }

  const organizer = await getOrganizerById(organizerId);
  if (!organizer) {
    return res.status(403).json({ error: 'Organizer not found' });
  }

  const isAdmin = isSuperAdmin(organizer.email);

  // Check if approved (super admins bypass this check)
  if (organizer.status !== 'approved' && !isAdmin) {
    return res.status(403).json({ error: 'Account not approved' });
  }

  if (req.method === 'GET') {
    try {
      // Super admin sees all, regular organizers see only their own
      const organizations = isAdmin
        ? await getOrganizations()
        : await getOrganizationsByOwner(organizerId);

      return res.status(200).json({ organizations });
    } catch (error) {
      console.error('Get organizations error:', error);
      return res.status(500).json({ error: 'Failed to get organizations' });
    }
  }

  if (req.method === 'POST') {
    const {
      slug,
      name,
      sport,
      location,
      streetAddress,
      timezone,
      maxParticipants,
      gameDay,
      gameStartHour,
      gameStartMinute,
      gameEndHour,
      gameEndMinute,
      rsvpWindowPreset,
      // Recurrence (optional - defaults to weekly)
      recurrence,
      monthlyOccurrence,
      // Custom RSVP timing (optional)
      rsvpOpenDay,
      rsvpOpenHour,
      rsvpOpenMinute,
      rsvpCloseDay,
      rsvpCloseHour,
      rsvpCloseMinute,
    } = req.body;

    // Validate required fields
    if (!slug || !name || !sport) {
      return res.status(400).json({ error: 'Slug, name, and sport are required' });
    }

    // Validate slug format
    const slugValidation = validateSlug(slug);
    if (!slugValidation.valid) {
      return res.status(400).json({ error: slugValidation.error });
    }

    // Validate max participants
    const participantLimit = Math.min(Math.max(parseInt(maxParticipants) || 30, 1), 500);

    // Build game schedule with optional custom RSVP timing
    const gameSchedule = {
      gameDay: parseInt(gameDay) || 0,
      startHour: Math.min(Math.max(parseInt(gameStartHour) || 17, 0), 23),
      startMinute: Math.min(Math.max(parseInt(gameStartMinute) || 0, 0), 59),
      endHour: Math.min(Math.max(parseInt(gameEndHour) || 19, 0), 23),
      endMinute: Math.min(Math.max(parseInt(gameEndMinute) || 0, 0), 59),
      recurrence: recurrence || 'weekly',
      monthlyOccurrence: recurrence === 'monthly' ? (monthlyOccurrence || 1) : null,
    };

    // Add custom RSVP timing if provided (for 'custom' preset)
    if (rsvpWindowPreset === 'custom' && rsvpOpenDay !== undefined && rsvpCloseDay !== undefined) {
      gameSchedule.rsvpOpenDay = parseInt(rsvpOpenDay);
      gameSchedule.rsvpOpenHour = Math.min(Math.max(parseInt(rsvpOpenHour) || 0, 0), 23);
      gameSchedule.rsvpOpenMinute = Math.min(Math.max(parseInt(rsvpOpenMinute) || 0, 0), 59);
      gameSchedule.rsvpCloseDay = parseInt(rsvpCloseDay);
      gameSchedule.rsvpCloseHour = Math.min(Math.max(parseInt(rsvpCloseHour) || 0, 0), 23);
      gameSchedule.rsvpCloseMinute = Math.min(Math.max(parseInt(rsvpCloseMinute) || 0, 0), 59);
    }

    try {
      // Check if slug is available
      if (await isSlugTaken(slugValidation.normalized)) {
        return res.status(400).json({ error: 'This slug is already taken' });
      }

      const organization = await createOrganization({
        slug: slugValidation.normalized,
        name,
        sport,
        location,
        streetAddress,
        timezone,
        ownerId: organizerId,
        maxParticipants: participantLimit,
        gameSchedule,
        organizerEmail: organizer.email, // Pass organizer email for CC preset
        rsvpWindowPreset: rsvpWindowPreset || '6-hours',
      });

      return res.status(201).json({ organization });
    } catch (error) {
      console.error('Create organization error:', error);
      return res.status(500).json({ error: error.message || 'Failed to create organization' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
