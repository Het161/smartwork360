---
title: "Audit explorer"
route: "/a/audit"
roles: [ADMIN]
summary: "The tamper-evident ledger and chain verification"
---
## What it is for
Every change ever made, in order, each one sealed to the one before it.

## Who can see it
Administrators.

## The three things people do here
1. Search by entity, action or person.
2. Press **Verify chain** — it re-computes every hash and reports whether the chain is intact.
3. Open a block to see exactly what changed.

## How it works
Each record stores a SHA-256 hash of its own contents plus the previous record's hash. Editing any row breaks that row and everything after it. Checkpoints are cut every 100 blocks.

## Common confusions
- "Verification is slow." It is re-hashing every block; roughly a thousand blocks verify in well under a second.
- "Can a mistake be edited out?" No, and that is the design. Corrections are appended as new events. Nothing is ever rewritten — including by Saarthi, which has no ability to touch audit records at all.
