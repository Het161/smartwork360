/**
 * The contract for what the model is allowed to say.
 *
 * Two shapes on purpose:
 *  - `REPLY_JSON_SCHEMA` is sent to the provider's strict structured-output
 *    mode, so a malformed reply is impossible rather than merely unlikely.
 *  - `replySchema` re-validates on our side, because "the provider promised"
 *    is not a security control.
 */
import { z } from 'zod';

export const suggestedFixSchema = z.object({
  action: z.string().min(1).max(64),
  args: z.record(z.unknown()).default({}),
  reason: z.string().max(400).default(''),
});

export const replySchema = z.object({
  inScope: z.boolean(),
  answer: z.string().max(4000),
  confidence: z.enum(['high', 'medium', 'low']),
  citations: z.array(z.string().max(120)).max(12).default([]),
  suggestedFix: suggestedFixSchema.nullable().default(null),
  followUps: z.array(z.string().max(160)).max(3).default([]),
  /** Set by the server, never by the model. */
  offline: z.boolean().default(false),
});

export type SupportReply = z.infer<typeof replySchema>;
export type SuggestedFix = z.infer<typeof suggestedFixSchema>;

/**
 * The provider's strict mode requires `additionalProperties: false` on every
 * object, which cannot express a free-form `args` map. So the model returns
 * args as a JSON *string* and the server parses it — which is the safer order
 * anyway, since those arguments are validated against the action's own zod
 * schema before anything runs.
 */
export const REPLY_JSON_SCHEMA = {
  name: 'saarthi_reply',
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      inScope: { type: 'boolean' },
      answer: { type: 'string' },
      confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
      citations: { type: 'array', items: { type: 'string' } },
      suggestedFix: {
        anyOf: [
          { type: 'null' },
          {
            type: 'object',
            additionalProperties: false,
            properties: {
              action: { type: 'string' },
              argsJson: { type: 'string' },
              reason: { type: 'string' },
            },
            required: ['action', 'argsJson', 'reason'],
          },
        ],
      },
      followUps: { type: 'array', items: { type: 'string' } },
    },
    required: ['inScope', 'answer', 'confidence', 'citations', 'suggestedFix', 'followUps'],
  },
} as const;

/** Parses the model's raw JSON into our validated shape. */
export function parseModelReply(raw: string): SupportReply {
  const obj = JSON.parse(raw) as Record<string, unknown>;

  const fixRaw = obj.suggestedFix as
    | { action?: string; argsJson?: string; reason?: string }
    | null
    | undefined;

  let suggestedFix: SuggestedFix | null = null;
  if (fixRaw && typeof fixRaw.action === 'string' && fixRaw.action.trim()) {
    let args: Record<string, unknown> = {};
    try {
      const parsed: unknown = JSON.parse(fixRaw.argsJson ?? '{}');
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        args = parsed as Record<string, unknown>;
      }
    } catch {
      // A model that emits unparseable args gets an empty object; the action's
      // own schema then decides whether that is usable.
      args = {};
    }
    suggestedFix = { action: fixRaw.action.trim(), args, reason: fixRaw.reason ?? '' };
  }

  return replySchema.parse({ ...obj, suggestedFix });
}
