import { Router } from 'express';
import {
  loginSchema,
  parichayVerifySchema,
  resendOtpSchema,
  signupSchema,
  verifyOtpSchema,
  type LoginInput,
  type ParichayVerifyInput,
  type ResendOtpInput,
  type SignupInput,
  type VerifyOtpInput,
} from '@smartwork/shared';
import { allowedEmailDomains, env } from '../../config/env';
import { rateLimit } from '../../middleware/rate-limit';
import { HttpError } from '../../middleware/errors';
import {
  maskEmail,
  registerEmployee,
  resendOtp,
  signInBlockReason,
  verifyOtp,
} from './signup.service';
import { prisma } from '../../db/prisma';
import { verifyPassword } from '../../auth/password';
import {
  REFRESH_COOKIE,
  refreshCookieOptions,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../../auth/jwt';
import { asyncHandler, unauthorized } from '../../middleware/errors';
import { currentUser, requireAuth } from '../../middleware/auth';
import { body, validateBody } from '../../middleware/validate';
import { toUserDTO, userInclude } from '../users/user.mapper';

export const authRouter = Router();

/**
 * @openapi
 * /auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Sign in with email and password
 *     description: Returns a 15-minute access token and sets a 7-day httpOnly refresh cookie.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, example: "rajesh.iyer@gov.in" }
 *               password: { type: string, example: "Demo@123" }
 *     responses:
 *       200: { description: Signed in, returns accessToken and user }
 *       401: { description: Invalid credentials }
 */
authRouter.post(
  '/login',
  validateBody(loginSchema),
  asyncHandler(async (req, res) => {
    const { email, password } = body<LoginInput>(req);

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: userInclude,
    });

    // Same message for unknown-email and wrong-password — no account enumeration.
    if (!user || !verifyPassword(password, user.passwordHash)) {
      throw unauthorized('Incorrect email or password');
    }
    if (!user.active) throw unauthorized('This account has been deactivated');

    // Credentials are correct but onboarding is incomplete. This is deliberately a
    // 403 with a specific code, not a 401: the client needs to know whether to send
    // the user back to the OTP step or simply tell them to wait. The check runs
    // AFTER the password check so it cannot be used to enumerate accounts.
    const blocked = signInBlockReason(user.status);
    if (blocked) {
      throw new HttpError(403, blocked.message, blocked.code, {
        email: user.email,
        maskedEmail: maskEmail(user.email),
        status: user.status,
      });
    }

    res.cookie(REFRESH_COOKIE, signRefreshToken(user.id), refreshCookieOptions);
    res.json({
      accessToken: signAccessToken({
        sub: user.id,
        role: user.role,
        departmentId: user.departmentId,
        name: user.name,
        via: 'password',
      }),
      user: toUserDTO(user),
    });
  }),
);

/**
 * @openapi
 * /auth/parichay/verify:
 *   post:
 *     tags: [Auth]
 *     summary: Mock Parichay SSO verification (SANDBOX — not a real NIC integration)
 *     description: >
 *       Simulates NIC's Parichay G2G single sign-on. Real Parichay requires NIC
 *       onboarding, so this sandbox accepts any seeded @gov.in user ID together
 *       with the fixed sandbox OTP and issues the same JWTs as password login.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userId, otp]
 *             properties:
 *               userId: { type: string, example: "rajesh.iyer@gov.in" }
 *               otp: { type: string, example: "123456" }
 *     responses:
 *       200: { description: Signed in via sandbox SSO }
 *       401: { description: Unknown user ID or wrong OTP }
 */
authRouter.post(
  '/parichay/verify',
  validateBody(parichayVerifySchema),
  asyncHandler(async (req, res) => {
    const { userId, otp } = body<ParichayVerifyInput>(req);

    if (otp !== env.PARICHAY_SANDBOX_OTP) {
      throw unauthorized('Invalid OTP. In sandbox mode the OTP is 123456.');
    }

    const email = userId.includes('@') ? userId.toLowerCase() : `${userId.toLowerCase()}@gov.in`;
    const user = await prisma.user.findUnique({ where: { email }, include: userInclude });

    if (!user) throw unauthorized(`No Parichay-linked account found for ${email}`);
    if (!user.active) throw unauthorized('This account has been deactivated');

    const ssoBlocked = signInBlockReason(user.status);
    if (ssoBlocked) {
      throw new HttpError(403, ssoBlocked.message, ssoBlocked.code, {
        email: user.email,
        maskedEmail: maskEmail(user.email),
        status: user.status,
      });
    }

    res.cookie(REFRESH_COOKIE, signRefreshToken(user.id), refreshCookieOptions);
    res.json({
      accessToken: signAccessToken({
        sub: user.id,
        role: user.role,
        departmentId: user.departmentId,
        name: user.name,
        via: 'parichay',
      }),
      user: toUserDTO(user),
      sso: { provider: 'Parichay', mode: 'sandbox' },
    });
  }),
);

/**
 * @openapi
 * /auth/refresh:
 *   post:
 *     tags: [Auth]
 *     summary: Exchange the refresh cookie for a new access token
 *     responses:
 *       200: { description: New access token issued }
 *       401: { description: Refresh token missing or expired }
 */
authRouter.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const token = req.cookies?.[REFRESH_COOKIE];
    if (!token) throw unauthorized('No refresh token');

    let payloadSub: string;
    try {
      payloadSub = verifyRefreshToken(token).sub;
    } catch {
      throw unauthorized('Your session has expired — please sign in again');
    }

    const user = await prisma.user.findUnique({ where: { id: payloadSub }, include: userInclude });
    if (!user || !user.active) throw unauthorized('Account is no longer active');

    res.json({
      accessToken: signAccessToken({
        sub: user.id,
        role: user.role,
        departmentId: user.departmentId,
        name: user.name,
      }),
      user: toUserDTO(user),
    });
  }),
);

/**
 * @openapi
 * /auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Clear the refresh cookie
 *     responses:
 *       200: { description: Signed out }
 */
authRouter.post('/logout', (_req, res) => {
  res.clearCookie(REFRESH_COOKIE, { ...refreshCookieOptions, maxAge: undefined });
  res.json({ ok: true });
});

/**
 * @openapi
 * /auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Hydrate the signed-in user
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: The current user }
 *       401: { description: Not signed in }
 */
authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const me = currentUser(req);
    const user = await prisma.user.findUnique({ where: { id: me.sub }, include: userInclude });
    if (!user) throw unauthorized('Account no longer exists');
    res.json({ user: toUserDTO(user), via: me.via ?? 'password' });
  }),
);

/* ------------------------------------------------------------- signup flow */

// Registration and resend are the two endpoints that cost real money (email) and
// can be used to spam an inbox, so both are rate limited by IP.
const signupLimiter = rateLimit({
  windowMs: 60 * 60_000,
  max: env.SIGNUP_RATE_LIMIT_PER_HOUR,
  // Only successful registrations/resends spend the budget — a validation error
  // sends no email, so it must not count against the user.
  countOnlySuccess: true,
});

/**
 * @openapi
 * /auth/signup:
 *   post:
 *     tags: [Auth]
 *     summary: Self-register as an employee (sends an email OTP)
 *     description: >
 *       Creates a PENDING_VERIFICATION account and emails a 6-digit code. The role
 *       is forced to EMPLOYEE server-side — self-registration can never create a
 *       manager or administrator. Restricted to the configured government domains.
 *       Rate limited per IP.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, designation, departmentId, password, confirmPassword]
 *             properties:
 *               name: { type: string, example: "Anita Rao" }
 *               email: { type: string, example: "anita.rao@gov.in" }
 *               designation: { type: string, example: "Junior Clerk" }
 *               departmentId: { type: string }
 *               password: { type: string, example: "Sunrise@2026" }
 *               confirmPassword: { type: string, example: "Sunrise@2026" }
 *     responses:
 *       201:
 *         description: Registered — OTP sent
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 email: { type: string }
 *                 status: { type: string, example: PENDING_VERIFICATION }
 *                 expiresInSeconds: { type: integer, example: 600 }
 *                 devOtp: { type: string, description: "Development + console mail mode only" }
 *                 previewUrl: { type: string, description: "Ethereal preview link" }
 *       400: { description: Disallowed email domain or invalid department }
 *       409: { description: An active account already uses this email }
 *       429: { description: Rate limited }
 */
authRouter.post(
  '/signup',
  signupLimiter,
  validateBody(signupSchema),
  asyncHandler(async (req, res) => {
    const result = await registerEmployee(body<SignupInput>(req));
    res.status(201).json({ ...result, maskedEmail: maskEmail(result.email) });
  }),
);

/**
 * @openapi
 * /auth/signup/verify-otp:
 *   post:
 *     tags: [Auth]
 *     summary: Verify the emailed code
 *     description: >
 *       On success the account moves to PENDING_APPROVAL and every administrator is
 *       notified. Codes expire after 10 minutes and lock after 5 wrong attempts.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, code]
 *             properties:
 *               email: { type: string, example: "anita.rao@gov.in" }
 *               code: { type: string, example: "482913" }
 *     responses:
 *       200: { description: Verified — awaiting administrator approval }
 *       400: { description: Wrong, expired or locked code (details.attemptsLeft) }
 */
authRouter.post(
  '/signup/verify-otp',
  validateBody(verifyOtpSchema),
  asyncHandler(async (req, res) => {
    const { email, code } = body<VerifyOtpInput>(req);
    res.json(await verifyOtp(email, code));
  }),
);

/**
 * @openapi
 * /auth/signup/resend-otp:
 *   post:
 *     tags: [Auth]
 *     summary: Send a fresh code, invalidating the previous one
 *     description: 30-second cooldown enforced server-side; 429 carries `details.retryAfter`.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string, example: "anita.rao@gov.in" }
 *     responses:
 *       200: { description: New code sent }
 *       429: { description: Cooldown still active }
 */
authRouter.post(
  '/signup/resend-otp',
  signupLimiter,
  validateBody(resendOtpSchema),
  asyncHandler(async (req, res) => {
    const { email } = body<ResendOtpInput>(req);
    const result = await resendOtp(email);
    res.json({ ...result, maskedEmail: maskEmail(result.email) });
  }),
);

/**
 * @openapi
 * /auth/signup/departments:
 *   get:
 *     tags: [Auth]
 *     summary: Departments available on the registration form
 *     description: Public — the signup form needs it before any token exists.
 *     responses:
 *       200: { description: Departments }
 */
authRouter.get(
  '/signup/departments',
  asyncHandler(async (_req, res) => {
    const departments = await prisma.department.findMany({
      orderBy: { code: 'asc' },
      select: { id: true, code: true, name: true, nameHi: true },
    });
    res.json({ items: departments, allowedDomains: allowedEmailDomains });
  }),
);
