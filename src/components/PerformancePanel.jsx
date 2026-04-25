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

export default function PerformancePanel({ open, onToggle, perf, loading }) {
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
