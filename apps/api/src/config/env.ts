import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

// Load apps/api/.env regardless of the cwd the process was started from.
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const envSchema = z.object({
  // Validated below rather than here: a serverless function must not die at import
  // time over a missing variable, or the only symptom is an opaque 500.
  DATABASE_URL: z.string().default(''),
  PORT: z.coerce.number().int().default(4000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),

  JWT_ACCESS_SECRET: z.string().min(8).default('smartwork360-access-secret-change-me'),
  JWT_REFRESH_SECRET: z.string().min(8).default('smartwork360-refresh-secret-change-me'),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL: z.string().default('7d'),

  PARICHAY_SANDBOX_OTP: z.string().default('123456'),

  ML_SERVICE_URL: z.string().default('http://localhost:8000'),
  ML_TIMEOUT_MS: z.coerce.number().int().default(8000),

  ENABLE_SLA_CRON: z
    .string()
    .default('true')
    .transform((v) => v !== 'false'),
  LOG_LEVEL: z.string().default('info'),

  /* ------------------------------------------------------------------ mail */
  // console (default) never touches the network — the demo works offline.
  MAIL_MODE: z.enum(['console', 'ethereal', 'smtp']).default('console'),
  MAIL_FROM: z.string().default('SMARTWORK 360 <no-reply@smartwork360.gov.in>'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),

  /* ------------------------------------------------------------- onboarding */
  ALLOWED_EMAIL_DOMAINS: z.string().default('gov.in,nic.in'),
  /** Set by Vercel Cron; when present the /jobs endpoints require it. */
  CRON_SECRET: z.string().optional(),
  APP_BASE_URL: z.string().default('http://localhost:3000'),
  SIGNUP_RATE_LIMIT_PER_HOUR: z.coerce.number().int().default(5),

  /* --------------------------------------------------- saarthi support bot */
  // Provider-neutral on purpose. The support bot talks to any OpenAI-compatible
  // chat-completions endpoint, so switching between Groq, xAI or a local
  // llama.cpp server is a base-URL and a model id — never a code change.
  // XAI_* names are accepted as aliases so an xAI key drops in unchanged.
  SUPPORT_LLM_API_KEY: z.string().default(''),
  SUPPORT_LLM_BASE_URL: z.string().default('https://api.groq.com/openai/v1'),
  /** Main reasoning model. MUST support response_format: json_schema. */
  SUPPORT_LLM_MODEL: z.string().default('openai/gpt-oss-120b'),
  /** Cheaper model for classification-shaped calls. */
  SUPPORT_LLM_MODEL_FAST: z.string().default('llama-3.1-8b-instant'),
  /** Dedicated prompt-injection classifier; empty disables that layer. */
  SUPPORT_LLM_GUARD_MODEL: z.string().default('meta-llama/llama-prompt-guard-2-86m'),
  /** Score above which text is treated as an injection attempt. */
  SUPPORT_GUARD_THRESHOLD: z.coerce.number().default(0.8),
  SUPPORT_LLM_TIMEOUT_MS: z.coerce.number().int().default(20_000),
  SUPPORT_LLM_MAX_OUTPUT_TOKENS: z.coerce.number().int().default(700),
  /** auto = call the model when a key exists; offline = never touch the network. */
  SUPPORT_BOT_MODE: z.enum(['auto', 'offline']).default('auto'),
  SUPPORT_AUTOFIX_ENABLED: z
    .string()
    .default('true')
    .transform((v) => v !== 'false'),
  SUPPORT_MAX_FIXES_PER_HOUR: z.coerce.number().int().default(5),
  /** Minutes an applied fix stays reversible. */
  SUPPORT_UNDO_WINDOW_MIN: z.coerce.number().int().default(15),
});

const parsed = envSchema.safeParse(process.env);

/** Runs as a serverless function (Vercel) rather than a long-lived process. */
export const isServerless = Boolean(process.env.VERCEL);

if (!parsed.success) {
  console.error('\n✖ Invalid environment configuration:\n');
  for (const issue of parsed.error.issues) {
    console.error(`  • ${issue.path.join('.')}: ${issue.message}`);
  }
  console.error('\n  Fix: cp apps/api/.env.example apps/api/.env\n');
  // A local server should die loudly and immediately. A deployed function must
  // not: process.exit() there produces FUNCTION_INVOCATION_FAILED with no clue
  // what is missing. It stays up and reports the problem instead.
  if (!isServerless) process.exit(1);
}

export const env = parsed.success
  ? parsed.data
  : (envSchema.parse({}) as z.infer<typeof envSchema>);

/**
 * Configuration problems that make the API unusable but should be *reported*,
 * not crashed on. `/health` always answers; everything else returns 503 with
 * this list so a deployment can explain itself.
 */
export const configErrors: string[] = [];
if (!env.DATABASE_URL) {
  configErrors.push(
    'DATABASE_URL is not set — the API cannot reach a database. Add it in the Vercel project settings (or apps/api/.env locally).',
  );
}
if (!parsed.success) {
  for (const issue of parsed.error.issues) {
    configErrors.push(`${issue.path.join('.')}: ${issue.message}`);
  }
}

/**
 * Resolved support-bot settings. The key falls back to the XAI_* alias so an
 * xAI key works without editing anything but `.env`.
 *
 * `mode` is the honest answer to "will this call the network?": explicitly
 * offline, or auto with no key, both resolve to offline. Every caller branches
 * on this one value rather than re-deriving the rule.
 */
const supportKey = env.SUPPORT_LLM_API_KEY || process.env.XAI_API_KEY || '';
export const supportConfig = {
  apiKey: supportKey,
  baseUrl: process.env.XAI_BASE_URL || env.SUPPORT_LLM_BASE_URL,
  model: process.env.XAI_MODEL || env.SUPPORT_LLM_MODEL,
  modelFast: process.env.XAI_MODEL_FAST || env.SUPPORT_LLM_MODEL_FAST,
  guardModel: env.SUPPORT_LLM_GUARD_MODEL,
  guardThreshold: env.SUPPORT_GUARD_THRESHOLD,
  timeoutMs: env.SUPPORT_LLM_TIMEOUT_MS,
  maxOutputTokens: env.SUPPORT_LLM_MAX_OUTPUT_TOKENS,
  autofixEnabled: env.SUPPORT_AUTOFIX_ENABLED,
  maxFixesPerHour: env.SUPPORT_MAX_FIXES_PER_HOUR,
  undoWindowMin: env.SUPPORT_UNDO_WINDOW_MIN,
  mode: (env.SUPPORT_BOT_MODE === 'offline' || !supportKey ? 'offline' : 'auto') as
    | 'auto'
    | 'offline',
} as const;

export const corsOrigins = env.CORS_ORIGIN.split(',')
  .map((o) => o.trim())
  .filter(Boolean);

/**
 * CORS check.
 *
 * Vercel gives every deployment its own preview URL, so an exact allow-list would
 * break each time. Any `*.vercel.app` origin is accepted in addition to the
 * configured list; a real deployment should set CORS_ORIGIN to its own domain.
 */
export function isAllowedOrigin(origin?: string): boolean {
  if (!origin) return true; // same-origin, curl, server-to-server
  if (corsOrigins.includes(origin)) return true;
  try {
    return new URL(origin).hostname.endsWith('.vercel.app');
  } catch {
    return false;
  }
}

export const isProd = env.NODE_ENV === 'production';

/** Domains permitted to self-register, lower-cased and stripped of any leading '@'. */
export const allowedEmailDomains = env.ALLOWED_EMAIL_DOMAINS.split(',')
  .map((d) => d.trim().toLowerCase().replace(/^@/, ''))
  .filter(Boolean);
