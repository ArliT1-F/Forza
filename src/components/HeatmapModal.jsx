/**
 * Scoreline heatmap modal.
 *
 * Renders the 6×6 probability matrix (home goals 0..5 × away goals 0..5).
 * Cell opacity encodes probability. Clicking outside closes the modal; ESC
 * also closes it.
 */

import { useEffect, useMemo } from 'react';
import ProbabilityBar from './ProbabilityBar.jsx';
import ConfidenceBadge from './ConfidenceBadge.jsx';

/**
 * @param {{ match: import('../providers/types.js').NormalizedMatch|null, onClose:()=>void }} props
 */
export function HeatmapModal({ match, onClose }) {
  useEffect(() => {
    if (!match) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [match, onClose]);

  const matrix = match?.prediction?.matrix || null;
  const maxP = useMemo(() => {
    if (!matrix) return 0;
    let m = 0;
    for (const row of matrix) for (const v of row) if (v > m) m = v;
    return m || 1;
  }, [matrix]);

  if (!match) return null;

  const size = matrix ? matrix.length : 6;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl rounded-2xl border border-white/10 bg-surface p-6 shadow-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs text-muted">
              <span>{match.league.name}</span>
              {match.status === 'LIVE' && (
                <span className="inline-flex items-center gap-1 rounded-full border border-bad/30 bg-bad/10 px-2 py-0.5 font-mono text-[10px] text-bad">
                  <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-bad" />
                  {match.minute ? `${match.minute}'` : 'LIVE'}
                </span>
              )}
            </div>
            <h2 className="mt-1 text-lg font-semibold text-ink">
              {match.homeTeam.name} <span className="text-muted">vs</span> {match.awayTeam.name}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg border border-white/10 bg-black/30 px-3 py-1 text-xs text-muted hover:border-white/20 hover:text-ink"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-[auto_1fr]">
          <div>
            <div className="font-mono text-xs uppercase tracking-wider text-muted">
              Scoreline grid
            </div>
            {matrix ? (
              <div
                className="mt-2 grid gap-px rounded-lg bg-black/40 p-2"
                style={{ gridTemplateColumns: `auto repeat(${size}, minmax(0, 1fr))` }}
              >
                <div />
                {Array.from({ length: size }, (_, y) => (
                  <div
                    key={`colh-${y}`}
                    className="text-center font-mono text-[10px] text-muted"
                  >
                    {y}
                  </div>
                ))}
                {matrix.map((row, x) => (
                  <Row key={`row-${x}`} x={x} row={row} maxP={maxP} />
                ))}
              </div>
            ) : (
              <div className="mt-2 text-sm text-muted">No matrix available.</div>
            )}
            <div className="mt-2 flex items-center justify-between font-mono text-[10px] text-muted">
              <span>← Home goals (rows)</span>
              <span>Away goals (cols) →</span>
            </div>
          </div>

          <div className="space-y-4">
            {match.prediction && (
              <>
                <div>
                  <div className="font-mono text-xs uppercase tracking-wider text-muted">
                    Win probability
                  </div>
                  <div className="mt-2">
                    <ProbabilityBar
                      homeWin={match.prediction.homeWin}
                      draw={match.prediction.draw}
                      awayWin={match.prediction.awayWin}
                    />
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-center text-[11px]">
                    <Stat label="Home" value={pct(match.prediction.homeWin)} color="text-accent" />
                    <Stat label="Draw" value={pct(match.prediction.draw)} color="text-muted" />
                    <Stat label="Away" value={pct(match.prediction.awayWin)} color="text-ink" />
                  </div>
                </div>

                <div>
                  <div className="font-mono text-xs uppercase tracking-wider text-muted">
                    Most likely scoreline
                  </div>
                  <div className="mt-1 font-mono text-2xl text-accent">
                    {match.prediction.predictedScore.home}–{match.prediction.predictedScore.away}
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-mono text-xs uppercase tracking-wider text-muted">
                      Confidence
                    </div>
                    <div className="mt-1">
                      <ConfidenceBadge value={match.prediction.confidence} />
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-xs uppercase tracking-wider text-muted">
                      Model
                    </div>
                    <div className="mt-1 font-mono text-xs text-ink">
                      {match.prediction.modelVersion}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ x, row, maxP }) {
  return (
    <>
      <div className="flex items-center justify-end pr-1 font-mono text-[10px] text-muted">
        {x}
      </div>
      {row.map((p, y) => {
        const intensity = Math.min(1, p / maxP);
        const bg = `rgba(204, 255, 0, ${0.08 + intensity * 0.85})`;
        const color = intensity > 0.5 ? '#0a0a0a' : '#f0f0f0';
        return (
          <div
            key={`cell-${x}-${y}`}
            className="flex aspect-square items-center justify-center rounded-sm font-mono text-[10px] transition-colors"
            style={{ backgroundColor: bg, color }}
            title={`${x}-${y}: ${(p * 100).toFixed(1)}%`}
          >
            {(p * 100).toFixed(0)}
          </div>
        );
      })}
    </>
  );
}

function Stat({ label, value, color }) {
  return (
    <div className="rounded-lg border border-white/5 bg-black/30 p-2">
      <div className="font-mono text-[10px] uppercase tracking-wider text-muted">{label}</div>
      <div className={`font-mono text-sm ${color}`}>{value}</div>
    </div>
  );
}

function pct(v) {
  return `${(v * 100).toFixed(0)}%`;
}

export default HeatmapModal;
