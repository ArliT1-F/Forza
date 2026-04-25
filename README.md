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

Demo mode is now **explicit** (set `FORCE_DEMO_MODE=true` or
`VITE_FORCE_DEMO_MODE=true`). If live API calls fail (missing key, quota, or
upstream outage), the UI automatically falls back to mock fixtures so the app
still renders.

---

## 2. Environment variables

All values are documented inline in [.env.example](./.env.example). In
short:

| Variable                            | Scope   | Purpose                                                          |
| ----------------------------------- | ------- | ---------------------------------------------------------------- |
| `PROVIDER`                          | both    | `apifootball` (default) or `sportradar`.                         |
| `APIFOOTBALL_KEY`                   | server  | API-Football secret used by `/api/*` serverless handlers.        |
| `APIFOOTBALL_SEASON`                | server  | Optional season override for `/api/fixtures` (e.g. `2024` on free tier). |
| `FORCE_DEMO_MODE`                   | both    | Explicitly force demo mode (`true`/`false`) for all runtimes.    |
| `VITE_FORCE_DEMO_MODE`              | browser | Optional client-only demo override for local preview/testing.     |
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

## 9. Vercel production setup (Forza / Froza)

### 9.1 Create and link the project

```bash
vercel link
```

When prompted:
- Framework preset: **Vite**
- Build command: `npm run build`
- Output directory: `dist`

(`vercel.json` already contains the same defaults plus cron configuration and
API function limits.)

### 9.2 Add required environment variables in Vercel

Project → **Settings** → **Environment Variables**.

Set these for **Production** (and optionally Preview/Development):

- `PROVIDER=apifootball`
- `APIFOOTBALL_KEY=...`
- `APIFOOTBALL_SEASON=2024` (recommended on free plan)
- `FORCE_DEMO_MODE=false`
- `CRON_SECRET=<long-random-secret>`
- `SUPABASE_URL=...`
- `SUPABASE_SERVICE_ROLE_KEY=...`
- `NEXT_PUBLIC_SUPABASE_URL=...`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY=...`

Optional:
- `VITE_FORCE_DEMO_MODE=true` (only for explicit demo previews)
- `SPORTRADAR_KEY=...` (only if enabling the SportRadar adapter)

### 9.3 Enable Vercel Analytics + Speed Insights

This repository now includes:
- `@vercel/analytics`
- `@vercel/speed-insights`

and mounts both in `src/main.jsx`.

In Vercel dashboard, open your project:
1. **Analytics** tab → click **Enable** (if not already enabled).
2. **Speed Insights** tab → click **Enable**.

No extra API key is required for either feature on Vercel-hosted deployments.

### 9.4 Deploy

```bash
vercel --prod
```

Vercel provisions the three cron jobs from `vercel.json`:
- `/api/ingest-results` (02:00 UTC)
- `/api/retrain` (03:00 UTC)
- `/api/calibrate` (04:00 UTC)

### 9.5 Custom domain suggestion

Domain checks run on 2026-04-25 showed these as available:

- `forzapredict.com` (clean + brand-aligned)
- `forzaforecast.com`
- `froza.app`

Recommended default: **`forzapredict.com`**.

To add:
1. Vercel Project → **Settings** → **Domains**.
2. Add the domain.
3. If bought externally, create the DNS records Vercel shows.
4. Wait for SSL issuance (automatic).

---

## 10. Why demo mode was always enabled (and fix)

Root cause:
- Frontend code was inferring demo mode from `APIFOOTBALL_KEY`.
- On Vercel, `APIFOOTBALL_KEY` is server-only and not exposed to browser code.
- Result: browser always saw "missing key" and forced demo mode.

Fix implemented:
- Demo mode is now controlled only by explicit flags:
  - `FORCE_DEMO_MODE`
  - `VITE_FORCE_DEMO_MODE` / `VITE_DEMO_MODE` (legacy compatibility kept)
- Live mode remains default when these are false.
- If live API fails, the app now degrades gracefully to mock fixtures with a
  clear warning banner.

---

## 11. API-Football setup guide (step by step)

### 11.1 Create account and get key

1. Go to `https://dashboard.api-football.com/register`.
2. Sign up (email or Google).
3. Verify email.
4. In dashboard, open **Account → My Access**.
5. Copy your API key.

Free plan notes (as documented by API-Football):
- No credit card required.
- ~100 requests/day on free tier.
- Base URL: `https://v3.football.api-sports.io`
- Auth header: `x-apisports-key: YOUR_KEY`
- Free tier season coverage is limited (your sample returned `2022` to `2024`).

### 11.2 Smoke test your key locally

```bash
curl --request GET \
  --url "https://v3.football.api-sports.io/fixtures?league=39&season=2024&date=2026-04-25" \
  --header "x-apisports-key: YOUR_API_KEY"
```

If this returns JSON with `response`, the key is valid.

### 11.3 Configure Forza

1. Put key in `.env` for local:
   - `APIFOOTBALL_KEY=...`
   - `APIFOOTBALL_SEASON=2024` (for free plan)
   - `FORCE_DEMO_MODE=false`
2. In Vercel env vars, set the same production values.
3. Redeploy.

### 11.4 Verify in production

1. Open the app.
2. Top-right provider badge should show `apifootball` (or `mock-fallback` only
   during outages).
3. Demo banner should not appear unless you explicitly forced demo mode.

---

## 12. If API-Football does not work: free fallback options

Before switching provider entirely, try this first:
- Keep `PROVIDER=apifootball`
- Set `APIFOOTBALL_SEASON=2024`
- Redeploy

This keeps your existing integration unchanged while staying inside free-plan
season limits.

### Option A — OpenLigaDB (fully free, no key)

- Site: `https://www.openligadb.de/`
- Auth: none
- Example endpoint:
  - `https://api.openligadb.de/getmatchdata/bl1/2025`

Pros:
- No key management.
- Good for prototypes and Bundesliga-centric apps.

Tradeoff:
- Coverage and schema differ from API-Football.

### Option B — TheSportsDB (free dev/test key)

- Docs: `https://www.thesportsdb.com/documentation`
- Common free test key in docs: `123`
- Example:
  - `https://www.thesportsdb.com/api/v1/json/123/searchteams.php?t=Arsenal`

Pros:
- Fast to test integration.

Tradeoff:
- Free key is mainly for development/educational usage.

---

## 13. License

MIT — see [LICENSE](./LICENSE).
