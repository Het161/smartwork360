import { Router } from 'express';
import { prisma } from '../../db/prisma';
import { asyncHandler } from '../../middleware/errors';
import { currentUser, requireAuth, requireRole } from '../../middleware/auth';
import { taskScope } from '../../middleware/scope';
import { computeKpis, computeSla } from '../analytics/analytics.service';

export const reportRouter = Router();
reportRouter.use(requireAuth);

/** RFC 4180 escaping — commas, quotes and newlines inside task titles are common. */
function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(headers: string[], rows: unknown[][]): string {
  return [headers.join(','), ...rows.map((r) => r.map(csvCell).join(','))].join('\r\n');
}

function sendCsv(res: import('express').Response, filename: string, csv: string) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  // BOM so Excel opens Devanagari department names correctly.
  res.send(`﻿${csv}`);
}

/**
 * @openapi
 * /reports/summary:
 *   get:
 *     tags: [Reports]
 *     summary: Monthly summary cards — KPIs plus SLA compliance
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Summary payload }
 */
reportRouter.get(
  '/summary',
  requireRole('ADMIN', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const me = currentUser(req);
    const where = taskScope(me);
    const [kpis, sla] = await Promise.all([
      computeKpis(where, me.role === 'ADMIN' ? 'org' : 'dept'),
      computeSla(where),
    ]);

    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const [createdThisMonth, completedThisMonth, auditBlocks] = await Promise.all([
      prisma.task.count({ where: { AND: [where, { createdAt: { gte: monthStart } }] } }),
      prisma.task.count({
        where: { AND: [where, { status: 'COMPLETED', completedAt: { gte: monthStart } }] },
      }),
      prisma.auditEvent.count(),
    ]);

    res.json({
      generatedAt: new Date().toISOString(),
      period: monthStart.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }),
      kpis,
      sla: { compliancePct: sla.compliancePct, breached: sla.breached, measured: sla.totalMeasured },
      createdThisMonth,
      completedThisMonth,
      auditBlocks,
    });
  }),
);

/**
 * @openapi
 * /reports/tasks.csv:
 *   get:
 *     tags: [Reports]
 *     summary: Download tasks as CSV (scoped by role)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: CSV file
 *         content:
 *           text/csv:
 *             schema: { type: string }
 */
reportRouter.get(
  '/tasks.csv',
  asyncHandler(async (req, res) => {
    const me = currentUser(req);
    const now = new Date();

    const tasks = await prisma.task.findMany({
      where: taskScope(me),
      include: {
        assignee: { select: { name: true } },
        creator: { select: { name: true } },
        department: { select: { code: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const csv = toCsv(
      [
        'Reference No',
        'Title',
        'Department',
        'Priority',
        'Status',
        'Assignee',
        'Created By',
        'Created At',
        'Due Date',
        'SLA Hours',
        'Completed At',
        'Cycle Time (hours)',
        'Overdue',
        'Met SLA',
      ],
      tasks.map((t) => [
        t.refNo,
        t.title,
        t.department.name,
        t.priority,
        t.status,
        t.assignee.name,
        t.creator.name,
        t.createdAt.toISOString(),
        t.dueDate.toISOString(),
        t.slaHours,
        t.completedAt?.toISOString() ?? '',
        t.completedAt
          ? ((t.completedAt.getTime() - t.createdAt.getTime()) / 3600_000).toFixed(1)
          : '',
        t.status !== 'COMPLETED' && t.dueDate < now ? 'YES' : 'NO',
        t.completedAt ? (t.completedAt <= t.dueDate ? 'YES' : 'NO') : '',
      ]),
    );

    sendCsv(res, `smartwork360-tasks-${now.toISOString().slice(0, 10)}.csv`, csv);
  }),
);

/**
 * @openapi
 * /reports/audit.csv:
 *   get:
 *     tags: [Reports]
 *     summary: Download the full audit ledger as CSV, including every block hash
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: CSV file
 *         content:
 *           text/csv:
 *             schema: { type: string }
 */
reportRouter.get(
  '/audit.csv',
  requireRole('ADMIN'),
  asyncHandler(async (_req, res) => {
    const events = await prisma.auditEvent.findMany({
      include: { actor: { select: { name: true, role: true } } },
      orderBy: { chainIndex: 'asc' },
    });

    const csv = toCsv(
      ['Block', 'Timestamp', 'Entity Type', 'Entity ID', 'Action', 'Actor', 'Actor Role', 'Payload', 'Previous Hash', 'Hash'],
      events.map((e) => [
        e.chainIndex,
        e.createdAt.toISOString(),
        e.entityType,
        e.entityId,
        e.action,
        e.actor?.name ?? 'system',
        e.actor?.role ?? '',
        JSON.stringify(e.payload),
        e.prevHash,
        e.hash,
      ]),
    );

    sendCsv(res, `smartwork360-audit-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  }),
);
