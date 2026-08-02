import { env } from './config/env';
import { logger } from './config/logger';
import { createApp } from './app';
import { countDocumentedRoutes } from './config/swagger';
import { startSlaCron, stopSlaCron } from './jobs/sla.cron';
import { initMailer } from './mail/mailer.service';

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info(`SMARTWORK 360 API listening on http://localhost:${env.PORT}`);
  logger.info(`Swagger docs        http://localhost:${env.PORT}/docs`);
  logger.info(`${countDocumentedRoutes()} documented REST endpoints`);
  startSlaCron();
  void initMailer();
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    logger.info(`${signal} received — shutting down`);
    stopSlaCron();
    server.close(() => process.exit(0));
  });
}
