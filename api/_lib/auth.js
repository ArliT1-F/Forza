/**
 * Cron secret verification. Every cron handler should call this first.
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET` by convention.
 */

/**
 * @param {import('@vercel/node').VercelRequest} req
 * @returns {boolean}
 */
export function verifyCron(req) {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const header = req.headers['authorization'] || req.headers['Authorization'];
  if (typeof header === 'string' && header === `Bearer ${expected}`) return true;
  // Vercel also supports sending ?secret=... for easier local testing.
  const qs = (req.query && req.query.secret) || null;
  return qs === expected;
}
