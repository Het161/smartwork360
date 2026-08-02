import { Router } from 'express';
import {
  bulkAssignSchema,
  createTaskSchema,
  listTasksQuerySchema,
  reviewDecisionSchema,
  taskStatusSchema,
  taskUpdateSchema,
  PRIORITY_ORDER,
  type BulkAssignInput,
  type CreateTaskInput,
  type ListTasksQuery,
  type Paginated,
  type ReviewDecisionInput,
  type TaskDTO,
  type TaskStatusInput,
  type TaskUpdateInput,
  type UpdateTaskInput,
} from '@smartwork/shared';
import { updateTaskSchema } from '@smartwork/shared';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../db/prisma';
import { asyncHandler, notFound } from '../../middleware/errors';
import { currentUser, requireAuth, requireRole } from '../../middleware/auth';
import { body, query, validateBody, validateQuery } from '../../middleware/validate';
import { assertCanAccessTask, taskScope } from '../../middleware/scope';
import { taskInclude, toTaskDTO, toTaskDetailDTO } from './task.mapper';
import {
  addTaskUpdate,
  bulkAssign,
  changeStatus,
  createTask,
  getTaskDetail,
  reviewTask,
  updateTask,
} from './task.service';

export const taskRouter = Router();
taskRouter.use(requireAuth);

/**
 * @openapi
 * /tasks:
 *   get:
 *     tags: [Tasks]
 *     summary: List tasks (scoped by role, filtered, paginated)
 *     description: >
 *       Admins see every task, managers see their department, employees see only
 *       tasks they are assigned to or created. Scoping is applied in the database
 *       query, not the UI.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: status, schema: { type: string, enum: [PENDING, IN_PROGRESS, UNDER_REVIEW, COMPLETED] } }
 *       - { in: query, name: priority, schema: { type: string, enum: [LOW, MEDIUM, HIGH, CRITICAL] } }
 *       - { in: query, name: assigneeId, schema: { type: string } }
 *       - { in: query, name: departmentId, schema: { type: string } }
 *       - { in: query, name: overdue, schema: { type: boolean } }
 *       - { in: query, name: open, schema: { type: boolean }, description: Exclude completed tasks }
 *       - { in: query, name: q, schema: { type: string }, description: Search reference number or title }
 *       - { in: query, name: page, schema: { type: integer, default: 1 } }
 *       - { in: query, name: pageSize, schema: { type: integer, default: 20 } }
 *       - { in: query, name: sort, schema: { type: string, enum: [dueDate, createdAt, priority], default: dueDate } }
 *       - { in: query, name: order, schema: { type: string, enum: [asc, desc], default: asc } }
 *     responses:
 *       200: { description: Paginated tasks }
 */
taskRouter.get(
  '/',
  validateQuery(listTasksQuerySchema),
  asyncHandler(async (req, res) => {
    const me = currentUser(req);
    const q = query<ListTasksQuery>(req);
    const now = new Date();

    const where: Prisma.TaskWhereInput = {
      AND: [
        taskScope(me),
        q.status ? { status: q.status } : {},
        q.priority ? { priority: q.priority } : {},
        q.assigneeId ? { assigneeId: q.assigneeId } : {},
        q.departmentId ? { departmentId: q.departmentId } : {},
        q.overdue ? { dueDate: { lt: now }, status: { not: 'COMPLETED' } } : {},
        q.open ? { status: { not: 'COMPLETED' } } : {},
        q.q
          ? {
              OR: [
                { refNo: { contains: q.q, mode: 'insensitive' } },
                { title: { contains: q.q, mode: 'insensitive' } },
              ],
            }
          : {},
      ],
    };

    // Priority is an enum, so DB ordering would be alphabetical (CRITICAL, HIGH,
    // LOW, MEDIUM). Sort that case in memory using the shared severity order.
    const dbSort = q.sort === 'priority' ? 'dueDate' : q.sort;

    const [total, rows] = await Promise.all([
      prisma.task.count({ where }),
      prisma.task.findMany({
        where,
        include: taskInclude,
        orderBy: { [dbSort]: q.order },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);

    let items = rows.map((t) => toTaskDTO(t, now));
    if (q.sort === 'priority') {
      items = items.sort((a, b) => {
        const d = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
        return q.order === 'asc' ? d : -d;
      });
    }

    const payload: Paginated<TaskDTO> = {
      items,
      total,
      page: q.page,
      pageSize: q.pageSize,
      totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
    };
    res.json(payload);
  }),
);

/**
 * @openapi
 * /tasks:
 *   post:
 *     tags: [Tasks]
 *     summary: Create a task (audited)
 *     description: The task and its audit block are written in one transaction.
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, description, priority, assigneeId, departmentId, dueDate]
 *             properties:
 *               title: { type: string, example: "Verify land mutation records — Ward 12" }
 *               description: { type: string }
 *               priority: { type: string, enum: [LOW, MEDIUM, HIGH, CRITICAL] }
 *               assigneeId: { type: string }
 *               departmentId: { type: string }
 *               dueDate: { type: string, format: date-time }
 *               slaHours: { type: integer }
 *     responses:
 *       201: { description: Created }
 *       403: { description: Employees cannot create tasks }
 */
taskRouter.post(
  '/',
  requireRole('ADMIN', 'MANAGER'),
  validateBody(createTaskSchema),
  asyncHandler(async (req, res) => {
    const task = await createTask(body<CreateTaskInput>(req), currentUser(req));
    res.status(201).json(toTaskDTO(task));
  }),
);

/**
 * @openapi
 * /tasks/bulk-assign:
 *   post:
 *     tags: [Tasks]
 *     summary: Reassign several tasks at once (each change audited separately)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [taskIds, assigneeId]
 *             properties:
 *               taskIds: { type: array, items: { type: string } }
 *               assigneeId: { type: string }
 *     responses:
 *       200: { description: Number of tasks reassigned }
 */
taskRouter.post(
  '/bulk-assign',
  requireRole('ADMIN', 'MANAGER'),
  validateBody(bulkAssignSchema),
  asyncHandler(async (req, res) => {
    const { taskIds, assigneeId } = body<BulkAssignInput>(req);
    res.json(await bulkAssign(taskIds, assigneeId, currentUser(req)));
  }),
);

/**
 * @openapi
 * /tasks/{id}:
 *   get:
 *     tags: [Tasks]
 *     summary: Task detail with its full update timeline and sentiment chips
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: Task detail }
 *       403: { description: Out of scope for your role }
 *       404: { description: Not found }
 */
taskRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const task = await getTaskDetail(req.params.id, currentUser(req));
    res.json(toTaskDetailDTO(task));
  }),
);

/**
 * @openapi
 * /tasks/{id}:
 *   patch:
 *     tags: [Tasks]
 *     summary: Edit task fields (audited — only changed fields are recorded)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: Updated task }
 */
taskRouter.patch(
  '/:id',
  requireRole('ADMIN', 'MANAGER'),
  validateBody(updateTaskSchema),
  asyncHandler(async (req, res) => {
    const task = await updateTask(req.params.id, body<UpdateTaskInput>(req), currentUser(req));
    res.json(toTaskDTO(task));
  }),
);

/**
 * @openapi
 * /tasks/{id}/status:
 *   post:
 *     tags: [Tasks]
 *     summary: Move a task through the workflow (transition rules enforced, audited)
 *     description: >
 *       Allowed transitions — PENDING→IN_PROGRESS, IN_PROGRESS→UNDER_REVIEW|PENDING,
 *       UNDER_REVIEW→COMPLETED|IN_PROGRESS. Completion requires a manager who is not
 *       the assignee (maker-checker separation).
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status: { type: string, enum: [PENDING, IN_PROGRESS, UNDER_REVIEW, COMPLETED] }
 *               note: { type: string }
 *     responses:
 *       200: { description: Updated task }
 *       400: { description: Invalid transition or self-approval attempt }
 */
taskRouter.post(
  '/:id/status',
  validateBody(taskStatusSchema),
  asyncHandler(async (req, res) => {
    const { status, note } = body<TaskStatusInput>(req);
    const task = await changeStatus(req.params.id, status, note, currentUser(req));
    res.json(toTaskDTO(task));
  }),
);

/**
 * @openapi
 * /tasks/{id}/review:
 *   post:
 *     tags: [Tasks]
 *     summary: Approve or reject a task under review (note mandatory, audited)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [decision, note]
 *             properties:
 *               decision: { type: string, enum: [APPROVE, REJECT] }
 *               note: { type: string, minLength: 5 }
 *     responses:
 *       200: { description: Reviewed task }
 */
taskRouter.post(
  '/:id/review',
  requireRole('ADMIN', 'MANAGER'),
  validateBody(reviewDecisionSchema),
  asyncHandler(async (req, res) => {
    const { decision, note } = body<ReviewDecisionInput>(req);
    const task = await reviewTask(req.params.id, decision, note, currentUser(req));
    res.json(toTaskDTO(task));
  }),
);

/**
 * @openapi
 * /tasks/{id}/updates:
 *   post:
 *     tags: [Tasks]
 *     summary: Add a comment or progress update (scored for sentiment, audited)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [note]
 *             properties:
 *               type: { type: string, enum: [COMMENT, PROGRESS, STATUS_CHANGE, REVIEW_NOTE], default: COMMENT }
 *               note: { type: string, example: "Site visit done, no issues found." }
 *               progressPct: { type: integer, minimum: 0, maximum: 100 }
 *     responses:
 *       201: { description: The created update, including its sentiment score }
 */
taskRouter.post(
  '/:id/updates',
  validateBody(taskUpdateSchema),
  asyncHandler(async (req, res) => {
    const update = await addTaskUpdate(req.params.id, body<TaskUpdateInput>(req), currentUser(req));
    res.status(201).json({
      id: update.id,
      taskId: update.taskId,
      authorId: update.authorId,
      author: update.author,
      type: update.type,
      note: update.note,
      progressPct: update.progressPct,
      createdAt: update.createdAt.toISOString(),
      sentiment: update.sentiment,
    });
  }),
);

/**
 * @openapi
 * /tasks/{id}/audit:
 *   get:
 *     tags: [Tasks]
 *     summary: The audit blocks for one task, oldest first
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: Ordered audit blocks for this task }
 */
taskRouter.get(
  '/:id/audit',
  asyncHandler(async (req, res) => {
    const task = await prisma.task.findUnique({ where: { id: req.params.id } });
    if (!task) throw notFound('Task not found');
    assertCanAccessTask(currentUser(req), task);

    const events = await prisma.auditEvent.findMany({
      where: { entityType: 'TASK', entityId: task.id },
      include: { actor: { select: { id: true, name: true, role: true } } },
      orderBy: { chainIndex: 'asc' },
    });

    res.json({
      items: events.map((e) => ({
        id: e.id,
        chainIndex: e.chainIndex,
        entityType: e.entityType,
        entityId: e.entityId,
        action: e.action,
        actorId: e.actorId,
        actor: e.actor,
        payload: e.payload,
        createdAt: e.createdAt.toISOString(),
        prevHash: e.prevHash,
        hash: e.hash,
      })),
      total: events.length,
    });
  }),
);
