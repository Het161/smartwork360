# YouTube listing copy

Every figure below was read from the live deployment, not estimated. Re-check
them before uploading if the demo database has been reseeded:

```
curl -s https://smartwork360-api.vercel.app/health                 # endpoint count
curl -s .../api/v1/audit/verify   -H "Authorization: Bearer <t>"   # blocks, anchors
curl -s .../api/v1/fraud/precision -H "Authorization: Bearer <t>"  # 11/12
```

---

## Title (pick one)

- `SMARTWORK 360 — AI + Blockchain-backed Task & Performance Management for Government Offices | SIH 2025`
- `SMARTWORK 360 — Full Demo | Smart India Hackathon 2025 Prototype`
- `We built a government task system where the AI can fix the software but never touch the evidence`

## Description

SMARTWORK 360 is a task and performance management system for Indian government
offices. It gives every piece of work an owner and a deadline, measures whether
those deadlines are met, watches for patterns that suggest misuse, and records
every change on a tamper-evident chain so nothing can be quietly rewritten.

This is a full walkthrough of the working prototype — real screens, real seeded
data, nothing mocked up in Figma.

⏱️ CHAPTERS
0:00 Title
0:19 The problem — why files go missing on desks
0:41 Login and the Parichay SSO sandbox
1:02 Employee — today's focus, tasks, progress
1:37 The assistant and personal performance
2:03 Manager — team workload, morale, burnout
2:45 Analytics — throughput, SLA compliance, cycle time
3:09 Admin — the whole organisation at a glance
3:35 Fraud and risk detection
4:08 The audit trail — tampering, and catching it
5:02 Saarthi — guided tours in your own language
5:22 The assistant that repairs the system
6:11 Access, Hindi, and mobile
6:29 How it is built
6:54 Close

🔍 WHAT MAKES IT DIFFERENT

• A tamper-evident audit ledger. Every change is sealed with a SHA-256 hash
  covering the record before it. Edit one row directly in the database and the
  chain breaks visibly — we show exactly that at 4:08. 972 blocks currently
  verify in 170 ms, with a Merkle checkpoint every 100 blocks.

• An assistant that can heal the system but never touch the evidence (5:22).
  It diagnoses a real failure, proposes one of twelve whitelisted repairs, and a
  human confirms it — then the fix itself is written to the audit chain in the
  same transaction as the change. Ask it to "fix the broken audit chain" and it
  refuses, because a broken chain is evidence, not a bug. There is no action in
  the system that could do it.

• AI that shows its working. Morale is read from the notes people actually
  write on tasks. Burnout is scored from five signals and the top two are always
  shown. Fraud alerts carry the evidence that triggered them.

• Fully bilingual. Every screen, message and error in English and Hindi,
  including the guided tour and the support assistant.

📊 MEASURED, NOT CLAIMED

• 92% fraud detection precision — 11 of 12 labelled alerts confirmed on review.
  Not 100%, because one is a genuine false positive we chose to keep and label.
• 87.5% sentiment accuracy on a held-out set that was never used for tuning.
• 32.5% cycle-time improvement measured across the seeded history.
• 66 documented REST endpoints, generated from the route source.
• Chain verification, guided tours and the support assistant all work offline.

🔗 LINKS

Live demo   https://smartwork360.vercel.app
API + docs  https://smartwork360-api.vercel.app/docs
Source      https://github.com/Het161/smartwork360

Sign in with any of the demo accounts listed on the login page
(password: Demo@123). It is a public prototype with seeded data — please expect
other people to have clicked things.

🛠️ BUILT WITH

Next.js 14 · TypeScript (strict) · Express · PostgreSQL + Prisma · FastAPI
(Python) for the ML service · Tailwind · Playwright · Three.js for the guide
mascot. Deployed on Vercel with Neon Postgres.

⚠️ WHAT WE ARE NOT CLAIMING

We compute Merkle roots but make no calls to any public blockchain — anchoring
is a documented stub, and saying otherwise would be the easiest thing to fake
and the first thing you would catch. The Parichay screen is a clearly labelled
sandbox simulation, not a real national SSO integration. The burnout model is a
calibrated expert rule trained on synthetic data generated from its own
documented weighting, not a finding discovered from real workforce data.

Built for Smart India Hackathon 2025.

#SmartIndiaHackathon #SIH2025 #DigitalIndia #GovTech #eGovernance #NextJS
#TypeScript #PostgreSQL #AI #Blockchain #OpenSource

---

## Short cut (1m 33s) — for Shorts / LinkedIn

SMARTWORK 360 in 90 seconds — a task and performance system for government
offices, with a tamper-evident audit chain and an AI assistant that can repair
the software but is structurally incapable of touching the audit record.

Full demo: <link to the 7-minute video>
Live: https://smartwork360.vercel.app
Code: https://github.com/Het161/smartwork360

#SmartIndiaHackathon #SIH2025 #GovTech #DigitalIndia
