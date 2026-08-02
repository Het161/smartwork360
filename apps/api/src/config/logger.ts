import pino from 'pino';
import { env, isProd } from './env';

export const logger = pino({
  level: env.LOG_LEVEL,
  // Structured JSON in production; readable single lines during a demo.
  ...(isProd
    ? {}
    : {
        transport: undefined,
        formatters: {
          level: (label: string) => ({ level: label }),
        },
      }),
  base: { service: 'smartwork360-api' },
});
