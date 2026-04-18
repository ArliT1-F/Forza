/**
 * usePredictions hook.
 *
 * Pulls model performance history (Brier score, outcome accuracy over time)
 * from Supabase. Falls back to mock history when Supabase is not configured
 * so the performance panel is still visible in demo mode.
 */

import { useQuery } from '@tanstack/react-query';
import { getBrowserSupabase } from '../lib/supabase.js';
import { mockPerformance } from '../providers/mock.js';
import { DEMO_MODE } from '../lib/config.js';

/**
 * @returns {import('@tanstack/react-query').UseQueryResult<{
 *   history: Array<{modelVersion:string, brierScore:number, outcomeAccuracy:number, sampleSize:number, evaluatedAt:string}>,
 *   currentVersion: string,
 *   totalLogged: number,
 * }>}
 */
export function useModelPerformance() {
  return useQuery({
    queryKey: ['model-performance'],
    queryFn: async () => {
      const sb = getBrowserSupabase();
      if (!sb || DEMO_MODE) {
        const history = mockPerformance();
        return {
          history,
          currentVersion: history[history.length - 1].modelVersion,
          totalLogged: history.reduce((a, b) => a + b.sampleSize, 0),
        };
      }

      const { data: perf, error } = await sb
        .from('model_performance')
        .select('model_version, brier_score, outcome_accuracy, avg_goal_error, sample_size, evaluated_at')
        .order('evaluated_at', { ascending: true })
        .limit(60);

      if (error) throw error;

      const history = (perf || []).map((r) => ({
        modelVersion: r.model_version,
        brierScore: Number(r.brier_score),
        outcomeAccuracy: Number(r.outcome_accuracy),
        avgGoalError: Number(r.avg_goal_error),
        sampleSize: r.sample_size,
        evaluatedAt: r.evaluated_at,
      }));

      const { count } = await sb
        .from('predictions_log')
        .select('id', { count: 'exact', head: true });

      return {
        history,
        currentVersion: history[history.length - 1]?.modelVersion || 'v0',
        totalLogged: count || 0,
      };
    },
    staleTime: 15 * 60_000,
    refetchInterval: 15 * 60_000,
    retry: 1,
  });
}
