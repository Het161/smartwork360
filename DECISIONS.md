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
