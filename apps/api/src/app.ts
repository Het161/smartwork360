import express, { type Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { corsOrigins } from './config/env';

/**
 * Builds the Express application. Routers, Swagger and the SLA cron are mounted
 * here from Phase 1 onwards.
 */
export function createApp(): Application {
  const app = express();

  app.disable('x-powered-by');
  app.use(
    helmet({
      // Swagger UI needs inline styles/scripts; it is a dev-facing surface.
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(cors({ origin: corsOrigins, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'smartwork360-api', time: new Date().toISOString() });
  });

  return app;
}
