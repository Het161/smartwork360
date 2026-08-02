'use client';

import { useEffect } from 'react';

/**
 * Registers the hand-written service worker (see DECISIONS.md 0.8), which makes
 * the app installable and keeps the shell available offline. Registration is
 * skipped in development so hot reload is never served from cache.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        /* offline shell is a progressive enhancement — never block the app */
      });
    };

    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register);

    return () => window.removeEventListener('load', register);
  }, []);

  return null;
}
