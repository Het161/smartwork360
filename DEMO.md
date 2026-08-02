# DEMO — 7 minutes

Rehearsed script for SMARTWORK 360. Timings are cumulative.

## Before you start (2 minutes, off-stage)

```bash
docker compose up -d          # skip if postgres already runs on :5432
npm install
npm run seed
npm run dev                   # web :3000, api :4000
npm run dev:ml                # optional, second terminal — the app works without it
```

Open two windows:
- **Browser** at `http://localhost:3000` — signed out.
- **Terminal** in the repo root, font large enough to read from the back.

Verify once before going on stage:

```bash
curl -s localhost:4000/api/v1/auth/login -H 'content-type: application/json' \
  -d '{"email":"rajesh.iyer@gov.in","password":"Demo@123"}' | head -c 60
```

> **Password for every demo account: `Demo@123`.** The login screen has one-click
> chips for Admin / Manager / Employee — never type a password on stage.

Switching roles: avatar menu (top right) → **Sign out** → click the next chip.

---

## −0:40 — Optional opener: a new joinee registers

Skip this beat if you are tight on time; the main script stands alone.

From the login screen click **Register for an account**.

- **Step 1** — type name, designation, `anita.rao@gov.in`. The green tick pops on a
  valid government domain; try `@gmail.com` first to show the red cross and the
  refusal. Password meter fills as you type.
- **Step 2** — department cards animate in; pick one, the saffron check badge pops.
- **Step 3** — the envelope opens and a paper plane carries the code away. In
  console mode an amber **DEV** chip shows the OTP; on a second screen show the
  terminal box, or the Ethereal inbox if the venue wifi is good.
- Type one wrong digit first: the boxes shake and say *"4 attempts left"*. Then
  enter the real code — boxes turn green left to right.
- **Step 4** — checkmark draws, tricolour confetti fires once.

> "Self-registration can only ever create an Employee. The server sets the role —
> it is not taken from the request."

Now switch to Admin (**Departments & Users → Pending approvals**, the tab carries a
count badge), press **Approve**: the row collapses away, a welcome email goes out,
and a `USER_APPROVED` block lands in the audit chain. Sign in as the new employee to
close the loop.

> "Three new block types — USER_REGISTERED, EMAIL_VERIFIED, USER_APPROVED — and the
> chain still verifies. Onboarding is audited like everything else."

---

## 0:00 — Employee: the daily view

Login chip → **Kavita Joshi** (Section Officer, Revenue).

- Dashboard loads with **7 assigned, 1 due today, 2 overdue, 71% on-time**.
- Point at **Today's Focus**: real reference numbers (`REV/2026/0037`), SLA chips
  colour-coded — green over 24h, amber under, red pulsing when breached.

> "Every number here is a live query. Nothing on this screen is a mock-up."

## 0:45 — AI moment 1: the assistant

Left nav → **AI Assistant** → click the saffron chip **"mere pending kaam kitne hain?"**

- Replies with her actual counts and the three soonest tasks, each a clickable link.
- Point at the small grey `intent: my_pending_tasks` under the reply.

> "It classifies the question, then fills a template from live data. It does not
> generate numbers, so it cannot invent a task count. Hinglish is a first-class
> input, not a translation layer."

## 1:30 — Writing to the chain

**My Tasks** → click any open task → in the drawer, type a frustrated update:

```
Contractor has not responded to two notices. Delay ho raha hai. Very frustrating.
```

Drag the progress slider, **Submit**.

- A **red sentiment chip** appears on the new timeline entry.
- Scroll the drawer to **Audit chain (N blocks)** — a new block just appeared.

> "That update was scored for sentiment and written into the audit chain in the
> same database transaction. There is no code path that writes a task without
> writing its block."

## 2:30 — AI moment 2: manager sees the human cost

Sign out → login chip → **Sunita Deshmukh**… *(for the burnout story use Anil
Kulkarni, Public Works — that is where the planted case lives)*.

Sign in as **anil.kulkarni@gov.in**.

- **Team Dashboard**: SLA ring, **Morale gauge** (needle in the red, −0.24, trend
  arrow down), **Burnout risk** card.
- **Ramesh Patel — 85/100, CRITICAL.**
- Workload bar shows him **Overloaded, 14 active, 6 overdue** while colleagues sit at 2–4.

Click **Burnout & Morale** in the nav.

- His card shows the top two contributing factors and a plain-language action:
  *"Re-prioritise or extend deadlines on the overdue items."*

> "Nobody filed a complaint. The system inferred this from workload, deadlines,
> working hours and the tone of his own updates."

## 3:30 — The kanban (audited drag)

**Task Board** → drag a card from *Pending* to *In Progress*.

- It moves instantly (optimistic), and columns it cannot legally move to dim during the drag.
- Try dragging a *Pending* card straight to *Completed* — a red banner explains the
  transition is not allowed.

> "The board and the server share one transition graph. An impossible workflow jump
> can never reach the audit chain."

## 4:15 — AI moment 3: the fraud case

Sign out → login chip → **Rajesh Iyer** (Deputy Collector, Admin).

**Fraud & Risk Center**:

- **92% detection precision — 11/12 confirmed on review.**
- Anomaly scatter: the night-time cluster between 01:00 and 03:00 is visible at a glance.
- Click the **Self-approval** alert → drawer opens.

Show the evidence panel:

- Subject **Vikas Meena**, anomaly score **0.97**.
- Narrative: *"REV/2026/00xx was moved to COMPLETED by the same user who submitted it."*
- Raw evidence JSON, and the reason tags that fired.

> "Read the precision card. It is 92%, not 100%, because one alert is a genuine
> false positive — after-hours activity that turned out to be workload, not misuse.
> We label it rather than delete it. And alerts raised at runtime carry no label,
> so pressing *Run scan now* can never inflate that number."

## 5:15 — The blockchain moment

**Blockchain Audit** in the nav.

- Big green shield: **Chain intact — 962 blocks verified in 15ms.**
- Linked-block strip: each connector is a `prevHash` link.
- Merkle checkpoints table, every 100 blocks. Anchor status reads
  *"pending — Polygon Amoy (planned)"*.

> "We compute Merkle roots but we make no chain calls. Claiming a live blockchain
> integration we do not have would be the easiest thing to fake and the first thing
> you would catch."

**Switch to the terminal:**

```bash
npm run demo:tamper
```

It prints the block it edited and that verification now fails.

> "That was a raw SQL UPDATE straight against the table. It bypassed the service
> that appends blocks entirely — exactly what a malicious insider with database
> access would do."

**Back to the browser** → press **Verify chain**.

- Banner turns red: **TAMPER DETECTED — at block #386**, with the hash mismatch spelled out.
- The block strip auto-scrolls to the break: severed link, red block, **HASH
  MISMATCH**, and every block after it faded because the break propagates.
- Click **Show block #386 in the ledger** — the row is flagged `tampered`.

> "The row still looks perfectly normal in the database. Nothing about it is marked
> as altered. Only recomputing the chain reveals it."

## 6:30 — Restore and close

```bash
npm run demo:reset
```

Press **Verify chain** again → green shield returns.

> "Note we were not signed out. User IDs are deterministic, so a reset is invisible
> to an open session."

Finish on **Org Overview**, then click **हिंदी** in the top bar.

- Navigation, KPI labels, status chips and breadcrumbs switch instantly.
- Task content stays as authored — translating a citizen's file note would
  misrepresent the record.

---

## Where each claimed metric is shown

| Claim | Screen | What backs it |
|---|---|---|
| 30–40% faster workflow execution | Org Overview KPI · Team Analytics banner | **32.5%** measured live: mean cycle time of the older half of completed tasks vs the recent half. Not a constant. |
| 85–90% sentiment accuracy | `npm run eval:ml` · model cards | **87.5%** on a 40-comment held-out set never used for tuning. |
| ~92% fraud detection precision | Fraud & Risk Center precision card | **11/12** labelled alerts confirmed on review. Runtime alerts are unlabelled and excluded. |
| 100% tamper-evident audit trail | Blockchain Audit Explorer | Live `Verify chain` over 962 blocks; the tamper demo above. |
| 30+ documented REST APIs | `http://localhost:4000/docs` | **51** operations across 12 tags, generated from the route source. |

## If something goes wrong

| Symptom | Fix |
|---|---|
| Signup says "too many attempts" | 5 successful registrations per hour per IP. Restart the API to clear it, or raise `SIGNUP_RATE_LIMIT_PER_HOUR`. Failed validations do not count. |
| No OTP visible | `MAIL_MODE=console` (the default) prints a boxed code in the API terminal and shows a DEV chip in the UI. |
| Port 4000 in use | Another server is running. `lsof -ti:4000 \| xargs kill`, or set `PORT` in `apps/api/.env`. |
| Dashboards empty | `npm run seed`. |
| Chain already red at start | Someone ran the tamper script. `npm run demo:reset`. |
| Assistant slow or odd | Stop the ML service — the API falls back to the local heuristic instantly and the reply is identical. |
| Signed out unexpectedly | Access tokens last 15 minutes and refresh silently; if the API restarted, sign in again with a chip. |

## Questions judges actually ask

**"Is this a real blockchain?"**
No, and we say so on the screen. It is a SHA-256 hash chain in Postgres with Merkle
checkpoints — the tamper-evidence property is real and demonstrable. Anchoring those
checkpoints to Polygon is designed and labelled *planned*, not claimed.

**"Is the Parichay login real?"**
No. Real Parichay needs NIC onboarding and a departmental MoU. The flow is
reproduced and labelled **Sandbox** in the UI, in the API response, and in the docs.

**"Why is the AI not an LLM?"**
Because an LLM would let the assistant invent a task count. Intent classification
plus templated replies from live queries cannot. We also measured a transformer
against our lexicon on this domain and the lexicon won — see the README.

**"Could an admin just edit the database?"**
They can, and the audit chain is precisely how you find out. That is the demo you
just watched.
