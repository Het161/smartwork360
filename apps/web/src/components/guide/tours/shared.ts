import type { Step, Tour } from 'nextstepjs';
import type { Role } from '@smartwork/shared';
import type { Lang } from '@/i18n/provider';
import { TOUR_TARGETS, tourSelector, type TourEventName, type TourTargetKey } from './targets';

export type SaarthiPose = 'idle' | 'wave' | 'point-left' | 'point-right' | 'celebrate' | 'sleep';

/**
 * Per-step data that NextStep's `Step` type has no room for (mascot pose, the
 * event an action step waits on, which role it belongs to).
 *
 * Kept in a side registry keyed by tour id rather than smuggled inside
 * `content`: reading custom props back off a rendered ReactNode is fragile, and
 * this stays fully typed.
 */
export interface StepMeta {
  pose: SaarthiPose;
  /** When set, the card hides Next and waits for this event. */
  action?: TourEventName;
  role: Role;
  /** Final step — triggers the confetti burst. */
  finish?: boolean;
  /**
   * Mirrored from the Step so the ACTION path can navigate too.
   *
   * NextStep only performs `nextRoute` inside its own Next button handler, and
   * its context exposes no equivalent method. An action step advances through
   * `setCurrentStep`, which skips that handler — so a step with both an action
   * and a nextRoute would move to the next index while leaving the user on the
   * old page, pointing at a target that only exists on the new one.
   */
  nextRoute?: string;
}

const registry = new Map<string, StepMeta[]>();

export function registerMeta(tourId: string, metas: StepMeta[]): void {
  registry.set(tourId, metas);
}

export function getStepMeta(tourId: string | null, index: number): StepMeta | undefined {
  if (!tourId) return undefined;
  return registry.get(tourId)?.[index];
}

export interface StepDef {
  /** Omit for a centred step with no highlight (welcome / finish). */
  target?: TourTargetKey;
  side?: Step['side'];
  en: { title: string; body: string };
  hi: { title: string; body: string };
  pose?: SaarthiPose;
  action?: TourEventName;
  nextRoute?: string;
  prevRoute?: string;
  finish?: boolean;
}

/**
 * Turns bilingual step definitions into a NextStep `Tour`, and registers the
 * metadata the card needs.
 *
 * `selectorRetryAttempts` matters for the cross-page steps: after `nextRoute`
 * navigates, the target element does not exist until the new page has rendered
 * and its data has loaded. 15 attempts × 200 ms gives the dashboard up to three
 * seconds to paint before the step is considered missing.
 */
export function buildTour(
  tourId: string,
  role: Role,
  lang: Lang,
  defs: StepDef[],
): Tour {
  registerMeta(
    tourId,
    defs.map((d) => ({
      pose: d.pose ?? 'idle',
      action: d.action,
      role,
      finish: d.finish,
      nextRoute: d.nextRoute,
    })),
  );

  const steps: Step[] = defs.map((d) => {
    const copy = lang === 'hi' ? d.hi : d.en;
    return {
      title: copy.title,
      content: copy.body,
      selector: d.target ? tourSelector(d.target) : undefined,
      side: d.side ?? 'bottom',
      nextRoute: d.nextRoute,
      prevRoute: d.prevRoute,
      selectorRetryAttempts: 15,
      selectorRetryDelay: 200,
      // Clearance for the sticky topbar when a target is scrolled into view.
      scrollOffset: 96,
      pointerPadding: 8,
      pointerRadius: 10,
      // Action steps must let the user actually click the highlighted thing.
      disableInteraction: false,
    };
  });

  return { tour: tourId, steps };
}

export { TOUR_TARGETS };
