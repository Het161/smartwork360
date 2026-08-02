import { Router } from 'express';
import type { SentimentTeamDTO } from '@smartwork/shared';
import { NEUTRAL_BAND } from '@smartwork/shared';
import { prisma } from '../../db/prisma';
import { asyncHandler } from '../../middleware/errors';
import { currentUser, requireAuth, requireRole } from '../../middleware/auth';
import { resolveDepartmentId } from '../../middleware/scope';
import { scoreSentimentBatch } from '../../ml/client';
import { LEXICON_MODEL_VERSION, labelFor } from '../../ml/lexicon';

export const sentimentRouter = Router();
sentimentRouter.use(requireAuth);

const DAY = 86_400_000;

/**
 * @openapi
 * /sentiment/team/{deptId}:
 *   get:
 *     tags: [Sentiment]
 *     summary: Team morale — 14-day average, distribution and daily trend
 *     description: >
 *       Averages the stored SentimentRecord scores for every task update authored by
 *       the department. `trendDelta` compares the most recent 7 days with the 7 before.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: deptId, required: true, schema: { type: string } }
 *       - { in: query, name: days, schema: { type: integer, default: 14 } }
 *     responses:
 *       200: { description: Team sentiment }
 *       403: { description: Other departments are out of scope }
 */
sentimentRouter.get(
  '/team/:deptId',
  requireRole('ADMIN', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const me = currentUser(req);
    const departmentId = resolveDepartmentId(me, req.params.deptId) ?? me.departmentId;
    const days = Number(req.query.days ?? 14);
    const since = new Date(Date.now() - days * DAY);

    const records = await prisma.sentimentRecord.findMany({
      where: { createdAt: { gte: since }, user: { departmentId } },
      select: { score: true, label: true, createdAt: true, modelVersion: true },
      orderBy: { createdAt: 'asc' },
    });

    const distribution = { positive: 0, neutral: 0, negative: 0 };
    for (const r of records) {
      if (r.label === 'POSITIVE') distribution.positive += 1;
      else if (r.label === 'NEGATIVE') distribution.negative += 1;
      else distribution.neutral += 1;
    }

    const avg = records.length ? records.reduce((s, r) => s + r.score, 0) / records.length : 0;

    // Week-over-week movement — the arrow next to the morale gauge.
    const midpoint = new Date(Date.now() - (days / 2) * DAY);
    const recent = records.filter((r) => r.createdAt >= midpoint);
    const earlier = records.filter((r) => r.createdAt < midpoint);
    const mean = (list: typeof records) =>
      list.length ? list.reduce((s, r) => s + r.score, 0) / list.length : 0;

    const byDay = new Map<string, number[]>();
    for (const r of records) {
      const key = r.createdAt.toISOString().slice(0, 10);
      byDay.set(key, [...(byDay.get(key) ?? []), r.score]);
    }

    const payload: SentimentTeamDTO = {
      departmentId,
      averageScore: Number(avg.toFixed(3)),
      label: labelFor(avg),
      trendDelta: Number((mean(recent) - mean(earlier)).toFixed(3)),
      distribution,
      trend: [...byDay.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, scores]) => ({
          date,
          score: Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(3)),
          count: scores.length,
        })),
      modelVersion: records[0]?.modelVersion ?? LEXICON_MODEL_VERSION,
      mode: (records[0]?.modelVersion ?? LEXICON_MODEL_VERSION).startsWith('heuristic')
        ? 'heuristic'
        : 'model',
    };

    res.json(payload);
  }),
);

/**
 * @openapi
 * /sentiment/recompute:
 *   post:
 *     tags: [Sentiment]
 *     summary: Re-score task updates through the ML service
 *     description: >
 *       Re-runs sentiment for recent updates. If the Python service is running this
 *       upgrades heuristic scores to DistilBERT scores; if it is not, the lexicon
 *       result is stored instead and `mode` reports "heuristic" honestly.
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               limit: { type: integer, default: 300 }
 *               departmentId: { type: string }
 *     responses:
 *       200: { description: Number of updates re-scored, plus the mode used }
 */
sentimentRouter.post(
  '/recompute',
  requireRole('ADMIN', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const me = currentUser(req);
    const limit = Math.min(Number(req.body?.limit ?? 300), 1000);
    const departmentId =
      me.role === 'ADMIN' ? (req.body?.departmentId as string | undefined) : me.departmentId;

    const updates = await prisma.taskUpdate.findMany({
      where: departmentId ? { task: { departmentId } } : {},
      select: { id: true, note: true, authorId: true },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    if (updates.length === 0) {
      return res.json({ rescored: 0, mode: 'heuristic', modelVersion: LEXICON_MODEL_VERSION });
    }

    const result = await scoreSentimentBatch(updates.map((u) => ({ id: u.id, text: u.note })));
    const byId = new Map(result.items.map((i) => [i.id, i]));

    // Sequential upserts keep memory flat; 300 rows completes well inside a request.
    let rescored = 0;
    for (const u of updates) {
      const scored = byId.get(u.id);
      if (!scored) continue;
      await prisma.sentimentRecord.upsert({
        where: { taskUpdateId: u.id },
        create: {
          taskUpdateId: u.id,
          userId: u.authorId,
          score: scored.score,
          label: scored.label,
          modelVersion: result.modelVersion,
        },
        update: { score: scored.score, label: scored.label, modelVersion: result.modelVersion },
      });
      rescored += 1;
    }

    res.json({
      rescored,
      mode: result.mode,
      modelVersion: result.modelVersion,
      neutralBand: NEUTRAL_BAND,
    });
  }),
);

/**
 * @openapi
 * /sentiment/mine:
 *   get:
 *     tags: [Sentiment]
 *     summary: The signed-in user's own 30-day sentiment trend
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Personal sentiment trend }
 */
sentimentRouter.get(
  '/mine',
  asyncHandler(async (req, res) => {
    const me = currentUser(req);
    const records = await prisma.sentimentRecord.findMany({
      where: { userId: me.sub, createdAt: { gte: new Date(Date.now() - 30 * DAY) } },
      select: { score: true, label: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
    const avg = records.length ? records.reduce((s, r) => s + r.score, 0) / records.length : 0;
    res.json({
      averageScore: Number(avg.toFixed(3)),
      label: labelFor(avg),
      count: records.length,
      trend: records.map((r) => ({ date: r.createdAt.toISOString(), score: r.score })),
    });
  }),
);
