import { Router } from 'express';
import { listAuditQuerySchema } from '@smartwork/shared';
import type { AuditEventDTO, Paginated } from '@smartwork/shared';
import type { z } from 'zod';
import { prisma } from '../../db/prisma';
import { verifyChain } from '../../audit/audit.service';
import { asyncHandler } from '../../middleware/errors';
import { requireAuth, requireRole } from '../../middleware/auth';
import { query, validateQuery } from '../../middleware/validate';

export const auditRouter = Router();

type AuditQuery = z.infer<typeof listAuditQuerySchema>;

const eventInclude = { actor: { select: { id: true, name: true, role: true } } } as const;

function toDTO(e: {
  id: string;
  chainIndex: number;
  entityType: string;
  entityId: string;
  action: string;
  actorId: string | null;
  payload: unknown;
  createdAt: Date;
  prevHash: string;
  hash: string;
  actor: { id: string; name: string; role: string } | null;
}): AuditEventDTO {
  return {
    id: e.id,
    chainIndex: e.chainIndex,
    entityType: e.entityType,
    entityId: e.entityId,
    action: e.action,
    actorId: e.actorId,
    actor: e.actor as AuditEventDTO['actor'],
    payload: (e.payload ?? {}) as Record<string, unknown>,
    createdAt: e.createdAt.toISOString(),
    prevHash: e.prevHash,
    hash: e.hash,
  };
}

/**
 * @openapi
 * /audit/verify:
 *   get:
 *     tags: [Audit]
 *     summary: Verify the entire SHA-256 hash chain
 *     description: >
 *       Streams every block in chainIndex order and recomputes both the block hash
 *       and the prevHash linkage. Detects edited payloads, deleted blocks and
 *       re-ordered blocks, returning the first index that fails.
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Verification result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 intact: { type: boolean }
 *                 checkedCount: { type: integer }
 *                 firstBrokenIndex: { type: integer, nullable: true }
 *                 brokenReason: { type: string, nullable: true }
 *                 headHash: { type: string, nullable: true }
 *                 durationMs: { type: integer }
 *                 anchorCount: { type: integer }
 */
auditRouter.get(
  '/verify',
  requireAuth,
  asyncHandler(async (_req, res) => {
    res.json(await verifyChain());
  }),
);

/**
 * @openapi
 * /audit/events:
 *   get:
 *     tags: [Audit]
 *     summary: List audit blocks (paginated, newest first)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: entityType, schema: { type: string } }
 *       - { in: query, name: entityId, schema: { type: string } }
 *       - { in: query, name: actorId, schema: { type: string } }
 *       - { in: query, name: action, schema: { type: string } }
 *       - { in: query, name: page, schema: { type: integer, default: 1 } }
 *       - { in: query, name: pageSize, schema: { type: integer, default: 25 } }
 *     responses:
 *       200: { description: Paginated audit blocks }
 */
auditRouter.get(
  '/events',
  requireAuth,
  requireRole('ADMIN', 'MANAGER'),
  validateQuery(listAuditQuerySchema),
  asyncHandler(async (req, res) => {
    const q = query<AuditQuery>(req);
    const where = {
      ...(q.entityType ? { entityType: q.entityType } : {}),
      ...(q.entityId ? { entityId: q.entityId } : {}),
      ...(q.actorId ? { actorId: q.actorId } : {}),
      ...(q.action ? { action: q.action } : {}),
    };

    const [total, items] = await Promise.all([
      prisma.auditEvent.count({ where }),
      prisma.auditEvent.findMany({
        where,
        include: eventInclude,
        orderBy: { chainIndex: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);

    const payload: Paginated<AuditEventDTO> = {
      items: items.map(toDTO),
      total,
      page: q.page,
      pageSize: q.pageSize,
      totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
    };
    res.json(payload);
  }),
);

/**
 * @openapi
 * /audit/entity/{type}/{id}:
 *   get:
 *     tags: [Audit]
 *     summary: Full audit history for one entity, oldest first
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: type, required: true, schema: { type: string, example: TASK } }
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: Ordered list of audit blocks for the entity }
 */
auditRouter.get(
  '/entity/:type/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const events = await prisma.auditEvent.findMany({
      where: { entityType: req.params.type.toUpperCase(), entityId: req.params.id },
      include: eventInclude,
      orderBy: { chainIndex: 'asc' },
    });
    res.json({ items: events.map(toDTO), total: events.length });
  }),
);

/**
 * @openapi
 * /audit/anchors:
 *   get:
 *     tags: [Audit]
 *     summary: Merkle checkpoint blocks
 *     description: >
 *       A Merkle root is computed every 100 blocks. externalTxHash is an honest
 *       placeholder — SMARTWORK 360 makes no real blockchain calls.
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Checkpoint list }
 */
auditRouter.get(
  '/anchors',
  requireAuth,
  asyncHandler(async (_req, res) => {
    const anchors = await prisma.anchor.findMany({ orderBy: { anchorIndex: 'asc' } });
    res.json({
      items: anchors.map((a) => ({ ...a, createdAt: a.createdAt.toISOString() })),
      total: anchors.length,
    });
  }),
);
