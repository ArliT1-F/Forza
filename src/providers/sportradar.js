/**
 * SportRadar normalized adapter — STUBBED, ready to activate.
 *
 * To enable: set PROVIDER=sportradar and SPORTRADAR_KEY in the environment.
 * You'll also need to wire a matching serverless route (not included by
 * default to avoid stray calls to their API). Output shape is identical to
 * the API-Football adapter so the rest of the app does not care which
 * provider is active.
 *
 * SportRadar schedules/live endpoints (Soccer v4):
 *   GET /schedules/live/summaries.json
 *   GET /schedules/{YYYY-MM-DD}/summaries.json
 *   GET /sport_events/{id}/summary.json
 *
 * Auth: ?api_key=...
 */

import { predictFixture } from '../engine/poisson.js';
import { combineConfidence } from '../engine/confidence.js';
import { MODEL_CONFIG } from '../lib/config.js';

const NAME = 'sportradar';

/**
 * @param {any} raw a SportRadar `sport_event` summary
 * @returns {import('./types.js').NormalizedMatch}
 */
export function normalizeFixture(raw) {
  const sportEvent = raw?.sport_event ?? raw;
  const status = mapStatus(raw?.sport_event_status?.status);
  const competitors = sportEvent?.competitors ?? [];
  const home = competitors.find((c) => c?.qualifier === 'home') || {};
  const away = competitors.find((c) => c?.qualifier === 'away') || {};
  return {
    matchId: String(sportEvent?.id ?? ''),
    provider: NAME,
    kickoff: sportEvent?.start_time ?? null,
    league: {
      id: sportEvent?.tournament?.id ?? null,
      name: sportEvent?.tournament?.name ?? '',
      logo: '', // SportRadar doesn't ship league logos directly
    },
    homeTeam: { id: home.id ?? null, name: home.name ?? '', logo: '' },
    awayTeam: { id: away.id ?? null, name: away.name ?? '', logo: '' },
    status,
    minute: status === 'LIVE' ? raw?.sport_event_status?.clock?.played ?? null : null,
    score: {
      home: raw?.sport_event_status?.home_score ?? null,
      away: raw?.sport_event_status?.away_score ?? null,
    },
    prediction: null,
  };
}

/**
 * @param {string|undefined} s
 * @returns {'NS'|'LIVE'|'FT'}
 */
function mapStatus(s) {
  if (!s) return 'NS';
  if (s === 'not_started' || s === 'created') return 'NS';
  if (s === 'live' || s === 'in_progress') return 'LIVE';
  return 'FT';
}

/**
 * Stub: in a real deployment you'd mirror apifootball.listFixtures and hit
 * a matching /api/sportradar-fixtures serverless route. Left intentionally
 * unimplemented to keep quota usage explicit.
 */
export async function listFixtures() {
  throw new Error(
    '[sportradar] adapter is stubbed. Add /api/sportradar-fixtures.js and wire it up to enable.',
  );
}

/**
 * @param {import('./types.js').NormalizedMatch} match
 * @param {object} extras
 * @param {Record<string, {attack:number, defense:number}>} extras.weights
 * @param {string} extras.modelVersion
 * @returns {import('./types.js').NormalizedMatch}
 */
export function attachPrediction(match, { weights, modelVersion }) {
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
    modelAgreement: Math.round(Math.max(p.homeWin, p.draw, p.awayWin) * 100),
    h2hConsistency: 50,
    recentFormDelta: 50,
    calibrationBonus: 50,
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

export const sportradarProvider = {
  name: NAME,
  listFixtures,
  normalizeFixture,
  attachPrediction,
};
