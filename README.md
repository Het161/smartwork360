# SMARTWORK 360

**AI + Blockchain-backed Smart Task & Performance Management System for Government Offices**

Smart India Hackathon prototype. Replaces manual follow-ups and opaque reporting in government
departments with role-based dashboards (Admin / Manager / Employee), AI-driven insights
(sentiment, burnout, fraud/anomaly detection, task assistant) and a tamper-evident SHA-256
hash-chain audit trail.

> Full quickstart, architecture diagram, model cards and API summary are completed in Phase 6.
> See `DECISIONS.md` for the engineering log and `DEMO.md` for the 7-minute judge script.

## Quickstart

```bash
docker compose up -d     # PostgreSQL 16 (skip if you already run postgres on :5432)
npm install              # installs all four workspaces
npm run seed             # migrate + seed a realistic government office
npm run dev              # web :3000  +  api :4000
npm run dev:ml           # optional — FastAPI ML service on :8000
```

## Layout

```
apps/web       Next.js 14 App Router — all three role dashboards
apps/api       Express + Prisma REST API + Swagger at /docs
services/ml    Python FastAPI — sentiment, burnout, anomaly, chat intents
packages/shared  Shared TypeScript types + zod schemas
```

Ports: web `3000`, api `4000`, ml `8000`, postgres `5432`.
