import { getOrganizerByEmail } from '../../../lib/organizations';
import { createMagicToken, isSuperAdmin } from '../../../lib/auth';
import { Resend } from 'resend';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }

  try {
    const organizer = await getOrganizerByEmail(email);

    // Always return success to prevent email enumeration
    // But only send email if organizer exists and is approved (or is super admin)
    if (organizer && (organizer.status === 'approved' || isSuperAdmin(email))) {
      const token = await createMagicToken(email);
      await sendMagicLinkEmail(email, organizer.name, token, req);
    } else if (isSuperAdmin(email)) {
      // Super admin can log in even without an organizer record
      const token = await createMagicToken(email);
      await sendMagicLinkEmail(email, 'Admin', token, req);
    }

    return res.status(200).json({
      success: true,
      message: 'If an account exists for this email, you\'ll receive a login link shortly.',
    });
  } catch (error) {
    console.error('Magic link error:', error);
    return res.status(500).json({ error: 'Failed to send login link' });
  }
}

async function sendMagicLinkEmail(email, name, token, req) {
  if (!resend) {
    console.log('Magic link token (email not configured):', token);
    return;
  }

  const protocol = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers.host;
  const magicLink = `${protocol}://${host}/auth/verify?token=${token}`;

  try {
    await resend.emails.send({
      from: 'PlayDay <noreply@updates.itsplayday.com>',
      to: email,
      subject: 'Your PlayDay Login Link',
      html: `
        <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto;">
          <h2>Hi ${name}!</h2>
          <p>Click the button below to log in to PlayDay:</p>
          <a href="${magicLink}"
             style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 16px 0;">
            Log in to PlayDay
          </a>
          <p style="color: #666; font-size: 14px;">
            This link expires in 15 minutes. If you didn't request this, you can ignore this email.
          </p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
          <p style="color: #999; font-size: 12px;">PlayDay - Sports RSVP made simple</p>
        </div>
      `,
    });
  } catch (error) {
    console.error('Failed to send magic link email:', error);
  }
}
