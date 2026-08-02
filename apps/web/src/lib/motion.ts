'use client';

import { useEffect, useState } from 'react';
import type { Transition, Variants } from 'framer-motion';

/**
 * Motion tokens.
 *
 * Every animation in the signup flow is gated on `prefers-reduced-motion`. That is
 * a WCAG 2.1 requirement, not a nicety — vestibular disorders make large sliding
 * motion genuinely unpleasant. Reduced mode keeps opacity crossfades (which convey
 * the same "something changed" signal) and drops movement, the ambient orbs and
 * the confetti entirely.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(query.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  return reduced;
}

export const spring: Transition = { type: 'spring', stiffness: 380, damping: 30 };
export const softSpring: Transition = { type: 'spring', stiffness: 220, damping: 26 };
export const pop: Transition = { type: 'spring', stiffness: 520, damping: 18 };

/** Step transitions: slide in the direction of travel, fade both ways. */
export function stepVariants(reduced: boolean): Variants {
  if (reduced) {
    return {
      enter: { opacity: 0 },
      center: { opacity: 1, transition: { duration: 0.18 } },
      exit: { opacity: 0, transition: { duration: 0.12 } },
    };
  }
  return {
    enter: (direction: number) => ({ x: direction >= 0 ? 40 : -40, opacity: 0 }),
    center: { x: 0, opacity: 1, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] } },
    exit: (direction: number) => ({
      x: direction >= 0 ? -40 : 40,
      opacity: 0,
      transition: { duration: 0.2, ease: 'easeIn' },
    }),
  };
}

export function listContainer(reduced: boolean): Variants {
  return {
    hidden: {},
    show: { transition: { staggerChildren: reduced ? 0 : 0.06 } },
  };
}

export function listItem(reduced: boolean): Variants {
  return reduced
    ? { hidden: { opacity: 0 }, show: { opacity: 1 } }
    : { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: softSpring } };
}

/** Error shake. Skipped under reduced motion — the red border carries the message. */
export const shakeKeyframes = { x: [-8, 8, -6, 6, -3, 0] };
