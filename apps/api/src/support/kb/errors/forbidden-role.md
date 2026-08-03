---
keywords: "forbidden permission denied 403 role refused unauthorised"
code: "FORBIDDEN_ROLE"
httpStatus: 403
roles: [ADMIN, MANAGER, EMPLOYEE]
fix: null
title: "Your role does not allow this action"
---
## What happened
The system refused an action and told you it is not available to you.

## Why
SMARTWORK 360 checks permissions in the database query itself, not just by hiding buttons. Three roles exist:

- **Employee** — their own tasks, their own performance.
- **Manager** — everything in their own department, plus assigning and reviewing work.
- **Administrator** — the whole organisation, settings, users and the fraud centre.

If a request falls outside your role, it is refused even if the button was somehow reachable.

## What to do
Ask someone with the right role. The message names which role can do it. If you believe your role is wrong, an Administrator can change it in Departments & Users.

## Auto-fix available
No. Saarthi will never change anybody's role or permissions — including your own. That is exactly the kind of change an attacker would ask for, so it is not in the list of things the assistant can do at all.
