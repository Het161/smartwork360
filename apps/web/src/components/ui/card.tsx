import * as React from 'react';
import { cn } from '@/lib/utils';

export const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('gt-card', className)} {...props} />
  ),
);
Card.displayName = 'Card';

export function CardHeader({
  title,
  hint,
  action,
  className,
  icon,
}: {
  title: React.ReactNode;
  hint?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className={cn('flex items-start justify-between gap-3 border-b border-borderx px-4 py-3', className)}>
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 text-md font-semibold text-slate-900">
          {icon}
          {title}
        </h2>
        {hint ? <p className="mt-0.5 text-sm text-slate-500">{hint}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function CardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-4', className)} {...props} />;
}
