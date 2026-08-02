/**
 * Shared Recharts theme.
 *
 * Palette runs navy → teal → saffron → green, per the GovTrust design system.
 * No 3D, no gradients heavier than 8% opacity — this is a governance console, not
 * a marketing page.
 */
export const chartTheme = {
  primary: '#14417B',
  teal: '#0E7490',
  saffron: '#FF9933',
  green: '#0E7A3D',
  danger: '#B3261E',
  warning: '#B45309',
  violet: '#6D28D9',
  slate: '#94A3B8',
  grid: '#EEF2F7',
  axis: '#64748B',
  tooltip: {
    borderRadius: 8,
    border: '1px solid #E2E8F0',
    fontSize: 12,
    boxShadow: '0 8px 28px rgb(15 23 42 / 0.12)',
    padding: '8px 10px',
  } as React.CSSProperties,
};

/** Ordered categorical series colours. */
export const SERIES = [
  chartTheme.primary,
  chartTheme.teal,
  chartTheme.saffron,
  chartTheme.green,
  chartTheme.violet,
  chartTheme.warning,
];

export const STATUS_COLOR: Record<string, string> = {
  PENDING: chartTheme.slate,
  IN_PROGRESS: '#1D4ED8',
  UNDER_REVIEW: chartTheme.violet,
  COMPLETED: chartTheme.green,
  OVERDUE: chartTheme.danger,
};

export const PRIORITY_COLOR: Record<string, string> = {
  LOW: chartTheme.slate,
  MEDIUM: chartTheme.teal,
  HIGH: chartTheme.warning,
  CRITICAL: chartTheme.danger,
};

export const RISK_COLOR: Record<string, string> = {
  LOW: chartTheme.green,
  MODERATE: chartTheme.warning,
  HIGH: chartTheme.danger,
  CRITICAL: '#7F1D1D',
};

/** Interpolates white → danger for the SLA breach heatmap. */
export function heatColor(ratio: number): string {
  if (ratio <= 0) return '#F1F5F9';
  const clamped = Math.min(1, ratio);
  const alpha = 0.12 + clamped * 0.78;
  return `rgba(179, 38, 30, ${alpha.toFixed(2)})`;
}

export const formatHours = (h: number) => (h >= 48 ? `${(h / 24).toFixed(1)}d` : `${h.toFixed(0)}h`);
