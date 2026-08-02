'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { pop, softSpring, spring, useReducedMotion } from '@/lib/motion';
import { cn } from '@/lib/utils';

/* ------------------------------------------------------------- progress */

export function StepProgress({ step, total, labels }: { step: number; total: number; labels: string[] }) {
  const pct = ((step - 1) / (total - 1)) * 100;

  return (
    <div className="mb-6">
      <div className="mb-2.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
        <motion.div
          className="h-full rounded-full bg-primary"
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={softSpring}
        />
      </div>
      <ol className="flex items-center justify-between">
        {labels.map((label, i) => {
          const index = i + 1;
          const done = index < step;
          const current = index === step;
          return (
            <li key={label} className="flex min-w-0 flex-col items-center gap-1">
              <motion.span
                animate={{ scale: current ? 1.08 : 1 }}
                transition={spring}
                className={cn(
                  'grid h-6 w-6 place-items-center rounded-full text-[11px] font-semibold transition-colors',
                  done
                    ? 'bg-success text-white'
                    : current
                      ? 'bg-primary text-white'
                      : 'bg-slate-100 text-slate-400',
                )}
              >
                <AnimatePresence mode="wait" initial={false}>
                  {done ? (
                    <motion.span
                      key="check"
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0, opacity: 0 }}
                      transition={pop}
                    >
                      <Check className="h-3.5 w-3.5" aria-hidden />
                    </motion.span>
                  ) : (
                    <motion.span key="num" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      {index}
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.span>
              <span
                className={cn(
                  'truncate text-[10px] font-medium sm:text-[11px]',
                  current ? 'text-primary' : done ? 'text-success' : 'text-slate-400',
                )}
              >
                {label}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="sr-only" aria-live="polite">
        Step {step} of {total}: {labels[step - 1]}
      </p>
    </div>
  );
}

/* ------------------------------------------------------- password meter */

export interface PasswordScore {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
}

/**
 * Length-weighted strength estimate. Not a substitute for the server's rules —
 * `signupSchema` is the authority; this only tells the user how they are doing.
 */
export function scorePassword(password: string): PasswordScore {
  if (!password) return { score: 0, label: '' };
  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password) && /[^A-Za-z0-9]/.test(password)) score += 1;

  const clamped = Math.min(4, score) as PasswordScore['score'];
  // Score 0 still gets a label. Typing something and seeing nothing happen reads
  // as a broken meter rather than as "this is not good enough yet".
  const labels = ['Too short', 'Weak', 'Theek-thaak', 'Good', 'Strong'];
  return { score: clamped, label: labels[clamped] };
}

export function PasswordMeter({ password }: { password: string }) {
  const { score, label } = scorePassword(password);
  // No password typed yet -> no meter at all.
  if (!password) return <div className="mt-2 h-[26px]" />;
  const colour = ['bg-slate-200', 'bg-danger', 'bg-warning', 'bg-[#65A30D]', 'bg-success'][score];
  const text = ['text-danger', 'text-danger', 'text-warning', 'text-[#4D7C0F]', 'text-success'][score];

  return (
    <div className="mt-2">
      <div className="flex gap-1.5">
        {[1, 2, 3, 4].map((seg) => (
          <div key={seg} className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
            <motion.div
              className={cn('h-full rounded-full', colour)}
              initial={false}
              animate={{ scaleX: score >= seg ? 1 : 0 }}
              style={{ originX: 0 }}
              transition={{ ...spring, delay: score >= seg ? (seg - 1) * 0.05 : 0 }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 h-4">
        <AnimatePresence mode="wait" initial={false}>
          {label ? (
            <motion.p
              key={label}
              initial={{ opacity: 0, y: 3 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -3 }}
              transition={{ duration: 0.15 }}
              className={cn('text-xs font-medium', text)}
            >
              {label}
            </motion.p>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}

/* --------------------------------------------------------- resend timer */

export function ResendRing({
  seconds,
  total,
  onResend,
  busy,
}: {
  seconds: number;
  total: number;
  onResend: () => void;
  busy?: boolean;
}) {
  const ready = seconds <= 0;
  const radius = 13;
  const circumference = 2 * Math.PI * radius;
  const progress = total > 0 ? (total - seconds) / total : 1;

  return (
    <button
      type="button"
      onClick={onResend}
      disabled={!ready || busy}
      className={cn(
        'inline-flex items-center gap-2 rounded-btn px-3 py-1.5 text-sm font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        ready ? 'text-primary hover:bg-primary-50' : 'cursor-not-allowed text-slate-400',
      )}
    >
      <span className="relative grid h-7 w-7 place-items-center">
        <svg width="30" height="30" viewBox="0 0 30 30" className="-rotate-90">
          <circle cx="15" cy="15" r={radius} fill="none" stroke="#E2E8F0" strokeWidth="2" />
          <motion.circle
            cx="15"
            cy="15"
            r={radius}
            fill="none"
            stroke={ready ? '#14417B' : '#94A3B8'}
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={false}
            animate={{ strokeDashoffset: circumference * (1 - progress) }}
            transition={{ duration: 0.9, ease: 'linear' }}
          />
        </svg>
        {!ready ? (
          <span className="absolute text-[10px] font-semibold tabular-nums text-slate-500">{seconds}</span>
        ) : null}
      </span>
      {busy ? 'Sending…' : ready ? 'Resend code' : 'Resend available in'}
    </button>
  );
}

/** Counts down once per second and stops at zero. */
export function useCountdown(initial: number) {
  const [seconds, setSeconds] = useState(initial);

  useEffect(() => {
    if (seconds <= 0) return;
    const timer = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [seconds]);

  return [seconds, setSeconds] as const;
}

/* ------------------------------------------------------------- success */

export function SuccessCheck() {
  const reduced = useReducedMotion();

  return (
    <motion.div
      className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-success-soft"
      initial={reduced ? { opacity: 0 } : { scale: 0 }}
      animate={reduced ? { opacity: 1 } : { scale: 1 }}
      transition={reduced ? { duration: 0.2 } : { ...spring, delay: 0.05 }}
    >
      <svg width="44" height="44" viewBox="0 0 44 44" fill="none" aria-hidden>
        <circle cx="22" cy="22" r="20" fill="#0E7A3D" />
        <motion.path
          d="M13 22.5 L19.5 29 L31 17"
          stroke="#FFFFFF"
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          initial={reduced ? { pathLength: 1 } : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={reduced ? { duration: 0 } : { duration: 0.6, delay: 0.25, ease: 'easeOut' }}
        />
      </svg>
    </motion.div>
  );
}

/** Three dots that pulse in sequence — "we are waiting on someone else". */
export function WaitingDots() {
  const reduced = useReducedMotion();
  if (reduced) return <span className="text-slate-400">…</span>;

  return (
    <span className="inline-flex items-center gap-1" aria-hidden>
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-warning"
          animate={{ opacity: [0.25, 1, 0.25] }}
          transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.2, ease: 'easeInOut' }}
        />
      ))}
    </span>
  );
}

/* --------------------------------------------------------- ambient orbs */

/** Slow drifting gradient orbs on the left panel. Suppressed under reduced motion. */
export function AmbientOrbs() {
  const reduced = useReducedMotion();
  if (reduced) return null;

  const orbs = [
    { size: 380, color: 'rgba(14,116,144,0.10)', x: '-10%', y: '5%', dur: 26, dx: 40, dy: 30 },
    { size: 300, color: 'rgba(255,153,51,0.08)', x: '55%', y: '45%', dur: 32, dx: -50, dy: -35 },
    { size: 340, color: 'rgba(255,255,255,0.06)', x: '20%', y: '65%', dur: 38, dx: 35, dy: -45 },
  ];

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {orbs.map((orb, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full blur-3xl"
          style={{
            width: orb.size,
            height: orb.size,
            left: orb.x,
            top: orb.y,
            background: orb.color,
          }}
          animate={{ x: [0, orb.dx, 0], y: [0, orb.dy, 0] }}
          transition={{ duration: orb.dur, repeat: Infinity, ease: 'easeInOut' }}
        />
      ))}
    </div>
  );
}

/**
 * A step heading that takes focus when it mounts.
 *
 * Focusing from the parent on a `step` change does not work: with
 * `AnimatePresence mode="wait"` the outgoing step is still animating out, so the
 * incoming heading has not mounted yet and the ref is still null. Each heading
 * therefore focuses itself, which happens at exactly the right moment.
 *
 * Without this a keyboard or screen-reader user is left focused on the body after
 * every transition and has to tab from the top of the page again.
 */
export function StepHeading({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    // preventScroll: the card is already in view; scrolling would jolt the layout.
    ref.current?.focus({ preventScroll: true });
  }, []);

  return (
    <h1
      ref={ref}
      tabIndex={-1}
      className={cn('text-xl font-semibold text-slate-900 focus-visible:outline-none', className)}
    >
      {children}
    </h1>
  );
}
