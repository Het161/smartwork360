'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import {
  OTP_RESEND_COOLDOWN_SECONDS,
  type DepartmentDTO,
} from '@smartwork/shared';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  Mail,
  ShieldCheck,
  X,
} from 'lucide-react';
import { ApiError, api } from '@/lib/api';
import { useI18n } from '@/i18n/provider';
import { listContainer, listItem, pop, spring, stepVariants, useReducedMotion } from '@/lib/motion';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { EnvelopeAnimation } from '@/components/signup/envelope';
import { OtpInput } from '@/components/signup/otp-input';
import {
  AmbientOrbs,
  PasswordMeter,
  ResendRing,
  StepHeading,
  StepProgress,
  SuccessCheck,
  WaitingDots,
  scorePassword,
  useCountdown,
} from '@/components/signup/bits';
import { cn } from '@/lib/utils';

const STEPS = ['Details', 'Department', 'Verify', 'Done'];

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <Signup />
    </Suspense>
  );
}

function Signup() {
  const { t } = useI18n();
  const router = useRouter();
  const params = useSearchParams();
  const reduced = useReducedMotion();

  // Deep link from the login page when an unverified user tries to sign in.
  const resumeEmail = params.get('email') ?? '';
  const resumeStep = params.get('step') === 'verify' && resumeEmail ? 3 : 1;

  const [step, setStep] = useState(resumeStep);
  const [direction, setDirection] = useState(1);

  const [name, setName] = useState('');
  const [email, setEmail] = useState(resumeEmail);
  const [designation, setDesignation] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [departmentId, setDepartmentId] = useState('');

  const [emailTouched, setEmailTouched] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [code, setCode] = useState('');
  const [otpStatus, setOtpStatus] = useState<'idle' | 'error' | 'success'>('idle');
  const [otpMessage, setOtpMessage] = useState<string | null>(null);
  const [attemptsLeft, setAttemptsLeft] = useState<number | null>(null);
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [maskedEmail, setMaskedEmail] = useState('');
  const [cooldown, setCooldown] = useCountdown(0);
  const [resending, setResending] = useState(false);

  const [departments, setDepartments] = useState<DepartmentDTO[]>([]);
  const [allowedDomains, setAllowedDomains] = useState<string[]>(['gov.in', 'nic.in']);

  useEffect(() => {
    api
      .signupDepartments()
      .then((res) => {
        setDepartments(res.items);
        if (res.allowedDomains?.length) setAllowedDomains(res.allowedDomains);
      })
      .catch(() => setFormError('Could not load departments. Is the API running?'));
  }, []);

  const emailValid = useMemo(() => {
    if (!email.includes('@')) return false;
    const domain = email.split('@')[1]?.toLowerCase() ?? '';
    return allowedDomains.some((d) => domain === d || domain.endsWith(`.${d}`));
  }, [email, allowedDomains]);

  const step1Valid =
    name.trim().length >= 2 &&
    designation.trim().length >= 2 &&
    emailValid &&
    scorePassword(password).score >= 2 &&
    password.length >= 8 &&
    password === confirm;

  function go(next: number) {
    setDirection(next > step ? 1 : -1);
    setStep(next);
  }

  async function submitRegistration() {
    setSubmitting(true);
    setFormError(null);
    setFieldErrors({});
    try {
      const res = await api.signup({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        designation: designation.trim(),
        departmentId,
        password,
        confirmPassword: confirm,
      });
      setDevOtp(res.devOtp ?? null);
      setPreviewUrl(res.previewUrl ?? null);
      setMaskedEmail(res.maskedEmail ?? email);
      setCooldown(OTP_RESEND_COOLDOWN_SECONDS);
      setCode('');
      setOtpStatus('idle');
      setAttemptsLeft(null);
      go(3);
    } catch (err) {
      if (err instanceof ApiError && err.details?.length) {
        setFieldErrors(Object.fromEntries(err.details.map((d) => [d.field, d.message])));
        setFormError('Please correct the highlighted fields.');
        go(1);
      } else {
        setFormError(err instanceof Error ? err.message : 'Registration failed');
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function submitOtp(value: string) {
    setOtpStatus('idle');
    setOtpMessage(null);
    try {
      await api.verifyOtp(email.trim().toLowerCase(), value);
      setOtpStatus('success');
      // Let the green stagger land before moving on.
      setTimeout(() => go(4), reduced ? 200 : 750);
    } catch (err) {
      setOtpStatus('error');
      setCode('');
      const left = err instanceof ApiError ? (err.details as unknown as { attemptsLeft?: number })?.attemptsLeft : undefined;
      if (typeof left === 'number') setAttemptsLeft(left);
      setOtpMessage(err instanceof Error ? err.message : 'Verification failed');
      setTimeout(() => setOtpStatus('idle'), 600);
    }
  }

  async function resend() {
    setResending(true);
    setOtpMessage(null);
    try {
      const res = await api.resendOtp(email.trim().toLowerCase());
      setDevOtp(res.devOtp ?? null);
      setPreviewUrl(res.previewUrl ?? null);
      setCooldown(OTP_RESEND_COOLDOWN_SECONDS);
      setCode('');
      setAttemptsLeft(null);
      setOtpMessage('A new code is on its way.');
    } catch (err) {
      const retry = err instanceof ApiError ? (err.details as unknown as { retryAfter?: number })?.retryAfter : undefined;
      if (typeof retry === 'number') setCooldown(retry);
      setOtpMessage(err instanceof Error ? err.message : 'Could not resend');
    } finally {
      setResending(false);
    }
  }

  const variants = stepVariants(reduced);

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/* Left — identity panel with ambient motion */}
      <section className="relative hidden flex-col justify-between overflow-hidden bg-primary p-10 text-white lg:flex">
        <AmbientOrbs />
        <div className="relative flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-full border-2 border-saffron text-sm font-bold">
            GoI
          </span>
          <div>
            <p className="text-lg font-semibold leading-tight">{t.app.name}</p>
            <p className="text-sm text-white/70">{t.app.portal}</p>
          </div>
        </div>

        <div className="relative max-w-md">
          <div className="tricolor-rule mb-6 h-1 w-28 rounded-full" />
          <h2 className="text-4xl font-semibold leading-tight">Join your department</h2>
          <p className="mt-3 text-lg leading-relaxed text-white/80">
            Register with your official address, verify it, and an administrator will activate your
            account.
          </p>

          <ol className="mt-8 space-y-3.5 text-base text-white/75">
            {[
              'Register with your @gov.in address',
              'Verify with the code we email you',
              'An administrator approves your account',
              'Sign in and see your assigned work',
            ].map((line, i) => (
              <li key={line} className="flex items-start gap-3">
                <span
                  className={cn(
                    'mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-semibold',
                    i + 1 <= step ? 'bg-saffron text-[#5C2E00]' : 'bg-white/15 text-white/70',
                  )}
                >
                  {i + 1}
                </span>
                {line}
              </li>
            ))}
          </ol>
        </div>

        <p className="relative text-sm text-white/50">{t.app.initiative}</p>
      </section>

      {/* Right — the form */}
      <section className="flex flex-col justify-center px-6 py-10 sm:px-12">
        <main id="main-content" className="mx-auto w-full max-w-md">
          <Link
            href="/login"
            className="mb-6 inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            Back to sign in
          </Link>

          <StepProgress step={step} total={STEPS.length} labels={STEPS} />

          <motion.div layout={!reduced} transition={spring} className="gt-card overflow-hidden p-6">
            <AnimatePresence mode="wait" custom={direction} initial={false}>
              {/* ------------------------------------------------ STEP 1 */}
              {step === 1 ? (
                <motion.div key="step1" custom={direction} variants={variants} initial="enter" animate="center" exit="exit">
                  <StepHeading className="">
                    Create your account
                  </StepHeading>
                  <p className="mt-1 text-sm text-slate-500">
                    Registration creates an <strong>Employee</strong> account. Managers and
                    administrators are created by your department administrator.
                  </p>

                  <div className="mt-5 space-y-4">
                    <Field label="Full name" htmlFor="s-name" required error={fieldErrors.name}>
                      <Input id="s-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Anita Rao" autoComplete="name" />
                    </Field>

                    <Field label="Designation" htmlFor="s-desig" required error={fieldErrors.designation}>
                      <Input id="s-desig" value={designation} onChange={(e) => setDesignation(e.target.value)} placeholder="Junior Clerk" />
                    </Field>

                    <div>
                      <label htmlFor="s-email" className="mb-1.5 block text-sm font-medium text-slate-700">
                        Official email<span className="ml-0.5 text-danger">*</span>
                      </label>
                      <div className="relative">
                        <Input
                          id="s-email"
                          type="email"
                          autoComplete="username"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          onBlur={() => setEmailTouched(true)}
                          placeholder="name.surname@gov.in"
                          aria-invalid={emailTouched && email.length > 0 && !emailValid}
                          className="pr-10"
                        />
                        <AnimatePresence>
                          {emailTouched && email.length > 0 ? (
                            <motion.span
                              key={emailValid ? 'ok' : 'bad'}
                              initial={reduced ? { opacity: 0 } : { scale: 0, opacity: 0 }}
                              animate={
                                reduced
                                  ? { opacity: 1 }
                                  : emailValid
                                    ? { scale: 1, opacity: 1 }
                                    : { scale: 1, opacity: 1, x: [-5, 5, -4, 4, 0] }
                              }
                              exit={{ opacity: 0 }}
                              transition={pop}
                              className={cn(
                                'absolute right-2.5 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full',
                                emailValid ? 'bg-success text-white' : 'bg-danger text-white',
                              )}
                            >
                              {emailValid ? <Check className="h-3.5 w-3.5" aria-hidden /> : <X className="h-3.5 w-3.5" aria-hidden />}
                            </motion.span>
                          ) : null}
                        </AnimatePresence>
                      </div>
                      <p className={cn('mt-1 text-sm', emailTouched && email && !emailValid ? 'text-danger' : 'text-slate-500')}>
                        {emailTouched && email && !emailValid
                          ? `Use an official address (${allowedDomains.map((d) => `@${d}`).join(' or ')}).`
                          : `Only ${allowedDomains.map((d) => `@${d}`).join(' and ')} addresses can register.`}
                      </p>
                      {fieldErrors.email ? <p className="mt-1 text-sm text-danger">{fieldErrors.email}</p> : null}
                    </div>

                    <div>
                      <label htmlFor="s-pass" className="mb-1.5 block text-sm font-medium text-slate-700">
                        Password<span className="ml-0.5 text-danger">*</span>
                      </label>
                      <Input
                        id="s-pass"
                        type="password"
                        autoComplete="new-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="At least 8 characters"
                      />
                      <PasswordMeter password={password} />
                      {fieldErrors.password ? <p className="text-sm text-danger">{fieldErrors.password}</p> : null}
                    </div>

                    <Field
                      label="Confirm password"
                      htmlFor="s-confirm"
                      required
                      error={confirm && password !== confirm ? 'Passwords do not match' : fieldErrors.confirmPassword}
                    >
                      <Input
                        id="s-confirm"
                        type="password"
                        autoComplete="new-password"
                        value={confirm}
                        onChange={(e) => setConfirm(e.target.value)}
                        aria-invalid={!!confirm && password !== confirm}
                      />
                    </Field>
                  </div>

                  <Button className="mt-6 w-full" size="lg" disabled={!step1Valid} onClick={() => go(2)}>
                    Continue
                    <ArrowRight className="h-4 w-4" aria-hidden />
                  </Button>
                </motion.div>
              ) : null}

              {/* ------------------------------------------------ STEP 2 */}
              {step === 2 ? (
                <motion.div key="step2" custom={direction} variants={variants} initial="enter" animate="center" exit="exit">
                  <StepHeading className="">
                    Which department?
                  </StepHeading>
                  <p className="mt-1 text-sm text-slate-500">
                    Your tasks and dashboards are scoped to this department.
                  </p>

                  <motion.ul
                    variants={listContainer(reduced)}
                    initial="hidden"
                    animate="show"
                    className="mt-5 grid gap-2.5 sm:grid-cols-2"
                    role="radiogroup"
                    aria-label="Department"
                  >
                    {departments.map((dept) => {
                      const selected = departmentId === dept.id;
                      return (
                        <motion.li key={dept.id} variants={listItem(reduced)}>
                          <motion.button
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            onClick={() => setDepartmentId(dept.id)}
                            animate={{ scale: selected && !reduced ? 1.02 : 1 }}
                            transition={spring}
                            className={cn(
                              'relative flex w-full items-start gap-2.5 rounded-card border p-3 text-left transition-colors',
                              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                              selected ? 'border-primary bg-primary-50' : 'border-borderx hover:bg-slate-50',
                            )}
                          >
                            <Building2 className={cn('mt-0.5 h-4 w-4 shrink-0', selected ? 'text-primary' : 'text-slate-400')} aria-hidden />
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-medium text-slate-900">{dept.name}</span>
                              <span className="block truncate text-xs text-slate-500" lang="hi">
                                {dept.nameHi}
                              </span>
                            </span>
                            <AnimatePresence>
                              {selected ? (
                                <motion.span
                                  initial={reduced ? { opacity: 0 } : { scale: 0, opacity: 0 }}
                                  animate={reduced ? { opacity: 1 } : { scale: 1, opacity: 1 }}
                                  exit={{ scale: 0, opacity: 0 }}
                                  transition={pop}
                                  className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-saffron text-[#5C2E00]"
                                >
                                  <Check className="h-3 w-3" aria-hidden />
                                </motion.span>
                              ) : null}
                            </AnimatePresence>
                          </motion.button>
                        </motion.li>
                      );
                    })}
                  </motion.ul>

                  {formError ? (
                    <p role="alert" className="mt-4 flex items-start gap-2 rounded-btn bg-danger-soft px-3 py-2 text-sm text-danger">
                      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                      {formError}
                    </p>
                  ) : null}

                  <div className="mt-6 flex gap-2">
                    <Button variant="secondary" size="lg" onClick={() => go(1)}>
                      <ArrowLeft className="h-4 w-4" aria-hidden />
                      Back
                    </Button>
                    <Button
                      className="flex-1"
                      size="lg"
                      disabled={!departmentId}
                      loading={submitting}
                      onClick={submitRegistration}
                    >
                      {submitting ? 'Creating account…' : 'Create account'}
                      {!submitting ? <ArrowRight className="h-4 w-4" aria-hidden /> : null}
                    </Button>
                  </div>
                </motion.div>
              ) : null}

              {/* ------------------------------------------------ STEP 3 */}
              {step === 3 ? (
                <motion.div key="step3" custom={direction} variants={variants} initial="enter" animate="center" exit="exit">
                  <EnvelopeAnimation className="mx-auto mb-2 flex justify-center" />

                  <StepHeading className="text-center">
                    Check your inbox
                  </StepHeading>
                  <p className="mt-1 text-center text-sm text-slate-500">
                    We sent a 6-digit code to{' '}
                    <strong className="text-slate-700">{maskedEmail || email}</strong>
                  </p>

                  <div className="mt-6">
                    <OtpInput
                      value={code}
                      onChange={setCode}
                      onComplete={submitOtp}
                      status={otpStatus}
                      disabled={otpStatus === 'success'}
                    />
                  </div>

                  {/* Console-mode convenience — dev only, and labelled as such. */}
                  {devOtp ? (
                    <motion.div
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mt-4 flex items-center justify-center gap-2 rounded-btn border border-dashed border-warning/50 bg-warning-soft px-3 py-2"
                    >
                      <Badge tone="amber">DEV</Badge>
                      <span className="text-sm text-warning">
                        Code: <strong className="font-mono tracking-wider">{devOtp}</strong>
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setCode(devOtp);
                          void submitOtp(devOtp);
                        }}
                        className="text-xs font-medium text-warning underline"
                      >
                        use
                      </button>
                    </motion.div>
                  ) : null}

                  {previewUrl ? (
                    <p className="mt-3 text-center text-sm">
                      <a href={previewUrl} target="_blank" rel="noreferrer" className="text-primary underline">
                        Open the email preview →
                      </a>
                    </p>
                  ) : null}

                  <div className="mt-3 min-h-[36px] text-center">
                    <AnimatePresence mode="wait">
                      {otpMessage ? (
                        <motion.p
                          key={otpMessage}
                          role="alert"
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          className={cn(
                            'text-sm',
                            otpStatus === 'error' || attemptsLeft !== null ? 'text-danger' : 'text-success',
                          )}
                        >
                          {otpMessage}
                        </motion.p>
                      ) : null}
                    </AnimatePresence>
                    {attemptsLeft !== null && attemptsLeft > 0 && attemptsLeft <= 3 ? (
                      <p className="mt-0.5 text-xs text-slate-500">{attemptsLeft} attempts left</p>
                    ) : null}
                  </div>

                  <div className="mt-2 flex items-center justify-center">
                    <ResendRing
                      seconds={cooldown}
                      total={OTP_RESEND_COOLDOWN_SECONDS}
                      onResend={resend}
                      busy={resending}
                    />
                  </div>

                  <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-slate-400">
                    <Mail className="h-3 w-3" aria-hidden />
                    The code expires in 10 minutes
                  </p>
                </motion.div>
              ) : null}

              {/* ------------------------------------------------ STEP 4 */}
              {step === 4 ? (
                <motion.div
                  key="step4"
                  custom={direction}
                  variants={variants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  className="py-2 text-center"
                >
                  <Confetti />
                  <SuccessCheck />

                  <StepHeading className="mt-5">
                    Email verified
                  </StepHeading>
                  <p className="mt-2 text-base leading-relaxed text-slate-600">
                    Registration complete — your account is pending administrator approval{' '}
                    <WaitingDots />
                  </p>

                  <div className="mt-5 rounded-card border border-borderx bg-slate-50 p-4 text-left">
                    <p className="flex items-center gap-2 text-sm font-medium text-slate-800">
                      <ShieldCheck className="h-4 w-4 text-success" aria-hidden />
                      What happens next
                    </p>
                    <ol className="mt-2 space-y-1.5 text-sm text-slate-600">
                      <li>1. Your department administrator reviews the registration.</li>
                      <li>2. You receive a welcome email the moment it is approved.</li>
                      <li>3. Sign in with the password you just chose.</li>
                    </ol>
                  </div>

                  <Button className="mt-6 w-full" size="lg" onClick={() => router.push('/login')}>
                    Back to sign in
                  </Button>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </motion.div>

          {formError && step !== 2 ? (
            <p role="alert" className="mt-3 flex items-start gap-2 rounded-btn bg-danger-soft px-3 py-2 text-sm text-danger">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              {formError}
            </p>
          ) : null}
        </main>
      </section>
    </div>
  );
}

/** Tricolour burst, fired once. Skipped entirely under reduced motion. */
function Confetti() {
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) return;
    let cancelled = false;
    // Dynamically imported so canvas-confetti never lands in the shared bundle.
    void import('canvas-confetti').then(({ default: confetti }) => {
      if (cancelled) return;
      confetti({
        particleCount: 120,
        spread: 78,
        startVelocity: 42,
        ticks: 220,
        origin: { x: 0.5, y: 0.72 },
        colors: ['#FF9933', '#FFFFFF', '#138808'],
        disableForReducedMotion: true,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [reduced]);

  return null;
}
