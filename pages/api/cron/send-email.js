// Vercel Cron Job - runs every Friday at 10:00 AM UTC (11:00 AM WAT)
// This actively triggers the email send when RSVP window closes

export default async function handler(req, res) {
  // Verify this is a cron request (Vercel adds this header)
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;

  // Allow cron requests from Vercel or authenticated manual triggers
  const isVercelCron = authHeader === `Bearer ${cronSecret}`;
  const isManualTrigger = authHeader === `Bearer ${process.env.ADMIN_PASSWORD}`;

  if (!isVercelCron && !isManualTrigger) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Call the send-list API internally
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000';

    const response = await fetch(`${baseUrl}/api/send-list`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.ADMIN_PASSWORD}`
      },
      body: JSON.stringify({ force: false }) // Don't force - respect the "already sent" check
    });

    const data = await response.json();

    if (response.ok) {
      console.log('Cron: Email sent successfully', data);
      return res.status(200).json({
        success: true,
        message: 'Email triggered by cron',
        ...data
      });
    } else {
      console.log('Cron: Email not sent', data);
      return res.status(200).json({
        success: false,
        message: data.message || data.error,
        ...data
      });
    }
  } catch (error) {
    console.error('Cron: Failed to trigger email', error);
    return res.status(500).json({
      error: 'Failed to trigger email',
      details: error.message
    });
  }
}
