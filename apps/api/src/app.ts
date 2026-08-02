import express, { type Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import swaggerUi from 'swagger-ui-express';
import { corsOrigins } from './config/env';
import { countDocumentedRoutes, swaggerSpec } from './config/swagger';
import { buildApiRouter } from './routes';
import { errorHandler, notFoundHandler } from './middleware/errors';

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
    res.json({
      status: 'ok',
      service: 'smartwork360-api',
      documentedRoutes: countDocumentedRoutes(),
      time: new Date().toISOString(),
    });
  });

  app.use(
    '/docs',
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, {
      customSiteTitle: 'SMARTWORK 360 API',
      swaggerOptions: { persistAuthorization: true, docExpansion: 'none', filter: true },
    }),
  );
  app.get('/openapi.json', (_req, res) => res.json(swaggerSpec));

  app.use('/api/v1', buildApiRouter());

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
