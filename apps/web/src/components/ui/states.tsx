'use client';

import { AlertTriangle, Inbox, RefreshCw } from 'lucide-react';
import { Button } from './button';
import { cn } from '@/lib/utils';

/** Skeleton loader — every data fetch shows one of these, never a blank panel. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton h-4 w-full', className)} aria-hidden />;
}

export function SkeletonCard({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('gt-card p-4', className)} role="status" aria-label="Loading">
      <Skeleton className="mb-3 h-4 w-1/3" />
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className={cn('mb-2 h-3', i === rows - 1 && 'w-2/3')} />
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="p-4" role="status" aria-label="Loading table">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="mb-3 flex gap-3">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className={cn('h-3', c === 0 ? 'w-1/4' : 'flex-1')} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  body,
  icon,
  action,
  className,
}: {
  title: string;
  body?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-12 text-center', className)}>
      <div className="mb-3 grid h-11 w-11 place-items-center rounded-full bg-slate-100 text-slate-400">
        {icon ?? <Inbox className="h-5 w-5" aria-hidden />}
      </div>
      <p className="text-md font-medium text-slate-800">{title}</p>
      {body ? <p className="mt-1 max-w-sm text-sm text-slate-500">{body}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
  className,
}: {
  message?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-10 text-center', className)}>
      <div className="mb-3 grid h-11 w-11 place-items-center rounded-full bg-danger-soft text-danger">
        <AlertTriangle className="h-5 w-5" aria-hidden />
      </div>
      <p className="text-md font-medium text-slate-800">Something went wrong</p>
      <p className="mt-1 max-w-sm text-sm text-slate-500">
        {message ?? 'The request could not be completed.'}
      </p>
      {onRetry ? (
        <Button variant="secondary" size="sm" className="mt-4" onClick={onRetry}>
          <RefreshCw className="h-3.5 w-3.5" aria-hidden />
          Try again
        </Button>
      ) : null}
    </div>
  );
}
