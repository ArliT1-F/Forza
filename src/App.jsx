/**
 * Top-level dashboard. Composes the header, filter bar, match grid, and the
 * collapsible model-performance panel at the bottom.
 */

import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { useFixtures } from './hooks/useFixtures.js';
import { useModelPerformance } from './hooks/usePredictions.js';
import LeagueFilter from './components/LeagueFilter.jsx';
import StatusFilter from './components/StatusFilter.jsx';
import MatchCard from './components/MatchCard.jsx';
import HeatmapModal from './components/HeatmapModal.jsx';
import { DEMO_MODE, PROVIDER } from './lib/config.js';

const PerformancePanel = lazy(() => import('./components/PerformancePanel.jsx'));

export default function App() {
  const [leagueId, setLeagueId] = useState(null);
  const [status, setStatus] = useState('ALL');
  const [openMatch, setOpenMatch] = useState(null);
  const [perfOpen, setPerfOpen] = useState(true);

  const fixtures = useFixtures({ leagueIds: leagueId ? [leagueId] : undefined });
  const performance = useModelPerformance();

  const matches = fixtures.data?.matches ?? [];
  const counts = useMemo(() => {
    const c = { ALL: matches.length, LIVE: 0, NS: 0, FT: 0 };
    for (const m of matches) c[m.status] = (c[m.status] ?? 0) + 1;
    return c;
  }, [matches]);

  const visible = useMemo(() => {
    if (status === 'ALL') return matches;
    return matches.filter((m) => m.status === status);
  }, [matches, status]);

  const degraded = fixtures.isError || fixtures.data?.degraded;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 pb-16 pt-4 sm:px-6">
      <TopBar providerName={fixtures.data?.provider || PROVIDER} fetchedAt={fixtures.data?.fetchedAt} />

      {(DEMO_MODE || degraded) && (
        <Banner kind={DEMO_MODE ? 'info' : 'warn'}>
          {DEMO_MODE
            ? 'Demo mode enabled via FORCE_DEMO_MODE / VITE_FORCE_DEMO_MODE.'
            : fixtures.data?.liveFallback
              ? 'Season data is plan-limited. Showing real live matches only via API-Football live feed.'
              : fixtures.data?.demoFallback
              ? 'Live API failed (missing key/quota/upstream). Showing demo fallback matches.'
              : 'API quota exceeded or upstream error. Showing last cached data.'}
        </Banner>
      )}

      <section className="mt-5 flex flex-col gap-3 rounded-2xl border border-white/5 bg-surface p-3">
        <LeagueFilter value={leagueId} onChange={setLeagueId} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <StatusFilter value={status} onChange={setStatus} counts={counts} />
          <div className="font-mono text-[10px] text-muted">
            {fixtures.isFetching ? 'Refreshing…' : `${visible.length} matches`}
          </div>
        </div>
      </section>

      <section className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {fixtures.isLoading && matches.length === 0 && <CardSkeletons n={6} />}
        {!fixtures.isLoading && visible.length === 0 && (
          <div className="col-span-full rounded-xl border border-dashed border-white/10 bg-surface/50 p-10 text-center text-sm text-muted">
            No matches match the current filters.
          </div>
        )}
        {visible.map((m) => (
          <MatchCard key={m.matchId} match={m} onOpen={setOpenMatch} />
        ))}
      </section>

      <Suspense fallback={<PerformancePanelFallback />}>
        <PerformancePanel
          open={perfOpen}
          onToggle={() => setPerfOpen((v) => !v)}
          perf={performance.data}
          loading={performance.isLoading}
        />
      </Suspense>

      <HeatmapModal match={openMatch} onClose={() => setOpenMatch(null)} />
    </div>
  );
}

function TopBar({ providerName, fetchedAt }) {
  const clock = useClock();
  return (
    <header className="flex items-center justify-between gap-4 rounded-2xl border border-white/5 bg-surface px-4 py-3">
      <div className="flex items-center gap-2">
        <LogoMark />
        <div>
          <div className="text-sm font-semibold tracking-tight text-ink">Forza</div>
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
            Soccer Predictions
          </div>
        </div>
      </div>
      <div className="hidden font-mono text-sm tabular-nums text-ink sm:block">
        {clock}
      </div>
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-accent">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          {providerName}
        </span>
        <span className="font-mono text-[10px] text-muted">
          {fetchedAt ? `upd ${new Date(fetchedAt).toLocaleTimeString()}` : '…'}
        </span>
      </div>
    </header>
  );
}

function LogoMark() {
  return (
    <div className="grid h-8 w-8 place-items-center rounded-lg bg-accent/10 text-accent">
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
        <path d="M12 2l2.4 4.9L20 7.7l-4 3.9.9 5.4L12 14.6 7.1 17l.9-5.4-4-3.9 5.6-.8L12 2z" />
      </svg>
    </div>
  );
}

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now.toLocaleTimeString();
}

function Banner({ kind, children }) {
  const cls =
    kind === 'warn'
      ? 'border-warn/30 bg-warn/10 text-warn'
      : 'border-accent/30 bg-accent/10 text-accent';
  return (
    <div className={`mt-4 rounded-xl border px-4 py-2 text-xs ${cls}`}>{children}</div>
  );
}

function CardSkeletons({ n = 6 }) {
  return Array.from({ length: n }).map((_, i) => (
    <div
      key={i}
      className="h-44 animate-pulse rounded-xl border border-white/5 bg-surface/70"
    />
  ));
}

function PerformancePanelFallback() {
  return (
    <section className="mt-8 rounded-2xl border border-white/5 bg-surface p-5">
      <div className="text-xs text-muted">Loading model performance panel…</div>
    </section>
  );
}
