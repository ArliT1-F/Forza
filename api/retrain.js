/**
 * POST/GET /api/retrain  (Vercel Cron: daily 03:00 UTC)
 *
 * 1. Join `predictions_log` with `match_results` to get every finished match
 *    we have both a prediction and an actual outcome for.
 * 2. Re-estimate per-team attack/defense parameters via the scaled-ratio
 *    estimator in /src/engine/poisson.js.
 * 3. Insert the new weights as a new `model_version` in `model_weights`.
 * 4. Keep only the last N versions (configurable, default 10) for rollback.
 *
 * Note: this file imports from the shared engine module via a relative path.
 * Vercel's Node runtime bundles it fine as long as the import is ESM.
 */

import { fitTeamParameters } from '../src/engine/poisson.js';
import { MODEL_CONFIG } from '../src/lib/config.js';
import { serverSupabase } from './_lib/supabase.js';
import { verifyCron } from './_lib/auth.js';

export default async function handler(req, res) {
  if (!verifyCron(req)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const sb = serverSupabase();

    // Pull matched (prediction + result) pairs. The predictions_log table
    // already stores team IDs and league IDs so we don't need to join.
    const { data: results, error: resultsErr } = await sb
      .from('match_results')
      .select('match_id, actual_home_goals, actual_away_goals');
    if (resultsErr) throw resultsErr;

    if (!results || results.length === 0) {
      res.status(200).json({ ok: true, skipped: 'no results yet' });
      return;
    }

    const resultByMatch = new Map(results.map((r) => [String(r.match_id), r]));
    const matchIds = [...resultByMatch.keys()];

    const { data: logs, error: logsErr } = await sb
      .from('predictions_log')
      .select('match_id, league_id, home_team_id, away_team_id')
      .in('match_id', matchIds);
    if (logsErr) throw logsErr;

    const matches = [];
    for (const l of logs || []) {
      const r = resultByMatch.get(String(l.match_id));
      if (!r) continue;
      matches.push({
        homeTeamId: String(l.home_team_id),
        awayTeamId: String(l.away_team_id),
        leagueId: l.league_id != null ? String(l.league_id) : null,
        homeGoals: r.actual_home_goals,
        awayGoals: r.actual_away_goals,
      });
    }

    if (matches.length === 0) {
      res.status(200).json({ ok: true, skipped: 'no matched pairs' });
      return;
    }

    const params = fitTeamParameters(matches);
    const modelVersion = `v${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${matches.length}`;

    const rows = Object.entries(params).map(([teamId, p]) => ({
      team_id: teamId,
      league_id: p.leagueId,
      attack_strength: p.attack,
      defense_strength: p.defense,
      matches_trained_on: p.matches,
      model_version: modelVersion,
      created_at: new Date().toISOString(),
    }));

    const { error: insErr } = await sb.from('model_weights').insert(rows);
    if (insErr) throw insErr;

    // Prune old versions, keep the most recent N.
    const { data: versions } = await sb
      .from('model_weights')
      .select('model_version, created_at')
      .order('created_at', { ascending: false });
    const uniqueVersions = [...new Set((versions || []).map((v) => v.model_version))];
    const toDelete = uniqueVersions.slice(MODEL_CONFIG.keepWeightVersions);
    if (toDelete.length > 0) {
      await sb.from('model_weights').delete().in('model_version', toDelete);
    }

    res.status(200).json({
      ok: true,
      modelVersion,
      teamsFit: rows.length,
      matchesUsed: matches.length,
      pruned: toDelete.length,
    });
  } catch (err) {
    console.error('[api/retrain]', err.message);
    res.status(500).json({ error: err.message });
  }
}
