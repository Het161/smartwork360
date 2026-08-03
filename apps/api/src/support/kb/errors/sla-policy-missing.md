---
keywords: "sla policy deadline rule hours unconfigured missing priority एसएलए नियम समय-सीमा गायब बनाने में विफल"
code: "SLA_POLICY_MISSING"
httpStatus: 400
roles: [ADMIN, MANAGER]
fix: "create_missing_sla_policy"
title: "Task creation failed because the department has no deadline rule"
---
## What happened
You tried to create a task, and the system stopped you before it was saved. Nothing was created.

## Why
Every task needs a deadline, and the deadline is worked out from an SLA rule — "in this department, a task of this priority gets this many hours". Your department does not have a rule for this priority yet, so the system had no way to decide the due date. It refuses to guess.

This normally happens when a new department is added, or when a priority level (usually CRITICAL) was never configured for an existing one.

## What to do
An Administrator can add the missing rule in **Settings → SLA policies**. Pick the department and the priority, set the hours, and save. Then create your task again — it will work.

## Auto-fix available
Yes. Saarthi can create the missing rule using the organisation default hours for that priority. The change is recorded on the audit chain like any other setting change, and an Administrator can adjust the hours afterwards.
