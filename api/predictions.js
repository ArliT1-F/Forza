/**
 * GET /api/predictions?fixture=<id>
 *
 * Proxies API-Football's `/predictions` endpoint for a single fixture.
 * We use its bookmaker-style output as ONE of the inputs to our own
 * confidence scorer; we don't display their numbers directly.
 *
 * Response: { data: any[], fetchedAt }
 */

import { apifootballGet } from './_lib/apifootball.js';

export default async function handler(req, res) {
  const fixture = req.query.fixture ? String(req.query.fixture) : '';
  if (!fixture) {
    res.status(400).json({ error: 'Missing `fixture` query param' });
    return;
  }
  try {
    const json = await apifootballGet(`/predictions?fixture=${encodeURIComponent(fixture)}`);
    res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=600');
    res.status(200).json({ data: json?.response ?? [], fetchedAt: new Date().toISOString() });
  } catch (err) {
    console.error('[api/predictions]', err.message);
    res.status(err.status || 502).json({ error: err.message });
  }
}
