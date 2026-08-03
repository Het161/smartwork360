import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { logger } from '../config/logger';

/**
 * Recent failures, keyed by correlation id.
 *
 * Saarthi Support looks the real error up here instead of trusting the copy the
 * browser sends: the client's version can be edited by whoever is sitting in
 * front of it, and it is about to be fed to a language model. Bounded and
 * short-lived — this is a diagnostic buffer, not storage.
 */
export interface ErrorRecord {
  correlationId: string;
  method: string;
  path: string;
  status: number;
  code: string;
  message: string;
  details?: unknown;
  userId?: string;
  at: number;
}

const ERROR_TTL_MS = 30 * 60_000;
const ERROR_CAP = 500;
const recentErrors = new Map<string, ErrorRecord>();

function rememberError(rec: ErrorRecord) {
  recentErrors.set(rec.correlationId, rec);
  // Map preserves insertion order, so the oldest key is the first one.
  while (recentErrors.size > ERROR_CAP) {
    const oldest = recentErrors.keys().next().value;
    if (oldest === undefined) break;
    recentErrors.delete(oldest);
  }
}

/** Returns a remembered failure, or null once it has aged out. */
export function getErrorRecord(correlationId: string): ErrorRecord | null {
  const rec = recentErrors.get(correlationId);
  if (!rec) return null;
  if (Date.now() - rec.at > ERROR_TTL_MS) {
    recentErrors.delete(correlationId);
    return null;
  }
  return rec;
}

/** Attaches a correlation id to every request so a failure can be traced. */
export function correlationId(req: Request, res: Response, next: NextFunction) {
  const id = randomUUID();
  (req as Request & { correlationId?: string }).correlationId = id;
  res.setHeader('x-correlation-id', id);
  next();
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = 'ERROR',
    public details?: unknown,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const badRequest = (msg: string, details?: unknown) =>
  new HttpError(400, msg, 'BAD_REQUEST', details);
export const unauthorized = (msg = 'Authentication required') =>
  new HttpError(401, msg, 'UNAUTHORIZED');
export const forbidden = (msg = 'You do not have access to this resource') =>
  new HttpError(403, msg, 'FORBIDDEN');
export const notFound = (msg = 'Resource not found') => new HttpError(404, msg, 'NOT_FOUND');
export const conflict = (msg: string) => new HttpError(409, msg, 'CONFLICT');

/** Wraps an async route handler so rejected promises reach the error middleware. */
export function asyncHandler<T extends Request>(
  fn: (req: T, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    void Promise.resolve(fn(req as T, res, next)).catch(next);
  };
}

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `No route for ${req.method} ${req.originalUrl}`,
      correlationId: cidOf(req),
    },
  });
}

const cidOf = (req: Request) =>
  (req as Request & { correlationId?: string }).correlationId ?? 'unknown';

/** Records the failure and returns the body to send. */
function fail(
  req: Request,
  status: number,
  code: string,
  message: string,
  details?: unknown,
) {
  const correlationId = cidOf(req);
  rememberError({
    correlationId,
    method: req.method,
    path: req.originalUrl,
    status,
    code,
    message,
    details,
    userId: (req as Request & { user?: { sub?: string } }).user?.sub,
    at: Date.now(),
  });
  return { error: { code, message, details, correlationId } };
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res
      .status(422)
      .json(
        fail(
          req,
          422,
          'VALIDATION_ERROR',
          'Some fields need attention',
          err.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
        ),
      );
  }

  if (err instanceof HttpError) {
    return res.status(err.status).json(fail(req, err.status, err.code, err.message, err.details));
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      const target = (err.meta?.target as string[] | undefined)?.join(', ') ?? 'value';
      return res.status(409).json(fail(req, 409, 'CONFLICT', `That ${target} is already in use`));
    }
    if (err.code === 'P2025') {
      return res.status(404).json(fail(req, 404, 'NOT_FOUND', 'Resource not found'));
    }
  }

  logger.error({ err, correlationId: cidOf(req) }, 'Unhandled error');
  return res
    .status(500)
    .json(fail(req, 500, 'INTERNAL_ERROR', 'Something went wrong on our side'));
}
