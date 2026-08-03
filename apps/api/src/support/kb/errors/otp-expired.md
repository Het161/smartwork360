---
keywords: "expired expiry timedout stale outdated"
code: "OTP_EXPIRED"
httpStatus: 400
roles: [ADMIN, MANAGER, EMPLOYEE]
fix: "resend_verification_otp"
title: "The 6-digit code is older than 10 minutes"
---
## What happened
You typed the code from the email and the system said it has expired.

## Why
Codes are valid for 10 minutes. A code that stayed valid all day would be a code an attacker has all day to guess or find in a forwarded email.

## What to do
Ask for a new code and use it straight away. There is a 30-second wait between requests so the mailbox cannot be flooded.

## Auto-fix available
Yes. Saarthi can send a fresh code to the same address.
