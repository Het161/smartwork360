import type { Prisma } from '@prisma/client';
import type { AccessTokenPayload } from '../auth/jwt';
import { forbidden } from './errors';

/**
 * Sentinel department id that deliberately matches no row. Used where an
 * unassigned user must see an EMPTY result rather than an unfiltered one —
 * passing `undefined` to Prisma drops the filter and returns everything.
 */
export const NO_DEPARTMENT = '__no_department__';

/**
 * RBAC enforced in the QUERY, not just the UI.
 *
 * ADMIN    → everything
 * MANAGER  → their own department
 * EMPLOYEE → tasks they are assigned to or created
 *
 * Every list endpoint composes its filters with the relevant `*Scope` here, so a
 * hand-crafted request cannot read another department's data.
 */
export function taskScope(user: AccessTokenPayload): Prisma.TaskWhereInput {
  switch (user.role) {
    case 'ADMIN':
      return {};
    case 'MANAGER':
      // Fail closed. A manager with no department must match nothing —
      // `{ departmentId: null }` would otherwise be a filter that quietly
      // widens instead of narrowing.
      if (!user.departmentId) return { id: NO_DEPARTMENT };
      return { departmentId: user.departmentId };
    case 'EMPLOYEE':
      return { OR: [{ assigneeId: user.sub }, { creatorId: user.sub }] };
  }
}

export function userScope(user: AccessTokenPayload): Prisma.UserWhereInput {
  switch (user.role) {
    case 'ADMIN':
      return {};
    case 'MANAGER':
      if (!user.departmentId) return { id: NO_DEPARTMENT };
      return { departmentId: user.departmentId };
    case 'EMPLOYEE':
      return { id: user.sub };
  }
}

/**
 * Resolves which department an endpoint should report on and rejects
 * cross-department access for managers.
 */
export function resolveDepartmentId(
  user: AccessTokenPayload,
  requested?: string,
): string | undefined {
  if (user.role === 'ADMIN') return requested;
  if (requested && requested !== user.departmentId) {
    throw forbidden('You can only view your own department');
  }
  return user.departmentId ?? undefined;
}

/**
 * The caller's own department, or a clear error. Endpoints that report on
 * "my department" need a real id — returning undefined would read as "all
 * departments" to every downstream query.
 */
export function requireDepartmentId(user: AccessTokenPayload): string {
  if (!user.departmentId) {
    throw forbidden(
      'Your account is not assigned to a department yet. Ask an administrator to assign one.',
    );
  }
  return user.departmentId;
}

/** Guards single-record reads once the record's owning department is known. */
export function assertCanAccessDepartment(
  user: AccessTokenPayload,
  departmentId: string | null,
) {
  if (user.role === 'ADMIN') return;
  // A record with no department belongs to nobody's department, so a manager
  // cannot reach it — only an admin can. Comparing null === null would have
  // handed it to any manager who also happens to be unassigned.
  if (!departmentId || user.departmentId !== departmentId) {
    throw forbidden('That record belongs to another department');
  }
}

/** Employees may only act on their own tasks. */
export function assertCanAccessTask(
  user: AccessTokenPayload,
  task: { departmentId: string; assigneeId: string; creatorId: string },
) {
  if (user.role === 'ADMIN') return;
  if (user.role === 'MANAGER') {
    assertCanAccessDepartment(user, task.departmentId);
    return;
  }
  if (task.assigneeId !== user.sub && task.creatorId !== user.sub) {
    throw forbidden('This task is not assigned to you');
  }
}
