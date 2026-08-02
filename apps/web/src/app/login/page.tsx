'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { DEMO_PASSWORD } from '@smartwork/shared';
import {
  AlertCircle,
  ArrowRight,
  Building2,
  Hourglass,
  MailWarning,
  ShieldCheck,
  UserCog,
  UserPlus,
  Users,
} from 'lucide-react';
import { ApiError } from '@/lib/api';
import { HOME_FOR, useAuth } from '@/lib/auth';
import { useI18n } from '@/i18n/provider';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

const DEMO_ACCOUNTS = [
  {
    role: 'ADMIN' as const,
    email: 'rajesh.iyer@gov.in',
    name: 'Rajesh Iyer',
    designation: 'Deputy Collector',
    icon: ShieldCheck,
  },
  {
    role: 'MANAGER' as const,
    email: 'sunita.deshmukh@gov.in',
    name: 'Sunita Deshmukh',
    designation: 'Tehsildar · Revenue',
    icon: UserCog,
  },
  {
    role: 'EMPLOYEE' as const,
    email: 'kavita.joshi@gov.in',
    name: 'Kavita Joshi',
    designation: 'Section Officer · Revenue',
    icon: Users,
  },
];

export default function LoginPage() {
  const { t, lang, setLang } = useI18n();
  const { signIn, user, loading } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [blocked, setBlocked] = useState<{
    code: string;
    message: string;
    maskedEmail?: string;
  } | null>(null);

  // Already signed in (e.g. refreshed the tab) — go straight to the right home.
  useEffect(() => {
    if (!loading && user) router.replace(HOME_FOR[user.role]);
  }, [user, loading, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBlocked(null);
    setSubmitting(true);
    try {
      const signedIn = await signIn(email.trim(), password);
      router.replace(HOME_FOR[signedIn.role]);
    } catch (err) {
      // Onboarding-incomplete states get their own banner with a next action,
      // rather than being flattened into "incorrect email or password".
      if (err instanceof ApiError && (err.code === 'EMAIL_NOT_VERIFIED' || err.code === 'PENDING_APPROVAL')) {
        const details = err.details as unknown as { maskedEmail?: string } | undefined;
        setBlocked({ code: err.code, message: err.message, maskedEmail: details?.maskedEmail });
      } else {
        setError(err instanceof Error ? err.message : t.login.invalid);
      }
      setSubmitting(false);
    }
  }

  function quickFill(account: (typeof DEMO_ACCOUNTS)[number]) {
    setEmail(account.email);
    setPassword(DEMO_PASSWORD);
    setError(null);
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/* Left — government identity panel */}
      <section className="relative hidden flex-col justify-between bg-primary p-10 text-white lg:flex">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-full border-2 border-saffron text-sm font-bold">
            GoI
          </span>
          <div>
            <p className="text-lg font-semibold leading-tight">{t.app.name}</p>
            <p className="text-sm text-white/70">{t.app.portal}</p>
          </div>
        </div>

        <div className="max-w-md">
          <div className="tricolor-rule mb-6 h-1 w-28 rounded-full" />
          <h1 className="text-4xl font-semibold leading-tight">{t.app.name}</h1>
          <p className="mt-3 text-lg leading-relaxed text-white/80">{t.app.tagline}</p>

          <ul className="mt-8 space-y-3 text-base text-white/75">
            <li className="flex items-start gap-2.5">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-saffron" aria-hidden />
              Tamper-evident SHA-256 audit trail on every action
            </li>
            <li className="flex items-start gap-2.5">
              <Users className="mt-0.5 h-4 w-4 shrink-0 text-saffron" aria-hidden />
              AI insights for morale, burnout and anomaly detection
            </li>
            <li className="flex items-start gap-2.5">
              <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-saffron" aria-hidden />
              Role-based dashboards across departments
            </li>
          </ul>
        </div>

        <p className="text-sm text-white/50">{t.app.initiative}</p>
      </section>

      {/* Right — sign-in form */}
      <section className="flex flex-col justify-center px-6 py-10 sm:px-12">
        <main id="main-content" className="mx-auto w-full max-w-sm">
          <div className="mb-6 flex items-center justify-between lg:hidden">
            <span className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-full border-2 border-saffron text-[10px] font-bold text-primary">
                GoI
              </span>
              <span className="font-semibold text-slate-900">{t.app.name}</span>
            </span>
          </div>

          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold text-slate-900">{t.login.title}</h2>
              <p className="mt-1 text-base text-slate-500">{t.login.subtitle}</p>
            </div>
            <div className="flex shrink-0 items-center rounded-btn border border-borderx p-0.5">
              {(['en', 'hi'] as const).map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => setLang(code)}
                  aria-pressed={lang === code}
                  className={cn(
                    'rounded-[6px] px-2 py-1 text-xs font-medium',
                    lang === code ? 'bg-primary text-white' : 'text-slate-600 hover:bg-slate-100',
                  )}
                >
                  {code === 'en' ? 'EN' : 'हिंदी'}
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            <Field label={t.login.email} htmlFor="email" required>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name.surname@gov.in"
                aria-invalid={!!error}
              />
            </Field>

            <Field label={t.login.password} htmlFor="password" required>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
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

            {blocked?.code === 'EMAIL_NOT_VERIFIED' ? (
              <div
                role="alert"
                className="rounded-btn border border-warning/40 bg-warning-soft px-3 py-2.5 text-sm text-warning"
              >
                <p className="flex items-start gap-2 font-medium">
                  <MailWarning className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                  Verify your email to continue
                </p>
                <p className="mt-1 text-warning/90">
                  We sent a code to {blocked.maskedEmail ?? email}. Finish verification to activate
                  your registration.
                </p>
                <Link
                  href={`/signup?step=verify&email=${encodeURIComponent(email.trim())}`}
                  className="mt-2 inline-flex items-center gap-1 font-semibold underline"
                >
                  Enter the code
                  <ArrowRight className="h-3 w-3" aria-hidden />
                </Link>
              </div>
            ) : null}

            {blocked?.code === 'PENDING_APPROVAL' ? (
              <div
                role="alert"
                className="rounded-btn border border-info/30 bg-info-soft px-3 py-2.5 text-sm text-info"
              >
                <p className="flex items-start gap-2 font-medium">
                  <Hourglass className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                  Awaiting administrator approval
                </p>
                <p className="mt-1 text-info/90">{blocked.message}</p>
              </div>
            ) : null}

            <Button type="submit" className="w-full" size="lg" loading={submitting}>
              {t.common.signIn}
              {!submitting ? <ArrowRight className="h-4 w-4" aria-hidden /> : null}
            </Button>
          </form>

          <div className="my-5 flex items-center gap-3">
            <span className="h-px flex-1 bg-borderx" />
            <span className="text-xs uppercase tracking-wide text-slate-400">or</span>
            <span className="h-px flex-1 bg-borderx" />
          </div>

          <Button asChild variant="secondary" size="lg" className="w-full">
            <Link href="/auth/parichay">
              <span className="grid h-4 w-4 place-items-center rounded-sm bg-primary text-[8px] font-bold text-white">
                P
              </span>
              {t.login.parichay}
            </Link>
          </Button>
          <p className="mt-2 text-center text-xs text-slate-500">{t.login.parichayNote}</p>

          <p className="mt-5 text-center text-sm text-slate-600">
            New employee?{' '}
            <Link
              href="/signup"
              className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
            >
              <UserPlus className="h-3.5 w-3.5" aria-hidden />
              Register for an account
            </Link>
          </p>

          {/* Quick-login chips — judges should never have to type a password. */}
          <div className="mt-8 rounded-card border border-borderx bg-white p-4">
            <p className="text-sm font-medium text-slate-800">{t.login.demoAccounts}</p>
            <p className="mt-0.5 text-xs text-slate-500">{t.login.demoHint}</p>
            <div className="mt-3 space-y-1.5">
              {DEMO_ACCOUNTS.map((account) => {
                const Icon = account.icon;
                return (
                  <button
                    key={account.email}
                    type="button"
                    onClick={() => quickFill(account)}
                    className="flex w-full items-center gap-2.5 rounded-btn border border-borderx px-3 py-2 text-left transition-colors hover:border-primary-200 hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-slate-800">
                        {account.name}
                      </span>
                      <span className="block truncate text-xs text-slate-500">
                        {account.designation}
                      </span>
                    </span>
                    <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                      {account.role}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="mt-3 text-xs text-slate-400">
              Password for all demo accounts: <code className="font-medium">{DEMO_PASSWORD}</code>
            </p>
          </div>
        </main>
      </section>
    </div>
  );
}
