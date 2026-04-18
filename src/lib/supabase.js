/**
 * Supabase clients.
 *
 * Two flavours:
 *  - browser client (anon key, read-only by RLS policy)
 *  - server client (service-role key, used by serverless functions to write)
 */

import { createClient } from '@supabase/supabase-js';
import { readEnv } from './config.js';

/**
 * Lazily-created anon client for the React app.
 * Returns null if Supabase is not configured (e.g. local demo mode).
 * @returns {import('@supabase/supabase-js').SupabaseClient|null}
 */
export function getBrowserSupabase() {
  const url =
    readEnv('VITE_SUPABASE_URL') ||
    readEnv('NEXT_PUBLIC_SUPABASE_URL') ||
    readEnv('SUPABASE_URL');
  const key =
    readEnv('VITE_SUPABASE_ANON_KEY') ||
    readEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY') ||
    readEnv('SUPABASE_ANON_KEY');
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Service-role client for serverless functions. NEVER import from the
 * browser bundle — only from /api/*.js handlers.
 * @returns {import('@supabase/supabase-js').SupabaseClient}
 */
export function getServerSupabase() {
  const url = readEnv('SUPABASE_URL') || readEnv('NEXT_PUBLIC_SUPABASE_URL');
  const key = readEnv('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) {
    throw new Error(
      '[Forza] Supabase service-role credentials missing. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.',
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
