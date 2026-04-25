/**
 * useFixtures hook.
 *
 * Fetches today's fixtures (optionally filtered by league IDs) through the
 * active data provider and attaches a Poisson-based prediction to each.
 * Auto-refetches on an interval that adapts to the match status mix.
 */

import { useQuery } from '@tanstack/react-query';
import { getProvider } from '../providers/index.js';
import { mockProvider } from '../providers/mock.js';
import { DEMO_MODE, REFRESH_INTERVALS, LEAGUE_IDS } from '../lib/config.js';

/**
 * @param {{leagueIds?:number[], date?:string}} [opts]
 * @returns {import('@tanstack/react-query').UseQueryResult<{
 *   matches: import('../providers/types.js').NormalizedMatch[],
 *   provider: string,
 *   fetchedAt: string,
 *   degraded: boolean,
 *   demoFallback: boolean,
 * }>}
 */
export function useFixtures(opts = {}) {
  const leagueIds = opts.leagueIds && opts.leagueIds.length ? opts.leagueIds : LEAGUE_IDS;
  const date = opts.date || todayUTC();

  return useQuery({
    queryKey: ['fixtures', date, leagueIds.join(',')],
    queryFn: async () => {
      const provider = getProvider();
      try {
        const matches = await provider.listFixtures({ date, leagueIds });
        return {
          matches,
          provider: provider.name,
          fetchedAt: new Date().toISOString(),
          degraded: false,
          demoFallback: false,
        };
      } catch (error) {
        if (!DEMO_MODE && provider.name === 'apifootball') {
          console.warn('[useFixtures] live fetch failed, using demo fallback:', error);
          const matches = await mockProvider.listFixtures();
          return {
            matches,
            provider: 'mock-fallback',
            fetchedAt: new Date().toISOString(),
            degraded: true,
            demoFallback: true,
          };
        }
        throw error;
      }
    },
    refetchInterval: (query) => {
      const matches = query.state.data?.matches || [];
      if (matches.some((m) => m.status === 'LIVE')) return REFRESH_INTERVALS.LIVE;
      if (matches.some((m) => m.status === 'NS')) return REFRESH_INTERVALS.NS;
      if (matches.some((m) => m.status === 'FT')) return REFRESH_INTERVALS.FT;
      return REFRESH_INTERVALS.DEFAULT;
    },
    staleTime: REFRESH_INTERVALS.LIVE,
    retry: 1,
  });
}

function todayUTC() {
  return new Date().toISOString().slice(0, 10);
}
