import { verifySession, parseCookies, isSuperAdmin } from '../../../lib/auth';
import { getOrganizerById, getOrganizationsByOwner } from '../../../lib/organizations';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get session from cookie
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
      return res.status(401).json({ error: 'Organizer not found' });
    }

    // Get organizations owned by this organizer
    const organizations = await getOrganizationsByOwner(organizerId);

    return res.status(200).json({
      organizer: {
        id: organizer.id,
        email: organizer.email,
        name: organizer.name,
        status: organizer.status,
        isSuperAdmin: isSuperAdmin(organizer.email),
      },
      organizations: organizations.map(org => ({
        id: org.id,
        slug: org.slug,
        name: org.name,
        sport: org.sport,
        location: org.location,
        status: org.status,
      })),
    });
  } catch (error) {
    console.error('Get me error:', error);
    return res.status(500).json({ error: 'Failed to get user info' });
  }
}
