import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium',
  {
    variants: {
      tone: {
        slate: 'border-slate-200 bg-slate-50 text-slate-700',
        blue: 'border-blue-200 bg-info-soft text-info',
        violet: 'border-violet-200 bg-violetx-soft text-violetx',
        green: 'border-green-200 bg-success-soft text-success',
        red: 'border-red-200 bg-danger-soft text-danger',
        amber: 'border-amber-200 bg-warning-soft text-warning',
        // Saffron is used only for small chips, never body text on white.
        saffron: 'border-[#FFD9AC] bg-saffron-soft text-saffron-deep',
        teal: 'border-cyan-200 bg-teal-soft text-teal',
      },
    },
    defaultVariants: { tone: 'slate' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

export { badgeVariants };
