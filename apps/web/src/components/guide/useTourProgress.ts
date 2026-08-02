'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Role } from '@smartwork/shared';

export type TourStatus = 'not-started' | 'in-progress' | 'done' | 'skipped';

export interface TourProgress {
  status: TourStatus;
  step: number;
  updatedAt: string;
}

const EMPTY: TourProgress = { status: 'not-started', step: 0, updatedAt: '' };

/**
 * Progress is per user AND per role, so an admin who also demos the employee
 * account is not told "you already did this" for a tour they have never seen.
 */
function storageKey(userId: string, role: Role): string {
  return `sw360:tour:${userId}:${role}`;
}

function read(userId: string, role: Role): TourProgress {
  if (typeof window === 'undefined' || !userId) return EMPTY;
  try {
    const raw = window.localStorage.getItem(storageKey(userId, role));
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<TourProgress>;
    return {
      status: (parsed.status as TourStatus) ?? 'not-started',
      step: typeof parsed.step === 'number' ? parsed.step : 0,
      updatedAt: parsed.updatedAt ?? '',
    };
  } catch {
    // Corrupt or unreadable storage must never break the app — the worst
    // outcome of returning EMPTY is that the user is offered the tour again.
    return EMPTY;
  }
}

export function useTourProgress(userId: string | undefined, role: Role | undefined) {
  const [progress, setProgress] = useState<TourProgress>(EMPTY);
  const [hydrated, setHydrated] = useState(false);

  // Read after mount only: touching localStorage during render would make the
  // server and client HTML disagree.
  useEffect(() => {
    if (!userId || !role) return;
    setProgress(read(userId, role));
    setHydrated(true);
  }, [userId, role]);

  const save = useCallback(
    (next: Partial<TourProgress>) => {
      if (!userId || !role || typeof window === 'undefined') return;
      setProgress((current) => {
        const merged: TourProgress = {
          status: next.status ?? current.status,
          step: next.step ?? current.step,
          updatedAt: new Date().toISOString(),
        };
        try {
          window.localStorage.setItem(storageKey(userId, role), JSON.stringify(merged));
        } catch {
          /* private browsing / quota — progress simply is not remembered */
        }
        return merged;
      });
    },
    [userId, role],
  );

  const reset = useCallback(() => {
    if (!userId || !role || typeof window === 'undefined') return;
    try {
      window.localStorage.removeItem(storageKey(userId, role));
    } catch {
      /* ignore */
    }
    setProgress(EMPTY);
  }, [userId, role]);

  return {
    progress,
    /** False until localStorage has been read — gate auto-opening modals on this. */
    hydrated,
    save,
    reset,
    /** The welcome modal should appear only if this role has never been offered it. */
    shouldOfferWelcome: hydrated && progress.status === 'not-started',
    /** A tour was abandoned part-way; offer to resume from `progress.step`. */
    canResume: hydrated && progress.status === 'in-progress' && progress.step > 0,
  };
}
