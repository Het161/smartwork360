/**
 * Applies a proposed fix: validate → authorize → execute → audit → undo token.
 *
 * The ordering is the security property. Nothing from the model is trusted at
 * this point: the action name is looked up in the registry, the arguments are
 * re-parsed against that action's own schema, and the caller's role and
 * department are re-checked from their JWT — not from the conversation, which
 * an attacker could have influenced.
 *
 * The change and its audit event share ONE transaction, so a fix that is
 * applied is always recorded and a fix that is recorded always happened.
 */
import { prisma } from '../../db/prisma';
import { logger } from '../../config/logger';
import { supportConfig } from '../../config/env';
import { badRequest, forbidden, notFound } from '../../middleware/errors';
import { appendEvent } from '../../audit/audit.service';
import type { AccessTokenPayload } from '../../auth/jwt';
import { REGISTRY, type PrismaTx, type UndoSpec } from './registry';

export interface ApplyResult {
  fixId: string;
  status: 'APPLIED';
  summary: string;
  undoable: boolean;
  undoExpiresAt: string | null;
  auditChainIndex: number;
}

/** Fixes applied by this user in the last hour. */
async function recentFixCount(userId: string): Promise<number> {
  return prisma.supportFix.count({
    where: {
      actorId: userId,
      status: 'APPLIED',
      appliedAt: { gte: new Date(Date.now() - 3600_000) },
    },
  });
}

export async function applyFix(opts: {
  fixId: string;
  actor: AccessTokenPayload;
  reason?: string;
}): Promise<ApplyResult> {
  const { actor } = opts;

  if (!supportConfig.autofixEnabled) {
    throw forbidden('Automatic fixes are switched off on this deployment.');
  }

  const fix = await prisma.supportFix.findFirst({
    // Scoped to the caller: a fix id belonging to somebody else is not found,
    // rather than found-and-refused.
    where: { id: opts.fixId, actorId: actor.sub },
  });
  if (!fix) throw notFound('That suggested fix was not found.');
  if (fix.status !== 'PROPOSED') {
    throw badRequest(`That fix was already ${fix.status.toLowerCase()}.`);
  }

  const action = REGISTRY.get(fix.action);
  // A stored action name that no longer exists in the registry is refused
  // rather than approximated.
  if (!action) throw badRequest('That fix is no longer available in this version.');

  // ---- authorize, from the JWT rather than the conversation ------------
  if (!action.allowedRoles.includes(actor.role)) {
    const who = action.allowedRoles.join(' or ').toLowerCase();
    throw forbidden(`Only ${who === 'admin' ? 'an administrator' : `a ${who}`} can do that.`);
  }

  if (action.risk === 'medium' && !opts.reason?.trim()) {
    throw badRequest('Please give a short reason — it is stored with the change.');
  }

  const used = await recentFixCount(actor.sub);
  if (used >= supportConfig.maxFixesPerHour) {
    throw badRequest(
      `You have applied ${used} automatic fixes in the last hour, which is the limit. Please wait, or make the change directly.`,
    );
  }

  // ---- re-validate the arguments --------------------------------------
  const parsed = action.argsSchema.safeParse(fix.args);
  if (!parsed.success) {
    await prisma.supportFix.update({
      where: { id: fix.id },
      data: { status: 'FAILED', result: 'The suggested settings were not valid.' },
    });
    throw badRequest('The suggested settings were not valid, so nothing was changed.');
  }
  const args = parsed.data;

  // ---- execute + audit, in one transaction -----------------------------
  try {
    const outcome = await prisma.$transaction(async (tx) => {
      if (action.scopeCheck) {
        const allowed = await action.scopeCheck({ actor, args, tx: tx as PrismaTx });
        if (!allowed) {
          throw forbidden('That record is outside the part of the organisation you manage.');
        }
      }

      const result = await action.execute({ actor, args, tx: tx as PrismaTx });

      const { entityType, entityId } = action.auditEntity(args);
      const event = await appendEvent(
        {
          entityType,
          entityId,
          action: 'AUTOFIX_APPLIED',
          actorId: actor.sub,
          payload: {
            action: action.name,
            specificAction: action.auditAction,
            args: args as object,
            risk: action.risk,
            conversationId: fix.conversationId,
            reason: opts.reason ?? null,
            summary: result.summary,
            // Records that a model proposed this, so the ledger distinguishes
            // an assisted change from one a person made unaided.
            modelProposed: true,
          },
        },
        tx as Parameters<typeof appendEvent>[1],
      );

      const undoable = result.undo.kind !== 'none';
      const undoExpiresAt = undoable
        ? new Date(Date.now() + supportConfig.undoWindowMin * 60_000)
        : null;

      await tx.supportFix.update({
        where: { id: fix.id },
        data: {
          status: 'APPLIED',
          appliedAt: new Date(),
          result: result.summary,
          reason: opts.reason ?? null,
          undoSpec: undoable ? (result.undo as object) : undefined,
          undoExpiresAt,
        },
      });

      return { result, event, undoable, undoExpiresAt };
    });

    logger.info(
      { fixId: fix.id, action: action.name, actorId: actor.sub, chainIndex: outcome.event.chainIndex },
      'saarthi support: fix applied',
    );

    return {
      fixId: fix.id,
      status: 'APPLIED',
      summary: outcome.result.summary,
      undoable: outcome.undoable,
      undoExpiresAt: outcome.undoExpiresAt?.toISOString() ?? null,
      auditChainIndex: outcome.event.chainIndex,
    };
  } catch (err) {
    // The transaction rolled back, so there are no partial writes. Record the
    // failure and return something a person can act on.
    const message = err instanceof Error ? err.message : 'The fix could not be applied.';
    await prisma.supportFix
      .update({ where: { id: fix.id }, data: { status: 'FAILED', result: message } })
      .catch(() => undefined);
    logger.warn({ err, fixId: fix.id, action: action.name }, 'saarthi support: fix failed');
    throw err;
  }
}

/** Reverses an applied fix inside its window. The undo is itself audited. */
export async function undoFix(opts: {
  fixId: string;
  actor: AccessTokenPayload;
}): Promise<{ summary: string; auditChainIndex: number }> {
  const fix = await prisma.supportFix.findFirst({
    where: { id: opts.fixId, actorId: opts.actor.sub },
  });
  if (!fix) throw notFound('That fix was not found.');
  if (fix.status !== 'APPLIED') throw badRequest(`That fix is ${fix.status.toLowerCase()}.`);
  if (!fix.undoSpec) throw badRequest('That change cannot be undone from here.');
  if (fix.undoExpiresAt && fix.undoExpiresAt.getTime() < Date.now()) {
    throw badRequest(
      `The ${supportConfig.undoWindowMin}-minute undo window has passed. Reverse it from the relevant screen instead.`,
    );
  }

  const spec = fix.undoSpec as UndoSpec;

  const outcome = await prisma.$transaction(async (tx) => {
    let summary = 'Change reversed.';

    switch (spec.kind) {
      case 'deleteSlaPolicy':
        await tx.sLAPolicy.deleteMany({ where: { id: spec.id } });
        summary = 'Removed the SLA rule that was added.';
        break;
      case 'restoreUserDepartment':
        await tx.user.update({
          where: { id: spec.userId },
          data: { departmentId: spec.departmentId },
        });
        summary = 'Put the account back to its previous department.';
        break;
      case 'restoreTaskStatus':
        await tx.task.update({
          where: { id: spec.taskId },
          data: { status: spec.status as never },
        });
        summary = 'Put the task back to its previous status.';
        break;
      case 'restoreTaskAssignee':
        await tx.task.update({
          where: { id: spec.taskId },
          data: { assigneeId: spec.assigneeId },
        });
        summary = 'Put the task back with its previous assignee.';
        break;
      case 'restoreAlertStatus':
        await tx.fraudAlert.update({
          where: { id: spec.alertId },
          data: { status: spec.status as never, reviewNote: spec.reviewNote },
        });
        summary = 'Put the alert back to how it was.';
        break;
      default:
        throw badRequest('That change cannot be undone from here.');
    }

    // The undo is a change like any other, so it gets its own block. The
    // ledger never loses the fact that the fix happened first.
    const event = await appendEvent(
      {
        entityType: 'SupportFix',
        entityId: fix.id,
        action: 'AUTOFIX_UNDONE',
        actorId: opts.actor.sub,
        payload: { action: fix.action, undo: spec as object, summary },
      },
      tx as Parameters<typeof appendEvent>[1],
    );

    await tx.supportFix.update({
      where: { id: fix.id },
      data: { status: 'UNDONE', undoneAt: new Date() },
    });

    return { summary, event };
  });

  logger.info({ fixId: fix.id, actorId: opts.actor.sub }, 'saarthi support: fix undone');
  return { summary: outcome.summary, auditChainIndex: outcome.event.chainIndex };
}
