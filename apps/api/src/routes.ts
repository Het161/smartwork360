import { Router } from 'express';
import { authRouter } from './modules/auth/auth.routes';
import { auditRouter } from './modules/audit/audit.routes';

/** Everything is mounted under /api/v1. */
export function buildApiRouter(): Router {
  const api = Router();

  api.use('/auth', authRouter);
  api.use('/audit', auditRouter);

  return api;
}
