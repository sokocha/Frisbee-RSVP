import { validateSlug, isSlugTaken } from '../../../lib/organizations';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { slug } = req.query;

  if (!slug) {
    return res.status(400).json({ error: 'Slug is required' });
  }

  // Validate format
  const validation = validateSlug(slug);
  if (!validation.valid) {
    return res.status(200).json({
      available: false,
      error: validation.error,
    });
  }

  // Check availability
  const taken = await isSlugTaken(validation.normalized);

  return res.status(200).json({
    available: !taken,
    normalized: validation.normalized,
    error: taken ? 'This slug is already taken' : null,
  });
}
