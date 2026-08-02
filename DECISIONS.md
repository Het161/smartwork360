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

## Phase 3 — Web foundation + Employee

| # | Decision | Reasoning |
|---|---|---|
| 3.1 | `Dict` widens `as const` literals via a mapped type | With a plain `typeof en`, every Hindi string had to *equal* the English literal. The mapped type keeps keys required (a missing translation is still a compile error) while allowing real translations. |
| 3.2 | i18n starts at `en` and applies the stored language in an effect | Reading localStorage during render would desynchronise server and client HTML and trigger a hydration mismatch. |
| 3.3 | One silent refresh + replay on a 401, coalesced across concurrent calls | A 15-minute access token must never interrupt a demo mid-click, and a dashboard firing six parallel queries must not fire six refreshes. |
| 3.4 | Avatars are deterministic initials, not images | No network request, so they render offline; and the same person keeps the same colour on every screen. |
| 3.5 | Drawers/modals are built on Radix Dialog | Focus trapping, Escape handling and scroll locking are WCAG requirements, not conveniences — Radix gets them right. |
| 3.6 | Added an `open=true` filter to `GET /tasks` | "Today's Focus" sorted by `dueDate asc` returned the oldest *completed* tasks and rendered empty. Filtering server-side beats over-fetching 100 rows to discard most of them. |
| 3.7 | Seed snaps update/transition timestamps into working hours (`officeHours`) | Uniformly-distributed timestamps gave **every** employee a ~50% night-time activity ratio, which destroyed the meaning of the after-hours burnout factor and the fraud detector's `night_hour_ratio`. Only the planted personas work at night now. |
| 3.8 | Sub-hour cycle times bypass the working-hours snap | The planted "completed in 4 minutes" case is the evidence behind an `UNUSUAL_CYCLE_TIME` alert; snapping it to office hours silently destroyed it (it became 23h). |
| 3.9 | Vikas's night burst is concentrated into one hour per night | A bulk record rewrite happens in a single sitting. It also makes the burst detectable as `actionsPerHour`, not only as a night-time ratio. |
| 3.10 | `night_hour_ratio` threshold lowered 0.35 → 0.20 | Measured against the seeded population: ordinary staff record 5–11% of actions at night, so 20% is already ~3× baseline. 0.35 only fired on someone working *exclusively* at night. |
| 3.11 | Kavita Joshi (the Employee quick-login) gets a planted healthy queue | Her dashboard is the first screen a judge sees; with the plain random allocation she had 2 tasks and 33% on-time, which undersells the product. |
| 3.12 | Announcements are seeded for every user, not just managers | The Employee dashboard has an Announcements card and it must never be empty on a fresh seed. |

## Phase 4 — Manager + Admin

| # | Decision | Reasoning |
|---|---|---|
| 4.1 | Kanban drag validates against `canTransition` **before** calling the API | The board and the server share the transition graph from `@smartwork/shared`; failing locally gives an instant readable reason instead of an optimistic move that snaps back. |
| 4.2 | Drag is optimistic with rollback on error | The card must move the instant it is dropped; if the API rejects it, the previous board is restored and the reason is shown. |
| 4.3 | Columns the card cannot legally move to dim during a drag | Teaches the workflow rules through the UI rather than through error messages. |
| 4.4 | The drag handle is a separate control from the card body | Keyboard users can open the drawer without triggering a drag, and a 6px activation distance stops a click being read as a drag. |
| 4.5 | The assignee picker shows each person's live load, sorted lightest-first | A manager should not pile another file onto whoever is already drowning — this is the screen where that decision is actually made. |
| 4.6 | The sentiment-vs-load chart is labelled "Correlation, not causation" | Overlaying two series invites a causal reading the data does not support. |
| 4.7 | **Seed bug:** `weightedPriority()` was called twice per task | The cycle time was derived from a *different* random priority than the task's own, so a CRITICAL task with a 24h SLA was routinely measured against LOW's 168h window — CRITICAL and HIGH showed 0% compliance. Now drawn once. |
| 4.8 | **Seed bug:** `officeHours()` weekend-shifted completion times | Adding 24–48h to a task with a 24h SLA silently converted an intended on-time completion into a breach. Weekend shifting now applies to update timestamps only. |
| 4.9 | **Seed bug:** pick-up time was a flat 2–30h regardless of SLA | A CRITICAL task could be *started* after its own 24h deadline had passed, making compliance impossible. Pick-up is now a fraction of the SLA window. |
| 4.10 | Completion times are clamped so rounding cannot flip an SLA outcome | The intended cycle decides whether a task met its SLA; snapping to a working hour must not change that verdict in either direction. |
| 4.11 | Completed-task ages are spread **evenly** across the 90-day window | Random ages cluster, leaving gaps in the trend chart and adding more noise to the older-half/recent-half cycle-time comparison than the trend itself carries (it measured 7.9% at one point). Evenly spread, the measured improvement is a stable 32.5%. |
| 4.12 | The cycle-time improvement figure is displayed live, not hard-coded | Whatever the data says is what the screen shows. It currently reads 32.5% org-wide, inside the claimed 30–40% band, and would change honestly if the data did. |

## Phase 5 — ML service

| # | Decision | Reasoning |
|---|---|---|
| 5.1 | Core requirements are unpinned; the model stack is a separate opt-in file | Pinned `pydantic==2.9.2` failed on Python 3.14 (no wheel, falls back to a Rust source build). The demo must never depend on a working Rust toolchain, so heuristic mode installs anywhere. |
| 5.2 | `HEURISTIC_MODE=true` is the default | The model path needs a ~250MB download on first run. Heuristic mode is a first-class path with the same contract, not a degraded one — and it is measurably the more accurate of the two on this domain. |
| 5.3 | The lexicon scores clauses separately and consumes phrase tokens | Negation was reaching across full stops ("no variance. **Good** to close" → negative) and phrases were double-counted as unigrams ("pareshan" −0.85 cancelled by "ho gaya" +0.6). Fixing both lifted held-out accuracy from 77.5% to 87.5%. |
| 5.4 | Three evaluation corpora, each retired once it influences a change | The first set reached 100% because the lexicon was tuned against it. Quoting that would be fitting to the test set. Only `office_comments_holdout.csv`, written after tuning stopped, is quoted. |
| 5.5 | A lexicon **neutrality gate** sits in front of DistilBERT in model mode | SST-2 is a *binary* classifier with no NEUTRAL class. Measured NEUTRAL recall was **0.08** — it labelled routine notes like "Placed the muster roll before the accounts branch" NEGATIVE with high confidence. The lexicon answers "is there any affect here at all?", which SST-2 structurally cannot. This lifted model mode from 65.0% to 85.0%. |
| 5.6 | The heuristic lexicon ships as the default even though a transformer is available | Measured on the held-out set: lexicon **87.5%**, DistilBERT+gate 85.0%, DistilBERT alone 65.0%. The lexicon is at least as accurate here, needs no download, and cannot break offline. Shipping the transformer for its own sake would be worse on every axis. |
| 5.7 | The Python and TypeScript lexicons are verified byte-identical | Checked across all 130 corpus comments, zero mismatches. If they diverged, a note scored −0.62 by the API would become −0.31 once the service started and the morale chart would jump for no visible reason. |
| 5.8 | IsolationForest is fitted on the batch **plus** a synthetic normal-staff cohort | Fitting on the batch alone lets a department where several people misbehave redefine "normal". |
| 5.9 | Anomaly reason tags are rule-derived in **both** modes | An IsolationForest gives a score but no explanation, and the Fraud Center shows those tags as the evidence a reviewer acts on. That explanation must not change with the mode. |
| 5.10 | The burnout model card states plainly that it is a calibrated expert rule | It is trained on synthetic data generated from the documented weighting. Presenting that as a finding discovered from real workforce data would be a lie. |
| 5.11 | The chat assistant generates no text at all | It classifies intent and fills a template from figures the API supplies, so it cannot hallucinate a task count. Unrecognised questions return the capability list rather than a plausible guess. |

## Phase 6 — Fraud Center, Audit Explorer, docs

| # | Decision | Reasoning |
|---|---|---|
| 6.1 | User and department primary keys are deterministic (`usr_rajesh_iyer`) | `demo:reset` re-seeds mid-demonstration. With `cuid()` ids every user is recreated with a new id, the signed-in JWT's subject stops resolving, and the presenter is thrown back to the login screen at step 7 of the script. Verified: a reset is now invisible to an open session. |
| 6.2 | The linked-block strip centres on the break instead of showing the newest 12 | The tamper script hits a mid-chain block (#386 of 962). Showing the tail of the chain hid the one thing the visual exists to demonstrate. It now fetches a window around the break and auto-scrolls to it. |
| 6.3 | Added `fromIndex`/`toIndex`/`order` to `GET /audit/events` | Needed to fetch a window around a specific block. Filtering server-side beats pulling hundreds of blocks to discard most of them. |
| 6.4 | "Show block #k in the ledger" jumps the table to the break | The ledger's first page shows the newest 25 blocks, so the tampered row was 22 pages away and effectively unreachable during a live demo. |
| 6.5 | Verification is padded to ~650ms in the UI | 962 blocks verify in 15ms, which on stage looks like the button did nothing. A brief spinner makes the work legible; the real duration is printed next to it, so nothing is misrepresented. |
| 6.6 | The Fraud Center explains *why* precision is 92% and not 100% | A round number invites suspicion. Stating that one alert is a labelled false positive, and that runtime alerts are excluded from the denominator, turns the statistic into evidence of rigour. |
| 6.7 | The tampered state renders a "What just happened" panel | The demo's whole point is that the edited row looks normal in the database. Saying so on screen means the audience does not have to take the presenter's word for it. |
| 6.8 | README leads with the measured numbers, including where a model *lost* | Reporting that DistilBERT scored 65% and that the lexicon beat it is more credible than quoting SST-2's published 91.3%, which is about movie reviews. |

## Feature — Self-registration with email OTP

| # | Decision | Reasoning |
|---|---|---|
| F.1 | `signupSchema` has **no** `role` field at all | Accepting a role — even a validated one — puts privilege escalation one crafted request away. The server sets `EMPLOYEE`. Verified by a test that posts `role: "ADMIN"` and gets an employee back. |
| F.2 | OTPs are stored as bcrypt hashes | A database dump must not hand an attacker a working verification code. The plaintext exists only in the email and in the process that generated it. |
| F.3 | Codes come from `crypto.randomInt`, not `Math.random()` | It is a credential. A predictable PRNG makes the code guessable from a known seed. |
| F.4 | `MAIL_MODE=console` is the default | The ground rule is that the demo cannot break offline, and mail is the one part of this feature that needs the network. Console mode prints a boxed OTP and the UI shows a labelled DEV chip. |
| F.5 | `devOtp` is returned only when `NODE_ENV !== production` **and** mail mode is console | It is exposed only when nothing was actually delivered to an inbox the user could open — never when a real email exists. |
| F.6 | A failed send does not fail the request | Registration succeeds and the user can resend. Losing an email must never lose an account. |
| F.7 | The rate limiter counts **successful** requests only | Counting failures would lock a user out of registration for an hour because they mistyped their password five times. The budget exists to stop mail-bombing, so it should be spent on emails, not attempts. Found when my own API tests exhausted the quota with validation errors. |
| F.8 | Blocked sign-ins return 403 with a specific code, checked **after** the password | The client needs to know whether to send the user back to the OTP step or just tell them to wait. Running the check after password verification keeps it useless for account enumeration. |
| F.9 | A half-finished registration is resumable, not a conflict | Only accounts past verification return 409. An abandoned signup refreshes its details and gets a new code instead of becoming a permanently unusable email address. |
| F.10 | Each step heading focuses **itself** on mount | Focusing from the parent on a `step` change does not work: with `AnimatePresence mode="wait"` the incoming heading has not mounted yet and the ref is null. Without this fix a keyboard user was dropped back to `<body>` after every transition — caught by the keyboard-only test, not by review. |
| F.11 | Every animation is gated on `prefers-reduced-motion` | WCAG 2.1. Reduced mode keeps opacity crossfades (which still signal "something changed") and drops movement, the ambient orbs and the confetti. |
| F.12 | The password meter labels score 0 as "Too short" rather than showing nothing | An empty label while the user is typing reads as a broken meter, not as "not good enough yet". |
| F.13 | Email templates are table-based with inline styles | The modern CSS used everywhere else in this project is exactly what Outlook does not support. |
| F.14 | Real SMTP credentials live in `apps/api/.env` (gitignored); `.env.example` carries placeholders | Verified: `git check-ignore` confirms the file is ignored and zero `.env` files are tracked. |
| F.15 | Department loading is an explicit `loading \| ready \| error` state with a retry | With the API unreachable, step 2 previously rendered an empty grid and the only clue was a small banner — the user reads that as "the Continue button is broken", not "the server is down". Step 1 now warns *before* they walk into it, and both steps name the exact URL that failed. |
