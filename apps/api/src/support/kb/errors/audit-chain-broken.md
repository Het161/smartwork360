---
keywords: "tamper mismatch integrity chain broken verification"
code: "AUDIT_CHAIN_BROKEN"
httpStatus: 500
roles: [ADMIN]
fix: null
title: "Chain verification failed — this is evidence, not a bug"
---
## What happened
The Audit Explorer reported that the chain does not verify. One or more blocks no longer match their recorded hash.

## Why
Every audit record stores a SHA-256 hash covering its own contents *and* the hash of the record before it. Change one field of one row — even a single character — and that row's hash no longer matches, and every row after it is invalidated too. That is the entire point of the design.

So a broken chain means one of two things, and both are serious:

1. Somebody edited or deleted rows directly in the database, going around the application.
2. The database was restored, migrated or partially copied in a way that lost rows.

## What to do
Treat this as an incident, not a defect. Note the block index where verification first fails — that is where the tampering starts. Preserve the database as it is, take a backup before anything else, and escalate to whoever owns the deployment.

## Auto-fix available
**No — and this is deliberate and permanent.**

Saarthi will refuse to "repair", re-hash, rewrite or delete audit records under any phrasing, no matter who asks. There is no such action in the system to call.

The reason is simple: a tamper-evident log that the assistant can repair is not tamper-evident. The broken chain *is* the evidence. Fixing it would destroy the only proof that something happened, and would hand an attacker a convenient tool for covering their tracks. An assistant that can heal the system must never be able to touch the evidence.
