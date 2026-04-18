/**
 * Central configuration for the Forza soccer prediction dashboard.
 *
 * Rules:
 *  - No hardcoded IDs, strings, or keys live anywhere in component code.
 *  - All runtime tunables (provider choice, league list, refresh intervals,
 *    model hyperparameters, color thresholds) live here.
 *  - Values are resolved from Vite's `import.meta.env` on the client side,
 *    and from `process.env` on the server (serverless) side.
 */

/**
 * Safely read an env var on either the client (Vite) or server (Node).
 * @param {string} key
 * @param {string} [fallback]
 * @returns {string|undefined}
 */
function readEnv(key, fallback) {
  // Vite exposes import.meta.env at build time.
  if (typeof import.meta !== 'undefined' && import.meta.env && key in import.meta.env) {
    const v = import.meta.env[key];
    if (v !== undefined && v !== '') return String(v);
  }
  if (typeof process !== 'undefined' && process.env && key in process.env) {
    const v = process.env[key];
    if (v !== undefined && v !== '') return String(v);
  }
  return fallback;
}

/** Which data provider to use. "apifootball" (default) or "sportradar". */
export const PROVIDER = readEnv('VITE_PROVIDER') || readEnv('PROVIDER') || 'apifootball';

/** True when the app should render mock data (no live key configured). */
export const DEMO_MODE =
  !readEnv('VITE_APIFOOTBALL_KEY') &&
  !readEnv('APIFOOTBALL_KEY') &&
  PROVIDER === 'apifootball';

/**
 * Major leagues we cover. IDs map to API-Football's internal league IDs.
 * Order here == the order they appear in the league filter bar.
 */
export const LEAGUES = [
  { id: 39, code: 'PL', name: 'Premier League', short: 'PL' },
  { id: 140, code: 'LALIGA', name: 'La Liga', short: 'La Liga' },
  { id: 135, code: 'SERIEA', name: 'Serie A', short: 'Serie A' },
  { id: 78, code: 'BUNDES', name: 'Bundesliga', short: 'Bundesliga' },
  { id: 61, code: 'LIGUE1', name: 'Ligue 1', short: 'Ligue 1' },
  { id: 2, code: 'UCL', name: 'UEFA Champions League', short: 'UCL' },
  { id: 3, code: 'UEL', name: 'UEFA Europa League', short: 'UEL' },
  { id: 253, code: 'MLS', name: 'Major League Soccer', short: 'MLS' },
  { id: 71, code: 'BRASIL', name: 'Brasileirão Série A', short: 'Brasileirão' },
  { id: 88, code: 'EREDIV', name: 'Eredivisie', short: 'Eredivisie' },
  { id: 94, code: 'PRIMEIRA', name: 'Primeira Liga', short: 'Primeira' },
  { id: 203, code: 'SUPERLIG', name: 'Süper Lig', short: 'Süper Lig' },
];

/** Convenience: array of numeric league IDs we fetch by default. */
export const LEAGUE_IDS = LEAGUES.map((l) => l.id);

/** Status pill values used by the UI filter. */
export const STATUS_FILTERS = [
  { id: 'ALL', label: 'All' },
  { id: 'LIVE', label: 'Live' },
  { id: 'NS', label: 'Upcoming' },
  { id: 'FT', label: 'Finished' },
];

/** TanStack Query refetch intervals (ms) by status. */
export const REFRESH_INTERVALS = {
  LIVE: 30_000,
  NS: 5 * 60_000,
  FT: 15 * 60_000,
  DEFAULT: 60_000,
};

/**
 * Confidence thresholds for the colored badge.
 * < LOW_MAX => red, LOW_MAX..HIGH_MIN => yellow, >= HIGH_MIN => green.
 */
export const CONFIDENCE_TIERS = {
  LOW_MAX: 50,
  HIGH_MIN: 70,
};

/** Dixon-Coles / Poisson model defaults. */
export const MODEL_CONFIG = {
  simulations: 10_000,
  maxGoals: 5, // 0..5 x 0..5 = 6x6 scoreline matrix on the UI
  homeAdvantage: 1.25,
  // Regularisation pull-to-mean when we have too little data for a team.
  defaultAttack: 1.0,
  defaultDefense: 1.0,
  minMatchesForFit: 5,
  keepWeightVersions: 10,
};

/** API-Football constants (endpoint only — key lives server-side). */
export const APIFOOTBALL = {
  baseUrl: 'https://v3.football.api-sports.io',
  authHeader: 'x-apisports-key',
};

/** SportRadar constants. */
export const SPORTRADAR = {
  baseUrl: 'https://api.sportradar.com/soccer/trial/v4/en',
  // SportRadar uses a query param named `api_key`
  authParam: 'api_key',
};

/**
 * Throw a clear error if a required key is missing. Callable from both
 * the client bootstrap and each serverless handler.
 * @param {string[]} keys
 */
export function assertEnv(keys) {
  const missing = keys.filter((k) => !readEnv(k));
  if (missing.length) {
    throw new Error(
      `[Forza] Missing required environment variable(s): ${missing.join(', ')}. ` +
        `See .env.example for details.`,
    );
  }
}

export { readEnv };
