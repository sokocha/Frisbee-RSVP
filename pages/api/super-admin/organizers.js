import { verifySession, parseCookies, isSuperAdmin, createMagicToken } from '../../../lib/auth';
import {
  getOrganizerById,
  getOrganizers,
  updateOrganizerStatus,
  deleteOrganizer,
} from '../../../lib/organizations';
import { Resend } from 'resend';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

export default async function handler(req, res) {
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

  // Check super admin
  if (!isSuperAdmin(organizer.email)) {
    return res.status(403).json({ error: 'Super admin access required' });
  }

  if (req.method === 'GET') {
    try {
      const organizers = await getOrganizers();
      return res.status(200).json({ organizers });
    } catch (error) {
      console.error('Get organizers error:', error);
      return res.status(500).json({ error: 'Failed to get organizers' });
    }
  }

  if (req.method === 'POST') {
    const { action, organizerId: targetId } = req.body;

    if (!action || !targetId) {
      return res.status(400).json({ error: 'Action and organizerId are required' });
    }

    try {
      if (action === 'approve') {
        const updated = await updateOrganizerStatus(targetId, 'approved');

        // Send approval email with magic link
        const token = await createMagicToken(updated.email);
        await sendApprovalEmail(updated.email, updated.name, token, req);

        return res.status(200).json({ success: true, organizer: updated });
      }

      if (action === 'reject') {
        const updated = await updateOrganizerStatus(targetId, 'rejected');

        // Send rejection email
        await sendRejectionEmail(updated.email, updated.name);

        return res.status(200).json({ success: true, organizer: updated });
      }

      if (action === 'delete') {
        await deleteOrganizer(targetId);
        return res.status(200).json({ success: true });
      }

      return res.status(400).json({ error: 'Invalid action' });
    } catch (error) {
      console.error('Organizer action error:', error);
      return res.status(500).json({ error: error.message || 'Action failed' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

async function sendApprovalEmail(email, name, token, req) {
  if (!resend) {
    console.log('Approval email (not sent - no Resend key):', { email, token });
    return;
  }

  const protocol = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers.host;
  const magicLink = `${protocol}://${host}/auth/verify?token=${token}`;

  try {
    await resend.emails.send({
      from: 'PlayDay <noreply@updates.playday.app>',
      to: email,
      subject: 'Your PlayDay Account is Approved!',
      html: `
        <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto;">
          <h2>Welcome to PlayDay, ${name}!</h2>
          <p>Great news! Your organizer account has been approved.</p>
          <p>Click the button below to log in and start creating your organization:</p>
          <a href="${magicLink}"
             style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 16px 0;">
            Log in to PlayDay
          </a>
          <p style="color: #666; font-size: 14px;">
            This link expires in 15 minutes.
          </p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
          <p style="color: #999; font-size: 12px;">PlayDay - Sports RSVP made simple</p>
        </div>
      `,
    });
  } catch (error) {
    console.error('Failed to send approval email:', error);
  }
}

async function sendRejectionEmail(email, name) {
  if (!resend) {
    console.log('Rejection email (not sent - no Resend key):', { email });
    return;
  }

  try {
    await resend.emails.send({
      from: 'PlayDay <noreply@updates.playday.app>',
      to: email,
      subject: 'PlayDay Account Request Update',
      html: `
        <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto;">
          <h2>Hi ${name},</h2>
          <p>Thank you for your interest in organizing on PlayDay.</p>
          <p>Unfortunately, we're unable to approve your account request at this time.</p>
          <p>If you believe this was a mistake or have questions, please reply to this email.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
          <p style="color: #999; font-size: 12px;">PlayDay - Sports RSVP made simple</p>
        </div>
      `,
    });
  } catch (error) {
    console.error('Failed to send rejection email:', error);
  }
}
