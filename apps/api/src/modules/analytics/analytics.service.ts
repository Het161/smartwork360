import type { Prisma } from '@prisma/client';
import type {
  KpiSummaryDTO,
  Priority,
  SlaAnalyticsDTO,
  TrendPointDTO,
  UserPerformanceDTO,
  WorkloadItemDTO,
} from '@smartwork/shared';
import { prisma } from '../../db/prisma';

const HOUR = 3600_000;
const DAY = 24 * HOUR;

export function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function weekStartOf(date: Date): Date {
  const d = new Date(date);
  const day = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

const weekKey = (d: Date) => weekStartOf(d).toISOString().slice(0, 10);
const weekLabel = (d: Date) =>
  weekStartOf(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

/** A task met its SLA if it completed before its due date. */
const metSla = (t: { completedAt: Date | null; dueDate: Date }) =>
  t.completedAt !== null && t.completedAt <= t.dueDate;

const cycleHours = (t: { createdAt: Date; completedAt: Date | null }) =>
  t.completedAt ? (t.completedAt.getTime() - t.createdAt.getTime()) / HOUR : 0;

/* ------------------------------------------------------------------ KPIs */

export async function computeKpis(
  where: Prisma.TaskWhereInput,
  scope: 'org' | 'dept' | 'me',
): Promise<KpiSummaryDTO> {
  const now = new Date();
  const todayEnd = new Date(startOfDay(now).getTime() + DAY);

  const tasks = await prisma.task.findMany({
    where,
    select: { status: true, dueDate: true, createdAt: true, completedAt: true, assigneeId: true },
  });

  const byStatus = { PENDING: 0, IN_PROGRESS: 0, UNDER_REVIEW: 0, COMPLETED: 0 };
  let overdue = 0;
  let dueToday = 0;
  const completed: typeof tasks = [];

  for (const t of tasks) {
    byStatus[t.status] += 1;
    if (t.status !== 'COMPLETED') {
      if (t.dueDate < now) overdue += 1;
      else if (t.dueDate < todayEnd) dueToday += 1;
    } else {
      completed.push(t);
    }
  }

  const onTime = completed.filter(metSla).length;
  const avgCycle = completed.length
    ? completed.reduce((s, t) => s + cycleHours(t), 0) / completed.length
    : 0;

  /**
   * The "30–40% faster workflow execution" claim, measured rather than asserted:
   * mean cycle time of tasks completed in the OLDER half of the window versus the
   * RECENT half. Positive = getting faster.
   */
  const sorted = [...completed].sort(
    (a, b) => (a.completedAt?.getTime() ?? 0) - (b.completedAt?.getTime() ?? 0),
  );
  const mid = Math.floor(sorted.length / 2);
  const olderHalf = sorted.slice(0, mid);
  const recentHalf = sorted.slice(mid);
  const avgOf = (list: typeof completed) =>
    list.length ? list.reduce((s, t) => s + cycleHours(t), 0) / list.length : 0;
  const oldAvg = avgOf(olderHalf);
  const newAvg = avgOf(recentHalf);
  const improvement = oldAvg > 0 ? ((oldAvg - newAvg) / oldAvg) * 100 : 0;

  const activeUsers = new Set(tasks.map((t) => t.assigneeId)).size;

  return {
    scope,
    totalTasks: tasks.length,
    pending: byStatus.PENDING,
    inProgress: byStatus.IN_PROGRESS,
    underReview: byStatus.UNDER_REVIEW,
    completed: byStatus.COMPLETED,
    overdue,
    dueToday,
    onTimePct: completed.length ? Math.round((onTime / completed.length) * 100) : 100,
    avgCycleTimeHours: Number(avgCycle.toFixed(1)),
    cycleTimeImprovementPct: Number(improvement.toFixed(1)),
    slaCompliancePct: completed.length ? Math.round((onTime / completed.length) * 100) : 100,
    activeUsers,
  };
}

/* ---------------------------------------------------------------- trends */

/** Weekly throughput, mean cycle time and breach count over the last N weeks. */
export async function computeTrends(
  where: Prisma.TaskWhereInput,
  weeks = 12,
): Promise<TrendPointDTO[]> {
  const since = weekStartOf(new Date(Date.now() - weeks * 7 * DAY));

  const tasks = await prisma.task.findMany({
    where: { AND: [where, { completedAt: { gte: since } }] },
    select: { createdAt: true, completedAt: true, dueDate: true },
  });

  const buckets = new Map<string, { label: string; cycle: number[]; breaches: number }>();

  // Pre-create every week so the chart has no gaps.
  for (let i = weeks - 1; i >= 0; i -= 1) {
    const d = new Date(Date.now() - i * 7 * DAY);
    buckets.set(weekKey(d), { label: weekLabel(d), cycle: [], breaches: 0 });
  }

  for (const t of tasks) {
    if (!t.completedAt) continue;
    const bucket = buckets.get(weekKey(t.completedAt));
    if (!bucket) continue;
    bucket.cycle.push(cycleHours(t));
    if (!metSla(t)) bucket.breaches += 1;
  }

  return [...buckets.entries()].map(([week, b]) => ({
    week,
    label: b.label,
    throughput: b.cycle.length,
    avgCycleTimeHours: b.cycle.length
      ? Number((b.cycle.reduce((s, c) => s + c, 0) / b.cycle.length).toFixed(1))
      : 0,
    breaches: b.breaches,
  }));
}

/* ------------------------------------------------------------------- SLA */

export async function computeSla(where: Prisma.TaskWhereInput): Promise<SlaAnalyticsDTO> {
  const tasks = await prisma.task.findMany({
    where: { AND: [where, { status: 'COMPLETED' }] },
    select: {
      priority: true,
      dueDate: true,
      completedAt: true,
      departmentId: true,
      department: { select: { code: true, name: true } },
    },
  });

  const breached = tasks.filter((t) => !metSla(t)).length;

  const priorities: Priority[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
  const byPriority = priorities.map((priority) => {
    const subset = tasks.filter((t) => t.priority === priority);
    const b = subset.filter((t) => !metSla(t)).length;
    return {
      priority,
      total: subset.length,
      breached: b,
      compliancePct: subset.length ? Math.round(((subset.length - b) / subset.length) * 100) : 100,
    };
  });

  const deptMap = new Map<string, { code: string; name: string; total: number; breached: number }>();
  for (const t of tasks) {
    const entry = deptMap.get(t.departmentId) ?? {
      code: t.department.code,
      name: t.department.name,
      total: 0,
      breached: 0,
    };
    entry.total += 1;
    if (!metSla(t)) entry.breached += 1;
    deptMap.set(t.departmentId, entry);
  }

  const byDepartment = [...deptMap.entries()].map(([departmentId, d]) => ({
    departmentId,
    code: d.code,
    name: d.name,
    total: d.total,
    breached: d.breached,
    compliancePct: d.total ? Math.round(((d.total - d.breached) / d.total) * 100) : 100,
  }));

  // weeks × departments — drives the Admin heatmap.
  const heatMap = new Map<string, { week: string; departmentId: string; code: string; breaches: number; total: number }>();
  for (const t of tasks) {
    if (!t.completedAt) continue;
    const key = `${weekKey(t.completedAt)}|${t.departmentId}`;
    const cell = heatMap.get(key) ?? {
      week: weekKey(t.completedAt),
      departmentId: t.departmentId,
      code: t.department.code,
      breaches: 0,
      total: 0,
    };
    cell.total += 1;
    if (!metSla(t)) cell.breaches += 1;
    heatMap.set(key, cell);
  }

  return {
    compliancePct: tasks.length ? Math.round(((tasks.length - breached) / tasks.length) * 100) : 100,
    totalMeasured: tasks.length,
    breached,
    byPriority,
    byDepartment: byDepartment.sort((a, b) => a.code.localeCompare(b.code)),
    heatmap: [...heatMap.values()].sort((a, b) => a.week.localeCompare(b.week)),
  };
}

/* -------------------------------------------------------------- workload */

export async function computeWorkload(departmentId?: string): Promise<WorkloadItemDTO[]> {
  const users = await prisma.user.findMany({
    where: { role: 'EMPLOYEE', active: true, ...(departmentId ? { departmentId } : {}) },
    select: { id: true, name: true, designation: true, avatarSeed: true },
    orderBy: { name: 'asc' },
  });

  const now = new Date();
  const since30 = new Date(now.getTime() - 30 * DAY);
  const ids = users.map((u) => u.id);
  if (ids.length === 0) return [];

  const tasks = await prisma.task.findMany({
    where: { assigneeId: { in: ids } },
    select: { assigneeId: true, status: true, dueDate: true, completedAt: true },
  });

  return users.map((u) => {
    const mine = tasks.filter((t) => t.assigneeId === u.id);
    const active = mine.filter((t) => t.status !== 'COMPLETED');
    const overdue = active.filter((t) => t.dueDate < now).length;
    const completed30d = mine.filter((t) => t.completedAt && t.completedAt >= since30).length;
    const activeLoad = active.length;

    const band: WorkloadItemDTO['band'] =
      activeLoad >= 9 ? 'OVERLOADED' : activeLoad >= 6 ? 'HEAVY' : activeLoad >= 3 ? 'BALANCED' : 'LIGHT';

    return {
      userId: u.id,
      name: u.name,
      designation: u.designation,
      avatarSeed: u.avatarSeed,
      activeLoad,
      overdue,
      completed30d,
      band,
    };
  });
}

/* ----------------------------------------------------- user performance */

export async function computeUserPerformance(userId: string): Promise<UserPerformanceDTO> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { id: true, name: true },
  });

  const now = new Date();
  const tasks = await prisma.task.findMany({
    where: { assigneeId: userId },
    select: { status: true, createdAt: true, completedAt: true, dueDate: true },
    orderBy: { completedAt: 'asc' },
  });

  const completed = tasks.filter((t) => t.status === 'COMPLETED' && t.completedAt);
  const onTime = completed.filter(metSla).length;
  const since30 = new Date(now.getTime() - 30 * DAY);

  // Streak = consecutive most-recent completions that met their SLA.
  let currentStreak = 0;
  for (let i = completed.length - 1; i >= 0; i -= 1) {
    if (metSla(completed[i])) currentStreak += 1;
    else break;
  }

  // Last 6 calendar months.
  const monthly: UserPerformanceDTO['monthly'] = [];
  for (let i = 5; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const next = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    const inMonth = completed.filter((t) => t.completedAt! >= d && t.completedAt! < next);
    monthly.push({
      month: d.toLocaleDateString('en-IN', { month: 'short' }),
      completed: inMonth.length,
      onTime: inMonth.filter(metSla).length,
    });
  }

  const cycleTrend: UserPerformanceDTO['cycleTrend'] = [];
  for (let i = 7; i >= 0; i -= 1) {
    const ws = weekStartOf(new Date(now.getTime() - i * 7 * DAY));
    const we = new Date(ws.getTime() + 7 * DAY);
    const inWeek = completed.filter((t) => t.completedAt! >= ws && t.completedAt! < we);
    cycleTrend.push({
      week: ws.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
      avgCycleTimeHours: inWeek.length
        ? Number((inWeek.reduce((s, t) => s + cycleHours(t), 0) / inWeek.length).toFixed(1))
        : 0,
    });
  }

  const sentiments = await prisma.sentimentRecord.findMany({
    where: { userId, createdAt: { gte: new Date(now.getTime() - 30 * DAY) } },
    select: { score: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  const byDay = new Map<string, number[]>();
  for (const s of sentiments) {
    const key = s.createdAt.toISOString().slice(0, 10);
    byDay.set(key, [...(byDay.get(key) ?? []), s.score]);
  }
  const sentimentTrend = [...byDay.entries()].map(([date, scores]) => ({
    date,
    score: Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(3)),
  }));

  const onTimePct = completed.length ? Math.round((onTime / completed.length) * 100) : 100;
  const throughput30d = completed.filter((t) => t.completedAt! >= since30).length;
  const avgCycleTimeHours = completed.length
    ? Number((completed.reduce((s, t) => s + cycleHours(t), 0) / completed.length).toFixed(1))
    : 0;

  return {
    userId: user.id,
    name: user.name,
    onTimePct,
    throughput30d,
    avgCycleTimeHours,
    completedTotal: completed.length,
    currentStreak,
    monthly,
    cycleTrend,
    sentimentTrend,
    badges: [
      {
        key: 'on-time',
        label: 'On-time Achiever',
        earned: onTimePct >= 85 && completed.length >= 5,
        hint: '85%+ on-time completion',
      },
      {
        key: 'streak',
        label: `${currentStreak}-task Streak`,
        earned: currentStreak >= 5,
        hint: '5 consecutive tasks within SLA',
      },
      {
        key: 'volume',
        label: 'High Throughput',
        earned: throughput30d >= 8,
        hint: '8+ tasks completed in 30 days',
      },
      {
        key: 'fast',
        label: 'Quick Turnaround',
        earned: avgCycleTimeHours > 0 && avgCycleTimeHours <= 48,
        hint: 'Average cycle time under 48 hours',
      },
    ],
  };
}
