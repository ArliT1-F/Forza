/**
 * API-Football normalized adapter.
 *
 * All calls go through our own Vercel serverless routes /api/fixtures and
 * /api/predictions so the `x-apisports-key` secret never ships to the browser
 * and CORS is not an issue.
 *
 * The adapter exposes a small DataProvider interface used by the React app:
 *
 *   listFixtures({ date, live, leagueIds }) -> NormalizedMatch[]
 *   getPrediction(matchId)                  -> { homeWin, draw, awayWin, ... }
 *
 * A "NormalizedMatch" looks like:
 *   {
 *     matchId, league { id, name, logo }, homeTeam { id, name, logo },
 *     awayTeam { id, name, logo }, status, minute, score { home, away },
 *     prediction { homeWin, draw, awayWin, predictedScore, confidence, modelVersion }
 *   }
 */

import { predictFixture, fitTeamParameters } from '../engine/poisson.js';
import {
  computeConfidence,
  modelAgreement,
  h2hConsistency,
  recentFormDelta,
  calibrationBonus,
  combineConfidence,
} from '../engine/confidence.js';
import { LEAGUE_IDS, MODEL_CONFIG } from '../lib/config.js';

const NAME = 'apifootball';

/**
 * Transform an API-Football fixture object into our canonical shape.
 * Prediction is initially null; it gets filled by the caller after a
 * Poisson + /predictions blend.
 *
 * API-Football fixture shape (partial):
 *   { fixture: { id, status: { short, elapsed } }, league: { id, name, logo },
 *     teams: { home: { id, name, logo }, away: { id, name, logo } },
 *     goals: { home, away } }
 *
 * @param {any} raw
 * @returns {import('./types.js').NormalizedMatch}
 */
export function normalizeFixture(raw) {
  const statusShort = raw?.fixture?.status?.short || 'NS';
  const status =
    statusShort === 'NS' || statusShort === 'TBD'
      ? 'NS'
      : statusShort === 'FT' ||
          statusShort === 'AET' ||
          statusShort === 'PEN' ||
          statusShort === 'AWD' ||
          statusShort === 'WO'
        ? 'FT'
        : 'LIVE';

  return {
    matchId: String(raw?.fixture?.id ?? ''),
    provider: NAME,
    kickoff: raw?.fixture?.date ?? null,
    league: {
      id: raw?.league?.id ?? null,
      name: raw?.league?.name ?? '',
      logo: raw?.league?.logo ?? '',
    },
    homeTeam: {
      id: raw?.teams?.home?.id ?? null,
      name: raw?.teams?.home?.name ?? '',
      logo: raw?.teams?.home?.logo ?? '',
    },
    awayTeam: {
      id: raw?.teams?.away?.id ?? null,
      name: raw?.teams?.away?.name ?? '',
      logo: raw?.teams?.away?.logo ?? '',
    },
    status,
    minute: status === 'LIVE' ? raw?.fixture?.status?.elapsed ?? null : null,
    score: {
      home: raw?.goals?.home ?? null,
      away: raw?.goals?.away ?? null,
    },
    prediction: null, // filled in later
  };
}

/**
 * Fetch fixtures via our own serverless proxy. The proxy handles the
 * API-Football key and basic caching.
 *
 * @param {{date?:string, live?:boolean, leagueIds?:number[]}} [opts]
 * @returns {Promise<import('./types.js').NormalizedMatch[]>}
 */
export async function listFixtures(opts = {}) {
  const params = new URLSearchParams();
  if (opts.date) params.set('date', opts.date);
  if (opts.live) params.set('live', 'all');
  const leagues = opts.leagueIds || LEAGUE_IDS;
  params.set('leagues', leagues.join(','));

  const res = await fetch(`/api/fixtures?${params.toString()}`);
  if (!res.ok) {
    // Graceful degradation: caller is expected to fall back to Supabase.
    const text = await res.text().catch(() => '');
    throw new Error(`[apifootball] fixtures ${res.status}: ${text}`);
  }
  const { data } = await res.json();
  return (data || []).map(normalizeFixture);
}

/**
 * Fetch API-Football's bookmaker-style /predictions endpoint for one fixture.
 * We use this as one of the inputs to our confidence scorer; we don't
 * display their probabilities directly.
 *
 * @param {string|number} matchId
 * @returns {Promise<{homeWin:number, draw:number, awayWin:number}|null>}
 */
export async function getExternalPrediction(matchId) {
  try {
    const res = await fetch(`/api/predictions?fixture=${encodeURIComponent(String(matchId))}`);
    if (!res.ok) return null;
    const { data } = await res.json();
    const p = data?.[0]?.predictions?.percent;
    if (!p) return null;
    return {
      homeWin: toProb(p.home),
      draw: toProb(p.draw),
      awayWin: toProb(p.away),
    };
  } catch {
    return null;
  }
}

function toProb(v) {
  if (v === null || v === undefined) return 0;
  const n = typeof v === 'string' ? parseFloat(v.replace('%', '')) : Number(v);
  return Number.isFinite(n) ? n / 100 : 0;
}

/**
 * Enrich a normalized match with a Poisson prediction and a blended
 * confidence score. Team parameters come from the supplied `weights` map
 * (output of `fitTeamParameters`). If a team is missing, we fall back to
 * league-average defaults.
 *
 * @param {import('./types.js').NormalizedMatch} match
 * @param {object} extras
 * @param {Record<string, {attack:number, defense:number}>} extras.weights
 * @param {string} extras.modelVersion
 * @param {{homeWin:number, draw:number, awayWin:number}|null} [extras.externalPrediction]
 * @param {{goalDiff:number}[]} [extras.h2h]
 * @param {{points:number}[]} [extras.homeLast5]
 * @param {{points:number}[]} [extras.awayLast5]
 * @param {{band:string, accuracy:number}|null} [extras.calibration]
 * @returns {import('./types.js').NormalizedMatch}
 */
export function attachPrediction(match, extras) {
  const { weights, modelVersion, externalPrediction, h2h, homeLast5, awayLast5, calibration } =
    extras;
  const home =
    weights[match.homeTeam.id] || {
      attack: MODEL_CONFIG.defaultAttack,
      defense: MODEL_CONFIG.defaultDefense,
    };
  const away =
    weights[match.awayTeam.id] || {
      attack: MODEL_CONFIG.defaultAttack,
      defense: MODEL_CONFIG.defaultDefense,
    };

  const p = predictFixture({ home, away });

  const confidence = combineConfidence({
    modelAgreement: modelAgreement(
      { homeWin: p.homeWin, draw: p.draw, awayWin: p.awayWin },
      externalPrediction,
    ),
    h2hConsistency: h2hConsistency(h2h),
    recentFormDelta: recentFormDelta(homeLast5, awayLast5),
    calibrationBonus: calibrationBonus(calibration),
  });

  return {
    ...match,
    prediction: {
      homeWin: Number(p.homeWin.toFixed(4)),
      draw: Number(p.draw.toFixed(4)),
      awayWin: Number(p.awayWin.toFixed(4)),
      predictedScore: p.predictedScore,
      confidence,
      modelVersion,
      matrix: p.matrix,
    },
  };
}

export { fitTeamParameters, computeConfidence };
export const apifootballProvider = {
  name: NAME,
  listFixtures,
  getExternalPrediction,
  normalizeFixture,
  attachPrediction,
};
