/**
 * Thin wrapper over any OpenAI-compatible chat-completions endpoint.
 *
 * Named `llm.client` rather than after a vendor on purpose: the support bot is
 * configured entirely by base URL + model id, so the same file serves Groq,
 * xAI, or a local server. Nothing below hard-codes a model string.
 *
 * This module is the ONLY place that talks to the provider, and it never
 * receives database credentials or a Prisma client. The model's entire
 * influence on the system is the JSON it returns, which the caller validates.
 */
import OpenAI from 'openai';
import { supportConfig } from '../config/env';
import { logger } from '../config/logger';

let client: OpenAI | null = null;
let announced = false;

function getClient(): OpenAI | null {
  if (supportConfig.mode === 'offline') return null;
  if (!client) {
    client = new OpenAI({
      apiKey: supportConfig.apiKey,
      baseURL: supportConfig.baseUrl,
      timeout: supportConfig.timeoutMs,
      maxRetries: 1,
    });
    if (!announced) {
      announced = true;
      // Log the resolved configuration exactly once, so a misconfigured demo
      // machine is obvious in the first lines of the server log.
      logger.info(
        { baseUrl: supportConfig.baseUrl, model: supportConfig.model, guard: supportConfig.guardModel },
        'saarthi support: LLM configured',
      );
    }
  }
  return client;
}

export class LlmUnavailableError extends Error {
  constructor(public reason: string) {
    super(`LLM unavailable: ${reason}`);
    this.name = 'LlmUnavailableError';
  }
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Calls the model and returns raw text. `jsonSchema` switches on the provider's
 * strict structured-output mode, which is what keeps the reply parseable.
 */
export async function complete(opts: {
  messages: ChatMessage[];
  model?: string;
  jsonSchema?: { name: string; schema: Record<string, unknown> };
  maxTokens?: number;
  temperature?: number;
}): Promise<{ text: string; model: string; totalTokens: number }> {
  const api = getClient();
  if (!api) throw new LlmUnavailableError('offline mode or no API key');

  const model = opts.model ?? supportConfig.model;
  const res = await api.chat.completions.create({
    model,
    messages: opts.messages,
    max_tokens: opts.maxTokens ?? supportConfig.maxOutputTokens,
    temperature: opts.temperature ?? 0.2,
    ...(opts.jsonSchema
      ? {
          response_format: {
            type: 'json_schema' as const,
            json_schema: { name: opts.jsonSchema.name, strict: true, schema: opts.jsonSchema.schema },
          },
        }
      : {}),
  });

  const text = res.choices[0]?.message?.content ?? '';
  if (!text) throw new LlmUnavailableError('empty completion');
  return { text, model, totalTokens: res.usage?.total_tokens ?? 0 };
}

/**
 * Prompt-injection classifier. Returns a 0..1 score where high means "this text
 * is trying to issue instructions". Runs on the *untrusted* text only — never
 * on our own prompt.
 *
 * Deliberately fails OPEN (score 0) when unavailable: this is a second line of
 * defence, and the real guarantees are that untrusted text is fenced as data
 * and that no fix executes without a human click. Blocking every support
 * request because a classifier is down would be the worse failure.
 */
export async function injectionScore(untrusted: string): Promise<number> {
  const api = getClient();
  if (!api || !supportConfig.guardModel) return 0;
  try {
    const res = await api.chat.completions.create({
      model: supportConfig.guardModel,
      messages: [{ role: 'user', content: untrusted.slice(0, 4000) }],
      max_tokens: 12,
      temperature: 0,
    });
    const raw = (res.choices[0]?.message?.content ?? '').trim();
    const score = Number.parseFloat(raw);
    return Number.isFinite(score) ? score : 0;
  } catch (err) {
    logger.warn({ err }, 'saarthi support: injection guard unavailable, continuing');
    return 0;
  }
}

/** True when a live model call is possible right now. */
export function llmAvailable(): boolean {
  return supportConfig.mode === 'auto';
}
