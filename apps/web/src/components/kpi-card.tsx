'use client';

import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from './ui/states';

export function KpiCard({
  label,
  value,
  suffix,
  hint,
  deltaPct,
  /** true when a falling number is the good outcome (overdue, cycle time). */
  invertDelta,
  tone = 'default',
  icon,
  loading,
}: {
  label: string;
  value: number | string;
  suffix?: string;
  hint?: string;
  deltaPct?: number;
  invertDelta?: boolean;
  tone?: 'default' | 'danger' | 'warning' | 'success';
  icon?: React.ReactNode;
  loading?: boolean;
}) {
  const toneRing = {
    default: '',
    danger: 'border-l-[3px] border-l-danger',
    warning: 'border-l-[3px] border-l-warning',
    success: 'border-l-[3px] border-l-success',
  }[tone];

  if (loading) {
    return (
      <div className="gt-card p-4">
        <Skeleton className="mb-3 h-3 w-24" />
        <Skeleton className="h-7 w-16" />
      </div>
    );
  }

  const positive = deltaPct !== undefined && (invertDelta ? deltaPct < 0 : deltaPct > 0);
  const negative = deltaPct !== undefined && (invertDelta ? deltaPct > 0 : deltaPct < 0);
  const DeltaIcon = deltaPct === undefined || deltaPct === 0 ? Minus : positive ? ArrowUpRight : ArrowDownRight;

  return (
    <div className={cn('gt-card p-4', toneRing)}>
      <div className="flex items-start justify-between gap-2">
        <p className="gt-label">{label}</p>
        {icon ? <span className="text-slate-400">{icon}</span> : null}
      </div>
      <p className="kpi-value mt-2 text-3xl font-semibold leading-none text-slate-900">
        {value}
        {suffix ? <span className="ml-0.5 text-lg font-medium text-slate-500">{suffix}</span> : null}
      </p>
      {deltaPct !== undefined ? (
        <p
          className={cn(
            'mt-2 inline-flex items-center gap-1 text-sm font-medium',
            positive && 'text-success',
            negative && 'text-danger',
            !positive && !negative && 'text-slate-500',
          )}
        >
          <DeltaIcon className="h-3.5 w-3.5" aria-hidden />
          {Math.abs(deltaPct).toFixed(1)}%
          {hint ? <span className="font-normal text-slate-500">{hint}</span> : null}
        </p>
      ) : hint ? (
        <p className="mt-2 text-sm text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
}

export function KpiGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('grid gap-4 sm:grid-cols-2 xl:grid-cols-4', className)}>{children}</div>
  );
}
