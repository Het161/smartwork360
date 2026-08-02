import type { BurnoutScoreDTO } from '@smartwork/shared';
import { prisma } from '../../db/prisma';
import { scoreBurnout } from '../../ml/client';
import { suggestedActionFor } from '../../ml/fallback';
import type { BurnoutFeatures } from '../../ml/types';
import { weekStartOf } from '../analytics/analytics.service';

const DAY = 86_400_000;

/**
 * Derives the five burnout features from live data for every employee in scope.
 * The API owns feature extraction; the ML service only scores. That keeps the
 * Python side stateless and means the heuristic fallback sees identical inputs.
 */
export async function extractFeatures(departmentId?: string) {
  const users = await prisma.user.findMany({
    where: { role: 'EMPLOYEE', active: true, ...(departmentId ? { departmentId } : {}) },
    select: { id: true, name: true, avatarSeed: true, designation: true, departmentId: true },
  });
  if (users.length === 0) return [];

  const ids = users.map((u) => u.id);
  const now = new Date();
  const since14 = new Date(now.getTime() - 14 * DAY);

  const [tasks, updates] = await Promise.all([
    prisma.task.findMany({
      where: { assigneeId: { in: ids } },
      select: { assigneeId: true, status: true, dueDate: true },
    }),
    prisma.taskUpdate.findMany({
      where: { authorId: { in: ids }, createdAt: { gte: since14 } },
      select: { authorId: true, createdAt: true, sentiment: { select: { label: true } } },
    }),
  ]);

  return users.map((user) => {
    const active = tasks.filter((t) => t.assigneeId === user.id && t.status !== 'COMPLETED');
    const mine = updates.filter((u) => u.authorId === user.id);
    // "After hours" = outside 06:00–21:00, matching the government office day.
    const afterHours = mine.filter((u) => {
      const h = u.createdAt.getHours();
      return h >= 21 || h < 6;
    }).length;
    const negative = mine.filter((u) => u.sentiment?.label === 'NEGATIVE').length;

    const features: BurnoutFeatures = {
      activeLoad: active.length,
      overdueCount: active.filter((t) => t.dueDate < now).length,
      afterHoursPct: mine.length ? Math.round((afterHours / mine.length) * 100) : 0,
      avgDailyUpdates: Number((mine.length / 14).toFixed(2)),
      negSentimentPct: mine.length ? Math.round((negative / mine.length) * 100) : 0,
    };

    return { user, features };
  });
}

/** Scores everyone in scope and persists this week's row (idempotent per week). */
export async function recomputeBurnout(departmentId?: string) {
  const extracted = await extractFeatures(departmentId);
  if (extracted.length === 0) return { scored: 0, mode: 'heuristic' as const, items: [] };

  const result = await scoreBurnout(
    extracted.map((e) => ({ userId: e.user.id, features: e.features })),
  );
  const weekStart = weekStartOf(new Date());
  const featureById = new Map(extracted.map((e) => [e.user.id, e.features]));

  for (const item of result.items) {
    const features = featureById.get(item.userId);
    if (!features) continue;
    await prisma.burnoutScore.upsert({
      where: { userId_weekStart: { userId: item.userId, weekStart } },
      create: {
        userId: item.userId,
        weekStart,
        score: item.score,
        riskLevel: item.riskLevel,
        factors: features as unknown as object,
      },
      update: { score: item.score, riskLevel: item.riskLevel, factors: features as unknown as object },
    });
  }

  return { scored: result.items.length, mode: result.mode, items: result.items };
}

/** Reads stored scores, enriching each with its top factors and a suggested action. */
export async function readBurnout(departmentId?: string, userId?: string): Promise<BurnoutScoreDTO[]> {
  const weekStart = weekStartOf(new Date());

  const rows = await prisma.burnoutScore.findMany({
    where: {
      weekStart,
      ...(userId ? { userId } : {}),
      ...(departmentId ? { user: { departmentId } } : {}),
    },
    include: {
      user: { select: { id: true, name: true, avatarSeed: true, designation: true } },
    },
    orderBy: { score: 'desc' },
  });

  // Recompute the factor breakdown from the stored factors so the "top 2
  // contributing factors" shown in the UI always match the persisted score.
  const scored = await scoreBurnout(
    rows.map((r) => ({ userId: r.userId, features: r.factors as unknown as BurnoutFeatures })),
  );
  const topById = new Map(scored.items.map((i) => [i.userId, i]));

  return rows.map((row) => {
    const factors = row.factors as unknown as BurnoutFeatures;
    const enriched = topById.get(row.userId);
    return {
      userId: row.userId,
      user: row.user,
      weekStart: row.weekStart.toISOString(),
      score: row.score,
      riskLevel: row.riskLevel,
      factors,
      topFactors: enriched?.topFactors ?? [],
      suggestedAction: suggestedActionFor(
        { userId: row.userId, score: row.score, riskLevel: row.riskLevel, topFactors: enriched?.topFactors ?? [] },
        factors.activeLoad,
      ),
    };
  });
}
