import { getOrganizations, getPublicOrgInfo } from '../../../lib/organizations';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Prevent caching to ensure visibility changes take effect immediately
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  try {
    const allOrgs = await getOrganizations();

    // Only return active AND public organizations
    // Organizations without visibility field or with visibility !== 'public' are excluded
    const publicOrgs = allOrgs
      .filter(org => org.status === 'active' && org.visibility === 'public')
      .map(getPublicOrgInfo);

    return res.status(200).json({ organizations: publicOrgs });
  } catch (error) {
    console.error('Get public organizations error:', error);
    return res.status(500).json({ error: 'Failed to get organizations' });
  }
}
