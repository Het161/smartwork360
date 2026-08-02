import path from 'node:path';
import swaggerJsdoc from 'swagger-jsdoc';
import { env } from './env';

/**
 * Swagger is generated from the @openapi JSDoc blocks next to each route, so the
 * docs can never drift from the implementation. Globs cover both the tsx-run
 * sources (development) and the compiled output (production).
 */
export const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'SMARTWORK 360 API',
      version: '1.0.0',
      description: [
        'AI + Blockchain-backed Smart Task & Performance Management System for Government Offices.',
        '',
        '**Authentication** — sign in via `POST /auth/login` with a seeded account',
        '(e.g. `rajesh.iyer@gov.in` / `Demo@123`), then click **Authorize** and paste the',
        '`accessToken`.',
        '',
        '**Audit trail** — every mutating endpoint appends a SHA-256 block inside the same',
        'database transaction. `GET /audit/verify` re-derives the whole chain.',
        '',
        '**Parichay SSO** is a clearly-labelled *sandbox simulation*, not a real NIC integration.',
      ].join('\n'),
      contact: { name: 'SMARTWORK 360 — SIH prototype' },
      license: { name: 'Prototype / evaluation use' },
    },
    servers: [
      { url: `http://localhost:${env.PORT}/api/v1`, description: 'Local development' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
    },
    tags: [
      { name: 'Auth', description: 'Sign-in, refresh, and mock Parichay SSO' },
      { name: 'Users', description: 'Directory and individual performance' },
      { name: 'Departments', description: 'Government departments' },
      { name: 'Tasks', description: 'Task lifecycle — every change is audited' },
      { name: 'Analytics', description: 'KPIs, SLA compliance, trends, workload' },
      { name: 'Sentiment', description: 'Team morale from task-update text' },
      { name: 'Burnout', description: 'Per-employee burnout risk scoring' },
      { name: 'Fraud', description: 'Anomaly detection and alert triage' },
      { name: 'Audit', description: 'Tamper-evident SHA-256 hash chain' },
      { name: 'Chat', description: 'Grounded AI task assistant' },
      { name: 'Notifications', description: 'SLA and assignment notifications' },
      { name: 'Reports', description: 'CSV exports' },
    ],
  },
  apis: [
    path.join(__dirname, '../modules/**/*.routes.ts'),
    path.join(__dirname, '../modules/**/*.routes.js'),
  ],
});

/** Counts the documented operations — the README claims "30+ REST APIs". */
export function countDocumentedRoutes(): number {
  const spec = swaggerSpec as { paths?: Record<string, Record<string, unknown>> };
  const methods = new Set(['get', 'post', 'put', 'patch', 'delete']);
  let count = 0;
  for (const operations of Object.values(spec.paths ?? {})) {
    for (const method of Object.keys(operations)) {
      if (methods.has(method.toLowerCase())) count += 1;
    }
  }
  return count;
}
