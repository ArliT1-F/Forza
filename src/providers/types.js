/**
 * JSDoc type definitions shared across providers and UI.
 *
 * @typedef {Object} TeamRef
 * @property {number|string|null} id
 * @property {string} name
 * @property {string} logo
 *
 * @typedef {Object} LeagueRef
 * @property {number|string|null} id
 * @property {string} name
 * @property {string} logo
 *
 * @typedef {'NS'|'LIVE'|'FT'} MatchStatus
 *
 * @typedef {Object} MatchScore
 * @property {number|null} home
 * @property {number|null} away
 *
 * @typedef {Object} Prediction
 * @property {number} homeWin probability 0..1
 * @property {number} draw probability 0..1
 * @property {number} awayWin probability 0..1
 * @property {{home:number, away:number}} predictedScore
 * @property {number} confidence 0..100
 * @property {string} modelVersion
 * @property {number[][]=} matrix optional full scoreline matrix
 *
 * @typedef {Object} NormalizedMatch
 * @property {string} matchId
 * @property {string} provider
 * @property {string|null} kickoff ISO timestamp of scheduled kickoff
 * @property {LeagueRef} league
 * @property {TeamRef} homeTeam
 * @property {TeamRef} awayTeam
 * @property {MatchStatus} status
 * @property {number|null} minute
 * @property {MatchScore} score
 * @property {Prediction|null} prediction
 */
export {};
