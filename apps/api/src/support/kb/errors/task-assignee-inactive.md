---
keywords: "inactive resigned departed disabled reassign frozen"
code: "TASK_ASSIGNEE_INACTIVE"
httpStatus: 409
roles: [ADMIN, MANAGER]
fix: "reassign_task"
title: "The task is assigned to someone whose account is no longer active"
---
## What happened
A task shows an assignee who has left, is on long leave, or whose account was disabled. Nobody is working on it and it is quietly heading for a deadline breach.

## Why
Disabling an account does not delete their work — that would destroy the record. Their open tasks stay exactly where they were, waiting to be handed to somebody else.

## What to do
Reassign the task in the Task Board. When you pick the new person, the system shows how much they are already carrying, so the work does not simply move to whoever is nearest.

## Auto-fix available
Yes, for Managers and Administrators, within your own department. It asks you to confirm the new assignee and type a reason, and it shows their current workload before you commit.
