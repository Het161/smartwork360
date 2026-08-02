'use client';

import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useNextStep } from 'nextstepjs';
import type { CardComponentProps } from 'nextstepjs';
import { ArrowLeft, ArrowRight, Hand } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import { useReducedMotion } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { Saarthi } from './SaarthiLazy';
import { getStepMeta } from './tours/shared';

const ROLE_LABEL: Record<string, { en: string; hi: string }> = {
  ADMIN: { en: 'Administrator', hi: 'प्रशासक' },
  MANAGER: { en: 'Manager', hi: 'प्रबंधक' },
  EMPLOYEE: { en: 'Employee', hi: 'कर्मचारी' },
};

const COPY = {
  en: {
    step: 'STEP',
    of: 'OF',
    back: 'Back',
    next: 'Next',
    finish: 'Finish',
    skip: 'Skip tour',
    tryIt: 'Try it yourself to continue',
  },
  hi: {
    step: 'चरण',
    of: '/',
    back: 'पीछे',
    next: 'आगे',
    finish: 'समाप्त',
    skip: 'टूर छोड़ें',
    tryIt: 'आगे बढ़ने के लिए खुद करके देखें',
  },
};

export function SaarthiCard({
  step,
  currentStep,
  totalSteps,
  nextStep,
  prevStep,
  skipTour,
  arrow,
}: CardComponentProps) {
  const { lang, setLang } = useI18n();
  const reduced = useReducedMotion();
  const { currentTour } = useNextStep();
  const cardRef = useRef<HTMLDivElement>(null);

  const t = COPY[lang];
  const meta = getStepMeta(currentTour, currentStep);
  const isAction = Boolean(meta?.action);
  const isLast = currentStep === totalSteps - 1;
  const role = meta?.role ?? 'EMPLOYEE';

  // The mascot leans toward the thing being explained: the card sits opposite
  // the target, so pointing "back at" the card's own side points at the target.
  const pose = meta?.pose ?? 'idle';

  /**
   * Focus management.
   *
   * The tour is a dialog: focus moves into the card on every step so keyboard
   * and screen-reader users follow the same path as everyone else, and Escape
   * always gets them out.
   */
  useEffect(() => {
    const timer = window.setTimeout(() => cardRef.current?.focus({ preventScroll: true }), 60);
    return () => window.clearTimeout(timer);
  }, [currentStep]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        skipTour?.();
      } else if (e.key === 'ArrowRight' && !isAction && !isLast) {
        e.preventDefault();
        nextStep();
      } else if (e.key === 'ArrowLeft' && currentStep > 0) {
        e.preventDefault();
        prevStep();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [skipTour, nextStep, prevStep, isAction, isLast, currentStep]);

  // Fire the celebration once, on the final step.
  useEffect(() => {
    if (!meta?.finish || reduced) return;
    let cancelled = false;
    void import('canvas-confetti').then(({ default: confetti }) => {
      if (cancelled) return;
      confetti({
        particleCount: 110,
        spread: 74,
        startVelocity: 40,
        ticks: 200,
        origin: { x: 0.5, y: 0.7 },
        colors: ['#FF9933', '#FFFFFF', '#138808'],
        disableForReducedMotion: true,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [meta?.finish, reduced]);

  const progressPct = ((currentStep + 1) / totalSteps) * 100;

  return (
    <motion.div
      ref={cardRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="false"
      aria-label={`${t.step} ${currentStep + 1} ${t.of} ${totalSteps}: ${step.title}`}
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 14, rotateX: 8 }}
      animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0, rotateX: 0 }}
      transition={reduced ? { duration: 0.15 } : { type: 'spring', stiffness: 260, damping: 26 }}
      style={{ perspective: 800 }}
      className="relative w-[340px] max-w-[calc(100vw-2rem)] rounded-xl border border-borderx bg-white shadow-pop focus-visible:outline-none"
    >
      {/* Saarthi peeking over the top-left corner */}
      <div className="pointer-events-none absolute -left-6 -top-12 z-10">
        <Saarthi pose={pose} size="sm" />
      </div>

      {/* progress */}
      <div className="h-1 overflow-hidden rounded-t-xl bg-slate-100">
        <motion.div
          className="h-full bg-primary"
          initial={false}
          animate={{ width: `${progressPct}%` }}
          transition={reduced ? { duration: 0.15 } : { type: 'spring', stiffness: 200, damping: 26 }}
        />
      </div>

      <div className="p-4 pl-5">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            {t.step} {currentStep + 1} {t.of} {totalSteps}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="flex items-center rounded-full border border-borderx p-0.5">
              {(['en', 'hi'] as const).map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => setLang(code)}
                  aria-pressed={lang === code}
                  aria-label={code === 'en' ? 'English' : 'हिंदी'}
                  className={cn(
                    'rounded-full px-1.5 py-0.5 text-[9px] font-semibold transition-colors',
                    lang === code ? 'bg-primary text-white' : 'text-slate-500 hover:bg-slate-100',
                  )}
                >
                  {code === 'en' ? 'EN' : 'हि'}
                </button>
              ))}
            </span>
            <span className="rounded-full bg-primary-50 px-2 py-0.5 text-[10px] font-semibold text-primary">
              {lang === 'hi' ? ROLE_LABEL[role].hi : ROLE_LABEL[role].en}
            </span>
          </span>
        </div>

        <h2 className="text-[15px] font-bold leading-snug text-primary">{step.title}</h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-slate-600">{step.content}</p>

        {isAction ? (
          <p className="mt-3 flex items-start gap-2 rounded-btn border border-warning/40 bg-warning-soft px-2.5 py-2 text-[12px] font-medium text-warning">
            <Hand className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            {t.tryIt}
          </p>
        ) : null}

        <div className="mt-4 flex items-center gap-2">
          {currentStep > 0 ? (
            <button
              onClick={prevStep}
              className="inline-flex items-center gap-1 rounded-btn px-2.5 py-1.5 text-[12px] font-medium text-slate-600 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
              {t.back}
            </button>
          ) : null}

          {/* An action step has no Next — doing the thing is what advances it. */}
          {!isAction ? (
            <button
              onClick={nextStep}
              className={cn(
                'inline-flex items-center gap-1 rounded-btn bg-primary px-3.5 py-1.5 text-[12px] font-semibold text-white transition-colors',
                'hover:bg-saffron hover:text-[#5C2E00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1',
              )}
            >
              {isLast ? t.finish : t.next}
              {!isLast ? <ArrowRight className="h-3.5 w-3.5" aria-hidden /> : null}
            </button>
          ) : null}

          <button
            onClick={skipTour}
            className="ml-auto rounded px-1.5 py-1 text-[11px] text-slate-400 underline-offset-2 transition-colors hover:text-slate-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {t.skip}
          </button>
        </div>
      </div>

      {/* Announced to screen readers on every step change. */}
      <p className="sr-only" aria-live="polite">
        {t.step} {currentStep + 1} {t.of} {totalSteps}: {step.title}. {step.content}
      </p>

      {arrow}
    </motion.div>
  );
}
