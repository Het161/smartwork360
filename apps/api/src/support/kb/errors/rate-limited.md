---
keywords: "throttled ratelimit slowdown allowance toomany"
code: "RATE_LIMITED"
httpStatus: 429
roles: [ADMIN, MANAGER, EMPLOYEE]
fix: null
title: "Too many requests in a short time"
---
## What happened
The system asked you to wait before trying again.

## Why
Sensitive endpoints — signing in, requesting email codes, applying automatic fixes — are rate limited so that a script cannot hammer them. Note that only *successful* requests count against most limits, so mistyping a form does not use up your allowance.

## What to do
Wait for the period named in the message and try again. If you are demonstrating the system and hit this, restarting the API resets the counters.

## Auto-fix available
No. Waiting is the fix. Saarthi will not raise a rate limit for you, because raising limits on request is precisely what an attacker would want.
