import type { FraudType, Prisma } from '@prisma/client';
import { prisma } from '../../db/prisma';
import { appendEvent } from '../../audit/audit.service';
import { scanAnomalies } from '../../ml/client';
import type { AnomalyRow } from '../../ml/types';

const HOUR = 3600_000;
const DAY = 24 * HOUR;

/**
 * Builds one behavioural feature vector per user from the AUDIT CHAIN, not from
 * the task table. The chain is the only record that cannot be quietly rewritten,
 * which is exactly what a fraud detector should be reading.
 */
export async function buildActivityRows(departmentId?: string, windowDays = 14): Promise<AnomalyRow[]> {
  const since = new Date(Date.now() - windowDays * DAY);

  const users = await prisma.user.findMany({
    where: { active: true, ...(departmentId ? { departmentId } : {}) },
    select: { id: true, name: true, departmentId: true },
  });
  if (users.length === 0) return [];
  const ids = users.map((u) => u.id);

  const events = await prisma.auditEvent.findMany({
    where: { actorId: { in: ids }, createdAt: { gte: since } },
    select: { actorId: true, action: true, entityId: true, createdAt: true, payload: true },
    orderBy: { createdAt: 'asc' },
  });

  const completed = await prisma.task.findMany({
    where: {
      assigneeId: { in: ids },
      status: 'COMPLETED',
      completedAt: { gte: since },
    },
    select: { id: true, refNo: true, assigneeId: true, createdAt: true, completedAt: true },
  });

  // Department median cycle time is the baseline every user is compared against.
  const cycles = completed
    .map((t) => (t.completedAt!.getTime() - t.createdAt.getTime()) / HOUR)
    .sort((a, b) => a - b);
  const median = cycles.length ? cycles[Math.floor(cycles.length / 2)] : 41;
  const stdDev =
    cycles.length > 1
      ? Math.sqrt(
          cycles.reduce((s, c) => s + (c - median) ** 2, 0) / (cycles.length - 1),
        )
      : 1;

  return users.map((user) => {
    const mine = events.filter((e) => e.actorId === user.id);
    const nightEvents = mine.filter((e) => {
      const h = e.createdAt.getHours();
      return h >= 22 || h < 6;
    });

    // Busiest single hour — a burst is more telling than a daily average.
    const perHour = new Map<string, number>();
    for (const e of mine) {
      const key = `${e.createdAt.toISOString().slice(0, 13)}`;
      perHour.set(key, (perHour.get(key) ?? 0) + 1);
    }
    const actionsPerHour = perHour.size ? Math.max(...perHour.values()) : 0;

    const statusFlips = mine.filter((e) => e.action === 'TASK_STATUS_CHANGED').length;
    const selfApprovals = mine.filter(
      (e) =>
        (e.action === 'TASK_APPROVED' || e.action === 'TASK_STATUS_CHANGED') &&
        (e.payload as Record<string, unknown> | null)?.selfApproved === true,
    ).length;

    const myCompleted = completed.filter((t) => t.assigneeId === user.id);
    const myCycles = myCompleted.map((t) => ({
      task: t,
      hours: (t.completedAt!.getTime() - t.createdAt.getTime()) / HOUR,
    }));
    const fastest = myCycles.length ? myCycles.reduce((a, b) => (a.hours < b.hours ? a : b)) : null;

    return {
      userId: user.id,
      userName: user.name,
      departmentId: user.departmentId,
      actionsPerHour,
      nightHourRatio: mine.length ? Number((nightEvents.length / mine.length).toFixed(3)) : 0,
      selfApprovalCount: selfApprovals,
      statusFlipCount: statusFlips,
      cycleTimeZScore: fastest ? Number(((fastest.hours - median) / (stdDev || 1)).toFixed(2)) : 0,
      fastestCycleMinutes: fastest ? Math.round(fastest.hours * 60) : 9999,
      sampleTaskId: fastest?.task.id ?? null,
      sampleRefNo: fastest?.task.refNo ?? null,
    };
  });
}

const TYPE_FOR_REASON: Record<string, FraudType> = {
  night_hour_ratio: 'AFTER_HOURS_SPIKE',
  action_burst: 'BULK_STATUS_CHANGE',
  status_flip: 'BULK_STATUS_CHANGE',
  self_approval: 'SELF_APPROVAL',
  cycle_time_zscore: 'UNUSUAL_CYCLE_TIME',
};

/**
 * Runs a detection pass and persists any NEW alerts.
 *
 * Existing OPEN alerts of the same type for the same user are not duplicated —
 * pressing "Run Scan Now" repeatedly during a demo must not inflate the count.
 */
export async function runScan(actorId: string, departmentId?: string) {
  const rows = await buildActivityRows(departmentId);
  if (rows.length === 0) return { created: 0, evaluated: 0, mode: 'heuristic' as const };

  const result = await scanAnomalies(rows);
  const rowById = new Map(rows.map((r) => [r.userId, r]));

  const existing = await prisma.fraudAlert.findMany({
    where: { status: 'OPEN' },
    select: { userId: true, type: true },
  });
  const seen = new Set(existing.map((e) => `${e.userId}|${e.type}`));

  const toCreate: Prisma.FraudAlertCreateManyInput[] = [];

  for (const item of result.items) {
    if (item.anomalyScore < 0.4 || item.reasons.length === 0) continue;
    const row = rowById.get(item.userId);
    if (!row) continue;

    for (const reason of item.reasons) {
      const type = TYPE_FOR_REASON[reason];
      if (!type) continue;
      const key = `${item.userId}|${type}`;
      if (seen.has(key)) continue;
      seen.add(key);

      toCreate.push({
        type,
        severity: item.severity,
        userId: item.userId,
        taskId: type === 'UNUSUAL_CYCLE_TIME' ? row.sampleTaskId : null,
        anomalyScore: item.anomalyScore,
        status: 'OPEN',
        // Alerts raised at runtime carry no ground-truth label — only the seeded
        // evaluation set does, so the precision statistic stays honest.
        labelConfirmed: null,
        details: {
          detectedBy: result.modelVersion,
          mode: result.mode,
          reasons: item.reasons,
          features: {
            actionsPerHour: row.actionsPerHour,
            nightHourRatio: row.nightHourRatio,
            selfApprovalCount: row.selfApprovalCount,
            statusFlipCount: row.statusFlipCount,
            cycleTimeZScore: row.cycleTimeZScore,
            fastestCycleMinutes: row.fastestCycleMinutes,
          },
          narrative: narrativeFor(type, row),
          refNo: row.sampleRefNo,
        } as Prisma.InputJsonValue,
      });
    }
  }

  if (toCreate.length > 0) {
    await prisma.$transaction(async (tx) => {
      await tx.fraudAlert.createMany({ data: toCreate });
      await appendEvent(
        {
          entityType: 'FRAUD',
          entityId: 'SCAN',
          action: 'FRAUD_SCAN_RUN',
          actorId,
          payload: {
            alertsCreated: toCreate.length,
            usersEvaluated: rows.length,
            engine: result.modelVersion,
            mode: result.mode,
          },
        },
        tx,
      );
    });
  }

  return { created: toCreate.length, evaluated: rows.length, mode: result.mode };
}

function narrativeFor(type: FraudType, row: AnomalyRow): string {
  switch (type) {
    case 'AFTER_HOURS_SPIKE':
      return `${Math.round(row.nightHourRatio * 100)}% of this user's recorded actions fall between 22:00 and 06:00.`;
    case 'BULK_STATUS_CHANGE':
      return `${row.actionsPerHour} audited actions in a single hour, with ${row.statusFlipCount} status changes over the window.`;
    case 'SELF_APPROVAL':
      return `${row.selfApprovalCount} task${row.selfApprovalCount === 1 ? '' : 's'} approved by the same user who submitted them.`;
    case 'UNUSUAL_CYCLE_TIME':
      return `${row.sampleRefNo ?? 'A task'} closed in ${row.fastestCycleMinutes} minutes (z = ${row.cycleTimeZScore} against the department median).`;
  }
}

/**
 * Precision over the LABELLED evaluation set only.
 *
 * Alerts created at runtime have `labelConfirmed = null` and are excluded, so this
 * figure never drifts upward just because someone pressed "Run Scan Now".
 */
export async function computePrecision() {
  const labelled = await prisma.fraudAlert.findMany({
    where: { labelConfirmed: { not: null } },
    select: { labelConfirmed: true },
  });
  const confirmed = labelled.filter((a) => a.labelConfirmed === true).length;
  return {
    totalLabelled: labelled.length,
    confirmed,
    precisionPct: labelled.length ? Math.round((confirmed / labelled.length) * 100) : 0,
  };
}
