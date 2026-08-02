# DECISIONS

Every non-obvious engineering decision, with one line of reasoning. Newest phase last.

## Phase 0 — Scaffold

| # | Decision | Reasoning |
|---|---|---|
| 0.1 | Project root is the `SIH/` folder itself (not a nested `smartwork360/`) | The user asked for everything in this folder and nowhere else. |
| 0.2 | `git init` a **separate repo inside `SIH/`** even though `~/Desktop` is already a git repo | The parent repo has thousands of unrelated dirty files; scoped phase commits would be impossible otherwise. |
| 0.3 | npm workspaces instead of Turborepo/pnpm | Zero extra tooling to install on a judge's machine; `npm install` at root wires all four packages. |
| 0.4 | Postgres runs in Docker **or** locally — same credentials either way | A local Homebrew postgres already occupied :5432; matching `smartwork/smartwork/smartwork360` in `docker-compose.yml` means one `DATABASE_URL` works in both cases with no port juggling mid-demo. |
| 0.5 | `@smartwork/shared` compiles to `dist/` (CJS + d.ts) rather than exporting raw TS | Express (tsc build) and Next (bundler resolution) consume the same artifact reliably; avoids `rootDir` conflicts. |
| 0.6 | Enums are re-declared in `shared/enums.ts` instead of re-exported from `@prisma/client` | Lets the browser bundle use `Role`/`TaskStatus` without pulling the Prisma runtime into the client. |
| 0.7 | Fonts via `@fontsource` npm packages, not `next/font/google` | `next/font/google` fetches from Google at **build** time; an offline build would fail. @fontsource ships the woff2 files inside node_modules — genuinely offline-proof, which the ground rules demand. |
| 0.8 | PWA via a hand-written `manifest.webmanifest` + a small service worker, not `next-pwa` | `next-pwa` injects a Workbox webpack pipeline that is fragile across Next/Node versions; the requirement is "manifest + installable", which 40 lines achieve with zero build risk. |
| 0.9 | shadcn/ui components are hand-authored on Radix primitives + CVA rather than pulled by the `shadcn` CLI | The CLI needs network access and writes its own config; shadcn is copy-paste source anyway, so vendoring it keeps the repo offline-installable. |
| 0.10 | `eslint.ignoreDuringBuilds = true` in Next | Lint runs from the repo root (`npm run lint`); a style nit must never break a demo build. |
| 0.11 | Status-transition rules live in `shared/enums.ts` (`STATUS_TRANSITIONS`) | Both the API validator and the kanban board need the same truth; an invalid jump must never reach the audit chain. |

## Phase 1 — Data + Auth + Audit core

| # | Decision | Reasoning |
|---|---|---|
| 1.1 | Prisma targets a dedicated `smartwork` Postgres **schema**, not `public` | The local `smartwork360` database already held an earlier prototype of this project (`blockchain_audit`, `gps_logs`, 11 users). Isolating the schema builds cleanly without destroying the user's existing data, and the same `DATABASE_URL` still works under Docker. |
| 1.2 | `createdAt` is generated in `appendEvent`, not by the DB default | It is part of the hash pre-image; the value hashed and the value stored must be byte-identical or verification fails on the very first block. |
| 1.3 | `canonicalJson` sorts object keys before hashing | Postgres `jsonb` does not preserve key order, so a payload read back would otherwise hash differently than when written. |
| 1.4 | Merkle tree promotes odd nodes instead of duplicating the last leaf | Bitcoin's duplicate-leaf approach admits the CVE-2012-2459 duplicate-root ambiguity; promotion is unambiguous. |
| 1.5 | The seed builds the chain with `linkEvents()` (one pass) rather than 887 `appendEvent` calls | `appendEvent` must re-read the chain head each call — correct under concurrent API writes, but 887 round-trips in a seed. Both share the same hash formula, so the chains are indistinguishable. |
| 1.6 | Seed content is hand-authored, not faker-generated | faker's Indian locale yields name/designation/task combinations that read as fake to anyone who has seen a district office. This data is what sells the demo. |
| 1.7 | Seeded sentiment uses the same TS lexicon the API falls back to | Morale dashboards are fully populated on a fresh seed even if the Python service never starts — the ground rule is that the demo cannot break offline. |
| 1.8 | The 12th fraud alert is labelled **not** confirmed, and it is Ramesh's after-hours spike | Precision is 11/12 = 92% because one alert is an honest false positive: sustained late-night activity that turned out to be burnout, not misuse. A hand-tuned 12/12 would be a fabricated statistic. |
| 1.9 | Overdue tasks are drawn *from* the pending/in-progress buckets rather than being a fifth bucket | A task is overdue *and* in-progress; modelling OVERDUE as a status would misrepresent the workflow. `isOverdue` stays derived. |
| 1.10 | `demo:tamper` uses `$executeRaw` against `smartwork.audit_events` | It must bypass `audit.service` completely — that is the whole point of the demo. Going through Prisma's model API would append a legitimate block instead. |
| 1.11 | RBAC is applied as Prisma `where` fragments (`middleware/scope.ts`), not just route guards | A hand-crafted request must not be able to read another department's rows; filtering in the query is the only enforcement that survives that. |

## Phase 2 — Full API

| # | Decision | Reasoning |
|---|---|---|
| 2.1 | 51 documented endpoints, not the 30 the brief asked for | The screens in the spec need them (SLA policy editor, CSV exports, scatter data, precision stat, suggestions). Every one is reachable and Swagger-documented — the count is real, not padded. |
| 2.2 | `diffFields()` records only fields that actually changed | An audit payload is evidence. Dumping the whole row on every edit makes the chain unreadable and hides what a reviewer needs to see. |
| 2.3 | Maker-checker separation enforced in the service, on BOTH completion paths | `POST /tasks/:id/status` and `POST /tasks/:id/review` can each reach COMPLETED, so the "you cannot approve your own task" rule is checked in both. Verified against a manager assigned their own task. |
| 2.4 | The fraud detector reads the AUDIT CHAIN, not the task table | The chain is the one record that cannot be quietly rewritten — which is exactly what a fraud detector should be reading. Verified: it independently scores Vikas Meena at 0.990 vs 0.300 for the next user. |
| 2.5 | Runtime fraud alerts are stored with `labelConfirmed = null` | Precision is computed over the labelled evaluation set only, so pressing "Run Scan Now" repeatedly can never inflate the 92% figure. |
| 2.6 | `runScan` de-duplicates on (userId, type) for OPEN alerts | Pressing the scan button during a demo must not manufacture alerts. |
| 2.7 | ML client caches "service down" for 30s and skips the network | Otherwise every dashboard request would pay the full 8s timeout when the Python service is not running. |
| 2.8 | Burnout feature extraction lives in the API, not the ML service | Keeps the Python side stateless, and guarantees the heuristic fallback scores identical inputs to the model path. |
| 2.9 | SLA cron de-duplicates on (userId, title, link) | A demo left running for ten minutes would otherwise generate hundreds of duplicate breach notices. |
| 2.10 | Open tasks whose SLA window silently elapsed are pushed into the future by the seed | Without this, 73 of 144 tasks read as overdue — "everything is late" contradicts the improvement story the trend charts are meant to tell. Now exactly 23 are overdue and 9 are due today. |
| 2.11 | Priority sorting is done in memory | `Priority` is a Postgres enum, so `ORDER BY priority` sorts alphabetically (CRITICAL, HIGH, LOW, MEDIUM) — wrong. The shared `PRIORITY_ORDER` map is applied after fetch. |
| 2.12 | CSV exports are prefixed with a UTF-8 BOM | Excel otherwise mangles the Devanagari department names. |
