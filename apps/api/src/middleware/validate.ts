import type { NextFunction, Request, Response } from 'express';
import type { ZodSchema } from 'zod';

/**
 * Validates and REPLACES req.body / req.query with the parsed result, so handlers
 * receive coerced types (dates, numbers, booleans) rather than raw strings.
 */
export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) return next(result.error);
    req.body = result.data;
    return next();
  };
}

export function validateQuery<T>(schema: ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query);
    if (!result.success) return next(result.error);
    // req.query has only a getter in Express 5; assign through defineProperty so
    // the same code works if the app is upgraded.
    Object.defineProperty(req, 'query', { value: result.data, writable: true, configurable: true });
    return next();
  };
}

/** Typed accessor for a validated body. */
export function body<T>(req: Request): T {
  return req.body as T;
}

/** Typed accessor for a validated query string. */
export function query<T>(req: Request): T {
  return req.query as unknown as T;
}
