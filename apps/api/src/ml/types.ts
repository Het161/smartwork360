import type { RiskLevel } from '@smartwork/shared';

export interface BurnoutFeatures {
  activeLoad: number;
  overdueCount: number;
  afterHoursPct: number;
  avgDailyUpdates: number;
  negSentimentPct: number;
}

export interface BurnoutResult {
  userId: string;
  score: number;
  riskLevel: RiskLevel;
  topFactors: { key: string; label: string; value: number; contribution: number }[];
}

export interface AnomalyRow {
  userId: string;
  userName: string;
  /** null for accounts not yet assigned to a department. */
  departmentId: string | null;
  actionsPerHour: number;
  nightHourRatio: number;
  selfApprovalCount: number;
  statusFlipCount: number;
  cycleTimeZScore: number;
  fastestCycleMinutes: number;
  sampleTaskId?: string | null;
  sampleRefNo?: string | null;
}

export interface AnomalyResult {
  userId: string;
  anomalyScore: number;
  reasons: string[];
  severity: RiskLevel;
}

export interface ChatContext {
  userId: string;
  role: string;
  name: string;
  departmentName: string;
  pendingTasks: number;
  inProgress: number;
  overdue: number;
  dueToday: number;
  completedThisMonth: number;
  onTimePct: number;
  teamSize?: number;
  slaBreachesToday?: number;
  atRisk?: { name: string; score: number; riskLevel: string }[];
  nextTasks?: { refNo: string; title: string; dueDate: string; id: string; hoursRemaining: number }[];
  lookupTask?: {
    refNo: string;
    title: string;
    status: string;
    assignee: string;
    dueDate: string;
    id: string;
    isOverdue: boolean;
  } | null;
}

export interface ChatResult {
  reply: string;
  intent: string;
  confidence: number;
  data?: Record<string, unknown>;
  links?: { label: string; href: string }[];
  mode?: 'model' | 'heuristic';
}
