---
keywords: "python service unreachable scoring skipped fallback gauge"
code: "ML_SERVICE_UNAVAILABLE"
httpStatus: 503
roles: [ADMIN, MANAGER]
fix: "recompute_sentiment_for_task"
title: "The analysis service was unreachable, so some scores are missing"
---
## What happened
The morale gauge looks stale, or a progress note has no sentiment attached to it.

## Why
Sentiment and burnout scoring normally run in a small Python service. When that service is not running, the system does not fail and it does not block anyone — it falls back to a built-in copy of the same rules, written in TypeScript, that produces the same answer. Work continues.

What can happen is that a few notes were saved during the gap and never scored, so the 14-day average is calculated over fewer notes than it should be.

## What to do
Nothing urgent. The numbers are still correct for the notes that were scored. To fill the gap, the missing notes can be re-analysed.

## Auto-fix available
Yes. Saarthi can re-run the analysis for the affected notes. It works even with no internet, because the fallback scorer runs inside the API itself.
