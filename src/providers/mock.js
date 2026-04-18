/**
 * Mock provider used in demo mode (no API key configured). Generates 8
 * realistic fixtures across multiple leagues with deterministic-ish but
 * slightly-varying results. Output conforms to NormalizedMatch.
 */

import { LEAGUES, MODEL_CONFIG } from '../lib/config.js';
import { predictFixture } from '../engine/poisson.js';

const NAME = 'mock';

const DEMO_TEAMS = [
  { leagueCode: 'PL', home: 'Arsenal', away: 'Manchester City' },
  { leagueCode: 'PL', home: 'Liverpool', away: 'Chelsea' },
  { leagueCode: 'LALIGA', home: 'Real Madrid', away: 'Barcelona' },
  { leagueCode: 'SERIEA', home: 'Inter', away: 'Juventus' },
  { leagueCode: 'BUNDES', home: 'Bayern München', away: 'Borussia Dortmund' },
  { leagueCode: 'LIGUE1', home: 'Paris Saint-Germain', away: 'Olympique Marseille' },
  { leagueCode: 'UCL', home: 'Atlético Madrid', away: 'Bayer Leverkusen' },
  { leagueCode: 'MLS', home: 'Inter Miami', away: 'LA Galaxy' },
];

function pickLeague(code) {
  return LEAGUES.find((l) => l.code === code) || LEAGUES[0];
}

function crestFor(name) {
  // Tiny inline SVG so mock cards still have a visual without network.
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 3)
    .toUpperCase();
  const svg = `<?xml version='1.0' encoding='UTF-8'?>
<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'>
  <circle cx='20' cy='20' r='18' fill='#1f1f1f' stroke='#CCFF00' stroke-width='1.5'/>
  <text x='50%' y='54%' text-anchor='middle' font-family='Inter, sans-serif' font-size='13' font-weight='700' fill='#f0f0f0'>${initials}</text>
</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function leagueLogo(code) {
  const svg = `<?xml version='1.0' encoding='UTF-8'?>
<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'>
  <rect width='32' height='32' rx='6' fill='#141414' stroke='#333' stroke-width='1'/>
  <text x='50%' y='58%' text-anchor='middle' font-family='JetBrains Mono, monospace' font-size='10' fill='#CCFF00' font-weight='700'>${code}</text>
</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/**
 * @returns {import('./types.js').NormalizedMatch[]}
 */
export function listMockFixtures() {
  const now = Date.now();
  return DEMO_TEAMS.map((t, i) => {
    const league = pickLeague(t.leagueCode);
    const isLive = i === 1 || i === 4;
    const isFt = i === 2;
    const status = isLive ? 'LIVE' : isFt ? 'FT' : 'NS';
    const minute = isLive ? 34 + i * 6 : null;

    const homeAttack = 1.0 + ((i * 13) % 7) / 20; // 1.00..1.30
    const awayAttack = 1.0 + ((i * 17) % 9) / 25;
    const homeDefense = 1.0 - ((i * 11) % 5) / 30;
    const awayDefense = 1.0 - ((i * 19) % 7) / 35;

    const pred = predictFixture({
      home: { attack: homeAttack, defense: homeDefense },
      away: { attack: awayAttack, defense: awayDefense },
    });

    const score =
      status === 'LIVE'
        ? { home: pred.predictedScore.home, away: Math.max(0, pred.predictedScore.away - 1) }
        : status === 'FT'
          ? { home: pred.predictedScore.home + 1, away: pred.predictedScore.away }
          : { home: null, away: null };

    const peak = Math.max(pred.homeWin, pred.draw, pred.awayWin);
    const confidence = Math.round(40 + peak * 60);

    const kickoff = new Date(now + (isLive ? -minute * 60_000 : isFt ? -3 * 3600_000 : (i + 1) * 3600_000)).toISOString();

    return {
      matchId: `mock-${i}`,
      provider: NAME,
      kickoff,
      league: { id: league.id, name: league.name, logo: leagueLogo(league.short) },
      homeTeam: { id: `mock-h-${i}`, name: t.home, logo: crestFor(t.home) },
      awayTeam: { id: `mock-a-${i}`, name: t.away, logo: crestFor(t.away) },
      status,
      minute,
      score,
      prediction: {
        homeWin: Number(pred.homeWin.toFixed(4)),
        draw: Number(pred.draw.toFixed(4)),
        awayWin: Number(pred.awayWin.toFixed(4)),
        predictedScore: pred.predictedScore,
        confidence,
        modelVersion: 'demo-v0',
        matrix: pred.matrix,
      },
    };
  });
}

/**
 * @returns {{brierScore:number, outcomeAccuracy:number, sampleSize:number, modelVersion:string, evaluatedAt:string}[]}
 */
export function mockPerformance() {
  const base = Date.now();
  return Array.from({ length: 12 }, (_, i) => ({
    modelVersion: `demo-v${i}`,
    brierScore: Number((0.62 - i * 0.012 + (i % 3 === 0 ? 0.01 : 0)).toFixed(3)),
    outcomeAccuracy: Number((0.46 + i * 0.008).toFixed(3)),
    sampleSize: 120 + i * 14,
    evaluatedAt: new Date(base - (11 - i) * 24 * 3600_000).toISOString(),
  }));
}

export const mockProvider = {
  name: NAME,
  listFixtures: async () => listMockFixtures(),
  normalizeFixture: (r) => r,
  attachPrediction: (m) => m,
};
