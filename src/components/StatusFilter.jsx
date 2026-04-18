/**
 * Status pill filter: All / Live / Upcoming / Finished.
 */

import { STATUS_FILTERS } from '../lib/config.js';

/**
 * @param {{ value:string, onChange:(id:string)=>void, counts?:Record<string,number> }} props
 */
export function StatusFilter({ value, onChange, counts = {} }) {
  return (
    <div className="flex items-center gap-1.5">
      {STATUS_FILTERS.map((s) => {
        const active = s.id === value;
        const isLive = s.id === 'LIVE';
        return (
          <button
            key={s.id}
            onClick={() => onChange(s.id)}
            className={[
              'flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors',
              active
                ? 'bg-accent text-black'
                : 'border border-white/10 bg-surface text-ink hover:border-white/20',
            ].join(' ')}
          >
            {isLive && (
              <span
                className={[
                  'h-1.5 w-1.5 rounded-full bg-bad',
                  active ? '' : 'animate-pulse-dot',
                ].join(' ')}
              />
            )}
            <span>{s.label}</span>
            {counts[s.id] !== undefined && (
              <span
                className={[
                  'rounded-full px-1.5 py-px font-mono text-[10px]',
                  active ? 'bg-black/20 text-black' : 'bg-white/5 text-muted',
                ].join(' ')}
              >
                {counts[s.id]}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default StatusFilter;
