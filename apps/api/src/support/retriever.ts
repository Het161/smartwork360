/**
 * Retrieval over the knowledge base using Postgres full-text search.
 *
 * No vector database. With a KB this size, `ts_rank_cd` over a GIN index is
 * accurate enough, adds no infrastructure, needs no embedding API call, and —
 * the deciding factor — works with the network unplugged. An embedding service
 * would have made the offline demo depend on being online.
 */
import { prisma } from '../db/prisma';

export interface RetrievedChunk {
  slug: string;
  kind: string;
  title: string;
  section: string;
  body: string;
  errorCode: string | null;
  fixAction: string | null;
  rank: number;
}

/**
 * Lexeme → how many distinct error documents contain it.
 *
 * Postgres full-text ranking has no IDF: in an OR-query every matching term
 * contributes by frequency alone, so a word appearing throughout the corpus
 * ("task", "email", "account") outweighs the rare word that actually
 * identifies the problem ("health", "throttled"). Pruning those terms before
 * ranking is what makes the difference — normalisation flags do not, because
 * they scale the whole score rather than the misleading part of it.
 *
 * Cached; rebuilt whenever the KB is reindexed.
 */
let dfCache: { df: Map<string, number>; docs: number } | null = null;

export function invalidateDocFrequencies(): void {
  dfCache = null;
}

async function docFrequencies(): Promise<{ df: Map<string, number>; docs: number }> {
  if (dfCache) return dfCache;
  const rows = await prisma.$queryRawUnsafe<{ word: string; df: bigint }[]>(
    `SELECT w.word, count(DISTINCT k."errorCode") AS df
       FROM smartwork.kb_chunks k,
            LATERAL unnest(tsvector_to_array(k.tsv)) AS w(word)
      WHERE k.kind = 'ERROR' AND k."errorCode" IS NOT NULL
      GROUP BY w.word`,
  );
  const total = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
    `SELECT count(DISTINCT "errorCode") AS n FROM smartwork.kb_chunks WHERE kind = 'ERROR'`,
  );
  dfCache = {
    df: new Map(rows.map((r) => [r.word, Number(r.df)])),
    docs: Number(total[0]?.n ?? 0),
  };
  return dfCache;
}

/** Stems the caller's words the same way the index did. */
async function lexemes(text: string): Promise<string[]> {
  const rows = await prisma.$queryRawUnsafe<{ lex: string }[]>(
    `SELECT unnest(tsvector_to_array(to_tsvector('english', $1))) AS lex`,
    text.slice(0, 2000),
  );
  return rows.map((r) => r.lex);
}

/** Turns free text into a `to_tsquery` OR-expression, safely. */
function toQuery(text: string): string {
  const terms = text
    .toLowerCase()
    .replace(/[^a-z0-9_\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOP.has(t))
    .slice(0, 24);
  return terms.map((t) => `${t}:*`).join(' | ');
}

const STOP = new Set([
  'the', 'and', 'for', 'was', 'are', 'has', 'have', 'this', 'that', 'with', 'you', 'your',
  'why', 'how', 'what', 'when', 'not', 'can', 'cannot', 'does', 'did', 'but', 'from',
  'get', 'got', 'its', 'it', 'is', 'a', 'an', 'to', 'of', 'in', 'on', 'me', 'my',
]);

/**
 * Top-N chunks for a question.
 *
 * An exact error code is treated as a strong signal rather than just another
 * word: if the caller supplies one, its document is pulled in regardless of how
 * the surrounding prose ranks, because that document is definitionally the
 * answer.
 */
export async function retrieve(
  question: string,
  opts: { errorCode?: string | null; limit?: number } = {},
): Promise<RetrievedChunk[]> {
  const limit = opts.limit ?? 6;
  const query = toQuery(`${question} ${opts.errorCode ?? ''}`);
  const out: RetrievedChunk[] = [];

  if (opts.errorCode) {
    const pinned = await prisma.$queryRawUnsafe<RetrievedChunk[]>(
      `SELECT slug, kind::text, title, section, body, "errorCode", "fixAction", 1.0::float8 AS rank
         FROM smartwork.kb_chunks
        WHERE "errorCode" = $1
        ORDER BY section`,
      opts.errorCode,
    );
    out.push(...pinned);
  }

  if (query) {
    const rows = await prisma.$queryRawUnsafe<RetrievedChunk[]>(
      `SELECT slug, kind::text, title, section, body, "errorCode", "fixAction",
              ts_rank_cd(tsv, to_tsquery('english', $1))::float8 AS rank
         FROM smartwork.kb_chunks
        WHERE tsv @@ to_tsquery('english', $1)
        ORDER BY rank DESC
        LIMIT $2`,
      query,
      limit,
    );
    for (const r of rows) {
      if (!out.some((o) => o.slug === r.slug)) out.push(r);
    }
  }

  return out.slice(0, limit + (opts.errorCode ? 4 : 0));
}

/**
 * Best-matching ERROR document for a piece of text. Used by the offline
 * fallback, which has no model to reason with and must match deterministically.
 */
export async function matchError(text: string): Promise<RetrievedChunk[]> {
  // An explicit error code in the text beats any amount of prose matching.
  const code = /\b([A-Z][A-Z0-9]+(?:_[A-Z0-9]+){1,4})\b/.exec(text)?.[1] ?? null;
  if (code) {
    const rows = await prisma.$queryRawUnsafe<RetrievedChunk[]>(
      `SELECT slug, kind::text, title, section, body, "errorCode", "fixAction", 1.0::float8 AS rank
         FROM smartwork.kb_chunks WHERE "errorCode" = $1 ORDER BY section`,
      code,
    );
    if (rows.length) return rows;
  }

  // Keep only lexemes that actually discriminate. A term found in more than
  // 40% of the error documents cannot tell them apart, and at OR-query time it
  // only adds noise proportional to how often the document repeats it.
  const { df, docs } = await docFrequencies();
  const cutoff = Math.max(2, Math.ceil(docs * 0.4));
  const all = await lexemes(text);
  const rare = all.filter((l) => (df.get(l) ?? 0) <= cutoff);
  // If every term was common, fall back to the full set rather than matching
  // nothing — a weak ranking still beats no answer.
  const chosen = rare.length > 0 ? rare : all;
  const query = chosen.map((l) => `${l}:*`).join(' | ');
  if (!query) return [];

  // Score per DOCUMENT, not per chunk. Ranking chunks individually lets a long
  // document win simply by having more sections that mention a common word —
  // the question is "which error is this?", so the whole document competes as
  // one unit and its best-matching section only breaks ties.
  const best = await prisma.$queryRawUnsafe<{ errorCode: string }[]>(
    `SELECT "errorCode",
            sum(ts_rank_cd(tsv, to_tsquery('english', $1)))::float8 AS score,
            max(ts_rank_cd(tsv, to_tsquery('english', $1)))::float8 AS peak
       FROM smartwork.kb_chunks
      WHERE kind = 'ERROR' AND "errorCode" IS NOT NULL
        AND tsv @@ to_tsquery('english', $1)
      GROUP BY "errorCode"
      ORDER BY score DESC, peak DESC
      LIMIT 1`,
    query,
  );
  if (best.length === 0) return [];

  return prisma.$queryRawUnsafe<RetrievedChunk[]>(
    `SELECT slug, kind::text, title, section, body, "errorCode", "fixAction",
            ts_rank_cd(tsv, to_tsquery('english', $2))::float8 AS rank
       FROM smartwork.kb_chunks
      WHERE "errorCode" = $1
      ORDER BY rank DESC`,
    best[0].errorCode,
    query,
  );
}
