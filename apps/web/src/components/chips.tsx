'use client';

import type { Priority, RiskLevel, SentimentLabel, TaskStatus } from '@smartwork/shared';
import { AlertTriangle, Clock, Frown, Meh, Smile } from 'lucide-react';
import { Badge } from './ui/badge';
import { useI18n } from '@/i18n/provider';
import { cn } from '@/lib/utils';

const STATUS_TONE = {
  PENDING: 'slate',
  IN_PROGRESS: 'blue',
  UNDER_REVIEW: 'violet',
  COMPLETED: 'green',
} as const;

export function StatusChip({ status, className }: { status: TaskStatus; className?: string }) {
  const { t } = useI18n();
  return (
    <Badge tone={STATUS_TONE[status]} className={className}>
      {t.status[status]}
    </Badge>
  );
}

const PRIORITY_TONE = {
  LOW: 'slate',
  MEDIUM: 'teal',
  HIGH: 'amber',
  CRITICAL: 'red',
} as const;

export function PriorityChip({ priority, className }: { priority: Priority; className?: string }) {
  const { t } = useI18n();
  return (
    <Badge tone={PRIORITY_TONE[priority]} className={className}>
      {t.priority[priority]}
    </Badge>
  );
}

const RISK_TONE = {
  LOW: 'green',
  MODERATE: 'amber',
  HIGH: 'red',
  CRITICAL: 'red',
} as const;

export function RiskChip({ level, className }: { level: RiskLevel; className?: string }) {
  const { t } = useI18n();
  return (
    <Badge tone={RISK_TONE[level]} className={cn(level === 'CRITICAL' && 'font-semibold', className)}>
      {t.risk[level]}
    </Badge>
  );
}

/**
 * SLA countdown chip.
 *  > 24h remaining → green
 *  < 24h remaining → amber
 *  breached        → red, with a subtle pulse
 */
export function SlaChip({
  hoursRemaining,
  isOverdue,
  className,
}: {
  hoursRemaining: number;
  isOverdue: boolean;
  className?: string;
}) {
  const { t } = useI18n();

  if (isOverdue) {
    const h = Math.abs(Math.round(hoursRemaining));
    return (
      <Badge
        tone="red"
        className={cn('animate-pulse-danger', className)}
        title={`${t.status.OVERDUE} — ${formatDuration(h)} ${t.employee.breachedBy}`}
      >
        <AlertTriangle className="h-3 w-3" aria-hidden />
        {formatDuration(h)} {t.employee.breachedBy}
      </Badge>
    );
  }

  const h = Math.round(hoursRemaining);
  return (
    <Badge tone={h < 24 ? 'amber' : 'green'} className={className}>
      <Clock className="h-3 w-3" aria-hidden />
      {formatDuration(h)} {t.employee.remaining}
    </Badge>
  );
}

function formatDuration(hours: number): string {
  if (hours < 1) return '<1h';
  if (hours < 48) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

export function SentimentChip({
  label,
  score,
  className,
}: {
  label: SentimentLabel;
  score: number;
  className?: string;
}) {
  const tone = label === 'POSITIVE' ? 'green' : label === 'NEGATIVE' ? 'red' : 'slate';
  const Icon = label === 'POSITIVE' ? Smile : label === 'NEGATIVE' ? Frown : Meh;
  return (
    <Badge tone={tone} className={className} title={`Sentiment score ${score.toFixed(2)}`}>
      <Icon className="h-3 w-3" aria-hidden />
      {score > 0 ? '+' : ''}
      {score.toFixed(2)}
    </Badge>
  );
}

const BAND_TONE = {
  LIGHT: 'slate',
  BALANCED: 'green',
  HEAVY: 'amber',
  OVERLOADED: 'red',
} as const;

export function LoadChip({ band }: { band: keyof typeof BAND_TONE }) {
  return <Badge tone={BAND_TONE[band]}>{band.charAt(0) + band.slice(1).toLowerCase()}</Badge>;
}
