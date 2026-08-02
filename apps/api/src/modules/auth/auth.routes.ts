import { Router } from 'express';
import { loginSchema, parichayVerifySchema, type LoginInput, type ParichayVerifyInput } from '@smartwork/shared';
import { prisma } from '../../db/prisma';
import { env } from '../../config/env';
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
