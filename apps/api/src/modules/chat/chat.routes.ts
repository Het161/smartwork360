import { Router } from 'express';
import { chatQuerySchema, type ChatQueryInput } from '@smartwork/shared';
import { prisma } from '../../db/prisma';
import { asyncHandler } from '../../middleware/errors';
import { currentUser, requireAuth } from '../../middleware/auth';
import { body, validateBody } from '../../middleware/validate';
import { taskScope } from '../../middleware/scope';
import { askAssistant } from '../../ml/client';
import type { ChatContext } from '../../ml/types';
import { computeKpis, startOfDay } from '../analytics/analytics.service';
import { readBurnout } from '../burnout/burnout.service';

export const chatRouter = Router();
chatRouter.use(requireAuth);

const HOUR = 3600_000;
const DAY = 24 * HOUR;

/** Pulls a REV/2026/0042-style reference out of free text. */
function extractRefNo(message: string): string | null {
  const match = message.match(/([A-Za-z]{2,4})\s*\/\s*(\d{4})\s*\/\s*(\d{1,5})/);
  if (!match) return null;
  return `${match[1].toUpperCase()}/${match[2]}/${match[3].padStart(4, '0')}`;
}

/**
 * @openapi
 * /chat/query:
 *   post:
 *     tags: [Chat]
 *     summary: Ask the task assistant a question
 *     description: >
 *       The API enriches the message with the caller's LIVE task summary before
 *       routing it to the ML intent classifier, so every number in the reply comes
 *       from the database rather than from generation. Hindi and Hinglish phrasings
 *       ("mere pending kaam", "kitne overdue") are first-class patterns.
 *       Falls back to the identical TypeScript intent router when the ML service is down.
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [message]
 *             properties:
 *               message: { type: string, example: "mere pending tasks?" }
 *     responses:
 *       200:
 *         description: Reply, detected intent, and the grounding data used
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 reply: { type: string }
 *                 intent: { type: string }
 *                 confidence: { type: number }
 *                 data: { type: object }
 *                 links: { type: array, items: { type: object } }
 */
chatRouter.post(
  '/query',
  validateBody(chatQuerySchema),
  asyncHandler(async (req, res) => {
    const me = currentUser(req);
    const { message } = body<ChatQueryInput>(req);
    const now = new Date();

    const scope = taskScope(me);
    const [kpis, department, nextTasks] = await Promise.all([
      computeKpis(
        me.role === 'EMPLOYEE' ? { assigneeId: me.sub } : { AND: [scope, {}] },
        me.role === 'EMPLOYEE' ? 'me' : 'dept',
      ),
      prisma.department.findUnique({ where: { id: me.departmentId } }),
      prisma.task.findMany({
        where: {
          AND: [
            me.role === 'EMPLOYEE' ? { assigneeId: me.sub } : scope,
            { status: { not: 'COMPLETED' } },
          ],
        },
        select: { id: true, refNo: true, title: true, dueDate: true },
        orderBy: { dueDate: 'asc' },
        take: 8,
      }),
    ]);

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const completedThisMonth = await prisma.task.count({
      where: {
        AND: [
          me.role === 'EMPLOYEE' ? { assigneeId: me.sub } : scope,
          { status: 'COMPLETED', completedAt: { gte: monthStart } },
        ],
      },
    });

    const context: ChatContext = {
      userId: me.sub,
      role: me.role,
      name: me.name,
      departmentName: department?.name ?? 'your department',
      pendingTasks: kpis.pending,
      inProgress: kpis.inProgress,
      overdue: kpis.overdue,
      dueToday: kpis.dueToday,
      completedThisMonth,
      onTimePct: kpis.onTimePct,
      nextTasks: nextTasks.map((t) => ({
        id: t.id,
        refNo: t.refNo,
        title: t.title,
        dueDate: t.dueDate.toISOString(),
        hoursRemaining: Number(((t.dueDate.getTime() - now.getTime()) / HOUR).toFixed(1)),
      })),
    };

    // Manager/admin questions need team context too.
    if (me.role !== 'EMPLOYEE') {
      const [teamSize, breachesToday, risky] = await Promise.all([
        prisma.user.count({ where: { departmentId: me.departmentId, role: 'EMPLOYEE', active: true } }),
        prisma.task.count({
          where: {
            AND: [
              scope,
              {
                status: { not: 'COMPLETED' },
                dueDate: { gte: startOfDay(now), lt: new Date(startOfDay(now).getTime() + DAY) },
              },
            ],
          },
        }),
        readBurnout(me.role === 'ADMIN' ? undefined : me.departmentId),
      ]);
      context.teamSize = teamSize;
      context.slaBreachesToday = breachesToday;
      context.atRisk = risky
        .filter((r) => r.riskLevel === 'HIGH' || r.riskLevel === 'CRITICAL')
        .slice(0, 3)
        .map((r) => ({ name: r.user?.name ?? 'Unknown', score: r.score, riskLevel: r.riskLevel }));
    }

    // Resolve an explicit task reference so the reply can quote real facts.
    const refNo = extractRefNo(message);
    if (refNo) {
      const task = await prisma.task.findFirst({
        where: { AND: [scope, { refNo }] },
        include: { assignee: { select: { name: true } } },
      });
      context.lookupTask = task
        ? {
            id: task.id,
            refNo: task.refNo,
            title: task.title,
            status: task.status,
            assignee: task.assignee.name,
            dueDate: task.dueDate.toISOString(),
            isOverdue: task.status !== 'COMPLETED' && task.dueDate < now,
          }
        : null;
    }

    const result = await askAssistant(message, context);
    res.json(result);
  }),
);

/**
 * @openapi
 * /chat/suggestions:
 *   get:
 *     tags: [Chat]
 *     summary: Role-aware suggested questions for the assistant chips
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Suggested prompts in English and Hindi }
 */
chatRouter.get('/suggestions', (req, res) => {
  const me = currentUser(req);
  const common = [
    { en: 'What are my pending tasks?', hi: 'मेरे पेंडिंग काम?' },
    { en: 'Which tasks are overdue?', hi: 'कितने ओवरड्यू हैं?' },
    { en: 'Any SLA breach today?', hi: 'आज कोई SLA breach?' },
  ];
  const managerial = [
    { en: 'Who is at risk of burnout?', hi: 'कौन बर्नआउट के जोखिम में है?' },
    { en: 'How is the team workload?', hi: 'टीम का वर्कलोड कैसा है?' },
  ];
  res.json({ items: me.role === 'EMPLOYEE' ? common : [...common, ...managerial] });
});
