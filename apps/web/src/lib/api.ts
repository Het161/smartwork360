import type {
  AuthTokensDTO,
  BurnoutScoreDTO,
  ChatReplyDTO,
  ChainVerificationDTO,
  DepartmentDTO,
  FraudAlertDTO,
  FraudPrecisionDTO,
  KpiSummaryDTO,
  NotificationDTO,
  Paginated,
  SignupResultDTO,
  SentimentTeamDTO,
  SlaAnalyticsDTO,
  TaskDTO,
  TaskUpdateDTO,
  TrendPointDTO,
  UserDTO,
  UserPerformanceDTO,
  WorkloadItemDTO,
  AuditEventDTO,
  AnchorDTO,
} from '@smartwork/shared';

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

const TOKEN_KEY = 'sw360_access_token';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (typeof window === 'undefined') return;
  if (token) window.localStorage.setItem(TOKEN_KEY, token);
  else window.localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = 'ERROR',
    public details?: { field: string; message: string }[],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  /** Set false for the login/refresh calls themselves. */
  auth?: boolean;
}

/**
 * Thin fetch wrapper.
 *
 * On a 401 it attempts ONE silent refresh using the httpOnly cookie and replays
 * the request — so a 15-minute access token never interrupts a demo mid-click.
 */
async function request<T>(path: string, options: RequestOptions = {}, isRetry = false): Promise<T> {
  const { body, auth = true, headers, ...rest } = options;

  const res = await fetch(`${API_URL}${path}`, {
    ...rest,
    credentials: 'include',
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(auth && getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 && auth && !isRetry) {
    const refreshed = await tryRefresh();
    if (refreshed) return request<T>(path, options, true);
  }

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    let code = 'ERROR';
    let details: { field: string; message: string }[] | undefined;
    try {
      const json = await res.json();
      message = json?.error?.message ?? message;
      code = json?.error?.code ?? code;
      details = json?.error?.details;
    } catch {
      /* non-JSON error body — keep the generic message */
    }
    throw new ApiError(res.status, message, code, details);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

let refreshInFlight: Promise<boolean> | null = null;

/** Coalesces concurrent refreshes so a dashboard's parallel queries fire only one. */
async function tryRefresh(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    try {
      const res = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) return false;
      const json = (await res.json()) as AuthTokensDTO;
      setToken(json.accessToken);
      return true;
    } catch {
      return false;
    } finally {
      setTimeout(() => {
        refreshInFlight = null;
      }, 0);
    }
  })();

  return refreshInFlight;
}

const qs = (params: Record<string, string | number | boolean | undefined | null>) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  }
  const s = search.toString();
  return s ? `?${s}` : '';
};

/* ------------------------------------------------------------------- api */

export const api = {
  /* auth */
  login: (email: string, password: string) =>
    request<AuthTokensDTO>('/auth/login', { method: 'POST', body: { email, password }, auth: false }),
  parichay: (userId: string, otp: string) =>
    request<AuthTokensDTO & { sso: { provider: string; mode: string } }>('/auth/parichay/verify', {
      method: 'POST',
      body: { userId, otp },
      auth: false,
    }),
  me: () => request<{ user: UserDTO; via: string }>('/auth/me'),

  /* signup */
  signupDepartments: () =>
    request<{ items: DepartmentDTO[]; allowedDomains: string[] }>('/auth/signup/departments', {
      auth: false,
    }),
  signup: (body: {
    name: string;
    email: string;
    designation: string;
    departmentId: string;
    password: string;
    confirmPassword: string;
  }) =>
    request<SignupResultDTO & { maskedEmail: string }>('/auth/signup', {
      method: 'POST',
      body,
      auth: false,
    }),
  verifyOtp: (email: string, code: string) =>
    request<{ alreadyVerified: boolean; status: string; attemptsLeft: number }>(
      '/auth/signup/verify-otp',
      { method: 'POST', body: { email, code }, auth: false },
    ),
  resendOtp: (email: string) =>
    request<SignupResultDTO & { maskedEmail: string }>('/auth/signup/resend-otp', {
      method: 'POST',
      body: { email },
      auth: false,
    }),
  pendingUsers: () => request<{ items: UserDTO[]; total: number }>('/users/pending/list'),
  approveUser: (id: string) =>
    request<{ user: UserDTO; previewUrl?: string }>(`/users/${id}/approve`, { method: 'PATCH' }),
  logout: () => request<{ ok: boolean }>('/auth/logout', { method: 'POST' }),

  /* departments */
  departments: () => request<{ items: DepartmentDTO[] }>('/departments'),
  createDepartment: (body: { code: string; name: string; nameHi: string }) =>
    request<DepartmentDTO>('/departments', { method: 'POST', body }),
  updateDepartment: (id: string, body: Partial<{ code: string; name: string; nameHi: string }>) =>
    request<DepartmentDTO>(`/departments/${id}`, { method: 'PATCH', body }),
  slaPolicies: (deptId: string) =>
    request<{ items: { id: string; priority: string; hours: number }[] }>(`/departments/${deptId}/sla`),
  setSlaPolicy: (deptId: string, body: { departmentId: string; priority: string; hours: number }) =>
    request(`/departments/${deptId}/sla`, { method: 'PUT', body }),

  /* users */
  users: (params: { departmentId?: string; role?: string; q?: string; includeInactive?: boolean } = {}) =>
    request<{ items: UserDTO[]; total: number }>(`/users${qs(params)}`),
  user: (id: string) => request<UserDTO>(`/users/${id}`),
  createUser: (body: Record<string, unknown>) => request<UserDTO>('/users', { method: 'POST', body }),
  updateUser: (id: string, body: Record<string, unknown>) =>
    request<UserDTO>(`/users/${id}`, { method: 'PATCH', body }),
  performance: (id: string) => request<UserPerformanceDTO>(`/users/${id}/performance`),

  /* tasks */
  tasks: (params: Record<string, string | number | boolean | undefined> = {}) =>
    request<Paginated<TaskDTO>>(`/tasks${qs(params)}`),
  task: (id: string) => request<TaskDTO>(`/tasks/${id}`),
  createTask: (body: Record<string, unknown>) => request<TaskDTO>('/tasks', { method: 'POST', body }),
  updateTask: (id: string, body: Record<string, unknown>) =>
    request<TaskDTO>(`/tasks/${id}`, { method: 'PATCH', body }),
  setStatus: (id: string, status: string, note?: string) =>
    request<TaskDTO>(`/tasks/${id}/status`, { method: 'POST', body: { status, note } }),
  review: (id: string, decision: 'APPROVE' | 'REJECT', note: string) =>
    request<TaskDTO>(`/tasks/${id}/review`, { method: 'POST', body: { decision, note } }),
  addUpdate: (id: string, body: { type?: string; note: string; progressPct?: number }) =>
    request<TaskUpdateDTO>(`/tasks/${id}/updates`, { method: 'POST', body }),
  taskAudit: (id: string) =>
    request<{ items: AuditEventDTO[]; total: number }>(`/tasks/${id}/audit`),
  bulkAssign: (taskIds: string[], assigneeId: string) =>
    request<{ updated: number }>('/tasks/bulk-assign', { method: 'POST', body: { taskIds, assigneeId } }),

  /* analytics */
  kpis: (scope: 'org' | 'dept' | 'me', departmentId?: string) =>
    request<KpiSummaryDTO>(`/analytics/kpis${qs({ scope, departmentId })}`),
  sla: (scope: 'org' | 'dept' | 'me', departmentId?: string) =>
    request<SlaAnalyticsDTO>(`/analytics/sla${qs({ scope, departmentId })}`),
  trends: (scope: 'org' | 'dept' | 'me', departmentId?: string) =>
    request<{ items: TrendPointDTO[] }>(`/analytics/trends${qs({ scope, departmentId })}`),
  workload: (departmentId?: string) =>
    request<{ items: WorkloadItemDTO[] }>(`/analytics/workload${qs({ departmentId })}`),

  /* sentiment + burnout */
  teamSentiment: (deptId: string, days = 14) =>
    request<SentimentTeamDTO>(`/sentiment/team/${deptId}${qs({ days })}`),
  mySentiment: () =>
    request<{ averageScore: number; label: string; count: number; trend: { date: string; score: number }[] }>(
      '/sentiment/mine',
    ),
  recomputeSentiment: (departmentId?: string) =>
    request<{ rescored: number; mode: string; modelVersion: string }>('/sentiment/recompute', {
      method: 'POST',
      body: { departmentId },
    }),
  teamBurnout: (deptId: string) => request<{ items: BurnoutScoreDTO[] }>(`/burnout/team/${deptId}`),
  userBurnout: (id: string) => request<BurnoutScoreDTO>(`/burnout/user/${id}`),
  recomputeBurnout: (departmentId?: string) =>
    request<{ scored: number; mode: string }>('/burnout/recompute', {
      method: 'POST',
      body: { departmentId },
    }),

  /* fraud */
  alerts: (params: Record<string, string | number | undefined> = {}) =>
    request<Paginated<FraudAlertDTO> & { precision: FraudPrecisionDTO }>(`/fraud/alerts${qs(params)}`),
  triageAlert: (id: string, status: 'REVIEWED' | 'DISMISSED', reviewNote: string) =>
    request<FraudAlertDTO>(`/fraud/alerts/${id}`, { method: 'PATCH', body: { status, reviewNote } }),
  runScan: (departmentId?: string) =>
    request<{ created: number; evaluated: number; mode: string }>('/fraud/scan', {
      method: 'POST',
      body: { departmentId },
    }),
  precision: () => request<FraudPrecisionDTO>('/fraud/precision'),
  scatter: () =>
    request<{
      items: {
        id: string;
        type: string;
        severity: string;
        status: string;
        anomalyScore: number;
        createdAt: string;
        hourOfDay: number;
        daysAgo: number;
        userName: string;
        refNo: string | null;
      }[];
    }>('/fraud/scatter'),

  /* audit */
  verifyChain: () => request<ChainVerificationDTO>('/audit/verify'),
  auditEvents: (params: Record<string, string | number | boolean | undefined> = {}) =>
    request<Paginated<AuditEventDTO>>(`/audit/events${qs(params)}`),
  auditEntity: (type: string, id: string) =>
    request<{ items: AuditEventDTO[]; total: number }>(`/audit/entity/${type}/${id}`),
  anchors: () => request<{ items: AnchorDTO[]; total: number }>('/audit/anchors'),

  /* chat */
  chat: (message: string) =>
    request<ChatReplyDTO>('/chat/query', { method: 'POST', body: { message } }),
  chatSuggestions: () => request<{ items: { en: string; hi: string }[] }>('/chat/suggestions'),

  /* notifications */
  notifications: (unreadOnly = false) =>
    request<{ items: NotificationDTO[]; unreadCount: number; total: number }>(
      `/notifications${qs({ unreadOnly })}`,
    ),
  markRead: (id: string) => request(`/notifications/${id}/read`, { method: 'PATCH' }),
  markAllRead: () => request<{ marked: number }>('/notifications/read-all', { method: 'PATCH' }),

  /* reports */
  reportSummary: () =>
    request<{
      generatedAt: string;
      period: string;
      kpis: KpiSummaryDTO;
      sla: { compliancePct: number; breached: number; measured: number };
      createdThisMonth: number;
      completedThisMonth: number;
      auditBlocks: number;
    }>('/reports/summary'),
};

/** CSV downloads need the bearer token, so they go through fetch + a blob URL. */
export async function downloadCsv(path: string, filename: string) {
  const res = await fetch(`${API_URL}${path}`, {
    credentials: 'include',
    headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
  });
  if (!res.ok) throw new ApiError(res.status, 'Export failed');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
