import { randomInt } from 'node:crypto';
import bcrypt from 'bcryptjs';
import {
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_COOLDOWN_SECONDS,
  OTP_TTL_SECONDS,
  type SignupInput,
} from '@smartwork/shared';
import { prisma } from '../../db/prisma';
import { allowedEmailDomains, env, isProd } from '../../config/env';
import { logger } from '../../config/logger';
import { appendEvent } from '../../audit/audit.service';
import { hashPassword } from '../../auth/password';
import { badRequest, conflict, HttpError, notFound } from '../../middleware/errors';
import { sendMail } from '../../mail/mailer.service';
import { otpEmail, welcomeEmail } from '../../mail/templates';

const PURPOSE_SIGNUP = 'SIGNUP';

/** Six digits from a CSPRNG. `Math.random()` is not acceptable for a credential. */
function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

function assertAllowedDomain(email: string) {
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain || !allowedEmailDomains.some((d) => domain === d || domain.endsWith(`.${d}`))) {
    throw badRequest(
      `Registration is restricted to official addresses (${allowedEmailDomains
        .map((d) => `@${d}`)
        .join(', ')}).`,
    );
  }
}

/** Masks an address for display: rajesh.iyer@gov.in → r••••••••r@gov.in */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return email;
  if (local.length <= 2) return `${local[0]}•@${domain}`;
  return `${local[0]}${'•'.repeat(Math.min(8, local.length - 2))}${local.at(-1)}@${domain}`;
}

/**
 * Issues a fresh OTP and emails it.
 *
 * Any previous unconsumed code for the address is invalidated first, so a user who
 * requests a resend cannot have two live codes — the older one being still valid
 * would widen the guessing window for no benefit.
 */
async function issueOtp(email: string, name: string) {
  const now = new Date();

  const latest = await prisma.emailOtp.findFirst({
    where: { email, purpose: PURPOSE_SIGNUP, consumedAt: null },
    orderBy: { createdAt: 'desc' },
  });

  if (latest) {
    const elapsed = (now.getTime() - latest.createdAt.getTime()) / 1000;
    if (elapsed < OTP_RESEND_COOLDOWN_SECONDS) {
      const retryAfter = Math.ceil(OTP_RESEND_COOLDOWN_SECONDS - elapsed);
      throw new HttpError(
        429,
        `Please wait ${retryAfter}s before requesting another code.`,
        'RESEND_COOLDOWN',
        { retryAfter },
      );
    }
    await prisma.emailOtp.updateMany({
      where: { email, purpose: PURPOSE_SIGNUP, consumedAt: null },
      data: { consumedAt: now },
    });
  }

  const code = generateCode();
  await prisma.emailOtp.create({
    data: {
      email,
      codeHash: bcrypt.hashSync(code, 10),
      purpose: PURPOSE_SIGNUP,
      expiresAt: new Date(now.getTime() + OTP_TTL_SECONDS * 1000),
    },
  });

  const mail = otpEmail({ name, code, minutes: Math.round(OTP_TTL_SECONDS / 60) });
  const result = await sendMail({
    to: email,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
    consoleHighlight: `VERIFICATION CODE:  ${code}`,
  });

  return {
    previewUrl: result.previewUrl,
    // Only ever outside production, and only when nothing was actually delivered
    // to an inbox the user can open.
    devOtp: !isProd && env.MAIL_MODE === 'console' ? code : undefined,
    expiresInSeconds: OTP_TTL_SECONDS,
  };
}

export async function registerEmployee(input: SignupInput) {
  const email = input.email.toLowerCase();
  assertAllowedDomain(email);

  const department = await prisma.department.findUnique({ where: { id: input.departmentId } });
  if (!department) throw badRequest('Select a valid department');

  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    // An account already past verification is a genuine conflict.
    if (existing.status !== 'PENDING_VERIFICATION') {
      throw conflict('An account with this email already exists. Try signing in instead.');
    }
    // Abandoned half-registrations are resumable rather than a dead end: refresh
    // the details and send a new code.
    const updated = await prisma.user.update({
      where: { id: existing.id },
      data: {
        name: input.name,
        designation: input.designation,
        departmentId: input.departmentId,
        passwordHash: hashPassword(input.password),
      },
    });
    const otp = await issueOtp(email, updated.name);
    return { email, status: updated.status, ...otp };
  }

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        name: input.name,
        email,
        passwordHash: hashPassword(input.password),
        // Forced, never taken from the request. Self-signup cannot mint a manager.
        role: 'EMPLOYEE',
        designation: input.designation,
        departmentId: input.departmentId,
        avatarSeed: input.name.toLowerCase().replace(/[^a-z]+/g, '-'),
        status: 'PENDING_VERIFICATION',
        emailVerified: false,
        active: true,
      },
    });

    await appendEvent(
      {
        entityType: 'USER',
        entityId: created.id,
        action: 'USER_REGISTERED',
        actorId: created.id,
        payload: {
          name: created.name,
          email: created.email,
          designation: created.designation,
          departmentId: created.departmentId,
          via: 'self-registration',
        },
      },
      tx,
    );

    return created;
  });

  logger.info({ email, departmentId: input.departmentId }, 'New employee registration started');
  const otp = await issueOtp(email, user.name);
  return { email, status: user.status, ...otp };
}

export async function resendOtp(email: string) {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user) throw notFound('No registration found for this email');
  if (user.status !== 'PENDING_VERIFICATION') {
    throw badRequest('This email is already verified.');
  }
  const otp = await issueOtp(user.email, user.name);
  return { email: user.email, status: user.status, ...otp };
}

export async function verifyOtp(email: string, code: string) {
  const normalised = email.toLowerCase();
  const user = await prisma.user.findUnique({ where: { email: normalised } });
  if (!user) throw notFound('No registration found for this email');

  if (user.status !== 'PENDING_VERIFICATION') {
    // Idempotent: re-verifying is a no-op rather than an error.
    return { alreadyVerified: true, status: user.status, attemptsLeft: OTP_MAX_ATTEMPTS };
  }

  const otp = await prisma.emailOtp.findFirst({
    where: { email: normalised, purpose: PURPOSE_SIGNUP, consumedAt: null },
    orderBy: { createdAt: 'desc' },
  });

  if (!otp) throw badRequest('No active code. Please request a new one.');

  if (otp.expiresAt < new Date()) {
    await prisma.emailOtp.update({ where: { id: otp.id }, data: { consumedAt: new Date() } });
    throw badRequest('That code has expired. Please request a new one.');
  }

  if (otp.attempts >= OTP_MAX_ATTEMPTS) {
    await prisma.emailOtp.update({ where: { id: otp.id }, data: { consumedAt: new Date() } });
    throw badRequest('Too many incorrect attempts. Please request a new code.');
  }

  if (!bcrypt.compareSync(code, otp.codeHash)) {
    const updated = await prisma.emailOtp.update({
      where: { id: otp.id },
      data: { attempts: { increment: 1 } },
    });
    const attemptsLeft = Math.max(0, OTP_MAX_ATTEMPTS - updated.attempts);

    if (attemptsLeft === 0) {
      await prisma.emailOtp.update({ where: { id: otp.id }, data: { consumedAt: new Date() } });
      throw new HttpError(
        400,
        'Too many incorrect attempts. Please request a new code.',
        'OTP_LOCKED',
        { attemptsLeft: 0 },
      );
    }
    throw new HttpError(
      400,
      `Incorrect code. ${attemptsLeft} attempt${attemptsLeft === 1 ? '' : 's'} left.`,
      'OTP_INVALID',
      { attemptsLeft },
    );
  }

  // Correct — verify, move to PENDING_APPROVAL, and tell the admins.
  const result = await prisma.$transaction(async (tx) => {
    await tx.emailOtp.update({ where: { id: otp.id }, data: { consumedAt: new Date() } });

    const updated = await tx.user.update({
      where: { id: user.id },
      data: { emailVerified: true, status: 'PENDING_APPROVAL' },
      include: { department: { select: { name: true } } },
    });

    await appendEvent(
      {
        entityType: 'USER',
        entityId: updated.id,
        action: 'EMAIL_VERIFIED',
        actorId: updated.id,
        payload: { email: updated.email, status: updated.status },
      },
      tx,
    );

    const admins = await tx.user.findMany({ where: { role: 'ADMIN', active: true }, select: { id: true } });
    if (admins.length) {
      await tx.notification.createMany({
        data: admins.map((admin) => ({
          userId: admin.id,
          title: 'New registration awaiting approval',
          body: `${updated.name} — ${updated.designation}, ${updated.department.name}`,
          link: '/a/directory?tab=pending',
        })),
      });
    }

    return updated;
  });

  logger.info({ email: normalised }, 'Email verified — awaiting admin approval');
  return { alreadyVerified: false, status: result.status, attemptsLeft: OTP_MAX_ATTEMPTS };
}

export async function approveUser(userId: string, actorId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { department: { select: { name: true } } },
  });
  if (!user) throw notFound('User not found');

  if (user.status === 'ACTIVE') throw badRequest('This account is already active.');
  if (user.status === 'PENDING_VERIFICATION') {
    throw badRequest('This user has not verified their email address yet.');
  }

  const approved = await prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id: userId },
      data: { status: 'ACTIVE', active: true, approvedById: actorId, approvedAt: new Date() },
      include: { department: { select: { name: true } } },
    });

    await appendEvent(
      {
        entityType: 'USER',
        entityId: updated.id,
        action: 'USER_APPROVED',
        actorId,
        payload: { name: updated.name, email: updated.email, role: updated.role },
      },
      tx,
    );

    await tx.notification.create({
      data: {
        userId: updated.id,
        title: 'Your account has been approved',
        body: 'You can now sign in to SMARTWORK 360 and view your assigned tasks.',
        link: '/e/dashboard',
      },
    });

    return updated;
  });

  const mail = welcomeEmail({
    name: approved.name,
    designation: approved.designation,
    department: approved.department.name,
    signInUrl: `${env.APP_BASE_URL}/login`,
  });
  const sent = await sendMail({
    to: approved.email,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
    consoleHighlight: 'ACCOUNT APPROVED — sign-in enabled',
  });

  return { user: approved, previewUrl: sent.previewUrl };
}

/** Human-readable reason a non-ACTIVE account cannot sign in. */
export function signInBlockReason(status: string): { code: string; message: string } | null {
  switch (status) {
    case 'PENDING_VERIFICATION':
      return {
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Please verify your email address to continue.',
      };
    case 'PENDING_APPROVAL':
      return {
        code: 'PENDING_APPROVAL',
        message:
          'Your email is verified. An administrator still needs to approve your account — you will receive an email once that happens.',
      };
    case 'DISABLED':
      return { code: 'ACCOUNT_DISABLED', message: 'This account has been deactivated.' };
    default:
      return null;
  }
}
