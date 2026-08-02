/**
 * Vercel serverless entry point for the SMARTWORK 360 API.
 *
 * Lives at the repository root rather than inside `apps/api` because Vercel
 * resolves npm workspaces from the root lockfile. Pointing the project at a
 * sub-directory makes the workspace packages (`@smartwork/shared`) unresolvable
 * at install time.
 *
 * `apps/api/src/server.ts` is still the long-running listener used locally; this
 * module exports the same Express app without calling `.listen()`.
 */
import { createApp } from '../apps/api/src/app';

export default createApp();
