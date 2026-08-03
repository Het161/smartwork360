---
keywords: "attempts exceeded locked guessing wrong tries"
code: "OTP_ATTEMPTS_EXCEEDED"
httpStatus: 429
roles: [ADMIN]
fix: "resend_verification_otp"
title: "Too many wrong codes were entered for this address"
---
## What happened
After several wrong attempts, the system stopped accepting codes for this registration.

## Why
A 6-digit code has a million combinations, which sounds like a lot until a script tries them. Locking after 5 wrong attempts makes guessing pointless.

## What to do
Request a new code. The new one comes with a fresh set of attempts. If this keeps happening for a real user, check they are reading the most recent email — an older code will always fail.

## Auto-fix available
Yes. Sending a fresh code clears the lock for that registration.
