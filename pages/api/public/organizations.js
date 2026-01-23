import { getOrganizations, getPublicOrgInfo } from '../../../lib/organizations';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const allOrgs = await getOrganizations();

    // Only return active organizations with public info
    const publicOrgs = allOrgs
      .filter(org => org.status === 'active')
      .map(getPublicOrgInfo);

    return res.status(200).json({ organizations: publicOrgs });
  } catch (error) {
    console.error('Get public organizations error:', error);
    return res.status(500).json({ error: 'Failed to get organizations' });
  }
}
