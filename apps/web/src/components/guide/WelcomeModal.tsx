'use client';

import { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { motion } from 'framer-motion';
import { PlayCircle } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import { useAuth } from '@/lib/auth';
import { useReducedMotion } from '@/lib/motion';
import { Button } from '@/components/ui/button';
import { Saarthi } from './SaarthiLazy';
import { useGuide } from './GuideProvider';

const GREETING = {
  ADMIN: {
    en: 'You can run the whole organisation from here — departments, alerts and the tamper-proof record.',
    hi: 'यहीं से पूरा संगठन चलाइए — विभाग, चेतावनियाँ और छेड़छाड़-रहित रिकॉर्ड।',
  },
  MANAGER: {
    en: "Everything about your team is here — their workload, their mood, and what's waiting for you.",
    hi: 'आपकी टीम की हर बात यहाँ है — कार्यभार, मनोबल, और आपकी प्रतीक्षा में क्या है।',
  },
  EMPLOYEE: {
    en: "Everything you need for your daily work is here, and I'll answer questions in Hindi or English.",
    hi: 'रोज़ के काम की हर ज़रूरी चीज़ यहाँ है, और मैं हिंदी या अंग्रेज़ी में सवालों के जवाब दूँगा।',
  },
} as const;

const COPY = {
  en: { hi: 'Namaste', start: 'Start 2-min tour', skip: 'Skip for now', sub: "I'm Saarthi, your guide" },
  hi: { hi: 'नमस्ते', start: '2 मिनट का टूर शुरू करें', skip: 'अभी नहीं', sub: 'मैं सारथी हूँ, आपका मार्गदर्शक' },
};

/**
 * First-login greeting.
 *
 * Opens 800 ms after the dashboard settles — immediately would land while the
 * page is still painting and feel like an error dialog rather than a welcome.
 */
export function WelcomeModal() {
  const { lang } = useI18n();
  const { user } = useAuth();
  const { shouldOfferWelcome, markWelcomeSeen, isRunning } = useGuide();
  const reduced = useReducedMotion();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!shouldOfferWelcome || isRunning || !user) return;
    const timer = window.setTimeout(() => setOpen(true), 800);
    return () => window.clearTimeout(timer);
  }, [shouldOfferWelcome, isRunning, user]);

  if (!user) return null;
  const t = COPY[lang];
  const greeting = GREETING[user.role][lang];
  const firstName = user.name.split(' ')[0];

  function choose(started: boolean) {
    setOpen(false);
    markWelcomeSeen(started);
  }

  return (
    <Dialog.Root open={open} onOpenChange={(next) => (next ? setOpen(true) : choose(false))}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[70] bg-slate-900/40 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[71] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-card border border-borderx bg-white p-6 text-center shadow-pop focus-visible:outline-none">
          <motion.div
            initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.94, y: 10 }}
            animate={reduced ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
            transition={reduced ? { duration: 0.15 } : { type: 'spring', stiffness: 250, damping: 24 }}
          >
            <div className="mx-auto mb-1 flex justify-center">
              <Saarthi pose="wave" size="lg" />
            </div>

            <Dialog.Title className="text-xl font-semibold text-slate-900">
              {t.hi}, {firstName}
            </Dialog.Title>
            <p className="mt-0.5 text-sm font-medium text-primary">{t.sub}</p>
            <Dialog.Description className="mx-auto mt-3 max-w-sm text-base leading-relaxed text-slate-600">
              {greeting}
            </Dialog.Description>

            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
              <Button size="lg" onClick={() => choose(true)}>
                <PlayCircle className="h-4 w-4" aria-hidden />
                {t.start}
              </Button>
              <Button size="lg" variant="ghost" onClick={() => choose(false)}>
                {t.skip}
              </Button>
            </div>
          </motion.div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
