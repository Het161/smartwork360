---
keywords: "transition drag kanban snapped backwards skipped stuck स्थिति बदल नहीं सकते कार्ड वापस अटका"
code: "INVALID_STATUS_TRANSITION"
httpStatus: 400
roles: [ADMIN, MANAGER, EMPLOYEE]
fix: "force_status_transition"
title: "A task cannot move to that state from where it is now"
---
## What happened
You tried to move a task — usually by dragging a card — and it snapped back.

## Why
Tasks follow a fixed path: Pending → In progress → Under review → Completed. You cannot skip a step, and you cannot go backwards from Completed. The rule exists so the cycle-time and SLA numbers mean something; without it, anyone could drag a card straight to Completed and the reports would be fiction.

A task can also end up genuinely stuck — for example sitting in "Under review" with nothing ever submitted for review — usually after an import or an interrupted operation.

## What to do
Move the task one step at a time. If the task is genuinely in an impossible state, a Manager or Administrator can repair it.

## Auto-fix available
Yes, for Managers and Administrators, and only inside your own department. The repair records the original state in the audit trail, so the correction itself is visible and reversible rather than silently overwriting history.
