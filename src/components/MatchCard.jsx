/**
 * Single match card. Hover lifts, click opens the scoreline heatmap modal.
 * Accepts a NormalizedMatch. Predictions are rendered in muted text below
 * the current score.
 */

import { memo } from 'react';
import ProbabilityBar from './ProbabilityBar.jsx';
import ConfidenceBadge from './ConfidenceBadge.jsx';

/**
 * @param {{ match: import('../providers/types.js').NormalizedMatch, onOpen?: (m:any)=>void }} props
 */
function MatchCardInner({ match, onOpen }) {
  const isLive = match.status === 'LIVE';
  const isFt = match.status === 'FT';
  const isNs = match.status === 'NS';

  const kickoff =
    match.kickoff && isNs
      ? new Date(match.kickoff).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : null;

  return (
    <button
      onClick={() => onOpen?.(match)}
      className="group relative flex w-full flex-col gap-3 rounded-xl border border-white/5 bg-surface p-4 text-left shadow-card transition-transform hover:-translate-y-0.5 hover:border-white/15 focus:outline-none focus:ring-2 focus:ring-accent/60"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {match.league.logo ? (
            <img
              src={match.league.logo}
              alt=""
              className="h-5 w-5 rounded"
              loading="lazy"
              onError={hideOnError}
            />
          ) : null}
          <span className="truncate text-xs text-muted">{match.league.name}</span>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {isLive && (
            <span className="inline-flex items-center gap-1 rounded-full border border-bad/30 bg-bad/10 px-2 py-0.5 font-mono text-[10px] text-bad">
              <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-bad" />
              {match.minute ? `${match.minute}'` : 'LIVE'}
            </span>
          )}
          {isNs && (
            <span className="rounded-full border border-white/10 bg-black/30 px-2 py-0.5 font-mono text-[10px] text-muted">
              {kickoff || 'TBD'}
            </span>
          )}
          {isFt && (
            <span className="rounded-full border border-white/10 bg-black/30 px-2 py-0.5 font-mono text-[10px] text-muted">
              FT
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <TeamSide team={match.homeTeam} align="start" />
        <div className="flex flex-col items-center">
          <div className="font-mono text-3xl font-semibold tracking-tight text-ink">
            {formatScore(match.score, match.status)}
          </div>
          {match.prediction && (
            <div className="mt-0.5 font-mono text-[10px] text-muted">
              Pred&nbsp;
              <span className="text-accent">
                {match.prediction.predictedScore.home}–{match.prediction.predictedScore.away}
              </span>
            </div>
          )}
        </div>
        <TeamSide team={match.awayTeam} align="end" />
      </div>

      {match.prediction && (
        <ProbabilityBar
          homeWin={match.prediction.homeWin}
          draw={match.prediction.draw}
          awayWin={match.prediction.awayWin}
        />
      )}

      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] text-muted">
          {match.prediction?.modelVersion ? `model ${match.prediction.modelVersion}` : ''}
        </span>
        {match.prediction && <ConfidenceBadge value={match.prediction.confidence} />}
      </div>
    </button>
  );
}

function TeamSide({ team, align }) {
  return (
    <div
      className={[
        'flex min-w-0 items-center gap-2',
        align === 'end' ? 'justify-end text-right' : 'justify-start',
      ].join(' ')}
    >
      {align === 'start' && team.logo && (
        <img src={team.logo} alt="" className="h-8 w-8 rounded-full" loading="lazy" onError={hideOnError} />
      )}
      <span className="truncate text-sm font-medium text-ink">{team.name}</span>
      {align === 'end' && team.logo && (
        <img src={team.logo} alt="" className="h-8 w-8 rounded-full" loading="lazy" onError={hideOnError} />
      )}
    </div>
  );
}

function formatScore(score, status) {
  if (status === 'NS' || score.home === null || score.away === null) return '? – ?';
  return `${score.home} – ${score.away}`;
}

function hideOnError(e) {
  e.currentTarget.style.visibility = 'hidden';
}

export const MatchCard = memo(MatchCardInner);
export default MatchCard;
