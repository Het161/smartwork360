'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { BrandLogo } from '@/components/brand/BrandLogo';

/**
 * Route error boundary.
 *
 * A crashed screen is exactly where a user needs to know they are still inside
 * the same system, so the logo appears here rather than a bare stack trace
 * page. It also offers Saarthi, because "something went wrong" is the moment
 * support is most useful.
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error('Route error:', error);
  }, [error]);

  return (
    <main id="main-content" className="grid min-h-screen place-items-center bg-canvas px-6">
      <div className="gt-card max-w-md p-8 text-center">
        <BrandLogo variant="lockup" size="md" className="mb-6 justify-center" />
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-danger-soft text-danger">
          <AlertTriangle className="h-5 w-5" aria-hidden />
        </div>
        <div className="tricolor-rule mx-auto mb-4 h-1 w-20 rounded-full" />
        <h1 className="text-2xl font-semibold text-slate-900">Something went wrong</h1>
        <p className="mt-2 text-base text-slate-500">
          This screen could not be displayed. Nothing you were working on has been lost.
        </p>
        {error.digest ? (
          <p className="mt-2 font-mono text-xs text-slate-400">Reference: {error.digest}</p>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={reset}
            className="inline-flex h-9 items-center gap-1.5 rounded-btn bg-primary px-4 text-sm font-medium text-white hover:bg-primary-hover"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            Try again
          </button>
          <Link
            href="/"
            className="inline-flex h-9 items-center rounded-btn border border-borderx px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Go to my dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
