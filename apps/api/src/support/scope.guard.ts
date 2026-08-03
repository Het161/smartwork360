/**
 * Layer 3 of scope locking — the server post-check.
 *
 * Layers 1 and 2 (a grounded system prompt and strict structured output) shape
 * what the model *tends* to produce. This file decides what the user is
 * actually allowed to receive, and it runs on every reply from every path.
 * A model that ignores its instructions changes nothing here.
 */
import type { SupportReply } from './schema';

export const REFUSAL = {
  en:
    "I can only help with SMARTWORK 360 — tasks, dashboards, approvals, alerts and audit. " +
    "Ask me anything about this system and I'll help.",
  hi:
    'मैं केवल SMARTWORK 360 से जुड़े सवालों में मदद कर सकता हूँ — कार्य, डैशबोर्ड, स्वीकृति, ' +
    'अलर्ट और ऑडिट। इस सिस्टम के बारे में कुछ भी पूछिए।',
} as const;

/**
 * The one refusal that is hard-coded rather than learned. It is both a security
 * requirement and, deliberately, a demo talking point.
 */
export const CHAIN_REFUSAL = {
  en:
    'I will not change the audit chain, and there is no action in this system that could. ' +
    'A broken chain is evidence that records were altered outside the application — repairing ' +
    'it would destroy the only proof that anything happened. Note the block index where ' +
    'verification first fails, take a backup, and escalate it as an incident.',
  hi:
    'मैं ऑडिट श्रृंखला में कोई बदलाव नहीं करूँगा, और इस सिस्टम में ऐसी कोई क्रिया मौजूद ही नहीं है। ' +
    'टूटी हुई श्रृंखला इस बात का प्रमाण है कि रिकॉर्ड ऐप के बाहर बदले गए — उसे "ठीक" करना उस ' +
    'एकमात्र प्रमाण को मिटा देगा। जिस ब्लॉक पर सत्यापन विफल हुआ उसे नोट करें, बैकअप लें, और ' +
    'इसे एक घटना के रूप में आगे बढ़ाएँ।',
} as const;

const UNVERIFIED_SUFFIX = {
  en: ' Please verify this with your administrator.',
  hi: ' कृपया इसे अपने प्रशासक से सत्यापित करें।',
} as const;

/**
 * Detects a request to tamper with the audit ledger, in either language and in
 * the euphemisms people actually reach for ("clean up", "reset", "make it green
 * again"). Matching is intentionally broad: a false positive costs one refusal
 * message, a false negative costs the integrity guarantee.
 */
export function isChainRepairRequest(text: string): boolean {
  const t = text.toLowerCase();
  const targetsChain =
    /(audit|chain|ledger|hash|block|anchor|merkle)/.test(t) ||
    /(ऑडिट|श्रृंखला|चेन|हैश|ब्लॉक)/.test(text);
  if (!targetsChain) return false;

  const wantsMutation =
    /(fix|repair|rebuild|rewrite|recompute|re-?hash|reset|restore|clean|clear|delete|remove|drop|alter|modify|edit|patch|correct|silence|suppress|bypass|skip|disable|make it (green|pass|valid)|force.*(pass|valid|green))/.test(
      t,
    ) || /(ठीक|सुधार|मिटा|हटा|बदल|रीसेट|दोबारा|पुनः)/.test(text);

  return wantsMutation;
}

export interface GuardOptions {
  lang: 'en' | 'hi';
  /** Action names that actually exist in the registry. */
  knownActions: ReadonlySet<string>;
  /** False when SUPPORT_AUTOFIX_ENABLED=false. */
  autofixEnabled: boolean;
}

export interface GuardResult {
  reply: SupportReply;
  /** Why the reply was altered — surfaced in logs, not to the user. */
  notes: string[];
}

/**
 * Applies every post-check. Returns a reply that is safe to send.
 */
export function guardReply(
  reply: SupportReply,
  userMessage: string,
  opts: GuardOptions,
): GuardResult {
  const notes: string[] = [];
  const out: SupportReply = { ...reply };

  // 1. Audit-chain repair is refused no matter what the model decided.
  if (isChainRepairRequest(userMessage)) {
    notes.push('chain-repair-refused');
    return {
      reply: {
        ...out,
        inScope: true,
        answer: opts.lang === 'hi' ? CHAIN_REFUSAL.hi : CHAIN_REFUSAL.en,
        confidence: 'high',
        citations: ['audit-chain-broken#0'],
        suggestedFix: null,
        followUps: [],
      },
      notes,
    };
  }

  // 2. Out of scope → the standard refusal, in the caller's language. The
  //    model's own out-of-scope prose is discarded so the wording cannot drift.
  if (!out.inScope) {
    notes.push('out-of-scope');
    return {
      reply: {
        ...out,
        answer: opts.lang === 'hi' ? REFUSAL.hi : REFUSAL.en,
        confidence: 'low',
        citations: [],
        suggestedFix: null,
        followUps: [],
      },
      notes,
    };
  }

  // 3. A confident answer that cites nothing is an answer from memory rather
  //    than from the knowledge base. Keep it, but stop presenting it as certain.
  if (out.confidence === 'high' && out.citations.length === 0) {
    notes.push('uncited-high-confidence-downgraded');
    out.confidence = 'low';
    out.answer += opts.lang === 'hi' ? UNVERIFIED_SUFFIX.hi : UNVERIFIED_SUFFIX.en;
  }

  // 4. A fix naming an action that does not exist is dropped — the answer
  //    survives, the invented capability does not.
  if (out.suggestedFix) {
    if (!opts.autofixEnabled) {
      notes.push('autofix-disabled');
      out.suggestedFix = null;
    } else if (!opts.knownActions.has(out.suggestedFix.action)) {
      notes.push(`unknown-action:${out.suggestedFix.action}`);
      out.suggestedFix = null;
    }
  }

  return { reply: out, notes };
}
