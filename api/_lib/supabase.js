/**
 * Supabase service-role client for Vercel serverless functions.
 */

import { createClient } from '@supabase/supabase-js';

let cached = null;

/**
 * @returns {import('@supabase/supabase-js').SupabaseClient}
 */
export function serverSupabase() {
  if (cached) return cached;
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Supabase credentials missing (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)');
  }
  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
