---
keywords: "approval approve release administrator waiting admitted स्वीकृति प्रतीक्षा प्रशासक लॉगिन नहीं"
code: "USER_PENDING_APPROVAL"
httpStatus: 403
roles: [ADMIN]
fix: "approve_pending_user"
title: "The person verified their email but is still waiting for an Administrator"
---
## What happened
A new joinee says they cannot sign in. Their email is verified, but the system still refuses them.

## Why
Verifying the email only proves the address is theirs. It does not prove they should have access to government task data. That decision is a human one, so the account waits at "pending approval" until an Administrator releases it.

This is deliberate. An email address alone should never be enough to get in.

## What to do
Go to **Departments & Users → Pending approvals**. Check the name, designation and department against your records, then approve or reject. The person is emailed either way.

## Auto-fix available
Yes, for Administrators only, and it asks you to type a reason first. Approving somebody is a real decision with a real audit trail — the reason you type is stored permanently next to your name.
