/**
 * GET /api/fixtures
 *
 * Proxies API-Football `/fixtures` and fans out across configured leagues.
 * Query params:
 *   date     YYYY-MM-DD (defaults to today UTC)
 *   live     "all" (optional) → returns currently LIVE fixtures only
 *   leagues  comma-separated numeric league IDs (defaults to all covered)
 *
 * Response shape: { data: any[], source: "apifootball"|"supabase", fetchedAt }
 *
 * Graceful degradation: if API-Football errors or quota is exceeded, we
 * fall back to the last cached snapshot in the Supabase `fixtures_cache`
 * table (optional — created lazily on first successful fetch).
 */

import { fetchFixturesForLeagues } from './_lib/apifootball.js';
import { serverSupabase } from './_lib/supabase.js';

const DEFAULT_LEAGUES = [39, 140, 135, 78, 61, 2, 3, 253, 71, 88, 94, 203];

export default async function handler(req, res) {
  const date = (req.query.date && String(req.query.date)) || new Date().toISOString().slice(0, 10);
  const live = req.query.live === 'all' || req.query.live === 'true';
  const leaguesParam = req.query.leagues ? String(req.query.leagues) : '';
  const leagueIds = leaguesParam
    ? leaguesParam.split(',').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n))
    : DEFAULT_LEAGUES;

  try {
    const data = await fetchFixturesForLeagues({ date, leagueIds, live });

    // Fire-and-forget cache update so graceful degradation has something to serve.
    try {
      const sb = serverSupabase();
      await sb.from('fixtures_cache').upsert(
        {
          cache_key: `${date}:${live ? 'live' : 'scheduled'}:${leagueIds.join(',')}`,
          payload: data,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'cache_key' },
      );
    } catch (e) {
      // Supabase is optional for the cache; log and carry on.
      console.warn('[api/fixtures] cache write failed:', e.message);
    }

    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=120');
    res.status(200).json({ data, source: 'apifootball', fetchedAt: new Date().toISOString() });
  } catch (err) {
    console.error('[api/fixtures]', err.message);
    // Try serving last-known cache.
    try {
      const sb = serverSupabase();
      const { data: row } = await sb
        .from('fixtures_cache')
        .select('payload, updated_at')
        .eq('cache_key', `${date}:${live ? 'live' : 'scheduled'}:${leagueIds.join(',')}`)
        .maybeSingle();
      if (row) {
        res.status(200).json({
          data: row.payload,
          source: 'supabase-cache',
          fetchedAt: row.updated_at,
          degraded: true,
        });
        return;
      }
    } catch (e) {
      console.warn('[api/fixtures] cache fallback failed:', e.message);
    }
    res.status(502).json({ error: err.message, degraded: true });
  }
}
