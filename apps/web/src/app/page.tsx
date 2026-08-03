'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { HOME_FOR, useAuth } from '@/lib/auth';
import { BrandLogo } from '@/components/brand/BrandLogo';

/**
 * Root route. Sends a signed-in user to the dashboard for their role, and
 * everyone else to sign-in. Done client-side because the session lives in an
 * httpOnly refresh cookie plus an in-memory access token.
 */
export default function IndexPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    router.replace(user ? HOME_FOR[user.role] : '/login');
  }, [user, loading, router]);

  return (
    <main id="main-content" className="grid min-h-screen place-items-center bg-sidebar">
      <div className="flex flex-col items-center gap-4">
        {/* motion-safe: the pulse disappears entirely under
            prefers-reduced-motion rather than merely slowing down. */}
        <span className="motion-safe:animate-pulse">
          <BrandLogo variant="mark" theme="dark" size="lg" />
        </span>
        <span className="flex items-center gap-2 text-sm text-white/70">
          <Loader2 className="h-4 w-4 animate-spin motion-reduce:hidden" aria-hidden />
          Loading SMARTWORK 360…
        </span>
      </div>
    </main>
  );
}
