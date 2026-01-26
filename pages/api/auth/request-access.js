import { createOrganizer, getOrganizerByEmail } from '../../../lib/organizations';
import { createMagicToken, isSuperAdmin } from '../../../lib/auth';
import { Resend } from 'resend';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, name, intendedSport, intendedLocation } = req.body;

  // Validate required fields
  if (!email || !name) {
    return res.status(400).json({ error: 'Email and name are required' });
  }

  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }

  try {
    // Check if organizer already exists
    const existingOrganizer = await getOrganizerByEmail(email);

    if (existingOrganizer) {
      // If already approved, send login link instead
      if (existingOrganizer.status === 'approved' || isSuperAdmin(email)) {
        const token = await createMagicToken(email);
        await sendMagicLinkEmail(email, existingOrganizer.name, token, req);

        return res.status(200).json({
          success: true,
          message: 'You already have an account. Check your email for a login link.',
          status: 'existing',
        });
      }

      // If pending, let them know
      if (existingOrganizer.status === 'pending') {
        return res.status(200).json({
          success: true,
          message: 'Your request is pending approval. You\'ll receive an email when approved.',
          status: 'pending',
        });
      }

      // If rejected
      return res.status(400).json({
        error: 'Your previous request was not approved. Please contact support.',
      });
    }

    // Super admin auto-approves
    if (isSuperAdmin(email)) {
      const organizer = await createOrganizer({
        email,
        name,
        intendedSport,
        intendedLocation,
      });

      // Auto-approve super admin
      const { updateOrganizerStatus } = await import('../../../lib/organizations');
      await updateOrganizerStatus(organizer.id, 'approved');

      // Send magic link
      const token = await createMagicToken(email);
      await sendMagicLinkEmail(email, name, token, req);

      return res.status(200).json({
        success: true,
        message: 'Welcome! Check your email for a login link.',
        status: 'approved',
      });
    }

    // Create new organizer request
    await createOrganizer({
      email,
      name,
      intendedSport,
      intendedLocation,
    });

    // Notify super admin of new request (if email configured)
    await notifySuperAdmin(email, name, intendedSport, intendedLocation, req);

    return res.status(200).json({
      success: true,
      message: 'Your request has been submitted. You\'ll receive an email when approved.',
      status: 'pending',
    });
  } catch (error) {
    console.error('Request access error:', error);
    return res.status(500).json({ error: 'Failed to process request' });
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
      from: 'PlayDay <noreply@itsplayday.com>',
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

async function notifySuperAdmin(email, name, intendedSport, intendedLocation, req) {
  const superAdminEmail = process.env.SUPER_ADMIN_EMAIL;
  if (!resend || !superAdminEmail) return;

  const protocol = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers.host;
  const adminLink = `${protocol}://${host}/super-admin`;

  try {
    await resend.emails.send({
      from: 'PlayDay <noreply@itsplayday.com>',
      to: superAdminEmail,
      subject: 'New PlayDay Organizer Request',
      html: `
        <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto;">
          <h2>New Organizer Request</h2>
          <p>Someone wants to organize on PlayDay:</p>
          <ul>
            <li><strong>Name:</strong> ${name}</li>
            <li><strong>Email:</strong> ${email}</li>
            <li><strong>Sport:</strong> ${intendedSport || 'Not specified'}</li>
            <li><strong>Location:</strong> ${intendedLocation || 'Not specified'}</li>
          </ul>
          <a href="${adminLink}"
             style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 16px 0;">
            Review Request
          </a>
        </div>
      `,
    });
  } catch (error) {
    console.error('Failed to notify super admin:', error);
  }
}
