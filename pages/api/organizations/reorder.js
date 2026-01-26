import { verifySession, parseCookies } from '../../../lib/auth';
import { getOrganizerById, getOrganizationsByOwner, updateOrganization } from '../../../lib/organizations';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
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
      return res.status(401).json({ error: 'Organizer not found' });
    }

    const { order } = req.body;
    if (!Array.isArray(order)) {
      return res.status(400).json({ error: 'Invalid order data' });
    }

    // Get user's organizations to verify ownership
    const userOrgs = await getOrganizationsByOwner(organizerId);
    const userOrgIds = new Set(userOrgs.map(o => o.id));

    // Update display order for each org (only if user owns it)
    for (const item of order) {
      if (userOrgIds.has(item.id)) {
        await updateOrganization(item.id, { displayOrder: item.displayOrder });
      }
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Reorder error:', error);
    return res.status(500).json({ error: 'Failed to reorder organizations' });
  }
}
