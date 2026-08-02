import cron from 'node-cron';
import { prisma } from '../db/prisma';
import { env } from '../config/env';
import { logger } from '../config/logger';

const HOUR = 3600_000;

/**
 * SLA scanner — runs every 60 seconds.
 *
 * Two notification classes:
 *   • BREACHED — the deadline has passed and the task is not complete.
 *   • NEARING  — under 24 hours remain.
 *
 * De-duplication is by (userId, title, link): a task must generate at most one
 * breach notice, or a demo left running for ten minutes would produce hundreds.
 */
export async function scanSla(): Promise<{ breached: number; nearing: number }> {
  const now = new Date();
  const in24h = new Date(now.getTime() + 24 * HOUR);

  const tasks = await prisma.task.findMany({
    where: { status: { not: 'COMPLETED' }, dueDate: { lt: in24h } },
    select: {
      id: true,
      refNo: true,
      title: true,
      dueDate: true,
      assigneeId: true,
      departmentId: true,
    },
  });
  if (tasks.length === 0) return { breached: 0, nearing: 0 };

  const links = tasks.map((t) => `/tasks/${t.id}`);
  const existing = await prisma.notification.findMany({
    where: { link: { in: links } },
    select: { userId: true, title: true, link: true },
  });
  const seen = new Set(existing.map((n) => `${n.userId}|${n.title}|${n.link}`));

  // One manager lookup per department rather than one per task.
  const deptIds = [...new Set(tasks.map((t) => t.departmentId))];
  const managers = await prisma.user.findMany({
    where: { departmentId: { in: deptIds }, role: 'MANAGER', active: true },
    select: { id: true, departmentId: true },
  });
  const managerByDept = new Map(managers.map((m) => [m.departmentId, m.id]));

  const pending: { userId: string; title: string; body: string; link: string }[] = [];
  let breached = 0;
  let nearing = 0;

  for (const task of tasks) {
    const isBreached = task.dueDate < now;
    const hours = Math.abs(Math.round((task.dueDate.getTime() - now.getTime()) / HOUR));
    const link = `/tasks/${task.id}`;

    const title = isBreached ? 'SLA breached' : 'Due within 24 hours';
    const body = isBreached
      ? `${task.refNo} — ${task.title} passed its deadline ${hours}h ago.`
      : `${task.refNo} — ${task.title} is due in ${hours}h.`;

    const push = (userId: string, t: string, b: string) => {
      const key = `${userId}|${t}|${link}`;
      if (seen.has(key)) return;
      seen.add(key);
      pending.push({ userId, title: t, body: b, link });
    };

    push(task.assigneeId, title, body);
    if (isBreached) {
      breached += 1;
      // Escalate breaches to the department manager as well.
      const managerId = managerByDept.get(task.departmentId);
      if (managerId && managerId !== task.assigneeId) {
        push(managerId, 'SLA breach in your department', body);
      }
    } else {
      nearing += 1;
    }
  }

  if (pending.length > 0) {
    await prisma.notification.createMany({ data: pending });
    logger.info({ created: pending.length, breached, nearing }, 'SLA scan created notifications');
  }

  return { breached, nearing };
}

let task: cron.ScheduledTask | null = null;

export function startSlaCron() {
  if (!env.ENABLE_SLA_CRON) {
    logger.info('SLA cron disabled (ENABLE_SLA_CRON=false)');
    return;
  }
  if (task) return;

  task = cron.schedule('* * * * *', () => {
    scanSla().catch((err) => logger.error({ err }, 'SLA scan failed'));
  });
  logger.info('SLA breach scanner scheduled (every 60s)');
}

export function stopSlaCron() {
  task?.stop();
  task = null;
}
