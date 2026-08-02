import { Router } from 'express';
import {
  createUserSchema,
  listUsersQuerySchema,
  updateUserSchema,
  type CreateUserInput,
  type UpdateUserInput,
} from '@smartwork/shared';
import type { Prisma } from '@prisma/client';
import type { z } from 'zod';
import { prisma } from '../../db/prisma';
import { appendEvent } from '../../audit/audit.service';
import { diffFields, hasChanges } from '../../audit/diff';
import { hashPassword } from '../../auth/password';
import { asyncHandler, badRequest, forbidden, notFound } from '../../middleware/errors';
import { currentUser, requireAuth, requireRole } from '../../middleware/auth';
import { body, query, validateBody, validateQuery } from '../../middleware/validate';
import { assertCanAccessDepartment, userScope } from '../../middleware/scope';
import { computeUserPerformance } from '../analytics/analytics.service';
import { approveUser } from '../auth/signup.service';
import { toUserDTO, userInclude } from './user.mapper';

export const userRouter = Router();
userRouter.use(requireAuth);

type ListQuery = z.infer<typeof listUsersQuerySchema>;

/**
 * @openapi
 * /users:
 *   get:
 *     tags: [Users]
 *     summary: Directory, scoped by role
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: departmentId, schema: { type: string } }
 *       - { in: query, name: role, schema: { type: string, enum: [ADMIN, MANAGER, EMPLOYEE] } }
 *       - { in: query, name: q, schema: { type: string }, description: Search name, email or designation }
 *       - { in: query, name: includeInactive, schema: { type: boolean, default: false } }
 *     responses:
 *       200: { description: Matching users }
 */
userRouter.get(
  '/',
  validateQuery(listUsersQuerySchema),
  asyncHandler(async (req, res) => {
    const me = currentUser(req);
    const q = query<ListQuery>(req);

    const where: Prisma.UserWhereInput = {
      AND: [
        userScope(me),
        q.departmentId ? { departmentId: q.departmentId } : {},
        q.role ? { role: q.role } : {},
        q.includeInactive ? {} : { active: true },
        q.q
          ? {
              OR: [
                { name: { contains: q.q, mode: 'insensitive' } },
                { email: { contains: q.q, mode: 'insensitive' } },
                { designation: { contains: q.q, mode: 'insensitive' } },
              ],
            }
          : {},
      ],
    };

    const users = await prisma.user.findMany({
      where,
      include: userInclude,
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
    });
    res.json({ items: users.map(toUserDTO), total: users.length });
  }),
);

/**
 * @openapi
 * /users:
 *   post:
 *     tags: [Users]
 *     summary: Create a user (audited)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, role, designation, departmentId]
 *             properties:
 *               name: { type: string, example: "Anita Rao" }
 *               email: { type: string, example: "anita.rao@gov.in" }
 *               password: { type: string, default: "Demo@123" }
 *               role: { type: string, enum: [ADMIN, MANAGER, EMPLOYEE] }
 *               designation: { type: string, example: "Section Officer" }
 *               departmentId: { type: string }
 *     responses:
 *       201: { description: Created }
 *       409: { description: Email already in use }
 */
userRouter.post(
  '/',
  requireRole('ADMIN'),
  validateBody(createUserSchema),
  asyncHandler(async (req, res) => {
    const input = body<CreateUserInput>(req);
    const me = currentUser(req);

    const dept = await prisma.department.findUnique({ where: { id: input.departmentId } });
    if (!dept) throw badRequest('Department not found');

    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          name: input.name,
          email: input.email.toLowerCase(),
          passwordHash: hashPassword(input.password),
          role: input.role,
          designation: input.designation,
          departmentId: input.departmentId,
          avatarSeed: input.name.toLowerCase().replace(/[^a-z]+/g, '-'),
        },
        include: userInclude,
      });
      await appendEvent(
        {
          entityType: 'USER',
          entityId: created.id,
          action: 'USER_CREATED',
          actorId: me.sub,
          payload: {
            name: created.name,
            email: created.email,
            role: created.role,
            designation: created.designation,
          },
        },
        tx,
      );
      return created;
    });

    res.status(201).json(toUserDTO(user));
  }),
);

/**
 * @openapi
 * /users/{id}:
 *   get:
 *     tags: [Users]
 *     summary: One user
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: The user }
 *       404: { description: Not found }
 */
userRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const me = currentUser(req);
    const user = await prisma.user.findUnique({ where: { id: req.params.id }, include: userInclude });
    if (!user) throw notFound('User not found');
    if (me.role === 'EMPLOYEE' && user.id !== me.sub) {
      throw forbidden('You can only view your own profile');
    }
    if (me.role === 'MANAGER') assertCanAccessDepartment(me, user.departmentId);
    res.json(toUserDTO(user));
  }),
);

/**
 * @openapi
 * /users/{id}:
 *   patch:
 *     tags: [Users]
 *     summary: Update role, designation, department or active flag (audited)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: Updated user }
 */
userRouter.patch(
  '/:id',
  requireRole('ADMIN'),
  validateBody(updateUserSchema),
  asyncHandler(async (req, res) => {
    const input = body<UpdateUserInput>(req);
    const me = currentUser(req);

    const existing = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!existing) throw notFound('User not found');
    if (existing.id === me.sub && input.active === false) {
      throw badRequest('You cannot deactivate your own account');
    }

    const changes = diffFields(existing, input, [
      'name',
      'email',
      'role',
      'designation',
      'departmentId',
      'active',
    ]);

    const user = await prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: req.params.id },
        data: {
          name: input.name,
          email: input.email?.toLowerCase(),
          role: input.role,
          designation: input.designation,
          departmentId: input.departmentId,
          active: input.active,
        },
        include: userInclude,
      });
      if (hasChanges(changes)) {
        await appendEvent(
          {
            entityType: 'USER',
            entityId: updated.id,
            action: 'USER_UPDATED',
            actorId: me.sub,
            payload: { name: updated.name, changes },
          },
          tx,
        );
      }
      return updated;
    });

    res.json(toUserDTO(user));
  }),
);

/**
 * @openapi
 * /users/{id}/performance:
 *   get:
 *     tags: [Users]
 *     summary: On-time %, throughput, cycle-time trend, sentiment trend and badges
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: Performance profile }
 *       403: { description: Employees may only read their own performance }
 */
userRouter.get(
  '/:id/performance',
  asyncHandler(async (req, res) => {
    const me = currentUser(req);
    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) throw notFound('User not found');

    if (me.role === 'EMPLOYEE' && target.id !== me.sub) {
      throw forbidden('You can only view your own performance');
    }
    if (me.role === 'MANAGER') assertCanAccessDepartment(me, target.departmentId);

    res.json(await computeUserPerformance(target.id));
  }),
);

/**
 * @openapi
 * /users/{id}/approve:
 *   patch:
 *     tags: [Users]
 *     summary: Approve a self-registered employee (audited, sends a welcome email)
 *     description: >
 *       Moves a PENDING_APPROVAL account to ACTIVE, writes a USER_APPROVED block to
 *       the audit chain, notifies the user in-app and emails them. Rejected if the
 *       user has not verified their email yet.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: The activated user }
 *       400: { description: Already active, or email not yet verified }
 *       404: { description: Not found }
 */
userRouter.patch(
  '/:id/approve',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const me = currentUser(req);
    const { user, previewUrl } = await approveUser(req.params.id, me.sub);
    const full = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      include: userInclude,
    });
    res.json({ user: toUserDTO(full), previewUrl });
  }),
);

/**
 * @openapi
 * /users/pending/list:
 *   get:
 *     tags: [Users]
 *     summary: Registrations awaiting administrator approval
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Users in PENDING_APPROVAL or PENDING_VERIFICATION }
 */
userRouter.get(
  '/pending/list',
  requireRole('ADMIN'),
  asyncHandler(async (_req, res) => {
    const users = await prisma.user.findMany({
      where: { status: { in: ['PENDING_APPROVAL', 'PENDING_VERIFICATION'] } },
      include: userInclude,
      orderBy: { createdAt: 'desc' },
    });
    res.json({ items: users.map(toUserDTO), total: users.length });
  }),
);
