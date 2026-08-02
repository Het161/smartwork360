import type { Prisma } from '@prisma/client';
import type { TaskDTO, TaskUpdateDTO } from '@smartwork/shared';
import { userBriefSelect } from '../users/user.mapper';

export const taskInclude = {
  assignee: { select: userBriefSelect },
  creator: { select: userBriefSelect },
  department: { select: { id: true, code: true, name: true, nameHi: true } },
  _count: { select: { updates: true } },
} satisfies Prisma.TaskInclude;

export const taskDetailInclude = {
  ...taskInclude,
  updates: {
    orderBy: { createdAt: 'asc' },
    include: {
      author: { select: userBriefSelect },
      sentiment: { select: { score: true, label: true } },
    },
  },
} satisfies Prisma.TaskInclude;

type TaskRow = Prisma.TaskGetPayload<{ include: typeof taskInclude }>;
type TaskDetailRow = Prisma.TaskGetPayload<{ include: typeof taskDetailInclude }>;

const HOUR = 3600_000;

/**
 * `isOverdue` and `hoursRemaining` are derived here rather than stored, so they can
 * never go stale relative to the clock. Everything the UI needs to colour an SLA
 * chip comes from this one place.
 */
export function toTaskDTO(task: TaskRow, now = new Date()): TaskDTO {
  const isOverdue = task.status !== 'COMPLETED' && task.dueDate < now;
  return {
    id: task.id,
    refNo: task.refNo,
    title: task.title,
    description: task.description,
    priority: task.priority,
    status: task.status,
    creatorId: task.creatorId,
    assigneeId: task.assigneeId,
    departmentId: task.departmentId,
    dueDate: task.dueDate.toISOString(),
    slaHours: task.slaHours,
    startedAt: task.startedAt?.toISOString() ?? null,
    completedAt: task.completedAt?.toISOString() ?? null,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
    isOverdue,
    hoursRemaining: Number(((task.dueDate.getTime() - now.getTime()) / HOUR).toFixed(2)),
    assignee: task.assignee,
    creator: task.creator,
    department: task.department,
    updateCount: task._count.updates,
  };
}

export function toTaskDetailDTO(task: TaskDetailRow, now = new Date()): TaskDTO {
  const base = toTaskDTO(task as unknown as TaskRow, now);
  const updates: TaskUpdateDTO[] = task.updates.map((u) => ({
    id: u.id,
    taskId: u.taskId,
    authorId: u.authorId,
    author: u.author,
    type: u.type,
    note: u.note,
    progressPct: u.progressPct,
    createdAt: u.createdAt.toISOString(),
    sentiment: u.sentiment ? { score: u.sentiment.score, label: u.sentiment.label } : null,
  }));

  // Progress is the most recent explicit percentage; completed work always reads 100.
  const lastProgress = [...task.updates].reverse().find((u) => u.progressPct != null);
  const progressPct =
    task.status === 'COMPLETED' ? 100 : (lastProgress?.progressPct ?? (task.startedAt ? 10 : 0));

  return { ...base, updates, progressPct };
}
