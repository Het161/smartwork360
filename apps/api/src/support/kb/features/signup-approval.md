---
title: "Signup & approval"
route: "/signup"
roles: [ADMIN, MANAGER, EMPLOYEE]
summary: "Self-registration: email code, then human approval"
---
## What it is for
Letting a new government employee request access without an administrator creating the account by hand.

## How it works
1. They fill in name, official email, designation and department.
2. A 6-digit code is emailed. It lasts 10 minutes, and 5 wrong attempts locks that registration.
3. Once verified, the account waits for an Administrator to approve it.
4. On approval they are emailed and can sign in.

## Common confusions
- "I verified my email but still cannot get in." Verification is only the first gate — see USER_PENDING_APPROVAL.
- "Which email addresses are allowed?" Official domains only, gov.in and nic.in by default.
