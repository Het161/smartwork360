/**
 * Deterministic answering with no model and no network.
 *
 * Used when SUPPORT_BOT_MODE=offline, when no API key is configured, and
 * whenever a live call fails — which is not hypothetical: a rate-limited
 * provider lands here mid-demo.
 *
 * The important property is that it proposes the *same registry fix* as the
 * online path, because each error document carries its remediation in
 * front-matter (`fix: create_missing_sla_policy`). Auto-fix therefore keeps
 * working with the network unplugged.
 *
 * Having no model to reason with, it is deliberately reluctant: it answers only
 * when a document clears both a rank floor and a term-coverage floor, and
 * refuses otherwise. A confident wrong answer is worse than "I don't know".
 */
import { matchError, matchFeature, type RetrievedChunk } from './retriever';
import type { SupportReply, SuggestedFix } from './schema';
import { REFUSAL, CHAIN_REFUSAL, isChainRepairRequest, looksOffTopic } from './scope.guard';
import { rolesAllowedFor } from './remediation/registry';
import type { Role } from '@smartwork/shared';

/**
 * Floors a document must clear before this path will answer from it.
 *
 * Neither signal works alone. Measured over 14 probes:
 *   "tell me today's gold RATE"               rank 4.20, coverage 1 -> refused
 *   "who is the prime minister"               rank 0.40, coverage 2 -> refused
 *   "cannot create a CRITICAL task in HEALTH" rank 0.80, coverage 2 -> answered
 */
const MIN_RANK = 0.5;
const MIN_COVERAGE = 2;
// Features use rank, errors use coverage — and the reason is the corpora, not
// taste. The error documents are full of near-synonyms ("code", "email",
// "account" appear across most of them), so repetition misleads and only the
// count of distinct discriminating terms separates them. The feature documents
// each describe a different screen, so they are already distinct and rank alone
// is decisive. Measured: off-topic features score 0.0-1.2, genuine ones 2.6-4.0,
// while their coverage overlaps completely (both 1-3).
const MIN_FEATURE_RANK = 2.0;
const MIN_FEATURE_COVERAGE = 1;

function section(chunks: RetrievedChunk[], name: string): string | null {
  const hit = chunks.find((c) => c.section.toLowerCase() === name.toLowerCase());
  return hit ? hit.body.replace(/\s+/g, ' ').trim() : null;
}

function firstSentences(text: string, count: number): string {
  return text
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean)
    .slice(0, count)
    .join(' ');
}

/**
 * Fills in a fix's arguments without a model.
 *
 * Everything usable comes from the server's own record of the failed request —
 * when task creation fails, its details carry the department and the priority.
 * That is exactly the path the demo takes ("Ask Saarthi about this" on a real
 * error), so offline auto-fix works there. A hand-typed sentence containing no
 * identifiers yields nothing, and the fix is dropped rather than guessed at.
 */
function argsFromContext(
  action: string,
  ctx: { errorDetails?: string | null; departmentId?: string | null; message?: string },
): Record<string, unknown> | null {
  // The server's error record is the reliable source, but a user may also type
  // the identifiers themselves ("...for the Health department, id dpt_hlt"), so
  // both are searched. Everything found is still validated against the action's
  // own schema before it can become a button.
  const text = `${ctx.errorDetails ?? ''}\n${ctx.message ?? ''}`;
  const pick = (key: string) =>
    new RegExp(`"?${key}"?\\s*[:=]\\s*"?([A-Za-z0-9_-]{2,40})"?`, 'i').exec(text)?.[1] ?? null;

  switch (action) {
    case 'create_missing_sla_policy': {
      const departmentId = pick('departmentId') ?? ctx.departmentId ?? null;
      const priority = /\b(LOW|MEDIUM|HIGH|CRITICAL)\b/.exec(text)?.[1] ?? null;
      return departmentId && priority ? { departmentId, priority } : null;
    }
    case 'assign_user_department': {
      const userId = pick('userId');
      const departmentId = pick('departmentId');
      return userId && departmentId ? { userId, departmentId } : null;
    }
    case 'resend_verification_otp': {
      const email = /[\w.+-]+@[\w-]+\.[\w.-]+/.exec(text)?.[0] ?? null;
      return email ? { email } : null;
    }
    case 'force_status_transition':
    case 'recompute_sentiment_for_task': {
      const taskId = pick('taskId');
      return taskId ? { taskId } : null;
    }
    case 'approve_pending_user':
    case 'reassign_task':
    case 'reopen_fraud_alert':
      // These name a specific person, task or alert. Picking one out of prose
      // would be worse than offering nothing.
      return null;
    default:
      // Actions that take no arguments validate fine with an empty object.
      return {};
  }
}

export async function answerOffline(input: {
  message: string;
  lang: 'en' | 'hi';
  errorCode?: string | null;
  role: string;
  errorDetails?: string | null;
  departmentId?: string | null;
}): Promise<SupportReply> {
  const hi = input.lang === 'hi';

  // The chain-repair refusal is not a model behaviour — it is a hard rule that
  // holds identically online and offline.
  if (isChainRepairRequest(input.message)) {
    return {
      questionSubject: 'audit chain repair',
      inScope: true,
      answer: hi ? CHAIN_REFUSAL.hi : CHAIN_REFUSAL.en,
      confidence: 'high',
      citations: ['audit-chain-broken#0'],
      suggestedFix: null,
      followUps: [],
      offline: true,
    };
  }

  const refuse = (): SupportReply => ({
    questionSubject: '',
    inScope: false,
    answer: hi ? REFUSAL.hi : REFUSAL.en,
    confidence: 'low',
    citations: [],
    suggestedFix: null,
    followUps: [],
    offline: true,
  });

  // Refuse plainly off-topic questions before any matching runs. Without this
  // the keyword search finds a coincidence for almost anything.
  if (looksOffTopic(input.message)) return refuse();

  // ---- error documents -------------------------------------------------
  const errChunks = await matchError(`${input.message} ${input.errorCode ?? ''}`);
  const top: RetrievedChunk | undefined = errChunks[0];
  const codeMatchesExactly = Boolean(input.errorCode && top?.errorCode === input.errorCode);
  const strong = !!top && top.rank >= MIN_RANK && (top.coverage ?? 0) >= MIN_COVERAGE;

  if (top?.errorCode && (codeMatchesExactly || strong)) {
    const why = section(errChunks, 'Why');
    const todo = section(errChunks, 'What to do');
    const fixAction = errChunks.find((c) => c.fixAction)?.fixAction ?? null;

    let suggestedFix: SuggestedFix | null = null;
    if (fixAction) {
      const args = argsFromContext(fixAction, {
        errorDetails: input.errorDetails,
        departmentId: input.departmentId,
        message: input.message,
      });
      if (args) {
        suggestedFix = {
          action: fixAction,
          args,
          reason: hi
            ? 'ज्ञान-कोष में इस त्रुटि के लिए दर्ज उपाय।'
            : 'This is the documented remedy for this error.',
        };
      }
    }

    let answer = [why ? firstSentences(why, 2) : null, todo ? firstSentences(todo, 2) : null]
      .filter(Boolean)
      .join(' ');

    // Naming the role is useful even when no fix can be offered — otherwise an
    // employee reads an explanation and still does not know who to ask.
    if (fixAction && !suggestedFix) {
      const roles = rolesAllowedFor(fixAction);
      if (roles.length && !roles.includes(input.role as Role)) {
        const who = roles.join(' or ').toLowerCase();
        answer += hi
          ? ` यह बदलाव केवल ${who === 'admin' ? 'प्रशासक' : who} कर सकते हैं।`
          : ` Only ${who === 'admin' ? 'an administrator' : `a ${who}`} can make that change.`;
      }
    }

    return {
      questionSubject: top.errorCode,
      inScope: true,
      answer: answer || firstSentences(top.body.replace(/\s+/g, ' ').trim(), 3),
      confidence: codeMatchesExactly ? 'high' : 'medium',
      citations: errChunks.slice(0, 3).map((c) => c.slug),
      suggestedFix,
      followUps: [],
      offline: true,
    };
  }

  // ---- feature documents ----------------------------------------------
  const feat = await matchFeature(input.message);
  const best = feat[0];
  if (!best || best.rank < MIN_FEATURE_RANK || (best.coverage ?? 0) < MIN_FEATURE_COVERAGE) {
    return refuse();
  }

  return {
    questionSubject: best.title,
    inScope: true,
    answer: firstSentences(best.body.replace(/\s+/g, ' ').trim(), 3),
    confidence: 'medium',
    citations: feat.slice(0, 3).map((c) => c.slug),
    suggestedFix: null,
    followUps: [],
    offline: true,
  };
}
