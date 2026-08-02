# SMARTWORK 360 — ML service

FastAPI microservice on `:8000`. Four endpoints, all batch-capable, all reporting
`modelVersion` and `mode` so the UI can state honestly which path produced a number.

```
POST /sentiment      task-update text        → score (-1..+1) + label
POST /burnout        per-user feature vector → score (0..100) + risk + top factors
POST /anomaly/scan   per-user behaviour rows → anomaly score + reason tags
POST /chat           message + live context  → intent + grounded reply
GET  /health         status and current mode
GET  /model-cards    what each model is, trained on what, with what limitations
```

The service is **stateless**. The API extracts features from the database and this
service scores them, so the heuristic fallback in `apps/api/src/ml/` sees exactly
the same inputs.

## Running

```bash
npm run dev:ml          # from the repo root — creates .venv, installs, serves
```

Default is `HEURISTIC_MODE=true`: no downloads, no network, instant start.

### Model-backed mode

```bash
python3.12 -m venv .venv                       # or 3.11 / 3.13 — NOT 3.14 (see below)
./.venv/bin/pip install -r requirements.txt -r requirements-models.txt
HEURISTIC_MODE=false ./.venv/bin/python -m uvicorn app.main:app --port 8000
```

First run downloads ~250MB of model weights into `./models`.

> **Python 3.14 is not supported for model mode.** `pydantic-core` and `torch` have
> no wheels for it, and pip falls back to a Rust source build. Core requirements
> are unpinned so heuristic mode installs on any interpreter.

## Measured accuracy

`eval/eval_sentiment.py` scores three hand-labelled corpora of the register a
district office actually writes in, Hinglish included.

| Path | Held-out accuracy |
|---|---|
| **Heuristic lexicon (default)** | **87.5%** (35/40) |
| DistilBERT SST-2 + neutrality gate | 85.0% (34/40) |
| DistilBERT SST-2 alone | 65.0% (26/40) |

```bash
./.venv/bin/python eval/eval_sentiment.py
```

### Why the lexicon beats the transformer here

DistilBERT SST-2 reports ~91.3% on the SST-2 dev split — English **movie reviews**,
and a **binary** POSITIVE/NEGATIVE task with no NEUTRAL class.

Most lines in a government file are neither praise nor complaint. *"Placed the
muster roll before the accounts branch for scrutiny"* is routine, and SST-2 labels
it NEGATIVE with high confidence. On our held-out set its NEUTRAL recall was
**0.08** — it essentially cannot produce the most common label in the domain.

The `neutrality gate` fixes the structural mismatch: the lexicon answers *"does
this text carry any affect at all?"*, which is the question SST-2 cannot answer,
and only if the answer is yes does the transformer decide the polarity. That lifts
model mode from 65% to 85%.

The lexicon still edges it, needs no download, and cannot break offline — so it is
the default. This is a measured engineering decision, not a shortcut.

### Evaluation methodology

Three corpora, each retired from the headline the moment it influences a change:

| File | Size | Role |
|---|---|---|
| `office_comments_dev.csv` | 50 | Weights were tuned on it. 98% — meaningless as an estimate. |
| `office_comments_test.csv` | 40 | Its errors prompted a vocabulary sweep. 95% — no longer clean. |
| `office_comments_holdout.csv` | 40 | Written after tuning stopped. **87.5% — the reported figure.** |

The first set scored 100% at one point. That was the signal to build the second and
third: quoting accuracy on data that shaped the model is fitting to the test set.

*Caveat, stated plainly:* the neutrality gate was added after seeing the holdout's
failure pattern, so the **85.0%** model figure is mildly optimistic. The **87.5%**
heuristic figure is clean — nothing changed after it was measured.

## Model cards

`GET /model-cards` returns these at runtime.

### Sentiment
- **model mode** — `distilbert-base-uncased-finetuned-sst-2-english` (66M params), plus a lexicon neutrality gate.
- **heuristic mode** — weighted lexicon, clause-split, phrase-consuming, with negation and intensifier handling. ~130 terms covering Indian office English and Hinglish.
- **Limitation** — the transformer is out of distribution on Hindi/Hinglish; that is precisely what the lexicon is tuned for.

### Burnout
- **model mode** — `LogisticRegression` on standardised features, trained at startup on 4000 synthetic vectors labelled by the documented weighting, with label noise.
- **heuristic mode** — the same weighted, capped linear combination.
- **Honesty** — no public corpus of government-office burnout labels exists. This model is a smooth, calibrated version of an expert-specified rule, **not** a finding discovered from real workforce data. Both modes therefore agree closely by construction.

### Anomaly
- **model mode** — `IsolationForest` (200 trees) fitted on the incoming batch **plus a 300-row synthetic normal-staff cohort**, so a department with several bad actors cannot redefine "normal".
- **heuristic mode** — additive threshold rules over the same five features.
- **Reason tags are rule-derived in both modes**, because the Fraud Center shows them as the evidence a reviewer acts on — that explanation must not change with the mode.

### Chat
- Regex/keyword **intent classification**, then a template filled from live figures the API passes in.
- **No text is generated.** It cannot invent a task count or a deadline, and an unrecognised question returns the capability list rather than a plausible-sounding guess.
- Intents: pending tasks, overdue, SLA breaches today, team workload, who is at risk, task status by reference number, reminders, greeting, help, fallback — in English, Hindi and Hinglish.

## Parity with the TypeScript fallback

`app/lexicon.py` and `apps/api/src/ml/lexicon.ts` are the same algorithm with the
same vocabulary, verified to produce **identical scores on all 130 corpus
comments**. If they diverged, a note scored −0.62 by the API would become −0.31
once this service started, and the morale chart would jump for no visible reason.
