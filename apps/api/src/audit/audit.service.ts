import type { Prisma } from '@prisma/client';
import { ANCHOR_INTERVAL, GENESIS_PREV_HASH, type AuditAction } from '@smartwork/shared';
import type { ChainVerificationDTO } from '@smartwork/shared';
import { prisma, type PrismaTx } from '../db/prisma';
import { computeEventHash, merkleRoot } from './hash';

export interface AppendEventInput {
  entityType: string;
  entityId: string;
  action: AuditAction | string;
  actorId: string | null;
  payload: Prisma.JsonObject;
  /** Backdating hook — used only by the seed to build a realistic 90-day history. */
  createdAt?: Date;
}

/**
 * Appends one block to the audit chain.
 *
 * MUST be called with `tx` — the same Prisma transaction client as the mutation
 * it records — so a task change and its audit block commit or roll back together.
 * There is no code path that writes a Task without writing its block.
 */
export async function appendEvent(
  input: AppendEventInput,
  tx: PrismaTx,
): Promise<{ chainIndex: number; hash: string }> {
  const head = await tx.auditEvent.findFirst({
    orderBy: { chainIndex: 'desc' },
    select: { chainIndex: true, hash: true },
  });

  const chainIndex = head ? head.chainIndex + 1 : 0;
  const prevHash = head ? head.hash : GENESIS_PREV_HASH;
  // createdAt is generated here (not by the DB default) because it is part of the
  // hash pre-image — the value we hash and the value we store must be identical.
  const createdAt = input.createdAt ?? new Date();

  const hash = computeEventHash({
    prevHash,
    chainIndex,
    entityType: input.entityType,
    entityId: input.entityId,
    action: input.action,
    actorId: input.actorId,
    payload: input.payload,
    createdAt,
  });

  await tx.auditEvent.create({
    data: {
      chainIndex,
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      actorId: input.actorId,
      payload: input.payload,
      createdAt,
      prevHash,
      hash,
    },
  });

  // Cut a Merkle checkpoint every ANCHOR_INTERVAL blocks.
  if ((chainIndex + 1) % ANCHOR_INTERVAL === 0) {
    await createAnchor(chainIndex + 1 - ANCHOR_INTERVAL, chainIndex, tx);
  }

  return { chainIndex, hash };
}

/**
 * Merkle checkpoint over blocks [fromIndex, toIndex]. `externalTxHash` is an
 * honest placeholder — SMARTWORK 360 makes no real chain calls (see README).
 */
export async function createAnchor(
  fromIndex: number,
  toIndex: number,
  tx: PrismaTx,
): Promise<void> {
  const blocks = await tx.auditEvent.findMany({
    where: { chainIndex: { gte: fromIndex, lte: toIndex } },
    orderBy: { chainIndex: 'asc' },
    select: { hash: true },
  });

  const lastAnchor = await tx.anchor.findFirst({ orderBy: { anchorIndex: 'desc' } });

  await tx.anchor.create({
    data: {
      anchorIndex: lastAnchor ? lastAnchor.anchorIndex + 1 : 0,
      fromIndex,
      toIndex,
      merkleRoot: merkleRoot(blocks.map((b) => b.hash)),
      externalTxHash: 'pending — Polygon Amoy (planned)',
    },
  });
}

/**
 * Full-chain verification.
 *
 * Streams every block in chainIndex order in a single query (no N+1) and
 * recomputes both the hash and the prevHash linkage. Returns the FIRST index that
 * fails, which is what the Audit Explorer highlights as the severed link.
 */
export async function verifyChain(): Promise<ChainVerificationDTO> {
  const started = Date.now();

  const events = await prisma.auditEvent.findMany({
    orderBy: { chainIndex: 'asc' },
    select: {
      chainIndex: true,
      entityType: true,
      entityId: true,
      action: true,
      actorId: true,
      payload: true,
      createdAt: true,
      prevHash: true,
      hash: true,
    },
  });

  const anchorCount = await prisma.anchor.count();

  let expectedPrevHash = GENESIS_PREV_HASH;
  let expectedIndex = 0;

  for (const event of events) {
    // 1. The index must be dense and sequential — a deleted row is detected here.
    if (event.chainIndex !== expectedIndex) {
      return broken(
        event.chainIndex,
        `Expected block #${expectedIndex} but found #${event.chainIndex} — a block was removed`,
        events.length,
        started,
        anchorCount,
      );
    }

    // 2. The link to the previous block must match.
    if (event.prevHash !== expectedPrevHash) {
      return broken(
        event.chainIndex,
        `Block #${event.chainIndex} points at ${event.prevHash.slice(0, 12)}… but the previous block hashes to ${expectedPrevHash.slice(0, 12)}…`,
        events.length,
        started,
        anchorCount,
      );
    }

    // 3. The block's own contents must reproduce its stored hash.
    const recomputed = computeEventHash({
      prevHash: event.prevHash,
      chainIndex: event.chainIndex,
      entityType: event.entityType,
      entityId: event.entityId,
      action: event.action,
      actorId: event.actorId,
      payload: event.payload,
      createdAt: event.createdAt,
    });

    if (recomputed !== event.hash) {
      return broken(
        event.chainIndex,
        `Block #${event.chainIndex} contents were altered — stored hash ${event.hash.slice(0, 12)}… does not match recomputed ${recomputed.slice(0, 12)}…`,
        events.length,
        started,
        anchorCount,
      );
    }

    expectedPrevHash = event.hash;
    expectedIndex += 1;
  }

  return {
    intact: true,
    checkedCount: events.length,
    headHash: events.length ? events[events.length - 1].hash : null,
    durationMs: Date.now() - started,
    anchorCount,
  };
}

function broken(
  index: number,
  reason: string,
  checkedCount: number,
  started: number,
  anchorCount: number,
): ChainVerificationDTO {
  return {
    intact: false,
    checkedCount,
    firstBrokenIndex: index,
    brokenReason: reason,
    headHash: null,
    durationMs: Date.now() - started,
    anchorCount,
  };
}

/** Convenience wrapper for mutations that are not already inside a transaction. */
export async function appendEventStandalone(input: AppendEventInput) {
  return prisma.$transaction((tx) => appendEvent(input, tx));
}

/** Genesis block — written once, at the start of every seed. */
export async function writeGenesis(tx: PrismaTx, actorId: string | null = null) {
  return appendEvent(
    {
      entityType: 'SYSTEM',
      entityId: 'GENESIS',
      action: 'GENESIS',
      actorId,
      payload: {
        system: 'SMARTWORK 360',
        note: 'Genesis block — start of the tamper-evident audit ledger',
        version: 1,
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as AppendEventInput,
    tx,
  );
}
