import { Router } from 'express';
import { prisma } from '../../db/prisma';
import { asyncHandler, forbidden, notFound } from '../../middleware/errors';
import { currentUser, requireAuth, requireRole } from '../../middleware/auth';
import { assertCanAccessDepartment, resolveDepartmentId } from '../../middleware/scope';
import { readBurnout, recomputeBurnout } from './burnout.service';

export const burnoutRouter = Router();
burnoutRouter.use(requireAuth);

/**
 * @openapi
 * /burnout/team/{deptId}:
 *   get:
 *     tags: [Burnout]
 *     summary: Burnout risk for every member of a department, highest first
 *     description: >
 *       Each row carries the five raw factors, the top two contributors, and a
 *       plain-language suggested action ("Redistribute 3 tasks", "Check in 1:1").
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: deptId, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: Burnout scores }
 *       403: { description: Other departments are out of scope }
 */
burnoutRouter.get(
  '/team/:deptId',
  requireRole('ADMIN', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const me = currentUser(req);
    const departmentId = resolveDepartmentId(me, req.params.deptId) ?? me.departmentId;
    res.json({ items: await readBurnout(departmentId) });
  }),
);

/**
 * @openapi
 * /burnout/user/{id}:
 *   get:
 *     tags: [Burnout]
 *     summary: Burnout score for one employee
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: Burnout score }
 *       404: { description: No score recorded for this week }
 */
burnoutRouter.get(
  '/user/:id',
  asyncHandler(async (req, res) => {
    const me = currentUser(req);
    if (me.role === 'EMPLOYEE' && req.params.id !== me.sub) {
      throw forbidden('You can only view your own wellbeing score');
    }

    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) throw notFound('User not found');
    if (me.role === 'MANAGER') assertCanAccessDepartment(me, target.departmentId);

    const [item] = await readBurnout(undefined, req.params.id);
    if (!item) throw notFound('No burnout score recorded for this week yet');
    res.json(item);
  }),
);

/**
 * @openapi
 * /burnout/recompute:
 *   post:
 *     tags: [Burnout]
 *     summary: Re-extract features and re-score burnout for a department
 *     description: >
 *       Feature extraction happens in the API; the ML service only scores. Falls
 *       back to the identical weighted-rules model if the service is unreachable.
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               departmentId: { type: string }
 *     responses:
 *       200: { description: Count scored and the mode used }
 */
burnoutRouter.post(
  '/recompute',
  requireRole('ADMIN', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const me = currentUser(req);
    const departmentId =
      me.role === 'ADMIN' ? (req.body?.departmentId as string | undefined) : me.departmentId;
    const result = await recomputeBurnout(departmentId);
    res.json({ scored: result.scored, mode: result.mode });
  }),
);
