import { NEUTRAL_BAND, type SentimentLabel } from '@smartwork/shared';

/**
 * Offline sentiment fallback.
 *
 * Used in two places:
 *  1. `prisma/seed.ts`, so a freshly seeded database has full morale dashboards
 *     without the Python service ever having run.
 *  2. The API, when the ML service is unreachable — the demo must never break.
 *
 * The vocabulary is deliberately tuned for Indian government office English and
 * Hinglish, which a generic English lexicon scores badly ("pending hai",
 * "delay ho raha", "done sir", "issue resolve ho gaya").
 */

const POSITIVE: Record<string, number> = {
  done: 0.6,
  completed: 0.8,
  complete: 0.7,
  resolved: 0.8,
  resolve: 0.6,
  approved: 0.7,
  cleared: 0.7,
  verified: 0.6,
  smooth: 0.7,
  smoothly: 0.7,
  ahead: 0.6,
  early: 0.5,
  'on time': 0.7,
  ontime: 0.7,
  good: 0.6,
  great: 0.8,
  excellent: 0.9,
  thanks: 0.6,
  'thank you': 0.7,
  helpful: 0.7,
  cooperative: 0.7,
  support: 0.4,
  supported: 0.5,
  finished: 0.7,
  submitted: 0.5,
  dispatched: 0.5,
  progress: 0.4,
  'no issue': 0.7,
  'no issues': 0.7,
  'ho gaya': 0.6,
  'ho gaya hai': 0.6,
  'kar diya': 0.6,
  'done sir': 0.7,
  'ready hai': 0.6,
  theek: 0.5,
  'theek hai': 0.6,
  achha: 0.6,
  badhiya: 0.7,
  sahi: 0.5,
};

const NEGATIVE: Record<string, number> = {
  delay: -0.7,
  delayed: -0.75,
  delays: -0.7,
  overdue: -0.8,
  pending: -0.4,
  stuck: -0.8,
  blocked: -0.8,
  blocker: -0.7,
  issue: -0.5,
  issues: -0.55,
  problem: -0.6,
  problems: -0.65,
  error: -0.6,
  mistake: -0.6,
  missing: -0.6,
  incomplete: -0.6,
  rejected: -0.8,
  reject: -0.7,
  failed: -0.8,
  failure: -0.8,
  escalate: -0.6,
  escalated: -0.7,
  urgent: -0.3,
  pressure: -0.6,
  overload: -0.8,
  overloaded: -0.85,
  overwhelmed: -0.9,
  exhausted: -0.9,
  tired: -0.7,
  frustrated: -0.85,
  frustrating: -0.8,
  unable: -0.6,
  'not possible': -0.6,
  'no response': -0.7,
  'no support': -0.75,
  shortage: -0.7,
  understaffed: -0.8,
  'again and again': -0.6,
  repeatedly: -0.5,
  complaint: -0.6,
  complaints: -0.65,
  'pending hai': -0.5,
  'delay ho raha': -0.75,
  'delay ho raha hai': -0.75,
  'nahi hua': -0.7,
  'nahi ho': -0.65,
  'nahi mila': -0.7,
  'time nahi': -0.7,
  'bahut load': -0.8,
  'kaam bahut': -0.7,
  'samajh nahi': -0.6,
  dikkat: -0.7,
  pareshan: -0.85,
  mushkil: -0.7,
};

const NEGATORS = ['not', 'no', 'never', "don't", 'dont', 'cannot', "can't", 'nahi', 'na'];
const INTENSIFIERS: Record<string, number> = {
  very: 1.5,
  extremely: 1.8,
  really: 1.4,
  bahut: 1.6,
  kaafi: 1.4,
  totally: 1.5,
  completely: 1.5,
  slightly: 0.6,
  somewhat: 0.7,
  thoda: 0.7,
};

export interface LexiconResult {
  score: number;
  label: SentimentLabel;
  matched: string[];
}

export function scoreSentiment(text: string): LexiconResult {
  const lower = ` ${text.toLowerCase().replace(/[^\p{L}\p{N}\s']/gu, ' ').replace(/\s+/g, ' ')} `;
  const tokens = lower.trim().split(' ').filter(Boolean);

  let total = 0;
  let hits = 0;
  const matched: string[] = [];

  // Multi-word phrases first — they carry the Hinglish signal.
  for (const [phrase, weight] of [...Object.entries(POSITIVE), ...Object.entries(NEGATIVE)]) {
    if (!phrase.includes(' ')) continue;
    if (lower.includes(` ${phrase} `)) {
      total += weight;
      hits += 1;
      matched.push(phrase);
    }
  }

  tokens.forEach((token, i) => {
    const weight = POSITIVE[token] ?? NEGATIVE[token];
    if (weight === undefined) return;

    let value = weight;
    const prev = tokens[i - 1];
    const prev2 = tokens[i - 2];

    if (prev && INTENSIFIERS[prev] !== undefined) value *= INTENSIFIERS[prev];
    // "not resolved" must not read as positive.
    if ((prev && NEGATORS.includes(prev)) || (prev2 && NEGATORS.includes(prev2))) value *= -0.85;

    total += value;
    hits += 1;
    matched.push(token);
  });

  if (hits === 0) return { score: 0, label: 'NEUTRAL', matched: [] };

  // Average, then squash — long notes should not out-shout short ones.
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
