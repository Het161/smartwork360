/**
 * Serverless entry point for Vercel.
 *
 * `src/server.ts` is the long-running listener used locally. Vercel invokes a
 * handler per request instead, so this module exports the Express app without
 * calling `.listen()`.
 *
 * Two things deliberately do NOT run here:
 *   • the SLA cron — a serverless function has no process between requests;
 *     Vercel Cron hits `/api/v1/jobs/sla-scan` on a schedule instead.
 *   • the mailer boot check — it would run on every cold start; the transport is
 *     created lazily on first send anyway.
 */
import { createApp } from '../src/app';

export default createApp();
