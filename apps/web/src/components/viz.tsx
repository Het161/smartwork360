'use client';

import type { RiskLevel, SentimentLabel } from '@smartwork/shared';
import { ArrowDown, ArrowRight, ArrowUp } from 'lucide-react';
import { RISK_COLOR, chartTheme } from '@/lib/charts';
import { cn } from '@/lib/utils';

/**
 * Donut ring for a single percentage (SLA compliance).
 * Hand-drawn SVG rather than a chart library — one value does not need Recharts,
 * and this stays crisp at any size.
 */
export function Ring({
  value,
  label,
  sublabel,
  size = 132,
  stroke = 12,
  color,
}: {
  value: number;
  label?: string;
  sublabel?: string;
  size?: number;
  stroke?: number;
  color?: string;
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, value));
  const dash = (clamped / 100) * circumference;

  const tone =
    color ?? (clamped >= 85 ? chartTheme.green : clamped >= 65 ? chartTheme.warning : chartTheme.danger);

  return (
    <div className="relative inline-grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" role="img" aria-label={`${label ?? 'Value'}: ${clamped}%`}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#EEF2F7" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={tone}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference - dash}`}
          className="transition-all duration-500"
        />
      </svg>
      <div className="absolute text-center">
        <p className="kpi-value text-2xl font-semibold leading-none text-slate-900">
          {clamped}
          <span className="text-base text-slate-500">%</span>
        </p>
        {sublabel ? <p className="mt-1 text-xs text-slate-500">{sublabel}</p> : null}
      </div>
    </div>
  );
}

/**
 * Morale gauge — a −1…+1 sentiment score on a semicircular dial.
 * The needle position is the honest score; the colour band tells you how to read it.
 */
export function MoraleGauge({
  score,
  label,
  delta,
  size = 190,
}: {
  score: number;
  label: SentimentLabel;
  delta: number;
  size?: number;
}) {
  const clamped = Math.max(-1, Math.min(1, score));
  // Map −1…+1 onto a 180° sweep starting from the left.
  const angle = ((clamped + 1) / 2) * 180;
  const radius = size / 2 - 14;
  const cx = size / 2;
  const cy = size / 2;

  const needleRad = ((180 - angle) * Math.PI) / 180;
  const nx = cx + Math.cos(needleRad) * (radius - 10);
  const ny = cy - Math.sin(needleRad) * (radius - 10);

  const arc = (from: number, to: number) => {
    const a1 = ((180 - from) * Math.PI) / 180;
    const a2 = ((180 - to) * Math.PI) / 180;
    return `M ${cx + Math.cos(a1) * radius} ${cy - Math.sin(a1) * radius} A ${radius} ${radius} 0 0 1 ${cx + Math.cos(a2) * radius} ${cy - Math.sin(a2) * radius}`;
  };

  const tone =
    label === 'POSITIVE' ? chartTheme.green : label === 'NEGATIVE' ? chartTheme.danger : chartTheme.warning;
  const DeltaIcon = delta > 0.02 ? ArrowUp : delta < -0.02 ? ArrowDown : ArrowRight;

  return (
    <div className="flex flex-col items-center">
      <svg
        width={size}
        height={size / 2 + 16}
        role="img"
        aria-label={`Team morale ${score.toFixed(2)} (${label})`}
      >
        <path d={arc(0, 60)} fill="none" stroke={chartTheme.danger} strokeWidth={11} strokeLinecap="round" opacity={0.85} />
        <path d={arc(62, 118)} fill="none" stroke={chartTheme.warning} strokeWidth={11} opacity={0.85} />
        <path d={arc(120, 180)} fill="none" stroke={chartTheme.green} strokeWidth={11} strokeLinecap="round" opacity={0.85} />
        <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="#0F172A" strokeWidth={2.5} strokeLinecap="round" />
        <circle cx={cx} cy={cy} r={5} fill="#0F172A" />
      </svg>

      <p className="kpi-value -mt-1 text-2xl font-semibold" style={{ color: tone }}>
        {score > 0 ? '+' : ''}
        {score.toFixed(2)}
      </p>
      <p className="mt-0.5 flex items-center gap-1 text-sm text-slate-500">
        <DeltaIcon
          className={cn(
            'h-3.5 w-3.5',
            delta > 0.02 ? 'text-success' : delta < -0.02 ? 'text-danger' : 'text-slate-400',
          )}
          aria-hidden
        />
        {delta > 0 ? '+' : ''}
        {delta.toFixed(2)} vs previous week
      </p>
    </div>
  );
}

/** Compact 0–100 burnout dial used on the member cards. */
export function ScoreDial({
  score,
  riskLevel,
  size = 76,
}: {
  score: number;
  riskLevel: RiskLevel;
  size?: number;
}) {
  const stroke = 8;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = (Math.min(100, score) / 100) * circumference;

  return (
    <div className="relative inline-grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" role="img" aria-label={`Burnout score ${score} of 100, ${riskLevel}`}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#EEF2F7" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={RISK_COLOR[riskLevel]}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference - dash}`}
        />
      </svg>
      <span className="kpi-value absolute text-lg font-semibold text-slate-900">{score}</span>
    </div>
  );
}

/** Horizontal load bar; colour encodes the band. */
export function LoadBar({
  value,
  max,
  band,
}: {
  value: number;
  max: number;
  band: 'LIGHT' | 'BALANCED' | 'HEAVY' | 'OVERLOADED';
}) {
  const colour = {
    LIGHT: chartTheme.slate,
    BALANCED: chartTheme.green,
    HEAVY: chartTheme.warning,
    OVERLOADED: chartTheme.danger,
  }[band];

  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${max > 0 ? Math.min(100, (value / max) * 100) : 0}%`, background: colour }}
      />
    </div>
  );
}
