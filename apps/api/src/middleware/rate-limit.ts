import type { NextFunction, Request, Response } from 'express';
import { HttpError } from './errors';

/**
 * Small fixed-window rate limiter, in memory.
 *
 * Deliberately not `express-rate-limit`: this prototype runs as a single process,
 * and one Map is easier to reason about than a dependency. A multi-instance
 * deployment would need Redis — noted rather than pretended away.
 */
interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

// Sweep expired buckets so a long-running process cannot grow unbounded.
const SWEEP_INTERVAL = 5 * 60_000;
const sweeper = setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}, SWEEP_INTERVAL);
sweeper.unref?.();

export function rateLimit(opts: {
  windowMs: number;
  max: number;
  key?: (req: Request) => string;
  /**
   * Count only requests that actually succeeded (2xx).
   *
   * This matters for signup. The limit exists to stop someone mail-bombing an
   * inbox, and a rejected request sends no mail — so counting failures would only
   * punish a user who mistyped their password five times by locking them out of
   * registration for an hour. The budget should be spent on emails, not attempts.
   */
  countOnlySuccess?: boolean;
}) {
  return (req: Request, res: Response, next: NextFunction) => {
    const id = opts.key ? opts.key(req) : (req.ip ?? 'unknown');
    const now = Date.now();

    const existing = buckets.get(id);
    const active = existing && existing.resetAt > now ? existing : null;

    if (active && active.count >= opts.max) {
      const retryAfter = Math.ceil((active.resetAt - now) / 1000);
      return next(
        new HttpError(
          429,
          `Too many attempts. Try again in ${Math.ceil(retryAfter / 60)} minute(s).`,
          'RATE_LIMITED',
          { retryAfter },
        ),
      );
    }

    const charge = () => {
      const bucket = buckets.get(id);
      if (bucket && bucket.resetAt > Date.now()) bucket.count += 1;
      else buckets.set(id, { count: 1, resetAt: Date.now() + opts.windowMs });
    };

    if (opts.countOnlySuccess) {
      res.on('finish', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) charge();
      });
    } else {
      charge();
    }

    return next();
  };
}

/** Test hook — the limiter is process-global, so suites must be able to reset it. */
export function resetRateLimits() {
  buckets.clear();
}
