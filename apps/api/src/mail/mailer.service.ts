import nodemailer, { type Transporter } from 'nodemailer';
import { env, isProd } from '../config/env';
import { logger } from '../config/logger';

/**
 * Mail delivery with three modes, because a hackathon demo has three different
 * audiences:
 *
 *   console  (default) — prints a boxed OTP to stdout. No network, no accounts,
 *                        works on a venue with no wifi. The demo cannot break.
 *   ethereal           — a throwaway inbox from nodemailer; logs a preview URL so
 *                        judges can see the real branded email rendered.
 *   smtp               — a real provider (Gmail app password, Resend, …).
 *
 * Every send is non-fatal. If mail fails, registration still succeeds and the user
 * can resend — losing an email must never lose an account.
 */

export type MailMode = 'console' | 'ethereal' | 'smtp';

export interface SendResult {
  delivered: boolean;
  mode: MailMode;
  previewUrl?: string;
  error?: string;
}

let transporter: Transporter | null = null;
let etherealAccount: { user: string; pass: string } | null = null;
let initialised = false;

async function getTransporter(): Promise<Transporter | null> {
  if (env.MAIL_MODE === 'console') return null;
  if (transporter) return transporter;

  try {
    if (env.MAIL_MODE === 'ethereal') {
      const account = await nodemailer.createTestAccount();
      etherealAccount = { user: account.user, pass: account.pass };
      transporter = nodemailer.createTransport({
        host: account.smtp.host,
        port: account.smtp.port,
        secure: account.smtp.secure,
        auth: { user: account.user, pass: account.pass },
      });
      logger.info({ user: account.user }, 'Ethereal test inbox created');
      return transporter;
    }

    if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) {
      logger.warn('MAIL_MODE=smtp but SMTP_HOST/USER/PASS are incomplete — falling back to console');
      return null;
    }

    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      // 465 is implicit TLS; 587 upgrades via STARTTLS.
      secure: env.SMTP_PORT === 465,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    });
    return transporter;
  } catch (err) {
    logger.error({ err }, 'Could not create a mail transporter — falling back to console');
    return null;
  }
}

/** Verifies SMTP credentials once at boot so a bad password surfaces immediately. */
export async function initMailer(): Promise<void> {
  if (initialised) return;
  initialised = true;

  if (env.MAIL_MODE === 'console') {
    logger.info('Mailer in console mode — OTPs are printed to this terminal');
    return;
  }

  const tx = await getTransporter();
  if (!tx) return;

  try {
    await tx.verify();
    logger.info(`Mailer ready (${env.MAIL_MODE})`);
  } catch (err) {
    logger.warn(
      { err: (err as Error).message },
      'Mail transport failed verification — sends will fall back to console',
    );
  }
}

export async function sendMail(opts: {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Printed inside the console box so a presenter can read it off the terminal. */
  consoleHighlight?: string;
}): Promise<SendResult> {
  const tx = await getTransporter();

  if (!tx) {
    printConsoleMail(opts);
    return { delivered: true, mode: 'console' };
  }

  try {
    const info = await tx.sendMail({
      from: env.MAIL_FROM,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    });

    const previewUrl =
      env.MAIL_MODE === 'ethereal'
        ? (nodemailer.getTestMessageUrl(info) as string | false) || undefined
        : undefined;

    if (previewUrl) {
      logger.info({ to: opts.to, previewUrl }, 'Email sent — open the preview URL to view it');
    } else {
      logger.info({ to: opts.to, messageId: info.messageId }, 'Email sent');
    }

    return { delivered: true, mode: env.MAIL_MODE, previewUrl };
  } catch (err) {
    // A failed send must not fail the request that triggered it.
    logger.error({ err: (err as Error).message, to: opts.to }, 'Email send failed — printing instead');
    printConsoleMail(opts);
    return { delivered: false, mode: env.MAIL_MODE, error: (err as Error).message };
  }
}

function printConsoleMail(opts: { to: string; subject: string; consoleHighlight?: string }) {
  const lines = [
    '',
    '  ┌───────────────────────────────────────────────────────────┐',
    `  │  EMAIL  →  ${opts.to.padEnd(45)}│`,
    `  │  ${opts.subject.slice(0, 57).padEnd(57)}│`,
  ];
  if (opts.consoleHighlight) {
    lines.push(
      '  ├───────────────────────────────────────────────────────────┤',
      `  │                                                           │`,
      `  │        ${opts.consoleHighlight.padEnd(51)}│`,
      `  │                                                           │`,
    );
  }
  lines.push('  └───────────────────────────────────────────────────────────┘', '');
  // Written straight to stdout so the box keeps its shape — the structured
  // logger would escape the borders into a single JSON string.
  process.stdout.write(lines.join('\n') + '\n');
}

export function mailerStatus() {
  return {
    mode: env.MAIL_MODE,
    from: env.MAIL_FROM,
    etherealUser: etherealAccount?.user,
    /** The dev OTP is only ever exposed outside production. */
    exposesDevOtp: !isProd && env.MAIL_MODE === 'console',
  };
}
