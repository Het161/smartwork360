import { z } from 'zod';
import {
  ALERT_STATUSES,
  PRIORITIES,
  ROLES,
  TASK_STATUSES,
  UPDATE_TYPES,
} from './enums';

/* ------------------------------------------------------------------ auth */

export const loginSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const parichayVerifySchema = z.object({
  userId: z.string().min(3, 'Enter your Parichay user ID (your @gov.in email)'),
  otp: z.string().length(6, 'OTP must be 6 digits'),
});
export type ParichayVerifyInput = z.infer<typeof parichayVerifySchema>;

/* ----------------------------------------------------------------- users */

export const createUserSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email(),
  password: z.string().min(6).default('Demo@123'),
  role: z.enum(ROLES),
  designation: z.string().min(2).max(120),
  departmentId: z.string().min(1),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = createUserSchema
  .partial()
  .omit({ password: true })
  .extend({ active: z.boolean().optional() });
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const listUsersQuerySchema = z.object({
  departmentId: z.string().optional(),
  role: z.enum(ROLES).optional(),
  q: z.string().optional(),
  includeInactive: z.coerce.boolean().optional().default(false),
});

/* ----------------------------------------------------------- departments */

export const createDepartmentSchema = z.object({
  code: z.string().min(2).max(12).toUpperCase(),
  name: z.string().min(2).max(120),
  nameHi: z.string().min(1).max(120),
});
export type CreateDepartmentInput = z.infer<typeof createDepartmentSchema>;

export const updateDepartmentSchema = createDepartmentSchema.partial();

/* ----------------------------------------------------------------- tasks */

export const createTaskSchema = z.object({
  title: z.string().min(5, 'Give the task a descriptive title').max(200),
  description: z.string().min(1).max(4000),
  priority: z.enum(PRIORITIES),
  assigneeId: z.string().min(1, 'Pick an assignee'),
  departmentId: z.string().min(1),
  dueDate: z.coerce.date(),
  slaHours: z.number().int().positive().max(24 * 60).optional(),
});
export type CreateTaskInput = z.infer<typeof createTaskSchema>;

export const updateTaskSchema = z.object({
  title: z.string().min(5).max(200).optional(),
  description: z.string().min(1).max(4000).optional(),
  priority: z.enum(PRIORITIES).optional(),
  assigneeId: z.string().min(1).optional(),
  dueDate: z.coerce.date().optional(),
  slaHours: z.number().int().positive().max(24 * 60).optional(),
});
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

export const taskStatusSchema = z.object({
  status: z.enum(TASK_STATUSES),
  note: z.string().max(1000).optional(),
});
export type TaskStatusInput = z.infer<typeof taskStatusSchema>;

export const taskUpdateSchema = z.object({
  type: z.enum(UPDATE_TYPES).default('COMMENT'),
  note: z.string().min(1, 'Write a short note').max(2000),
  progressPct: z.number().int().min(0).max(100).optional(),
});
export type TaskUpdateInput = z.infer<typeof taskUpdateSchema>;

export const listTasksQuerySchema = z.object({
  status: z.enum(TASK_STATUSES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  assigneeId: z.string().optional(),
  departmentId: z.string().optional(),
  overdue: z.coerce.boolean().optional(),
  /** Excludes COMPLETED — "what is still on someone's desk". */
  open: z.coerce.boolean().optional(),
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(['dueDate', 'createdAt', 'priority']).default('dueDate'),
  order: z.enum(['asc', 'desc']).default('asc'),
});
export type ListTasksQuery = z.infer<typeof listTasksQuerySchema>;

export const bulkAssignSchema = z.object({
  taskIds: z.array(z.string().min(1)).min(1).max(50),
  assigneeId: z.string().min(1),
});
export type BulkAssignInput = z.infer<typeof bulkAssignSchema>;

/* --------------------------------------------------------------- reviews */

export const reviewDecisionSchema = z.object({
  decision: z.enum(['APPROVE', 'REJECT']),
  note: z.string().min(5, 'A review note is mandatory for the audit trail').max(1000),
});
export type ReviewDecisionInput = z.infer<typeof reviewDecisionSchema>;

/* ----------------------------------------------------------------- fraud */

export const reviewAlertSchema = z.object({
  status: z.enum(['REVIEWED', 'DISMISSED']),
  reviewNote: z.string().min(5, 'A note is mandatory — it is written to the audit chain').max(1000),
});
export type ReviewAlertInput = z.infer<typeof reviewAlertSchema>;

export const listAlertsQuerySchema = z.object({
  status: z.enum(ALERT_STATUSES).optional(),
  severity: z.string().optional(),
  type: z.string().optional(),
  departmentId: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

/* ----------------------------------------------------------------- audit */

export const listAuditQuerySchema = z.object({
  entityType: z.string().optional(),
  entityId: z.string().optional(),
  actorId: z.string().optional(),
  action: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
});

/* ------------------------------------------------------------- analytics */

export const analyticsScopeSchema = z.object({
  scope: z.enum(['org', 'dept', 'me']).default('me'),
  departmentId: z.string().optional(),
});

/* ------------------------------------------------------------------ chat */

export const chatQuerySchema = z.object({
  message: z.string().min(1, 'Type a question').max(500),
});
export type ChatQueryInput = z.infer<typeof chatQuerySchema>;

/* ------------------------------------------------------------------- sla */

export const slaPolicySchema = z.object({
  departmentId: z.string().min(1),
  priority: z.enum(PRIORITIES),
  hours: z.number().int().min(1).max(24 * 90),
});
export type SlaPolicyInput = z.infer<typeof slaPolicySchema>;
