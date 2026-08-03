---
title: "Settings"
route: "/a/settings"
roles: [ADMIN]
summary: "SLA policies and system configuration"
---
## What it is for
The rules the system enforces — chiefly how many hours each priority gets in each department.

## Who can see it
Administrators.

## The three things people do here
1. Set SLA hours per department and priority.
2. Add a rule for a department that is missing one.
3. Review what changed — every edit here is audited.

## Common confusions
- "Changing hours fixed future tasks but not old ones." Correct. A task's deadline is fixed when it is created, so changing the policy does not retrospectively move deadlines that people already worked to.
