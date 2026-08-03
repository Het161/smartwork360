---
keywords: "unverified neverentered awaiting confirmation incomplete"
code: "EMAIL_NOT_VERIFIED"
httpStatus: 403
roles: [ADMIN]
fix: "resend_verification_otp"
title: "Registration is stuck because the email code was never entered"
---
## What happened
Someone registered but cannot sign in. Their account is sitting at "pending verification".

## Why
Self-registration has two gates. First the person proves they own the email address by typing a 6-digit code. Then an Administrator approves them. This account never cleared the first gate — the code was not entered, or it expired before they got to it.

## What to do
Ask them to check their inbox, including spam. If the code has expired, a new one can be sent. Codes are valid for 10 minutes.

## Auto-fix available
Yes, for Administrators. Saarthi can send a fresh code to the registered address.
