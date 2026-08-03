---
keywords: "unassigned empty blank nothing showing anywhere orphaned"
code: "USER_NO_DEPARTMENT"
httpStatus: 409
roles: [ADMIN]
fix: "assign_user_department"
title: "The account is not attached to any department, so its screens are empty"
---
## What happened
You signed in successfully, but your dashboard, task list and reports are all empty — as if you had no work at all.

## Why
Almost everything in SMARTWORK 360 is organised by department. Your account does not have a department set, so every query comes back with nothing. It is not that your work is missing; the system does not know where to look for it.

This usually happens to accounts created in a hurry, or imported before the department list was finalised.

## What to do
An Administrator assigns the department in **Departments & Users**. Open the person's record and set the department. The screens fill up immediately on the next page load — no data was lost.

## Auto-fix available
Yes, for Administrators. Saarthi can assign the department directly. Managers cannot do this, because a manager may only act inside their own department and this account currently belongs to none.
