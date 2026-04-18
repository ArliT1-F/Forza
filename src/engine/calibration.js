/**
 * Calibration & Brier score tracking.
 *
 * Given N past (prediction, actual outcome) pairs, we compute:
 *
 *   Brier score  = mean over all predictions of
 *                   Σ_c (p_c − 1{c == actual})²
 *                  for c ∈ {home, draw, away}.
 *                  Range 0..2, lower is better. 0 = perfect.
 *
 *   Outcome accuracy = fraction of predictions whose argmax outcome
 *                      matched the actual outcome.
 *
 *   Avg goal error   = mean absolute error between predicted scoreline
 *                      and actual scoreline (home MAE + away MAE, averaged).
 *
 * These numbers drive the "self-improving" loop: a retrained model is
 * only promoted if its Brier score improves on the previous champion.
 */

/**
 * @param {Array<{
 *   probHomeWin:number, probDraw:number, probAwayWin:number,
 *   predictedHomeGoals:number, predictedAwayGoals:number,
 *   actualOutcome:'home'|'draw'|'away',
 *   actualHomeGoals:number, actualAwayGoals:number,
 *   confidence?:number,
 * }>} pairs
 * @returns {{
 *   brierScore:number,
 *   outcomeAccuracy:number,
 *   avgGoalError:number,
 *   sampleSize:number,
 *   byBand: Record<'LOW'|'MEDIUM'|'HIGH', {accuracy:number, n:number}>
 * }}
 */
export function evaluatePredictions(pairs) {
  if (!pairs || pairs.length === 0) {
    return {
      brierScore: 0,
      outcomeAccuracy: 0,
      avgGoalError: 0,
      sampleSize: 0,
      byBand: { LOW: { accuracy: 0, n: 0 }, MEDIUM: { accuracy: 0, n: 0 }, HIGH: { accuracy: 0, n: 0 } },
    };
  }

  let brier = 0;
  let correct = 0;
  let goalErr = 0;

  const bands = {
    LOW: { ok: 0, n: 0 },
    MEDIUM: { ok: 0, n: 0 },
    HIGH: { ok: 0, n: 0 },
  };

  for (const p of pairs) {
    const actual = p.actualOutcome;
    const oneHot = {
      home: actual === 'home' ? 1 : 0,
      draw: actual === 'draw' ? 1 : 0,
      away: actual === 'away' ? 1 : 0,
    };
    const sqErr =
      (p.probHomeWin - oneHot.home) ** 2 +
      (p.probDraw - oneHot.draw) ** 2 +
      (p.probAwayWin - oneHot.away) ** 2;
    brier += sqErr;

    const predicted =
      p.probHomeWin >= p.probDraw && p.probHomeWin >= p.probAwayWin
        ? 'home'
        : p.probAwayWin >= p.probDraw
          ? 'away'
          : 'draw';
    const isCorrect = predicted === actual;
    if (isCorrect) correct += 1;

    goalErr +=
      Math.abs(p.predictedHomeGoals - p.actualHomeGoals) +
      Math.abs(p.predictedAwayGoals - p.actualAwayGoals);

    const band = confidenceBand(p.confidence);
    if (band) {
      bands[band].n += 1;
      if (isCorrect) bands[band].ok += 1;
    }
  }

  const n = pairs.length;
  return {
    brierScore: Number((brier / n).toFixed(4)),
    outcomeAccuracy: Number((correct / n).toFixed(4)),
    avgGoalError: Number((goalErr / (2 * n)).toFixed(4)),
    sampleSize: n,
    byBand: {
      LOW: { accuracy: bands.LOW.n ? bands.LOW.ok / bands.LOW.n : 0, n: bands.LOW.n },
      MEDIUM: {
        accuracy: bands.MEDIUM.n ? bands.MEDIUM.ok / bands.MEDIUM.n : 0,
        n: bands.MEDIUM.n,
      },
      HIGH: { accuracy: bands.HIGH.n ? bands.HIGH.ok / bands.HIGH.n : 0, n: bands.HIGH.n },
    },
  };
}

/**
 * @param {number|undefined} c
 * @returns {'LOW'|'MEDIUM'|'HIGH'|null}
 */
export function confidenceBand(c) {
  if (c === undefined || c === null || Number.isNaN(c)) return null;
  if (c < 50) return 'LOW';
  if (c < 70) return 'MEDIUM';
  return 'HIGH';
}

/**
 * Compare two evaluation summaries. Lower Brier wins. Ties are broken by
 * outcome accuracy, then by sample size (more samples is more trustworthy).
 *
 * @param {{brierScore:number, outcomeAccuracy:number, sampleSize:number}} a
 * @param {{brierScore:number, outcomeAccuracy:number, sampleSize:number}} b
 * @returns {number} negative when a is better, positive when b is better
 */
export function compareModels(a, b) {
  if (a.brierScore !== b.brierScore) return a.brierScore - b.brierScore;
  if (a.outcomeAccuracy !== b.outcomeAccuracy) return b.outcomeAccuracy - a.outcomeAccuracy;
  return b.sampleSize - a.sampleSize;
}
