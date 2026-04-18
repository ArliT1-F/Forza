/**
 * Dixon-Coles Poisson engine.
 *
 * Classical Dixon & Coles (1997) model for soccer scores. Each team has:
 *   - an attack strength α_t (offensive rating, ~1.0 = league average)
 *   - a defense strength δ_t (defensive rating, ~1.0 = league average;
 *     we use the convention higher δ = weaker defense)
 *
 * Expected goals:
 *   λ_home = α_home * δ_away * H     (H = home advantage multiplier)
 *   λ_away = α_away * δ_home
 *
 * We then sample N scorelines from independent Poissons (Poisson(λ_home),
 * Poisson(λ_away)) and apply the Dixon-Coles low-score adjustment τ(x,y,λ,μ,ρ)
 * which decorrelates the 0-0, 1-0, 0-1 and 1-1 results that pure independent
 * Poissons over-predict. ρ is a small negative correlation parameter.
 *
 * Output is a full probability grid plus marginal win/draw/loss percentages
 * and the modal scoreline.
 */

import { MODEL_CONFIG } from '../lib/config.js';

/**
 * Sample once from a Poisson(λ) using Knuth's algorithm.
 * Good enough for λ < ~30 which easily covers soccer goals.
 * @param {number} lambda
 * @returns {number}
 */
export function poissonSample(lambda) {
  if (lambda <= 0) return 0;
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k += 1;
    p *= Math.random();
  } while (p > L);
  return k - 1;
}

/**
 * Exact Poisson PMF P(X = k | λ).
 * @param {number} k
 * @param {number} lambda
 * @returns {number}
 */
export function poissonPmf(k, lambda) {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  // log-space for numerical stability
  let logFact = 0;
  for (let i = 2; i <= k; i++) logFact += Math.log(i);
  return Math.exp(-lambda + k * Math.log(lambda) - logFact);
}

/**
 * Dixon-Coles low-score correction τ(x, y, λ, μ, ρ).
 * Only modifies the (0,0), (1,0), (0,1), (1,1) cells.
 * @param {number} x home goals
 * @param {number} y away goals
 * @param {number} lambda home expected goals
 * @param {number} mu away expected goals
 * @param {number} rho correlation parameter (typically in [-0.2, 0.0])
 * @returns {number}
 */
export function dixonColesTau(x, y, lambda, mu, rho) {
  if (x === 0 && y === 0) return 1 - lambda * mu * rho;
  if (x === 0 && y === 1) return 1 + lambda * rho;
  if (x === 1 && y === 0) return 1 + mu * rho;
  if (x === 1 && y === 1) return 1 - rho;
  return 1;
}

/**
 * Build the full scoreline probability matrix using exact PMF +
 * Dixon-Coles correction (deterministic, not Monte Carlo).
 * Rows = home goals (0..maxGoals), cols = away goals (0..maxGoals).
 * @param {number} lambda home expected goals
 * @param {number} mu away expected goals
 * @param {number} [rho=-0.1] low-score correlation
 * @param {number} [maxGoals=MODEL_CONFIG.maxGoals]
 * @returns {number[][]} normalized probability grid (sums to 1)
 */
export function scorelineMatrix(lambda, mu, rho = -0.1, maxGoals = MODEL_CONFIG.maxGoals) {
  const size = maxGoals + 1;
  const grid = Array.from({ length: size }, () => new Array(size).fill(0));
  let total = 0;
  for (let x = 0; x < size; x++) {
    const pHome = poissonPmf(x, lambda);
    for (let y = 0; y < size; y++) {
      const pAway = poissonPmf(y, mu);
      const p = pHome * pAway * dixonColesTau(x, y, lambda, mu, rho);
      const clipped = Math.max(0, p);
      grid[x][y] = clipped;
      total += clipped;
    }
  }
  if (total > 0) {
    for (let x = 0; x < size; x++) {
      for (let y = 0; y < size; y++) grid[x][y] /= total;
    }
  }
  return grid;
}

/**
 * Monte-Carlo simulate N scorelines. Used mostly for sanity-checking the
 * analytic matrix above and for producing a "stable" modal scoreline in
 * edge cases. Returns the same shape as scorelineMatrix.
 * @param {number} lambda
 * @param {number} mu
 * @param {number} [n=MODEL_CONFIG.simulations]
 * @param {number} [maxGoals=MODEL_CONFIG.maxGoals]
 * @returns {number[][]}
 */
export function simulateScorelines(
  lambda,
  mu,
  n = MODEL_CONFIG.simulations,
  maxGoals = MODEL_CONFIG.maxGoals,
) {
  const size = maxGoals + 1;
  const counts = Array.from({ length: size }, () => new Array(size).fill(0));
  for (let i = 0; i < n; i++) {
    const h = Math.min(poissonSample(lambda), maxGoals);
    const a = Math.min(poissonSample(mu), maxGoals);
    counts[h][a] += 1;
  }
  return counts.map((row) => row.map((c) => c / n));
}

/**
 * Summarize a scoreline matrix into (homeWin, draw, awayWin) and the modal
 * scoreline. Works with either analytic or MC output.
 * @param {number[][]} matrix
 * @returns {{homeWin:number, draw:number, awayWin:number, predictedScore:{home:number, away:number}}}
 */
export function summarizeMatrix(matrix) {
  let homeWin = 0;
  let draw = 0;
  let awayWin = 0;
  let best = 0;
  let bestHome = 0;
  let bestAway = 0;
  for (let x = 0; x < matrix.length; x++) {
    for (let y = 0; y < matrix[x].length; y++) {
      const p = matrix[x][y];
      if (x > y) homeWin += p;
      else if (x === y) draw += p;
      else awayWin += p;
      if (p > best) {
        best = p;
        bestHome = x;
        bestAway = y;
      }
    }
  }
  return {
    homeWin,
    draw,
    awayWin,
    predictedScore: { home: bestHome, away: bestAway },
  };
}

/**
 * Full prediction for a single fixture.
 *
 * @param {object} params
 * @param {{attack:number, defense:number}} params.home
 * @param {{attack:number, defense:number}} params.away
 * @param {number} [params.homeAdvantage=MODEL_CONFIG.homeAdvantage]
 * @param {number} [params.rho=-0.1]
 * @returns {{
 *   lambdaHome:number,
 *   lambdaAway:number,
 *   matrix:number[][],
 *   homeWin:number,
 *   draw:number,
 *   awayWin:number,
 *   predictedScore:{home:number, away:number}
 * }}
 */
export function predictFixture({
  home,
  away,
  homeAdvantage = MODEL_CONFIG.homeAdvantage,
  rho = -0.1,
}) {
  const lambdaHome = Math.max(0.05, home.attack * away.defense * homeAdvantage);
  const lambdaAway = Math.max(0.05, away.attack * home.defense);
  const matrix = scorelineMatrix(lambdaHome, lambdaAway, rho);
  const summary = summarizeMatrix(matrix);
  return {
    lambdaHome,
    lambdaAway,
    matrix,
    ...summary,
  };
}

/**
 * Maximum-likelihood re-estimation of team attack/defense parameters from
 * a list of finished matches. We use a closed-form scaled-ratio estimator,
 * which is a good approximation for small datasets and is dramatically
 * cheaper than iterative MLE. For each team t:
 *
 *   attack_t   = (goals scored by t) / (expected avg goals scored per match)
 *   defense_t  = (goals conceded by t) / (expected avg goals conceded per match)
 *
 * Parameters are scaled so league-average attack and defense ≈ 1.0.
 *
 * @param {Array<{homeTeamId:(string|number), awayTeamId:(string|number),
 *                homeGoals:number, awayGoals:number, leagueId?:(string|number)}>} matches
 * @returns {Record<string, {leagueId: (string|number|null), attack:number, defense:number, matches:number}>}
 */
export function fitTeamParameters(matches) {
  if (!matches || matches.length === 0) return {};

  let totalHomeGoals = 0;
  let totalAwayGoals = 0;
  for (const m of matches) {
    totalHomeGoals += m.homeGoals;
    totalAwayGoals += m.awayGoals;
  }
  const n = matches.length;
  const avgHome = totalHomeGoals / n || 1;
  const avgAway = totalAwayGoals / n || 1;

  /** @type {Record<string, {leagueId: any, scored:number, conceded:number, played:number}>} */
  const agg = {};
  for (const m of matches) {
    if (!agg[m.homeTeamId]) {
      agg[m.homeTeamId] = { leagueId: m.leagueId ?? null, scored: 0, conceded: 0, played: 0 };
    }
    if (!agg[m.awayTeamId]) {
      agg[m.awayTeamId] = { leagueId: m.leagueId ?? null, scored: 0, conceded: 0, played: 0 };
    }
    agg[m.homeTeamId].scored += m.homeGoals;
    agg[m.homeTeamId].conceded += m.awayGoals;
    agg[m.homeTeamId].played += 1;
    agg[m.awayTeamId].scored += m.awayGoals;
    agg[m.awayTeamId].conceded += m.homeGoals;
    agg[m.awayTeamId].played += 1;
  }

  /** @type {Record<string, {leagueId:any, attack:number, defense:number, matches:number}>} */
  const params = {};
  for (const [tid, t] of Object.entries(agg)) {
    if (t.played < MODEL_CONFIG.minMatchesForFit) {
      params[tid] = {
        leagueId: t.leagueId,
        attack: MODEL_CONFIG.defaultAttack,
        defense: MODEL_CONFIG.defaultDefense,
        matches: t.played,
      };
      continue;
    }
    const scoredPer = t.scored / t.played;
    const concededPer = t.conceded / t.played;
    // Use average of avgHome & avgAway as league baseline per side.
    const baselineScored = (avgHome + avgAway) / 2;
    const baselineConceded = baselineScored;
    params[tid] = {
      leagueId: t.leagueId,
      attack: Number((scoredPer / baselineScored).toFixed(4)),
      defense: Number((concededPer / baselineConceded).toFixed(4)),
      matches: t.played,
    };
  }
  return params;
}
