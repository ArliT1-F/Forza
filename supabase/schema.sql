-- Forza soccer prediction dashboard — Supabase schema.
-- Run this once in the Supabase SQL editor, or via `supabase db push`.
--
-- Design rules:
--  * All writes happen through serverless functions using the service-role key.
--  * All reads are public (Row Level Security is enabled, with a single
--    "anyone can read" policy per table).
--  * `model_weights` and `model_performance` keep history so we can roll
--    back to a previous model version if a retrain regresses.

-- ------------------------------------------------------------------
-- predictions_log
--   One row per prediction made at the time a match kicked off.
--   Acts as the historical ledger that the self-improving pipeline
--   joins against match_results to compute calibration stats.
-- ------------------------------------------------------------------
create table if not exists public.predictions_log (
  id bigserial primary key,
  match_id text not null,
  league_id text,
  home_team_id text not null,
  away_team_id text not null,
  predicted_home_goals integer not null,
  predicted_away_goals integer not null,
  prob_home_win numeric(6,4) not null check (prob_home_win between 0 and 1),
  prob_draw     numeric(6,4) not null check (prob_draw     between 0 and 1),
  prob_away_win numeric(6,4) not null check (prob_away_win between 0 and 1),
  confidence    numeric(5,2) not null check (confidence between 0 and 100),
  model_version text not null,
  created_at timestamptz not null default now(),
  unique (match_id, model_version)
);
create index if not exists predictions_log_match_idx on public.predictions_log (match_id);
create index if not exists predictions_log_created_idx on public.predictions_log (created_at desc);

-- ------------------------------------------------------------------
-- match_results
--   Final score and outcome for every finished match we predicted.
--   Populated nightly by /api/ingest-results from API-Football.
-- ------------------------------------------------------------------
create table if not exists public.match_results (
  id bigserial primary key,
  match_id text not null unique,
  actual_home_goals integer not null,
  actual_away_goals integer not null,
  actual_outcome text not null check (actual_outcome in ('home','draw','away')),
  created_at timestamptz not null default now()
);
create index if not exists match_results_created_idx on public.match_results (created_at desc);

-- ------------------------------------------------------------------
-- model_weights
--   One row per (team, model_version). The active version is whatever
--   model_performance says has is_active = true.
-- ------------------------------------------------------------------
create table if not exists public.model_weights (
  id bigserial primary key,
  team_id text not null,
  league_id text,
  attack_strength numeric(8,4) not null,
  defense_strength numeric(8,4) not null,
  matches_trained_on integer not null default 0,
  model_version text not null,
  created_at timestamptz not null default now(),
  unique (team_id, model_version)
);
create index if not exists model_weights_version_idx on public.model_weights (model_version);
create index if not exists model_weights_team_idx on public.model_weights (team_id);

-- ------------------------------------------------------------------
-- model_performance
--   One row per model version per evaluation run. The latest row with
--   is_active = true is the "champion" used to serve predictions.
-- ------------------------------------------------------------------
create table if not exists public.model_performance (
  id bigserial primary key,
  model_version text not null,
  brier_score numeric(8,4) not null,        -- lower is better (0..2)
  outcome_accuracy numeric(5,4) not null,   -- 0..1
  avg_goal_error numeric(6,3) not null,     -- mean absolute error, goals
  sample_size integer not null,
  is_active boolean not null default false,
  evaluated_at timestamptz not null default now()
);
create index if not exists model_performance_version_idx on public.model_performance (model_version);
create index if not exists model_performance_eval_idx on public.model_performance (evaluated_at desc);
create index if not exists model_performance_active_idx on public.model_performance (is_active) where is_active = true;

-- ------------------------------------------------------------------
-- fixtures_cache
--   Opportunistic cache so the API can gracefully degrade when the
--   upstream provider is down or over quota. One row per query key.
-- ------------------------------------------------------------------
create table if not exists public.fixtures_cache (
  cache_key text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------------
-- Row Level Security
-- ------------------------------------------------------------------
alter table public.predictions_log   enable row level security;
alter table public.match_results     enable row level security;
alter table public.model_weights     enable row level security;
alter table public.model_performance enable row level security;
alter table public.fixtures_cache    enable row level security;

-- Public read policies. The anon key can select, nothing else.
-- Service-role bypasses RLS entirely so writes from /api/* still work.
do $$ begin
  create policy "public read predictions_log"   on public.predictions_log   for select using (true);
  create policy "public read match_results"     on public.match_results     for select using (true);
  create policy "public read model_weights"     on public.model_weights     for select using (true);
  create policy "public read model_performance" on public.model_performance for select using (true);
  create policy "public read fixtures_cache"    on public.fixtures_cache    for select using (true);
exception when duplicate_object then null; end $$;
