import type { Priority, RiskLevel, TaskStatus } from './enums';

/** Default SLA hours when a department has no explicit policy row. */
export const DEFAULT_SLA_HOURS: Record<Priority, number> = {
  CRITICAL: 24,
  HIGH: 48,
  MEDIUM: 96,
  LOW: 168,
};

export const STATUS_LABEL: Record<TaskStatus, string> = {
  PENDING: 'Pending',
  IN_PROGRESS: 'In Progress',
  UNDER_REVIEW: 'Under Review',
  COMPLETED: 'Completed',
};

export const RISK_ORDER: Record<RiskLevel, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MODERATE: 2,
  LOW: 3,
};

export const PRIORITY_ORDER: Record<Priority, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

export const GENESIS_PREV_HASH = '0'.repeat(64);

/** A Merkle checkpoint ("anchor") is cut every N audit events. */
export const ANCHOR_INTERVAL = 100;

/** Sentiment scores inside this band are reported as NEUTRAL. */
export const NEUTRAL_BAND = 0.25;

export const DEMO_PASSWORD = 'Demo@123';
export const PARICHAY_SANDBOX_OTP = '123456';

/* ------------------------------------------------------------ onboarding */

/** OTP lifetime. Long enough to switch to an inbox, short enough to matter. */
export const OTP_TTL_SECONDS = 10 * 60;

/** Wrong guesses before the code is invalidated and a resend is forced. */
export const OTP_MAX_ATTEMPTS = 5;

/** Minimum wait between resend requests, enforced server-side. */
export const OTP_RESEND_COOLDOWN_SECONDS = 30;

/** Self-registration is restricted to government domains. */
export const DEFAULT_ALLOWED_EMAIL_DOMAINS = ['gov.in', 'nic.in'];
