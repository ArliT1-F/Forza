# Forza — Soccer Prediction Dashboard

A full-stack dashboard that fetches today's matches across the top
football leagues, predicts every scoreline with a Dixon-Coles Poisson
model, and **re-trains itself every night** from the matches that actually
finished.

- **Frontend** — Vite + React + Tailwind + TanStack Query + Recharts
- **Backend** — Vercel Serverless Functions in `/api`
- **Database** — Supabase (Postgres)
- **Cron** — Vercel Cron Jobs (nightly ingest → retrain → calibrate)

---

## 1. Quickstart

```bash
# 1. Install deps
npm install

# 2. Configure env
cp .env.example .env
# fill in APIFOOTBALL_KEY and (optionally) Supabase credentials

# 3. Dev server
npm run dev
#    → http://localhost:5173

# 4. (Optional) run the serverless /api routes locally with Vercel CLI
npx vercel dev
```

If `APIFOOTBALL_KEY` is not set, the app automatically enters **demo mode**
and renders 8 realistic mock matches so the UI is fully visible.

---

## 2. Environment variables

All values are documented inline in [.env.example](./.env.example). In
short:

| Variable                            | Scope   | Purpose                                                          |
| ----------------------------------- | ------- | ---------------------------------------------------------------- |
| `PROVIDER`                          | both    | `apifootball` (default) or `sportradar`.                         |
| `APIFOOTBALL_KEY`                   | server  | API-Football secret. Unset → demo mode.                          |
| `SPORTRADAR_KEY`                    | server  | Optional SportRadar key.                                         |
| `NEXT_PUBLIC_SUPABASE_URL`          | browser | Supabase project URL.                                            |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`     | browser | Public anon key (read-only through RLS).                         |
| `SUPABASE_SERVICE_ROLE_KEY`         | server  | Used by `/api/*` handlers for writes — NEVER expose.             |
| `CRON_SECRET`                       | server  | Random long secret verified by every cron handler.               |

Required keys are validated at startup — missing keys throw a clear error.

---

## 3. Project layout

```
/api                    Vercel serverless functions
  fixtures.js           GET  /api/fixtures          proxy to API-Football
  predictions.js        GET  /api/predictions       proxy to API-Football
  ingest-results.js     CRON /api/ingest-results    nightly, saves FT results
  retrain.js            CRON /api/retrain           nightly, updates weights
  calibrate.js          CRON /api/calibrate         nightly, picks champion
  _lib/                 shared helpers (apifootball, supabase, auth)

/src
  /components           UI pieces (MatchCard, LeagueFilter, …)
  /hooks                useFixtures + useModelPerformance
  /engine               Dixon-Coles Poisson, confidence, calibration
  /providers            Pluggable adapters (apifootball, sportradar, mock)
  /lib                  config + Supabase client

/supabase/schema.sql    Full DB schema + RLS policies
vercel.json             Cron job config
.env.example            Every required env var, commented
```

---

## 4. Supabase setup

1. Create a new Supabase project.
2. Open the SQL editor and paste [`supabase/schema.sql`](./supabase/schema.sql).
3. Copy the project URL + anon key + service-role key into `.env` and
   into Vercel's environment variables.

RLS is on for every table — anyone with the anon key can **read** from
the five tables; only the service-role key can **write**. That key is used
exclusively by the `/api/*` serverless handlers.

---

## 5. How the prediction engine works

The engine lives in [`src/engine/poisson.js`](src/engine/poisson.js).

Each team gets two parameters (stored in `model_weights`):

```
attack_t  ≈ scored_per_match / league_avg
defense_t ≈ conceded_per_match / league_avg
```

Expected goals for an upcoming match:

```
λ_home = attack_home × defense_away × home_advantage
λ_away = attack_away × defense_home
```

We then build the full 6×6 scoreline probability matrix using exact Poisson
PMFs with the Dixon-Coles low-score correction τ(x, y, λ, μ, ρ) that
decorrelates the 0-0 / 1-0 / 0-1 / 1-1 cells. A Monte-Carlo variant
(`simulateScorelines`) is also available as a sanity check.

The UI modal shows the matrix as a heatmap; the card shows only the
marginal home/draw/away probabilities and the modal scoreline.

### Confidence (0–100)

[`src/engine/confidence.js`](src/engine/confidence.js):

```
confidence = 0.40 × model_agreement      # us vs API-Football /predictions
           + 0.30 × h2h_consistency      # variance of past head-to-heads
           + 0.20 × recent_form_delta    # last-5-match points gap
           + 0.10 × calibration_bonus    # historical accuracy at this tier
```

Displayed as a colored pill: red < 50, yellow 50-70, green ≥ 70.

---

## 6. The self-improving loop

Three Vercel Crons run every night:

| Time (UTC) | Path                   | What it does                                                    |
| ---------- | ---------------------- | --------------------------------------------------------------- |
| `02:00`    | `/api/ingest-results`  | Pulls yesterday's FT fixtures, inserts into `match_results`.    |
| `03:00`    | `/api/retrain`         | Re-fits attack/defense params, writes a new `model_version`.    |
| `04:00`    | `/api/calibrate`       | Computes Brier / accuracy / goal-error per version, flips the active version. Auto-rollback if the new version regresses. |

Only the last `MODEL_CONFIG.keepWeightVersions` (default **10**) versions
are kept in `model_weights`, so rollbacks are cheap.

Every handler rejects requests that don't carry
`Authorization: Bearer $CRON_SECRET`. Vercel Cron sends that header
automatically.

---

## 7. Switching to SportRadar

The provider layer is fully pluggable:

```env
PROVIDER=sportradar
SPORTRADAR_KEY=your-key-here
```

[`src/providers/sportradar.js`](src/providers/sportradar.js) already
normalizes SportRadar's `/sport_events` shape into the same
`NormalizedMatch` contract the rest of the app consumes. To activate:

1. Add a `/api/sportradar-fixtures.js` serverless function that hits
   SportRadar's Soccer v4 schedules endpoint and returns
   `{ data: [...] }` (shape is already handled).
2. Point `listFixtures` in the SportRadar adapter at your new route.
3. Set `PROVIDER=sportradar` in the environment and redeploy.

No component code needs to change — because config, league IDs, refresh
intervals and provider selection all live in
[`src/lib/config.js`](src/lib/config.js).

---

## 8. Graceful degradation

If API-Football returns a non-2xx (e.g. quota exceeded), the fixtures
proxy falls back to the last snapshot in `fixtures_cache` and the UI
renders a warning banner: _"API quota exceeded … showing last cached
data"_. Full outages do not take the dashboard down.

---

## 9. Deploying to Vercel

```bash
vercel link
vercel env add APIFOOTBALL_KEY        # repeat for each env var
vercel --prod
```

Vercel picks up `vercel.json` automatically and provisions the three
cron jobs.

---

## 10. License

MIT — see [LICENSE](./LICENSE).
