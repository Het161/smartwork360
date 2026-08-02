"""
Behavioural anomaly detection.

model mode      IsolationForest over the five per-user behaviour features. Fitted
                on the batch it is given plus a synthetic "normal staff" cohort, so
                a single genuinely anomalous user in a small batch is still an
                outlier rather than being treated as half the population.
heuristic mode  Threshold rules, identical to the TypeScript fallback.

Both paths return the SAME reason tags, because the Fraud Center shows those tags
as the evidence for why an alert fired — they must not change with the mode.
"""

import logging

from .config import ANOMALY_RULES_VERSION, HEURISTIC_MODE
from .schemas import AnomalyItemOut, AnomalyRow

log = logging.getLogger("smartwork360.ml.anomaly")

FEATURES = (
    "actionsPerHour",
    "nightHourRatio",
    "selfApprovalCount",
    "statusFlipCount",
    "cycleTimeZScore",
)


def severity_for(score: float) -> str:
    if score >= 0.85:
        return "CRITICAL"
    if score >= 0.65:
        return "HIGH"
    if score >= 0.4:
        return "MODERATE"
    return "LOW"


def _reasons(row: AnomalyRow) -> list[str]:
    """
    Reason tags are rule-derived in BOTH modes.

    An IsolationForest gives an outlier score but no explanation, and the Fraud
    Center shows these tags as the evidence a reviewer acts on. Deriving them from
    explicit thresholds keeps the explanation truthful and stable.
    """
    reasons: list[str] = []
    # 0.20 is ~3x the observed organisational baseline (most staff record 5-10% of
    # their actions outside 06:00-22:00). Kept in sync with the TypeScript fallback.
    if row.nightHourRatio > 0.2:
        reasons.append("night_hour_ratio")
    if row.actionsPerHour > 6:
        reasons.append("action_burst")
    if row.selfApprovalCount > 0:
        reasons.append("self_approval")
    if row.statusFlipCount > 8:
        reasons.append("status_flip")
    if row.cycleTimeZScore < -2.5 or row.fastestCycleMinutes < 15:
        reasons.append("cycle_time_zscore")
    return reasons


def _heuristic_score(row: AnomalyRow) -> float:
    score = 0.0
    if row.nightHourRatio > 0.2:
        score += min(0.4, row.nightHourRatio * 1.2)
    if row.actionsPerHour > 6:
        score += min(0.25, (row.actionsPerHour - 6) * 0.04)
    if row.selfApprovalCount > 0:
        score += min(0.35, 0.18 + row.selfApprovalCount * 0.06)
    if row.statusFlipCount > 8:
        score += min(0.2, (row.statusFlipCount - 8) * 0.02)
    if row.cycleTimeZScore < -2.5 or row.fastestCycleMinutes < 15:
        score += 0.3
    return round(min(0.99, score), 3)


def _normal_cohort(n: int = 300):
    """
    Synthetic "ordinary staff" rows.

    An IsolationForest fitted only on the incoming batch would treat a department
    where two of five people misbehave as though that were normal. Anchoring the
    fit with a known-normal cohort keeps "normal" defined by policy, not by
    whoever happens to be in the batch.
    """
    import numpy as np

    rng = np.random.default_rng(360)
    return np.column_stack(
        [
            rng.uniform(0, 5, n),          # actionsPerHour
            rng.uniform(0, 0.12, n),       # nightHourRatio
            np.zeros(n),                   # selfApprovalCount
            rng.uniform(0, 7, n),          # statusFlipCount
            rng.normal(0, 1, n),           # cycleTimeZScore
        ]
    )


def scan(events: list[AnomalyRow]) -> tuple[list[AnomalyItemOut], str, str]:
    if not events:
        return [], ANOMALY_RULES_VERSION, "heuristic"

    if not HEURISTIC_MODE:
        try:
            import numpy as np
            from sklearn.ensemble import IsolationForest

            X = np.array(
                [[getattr(row, f) for f in FEATURES] for row in events], dtype=float
            )
            forest = IsolationForest(
                n_estimators=200, contamination=0.1, random_state=360
            ).fit(np.vstack([_normal_cohort(), X]))

            # decision_function: positive = inlier, negative = outlier. Map onto
            # 0..1 where 1 is most anomalous.
            raw = forest.decision_function(X)
            span = max(1e-6, float(raw.max() - raw.min())) if len(raw) > 1 else 1.0
            normalised = (float(raw.max()) - raw) / span if len(raw) > 1 else 1.0 - raw

            items = []
            for row, value in zip(events, np.atleast_1d(normalised)):
                reasons = _reasons(row)
                # A user with no rule triggers is not reported as anomalous, however
                # unusual their vector looks — an unexplainable alert is not actionable.
                score = round(float(min(0.99, max(0.0, value))), 3) if reasons else 0.0
                items.append(
                    AnomalyItemOut(
                        userId=row.userId,
                        anomalyScore=score,
                        reasons=reasons,
                        severity=severity_for(score),
                    )
                )
            return items, "sklearn-isolationforest-v1", "model"
        except Exception as exc:  # noqa: BLE001
            log.warning("IsolationForest unavailable (%s) — using threshold rules", exc)

    items = []
    for row in events:
        score = _heuristic_score(row)
        items.append(
            AnomalyItemOut(
                userId=row.userId,
                anomalyScore=score,
                reasons=_reasons(row),
                severity=severity_for(score),
            )
        )
    return items, ANOMALY_RULES_VERSION, "heuristic"


def model_card() -> dict:
    return {
        "task": "anomaly",
        "features": list(FEATURES),
        "modelMode": {
            "name": "sklearn-isolationforest-v1",
            "algorithm": "IsolationForest (200 trees, contamination 0.1)",
            "fittedOn": "The incoming batch plus a 300-row synthetic normal-staff cohort",
            "why": (
                "Fitting on the batch alone would let a department with several "
                "bad actors redefine 'normal'."
            ),
        },
        "heuristicMode": {
            "name": ANOMALY_RULES_VERSION,
            "algorithm": "Additive threshold rules over the same five features",
        },
        "reasonTags": {
            "night_hour_ratio": "Share of actions outside 06:00-22:00 above 0.20 (~3x baseline)",
            "action_burst": "More than 6 audited actions in a single hour",
            "self_approval": "Approved a task they submitted (maker-checker violation)",
            "status_flip": "More than 8 status changes in the window",
            "cycle_time_zscore": "Completion far faster than the department median",
        },
        "note": "Reason tags are rule-derived in both modes so the evidence shown to a reviewer never changes with the mode.",
    }
