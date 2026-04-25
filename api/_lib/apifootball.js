/**
 * Server-side API-Football helpers used by the Vercel serverless functions.
 * The API key stays on the server only.
 */

const BASE_URL = 'https://v3.football.api-sports.io';
const AUTH_HEADER = 'x-apisports-key';

/**
 * Low-level fetch wrapper. Throws on non-2xx, returns parsed JSON.
 * @param {string} pathAndQuery e.g. "/fixtures?date=2026-04-18&league=39"
 * @returns {Promise<any>}
 */
export async function apifootballGet(pathAndQuery) {
  const key = process.env.APIFOOTBALL_KEY;
  if (!key) throw new Error('APIFOOTBALL_KEY is not set');
  const res = await fetch(`${BASE_URL}${pathAndQuery}`, {
    headers: { [AUTH_HEADER]: key, 'Accept': 'application/json' },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = new Error(`API-Football ${res.status}: ${body}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

/**
 * Fetch fixtures across multiple leagues in parallel. API-Football scopes
 * `/fixtures?date=&league=` to a single league at a time, so we fan out.
 * @param {{date:string, leagueIds:number[], live?:boolean, season?:number}} opts
 * @returns {Promise<any[]>}
 */
export async function fetchFixturesForLeagues({ date, leagueIds, live, season }) {
  const year = Number((date || new Date().toISOString().slice(0, 10)).slice(0, 4));
  const envSeason = Number(process.env.APIFOOTBALL_SEASON);
  const parsedSeason = Number(season);
  const s =
    (Number.isFinite(parsedSeason) && parsedSeason) ||
    (Number.isFinite(envSeason) && envSeason) ||
    year;
  const tasks = leagueIds.map(async (leagueId) => {
    const q = new URLSearchParams();
    if (live) {
      q.set('live', 'all');
      q.set('league', String(leagueId));
    } else {
      q.set('date', date);
      q.set('league', String(leagueId));
      q.set('season', String(s));
    }
    try {
      const json = await apifootballGet(`/fixtures?${q.toString()}`);
      return { ok: true, leagueId, data: json?.response ?? [], error: null };
    } catch (e) {
      const message = e?.message || String(e);
      // One failing league shouldn't nuke the whole page unless all leagues fail.
      console.error(`[api/fixtures] league ${leagueId} failed:`, message);
      return { ok: false, leagueId, data: [], error: message };
    }
  });
  const results = await Promise.all(tasks);
  const arrays = results.map((r) => r.data);
  const failures = results.filter((r) => !r.ok);

  if (failures.length === leagueIds.length) {
    const first = failures[0];
    const err = new Error(
      `API-Football failed for all requested leagues. First error (league ${first.leagueId}): ${first.error}`,
    );
    err.code = 'APIFOOTBALL_ALL_LEAGUES_FAILED';
    err.failures = failures;
    throw err;
  }

  return arrays.flat();
}
