/**
 * Top-level dashboard. Composes the header, filter bar, match grid, and the
 * collapsible model-performance panel at the bottom.
 */

import { useEffect, useMemo, useState } from 'react';
import { useFixtures } from './hooks/useFixtures.js';
import { useModelPerformance } from './hooks/usePredictions.js';
import LeagueFilter from './components/LeagueFilter.jsx';
import StatusFilter from './components/StatusFilter.jsx';
import MatchCard from './components/MatchCard.jsx';
import HeatmapModal from './components/HeatmapModal.jsx';
import { DEMO_MODE, PROVIDER } from './lib/config.js';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  Legend,
} from 'recharts';

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
            ? 'Demo mode: APIFOOTBALL_KEY is not set, rendering realistic mock matches.'
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

      <PerformancePanel
        open={perfOpen}
        onToggle={() => setPerfOpen((v) => !v)}
        perf={performance.data}
        loading={performance.isLoading}
      />

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

function PerformancePanel({ open, onToggle, perf, loading }) {
  const history = perf?.history || [];
  const chartData = history.map((p) => ({
    label: new Date(p.evaluatedAt).toLocaleDateString(),
    brier: p.brierScore,
    accuracy: p.outcomeAccuracy * 100,
  }));

  return (
    <section className="mt-8 rounded-2xl border border-white/5 bg-surface">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between px-5 py-4 text-left"
      >
        <div>
          <div className="text-sm font-semibold text-ink">Model performance</div>
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
            Self-improving · nightly retrain
          </div>
        </div>
        <div className="flex items-center gap-3 font-mono text-[11px] text-muted">
          <Pill label="version" value={perf?.currentVersion || '—'} />
          <Pill label="logged" value={perf?.totalLogged?.toLocaleString?.() ?? '—'} />
          <span className="text-muted">{open ? '▾' : '▸'}</span>
        </div>
      </button>

      {open && (
        <div className="grid grid-cols-1 gap-4 border-t border-white/5 p-5 md:grid-cols-2">
          <div className="h-64 rounded-xl border border-white/5 bg-black/20 p-3">
            <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-muted">
              Brier score over time (lower is better)
            </div>
            {loading && <div className="text-xs text-muted">Loading…</div>}
            {!loading && chartData.length > 0 && (
              <ResponsiveContainer width="100%" height="90%">
                <LineChart data={chartData}>
                  <CartesianGrid stroke="#222" strokeDasharray="2 4" />
                  <XAxis dataKey="label" stroke="#666" fontSize={10} tickLine={false} />
                  <YAxis stroke="#666" fontSize={10} tickLine={false} domain={['auto', 'auto']} />
                  <Tooltip
                    contentStyle={{ background: '#141414', border: '1px solid #333', fontSize: 11 }}
                    labelStyle={{ color: '#f0f0f0' }}
                  />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Line
                    type="monotone"
                    dataKey="brier"
                    stroke="#CCFF00"
                    strokeWidth={2}
                    dot={false}
                    name="Brier"
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="h-64 rounded-xl border border-white/5 bg-black/20 p-3">
            <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-muted">
              Outcome accuracy % over time
            </div>
            {loading && <div className="text-xs text-muted">Loading…</div>}
            {!loading && chartData.length > 0 && (
              <ResponsiveContainer width="100%" height="90%">
                <LineChart data={chartData}>
                  <CartesianGrid stroke="#222" strokeDasharray="2 4" />
                  <XAxis dataKey="label" stroke="#666" fontSize={10} tickLine={false} />
                  <YAxis
                    stroke="#666"
                    fontSize={10}
                    tickLine={false}
                    unit="%"
                    domain={[0, 100]}
                  />
                  <Tooltip
                    contentStyle={{ background: '#141414', border: '1px solid #333', fontSize: 11 }}
                    labelStyle={{ color: '#f0f0f0' }}
                  />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Line
                    type="monotone"
                    dataKey="accuracy"
                    stroke="#22c55e"
                    strokeWidth={2}
                    dot={false}
                    name="Accuracy %"
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function Pill({ label, value }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/30 px-2 py-0.5">
      <span className="text-[9px] uppercase tracking-wider text-muted">{label}</span>
      <span className="text-ink">{value}</span>
    </span>
  );
}
