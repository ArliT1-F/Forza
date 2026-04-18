/**
 * Colored confidence badge.
 *   < 50  : red   "Low"
 *   50..70: yellow"Medium"
 *   ≥ 70 : green  "High"
 */

import { CONFIDENCE_TIERS } from '../lib/config.js';

/**
 * @param {{ value:number, compact?:boolean }} props value in 0..100
 */
export function ConfidenceBadge({ value, compact = false }) {
  const band = bandFor(value);
  const styles = BAND_STYLES[band];
  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider',
        styles.wrap,
      ].join(' ')}
      title={`Confidence: ${value}%`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${styles.dot}`} />
      {compact ? `${value}%` : `${styles.label} · ${value}%`}
    </span>
  );
}

/**
 * @param {number} v
 * @returns {'LOW'|'MEDIUM'|'HIGH'}
 */
export function bandFor(v) {
  if (v < CONFIDENCE_TIERS.LOW_MAX) return 'LOW';
  if (v < CONFIDENCE_TIERS.HIGH_MIN) return 'MEDIUM';
  return 'HIGH';
}

const BAND_STYLES = {
  LOW: {
    label: 'Low',
    wrap: 'border-bad/30 bg-bad/10 text-bad',
    dot: 'bg-bad',
  },
  MEDIUM: {
    label: 'Medium',
    wrap: 'border-warn/30 bg-warn/10 text-warn',
    dot: 'bg-warn',
  },
  HIGH: {
    label: 'High',
    wrap: 'border-good/30 bg-good/10 text-good',
    dot: 'bg-good',
  },
};

export default ConfidenceBadge;
