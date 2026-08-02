import * as React from 'react';
import { cn } from '@/lib/utils';

export const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    // min-w-0: cards are grid/flex items, and the default `min-width: auto`
    // lets a wide child (our tables set min-w-[720px]) stretch the card past
    // the viewport instead of scrolling inside its own overflow-x container.
    // Without this the whole page scrolls sideways on a phone.
    <div ref={ref} className={cn('gt-card min-w-0', className)} {...props} />
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
    <div className={cn('flex flex-wrap items-start justify-between gap-3 border-b border-borderx px-4 py-3', className)}>
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 text-md font-semibold text-slate-900">
          {icon}
          {title}
        </h2>
        {hint ? <p className="mt-0.5 text-sm text-slate-500">{hint}</p> : null}
      </div>
      {/* flex-wrap above + max-w-full here: filter bars in this slot hold several
        selects, and shrink-0 alone pushed them past the viewport on a phone.
        Now the whole action group drops to its own line instead. */}
      {action ? <div className="max-w-full shrink-0">{action}</div> : null}
    </div>
  );
}

export function CardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-4', className)} {...props} />;
}
