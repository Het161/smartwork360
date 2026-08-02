import { Router } from 'express';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { asyncHandler, unauthorized } from '../../middleware/errors';
import { scanSla } from '../../jobs/sla.cron';

export const jobsRouter = Router();

/**
 * Scheduled jobs, triggered by an external scheduler.
 *
 * Locally `node-cron` runs the SLA scan inside the server process. A serverless
 * runtime has no process between requests, so Vercel Cron calls this endpoint
 * instead — the same `scanSla()` function, a different trigger.
 *
 * Vercel signs its cron requests with `Authorization: Bearer $CRON_SECRET`. If
 * `CRON_SECRET` is set, it is required; if it is not set (local development), the
 * endpoint is open so it can be poked by hand.
 */
function assertCronCaller(req: import('express').Request) {
  if (!env.CRON_SECRET) return;
  const header = req.headers.authorization;
  if (header !== `Bearer ${env.CRON_SECRET}`) {
    throw unauthorized('This endpoint is only callable by the scheduler');
  }
}

/**
 * @openapi
 * /jobs/sla-scan:
 *   post:
 *     tags: [Jobs]
 *     summary: Run the SLA breach scan (scheduler-triggered)
 *     description: >
 *       Creates notifications for tasks that have breached their SLA or are due
 *       within 24 hours. Idempotent — a task produces at most one notice of each
 *       kind, so repeated runs do not spam anyone.
 *     responses:
 *       200: { description: Counts of breached and nearing tasks }
 *       401: { description: Missing or wrong CRON_SECRET }
 */
jobsRouter.post(
  '/sla-scan',
  asyncHandler(async (req, res) => {
    assertCronCaller(req);
    const result = await scanSla();
    logger.info(result, 'SLA scan completed via scheduler');
    res.json({ ok: true, ...result, ranAt: new Date().toISOString() });
  }),
);

/**
 * @openapi
 * /jobs/sla-scan:
 *   get:
 *     tags: [Jobs]
 *     summary: Same scan over GET, because Vercel Cron issues GET requests
 *     responses:
 *       200: { description: Counts of breached and nearing tasks }
 */
jobsRouter.get(
  '/sla-scan',
  asyncHandler(async (req, res) => {
    assertCronCaller(req);
    const result = await scanSla();
    logger.info(result, 'SLA scan completed via scheduler');
    res.json({ ok: true, ...result, ranAt: new Date().toISOString() });
  }),
);
