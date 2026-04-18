/**
 * Segmented probability bar for Home / Draw / Away.
 * Widths are proportional to the three input probabilities (in [0,1]).
 */

import { memo } from 'react';

/**
 * @param {{ homeWin:number, draw:number, awayWin:number }} props
 */
function ProbabilityBarInner({ homeWin, draw, awayWin }) {
  const total = Math.max(0.0001, homeWin + draw + awayWin);
  const h = (homeWin / total) * 100;
  const d = (draw / total) * 100;
  const a = (awayWin / total) * 100;

  return (
    <div className="w-full">
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-black/40">
        <div
          className="h-full bg-accent"
          style={{ width: `${h}%` }}
          aria-label={`Home ${h.toFixed(0)}%`}
        />
        <div
          className="h-full bg-muted/70"
          style={{ width: `${d}%` }}
          aria-label={`Draw ${d.toFixed(0)}%`}
        />
        <div
          className="h-full bg-ink/70"
          style={{ width: `${a}%` }}
          aria-label={`Away ${a.toFixed(0)}%`}
        />
      </div>
      <div className="mt-1 flex justify-between font-mono text-[10px] text-muted">
        <span className="text-accent">{h.toFixed(0)}%</span>
        <span>{d.toFixed(0)}%</span>
        <span className="text-ink">{a.toFixed(0)}%</span>
      </div>
    </div>
  );
}

export const ProbabilityBar = memo(ProbabilityBarInner);
export default ProbabilityBar;
