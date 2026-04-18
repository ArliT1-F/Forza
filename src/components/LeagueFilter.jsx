/**
 * Horizontal league tab bar. "All" on the left, then the top leagues,
 * followed by a "More" menu that collapses the tail of the list.
 */

import { useState } from 'react';
import { LEAGUES } from '../lib/config.js';

/**
 * @param {{ value:(number|null), onChange:(leagueId:(number|null))=>void }} props
 */
export function LeagueFilter({ value, onChange }) {
  const [openMore, setOpenMore] = useState(false);
  const primary = LEAGUES.slice(0, 7);
  const extra = LEAGUES.slice(7);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <TabButton active={value === null} onClick={() => onChange(null)}>
        All
      </TabButton>
      {primary.map((l) => (
        <TabButton key={l.id} active={value === l.id} onClick={() => onChange(l.id)}>
          {l.short}
        </TabButton>
      ))}
      <div className="relative">
        <TabButton
          active={extra.some((l) => l.id === value)}
          onClick={() => setOpenMore((v) => !v)}
        >
          More ▾
        </TabButton>
        {openMore && (
          <div className="absolute left-0 z-20 mt-1 min-w-[160px] rounded-lg border border-white/10 bg-surface p-1 shadow-card">
            {extra.map((l) => (
              <button
                key={l.id}
                onClick={() => {
                  onChange(l.id);
                  setOpenMore(false);
                }}
                className={[
                  'block w-full rounded-md px-3 py-1.5 text-left text-sm',
                  value === l.id
                    ? 'bg-accent text-black'
                    : 'text-ink hover:bg-white/5',
                ].join(' ')}
              >
                {l.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={[
        'rounded-full px-3 py-1 text-xs font-medium transition-colors',
        active
          ? 'bg-accent text-black'
          : 'border border-white/10 bg-surface text-ink hover:border-white/20',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

export default LeagueFilter;
