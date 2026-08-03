import { Router } from 'express';
import { listAlertsQuerySchema, reviewAlertSchema, type FraudAlertDTO, type ReviewAlertInput } from '@smartwork/shared';
import type { AlertStatus, FraudType, Prisma, RiskLevel } from '@prisma/client';
import type { z } from 'zod';
import { prisma } from '../../db/prisma';
import { appendEvent } from '../../audit/audit.service';
import { asyncHandler, badRequest, notFound } from '../../middleware/errors';
import { currentUser, requireAuth, requireRole } from '../../middleware/auth';
import { body, query, validateBody, validateQuery } from '../../middleware/validate';
import { assertCanAccessDepartment, resolveDepartmentId, requireDepartmentId } from '../../middleware/scope';
import { computePrecision, runScan } from './fraud.service';

export const fraudRouter = Router();
fraudRouter.use(requireAuth, requireRole('ADMIN', 'MANAGER'));

type AlertQuery = z.infer<typeof listAlertsQuerySchema>;

const alertInclude = {
  user: {
    select: { id: true, name: true, avatarSeed: true, designation: true, departmentId: true },
  },
  task: { select: { id: true, refNo: true, title: true } },
} satisfies Prisma.FraudAlertInclude;

type AlertRow = Prisma.FraudAlertGetPayload<{ include: typeof alertInclude }>;

function toDTO(a: AlertRow): FraudAlertDTO {
  return {
    id: a.id,
    type: a.type,
    severity: a.severity,
    userId: a.userId,
    user: a.user,
    taskId: a.taskId,
    task: a.task as FraudAlertDTO['task'],
    anomalyScore: a.anomalyScore,
    details: (a.details ?? {}) as Record<string, unknown>,
    status: a.status,
    createdAt: a.createdAt.toISOString(),
    reviewedById: a.reviewedById,
    reviewNote: a.reviewNote,
    labelConfirmed: a.labelConfirmed,
  };
}

/**
 * @openapi
 * /fraud/alerts:
 *   get:
 *     tags: [Fraud]
 *     summary: Anomaly alerts, newest and most severe first
 *     description: Managers see only alerts raised against their own department.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: status, schema: { type: string, enum: [OPEN, REVIEWED, DISMISSED] } }
 *       - { in: query, name: severity, schema: { type: string, enum: [LOW, MODERATE, HIGH, CRITICAL] } }
 *       - { in: query, name: type, schema: { type: string, enum: [BULK_STATUS_CHANGE, AFTER_HOURS_SPIKE, SELF_APPROVAL, UNUSUAL_CYCLE_TIME] } }
 *       - { in: query, name: departmentId, schema: { type: string } }
 *       - { in: query, name: page, schema: { type: integer, default: 1 } }
 *       - { in: query, name: pageSize, schema: { type: integer, default: 50 } }
 *     responses:
 *       200: { description: Alerts plus the labelled-set precision statistic }
 */
fraudRouter.get(
  '/alerts',
  validateQuery(listAlertsQuerySchema),
  asyncHandler(async (req, res) => {
    const me = currentUser(req);
    const q = query<AlertQuery>(req);
    const departmentId = resolveDepartmentId(me, q.departmentId);

    const where: Prisma.FraudAlertWhereInput = {
      AND: [
        q.status ? { status: q.status as AlertStatus } : {},
        q.severity ? { severity: q.severity as RiskLevel } : {},
        q.type ? { type: q.type as FraudType } : {},
        departmentId ? { user: { departmentId } } : {},
      ],
    };

    const [total, rows, precision] = await Promise.all([
      prisma.fraudAlert.count({ where }),
      prisma.fraudAlert.findMany({
        where,
        include: alertInclude,
        orderBy: [{ status: 'asc' }, { anomalyScore: 'desc' }, { createdAt: 'desc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      computePrecision(),
    ]);

    res.json({
      items: rows.map(toDTO),
      total,
      page: q.page,
      pageSize: q.pageSize,
      totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
      precision,
    });
  }),
);

/**
 * @openapi
 * /fraud/alerts/{id}:
 *   patch:
 *     tags: [Fraud]
 *     summary: Triage an alert — mark reviewed or dismissed (note mandatory, audited)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status, reviewNote]
 *             properties:
 *               status: { type: string, enum: [REVIEWED, DISMISSED] }
 *               reviewNote: { type: string, minLength: 5 }
 *     responses:
 *       200: { description: The triaged alert }
 *       400: { description: Already triaged }
 */
fraudRouter.patch(
  '/alerts/:id',
  validateBody(reviewAlertSchema),
  asyncHandler(async (req, res) => {
    const me = currentUser(req);
    const { status, reviewNote } = body<ReviewAlertInput>(req);

    const existing = await prisma.fraudAlert.findUnique({
      where: { id: req.params.id },
      include: alertInclude,
    });
    if (!existing) throw notFound('Alert not found');
    if (existing.user) assertCanAccessDepartment(me, existing.user.departmentId);
    if (existing.status !== 'OPEN') throw badRequest(`This alert was already ${existing.status.toLowerCase()}`);

    const alert = await prisma.$transaction(async (tx) => {
      const updated = await tx.fraudAlert.update({
        where: { id: req.params.id },
        data: { status, reviewNote, reviewedById: me.sub },
        include: alertInclude,
      });
      await appendEvent(
        {
          entityType: 'FRAUD_ALERT',
          entityId: updated.id,
          action: 'FRAUD_ALERT_REVIEWED',
          actorId: me.sub,
          payload: {
            alertType: updated.type,
            subjectUserId: updated.userId,
            decision: status,
            note: reviewNote,
            anomalyScore: updated.anomalyScore,
          },
        },
        tx,
      );
      return updated;
    });

    res.json(toDTO(alert));
  }),
);

/**
 * @openapi
 * /fraud/scan:
 *   post:
 *     tags: [Fraud]
 *     summary: Run an anomaly detection pass now (audited)
 *     description: >
 *       Builds per-user behavioural feature vectors from the AUDIT CHAIN — the one
 *       record that cannot be quietly rewritten — and scores them. Alerts already
 *       OPEN for the same user and type are not duplicated.
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               departmentId: { type: string }
 *     responses:
 *       200: { description: How many alerts were created }
 */
fraudRouter.post(
  '/scan',
  asyncHandler(async (req, res) => {
    const me = currentUser(req);
    const departmentId =
      me.role === 'ADMIN' ? (req.body?.departmentId as string | undefined) : requireDepartmentId(me);
    res.json(await runScan(me.sub, departmentId));
  }),
);

/**
 * @openapi
 * /fraud/precision:
 *   get:
 *     tags: [Fraud]
 *     summary: Detection precision over the labelled evaluation set
 *     description: >
 *       Counts only alerts carrying a ground-truth label from the seeded scenarios.
 *       Runtime alerts are unlabelled and excluded, so the figure cannot drift.
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: "{ totalLabelled, confirmed, precisionPct }" }
 */
fraudRouter.get(
  '/precision',
  asyncHandler(async (_req, res) => {
    res.json(await computePrecision());
  }),
);

/**
 * @openapi
 * /fraud/scatter:
 *   get:
 *     tags: [Fraud]
 *     summary: Points for the anomaly scatter plot (score vs time, coloured by type)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Scatter points }
 */
fraudRouter.get(
  '/scatter',
  asyncHandler(async (req, res) => {
    const me = currentUser(req);
    const departmentId = resolveDepartmentId(me, undefined);

    const alerts = await prisma.fraudAlert.findMany({
      where: departmentId ? { user: { departmentId } } : {},
      include: alertInclude,
      orderBy: { createdAt: 'asc' },
    });

    res.json({
      items: alerts.map((a) => ({
        id: a.id,
        type: a.type,
        severity: a.severity,
        status: a.status,
        anomalyScore: a.anomalyScore,
        createdAt: a.createdAt.toISOString(),
        hourOfDay: a.createdAt.getHours(),
        daysAgo: Number(((Date.now() - a.createdAt.getTime()) / 86_400_000).toFixed(2)),
        userName: a.user?.name ?? 'Unknown',
        refNo: a.task?.refNo ?? null,
      })),
    });
  }),
);
