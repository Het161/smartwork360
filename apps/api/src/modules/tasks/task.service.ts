import type { Prisma, TaskStatus } from '@prisma/client';
import {
  DEFAULT_SLA_HOURS,
  canTransition,
  type CreateTaskInput,
  type Priority,
  type TaskUpdateInput,
  type UpdateTaskInput,
} from '@smartwork/shared';
import { prisma } from '../../db/prisma';
import { appendEvent } from '../../audit/audit.service';
import { diffFields, hasChanges } from '../../audit/diff';
import { badRequest, notFound, HttpError } from '../../middleware/errors';
import type { AccessTokenPayload } from '../../auth/jwt';
import { assertCanAccessTask } from '../../middleware/scope';
import { LEXICON_MODEL_VERSION, scoreSentiment } from '../../ml/lexicon';
import { scoreSentimentBatch } from '../../ml/client';
import { taskDetailInclude, taskInclude } from './task.mapper';

/**
 * SLA hours for a department+priority.
 *
 * Refuses rather than falling back to a hidden global default. A deadline is
 * the thing every SLA figure in this system is measured against, so quietly
 * inventing one produces reports that look precise and mean nothing. If a
 * department has no rule for a priority, that is a configuration gap for a
 * human to close — and the error carries the ids needed to close it.
 */
export async function resolveSlaHours(departmentId: string, priority: Priority): Promise<number> {
  const policy = await prisma.sLAPolicy.findUnique({
    where: { departmentId_priority: { departmentId, priority } },
  });
  if (!policy) {
    throw new HttpError(
      400,
      `There is no ${priority.toLowerCase()} deadline rule for this department, so the due date cannot be worked out.`,
      'SLA_POLICY_MISSING',
      { departmentId, priority, defaultHours: DEFAULT_SLA_HOURS[priority] },
    );
  }
  return policy.hours;
}

/** Reference numbers look like REV/2026/0042 and are unique per department+year. */
async function nextRefNo(departmentCode: string, tx: Prisma.TransactionClient): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `${departmentCode}/${year}/`;
  const last = await tx.task.findFirst({
    where: { refNo: { startsWith: prefix } },
    orderBy: { refNo: 'desc' },
    select: { refNo: true },
  });
  const n = last ? Number.parseInt(last.refNo.slice(prefix.length), 10) + 1 : 1;
  return `${prefix}${String(n).padStart(4, '0')}`;
}

/**
 * Creates a task and its audit block in ONE transaction. If the audit append
 * fails, the task is rolled back too — there is no unaudited task in the system.
 */
export async function createTask(input: CreateTaskInput, actor: AccessTokenPayload) {
  const department = await prisma.department.findUnique({ where: { id: input.departmentId } });
  if (!department) throw notFound('Department not found');

  const assignee = await prisma.user.findUnique({ where: { id: input.assigneeId } });
  if (!assignee) throw badRequest('Assignee not found');
  if (!assignee.active) {
    throw new HttpError(
      409,
      `${assignee.name}'s account is not active, so work cannot be assigned to them.`,
      'TASK_ASSIGNEE_INACTIVE',
      { taskId: null, assigneeId: assignee.id, departmentId: input.departmentId },
    );
  }
  if (assignee.departmentId !== input.departmentId) {
    throw badRequest(`${assignee.name} does not belong to the ${department.name} department`);
  }

  const slaHours = input.slaHours ?? (await resolveSlaHours(input.departmentId, input.priority));

  return prisma.$transaction(async (tx) => {
    const refNo = await nextRefNo(department.code, tx);
    const task = await tx.task.create({
      data: {
        refNo,
        title: input.title,
        description: input.description,
        priority: input.priority,
        assigneeId: input.assigneeId,
        creatorId: actor.sub,
        departmentId: input.departmentId,
        dueDate: input.dueDate,
        slaHours,
      },
      include: taskInclude,
    });

    await appendEvent(
      {
        entityType: 'TASK',
        entityId: task.id,
        action: 'TASK_CREATED',
        actorId: actor.sub,
        payload: {
          refNo,
          title: task.title,
          priority: task.priority,
          assigneeId: task.assigneeId,
          dueDate: task.dueDate.toISOString(),
          slaHours,
        },
      },
      tx,
    );

    await tx.notification.create({
      data: {
        userId: assignee.id,
        title: 'New task assigned',
        body: `${refNo} — ${task.title}`,
        link: `/tasks/${task.id}`,
      },
    });

    return task;
  });
}

export async function updateTask(taskId: string, input: UpdateTaskInput, actor: AccessTokenPayload) {
  const existing = await prisma.task.findUnique({ where: { id: taskId } });
  if (!existing) throw notFound('Task not found');
  assertCanAccessTask(actor, existing);

  if (input.assigneeId && input.assigneeId !== existing.assigneeId) {
    const assignee = await prisma.user.findUnique({ where: { id: input.assigneeId } });
    if (!assignee || assignee.departmentId !== existing.departmentId) {
      throw badRequest('Assignee must belong to the same department');
    }
  }

  // Record only what actually changed — the audit payload is evidence, not a dump.
  const changes = diffFields(existing, input, [
    'title',
    'description',
    'priority',
    'assigneeId',
    'slaHours',
    'dueDate',
  ]);

  if (!hasChanges(changes)) {
    return prisma.task.findUniqueOrThrow({ where: { id: taskId }, include: taskInclude });
  }

  return prisma.$transaction(async (tx) => {
    const task = await tx.task.update({
      where: { id: taskId },
      data: {
        title: input.title,
        description: input.description,
        priority: input.priority,
        assigneeId: input.assigneeId,
        dueDate: input.dueDate,
        slaHours: input.slaHours,
      },
      include: taskInclude,
    });

    await appendEvent(
      {
        entityType: 'TASK',
        entityId: task.id,
        action: 'TASK_UPDATED',
        actorId: actor.sub,
        payload: { refNo: task.refNo, changes },
      },
      tx,
    );

    if (changes.assigneeId) {
      await tx.notification.create({
        data: {
          userId: task.assigneeId,
          title: 'Task reassigned to you',
          body: `${task.refNo} — ${task.title}`,
          link: `/tasks/${task.id}`,
        },
      });
    }

    return task;
  });
}

/**
 * Status transitions. The allowed graph lives in @smartwork/shared so the kanban
 * board and this validator can never disagree; an impossible jump is rejected
 * before it can reach the audit chain.
 */
export async function changeStatus(
  taskId: string,
  to: TaskStatus,
  note: string | undefined,
  actor: AccessTokenPayload,
) {
  const existing = await prisma.task.findUnique({ where: { id: taskId } });
  if (!existing) throw notFound('Task not found');
  assertCanAccessTask(actor, existing);

  if (existing.status === to) throw badRequest(`Task is already ${to}`);
  if (!canTransition(existing.status, to)) {
    // Carries its documented code and the ids, so the support assistant can
    // both explain it and offer the repair without anything being retyped.
    throw new HttpError(
      400,
      `A task cannot move from ${existing.status.toLowerCase().replace(/_/g, ' ')} to ${to
        .toLowerCase()
        .replace(/_/g, ' ')}.`,
      'INVALID_STATUS_TRANSITION',
      { taskId, from: existing.status, to },
    );
  }

  // Maker-checker: only a manager or admin signs off the final approval, and never
  // on their own submission. This is the rule the SELF_APPROVAL detector watches.
  if (to === 'COMPLETED') {
    if (actor.role === 'EMPLOYEE') {
      throw badRequest('Only a manager can approve a task for completion');
    }
    if (existing.assigneeId === actor.sub) {
      throw badRequest(
        'Maker-checker separation: you cannot approve a task that is assigned to you',
      );
    }
  }

  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const task = await tx.task.update({
      where: { id: taskId },
      data: {
        status: to,
        startedAt: to === 'IN_PROGRESS' && !existing.startedAt ? now : existing.startedAt,
        completedAt: to === 'COMPLETED' ? now : null,
      },
      include: taskInclude,
    });

    await appendEvent(
      {
        entityType: 'TASK',
        entityId: task.id,
        action: 'TASK_STATUS_CHANGED',
        actorId: actor.sub,
        payload: { refNo: task.refNo, from: existing.status, to, note: note ?? null },
      },
      tx,
    );

    if (note) {
      await tx.taskUpdate.create({
        data: { taskId, authorId: actor.sub, type: 'STATUS_CHANGE', note },
      });
    }

    // Tell the assignee when someone else moved their task.
    if (task.assigneeId !== actor.sub) {
      await tx.notification.create({
        data: {
          userId: task.assigneeId,
          title: `Task moved to ${to.replace('_', ' ').toLowerCase()}`,
          body: `${task.refNo} — ${task.title}`,
          link: `/tasks/${task.id}`,
        },
      });
    }

    return task;
  });
}

/**
 * Manager review decision. Approve → COMPLETED, reject → back to IN_PROGRESS.
 * The note is mandatory (enforced by zod) because it is the evidence written into
 * the audit block.
 */
export async function reviewTask(
  taskId: string,
  decision: 'APPROVE' | 'REJECT',
  note: string,
  actor: AccessTokenPayload,
) {
  const existing = await prisma.task.findUnique({ where: { id: taskId } });
  if (!existing) throw notFound('Task not found');
  assertCanAccessTask(actor, existing);

  if (existing.status !== 'UNDER_REVIEW') {
    throw badRequest('Only tasks under review can be approved or rejected');
  }
  if (existing.assigneeId === actor.sub) {
    throw badRequest('Maker-checker separation: you cannot review your own task');
  }

  const to: TaskStatus = decision === 'APPROVE' ? 'COMPLETED' : 'IN_PROGRESS';
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const task = await tx.task.update({
      where: { id: taskId },
      data: { status: to, completedAt: decision === 'APPROVE' ? now : null },
      include: taskInclude,
    });

    await appendEvent(
      {
        entityType: 'TASK',
        entityId: task.id,
        action: decision === 'APPROVE' ? 'TASK_APPROVED' : 'TASK_REJECTED',
        actorId: actor.sub,
        payload: { refNo: task.refNo, note, reviewedBy: actor.name },
      },
      tx,
    );
    await appendEvent(
      {
        entityType: 'TASK',
        entityId: task.id,
        action: 'TASK_STATUS_CHANGED',
        actorId: actor.sub,
        payload: { refNo: task.refNo, from: 'UNDER_REVIEW', to },
      },
      tx,
    );

    await tx.taskUpdate.create({
      data: { taskId, authorId: actor.sub, type: 'REVIEW_NOTE', note },
    });

    await tx.notification.create({
      data: {
        userId: task.assigneeId,
        title: decision === 'APPROVE' ? 'Task approved' : 'Task sent back for rework',
        body: `${task.refNo} — ${note}`,
        link: `/tasks/${task.id}`,
      },
    });

    return task;
  });
}

/**
 * Adds a progress note. Sentiment is scored inline: the ML service is tried first
 * and the local lexicon is used if it is unreachable, so a note added on stage
 * always shows a sentiment chip.
 */
export async function addTaskUpdate(
  taskId: string,
  input: TaskUpdateInput,
  actor: AccessTokenPayload,
) {
  const existing = await prisma.task.findUnique({ where: { id: taskId } });
  if (!existing) throw notFound('Task not found');
  assertCanAccessTask(actor, existing);

  const scored = await scoreSentimentBatch([{ id: 'x', text: input.note }]);
  const sentiment = scored.items[0] ?? { ...scoreSentiment(input.note) };
  const modelVersion = scored.modelVersion ?? LEXICON_MODEL_VERSION;

  return prisma.$transaction(async (tx) => {
    const update = await tx.taskUpdate.create({
      data: {
        taskId,
        authorId: actor.sub,
        type: input.type,
        note: input.note,
        progressPct: input.progressPct,
      },
    });

    await tx.sentimentRecord.create({
      data: {
        taskUpdateId: update.id,
        userId: actor.sub,
        score: sentiment.score,
        label: sentiment.label,
        modelVersion,
      },
    });

    await appendEvent(
      {
        entityType: 'TASK',
        entityId: taskId,
        action: 'TASK_UPDATE_ADDED',
        actorId: actor.sub,
        payload: {
          refNo: existing.refNo,
          type: input.type,
          progressPct: input.progressPct ?? null,
          sentiment: { score: sentiment.score, label: sentiment.label },
        },
      },
      tx,
    );

    // Keep the manager in the loop when an employee reports a problem.
    if (sentiment.label === 'NEGATIVE' && actor.role === 'EMPLOYEE') {
      const manager = await tx.user.findFirst({
        where: { departmentId: existing.departmentId, role: 'MANAGER' },
      });
      if (manager) {
        await tx.notification.create({
          data: {
            userId: manager.id,
            title: 'Negative update flagged',
            body: `${actor.name} on ${existing.refNo}: "${input.note.slice(0, 80)}"`,
            link: `/tasks/${taskId}`,
          },
        });
      }
    }

    return tx.taskUpdate.findUniqueOrThrow({
      where: { id: update.id },
      include: {
        author: { select: { id: true, name: true, avatarSeed: true, designation: true } },
        sentiment: { select: { score: true, label: true } },
      },
    });
  });
}

export async function getTaskDetail(taskId: string, actor: AccessTokenPayload) {
  const task = await prisma.task.findUnique({ where: { id: taskId }, include: taskDetailInclude });
  if (!task) throw notFound('Task not found');
  assertCanAccessTask(actor, task);
  return task;
}

/** Bulk reassignment — one transaction, one audit block per task. */
export async function bulkAssign(
  taskIds: string[],
  assigneeId: string,
  actor: AccessTokenPayload,
) {
  const assignee = await prisma.user.findUnique({ where: { id: assigneeId } });
  if (!assignee || !assignee.active) throw badRequest('Assignee not found or inactive');

  const tasks = await prisma.task.findMany({ where: { id: { in: taskIds } } });
  if (tasks.length !== taskIds.length) throw notFound('One or more tasks were not found');
  for (const task of tasks) {
    assertCanAccessTask(actor, task);
    if (task.departmentId !== assignee.departmentId) {
      throw badRequest(`${assignee.name} is not in the same department as ${task.refNo}`);
    }
  }

  return prisma.$transaction(async (tx) => {
    for (const task of tasks) {
      if (task.assigneeId === assigneeId) continue;
      await tx.task.update({ where: { id: task.id }, data: { assigneeId } });
      await appendEvent(
        {
          entityType: 'TASK',
          entityId: task.id,
          action: 'TASK_UPDATED',
          actorId: actor.sub,
          payload: {
            refNo: task.refNo,
            changes: { assigneeId: { from: task.assigneeId, to: assigneeId } },
            bulk: true,
          },
        },
        tx,
      );
    }
    await tx.notification.create({
      data: {
        userId: assigneeId,
        title: `${tasks.length} tasks assigned to you`,
        body: tasks.map((t) => t.refNo).join(', ').slice(0, 180),
        link: '/e/tasks',
      },
    });
    return { updated: tasks.length };
  });
}
