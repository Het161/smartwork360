'use client';

import { useEffect, useState } from 'react';
import { BrandLogo } from './BrandLogo';
import { useI18n } from '@/i18n/provider';

/**
 * Header band that only exists on paper.
 *
 * There is no PDF pipeline in this project — reports are printed, and the
 * browser's "Save as PDF" is the PDF. So the printed page needs its own
 * masthead: on screen the sidebar carries the identity, and the sidebar is
 * hidden when printing.
 *
 * The timestamp is rendered after mount rather than during render, because a
 * value derived from the clock differs between the server and the client and
 * would otherwise be a hydration mismatch.
 */
export function PrintHeader({ title }: { title?: string }) {
  const { t } = useI18n();
  const [printedAt, setPrintedAt] = useState('');

  useEffect(() => {
    setPrintedAt(
      new Date().toLocaleString('en-IN', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
    );
  }, []);

  return (
    <header className="print-header" aria-hidden>
      <div className="print-header-row">
        {/* Mono on purpose: printed on a monochrome office printer, the navy
            and saffron become two indistinguishable greys. */}
        <BrandLogo variant="lockup" theme="mono" size="md" />
        <div className="print-header-meta">
          {title ? <div className="print-header-title">{title}</div> : null}
          <div>Generated {printedAt}</div>
        </div>
      </div>
      <div className="print-header-rule" />
      <p className="print-header-note">{t.app.initiative}</p>
    </header>
  );
}
