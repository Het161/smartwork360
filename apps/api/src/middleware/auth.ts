import type { NextFunction, Request, Response } from 'express';
import type { Role } from '@smartwork/shared';
import { verifyAccessToken, type AccessTokenPayload } from '../auth/jwt';
import { forbidden, unauthorized } from './errors';

export interface AuthenticatedRequest extends Request {
  user: AccessTokenPayload;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AccessTokenPayload;
    }
  }
}

/** Rejects the request unless a valid, unexpired access token is present. */
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next(unauthorized('Missing bearer token'));
  }
  try {
    req.user = verifyAccessToken(header.slice(7));
    return next();
  } catch {
    return next(unauthorized('Your session has expired — please sign in again'));
  }
}

/** Route-level role gate. Query-level scoping is applied separately in `scope.ts`. */
export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) {
      return next(forbidden(`This action requires the ${roles.join(' or ')} role`));
    }
    return next();
  };
}

/** Narrowing helper — every guarded handler receives a user. */
export function currentUser(req: Request): AccessTokenPayload {
  if (!req.user) throw unauthorized();
  return req.user;
}
