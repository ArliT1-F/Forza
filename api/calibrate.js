/**
 * POST/GET /api/calibrate  (Vercel Cron: daily 04:00 UTC)
 *
 * 1. Join every prediction with its actual outcome and compute the
 *    three summary metrics (Brier score, outcome accuracy, avg goal error).
 * 2. Write one row per evaluation to `model_performance`.
 * 3. If the newest model version performs worse than the previous best by
 *    Brier score, mark the previous best as active (auto-rollback).
 *
 * The "active" version is stored in `model_performance.is_active = true`.
 * Readers (the /api/fixtures path + engine) use the most-recent active
 * version to decide which weights to load.
 */

import { evaluatePredictions, compareModels } from '../src/engine/calibration.js';
import { serverSupabase } from './_lib/supabase.js';
import { verifyCron } from './_lib/auth.js';

export default async function handler(req, res) {
  if (!verifyCron(req)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const sb = serverSupabase();

    const { data: results, error: resultsErr } = await sb
      .from('match_results')
      .select('match_id, actual_home_goals, actual_away_goals, actual_outcome');
    if (resultsErr) throw resultsErr;
    if (!results || results.length === 0) {
      res.status(200).json({ ok: true, skipped: 'no results yet' });
      return;
    }

    const resultByMatch = new Map(results.map((r) => [String(r.match_id), r]));
    const { data: logs, error: logsErr } = await sb
      .from('predictions_log')
      .select(
        'match_id, model_version, prob_home_win, prob_draw, prob_away_win, predicted_home_goals, predicted_away_goals, confidence',
      )
      .in('match_id', [...resultByMatch.keys()]);
    if (logsErr) throw logsErr;

    // Group by model version so we can produce one performance row per version.
    /** @type {Record<string, any[]>} */
    const byVersion = {};
    for (const l of logs || []) {
      const r = resultByMatch.get(String(l.match_id));
      if (!r) continue;
      const v = l.model_version || 'unknown';
      (byVersion[v] ??= []).push({
        probHomeWin: Number(l.prob_home_win),
        probDraw: Number(l.prob_draw),
        probAwayWin: Number(l.prob_away_win),
        predictedHomeGoals: Number(l.predicted_home_goals),
        predictedAwayGoals: Number(l.predicted_away_goals),
        actualOutcome: r.actual_outcome,
        actualHomeGoals: r.actual_home_goals,
        actualAwayGoals: r.actual_away_goals,
        confidence: Number(l.confidence),
      });
    }

    const rows = [];
    /** @type {{version:string, eval: ReturnType<typeof evaluatePredictions>}[]} */
    const versionEvals = [];
    for (const [version, pairs] of Object.entries(byVersion)) {
      const evalResult = evaluatePredictions(pairs);
      versionEvals.push({ version, eval: evalResult });
      rows.push({
        model_version: version,
        brier_score: evalResult.brierScore,
        outcome_accuracy: evalResult.outcomeAccuracy,
        avg_goal_error: evalResult.avgGoalError,
        sample_size: evalResult.sampleSize,
        evaluated_at: new Date().toISOString(),
        is_active: false, // we set it below
      });
    }

    if (rows.length === 0) {
      res.status(200).json({ ok: true, skipped: 'no matched pairs' });
      return;
    }

    // Pick the best version by comparator (Brier, then accuracy, then N).
    versionEvals.sort((a, b) =>
      compareModels(
        { brierScore: a.eval.brierScore, outcomeAccuracy: a.eval.outcomeAccuracy, sampleSize: a.eval.sampleSize },
        { brierScore: b.eval.brierScore, outcomeAccuracy: b.eval.outcomeAccuracy, sampleSize: b.eval.sampleSize },
      ),
    );
    const bestVersion = versionEvals[0]?.version;
    const activeRow = rows.find((r) => r.model_version === bestVersion);
    if (activeRow) activeRow.is_active = true;

    // Flip the active flag: we only ever mark the current best row as active.
    const { error: insErr } = await sb.from('model_performance').insert(rows);
    if (insErr) throw insErr;
    await sb.from('model_performance').update({ is_active: false }).neq('model_version', bestVersion);

    res.status(200).json({
      ok: true,
      evaluated: rows.length,
      activeVersion: bestVersion,
    });
  } catch (err) {
    console.error('[api/calibrate]', err.message);
    res.status(500).json({ error: err.message });
  }
}
