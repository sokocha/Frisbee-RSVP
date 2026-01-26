import { verifySession, parseCookies, isSuperAdmin } from '../../../lib/auth';
import {
  getOrganizerById,
  getOrganizationById,
  updateOrganization,
  deleteOrganization,
  organizerOwnsOrg,
} from '../../../lib/organizations';
import { deleteAllOrgData } from '../../../lib/kv';

export default async function handler(req, res) {
  const { id } = req.query;

  if (!id) {
    return res.status(400).json({ error: 'Organization ID is required' });
  }

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
  if (!organizer || organizer.status !== 'approved') {
    return res.status(403).json({ error: 'Account not approved' });
  }

  const isAdmin = isSuperAdmin(organizer.email);

  // Check organization exists
  const organization = await getOrganizationById(id);
  if (!organization) {
    return res.status(404).json({ error: 'Organization not found' });
  }

  // Check permission (owner or super admin)
  const hasPermission = isAdmin || await organizerOwnsOrg(organizerId, id);
  if (!hasPermission) {
    return res.status(403).json({ error: 'You do not have permission to access this organization' });
  }

  if (req.method === 'GET') {
    return res.status(200).json({ organization });
  }

  if (req.method === 'PUT' || req.method === 'PATCH') {
    const { slug, name, sport, location, timezone, status } = req.body;

    try {
      const updates = {};

      if (slug !== undefined) updates.slug = slug;
      if (name !== undefined) updates.name = name;
      if (sport !== undefined) updates.sport = sport;
      if (location !== undefined) updates.location = location;
      if (timezone !== undefined) updates.timezone = timezone;

      // Only super admin can change status
      if (status !== undefined && isAdmin) {
        updates.status = status;
      }

      const updated = await updateOrganization(id, updates);

      return res.status(200).json({ organization: updated });
    } catch (error) {
      console.error('Update organization error:', error);
      return res.status(500).json({ error: error.message || 'Failed to update organization' });
    }
  }

  if (req.method === 'DELETE') {
    try {
      // Delete all organization data first
      await deleteAllOrgData(id);

      // Then delete the organization record
      await deleteOrganization(id);

      return res.status(200).json({ success: true });
    } catch (error) {
      console.error('Delete organization error:', error);
      return res.status(500).json({ error: 'Failed to delete organization' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
