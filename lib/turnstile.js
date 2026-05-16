const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export async function verifyTurnstileToken(token, remoteIp) {
  if (!token) return { success: false, error: 'missing-token' };

  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    // Fail open in non-production so local dev works without setup.
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[turnstile] TURNSTILE_SECRET_KEY not set; skipping verification (non-production).');
      return { success: true };
    }
    return { success: false, error: 'server-misconfigured' };
  }

  const body = new URLSearchParams({ secret, response: token });
  if (remoteIp) body.append('remoteip', remoteIp);

  try {
    const resp = await fetch(SITEVERIFY_URL, { method: 'POST', body });
    const data = await resp.json();
    if (data.success) return { success: true };
    return { success: false, error: (data['error-codes'] || ['unknown']).join(',') };
  } catch (e) {
    return { success: false, error: 'verify-network-error' };
  }
}

export function getClientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) return xff.split(',')[0].trim();
  return req.socket?.remoteAddress || null;
}
