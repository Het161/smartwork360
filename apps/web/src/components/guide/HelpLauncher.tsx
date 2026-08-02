'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as Dialog from '@radix-ui/react-dialog';
import { AnimatePresence, motion } from 'framer-motion';
import { Keyboard, MessageSquareText, RotateCcw, X } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import { useAuth } from '@/lib/auth';
import { useReducedMotion } from '@/lib/motion';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { SaarthiFace } from './SaarthiFace';
import { useGuide } from './GuideProvider';
import { TOUR_TARGETS } from './tours/targets';

const COPY = {
  en: {
    open: 'Open Saarthi help',
    take: 'Take the tour',
    restart: 'Restart tour',
    resume: 'Resume tour',
    ask: 'Ask Saarthi',
    keys: 'Keyboard shortcuts',
    keysTitle: 'Keyboard shortcuts',
    close: 'Close',
    resumeQ: 'Resume your tour?',
    resumeYes: 'Resume',
    dismiss: 'Dismiss',
    shortcuts: [
      ['→ / Next', 'Go to the next step'],
      ['←', 'Go back a step'],
      ['Esc', 'Leave the tour'],
      ['Tab', 'Move between controls'],
    ],
  },
  hi: {
    open: 'सारथी सहायता खोलें',
    take: 'टूर लें',
    restart: 'टूर फिर से शुरू करें',
    resume: 'टूर जारी रखें',
    ask: 'सारथी से पूछें',
    keys: 'कीबोर्ड शॉर्टकट',
    keysTitle: 'कीबोर्ड शॉर्टकट',
    close: 'बंद करें',
    resumeQ: 'टूर जारी रखें?',
    resumeYes: 'जारी रखें',
    dismiss: 'रहने दें',
    shortcuts: [
      ['→ / आगे', 'अगले चरण पर जाएँ'],
      ['←', 'पिछले चरण पर लौटें'],
      ['Esc', 'टूर छोड़ें'],
      ['Tab', 'नियंत्रणों के बीच जाएँ'],
    ],
  },
} as const;

const PULSE_LIMIT_KEY = 'sw360:tour:fab-pulses';

export function HelpLauncher() {
  const { lang } = useI18n();
  const { user } = useAuth();
  const { start, progress, canResume, isRunning } = useGuide();
  const reduced = useReducedMotion();
  const router = useRouter();

  const [keysOpen, setKeysOpen] = useState(false);
  const [showResume, setShowResume] = useState(false);
  const [pulse, setPulse] = useState(false);

  const t = COPY[lang];
  const untouched = progress.status === 'not-started' || progress.status === 'in-progress';

  /**
   * Nudge the button for the first three sessions only.
   *
   * A permanently pulsing help button is noise; three sessions is enough to be
   * noticed by someone who has not taken the tour, and then it goes quiet.
   */
  useEffect(() => {
    if (!untouched || typeof window === 'undefined') return;
    try {
      const seen = Number(window.sessionStorage.getItem(PULSE_LIMIT_KEY) ?? '0');
      const total = Number(window.localStorage.getItem(PULSE_LIMIT_KEY) ?? '0');
      if (!seen && total < 3) {
        window.sessionStorage.setItem(PULSE_LIMIT_KEY, '1');
        window.localStorage.setItem(PULSE_LIMIT_KEY, String(total + 1));
      }
      setPulse(total < 3);
    } catch {
      /* storage unavailable — simply do not pulse */
    }
  }, [untouched]);

  // Offer to pick up an abandoned tour, once, and never during one.
  useEffect(() => {
    if (canResume && !isRunning) {
      const timer = window.setTimeout(() => setShowResume(true), 1400);
      return () => window.clearTimeout(timer);
    }
    setShowResume(false);
  }, [canResume, isRunning]);

  if (!user) return null;

  return (
    <>
      {/* resume toast */}
      <AnimatePresence>
        {showResume && !isRunning ? (
          <motion.div
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: 12 }}
            className="fixed bottom-24 right-5 z-[55] flex items-center gap-3 rounded-card border border-borderx bg-white px-4 py-3 shadow-pop"
            role="status"
          >
            <SaarthiFace size={30} />
            <span className="text-sm font-medium text-slate-800">{t.resumeQ}</span>
            <Button
              size="sm"
              onClick={() => {
                setShowResume(false);
                start(progress.step);
              }}
            >
              {t.resumeYes}
            </Button>
            <button
              onClick={() => setShowResume(false)}
              aria-label={t.dismiss}
              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* the floating button */}
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            data-tour={TOUR_TARGETS.helpFab}
            aria-label={t.open}
            className={cn(
              'fixed bottom-5 right-5 z-[55] grid h-[52px] w-[52px] place-items-center rounded-full bg-primary shadow-pop transition-colors',
              'hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-saffron focus-visible:ring-offset-2',
              !reduced && 'animate-[float_3.5s_ease-in-out_infinite]',
              pulse && untouched && !reduced && 'ring-4 ring-saffron/40',
            )}
          >
            <SaarthiFace size={34} title="" />
          </button>
        </DropdownMenu.Trigger>

        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            side="top"
            sideOffset={10}
            className="z-[60] w-56 rounded-card border border-borderx bg-white p-1 shadow-pop"
          >
            <DropdownMenu.Item
              className="flex cursor-pointer items-center gap-2 rounded-[6px] px-3 py-2 text-sm text-slate-700 outline-none data-[highlighted]:bg-primary-50 data-[highlighted]:text-primary"
              onSelect={() => start()}
            >
              <RotateCcw className="h-4 w-4" aria-hidden />
              {progress.status === 'not-started' ? t.take : t.restart}
            </DropdownMenu.Item>

            {canResume ? (
              <DropdownMenu.Item
                className="flex cursor-pointer items-center gap-2 rounded-[6px] px-3 py-2 text-sm text-slate-700 outline-none data-[highlighted]:bg-primary-50 data-[highlighted]:text-primary"
                onSelect={() => start(progress.step)}
              >
                <SaarthiFace size={16} title="" />
                {t.resume}
              </DropdownMenu.Item>
            ) : null}

            {/* The chat assistant only exists on the employee surface. */}
            {user.role === 'EMPLOYEE' ? (
              <DropdownMenu.Item
                className="flex cursor-pointer items-center gap-2 rounded-[6px] px-3 py-2 text-sm text-slate-700 outline-none data-[highlighted]:bg-primary-50 data-[highlighted]:text-primary"
                onSelect={() => router.push('/e/assistant')}
              >
                <MessageSquareText className="h-4 w-4" aria-hidden />
                {t.ask}
              </DropdownMenu.Item>
            ) : null}

            <DropdownMenu.Separator className="my-1 h-px bg-borderx" />

            <DropdownMenu.Item
              className="flex cursor-pointer items-center gap-2 rounded-[6px] px-3 py-2 text-sm text-slate-700 outline-none data-[highlighted]:bg-slate-100"
              onSelect={() => setKeysOpen(true)}
            >
              <Keyboard className="h-4 w-4" aria-hidden />
              {t.keys}
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      {/* shortcuts dialog */}
      <Dialog.Root open={keysOpen} onOpenChange={setKeysOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[70] bg-slate-900/30" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-[71] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-card border border-borderx bg-white p-5 shadow-pop">
            <Dialog.Title className="text-md font-semibold text-slate-900">{t.keysTitle}</Dialog.Title>
            <Dialog.Description className="sr-only">{t.keysTitle}</Dialog.Description>
            <dl className="mt-3 divide-y divide-borderx">
              {t.shortcuts.map(([key, what]) => (
                <div key={key} className="flex items-center justify-between gap-4 py-2">
                  <dt>
                    <kbd className="rounded border border-borderx bg-slate-50 px-2 py-0.5 font-mono text-xs text-slate-700">
                      {key}
                    </kbd>
                  </dt>
                  <dd className="text-sm text-slate-600">{what}</dd>
                </div>
              ))}
            </dl>
            <Button className="mt-4 w-full" variant="secondary" onClick={() => setKeysOpen(false)}>
              {t.close}
            </Button>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
