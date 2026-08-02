import type { Prisma } from '@prisma/client';
import type { UserDTO } from '@smartwork/shared';

export const userInclude = {
  department: { select: { id: true, code: true, name: true, nameHi: true } },
} satisfies Prisma.UserInclude;

type UserWithDept = Prisma.UserGetPayload<{ include: typeof userInclude }>;

export function toUserDTO(user: UserWithDept): UserDTO {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    designation: user.designation,
    departmentId: user.departmentId,
    department: user.department,
    avatarSeed: user.avatarSeed,
    active: user.active,
    createdAt: user.createdAt.toISOString(),
  };
}

/** Compact shape embedded in task/alert payloads. */
export const userBriefSelect = {
  id: true,
  name: true,
  avatarSeed: true,
  designation: true,
} satisfies Prisma.UserSelect;
