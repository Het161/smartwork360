import jwt, { type SignOptions } from 'jsonwebtoken';
import type { Role } from '@smartwork/shared';
import { env } from '../config/env';

export interface AccessTokenPayload {
  sub: string;
  role: Role;
  departmentId: string;
  name: string;
  /** Marks sessions established through the mock Parichay SSO screen. */
  via?: 'password' | 'parichay';
}

export interface RefreshTokenPayload {
  sub: string;
  tokenType: 'refresh';
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.ACCESS_TOKEN_TTL,
    issuer: 'smartwork360',
  } as SignOptions);
}

export function signRefreshToken(userId: string): string {
  return jwt.sign({ sub: userId, tokenType: 'refresh' }, env.JWT_REFRESH_SECRET, {
    expiresIn: env.REFRESH_TOKEN_TTL,
    issuer: 'smartwork360',
  } as SignOptions);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET, { issuer: 'smartwork360' }) as AccessTokenPayload;
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  return jwt.verify(token, env.JWT_REFRESH_SECRET, {
    issuer: 'smartwork360',
  }) as RefreshTokenPayload;
}

export const REFRESH_COOKIE = 'sw360_refresh';

export const refreshCookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: env.NODE_ENV === 'production',
  path: '/',
  maxAge: 7 * 24 * 60 * 60 * 1000,
};
