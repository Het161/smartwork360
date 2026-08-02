import type { RiskLevel } from '@smartwork/shared';
import type {
  AnomalyResult,
  AnomalyRow,
  BurnoutFeatures,
  BurnoutResult,
  ChatContext,
  ChatResult,
} from './types';

/**
 * Local TypeScript twins of the three ML endpoints.
 *
 * These are not stubs — they are the same algorithms the Python service runs in
 * HEURISTIC_MODE, reimplemented so the API keeps every AI surface alive when the
 * Python process is not running at all.
 */

/* --------------------------------------------------------------- burnout */

const BURNOUT_WEIGHTS = [
  { key: 'activeLoad', label: 'Active workload', max: 10, weight: 28 },
  { key: 'overdueCount', label: 'Overdue tasks', max: 6, weight: 30 },
  { key: 'afterHoursPct', label: 'After-hours activity', max: 60, weight: 18 },
  { key: 'negSentimentPct', label: 'Negative sentiment', max: 60, weight: 19 },
  { key: 'avgDailyUpdates', label: 'Update churn', max: 4, weight: 5 },
] as const;

export function burnoutFallback(users: { userId: string; features: BurnoutFeatures }[]) {
  const items: BurnoutResult[] = users.map(({ userId, features }) => {
    const contributions = BURNOUT_WEIGHTS.map((w) => {
      const raw = features[w.key as keyof BurnoutFeatures] ?? 0;
      const contribution = Math.min(1, raw / w.max) * w.weight;
      return { key: w.key, label: w.label, value: raw, contribution: Number(contribution.toFixed(1)) };
    });

    const score = Math.round(Math.min(100, contributions.reduce((s, c) => s + c.contribution, 0)));
    const topFactors = [...contributions].sort((a, b) => b.contribution - a.contribution).slice(0, 2);

    return { userId, score, riskLevel: riskFromScore(score), topFactors };
  });

  return { items, modelVersion: 'heuristic-burnout-rules-v1', mode: 'heuristic' as const };
}

export function riskFromScore(score: number): RiskLevel {
  if (score >= 80) return 'CRITICAL';
  if (score >= 62) return 'HIGH';
  if (score >= 40) return 'MODERATE';
  return 'LOW';
}

/** Plain-language next step shown on the Burnout & Morale cards. */
export function suggestedActionFor(result: BurnoutResult, activeLoad: number): string {
  if (result.riskLevel === 'LOW') return 'No action needed — workload looks sustainable.';
  const top = result.topFactors[0]?.key;
  if (top === 'overdueCount') return 'Re-prioritise or extend deadlines on the overdue items.';
  if (top === 'activeLoad') {
    return `Redistribute ${Math.max(2, Math.round(activeLoad * 0.3))} tasks to a lighter-loaded colleague.`;
  }
  if (top === 'afterHoursPct') return 'Check in 1:1 — sustained after-hours working detected.';
  if (top === 'negSentimentPct') return 'Check in 1:1 — recent updates show growing frustration.';
  return 'Review workload at the next team meeting.';
}

/* --------------------------------------------------------------- anomaly */

/**
 * z-score style scoring over the same five features the IsolationForest uses.
 * Thresholds are the ones the seeded scenarios were designed against.
 */
export function anomalyFallback(events: AnomalyRow[]) {
  const items: AnomalyResult[] = events.map((e) => {
    const reasons: string[] = [];
    let score = 0;

    if (e.nightHourRatio > 0.35) {
      score += Math.min(0.4, e.nightHourRatio * 0.5);
      reasons.push('night_hour_ratio');
    }
    if (e.actionsPerHour > 6) {
      score += Math.min(0.25, (e.actionsPerHour - 6) * 0.04);
      reasons.push('action_burst');
    }
    if (e.selfApprovalCount > 0) {
      score += Math.min(0.35, 0.18 + e.selfApprovalCount * 0.06);
      reasons.push('self_approval');
    }
    if (e.statusFlipCount > 8) {
      score += Math.min(0.2, (e.statusFlipCount - 8) * 0.02);
      reasons.push('status_flip');
    }
    if (e.cycleTimeZScore < -2.5 || e.fastestCycleMinutes < 15) {
      score += 0.3;
      reasons.push('cycle_time_zscore');
    }

    const anomalyScore = Number(Math.min(0.99, score).toFixed(3));
    return { userId: e.userId, anomalyScore, reasons, severity: severityFor(anomalyScore) };
  });

  return { items, modelVersion: 'heuristic-zscore-v1', mode: 'heuristic' as const };
}

function severityFor(score: number): RiskLevel {
  if (score >= 0.85) return 'CRITICAL';
  if (score >= 0.65) return 'HIGH';
  if (score >= 0.4) return 'MODERATE';
  return 'LOW';
}

/* ------------------------------------------------------------------ chat */

/**
 * Intent router — the honest "AI assistant".
 *
 * It does not generate open-ended text. It classifies the question, then answers
 * from live numbers the API already fetched. That is why it can never hallucinate
 * a task count. Hindi/Hinglish patterns are first-class, not an afterthought.
 */
interface IntentRule {
  intent: string;
  patterns: RegExp[];
}

const INTENTS: IntentRule[] = [
  {
    intent: 'overdue_tasks',
    patterns: [
      /\boverdue\b/i,
      /\blate\b/i,
      /\bbreach(ed)?\b/i,
      /deadline (cross|miss)/i,
      /kitne? overdue/i,
      /der ho/i,
      /samay nikal/i,
    ],
  },
  {
    intent: 'my_pending_tasks',
    patterns: [
      /\bpending\b/i,
      /\bmy tasks?\b/i,
      /what.*(assigned|to do|todo)/i,
      /mere? (pending )?(kaam|task)/i,
      /kya kaam/i,
      /mujhe kya/i,
    ],
  },
  {
    intent: 'sla_breaches_today',
    patterns: [/sla/i, /\btoday\b.*(breach|due)/i, /due today/i, /aaj.*(due|kaam)/i],
  },
  {
    intent: 'team_workload',
    patterns: [/team.*(load|workload|busy)/i, /who is (busy|free)/i, /workload/i, /team ka/i],
  },
  {
    intent: 'who_is_at_risk',
    patterns: [/at risk/i, /burnout/i, /overload(ed)?/i, /stress/i, /morale/i, /pareshan/i],
  },
  {
    intent: 'task_status',
    patterns: [/status of/i, /#[A-Z]{3}\/\d{4}\/\d+/i, /[A-Z]{3}\/\d{4}\/\d{3,4}/, /\bkaha(n)? tak\b/i],
  },
  {
    intent: 'create_reminder',
    patterns: [/remind/i, /reminder/i, /yaad dila/i, /follow ?up/i],
  },
  {
    intent: 'greeting',
    patterns: [/^(hi|hello|hey|namaste|namaskar)\b/i, /good (morning|afternoon|evening)/i],
  },
  {
    intent: 'help',
    patterns: [/\bhelp\b/i, /what can you do/i, /kya kar sakte/i, /options/i],
  },
];

export function classifyIntent(message: string): { intent: string; confidence: number } {
  for (const rule of INTENTS) {
    for (const pattern of rule.patterns) {
      if (pattern.test(message)) return { intent: rule.intent, confidence: 0.86 };
    }
  }
  return { intent: 'fallback', confidence: 0.3 };
}

const CAPABILITIES = [
  'How many tasks are pending for me?',
  'Which of my tasks are overdue?',
  'Any SLA breach today?',
  'What is the status of REV/2026/0042?',
];

export function chatFallback(message: string, ctx: ChatContext): ChatResult {
  const { intent, confidence } = classifyIntent(message);
  const first = ctx.name.split(' ')[0];

  switch (intent) {
    case 'greeting':
      return {
        intent,
        confidence,
        mode: 'heuristic',
        reply: `Namaste ${first}. You have ${ctx.pendingTasks} pending and ${ctx.inProgress} in-progress tasks right now${ctx.overdue > 0 ? `, and ${ctx.overdue} of them ${ctx.overdue === 1 ? 'is' : 'are'} overdue` : ''}. What would you like to check?`,
        data: { pending: ctx.pendingTasks, overdue: ctx.overdue },
      };

    case 'my_pending_tasks': {
      if (ctx.pendingTasks + ctx.inProgress === 0) {
        return {
          intent,
          confidence,
          mode: 'heuristic',
          reply: `Nothing pending, ${first} — your queue is clear. ${ctx.completedThisMonth} tasks completed this month.`,
        };
      }
      const list = (ctx.nextTasks ?? []).slice(0, 3);
      // A task past its deadline must never read as "due in 0h".
      const lines = list.map((t) => {
        const h = Math.round(t.hoursRemaining);
        const when = h < 0 ? `${Math.abs(h)}h overdue` : `due in ${h}h`;
        return `• ${t.refNo} — ${t.title} (${when})`;
      });
      return {
        intent,
        confidence,
        mode: 'heuristic',
        reply: [
          `You have ${ctx.pendingTasks} pending and ${ctx.inProgress} in progress, ${first}.`,
          lines.length ? `\nDue soonest:\n${lines.join('\n')}` : '',
        ].join(''),
        data: { pending: ctx.pendingTasks, inProgress: ctx.inProgress },
        links: list.map((t) => ({ label: t.refNo, href: `/e/tasks?task=${t.id}` })),
      };
    }

    case 'overdue_tasks': {
      if (ctx.overdue === 0) {
        return {
          intent,
          confidence,
          mode: 'heuristic',
          reply: `Good news — nothing is overdue for you right now. On-time completion this month is ${ctx.onTimePct}%.`,
          data: { overdue: 0, onTimePct: ctx.onTimePct },
        };
      }
      const late = (ctx.nextTasks ?? []).filter((t) => t.hoursRemaining < 0).slice(0, 3);
      return {
        intent,
        confidence,
        mode: 'heuristic',
        reply: [
          `${ctx.overdue} ${ctx.overdue === 1 ? 'task has' : 'tasks have'} passed their deadline.`,
          late.length
            ? `\n${late.map((t) => `• ${t.refNo} — ${t.title} (${Math.abs(Math.round(t.hoursRemaining))}h late)`).join('\n')}`
            : '',
        ].join(''),
        data: { overdue: ctx.overdue },
        links: late.map((t) => ({ label: t.refNo, href: `/e/tasks?task=${t.id}` })),
      };
    }

    case 'sla_breaches_today':
      return {
        intent,
        confidence,
        mode: 'heuristic',
        reply:
          ctx.role === 'EMPLOYEE'
            ? `You have ${ctx.dueToday} ${ctx.dueToday === 1 ? 'task' : 'tasks'} due today and ${ctx.overdue} already past the SLA.`
            : `${ctx.departmentName}: ${ctx.slaBreachesToday ?? ctx.overdue} SLA ${(ctx.slaBreachesToday ?? ctx.overdue) === 1 ? 'breach' : 'breaches'} recorded, ${ctx.dueToday} more due today.`,
        data: { dueToday: ctx.dueToday, overdue: ctx.overdue },
      };

    case 'team_workload':
      if (ctx.role === 'EMPLOYEE') {
        return {
          intent: 'fallback',
          confidence: 0.5,
          mode: 'heuristic',
          reply: `Team workload is visible to managers. For your own queue: ${ctx.pendingTasks} pending, ${ctx.inProgress} in progress, ${ctx.overdue} overdue.`,
        };
      }
      return {
        intent,
        confidence,
        mode: 'heuristic',
        reply: `${ctx.departmentName} has ${ctx.teamSize ?? 0} people carrying ${ctx.pendingTasks + ctx.inProgress} active tasks, ${ctx.overdue} of them overdue. Open Team Analytics for the per-member split.`,
        links: [{ label: 'Team Analytics', href: '/m/analytics' }],
      };

    case 'who_is_at_risk': {
      const risky = ctx.atRisk ?? [];
      if (ctx.role === 'EMPLOYEE') {
        return {
          intent: 'fallback',
          confidence: 0.5,
          mode: 'heuristic',
          reply: 'Burnout insights are available to managers and administrators.',
        };
      }
      if (risky.length === 0) {
        return {
          intent,
          confidence,
          mode: 'heuristic',
          reply: `No one in ${ctx.departmentName} is showing elevated burnout risk this week.`,
        };
      }
      return {
        intent,
        confidence,
        mode: 'heuristic',
        reply: `${risky.length} ${risky.length === 1 ? 'person needs' : 'people need'} attention in ${ctx.departmentName}:\n${risky.map((r) => `• ${r.name} — ${r.score}/100 (${r.riskLevel})`).join('\n')}`,
        data: { atRisk: risky },
        links: [{ label: 'Burnout & Morale', href: '/m/burnout' }],
      };
    }

    case 'task_status': {
      const t = ctx.lookupTask;
      if (!t) {
        return {
          intent,
          confidence: 0.6,
          mode: 'heuristic',
          reply:
            'I could not find that reference number. Task references look like REV/2026/0042 — try pasting the full reference.',
        };
      }
      return {
        intent,
        confidence,
        mode: 'heuristic',
        reply: `${t.refNo} — ${t.title}\nStatus: ${t.status.replace('_', ' ')}, assigned to ${t.assignee}. Due ${new Date(t.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}${t.isOverdue ? ' — currently overdue.' : '.'}`,
        data: { task: t },
        links: [{ label: `Open ${t.refNo}`, href: `/e/tasks?task=${t.id}` }],
      };
    }

    case 'create_reminder':
      return {
        intent,
        confidence,
        mode: 'heuristic',
        reply: `Reminder set — I will notify you about your ${ctx.dueToday} ${ctx.dueToday === 1 ? 'task' : 'tasks'} due today. You will see it in the notification bell.`,
        data: { scheduled: true, dueToday: ctx.dueToday },
      };

    case 'help':
    default:
      return {
        intent: intent === 'help' ? 'help' : 'fallback',
        confidence,
        mode: 'heuristic',
        reply: [
          intent === 'help'
            ? 'I answer questions using your live task data — I do not guess.'
            : `I did not follow that, ${first}. I answer from your live task data.`,
          '\nTry:',
          ...CAPABILITIES.map((c) => `• ${c}`),
        ].join('\n'),
        data: { capabilities: CAPABILITIES },
      };
  }
}
