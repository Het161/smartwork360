/**
 * Canonical enums. These mirror the Prisma enums exactly — kept here (rather than
 * imported from @prisma/client) so the web app can use them without pulling in the
 * Prisma runtime.
 */

export const ROLES = ['ADMIN', 'MANAGER', 'EMPLOYEE'] as const;
export type Role = (typeof ROLES)[number];

export const USER_STATUSES = [
  'PENDING_VERIFICATION',
  'PENDING_APPROVAL',
  'ACTIVE',
  'DISABLED',
] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const TASK_STATUSES = ['PENDING', 'IN_PROGRESS', 'UNDER_REVIEW', 'COMPLETED'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const ALERT_STATUSES = ['OPEN', 'REVIEWED', 'DISMISSED'] as const;
export type AlertStatus = (typeof ALERT_STATUSES)[number];

export const RISK_LEVELS = ['LOW', 'MODERATE', 'HIGH', 'CRITICAL'] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export const UPDATE_TYPES = ['COMMENT', 'PROGRESS', 'STATUS_CHANGE', 'REVIEW_NOTE'] as const;
export type TaskUpdateType = (typeof UPDATE_TYPES)[number];

export const SENTIMENT_LABELS = ['POSITIVE', 'NEGATIVE', 'NEUTRAL'] as const;
export type SentimentLabel = (typeof SENTIMENT_LABELS)[number];

export const FRAUD_TYPES = [
  'BULK_STATUS_CHANGE',
  'AFTER_HOURS_SPIKE',
  'SELF_APPROVAL',
  'UNUSUAL_CYCLE_TIME',
] as const;
export type FraudType = (typeof FRAUD_TYPES)[number];

/**
 * Allowed task status transitions. Enforced server-side in POST /tasks/:id/status
 * so the audit chain can never contain an impossible workflow jump.
 */
export const STATUS_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  PENDING: ['IN_PROGRESS'],
  IN_PROGRESS: ['UNDER_REVIEW', 'PENDING'],
  UNDER_REVIEW: ['COMPLETED', 'IN_PROGRESS'],
  COMPLETED: [],
};

export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  return STATUS_TRANSITIONS[from].includes(to);
}

/** Audit actions — the vocabulary written into the hash chain. */
export const AUDIT_ACTIONS = [
  'GENESIS',
  'TASK_CREATED',
  'TASK_UPDATED',
  'TASK_STATUS_CHANGED',
  'TASK_UPDATE_ADDED',
  'TASK_APPROVED',
  'TASK_REJECTED',
  'USER_CREATED',
  'USER_UPDATED',
  'USER_REGISTERED',
  'EMAIL_VERIFIED',
  'USER_APPROVED',
  'DEPARTMENT_CREATED',
  'DEPARTMENT_UPDATED',
  'SLA_POLICY_UPDATED',
  'FRAUD_ALERT_REVIEWED',
  'FRAUD_SCAN_RUN',
  'ANCHOR_CREATED',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];
