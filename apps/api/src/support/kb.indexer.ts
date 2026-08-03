/**
 * Reads the committed markdown knowledge base into `kb_chunks` and maintains
 * the Postgres full-text vector used for retrieval.
 *
 * Chunking is by `##` section rather than by a fixed character count: these
 * documents are already written in short, self-contained sections ("Why", "What
 * to do", "Auto-fix available"), and a section is exactly the unit a support
 * answer wants to cite. Splitting mid-sentence at 500 characters would produce
 * chunks that retrieve well and read badly.
 */
import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { prisma } from '../db/prisma';
import { invalidateDocFrequencies } from './retriever';
import { logger } from '../config/logger';

const KB_DIR = path.join(__dirname, 'kb');

/** Where the KB lives at runtime — src in dev (tsx), dist after a build. */
function resolveKbDir(): string {
  if (fs.existsSync(KB_DIR)) return KB_DIR;
  // tsc does not copy .md files, so a compiled build reads them from src.
  const fromSrc = path.join(process.cwd(), 'src', 'support', 'kb');
  if (fs.existsSync(fromSrc)) return fromSrc;
  const fromApi = path.join(process.cwd(), 'apps', 'api', 'src', 'support', 'kb');
  return fromApi;
}

export interface ParsedChunk {
  slug: string;
  kind: 'FEATURE' | 'ERROR' | 'POLICY';
  title: string;
  section: string;
  body: string;
  tags: string[];
  errorCode: string | null;
  httpStatus: number | null;
  roles: string[];
  fixAction: string | null;
}

function splitSections(markdown: string): { section: string; body: string }[] {
  const lines = markdown.split('\n');
  const out: { section: string; body: string }[] = [];
  let section = 'Overview';
  let buf: string[] = [];

  const flush = () => {
    const body = buf.join('\n').trim();
    if (body) out.push({ section, body });
    buf = [];
  };

  for (const line of lines) {
    const heading = /^##\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      section = heading[1].trim();
    } else {
      buf.push(line);
    }
  }
  flush();
  return out;
}

/** Reads every markdown file and returns the chunks it would index. */
export function parseKb(): ParsedChunk[] {
  const dir = resolveKbDir();
  const chunks: ParsedChunk[] = [];

  const read = (file: string, kind: ParsedChunk['kind']) => {
    const raw = fs.readFileSync(file, 'utf8');
    const { data, content } = matter(raw);
    const base = path.basename(file, '.md');
    const title = String(data.title ?? base);

    for (const [i, s] of splitSections(content).entries()) {
      chunks.push({
        slug: `${base}#${i}`,
        kind,
        title,
        section: s.section,
        body: s.body,
        tags: [
          base,
          // `keywords` exists purely for retrieval: the words a frustrated user
          // actually types, which are often not the words the doc is titled with.
          ...String(data.keywords ?? '')
            .toLowerCase()
            .split(/\s+/)
            .filter(Boolean),
          ...String(data.summary ?? '')
            .toLowerCase()
            .split(/[^a-z0-9]+/)
            .filter((t) => t.length > 3),
        ],
        errorCode: data.code ? String(data.code) : null,
        httpStatus: data.httpStatus ? Number(data.httpStatus) : null,
        roles: Array.isArray(data.roles) ? data.roles.map(String) : [],
        // `fix: null` in the front-matter means "known problem, deliberately
        // not auto-fixable" — different from a doc that never mentions a fix.
        fixAction: data.fix && String(data.fix) !== 'null' ? String(data.fix) : null,
      });
    }
  };

  for (const sub of ['errors', 'features'] as const) {
    const d = path.join(dir, sub);
    if (!fs.existsSync(d)) continue;
    for (const f of fs.readdirSync(d).filter((f) => f.endsWith('.md'))) {
      read(path.join(d, f), sub === 'errors' ? 'ERROR' : 'FEATURE');
    }
  }
  const policies = path.join(dir, 'policies.md');
  if (fs.existsSync(policies)) read(policies, 'POLICY');

  return chunks;
}

/**
 * Rebuilds the index. Idempotent: safe to run at every boot and from the admin
 * reindex endpoint.
 */
export async function reindexKb(): Promise<{ chunks: number }> {
  const chunks = parseKb();
  if (chunks.length === 0) {
    logger.warn('saarthi support: no KB files found — retrieval will return nothing');
    return { chunks: 0 };
  }

  await prisma.$transaction(async (tx) => {
    await tx.kbChunk.deleteMany({});
    await tx.kbChunk.createMany({
      data: chunks.map((c) => ({
        slug: c.slug,
        kind: c.kind,
        title: c.title,
        section: c.section,
        body: c.body,
        tags: c.tags,
        errorCode: c.errorCode,
        httpStatus: c.httpStatus,
        roles: c.roles,
        fixAction: c.fixAction,
      })),
    });
  });

  // The tsvector is maintained here rather than as a GENERATED column so that
  // `prisma db push` stays authoritative for the schema.
  //
  // Weighting: curated keywords and the error code rank above the prose title.
  // Titles are written to be read, so they share ordinary words — several error
  // titles contain "email" or "code" — and at top weight those common words let
  // one document capture queries that belong to another.
  await prisma.$executeRawUnsafe(`
    UPDATE smartwork.kb_chunks SET tsv =
      setweight(to_tsvector('english', coalesce("errorCode",'')), 'A') ||
      setweight(to_tsvector('english', array_to_string(tags, ' ')), 'A') ||
      setweight(to_tsvector('english', coalesce(title,'')), 'B') ||
      setweight(to_tsvector('english', coalesce(section,'')), 'B') ||
      setweight(to_tsvector('english', coalesce(body,'')), 'C')
  `);
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS kb_chunks_tsv_idx ON smartwork.kb_chunks USING GIN (tsv)`,
  );

  invalidateDocFrequencies();
  logger.info({ chunks: chunks.length }, 'saarthi support: knowledge base indexed');
  return { chunks: chunks.length };
}

/** Indexes on boot only when the table is empty, so restarts stay fast. */
export async function ensureKbIndexed(): Promise<void> {
  try {
    const count = await prisma.kbChunk.count();
    if (count === 0) await reindexKb();
  } catch (err) {
    // Never let KB indexing stop the API from serving.
    logger.warn({ err }, 'saarthi support: KB index check failed');
  }
}
