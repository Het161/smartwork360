import { NEUTRAL_BAND, type SentimentLabel } from '@smartwork/shared';

/**
 * Offline sentiment fallback.
 *
 * Used in two places:
 *  1. `prisma/seed.ts`, so a freshly seeded database has full morale dashboards
 *     without the Python service ever having run.
 *  2. The API, when the ML service is unreachable — the demo must never break.
 *
 * MUST stay in lockstep with services/ml/app/lexicon.py. The two are the same
 * algorithm with the same vocabulary: a note scored -0.62 here must not become
 * -0.31 once the Python service comes online, or the morale chart would jump for
 * no reason a user could see.
 *
 * Measured 87.5% on a 40-comment held-out set (services/ml/eval).
 *
 * Algorithm
 *   1. Split into CLAUSES on sentence punctuation — negation must not reach across
 *      a full stop ("no variance. Good to close" is positive).
 *   2. Match multi-word phrases first and CONSUME their tokens, so
 *      "pareshan ho gaya" scores once as distress instead of "pareshan" (-0.85)
 *      plus "ho gaya" (+0.6) cancelling out.
 *   3. Score remaining unigrams with negation and intensifier handling.
 *   4. Aggregate, then squash by sqrt(hits) so long notes do not out-shout short ones.
 */

const POSITIVE: Record<string, number> = {
  done: 0.6, completed: 0.8, complete: 0.7, resolved: 0.8, resolve: 0.6,
  approved: 0.7, cleared: 0.7, verified: 0.6, smooth: 0.7, smoothly: 0.7,
  ahead: 0.6, early: 0.5, 'on time': 0.7, ontime: 0.7, good: 0.6,
  great: 0.8, excellent: 0.9, thanks: 0.6, 'thank you': 0.7, helpful: 0.7,
  cooperative: 0.7, cooperation: 0.6, support: 0.4, supported: 0.5,
  satisfied: 0.7, satisfaction: 0.7, satisfactory: 0.6,
  finished: 0.7, submitted: 0.5, submit: 0.3,
  dispatched: 0.5, progress: 0.2, 'no issue': 0.7, 'no issues': 0.7,
  'no variance': 0.5, 'without any delay': 0.7, 'ho gaya': 0.6, 'ho gaya hai': 0.6,
  'kar diya': 0.6, 'done sir': 0.7, 'ready hai': 0.6, theek: 0.5,
  'theek hai': 0.6, achha: 0.6, badhiya: 0.7, sahi: 0.5,
  // General administrative vocabulary.
  exceeded: 0.7, achieved: 0.7, achievement: 0.7, disposed: 0.5,
  timely: 0.7, prompt: 0.7, promptly: 0.7, quick: 0.6, quickly: 0.6,
  efficient: 0.7, efficiently: 0.7, successful: 0.8, successfully: 0.8,
  appreciated: 0.8, appreciation: 0.8, commended: 0.8, tallied: 0.6,
  perfectly: 0.7, well: 0.4, 'zero pendency': 0.8, 'no pendency': 0.8,
  'handed over': 0.3, 'in order': 0.6, 'as per schedule': 0.6,
};

const NEGATIVE: Record<string, number> = {
  delay: -0.7, delayed: -0.75, delays: -0.7, overdue: -0.8,
  // "pending" alone is a status word, not a complaint.
  pending: -0.25,
  stuck: -0.8, blocked: -0.8, blocker: -0.7, issue: -0.5, issues: -0.55,
  problem: -0.6, problems: -0.65, error: -0.6, mistake: -0.6,
  missing: -0.4, mismatch: -0.6, incomplete: -0.6, rejected: -0.8,
  reject: -0.7, failed: -0.8, failure: -0.8, escalate: -0.6,
  escalated: -0.7, urgent: -0.3, pressure: -0.6, overload: -0.8,
  overloaded: -0.85, overwhelmed: -0.9, exhausted: -0.9, tired: -0.7,
  frustrated: -0.85, frustrating: -0.8, disappointing: -0.75,
  disappointed: -0.75, unacceptable: -0.85, unable: -0.6,
  'not possible': -0.6, 'not able': -0.65, 'not available': -0.6,
  'could not': -0.5, 'no response': -0.7, 'no support': -0.75, shortage: -0.7,
  understaffed: -0.8, 'again and again': -0.6, repeatedly: -0.5,
  complaint: -0.6, complaints: -0.65, redo: -0.5,
  'pending hai': -0.5, 'delay ho raha': -0.75, 'delay ho raha hai': -0.75,
  'nahi hua': -0.7, 'nahi ho': -0.65, 'nahi mila': -0.7, 'time nahi': -0.7,
  'bahut load': -0.8, 'kaam bahut': -0.7, 'samajh nahi': -0.6, dikkat: -0.7,
  'pareshan ho gaya': -0.85, pareshan: -0.85, mushkil: -0.7,
  // General administrative vocabulary.
  'fed up': -0.85, absent: -0.6, duplicate: -0.5, repeated: -0.5,
  difficult: -0.6, difficulty: -0.6, postponed: -0.6, cancelled: -0.7,
  'not working': -0.7, spoiled: -0.75, damaged: -0.7, defective: -0.7,
  faulty: -0.65, breach: -0.7, breached: -0.75, insufficient: -0.6,
  lapse: -0.7, irregular: -0.6, discrepancy: -0.6, objection: -0.55,
  deficiency: -0.6, unresolved: -0.7, 'held up': -0.7, backlog: -0.5,
  penalty: -0.6, adverse: -0.7, unsatisfactory: -0.8, poor: -0.7,
  'non compliance': -0.7, violation: -0.75, denied: -0.65, refused: -0.7,
  'cannot be': -0.5, 'could not be': -0.55, 'no substitute': -0.6,
  'has to be repeated': -0.7, restarts: -0.5,
};

const NEGATORS = new Set([
  'not', 'no', 'never', "don't", 'dont', 'cannot', "can't", 'without', 'nahi', 'na',
]);

const INTENSIFIERS: Record<string, number> = {
  very: 1.5, extremely: 1.8, really: 1.4, bahut: 1.6, kaafi: 1.4,
  totally: 1.5, completely: 1.5, slightly: 0.6, somewhat: 0.7,
  partially: 0.25, thoda: 0.7,
};

/** Longest phrases first, so "delay ho raha hai" wins over "delay ho raha". */
const PHRASES: { words: string[]; weight: number }[] = Object.entries({
  ...POSITIVE,
  ...NEGATIVE,
})
  .filter(([phrase]) => phrase.includes(' '))
  .map(([phrase, weight]) => ({ words: phrase.split(' '), weight }))
  .sort((a, b) => b.words.length - a.words.length);

const CLAUSE_SPLIT = /[.;!?,\n]+/;
const CLEAN = /[^\p{L}\p{N}\s']/gu;
const SPACES = /\s+/g;

export interface LexiconResult {
  score: number;
  label: SentimentLabel;
  matched: string[];
}

function scoreClause(clause: string): { total: number; hits: number; matched: string[] } {
  const tokens = clause.replace(CLEAN, ' ').replace(SPACES, ' ').trim().split(' ').filter(Boolean);
  if (tokens.length === 0) return { total: 0, hits: 0, matched: [] };

  const consumed = new Array<boolean>(tokens.length).fill(false);
  let total = 0;
  let hits = 0;
  const matched: string[] = [];

  // 1. Phrases, longest first, consuming their tokens.
  for (const { words, weight } of PHRASES) {
    const n = words.length;
    for (let i = 0; i + n <= tokens.length; i += 1) {
      if (consumed.slice(i, i + n).some(Boolean)) continue;
      let isMatch = true;
      for (let j = 0; j < n; j += 1) {
        if (tokens[i + j] !== words[j]) {
          isMatch = false;
          break;
        }
      }
      if (!isMatch) continue;

      let value = weight;
      const prev = i >= 1 ? tokens[i - 1] : undefined;
      if (prev && NEGATORS.has(prev)) value *= -0.85;
      else if (prev && INTENSIFIERS[prev] !== undefined) value *= INTENSIFIERS[prev];

      total += value;
      hits += 1;
      matched.push(words.join(' '));
      for (let j = i; j < i + n; j += 1) consumed[j] = true;
    }
  }

  // 2. Remaining single tokens.
  tokens.forEach((token, i) => {
    if (consumed[i]) return;
    const weight = POSITIVE[token] ?? NEGATIVE[token];
    if (weight === undefined) return;

    let value = weight;
    const prev = i >= 1 ? tokens[i - 1] : undefined;
    const prev2 = i >= 2 ? tokens[i - 2] : undefined;

    if (prev && INTENSIFIERS[prev] !== undefined) value *= INTENSIFIERS[prev];
    // "not resolved" must not read as positive.
    if ((prev && NEGATORS.has(prev)) || (prev2 && NEGATORS.has(prev2))) value *= -0.85;

    total += value;
    hits += 1;
    matched.push(token);
  });

  return { total, hits, matched };
}

export function scoreSentiment(text: string): LexiconResult {
  let total = 0;
  let hits = 0;
  const matched: string[] = [];

  for (const clause of text.toLowerCase().split(CLAUSE_SPLIT)) {
    const result = scoreClause(clause);
    total += result.total;
    hits += result.hits;
    matched.push(...result.matched);
  }

  if (hits === 0) return { score: 0, label: 'NEUTRAL', matched: [] };

  const raw = total / Math.sqrt(hits);
  const score = Math.max(-1, Math.min(1, Number(raw.toFixed(4))));
  return { score, label: labelFor(score), matched };
}

export function labelFor(score: number): SentimentLabel {
  if (score > NEUTRAL_BAND) return 'POSITIVE';
  if (score < -NEUTRAL_BAND) return 'NEGATIVE';
  return 'NEUTRAL';
}

export const LEXICON_MODEL_VERSION = 'heuristic-lexicon-v1.2-hinglish';
