/**
 * Provider selector. The rest of the app imports `getProvider()` rather than
 * a specific adapter, so swapping data sources is a single env-var change.
 */

import { apifootballProvider } from './apifootball.js';
import { sportradarProvider } from './sportradar.js';
import { mockProvider } from './mock.js';
import { PROVIDER, DEMO_MODE } from '../lib/config.js';

/**
 * @returns {{ name:string,
 *            listFixtures:(opts?:object)=>Promise<import('./types.js').NormalizedMatch[]>,
 *            normalizeFixture:(r:any)=>import('./types.js').NormalizedMatch,
 *            attachPrediction:(m:import('./types.js').NormalizedMatch, extras:any)=>import('./types.js').NormalizedMatch }}
 */
export function getProvider() {
  if (DEMO_MODE) return mockProvider;
  if (PROVIDER === 'sportradar') return sportradarProvider;
  return apifootballProvider;
}
