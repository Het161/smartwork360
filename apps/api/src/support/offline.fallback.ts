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
import {
  REFUSAL,
  CHAIN_REFUSAL,
  NO_MATCH,
  GREETING,
  isChainRepairRequest,
  isGreeting,
  looksOffTopic,
} from './scope.guard';
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

/**
 * Devanagari questions score structurally lower and need their own floors.
 *
 * The documents are written in English; a Hindi question can only match the
 * short Hindi keyword block, so it earns a fraction of the rank an equivalent
 * English question does. Judging both by the English floor silently made the
 * assistant far less useful in Hindi than in English — which, for a system
 * whose whole interface is bilingual, is not a small thing.
 */
const HAS_DEVANAGARI = /[\u0900-\u097F]/;
const MIN_FEATURE_RANK_HI = 0.8;

function section(chunks: RetrievedChunk[], name: string): string | null {
  const hit = chunks.find((c) => c.section.toLowerCase() === name.toLowerCase());
  return hit ? clean(hit.body) : null;
}

/**
 * Markdown out, prose in.
 *
 * These documents are written for humans to read as markdown, but this path
 * puts them straight into a chat bubble, where `**bold**` and `- ` arrive as
 * literal punctuation. Numbered steps keep their numbers because losing them
 * makes an ordered procedure unreadable.
 */
function clean(md: string): string {
  return md
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^\s*[-*]\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * A readable extract: whole sentences up to a length budget, rather than a
 * fixed sentence count. A numbered procedure has short sentences and needs
 * several; a definition needs one or two.
 */
function summarise(text: string, maxChars = 340): string {
  // Not a plain "split on full stop": a numbered step ends "…dashboard. 2." and
  // splitting there strands the bare numeral at the end of the extract.
  const parts = clean(text)
    .split(/(?<=[.!?])\s+(?!\d+\.)/)
    .filter(Boolean);
  const out: string[] = [];
  let len = 0;
  for (const part of parts) {
    if (out.length && len + part.length > maxChars) break;
    out.push(part);
    len += part.length + 1;
  }
  // A numbered step reads "…like. 3. Work through…", so the last kept part can
  // end on the numeral that introduces the step we dropped. Trim that orphan.
  return out.join(' ').replace(/\s*\d+\.$/, '').trim();
}

/** "Tell me about this thing" rather than "why did this specific thing happen". */
function isBroadQuestion(text: string): boolean {
  return /\b(introduction|introduce|overview|about (this|the)|what is (this|smartwork)|what does this (app|system)|how (do i|to) use|get(ting)? started|begin|basics|summary|purpose|explain the (app|system)|what can you do)\b/i.test(
    text,
  );
}

/**
 * Reads as a report of something going wrong, rather than a request to explain
 * how something works. This is what decides between the error catalogue and the
 * screen documentation — rank cannot, because the two matchers score on
 * different scales ("my dashboard is empty" needs the error document despite
 * the feature document scoring higher).
 */
function looksLikeProblem(text: string): boolean {
  const symptom =
    /\b(error|errors|failed|failing|fails|fail|cannot|can'?t|could ?n'?t|won'?t|not working|does ?n'?t work|broken|stuck|refused|rejected|blocked|denied|forbidden|empty|blank|missing|expired|locked|timed out|springs? back|snap(s|ped)? back|why (did|does|can'?t|is)|no longer)\b/i;
  // An imperative asking the system to DO something is an action request, not a
  // request to explain a screen — and the error catalogue is what carries the
  // remediation, including who is allowed to run it.
  const imperative =
    /\b(approve|reassign|reopen|resend|re-?send|assign|unlock|repair|reset|recompute|clear|fix)\b/i;
  return symptom.test(text) || imperative.test(text);
}

/**
 * Which section of a document to answer from.
 *
 * A broad question wants the document's opening definition; anything else wants
 * whichever section actually matched. Demoting "Common confusions" outright was
 * wrong — for "why can I not mark my own task complete" that section IS the
 * answer.
 */
function pickChunk(chunks: RetrievedChunk[], broad: boolean): RetrievedChunk | undefined {
  const best = chunks[0];
  if (!best) return undefined;
  // Only override when the best match is the FAQ AND the question was broad —
  // "give me an introduction" was being answered with two FAQ entries. For
  // "how do I get started" the best match IS the right section, and for a
  // specific question the FAQ is often exactly the answer.
  const isFaq = /^common confusions$/i.test(best.section);
  if (!broad || !isFaq) return best;
  return (
    [...chunks].sort(
      (a, b) => Number(a.slug.split('#')[1] ?? 0) - Number(b.slug.split('#')[1] ?? 0),
    )[0] ?? best
  );
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

  /** The subject is not ours. */
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

  /**
   * The subject IS ours, but nothing matched well enough to answer from.
   * Kept distinct from `refuse` — "I don't have that" and "that's not my
   * subject" are different answers and must not share wording.
   */
  const noMatch = (): SupportReply => ({
    questionSubject: 'smartwork 360 (general)',
    inScope: true,
    answer: hi ? NO_MATCH.hi : NO_MATCH.en,
    confidence: 'low',
    citations: [],
    suggestedFix: null,
    followUps: [],
    offline: true,
  });

  // A greeting is not a question to look up. Answering "hi" with a scope
  // refusal is the rudest possible opening.
  if (isGreeting(input.message)) {
    return {
      questionSubject: 'greeting',
      inScope: true,
      answer: hi ? GREETING.hi : GREETING.en,
      confidence: 'high',
      citations: [],
      suggestedFix: null,
      followUps: [],
      offline: true,
    };
  }

  // Refuse plainly off-topic questions before any matching runs. Without this
  // the keyword search finds a coincidence for almost anything.
  if (looksOffTopic(input.message)) return refuse();

  // ---- gather both candidates, then decide ----------------------------
  const [errChunks, featChunks] = await Promise.all([
    matchError(`${input.message} ${input.errorCode ?? ''}`),
    matchFeature(input.message),
  ]);

  const top: RetrievedChunk | undefined = errChunks[0];
  const codeMatchesExactly = Boolean(input.errorCode && top?.errorCode === input.errorCode);
  const errorUsable = !!top && top.rank >= MIN_RANK && (top.coverage ?? 0) >= MIN_COVERAGE;

  const broad = isBroadQuestion(input.message);
  const featTop = pickChunk(featChunks, broad);
  const devanagari = HAS_DEVANAGARI.test(input.message);
  const featureFloor = devanagari ? MIN_FEATURE_RANK_HI : MIN_FEATURE_RANK;
  const featureUsable =
    !!featTop && featTop.rank >= featureFloor && (featTop.coverage ?? 0) >= MIN_FEATURE_COVERAGE;

  /*
   * An explicit code always wins. Otherwise the error catalogue answers reports
   * of things going wrong, and the screen documentation answers requests to
   * explain how something works. Preferring by score does not work: the two
   * matchers are not on a common scale.
   */
  const preferError =
    codeMatchesExactly || (errorUsable && (looksLikeProblem(input.message) || !featureUsable));

  if (top?.errorCode && preferError) {
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

    let answer = [why ? summarise(why, 260) : null, todo ? summarise(todo, 260) : null]
      .filter(Boolean)
      .join(' ');

    // Naming the role is useful even when no fix can be offered — otherwise an
    // employee reads an explanation and still does not know who to ask.
    if (fixAction && !suggestedFix) {
      const roles = rolesAllowedFor(fixAction);
      if (roles.length && !roles.includes(input.role as Role)) {
        const who = roles.join(' or ').toLowerCase();
        const whoEn = who
          .replace(/\badmin\b/g, 'an administrator')
          .replace(/\bmanager\b/g, 'a manager')
          .replace(/\bemployee\b/g, 'an employee');
        answer += hi
          ? ` यह बदलाव केवल ${who.includes('admin') ? 'प्रशासक' : 'प्रबंधक'} कर सकते हैं।`
          : ` Only ${whoEn} can make that change.`;
      }
    }

    return {
      questionSubject: top.errorCode,
      inScope: true,
      answer: answer || summarise(top.body),
      confidence: codeMatchesExactly ? 'high' : 'medium',
      citations: errChunks.slice(0, 3).map((c) => c.slug),
      suggestedFix,
      followUps: [],
      offline: true,
    };
  }

  // ---- feature documents ----------------------------------------------
  if (!featureUsable || !featTop) {
    // Not off-topic (that was checked above), just unmatched.
    return noMatch();
  }
  const best = featTop;

  const extract = summarise(best.body);
  // Say so rather than pretending. Without a model to translate, this path can
  // only quote the documentation it has, and that documentation is English.
  const needsNote = hi && !HAS_DEVANAGARI.test(extract);

  return {
    questionSubject: best.title,
    inScope: true,
    answer: needsNote ? `(यह जानकारी अंग्रेज़ी में उपलब्ध है)\n${extract}` : extract,
    confidence: 'medium',
    citations: [
      best.slug,
      ...featChunks.slice(0, 2).map((c) => c.slug).filter((x) => x !== best.slug),
    ],
    suggestedFix: null,
    followUps: [],
    offline: true,
  };
}
