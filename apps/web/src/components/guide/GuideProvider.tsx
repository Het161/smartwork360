'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { NextStep, NextStepProvider, useNextStep } from 'nextstepjs';
import { useNextAdapter } from 'nextstepjs/adapters/next';
import type { Step } from 'nextstepjs';

/**
 * NextStep's props are a discriminated union: supplying `cardComponent` narrows
 * `steps` to a variant whose steps drop `showControls`/`showSkip` (they only
 * affect the built-in card). That variant type is not exported from the package
 * root, so it is reconstructed here from the public `Step`.
 */
type TourWithCustomCard = {
  tour: string;
  steps: Omit<Step, 'showControls' | 'showSkip'>[];
};
import type { Role } from '@smartwork/shared';
import { useAuth } from '@/lib/auth';
import { useI18n, type Lang } from '@/i18n/provider';
import { useReducedMotion } from '@/lib/motion';
import { SaarthiCard } from './SaarthiCard';
import { useTourProgress, type TourProgress } from './useTourProgress';
import { TOUR_EVENTS, type TourEventName } from './tours/targets';
import { adminTour } from './tours/admin';
import { managerTour } from './tours/manager';
import { employeeTour } from './tours/employee';

export const TOUR_ID: Record<Role, string> = {
  ADMIN: 'admin-tour',
  MANAGER: 'manager-tour',
  EMPLOYEE: 'employee-tour',
};

interface GuideValue {
  /** Start the signed-in user's tour. Omit `fromStep` to restart from the beginning. */
  start: (fromStep?: number) => void;
  stop: () => void;
  progress: TourProgress;
  canResume: boolean;
  shouldOfferWelcome: boolean;
  /** Records the welcome modal outcome; `true` also starts the tour. */
  markWelcomeSeen: (started: boolean) => void;
  isRunning: boolean;
  role: Role | undefined;
}

const GuideContext = createContext<GuideValue | null>(null);

export function useGuide(): GuideValue {
  const ctx = useContext(GuideContext);
  if (!ctx) throw new Error('useGuide must be used inside <GuideProvider>');
  return ctx;
}

const buildTours = (lang: Lang): TourWithCustomCard[] => [adminTour(lang), managerTour(lang), employeeTour(lang)];

export function GuideProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextStepProvider>
      <GuideController>{children}</GuideController>
    </NextStepProvider>
  );
}

/**
 * Sits between NextStepProvider and NextStep so it can both *read* the tour
 * context (`useNextStep`) and *configure* the tour (`onComplete` / `onSkip`).
 * Those lifecycle callbacks are props of NextStep, but the progress state they
 * need lives here.
 */
function GuideController({ children }: { children: React.ReactNode }) {
  const { lang } = useI18n();
  const reduced = useReducedMotion();
  const { user } = useAuth();
  const role = user?.role;

  const {
    startNextStep,
    closeNextStep,
    setCurrentStep,
    currentStep,
    currentTour,
    isNextStepVisible,
  } = useNextStep();

  const { progress, hydrated, save, reset, shouldOfferWelcome, canResume } = useTourProgress(
    user?.id,
    role,
  );

  // Steps are rebuilt when the language changes, so a mid-tour EN↔हिंदी toggle
  // re-renders the current step in the other language at the same index.
  const tours = useMemo(() => buildTours(lang), [lang]);

  const [pendingStep, setPendingStep] = useState<number | null>(null);

  const start = useCallback(
    (fromStep = 0) => {
      if (!role) return;
      save({ status: 'in-progress', step: fromStep });
      startNextStep(TOUR_ID[role]);
      // startNextStep always begins at index 0, so a resume has to jump after.
      if (fromStep > 0) setPendingStep(fromStep);
    },
    [role, save, startNextStep],
  );

  useEffect(() => {
    if (pendingStep === null || !isNextStepVisible) return;
    const timer = window.setTimeout(() => {
      setCurrentStep(pendingStep);
      setPendingStep(null);
    }, 80);
    return () => window.clearTimeout(timer);
  }, [pendingStep, isNextStepVisible, setCurrentStep]);

  // Remember progress so a refresh mid-tour can offer to resume.
  useEffect(() => {
    if (!isNextStepVisible || !role || !currentTour) return;
    save({ status: 'in-progress', step: currentStep });
  }, [currentStep, isNextStepVisible, role, currentTour, save]);

  /**
   * Action steps: the card hides Next and the tour waits until the user performs
   * the real action, which dispatches one of `TOUR_EVENTS`.
   *
   * Listening globally keeps the tour a bolt-on — the app only announces that
   * something happened and knows nothing about tours.
   */
  const stepRef = useRef(currentStep);
  stepRef.current = currentStep;

  useEffect(() => {
    if (!isNextStepVisible) return;

    const advance = () => {
      // A beat so the user sees the result of their own action before the
      // spotlight moves on.
      window.setTimeout(() => setCurrentStep(stepRef.current + 1), 650);
    };

    const names = Object.values(TOUR_EVENTS) as TourEventName[];
    names.forEach((name) => window.addEventListener(name, advance));
    return () => names.forEach((name) => window.removeEventListener(name, advance));
  }, [isNextStepVisible, setCurrentStep]);

  const markWelcomeSeen = useCallback(
    (started: boolean) => {
      if (started) start(0);
      else save({ status: 'skipped', step: 0 });
    },
    [save, start],
  );

  const value = useMemo<GuideValue>(
    () => ({
      start: (fromStep?: number) => {
        if (fromStep === undefined) reset();
        start(fromStep ?? 0);
      },
      stop: closeNextStep,
      progress,
      canResume,
      shouldOfferWelcome: shouldOfferWelcome && hydrated,
      markWelcomeSeen,
      isRunning: isNextStepVisible,
      role,
    }),
    [
      start,
      closeNextStep,
      progress,
      canResume,
      shouldOfferWelcome,
      hydrated,
      markWelcomeSeen,
      isNextStepVisible,
      role,
      reset,
    ],
  );

  return (
    <NextStep
      steps={tours}
      cardComponent={SaarthiCard}
      navigationAdapter={useNextAdapter}
      shadowRgb="15, 23, 42"
      shadowOpacity="0.55"
      // The spotlight visibly morphs between targets; that continuity is what
      // makes a multi-step tour read as one explanation rather than N popups.
      cardTransition={reduced ? { duration: 0.15 } : { type: 'spring', stiffness: 210, damping: 24 }}
      scrollToTop={false}
      // The app shell has a sticky topbar that would otherwise cover a
      // freshly-scrolled-to target.
      disableConsoleLogs
      onComplete={() => save({ status: 'done' })}
      onSkip={(step) => save({ status: 'skipped', step })}
    >
      <GuideContext.Provider value={value}>{children}</GuideContext.Provider>
    </NextStep>
  );
}
