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

/**
 * Subjects that are never about this system, matched against the model's own
 * `questionSubject`. This is a backstop for the wrapper trick: even if the
 * model talks itself into inScope=true, naming the subject as "cricket" or
 * "translation" is enough for the server to refuse on its behalf.
 */
const OFF_TOPIC_SUBJECT =
  /\b(politic|prime minister|president|election|cricket|football|sport|match|weather|gold rate|stock|share price|recipe|poem|poetry|joke|song|movie|film|translat|french|spanish|german|quantum|physics|chemistry|biology|history of|capital of|maths|mathematic|programming|python|javascript|code|algorithm|laptop|hardware|gaming|medical|health advice|legal advice|religio)/i;

/**
 * Off-topic markers matched against a raw question.
 *
 * The model path gets its scope judgement from the model, which is good at
 * this. The offline path has only keyword matching, and keyword matching finds
 * coincidences: "tell me today's gold rate" lands on the Admin overview page
 * because it shares "admin" and "today". This is that path's equivalent of the
 * subject check, and it is deliberately narrow — subjects nobody would ever
 * ask a task-management system about.
 */
const OFF_TOPIC_MESSAGE =
  /\b(gold rate|share price|stock market|world cup|cricket|football|weather|horoscope|recipe|poem|poetry|joke|song lyrics|movie|translate|translation|in french|in spanish|in german|prime minister|president of|capital of|quantum|entanglement|linked list|python function|javascript|algorithm|laptop|smartphone|gaming|annoying|what should i (say|do) to (him|her|them)|personal advice|medical advice|legal advice)\b/i;

/** True when a question is plainly about something this system has no view on. */
export function looksOffTopic(text: string): boolean {
  return OFF_TOPIC_MESSAGE.test(text);
}

/** A greeting, rather than a question. */
export function isGreeting(text: string): boolean {
  return /^\s*(hi|hey|hello+|yo|namaste|namaskar|hii+|good (morning|afternoon|evening)|नमस्ते|नमस्कार|हाय)[\s!.,?]*$/i.test(
    text.trim(),
  );
}

/**
 * Said when the question IS about this system but nothing in the knowledge base
 * matched it well enough to answer from.
 *
 * Deliberately not the scope refusal. Telling somebody who asked "how do I use
 * this app?" that you only answer questions about this app is both wrong and
 * insulting — "I don't have that" and "that's not my subject" are different
 * answers and must read differently.
 */
export const NO_MATCH = {
  en:
    "I don't have a specific answer for that one. I can help with tasks and deadlines, " +
    'dashboards, approvals and reviews, alerts, burnout and morale, the fraud centre, ' +
    'the audit chain, and anything that has gone wrong on screen — try asking about one ' +
    'of those, or paste the error you are seeing.',
  hi:
    'इसका सटीक उत्तर मेरे पास नहीं है। मैं कार्य और समय-सीमा, डैशबोर्ड, स्वीकृति और समीक्षा, ' +
    'अलर्ट, बर्नआउट और मनोबल, फ़्रॉड सेंटर, ऑडिट श्रृंखला, और स्क्रीन पर आई किसी भी त्रुटि में ' +
    'मदद कर सकता हूँ — इनमें से कुछ पूछिए, या जो त्रुटि दिख रही है उसे चिपका दीजिए।',
} as const;

/** Opening line for a greeting — friendly, and immediately useful. */
export const GREETING = {
  en:
    "Namaste. I'm Saarthi, the built-in help for SMARTWORK 360. Ask me how any screen " +
    'works, why something was refused, or paste an error and I will explain it — and fix ' +
    'it where I safely can.',
  hi:
    'नमस्ते। मैं सारथी हूँ, SMARTWORK 360 की अंतर्निहित सहायता। किसी भी स्क्रीन के बारे में ' +
    'पूछिए, कुछ अस्वीकार क्यों हुआ यह जानिए, या त्रुटि चिपकाइए — मैं समझाऊँगा, और जहाँ ' +
    'सुरक्षित हो वहाँ ठीक भी कर दूँगा।',
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

  // 2. A greeting is answered, never refused — whatever the model decided.
  if (isGreeting(userMessage)) {
    notes.push('greeting');
    return {
      reply: {
        ...out,
        inScope: true,
        answer: out.inScope && out.answer.trim() ? out.answer : opts.lang === 'hi' ? GREETING.hi : GREETING.en,
        confidence: 'high',
        suggestedFix: null,
      },
      notes,
    };
  }

  // 3. Out of scope → the standard refusal, in the caller's language. The
  //    model's own out-of-scope prose is discarded so the wording cannot drift.
  if (!out.inScope || OFF_TOPIC_SUBJECT.test(out.questionSubject)) {
    if (out.inScope) notes.push(`off-topic-subject:${out.questionSubject}`);
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

  // 4. A confident answer that cites nothing is an answer from memory rather
  //    than from the knowledge base. Keep it, but stop presenting it as certain.
  if (out.confidence === 'high' && out.citations.length === 0) {
    notes.push('uncited-high-confidence-downgraded');
    out.confidence = 'low';
    out.answer += opts.lang === 'hi' ? UNVERIFIED_SUFFIX.hi : UNVERIFIED_SUFFIX.en;
  }

  // 5. A fix naming an action that does not exist is dropped — the answer
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
