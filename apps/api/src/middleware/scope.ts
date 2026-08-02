import type { Prisma } from '@prisma/client';
import type { AccessTokenPayload } from '../auth/jwt';
import { forbidden } from './errors';

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
  return user.departmentId;
}

/** Guards single-record reads once the record's owning department is known. */
export function assertCanAccessDepartment(user: AccessTokenPayload, departmentId: string) {
  if (user.role === 'ADMIN') return;
  if (user.departmentId !== departmentId) {
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
