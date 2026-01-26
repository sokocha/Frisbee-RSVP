import { verifySession, parseCookies, isSuperAdmin } from '../../../lib/auth';
import {
  getOrganizerById,
  getOrganizationById,
  deleteOrganization,
  organizerOwnsOrg,
} from '../../../lib/organizations';
import { deleteAllOrgData } from '../../../lib/kv';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
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
  if (!organizer) {
    return res.status(403).json({ error: 'Organizer not found' });
  }

  const isAdmin = isSuperAdmin(organizer.email);

  // Check if approved (super admins bypass this check)
  if (organizer.status !== 'approved' && !isAdmin) {
    return res.status(403).json({ error: 'Account not approved' });
  }

  const { ids } = req.body;

  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'No organization IDs provided' });
  }

  if (ids.length > 50) {
    return res.status(400).json({ error: 'Cannot delete more than 50 organizations at once' });
  }

  const deleted = [];
  const errors = [];

  for (const id of ids) {
    try {
      // Check organization exists
      const organization = await getOrganizationById(id);
      if (!organization) {
        errors.push({ id, error: 'Organization not found' });
        continue;
      }

      // Check permission (owner or super admin)
      const hasPermission = isAdmin || await organizerOwnsOrg(organizerId, id);
      if (!hasPermission) {
        errors.push({ id, name: organization.name, error: 'Permission denied' });
        continue;
      }

      // Delete all organization data first
      await deleteAllOrgData(id);

      // Then delete the organization record
      await deleteOrganization(id);

      deleted.push({ id, name: organization.name });
    } catch (error) {
      console.error(`Failed to delete organization ${id}:`, error);
      errors.push({ id, error: 'Failed to delete' });
    }
  }

  return res.status(200).json({
    success: true,
    deleted: deleted.length,
    deletedOrgs: deleted,
    errors,
  });
}
