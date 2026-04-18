/**
 * Confidence scorer.
 *
 * Blends four signals into a single 0-100 number that answers
 * "how trustworthy is this particular prediction?":
 *
 *   confidence = 0.4 * model_agreement
 *              + 0.3 * h2h_consistency
 *              + 0.2 * recent_form_delta
 *              + 0.1 * calibration_bonus
 *
 * All four inputs are normalised to [0, 100] before weighting.
 */

/**
 * How closely our Poisson model agrees with the API-Football /predictions
 * endpoint on the outright winner. 100 when both pick the same side with
 * similar probability mass; 0 when they disagree.
 *
 * @param {{homeWin:number, draw:number, awayWin:number}} ours probabilities in [0,1]
 * @param {{homeWin:number, draw:number, awayWin:number}|null} theirs probabilities in [0,1]
 * @returns {number} 0..100
 */
export function modelAgreement(ours, theirs) {
  if (!theirs) {
    // No external prediction → fall back to our own "peakiness".
    const top = Math.max(ours.homeWin, ours.draw, ours.awayWin);
    return Math.round(clamp01(top) * 100);
  }
  // L1 distance between the two probability distributions, inverted.
  const d =
    Math.abs(ours.homeWin - theirs.homeWin) +
    Math.abs(ours.draw - theirs.draw) +
    Math.abs(ours.awayWin - theirs.awayWin);
  // d ∈ [0, 2]; map to [100, 0]
  return Math.round((1 - d / 2) * 100);
}

/**
 * How predictable past head-to-head results have been. Low variance in the
 * H2H goal difference => high score. Expects an array of objects with a
 * `goalDiff` field (home_goals - away_goals from the home team's POV).
 *
 * @param {{goalDiff:number}[]} h2h
 * @returns {number} 0..100
 */
export function h2hConsistency(h2h) {
  if (!h2h || h2h.length < 2) return 50; // neutral prior
  const diffs = h2h.map((m) => m.goalDiff);
  const mean = diffs.reduce((a, b) => a + b, 0) / diffs.length;
  const variance = diffs.reduce((a, b) => a + (b - mean) ** 2, 0) / diffs.length;
  // Variance in goal-difference typically ranges [0, 9+]. Map to 0..100.
  const score = 100 * Math.exp(-variance / 4);
  return Math.round(clamp(score, 0, 100));
}

/**
 * Points differential over the last 5 matches per team (3/1/0). Bigger gap
 * between the two teams => higher predictability of the matchup.
 *
 * @param {{points:number}[]} homeLast5
 * @param {{points:number}[]} awayLast5
 * @returns {number} 0..100
 */
export function recentFormDelta(homeLast5, awayLast5) {
  const hp = (homeLast5 || []).reduce((a, b) => a + (b.points || 0), 0);
  const ap = (awayLast5 || []).reduce((a, b) => a + (b.points || 0), 0);
  // |Δ points| ∈ [0, 15]; map to [0, 100].
  const delta = Math.abs(hp - ap);
  return Math.round(clamp((delta / 15) * 100, 0, 100));
}

/**
 * Historical accuracy bonus for predictions that had a *similar* raw
 * confidence in the past. Expects a summary object from Supabase like:
 *   { band: "HIGH" | "MEDIUM" | "LOW", accuracy: 0..1 }
 *
 * @param {{band:string, accuracy:number}|null} calib
 * @returns {number} 0..100
 */
export function calibrationBonus(calib) {
  if (!calib) return 50; // neutral prior
  return Math.round(clamp01(calib.accuracy) * 100);
}

/**
 * Weighted blend. All inputs are [0,100]; output is [0,100].
 *
 * @param {object} parts
 * @param {number} parts.modelAgreement
 * @param {number} parts.h2hConsistency
 * @param {number} parts.recentFormDelta
 * @param {number} parts.calibrationBonus
 * @returns {number}
 */
export function combineConfidence({
  modelAgreement: ma,
  h2hConsistency: hh,
  recentFormDelta: rf,
  calibrationBonus: cb,
}) {
  const raw = 0.4 * ma + 0.3 * hh + 0.2 * rf + 0.1 * cb;
  return Math.round(clamp(raw, 0, 100));
}

/**
 * One-call helper used by providers when all inputs are already normalized.
 * @param {object} inputs
 * @returns {number}
 */
export function computeConfidence(inputs) {
  return combineConfidence({
    modelAgreement: modelAgreement(inputs.ours, inputs.theirs),
    h2hConsistency: h2hConsistency(inputs.h2h),
    recentFormDelta: recentFormDelta(inputs.homeLast5, inputs.awayLast5),
    calibrationBonus: calibrationBonus(inputs.calibration),
  });
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}
function clamp01(v) {
  return clamp(v, 0, 1);
}
