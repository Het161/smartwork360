import type { RiskLevel, SentimentLabel } from '@smartwork/shared';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { LEXICON_MODEL_VERSION, scoreSentiment } from './lexicon';
import { burnoutFallback, chatFallback, anomalyFallback } from './fallback';
import type { ChatContext, ChatResult, BurnoutFeatures, BurnoutResult, AnomalyRow, AnomalyResult } from './types';

/**
 * Client for the Python ML service.
 *
 * GROUND RULE: the demo can never break offline. Every call here is wrapped so
 * that an unreachable, slow or erroring ML service silently degrades to the local
 * TypeScript implementation with an identical response shape. The only observable
 * difference is `mode: "heuristic"` instead of `"model"`, which the UI displays
 * honestly rather than hiding.
 */

let mlHealthy: boolean | null = null;
let lastProbe = 0;
const PROBE_INTERVAL = 30_000;

async function post<T>(path: string, body: unknown): Promise<T | null> {
  // Skip the network entirely for 30s after a failure — a dead service must not
  // add 8s of latency to every dashboard request.
  if (mlHealthy === false && Date.now() - lastProbe < PROBE_INTERVAL) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.ML_TIMEOUT_MS);

  try {
    const res = await fetch(`${env.ML_SERVICE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`ML service returned ${res.status}`);
    const json = (await res.json()) as T;
    if (mlHealthy !== true) logger.info('ML service reachable — using model-backed inference');
    mlHealthy = true;
    lastProbe = Date.now();
    return json;
  } catch (err) {
    if (mlHealthy !== false) {
      logger.warn(
        { err: (err as Error).message },
        'ML service unreachable — falling back to local heuristics',
      );
    }
    mlHealthy = false;
    lastProbe = Date.now();
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export type MlMode = 'model' | 'heuristic';

export interface SentimentItem {
  id: string;
  score: number;
  label: SentimentLabel;
}

export interface SentimentBatchResult {
  items: SentimentItem[];
  modelVersion: string;
  mode: MlMode;
}

export async function scoreSentimentBatch(
  items: { id: string; text: string }[],
): Promise<SentimentBatchResult> {
  if (items.length === 0) {
    return { items: [], modelVersion: LEXICON_MODEL_VERSION, mode: 'heuristic' };
  }

  const remote = await post<SentimentBatchResult>('/sentiment', { items });
  if (remote?.items) return remote;

  return {
    items: items.map((i) => {
      const { score, label } = scoreSentiment(i.text);
      return { id: i.id, score, label };
    }),
    modelVersion: LEXICON_MODEL_VERSION,
    mode: 'heuristic',
  };
}

export async function scoreBurnout(
  users: { userId: string; features: BurnoutFeatures }[],
): Promise<{ items: BurnoutResult[]; modelVersion: string; mode: MlMode }> {
  const remote = await post<{ items: BurnoutResult[]; modelVersion: string; mode: MlMode }>(
    '/burnout',
    { users },
  );
  if (remote?.items) return remote;
  return burnoutFallback(users);
}

export async function scanAnomalies(
  events: AnomalyRow[],
): Promise<{ items: AnomalyResult[]; modelVersion: string; mode: MlMode }> {
  const remote = await post<{ items: AnomalyResult[]; modelVersion: string; mode: MlMode }>(
    '/anomaly/scan',
    { events },
  );
  if (remote?.items) return remote;
  return anomalyFallback(events);
}

export async function askAssistant(message: string, context: ChatContext): Promise<ChatResult> {
  const remote = await post<ChatResult>('/chat', { message, context });
  if (remote?.reply) return remote;
  return chatFallback(message, context);
}

export function mlStatus(): { reachable: boolean | null; url: string } {
  return { reachable: mlHealthy, url: env.ML_SERVICE_URL };
}

export type { RiskLevel };
