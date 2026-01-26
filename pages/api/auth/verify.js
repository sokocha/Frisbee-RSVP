import { verifyMagicToken, createSession, isSuperAdmin } from '../../../lib/auth';
import { getOrganizerByEmail, createOrganizer, updateOrganizerStatus } from '../../../lib/organizations';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ error: 'Token is required' });
  }

  try {
    // Verify the magic link token
    const email = await verifyMagicToken(token);

    if (!email) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    // Get or create organizer
    let organizer = await getOrganizerByEmail(email);

    // If super admin without organizer record, create one
    if (!organizer && isSuperAdmin(email)) {
      organizer = await createOrganizer({
        email,
        name: 'Super Admin',
        intendedSport: null,
        intendedLocation: null,
      });
      await updateOrganizerStatus(organizer.id, 'approved');
      organizer = await getOrganizerByEmail(email);
    }

    if (!organizer) {
      return res.status(401).json({ error: 'No account found for this email' });
    }

    // Check if approved
    if (organizer.status !== 'approved' && !isSuperAdmin(email)) {
      if (organizer.status === 'pending') {
        return res.status(403).json({ error: 'Your account is pending approval' });
      }
      return res.status(403).json({ error: 'Your account is not active' });
    }

    // Create session
    const sessionToken = await createSession(organizer.id);

    // Set session cookie
    const isProduction = process.env.NODE_ENV === 'production';
    const cookieOptions = [
      `session=${sessionToken}`,
      'Path=/',
      'HttpOnly',
      'SameSite=Lax',
      `Max-Age=${30 * 24 * 60 * 60}`, // 30 days
      isProduction ? 'Secure' : '',
    ].filter(Boolean).join('; ');

    res.setHeader('Set-Cookie', cookieOptions);

    return res.status(200).json({
      success: true,
      organizer: {
        id: organizer.id,
        email: organizer.email,
        name: organizer.name,
        isSuperAdmin: isSuperAdmin(email),
      },
    });
  } catch (error) {
    console.error('Verify error:', error);
    return res.status(500).json({ error: 'Failed to verify token' });
  }
}
