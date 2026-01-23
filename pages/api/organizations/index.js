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
    const { slug, name, sport, location, timezone } = req.body;

    // Validate required fields
    if (!slug || !name || !sport) {
      return res.status(400).json({ error: 'Slug, name, and sport are required' });
    }

    // Validate slug format
    const slugValidation = validateSlug(slug);
    if (!slugValidation.valid) {
      return res.status(400).json({ error: slugValidation.error });
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
        timezone,
        ownerId: organizerId,
      });

      return res.status(201).json({ organization });
    } catch (error) {
      console.error('Create organization error:', error);
      return res.status(500).json({ error: error.message || 'Failed to create organization' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
