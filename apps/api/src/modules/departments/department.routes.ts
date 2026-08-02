import { Router } from 'express';
import {
  createDepartmentSchema,
  slaPolicySchema,
  updateDepartmentSchema,
  type CreateDepartmentInput,
  type SlaPolicyInput,
} from '@smartwork/shared';
import { prisma } from '../../db/prisma';
import { appendEvent } from '../../audit/audit.service';
import { diffFields, hasChanges } from '../../audit/diff';
import { asyncHandler, notFound } from '../../middleware/errors';
import { currentUser, requireAuth, requireRole } from '../../middleware/auth';
import { body, validateBody } from '../../middleware/validate';

export const departmentRouter = Router();
departmentRouter.use(requireAuth);

/**
 * @openapi
 * /departments:
 *   get:
 *     tags: [Departments]
 *     summary: All departments with headcount
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Departments }
 */
departmentRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const departments = await prisma.department.findMany({
      orderBy: { code: 'asc' },
      include: { _count: { select: { users: true } } },
    });
    res.json({
      items: departments.map((d) => ({
        id: d.id,
        code: d.code,
        name: d.name,
        nameHi: d.nameHi,
        userCount: d._count.users,
      })),
      total: departments.length,
    });
  }),
);

/**
 * @openapi
 * /departments:
 *   post:
 *     tags: [Departments]
 *     summary: Create a department (audited)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [code, name, nameHi]
 *             properties:
 *               code: { type: string, example: "AGR" }
 *               name: { type: string, example: "Agriculture" }
 *               nameHi: { type: string, example: "कृषि" }
 *     responses:
 *       201: { description: Created }
 *       409: { description: Code already exists }
 */
departmentRouter.post(
  '/',
  requireRole('ADMIN'),
  validateBody(createDepartmentSchema),
  asyncHandler(async (req, res) => {
    const input = body<CreateDepartmentInput>(req);
    const me = currentUser(req);

    const dept = await prisma.$transaction(async (tx) => {
      const created = await tx.department.create({ data: input });
      await appendEvent(
        {
          entityType: 'DEPARTMENT',
          entityId: created.id,
          action: 'DEPARTMENT_CREATED',
          actorId: me.sub,
          payload: { code: created.code, name: created.name },
        },
        tx,
      );
      return created;
    });

    res.status(201).json(dept);
  }),
);

/**
 * @openapi
 * /departments/{id}:
 *   patch:
 *     tags: [Departments]
 *     summary: Rename a department (audited)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: Updated department }
 */
departmentRouter.patch(
  '/:id',
  requireRole('ADMIN'),
  validateBody(updateDepartmentSchema),
  asyncHandler(async (req, res) => {
    const me = currentUser(req);
    const existing = await prisma.department.findUnique({ where: { id: req.params.id } });
    if (!existing) throw notFound('Department not found');

    const input = req.body as Partial<CreateDepartmentInput>;
    const changes = diffFields(existing, input, ['code', 'name', 'nameHi']);

    const dept = await prisma.$transaction(async (tx) => {
      const updated = await tx.department.update({ where: { id: req.params.id }, data: input });
      if (hasChanges(changes)) {
        await appendEvent(
          {
            entityType: 'DEPARTMENT',
            entityId: updated.id,
            action: 'DEPARTMENT_UPDATED',
            actorId: me.sub,
            payload: { code: updated.code, changes },
          },
          tx,
        );
      }
      return updated;
    });

    res.json(dept);
  }),
);

/**
 * @openapi
 * /departments/{id}/sla:
 *   get:
 *     tags: [Departments]
 *     summary: SLA policy rows for a department
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: SLA policies }
 */
departmentRouter.get(
  '/:id/sla',
  asyncHandler(async (req, res) => {
    const items = await prisma.sLAPolicy.findMany({
      where: { departmentId: req.params.id },
      orderBy: { priority: 'asc' },
    });
    res.json({ items, total: items.length });
  }),
);

/**
 * @openapi
 * /departments/{id}/sla:
 *   put:
 *     tags: [Departments]
 *     summary: Set the SLA hours for one department+priority (audited)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [departmentId, priority, hours]
 *             properties:
 *               departmentId: { type: string }
 *               priority: { type: string, enum: [LOW, MEDIUM, HIGH, CRITICAL] }
 *               hours: { type: integer, example: 48 }
 *     responses:
 *       200: { description: Saved policy }
 */
departmentRouter.put(
  '/:id/sla',
  requireRole('ADMIN'),
  validateBody(slaPolicySchema),
  asyncHandler(async (req, res) => {
    const input = body<SlaPolicyInput>(req);
    const me = currentUser(req);

    const existing = await prisma.sLAPolicy.findUnique({
      where: { departmentId_priority: { departmentId: req.params.id, priority: input.priority } },
    });

    const policy = await prisma.$transaction(async (tx) => {
      const saved = await tx.sLAPolicy.upsert({
        where: { departmentId_priority: { departmentId: req.params.id, priority: input.priority } },
        create: { departmentId: req.params.id, priority: input.priority, hours: input.hours },
        update: { hours: input.hours },
      });
      await appendEvent(
        {
          entityType: 'SLA_POLICY',
          entityId: saved.id,
          action: 'SLA_POLICY_UPDATED',
          actorId: me.sub,
          payload: {
            departmentId: req.params.id,
            priority: input.priority,
            from: existing?.hours ?? null,
            to: input.hours,
          },
        },
        tx,
      );
      return saved;
    });

    res.json(policy);
  }),
);
