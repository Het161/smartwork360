import { createHash } from 'node:crypto';

/**
 * Deterministic JSON serialisation.
 *
 * Object key order in JavaScript is insertion-ordered, so `JSON.stringify` on two
 * semantically identical payloads can produce different strings — and therefore
 * different hashes. Every hash input is canonicalised through here so that a
 * payload re-read from Postgres (where jsonb reorders keys) recomputes to the
 * exact same digest as when it was written.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(sortValue);
  if (value instanceof Date) return value.toISOString();

  const source = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(source).sort()) {
    sorted[key] = sortValue(source[key]);
  }
  return sorted;
}

export interface HashableEvent {
  prevHash: string;
  chainIndex: number;
  entityType: string;
  entityId: string;
  action: string;
  actorId: string | null;
  payload: unknown;
  createdAt: Date;
}

/**
 * The block hash. Field order is fixed and pipe-delimited; changing this formula
 * invalidates every existing chain, so it is treated as a wire format.
 */
export function computeEventHash(event: HashableEvent): string {
  const parts = [
    event.prevHash,
    String(event.chainIndex),
    event.entityType,
    event.entityId,
    event.action,
    event.actorId ?? '',
    canonicalJson(event.payload),
    event.createdAt.toISOString(),
  ];
  return sha256(parts.join('|'));
}

export function sha256(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

/**
 * Merkle root over an ordered list of block hashes. Odd nodes are promoted
 * unchanged (Bitcoin duplicates the last leaf; promotion avoids the CVE-2012-2459
 * duplicate-root ambiguity).
 */
export function merkleRoot(hashes: string[]): string {
  if (hashes.length === 0) return sha256('');
  let level = [...hashes];
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = level[i + 1];
      next.push(right === undefined ? left : sha256(left + right));
    }
    level = next;
  }
  return level[0];
}

/** Short display form used in the Audit Explorer block cards. */
export function shortHash(hash: string, size = 8): string {
  return `${hash.slice(0, size)}…`;
}

export interface UnlinkedEvent {
  entityType: string;
  entityId: string;
  action: string;
  actorId: string | null;
  payload: unknown;
  createdAt: Date;
}

export interface LinkedEvent extends UnlinkedEvent {
  chainIndex: number;
  prevHash: string;
  hash: string;
}

/**
 * Links an ordered list of events into a chain in one pass.
 *
 * The seed uses this instead of calling `appendEvent` 600 times: appendEvent must
 * re-read the chain head on every call (correct for concurrent API writes, but
 * 600 round-trips here). The hash formula is shared, so a chain built this way
 * verifies identically to one built incrementally.
 */
export function linkEvents(events: UnlinkedEvent[], startIndex = 0, startPrevHash?: string): LinkedEvent[] {
  const linked: LinkedEvent[] = [];
  let prevHash = startPrevHash ?? '0'.repeat(64);
  let chainIndex = startIndex;

  for (const event of events) {
    const hash = computeEventHash({ ...event, chainIndex, prevHash });
    linked.push({ ...event, chainIndex, prevHash, hash });
    prevHash = hash;
    chainIndex += 1;
  }
  return linked;
}
