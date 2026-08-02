import { env } from './config/env';
import { logger } from './config/logger';
import { createApp } from './app';

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info(`SMARTWORK 360 API listening on http://localhost:${env.PORT}`);
  logger.info(`Swagger docs        http://localhost:${env.PORT}/docs`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    logger.info(`${signal} received — shutting down`);
    server.close(() => process.exit(0));
  });
}
