import { deleteSession, parseCookies } from '../../../lib/auth';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get session from cookie
    const cookies = parseCookies(req);
    const sessionToken = cookies.session;

    if (sessionToken) {
      await deleteSession(sessionToken);
    }

    // Clear session cookie
    res.setHeader('Set-Cookie', [
      'session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0',
    ]);

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Logout error:', error);
    return res.status(500).json({ error: 'Failed to logout' });
  }
}
