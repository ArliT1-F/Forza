/**
 * POST/GET /api/ingest-results  (Vercel Cron: daily 02:00 UTC)
 *
 * 1. Fetch all fixtures with status FT from yesterday across our covered leagues.
 * 2. For each FT fixture that exists in `predictions_log` but NOT yet in
 *    `match_results`, insert the actual scoreline + outcome.
 *
 * Returns { inserted, seen, skipped }.
 */

import { fetchFixturesForLeagues } from './_lib/apifootball.js';
import { serverSupabase } from './_lib/supabase.js';
import { verifyCron } from './_lib/auth.js';

const LEAGUE_IDS = [39, 140, 135, 78, 61, 2, 3, 253, 71, 88, 94, 203];

export default async function handler(req, res) {
  if (!verifyCron(req)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const yesterday = new Date(Date.now() - 24 * 3600_000).toISOString().slice(0, 10);
    const fixtures = await fetchFixturesForLeagues({ date: yesterday, leagueIds: LEAGUE_IDS });

    const ft = fixtures.filter((f) => {
      const s = f?.fixture?.status?.short;
      return s === 'FT' || s === 'AET' || s === 'PEN';
    });

    const sb = serverSupabase();

    // Only insert results for matches we actually predicted.
    const matchIds = ft.map((f) => String(f?.fixture?.id)).filter(Boolean);
    const { data: logged } = await sb
      .from('predictions_log')
      .select('match_id')
      .in('match_id', matchIds);
    const loggedSet = new Set((logged || []).map((r) => String(r.match_id)));

    const { data: existing } = await sb
      .from('match_results')
      .select('match_id')
      .in('match_id', matchIds);
    const existingSet = new Set((existing || []).map((r) => String(r.match_id)));

    const toInsert = ft
      .filter((f) => loggedSet.has(String(f.fixture.id)) && !existingSet.has(String(f.fixture.id)))
      .map((f) => {
        const home = f?.goals?.home ?? 0;
        const away = f?.goals?.away ?? 0;
        const outcome = home > away ? 'home' : home < away ? 'away' : 'draw';
        return {
          match_id: String(f.fixture.id),
          actual_home_goals: home,
          actual_away_goals: away,
          actual_outcome: outcome,
          created_at: new Date().toISOString(),
        };
      });

    if (toInsert.length > 0) {
      const { error } = await sb.from('match_results').insert(toInsert);
      if (error) throw error;
    }

    res.status(200).json({
      ok: true,
      inserted: toInsert.length,
      seen: ft.length,
      skipped: ft.length - toInsert.length,
      date: yesterday,
    });
  } catch (err) {
    console.error('[api/ingest-results]', err.message);
    res.status(500).json({ error: err.message });
  }
}
