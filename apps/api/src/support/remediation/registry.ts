/**
 * The remediation registry — the ONLY actions that exist.
 *
 * This file is the security boundary. The model cannot execute anything; it can
 * only name one of these entries and supply arguments. Everything else about a
 * fix is decided here and in the executor:
 *
 *   - `argsSchema` decides what arguments are even representable.
 *   - `allowedRoles` is re-checked against the caller's real JWT, never against
 *     whatever the conversation claims about them.
 *   - `scopeCheck` confines managers to their own department.
 *   - `execute` receives a transaction and returns an undo plan.
 *
 * There is deliberately no "high" risk tier. An action too dangerous for a
 * one-click confirm is an action that does not belong in an assistant, so it is
 * simply absent — as are anything touching AuditEvent/Anchor rows, deletions,
 * role and password changes, and bulk edits. Absence is a stronger guarantee
 * than a permission check.
 */
import { z } from 'zod';
import type { Prisma, PrismaClient } from '@prisma/client';
import type { Role } from '@smartwork/shared';
import type { AccessTokenPayload } from '../../auth/jwt';

export type PrismaTx = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

/** How to reverse an applied fix. Interpreted by the executor, never by the model. */
export type UndoSpec =
  | { kind: 'deleteSlaPolicy'; id: string }
  | { kind: 'restoreUserDepartment'; userId: string; departmentId: string | null }
  | { kind: 'restoreTaskStatus'; taskId: string; status: string }
  | { kind: 'restoreTaskAssignee'; taskId: string; assigneeId: string }
  | { kind: 'restoreAlertStatus'; alertId: string; status: string; reviewNote: string | null }
  | { kind: 'none' };

export interface ActionContext {
  actor: AccessTokenPayload;
  tx: PrismaTx;
}

export interface ActionResult {
  /** One plain sentence shown back in the chat. */
  summary: string;
  undo: UndoSpec;
  /** Shown in the confirm dialog for medium-risk actions. */
  diff?: { before: string; after: string };
}

export interface RemediationAction<A = Record<string, unknown>> {
  name: string;
  /** Given to the model — it is how the model decides this action applies. */
  description: string;
  /** Human-readable argument list, also shown to the model. */
  argsHint: string;
  argsSchema: z.ZodType<A>;
  risk: 'low' | 'medium';
  allowedRoles: Role[];
  /** Extra confinement beyond role, e.g. "managers only inside their department". */
  scopeCheck?: (ctx: { actor: AccessTokenPayload; args: A; tx: PrismaTx }) => Promise<boolean>;
  execute: (ctx: ActionContext & { args: A }) => Promise<ActionResult>;
  /** The action string written to the audit ledger. */
  auditAction: string;
  /** Entity the audit event is filed against. */
  auditEntity: (args: A) => { entityType: string; entityId: string };
}

/* ------------------------------------------------------------------ helpers */

/** Managers may only act on their own department; admins are unrestricted. */
async function sameDepartment(
  actor: AccessTokenPayload,
  departmentId: string | null | undefined,
): Promise<boolean> {
  if (actor.role === 'ADMIN') return true;
  if (!departmentId || !actor.departmentId) return false;
  return actor.departmentId === departmentId;
}

const DEFAULT_SLA_HOURS: Record<string, number> = {
  CRITICAL: 24,
  HIGH: 48,
  MEDIUM: 96,
  LOW: 168,
};

const priorityEnum = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
const statusEnum = z.enum(['PENDING', 'IN_PROGRESS', 'UNDER_REVIEW', 'COMPLETED']);

/* ------------------------------------------------------------------ actions */

const createMissingSlaPolicy: RemediationAction<{
  departmentId: string;
  priority: z.infer<typeof priorityEnum>;
  hours?: number;
}> = {
  name: 'create_missing_sla_policy',
  description:
    'Create the missing SLA deadline rule for a department and priority, so tasks of that priority can be created. Use when task creation failed with SLA_POLICY_MISSING.',
  argsHint: 'departmentId, priority',
  argsSchema: z.object({
    departmentId: z.string().min(1),
    priority: priorityEnum,
    hours: z.number().int().min(1).max(2000).optional(),
  }),
  risk: 'low',
  allowedRoles: ['ADMIN'],
  auditAction: 'AUTOFIX_SLA_POLICY_CREATED',
  auditEntity: (a) => ({ entityType: 'SLAPolicy', entityId: `${a.departmentId}:${a.priority}` }),
  scopeCheck: async ({ actor, args }) => sameDepartment(actor, args.departmentId),
  execute: async ({ args, tx }) => {
    const dept = await tx.department.findUnique({ where: { id: args.departmentId } });
    if (!dept) throw new Error('That department no longer exists.');

    const existing = await tx.sLAPolicy.findUnique({
      where: { departmentId_priority: { departmentId: args.departmentId, priority: args.priority } },
    });
    if (existing) {
      return {
        summary: `${dept.name} already has a ${args.priority} rule of ${existing.hours} hours — nothing to change.`,
        undo: { kind: 'none' },
      };
    }

    const hours = args.hours ?? DEFAULT_SLA_HOURS[args.priority] ?? 48;
    const created = await tx.sLAPolicy.create({
      data: { departmentId: args.departmentId, priority: args.priority, hours },
    });
    return {
      summary: `Added a ${args.priority} rule of ${hours} hours for ${dept.name}. Try creating the task again.`,
      undo: { kind: 'deleteSlaPolicy', id: created.id },
    };
  },
};

const assignUserDepartment: RemediationAction<{ userId: string; departmentId: string }> = {
  name: 'assign_user_department',
  description:
    'Attach a user account to a department so their dashboards stop coming back empty. Use for USER_NO_DEPARTMENT.',
  argsHint: 'userId, departmentId',
  argsSchema: z.object({ userId: z.string().min(1), departmentId: z.string().min(1) }),
  risk: 'low',
  allowedRoles: ['ADMIN'],
  auditAction: 'AUTOFIX_USER_DEPARTMENT_ASSIGNED',
  auditEntity: (a) => ({ entityType: 'User', entityId: a.userId }),
  execute: async ({ args, tx }) => {
    const [user, dept] = await Promise.all([
      tx.user.findUnique({ where: { id: args.userId } }),
      tx.department.findUnique({ where: { id: args.departmentId } }),
    ]);
    if (!user) throw new Error('That user no longer exists.');
    if (!dept) throw new Error('That department no longer exists.');

    const before = user.departmentId;
    await tx.user.update({
      where: { id: args.userId },
      data: { departmentId: args.departmentId },
    });
    return {
      summary: `${user.name} is now in ${dept.name}. Their dashboard will fill up on the next page load.`,
      undo: { kind: 'restoreUserDepartment', userId: args.userId, departmentId: before },
      diff: { before: before ? `department ${before}` : 'no department', after: dept.name },
    };
  },
};

const rerunSlaScan: RemediationAction<Record<string, never>> = {
  name: 'rerun_sla_scan',
  description:
    'Re-run the deadline scan and regenerate breach notifications. Use when the nightly scan appears to have been missed.',
  argsHint: '(no arguments)',
  argsSchema: z.object({}).strict(),
  risk: 'low',
  allowedRoles: ['ADMIN', 'MANAGER'],
  auditAction: 'AUTOFIX_SLA_SCAN_RERUN',
  auditEntity: () => ({ entityType: 'SYSTEM', entityId: 'sla-scan' }),
  execute: async () => {
    // Imported lazily: the cron module starts timers at import time, and the
    // registry is loaded by the prompt builder on every chat request.
    const { scanSla } = await import('../../jobs/sla.cron');
    const result = await scanSla();
    return {
      summary: `Deadline scan finished — ${result.breached} breached and ${result.nearing} approaching.`,
      undo: { kind: 'none' },
    };
  },
};

const resendVerificationOtp: RemediationAction<{ email: string }> = {
  name: 'resend_verification_otp',
  description:
    'Send a fresh 6-digit verification code to a registrant who is stuck at pending verification, or whose code expired or locked.',
  argsHint: 'email',
  argsSchema: z.object({ email: z.string().email() }),
  risk: 'low',
  allowedRoles: ['ADMIN'],
  auditAction: 'AUTOFIX_OTP_RESENT',
  auditEntity: (a) => ({ entityType: 'User', entityId: a.email }),
  execute: async ({ args }) => {
    const { resendOtp } = await import('../../modules/auth/signup.service');
    await resendOtp(args.email);
    return {
      summary: `A new code is on its way to ${args.email}. It is valid for 10 minutes.`,
      undo: { kind: 'none' },
    };
  },
};

const recomputeUserBurnout: RemediationAction<{ departmentId?: string }> = {
  name: 'recompute_user_burnout',
  description:
    'Recalculate burnout scores for the current week when they are missing or showing an older week.',
  argsHint: 'departmentId (optional)',
  argsSchema: z.object({ departmentId: z.string().optional() }),
  risk: 'low',
  allowedRoles: ['ADMIN', 'MANAGER'],
  auditAction: 'AUTOFIX_BURNOUT_RECOMPUTED',
  auditEntity: (a) => ({ entityType: 'BurnoutScore', entityId: a.departmentId ?? 'all' }),
  scopeCheck: async ({ actor, args }) =>
    actor.role === 'ADMIN' ? true : sameDepartment(actor, args.departmentId ?? actor.departmentId),
  execute: async ({ args, actor }) => {
    const { recomputeBurnout } = await import('../../modules/burnout/burnout.service');
    const scope = actor.role === 'ADMIN' ? args.departmentId : (actor.departmentId ?? undefined);
    const result = await recomputeBurnout(scope);
    return {
      summary: `Recalculated burnout scores for ${result.scored} people for this week.`,
      undo: { kind: 'none' },
    };
  },
};

const recomputeSentimentForTask: RemediationAction<{ taskId: string }> = {
  name: 'recompute_sentiment_for_task',
  description:
    'Score any progress notes on a task that have no sentiment attached, usually because the analysis service was unavailable when they were written.',
  argsHint: 'taskId',
  argsSchema: z.object({ taskId: z.string().min(1) }),
  risk: 'low',
  allowedRoles: ['ADMIN', 'MANAGER'],
  auditAction: 'AUTOFIX_SENTIMENT_RECOMPUTED',
  auditEntity: (a) => ({ entityType: 'Task', entityId: a.taskId }),
  scopeCheck: async ({ actor, args, tx }) => {
    const task = await tx.task.findUnique({
      where: { id: args.taskId },
      select: { departmentId: true },
    });
    return sameDepartment(actor, task?.departmentId);
  },
  execute: async ({ args, tx }) => {
    const missing = await tx.taskUpdate.findMany({
      where: { taskId: args.taskId, sentiment: null },
      select: { id: true, note: true, authorId: true },
    });
    if (missing.length === 0) {
      return { summary: 'Every note on this task already has a sentiment score.', undo: { kind: 'none' } };
    }

    const { scoreSentimentBatch } = await import('../../ml/client');
    const scored = await scoreSentimentBatch(missing.map((m) => ({ id: m.id, text: m.note })));
    const byId = new Map(missing.map((m) => [m.id, m]));

    for (const item of scored.items) {
      const src = byId.get(item.id);
      if (!src) continue;
      await tx.sentimentRecord.create({
        data: {
          taskUpdateId: item.id,
          userId: src.authorId,
          score: item.score,
          label: item.label,
          modelVersion: scored.modelVersion,
        },
      });
    }
    return {
      summary: `Scored ${scored.items.length} note${scored.items.length === 1 ? '' : 's'} that had been missed. The morale figures will include them now.`,
      undo: { kind: 'none' },
    };
  },
};

const markNotificationReadBulk: RemediationAction<Record<string, never>> = {
  name: 'mark_notification_read_bulk',
  description: 'Clear a stuck unread-notification counter by marking the caller\'s notifications read.',
  argsHint: '(no arguments)',
  argsSchema: z.object({}).strict(),
  risk: 'low',
  allowedRoles: ['ADMIN', 'MANAGER', 'EMPLOYEE'],
  auditAction: 'AUTOFIX_NOTIFICATIONS_CLEARED',
  auditEntity: () => ({ entityType: 'Notification', entityId: 'bulk' }),
  execute: async ({ actor, tx }) => {
    const res = await tx.notification.updateMany({
      // Always the caller's own notifications — never a user id from the model.
      where: { userId: actor.sub, read: false },
      data: { read: true },
    });
    return {
      summary: `Marked ${res.count} notification${res.count === 1 ? '' : 's'} as read.`,
      undo: { kind: 'none' },
    };
  },
};

const refreshKbIndex: RemediationAction<Record<string, never>> = {
  name: 'refresh_kb_index',
  description: 'Rebuild the support knowledge-base search index.',
  argsHint: '(no arguments)',
  argsSchema: z.object({}).strict(),
  risk: 'low',
  allowedRoles: ['ADMIN'],
  auditAction: 'AUTOFIX_KB_REINDEXED',
  auditEntity: () => ({ entityType: 'SYSTEM', entityId: 'kb-index' }),
  execute: async () => {
    const { reindexKb } = await import('../kb.indexer');
    const res = await reindexKb();
    return { summary: `Reindexed ${res.chunks} knowledge-base sections.`, undo: { kind: 'none' } };
  },
};

/* --------------------------------------------------- medium risk (confirmed) */

const approvePendingUser: RemediationAction<{ userId: string }> = {
  name: 'approve_pending_user',
  description:
    'Approve a registrant who has verified their email and is waiting for an administrator. Use for USER_PENDING_APPROVAL.',
  argsHint: 'userId',
  argsSchema: z.object({ userId: z.string().min(1) }),
  risk: 'medium',
  allowedRoles: ['ADMIN'],
  auditAction: 'AUTOFIX_USER_APPROVED',
  auditEntity: (a) => ({ entityType: 'User', entityId: a.userId }),
  execute: async ({ args, actor, tx }) => {
    const user = await tx.user.findUnique({ where: { id: args.userId } });
    if (!user) throw new Error('That account no longer exists.');
    if (user.status !== 'PENDING_APPROVAL') {
      throw new Error(
        `That account is ${user.status.toLowerCase().replace(/_/g, ' ')}, not waiting for approval.`,
      );
    }
    const { approveUser } = await import('../../modules/auth/signup.service');
    await approveUser(args.userId, actor.sub);
    return {
      summary: `${user.name} is approved and can sign in now. They have been emailed.`,
      // Reversing an approval would mean disabling somebody's account from a
      // chat window. Undo an approval through the directory, deliberately.
      undo: { kind: 'none' },
      diff: { before: 'waiting for approval', after: 'active — can sign in' },
    };
  },
};

const reassignTask: RemediationAction<{ taskId: string; assigneeId: string }> = {
  name: 'reassign_task',
  description:
    'Move a task to a different person, for example when the current assignee has left or been disabled. Use for TASK_ASSIGNEE_INACTIVE.',
  argsHint: 'taskId, assigneeId',
  argsSchema: z.object({ taskId: z.string().min(1), assigneeId: z.string().min(1) }),
  risk: 'medium',
  allowedRoles: ['ADMIN', 'MANAGER'],
  auditAction: 'AUTOFIX_TASK_REASSIGNED',
  auditEntity: (a) => ({ entityType: 'Task', entityId: a.taskId }),
  scopeCheck: async ({ actor, args, tx }) => {
    const [task, assignee] = await Promise.all([
      tx.task.findUnique({ where: { id: args.taskId }, select: { departmentId: true } }),
      tx.user.findUnique({ where: { id: args.assigneeId }, select: { departmentId: true } }),
    ]);
    // Both ends must be inside the manager's department, or work could be
    // pushed across a boundary the manager cannot otherwise see.
    return (
      (await sameDepartment(actor, task?.departmentId)) &&
      (await sameDepartment(actor, assignee?.departmentId))
    );
  },
  execute: async ({ args, tx }) => {
    const [task, next] = await Promise.all([
      tx.task.findUnique({ where: { id: args.taskId }, include: { assignee: true } }),
      tx.user.findUnique({ where: { id: args.assigneeId } }),
    ]);
    if (!task) throw new Error('That task no longer exists.');
    if (!next) throw new Error('That person no longer exists.');
    if (!next.active) throw new Error(`${next.name}'s account is not active either.`);

    const before = task.assigneeId;
    await tx.task.update({ where: { id: args.taskId }, data: { assigneeId: args.assigneeId } });
    return {
      summary: `${task.refNo} is now assigned to ${next.name}.`,
      undo: { kind: 'restoreTaskAssignee', taskId: args.taskId, assigneeId: before },
      diff: { before: task.assignee.name, after: next.name },
    };
  },
};

const forceStatusTransition: RemediationAction<{
  taskId: string;
  status: z.infer<typeof statusEnum>;
}> = {
  name: 'force_status_transition',
  description:
    'Repair a task stuck in an impossible state by setting it to a valid one. Use for INVALID_STATUS_TRANSITION when a task cannot be moved normally.',
  argsHint: 'taskId, status',
  argsSchema: z.object({ taskId: z.string().min(1), status: statusEnum }),
  risk: 'medium',
  allowedRoles: ['ADMIN', 'MANAGER'],
  auditAction: 'AUTOFIX_STATUS_REPAIRED',
  auditEntity: (a) => ({ entityType: 'Task', entityId: a.taskId }),
  scopeCheck: async ({ actor, args, tx }) => {
    const task = await tx.task.findUnique({
      where: { id: args.taskId },
      select: { departmentId: true },
    });
    return sameDepartment(actor, task?.departmentId);
  },
  execute: async ({ args, tx }) => {
    const task = await tx.task.findUnique({ where: { id: args.taskId } });
    if (!task) throw new Error('That task no longer exists.');
    // Rewriting the history of finished work is not a repair.
    if (task.status === 'COMPLETED') {
      throw new Error(
        'This task is already completed. Completed work is not reopened from here — raise a new task instead.',
      );
    }
    const before = task.status;
    await tx.task.update({
      where: { id: args.taskId },
      data: {
        status: args.status,
        ...(args.status === 'IN_PROGRESS' && !task.startedAt ? { startedAt: new Date() } : {}),
      },
    });
    return {
      summary: `${task.refNo} moved from ${before.toLowerCase().replace(/_/g, ' ')} to ${args.status.toLowerCase().replace(/_/g, ' ')}. The original state is recorded in the audit trail.`,
      undo: { kind: 'restoreTaskStatus', taskId: args.taskId, status: before },
      diff: { before: before.replace(/_/g, ' '), after: args.status.replace(/_/g, ' ') },
    };
  },
};

const reopenFraudAlert: RemediationAction<{ alertId: string }> = {
  name: 'reopen_fraud_alert',
  description: 'Reopen a fraud alert that was dismissed by mistake.',
  argsHint: 'alertId',
  argsSchema: z.object({ alertId: z.string().min(1) }),
  risk: 'medium',
  allowedRoles: ['ADMIN'],
  auditAction: 'AUTOFIX_ALERT_REOPENED',
  auditEntity: (a) => ({ entityType: 'FraudAlert', entityId: a.alertId }),
  execute: async ({ args, tx }) => {
    const alert = await tx.fraudAlert.findUnique({ where: { id: args.alertId } });
    if (!alert) throw new Error('That alert no longer exists.');
    if (alert.status === 'OPEN') {
      return { summary: 'That alert is already open.', undo: { kind: 'none' } };
    }
    const before = alert.status;
    await tx.fraudAlert.update({
      where: { id: args.alertId },
      data: { status: 'OPEN', reviewedById: null, reviewNote: null },
    });
    return {
      summary: 'The alert is open again and back in the review queue.',
      undo: {
        kind: 'restoreAlertStatus',
        alertId: args.alertId,
        status: before,
        reviewNote: alert.reviewNote,
      },
      diff: { before: before.toLowerCase(), after: 'open' },
    };
  },
};

/* ----------------------------------------------------------------- registry */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ALL: RemediationAction<any>[] = [
  createMissingSlaPolicy,
  assignUserDepartment,
  rerunSlaScan,
  resendVerificationOtp,
  recomputeUserBurnout,
  recomputeSentimentForTask,
  markNotificationReadBulk,
  refreshKbIndex,
  approvePendingUser,
  reassignTask,
  forceStatusTransition,
  reopenFraudAlert,
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const REGISTRY: ReadonlyMap<string, RemediationAction<any>> = new Map(
  ALL.map((a) => [a.name, a]),
);

export const KNOWN_ACTIONS: ReadonlySet<string> = new Set(ALL.map((a) => a.name));

/** Actions a given role may have proposed to them — shapes the prompt. */
export function actionsForRole(role: Role): { name: string; description: string; args: string }[] {
  return ALL.filter((a) => a.allowedRoles.includes(role)).map((a) => ({
    name: a.name,
    description: a.description,
    args: a.argsHint,
  }));
}

/** Names an action a role is NOT allowed to run, for a helpful refusal. */
export function rolesAllowedFor(action: string): Role[] {
  return REGISTRY.get(action)?.allowedRoles ?? [];
}

export type { Prisma };
