/**
 * Deterministic answering with no model and no network.
 *
 * Used when SUPPORT_BOT_MODE=offline, when no API key is configured, and
 * whenever a live call fails. The important property is that it proposes the
 * *same registry fix* as the online path, because each error document carries
 * its remediation in front-matter (`fix: create_missing_sla_policy`). Auto-fix
 * therefore keeps working with the network unplugged — which is how the demo is
 * rehearsed.
 */
import { matchError, retrieve, type RetrievedChunk } from './retriever';
import type { SupportReply } from './schema';
import { REFUSAL, CHAIN_REFUSAL, isChainRepairRequest } from './scope.guard';

/** Pulls the named section out of the retrieved chunks for one document. */
function section(chunks: RetrievedChunk[], name: string): string | null {
  const hit = chunks.find((c) => c.section.toLowerCase() === name.toLowerCase());
  return hit ? hit.body.replace(/\s+/g, ' ').trim() : null;
}

function firstSentences(text: string, count: number): string {
  const parts = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  return parts.slice(0, count).join(' ');
}

export async function answerOffline(input: {
  message: string;
  lang: 'en' | 'hi';
  errorCode?: string | null;
  role: string;
}): Promise<SupportReply> {
  const hi = input.lang === 'hi';

  // The chain-repair refusal is not a model behaviour — it is a hard rule that
  // holds identically online and offline.
  if (isChainRepairRequest(input.message)) {
    return {
      inScope: true,
      answer: hi ? CHAIN_REFUSAL.hi : CHAIN_REFUSAL.en,
      confidence: 'high',
      citations: ['audit-chain-broken#0'],
      suggestedFix: null,
      followUps: [],
      offline: true,
    };
  }

  const errChunks = await matchError(`${input.message} ${input.errorCode ?? ''}`);
  const top = errChunks[0];

  if (top?.errorCode) {
    const why = section(errChunks, 'Why');
    const todo = section(errChunks, 'What to do');
    const fixDoc = errChunks.find((c) => c.fixAction)?.fixAction ?? null;

    const answer = [why ? firstSentences(why, 2) : null, todo ? firstSentences(todo, 2) : null]
      .filter(Boolean)
      .join(' ');

    return {
      inScope: true,
      answer: answer || top.body.slice(0, 400),
      confidence: 'high',
      citations: errChunks.slice(0, 3).map((c) => c.slug),
      suggestedFix: fixDoc
        ? {
            action: fixDoc,
            args: {},
            reason: hi
              ? 'ज्ञान-कोष में दर्ज उपाय के अनुसार।'
              : 'This is the documented remedy for this error.',
          }
        : null,
      followUps: [],
      offline: true,
    };
  }

  // Not an error report — try the feature documentation.
  const chunks = await retrieve(input.message, { limit: 4 });
  if (chunks.length === 0) {
    return {
      inScope: false,
      answer: hi ? REFUSAL.hi : REFUSAL.en,
      confidence: 'low',
      citations: [],
      suggestedFix: null,
      followUps: [],
      offline: true,
    };
  }

  const best = chunks[0];
  return {
    inScope: true,
    answer: firstSentences(best.body.replace(/\s+/g, ' ').trim(), 3),
    confidence: 'medium',
    citations: chunks.slice(0, 3).map((c) => c.slug),
    suggestedFix: null,
    followUps: [],
    offline: true,
  };
}
