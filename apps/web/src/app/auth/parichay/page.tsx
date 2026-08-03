'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PARICHAY_SANDBOX_OTP } from '@smartwork/shared';
import { AlertCircle, ArrowLeft, Info, Lock } from 'lucide-react';
import { HOME_FOR, useAuth } from '@/lib/auth';
import { useI18n } from '@/i18n/provider';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { BrandLogo } from '@/components/brand/BrandLogo';

/**
 * Mock Parichay SSO.
 *
 * Real Parichay (NIC's G2G single sign-on) requires NIC onboarding, which a
 * hackathon prototype cannot obtain. Rather than fake an integration silently,
 * this screen simulates the flow and labels itself SANDBOX everywhere a user or
 * judge can see — in the badge, the notice, and the API response.
 */
export default function ParichayPage() {
  const { t } = useI18n();
  const { signInParichay } = useAuth();
  const router = useRouter();

  const [userId, setUserId] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const user = await signInParichay(userId.trim(), otp.trim());
      router.replace(HOME_FOR[user.role]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-canvas">
      {/* Government-style masthead, in the visual language of an NIC SSO screen. */}
      <header className="bg-primary text-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-3">
            {/* Parichay's own monogram, not ours, and deliberately kept: this
                screen is a MOCK of somebody else's single sign-on, so putting
                the SMARTWORK mark in the masthead would misrepresent whose
                service the user is looking at. Our mark sits subordinate on the
                right, next to the sandbox badge. */}
            <span className="grid h-10 w-10 place-items-center rounded-full border-2 border-saffron text-xs font-bold">
              GoI
            </span>
            <div>
              <p className="text-md font-semibold leading-tight">Parichay</p>
              <p className="text-xs text-white/70">National Single Sign-On · Government of India</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* The relying party, deliberately smaller than the Parichay
                masthead: this screen is a mock of somebody else's SSO, and
                making our own mark dominant would misrepresent that. White
                variant because the masthead is navy. */}
            <BrandLogo variant="lockup" theme="dark" size="sm" className="hidden opacity-90 sm:inline-flex" />
            <span className="rounded-full bg-saffron px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[#5C2E00]">
              {t.login.sandboxBadge}
            </span>
          </div>
        </div>
        <div className="tricolor-rule h-1" />
      </header>

      <main id="main-content" className="mx-auto max-w-3xl px-6 py-10">
        <Link
          href="/login"
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          {t.login.backToPassword}
        </Link>

        <div className="grid gap-6 md:grid-cols-[1fr_280px]">
          <div className="gt-card p-6">
            <h1 className="text-xl font-semibold text-slate-900">Sign in with Parichay</h1>
            <p className="mt-1 text-base text-slate-500">
              Enter your government user ID and the one-time password sent to your registered mobile.
            </p>

            <form onSubmit={onSubmit} className="mt-6 space-y-4">
              <Field
                label={t.login.userId}
                htmlFor="userId"
                required
                hint="Your @gov.in address, e.g. rajesh.iyer@gov.in"
              >
                <Input
                  id="userId"
                  required
                  autoComplete="username"
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  placeholder="name.surname@gov.in"
                  aria-invalid={!!error}
                />
              </Field>

              <Field label={t.login.otp} htmlFor="otp" required hint={t.login.otpHint}>
                <Input
                  id="otp"
                  required
                  inputMode="numeric"
                  maxLength={6}
                  autoComplete="one-time-code"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••••"
                  className="tracking-[0.4em]"
                  aria-invalid={!!error}
                />
              </Field>

              {error ? (
                <p
                  role="alert"
                  className="flex items-start gap-2 rounded-btn bg-danger-soft px-3 py-2 text-sm text-danger"
                >
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                  {error}
                </p>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <Button type="submit" size="lg" loading={submitting}>
                  <Lock className="h-4 w-4" aria-hidden />
                  {t.login.verify}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="lg"
                  onClick={() => {
                    setUserId('rajesh.iyer@gov.in');
                    setOtp(PARICHAY_SANDBOX_OTP);
                    setError(null);
                  }}
                >
                  Fill sandbox credentials
                </Button>
              </div>
            </form>
          </div>

          <aside className="gt-card h-fit border-l-[3px] border-l-saffron p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <Info className="h-4 w-4 text-saffron-deep" aria-hidden />
              This is a simulation
            </p>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              Parichay is NIC&apos;s real single sign-on for government employees. Integrating with it
              requires NIC onboarding and a departmental MoU, which is outside the scope of a
              hackathon prototype.
            </p>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              This screen reproduces the flow honestly: any seeded <code>@gov.in</code> account with
              OTP <code className="font-semibold">{PARICHAY_SANDBOX_OTP}</code> issues the same JWTs
              as password sign-in. The API labels the session{' '}
              <code className="font-semibold">mode: sandbox</code>.
            </p>
          </aside>
        </div>
      </main>
    </div>
  );
}
