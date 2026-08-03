import { Router } from 'express';
import { analyticsScopeSchema } from '@smartwork/shared';
import type { Prisma } from '@prisma/client';
import type { z } from 'zod';
import { asyncHandler, forbidden } from '../../middleware/errors';
import { currentUser, requireAuth } from '../../middleware/auth';
import { query, validateQuery } from '../../middleware/validate';
import { resolveDepartmentId, taskScope, requireDepartmentId } from '../../middleware/scope';
import { computeKpis, computeSla, computeTrends, computeWorkload } from './analytics.service';

export const analyticsRouter = Router();
analyticsRouter.use(requireAuth);

type ScopeQuery = z.infer<typeof analyticsScopeSchema>;

/**
 * Translates a requested scope into a Prisma filter, rejecting scopes the caller's
 * role is not entitled to. `taskScope` is always intersected, so even `scope=org`
 * cannot widen an employee's visibility.
 */
function whereForScope(
  me: ReturnType<typeof currentUser>,
  q: ScopeQuery,
): { where: Prisma.TaskWhereInput; scope: 'org' | 'dept' | 'me' } {
  if (q.scope === 'org') {
    if (me.role !== 'ADMIN') throw forbidden('Organisation-wide analytics require the ADMIN role');
    return { where: {}, scope: 'org' };
  }
  if (q.scope === 'dept') {
    if (me.role === 'EMPLOYEE') throw forbidden('Department analytics require a MANAGER role');
    // resolveDepartmentId still rejects a cross-department request; the manager
    // branch then insists on a real id, because an undefined departmentId drops
    // the filter entirely and would show them every department.
    const resolved = resolveDepartmentId(me, q.departmentId);
    const departmentId =
      me.role === 'MANAGER' ? requireDepartmentId(me) : (resolved ?? me.departmentId ?? undefined);
    return { where: { departmentId }, scope: 'dept' };
  }
  return { where: { assigneeId: me.sub }, scope: 'me' };
}

/**
 * @openapi
 * /analytics/kpis:
 *   get:
 *     tags: [Analytics]
 *     summary: Headline KPIs for the requested scope
 *     description: >
 *       Includes `cycleTimeImprovementPct` — the measured change in mean cycle time
 *       between the older and more recent halves of the completed set. This is the
 *       number behind the "30–40% faster workflow execution" claim; it is computed,
 *       not asserted.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: scope, schema: { type: string, enum: [org, dept, me], default: me } }
 *       - { in: query, name: departmentId, schema: { type: string } }
 *     responses:
 *       200: { description: KPI summary }
 *       403: { description: Scope not permitted for your role }
 */
analyticsRouter.get(
  '/kpis',
  validateQuery(analyticsScopeSchema),
  asyncHandler(async (req, res) => {
    const me = currentUser(req);
    const { where, scope } = whereForScope(me, query<ScopeQuery>(req));
    res.json(await computeKpis({ AND: [taskScope(me), where] }, scope));
  }),
);

/**
 * @openapi
 * /analytics/sla:
 *   get:
 *     tags: [Analytics]
 *     summary: SLA compliance, breaches by priority and department, and a weekly heatmap
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: scope, schema: { type: string, enum: [org, dept, me], default: me } }
 *       - { in: query, name: departmentId, schema: { type: string } }
 *     responses:
 *       200: { description: SLA analytics }
 */
analyticsRouter.get(
  '/sla',
  validateQuery(analyticsScopeSchema),
  asyncHandler(async (req, res) => {
    const me = currentUser(req);
    const { where } = whereForScope(me, query<ScopeQuery>(req));
    res.json(await computeSla({ AND: [taskScope(me), where] }));
  }),
);

/**
 * @openapi
 * /analytics/trends:
 *   get:
 *     tags: [Analytics]
 *     summary: Weekly throughput, mean cycle time and breach count (last 12 weeks)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: scope, schema: { type: string, enum: [org, dept, me], default: me } }
 *       - { in: query, name: departmentId, schema: { type: string } }
 *     responses:
 *       200: { description: Trend series }
 */
analyticsRouter.get(
  '/trends',
  validateQuery(analyticsScopeSchema),
  asyncHandler(async (req, res) => {
    const me = currentUser(req);
    const { where } = whereForScope(me, query<ScopeQuery>(req));
    res.json({ items: await computeTrends({ AND: [taskScope(me), where] }) });
  }),
);

/**
 * @openapi
 * /analytics/workload:
 *   get:
 *     tags: [Analytics]
 *     summary: Per-member active load with a LIGHT/BALANCED/HEAVY/OVERLOADED band
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: departmentId, schema: { type: string } }
 *     responses:
 *       200: { description: Workload per team member }
 *       403: { description: Employees cannot view team workload }
 */
analyticsRouter.get(
  '/workload',
  asyncHandler(async (req, res) => {
    const me = currentUser(req);
    if (me.role === 'EMPLOYEE') throw forbidden('Team workload is visible to managers only');
    const departmentId = resolveDepartmentId(me, req.query.departmentId as string | undefined);
    res.json({ items: await computeWorkload(departmentId) });
  }),
);
