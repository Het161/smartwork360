import type {
  AlertStatus,
  UserStatus,
  FraudType,
  Priority,
  RiskLevel,
  Role,
  SentimentLabel,
  TaskStatus,
  TaskUpdateType,
} from './enums';

/** Wire shapes returned by the API. Dates are ISO strings over JSON. */

export interface DepartmentDTO {
  id: string;
  code: string;
  name: string;
  nameHi: string;
  userCount?: number;
}

export interface UserDTO {
  id: string;
  name: string;
  email: string;
  role: Role;
  designation: string;
  departmentId: string;
  department?: DepartmentDTO;
  avatarSeed: string;
  active: boolean;
  status: UserStatus;
  emailVerified: boolean;
  approvedAt?: string | null;
  createdAt: string;
}

export interface SignupResultDTO {
  email: string;
  status: UserStatus;
  /** Present only in development with MAIL_MODE=console — never in production. */
  devOtp?: string;
  /** Ethereal preview URL when MAIL_MODE=ethereal. */
  previewUrl?: string;
  expiresInSeconds: number;
}

export interface TaskUpdateDTO {
  id: string;
  taskId: string;
  authorId: string;
  author?: Pick<UserDTO, 'id' | 'name' | 'avatarSeed' | 'designation'>;
  type: TaskUpdateType;
  note: string;
  progressPct: number | null;
  createdAt: string;
  sentiment?: { score: number; label: SentimentLabel } | null;
}

export interface TaskDTO {
  id: string;
  refNo: string;
  title: string;
  description: string;
  priority: Priority;
  status: TaskStatus;
  creatorId: string;
  assigneeId: string;
  departmentId: string;
  dueDate: string;
  slaHours: number;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** Server-computed: dueDate < now && status !== COMPLETED */
  isOverdue: boolean;
  /** Server-computed: hours until due (negative when breached). */
  hoursRemaining: number;
  assignee?: Pick<UserDTO, 'id' | 'name' | 'avatarSeed' | 'designation'>;
  creator?: Pick<UserDTO, 'id' | 'name' | 'avatarSeed' | 'designation'>;
  department?: Pick<DepartmentDTO, 'id' | 'code' | 'name' | 'nameHi'>;
  updates?: TaskUpdateDTO[];
  updateCount?: number;
  progressPct?: number;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface AuditEventDTO {
  id: string;
  chainIndex: number;
  entityType: string;
  entityId: string;
  action: string;
  actorId: string | null;
  actor?: Pick<UserDTO, 'id' | 'name' | 'role'> | null;
  payload: Record<string, unknown>;
  createdAt: string;
  prevHash: string;
  hash: string;
}

export interface ChainVerificationDTO {
  intact: boolean;
  checkedCount: number;
  firstBrokenIndex?: number;
  brokenReason?: string;
  headHash: string | null;
  durationMs: number;
  anchorCount: number;
}

export interface AnchorDTO {
  id: string;
  anchorIndex: number;
  fromIndex: number;
  toIndex: number;
  merkleRoot: string;
  externalTxHash: string;
  createdAt: string;
}

export interface KpiDTO {
  label: string;
  value: number;
  suffix?: string;
  deltaPct?: number;
  hint?: string;
}

export interface KpiSummaryDTO {
  scope: 'org' | 'dept' | 'me';
  totalTasks: number;
  pending: number;
  inProgress: number;
  underReview: number;
  completed: number;
  overdue: number;
  dueToday: number;
  onTimePct: number;
  avgCycleTimeHours: number;
  /** Cycle time in the first half vs second half of the window — backs the "30–40% faster" claim. */
  cycleTimeImprovementPct: number;
  slaCompliancePct: number;
  activeUsers: number;
}

export interface TrendPointDTO {
  week: string;
  label: string;
  throughput: number;
  avgCycleTimeHours: number;
  breaches: number;
}

export interface SlaAnalyticsDTO {
  compliancePct: number;
  totalMeasured: number;
  breached: number;
  byPriority: { priority: Priority; total: number; breached: number; compliancePct: number }[];
  byDepartment: {
    departmentId: string;
    code: string;
    name: string;
    total: number;
    breached: number;
    compliancePct: number;
  }[];
  heatmap: { week: string; departmentId: string; code: string; breaches: number; total: number }[];
}

export interface WorkloadItemDTO {
  userId: string;
  name: string;
  designation: string;
  avatarSeed: string;
  activeLoad: number;
  overdue: number;
  completed30d: number;
  band: 'LIGHT' | 'BALANCED' | 'HEAVY' | 'OVERLOADED';
}

export interface SentimentTeamDTO {
  departmentId: string;
  averageScore: number;
  label: SentimentLabel;
  trendDelta: number;
  distribution: { positive: number; neutral: number; negative: number };
  trend: { date: string; score: number; count: number }[];
  modelVersion: string;
  mode: 'model' | 'heuristic';
}

export interface BurnoutFactorsDTO {
  overdueCount: number;
  avgDailyUpdates: number;
  afterHoursPct: number;
  negSentimentPct: number;
  activeLoad: number;
}

export interface BurnoutScoreDTO {
  userId: string;
  user?: Pick<UserDTO, 'id' | 'name' | 'avatarSeed' | 'designation'>;
  weekStart: string;
  score: number;
  riskLevel: RiskLevel;
  factors: BurnoutFactorsDTO;
  topFactors: { key: string; label: string; value: number; contribution: number }[];
  suggestedAction: string;
}

export interface FraudAlertDTO {
  id: string;
  type: FraudType;
  severity: RiskLevel;
  userId: string | null;
  user?: Pick<UserDTO, 'id' | 'name' | 'avatarSeed' | 'designation' | 'departmentId'> | null;
  taskId: string | null;
  task?: Pick<TaskDTO, 'id' | 'refNo' | 'title'> | null;
  anomalyScore: number;
  details: Record<string, unknown>;
  status: AlertStatus;
  createdAt: string;
  reviewedById: string | null;
  reviewNote: string | null;
  /** Seeded ground-truth label; powers the honest precision stat. */
  labelConfirmed: boolean | null;
}

export interface FraudPrecisionDTO {
  totalLabelled: number;
  confirmed: number;
  precisionPct: number;
}

export interface NotificationDTO {
  id: string;
  title: string;
  body: string;
  link: string | null;
  read: boolean;
  createdAt: string;
}

export interface ChatReplyDTO {
  reply: string;
  intent: string;
  confidence: number;
  data?: Record<string, unknown>;
  links?: { label: string; href: string }[];
}

export interface UserPerformanceDTO {
  userId: string;
  name: string;
  onTimePct: number;
  throughput30d: number;
  avgCycleTimeHours: number;
  completedTotal: number;
  currentStreak: number;
  monthly: { month: string; completed: number; onTime: number }[];
  cycleTrend: { week: string; avgCycleTimeHours: number }[];
  sentimentTrend: { date: string; score: number }[];
  badges: { key: string; label: string; earned: boolean; hint: string }[];
}

export interface AuthTokensDTO {
  accessToken: string;
  user: UserDTO;
}
