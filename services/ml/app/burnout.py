"""
Burnout risk scoring.

model mode      LogisticRegression trained at startup on a synthetic dataset that
                encodes the documented relationship between the five features and
                strain (see `_synthetic_dataset`). Calibrated probability × 100.
heuristic mode  The same weighted rules the TypeScript fallback uses.

Feature extraction happens in the API, not here — this service is stateless and
scores whatever vector it is handed.
"""

import logging

from .config import BURNOUT_RULES_VERSION, HEURISTIC_MODE
from .schemas import BurnoutItemOut, BurnoutUserIn, TopFactor

log = logging.getLogger("smartwork360.ml.burnout")

# key, human label, value at which the factor is considered maxed out, weight
WEIGHTS: list[tuple[str, str, float, float]] = [
    ("activeLoad", "Active workload", 10.0, 28.0),
    ("overdueCount", "Overdue tasks", 6.0, 30.0),
    ("afterHoursPct", "After-hours activity", 60.0, 18.0),
    ("negSentimentPct", "Negative sentiment", 60.0, 19.0),
    ("avgDailyUpdates", "Update churn", 4.0, 5.0),
]

_model = None
_scaler = None
_load_failed = False


def risk_from_score(score: float) -> str:
    if score >= 80:
        return "CRITICAL"
    if score >= 62:
        return "HIGH"
    if score >= 40:
        return "MODERATE"
    return "LOW"


def _contributions(features: dict[str, float]) -> list[TopFactor]:
    out: list[TopFactor] = []
    for key, label, cap, weight in WEIGHTS:
        raw = float(features.get(key, 0) or 0)
        contribution = min(1.0, raw / cap) * weight
        out.append(
            TopFactor(key=key, label=label, value=raw, contribution=round(contribution, 1))
        )
    return out


def _heuristic_score(features: dict[str, float]) -> float:
    return min(100.0, sum(c.contribution for c in _contributions(features)))


def _synthetic_dataset(n: int = 4000):
    """
    Generates a labelled training set.

    There is no public corpus of government-office burnout labels, so the model is
    trained on data drawn from the documented weighting: sample plausible feature
    vectors, score them with the weighted rule, and label `strained = score >= 62`
    with a little label noise so the classifier learns a smooth boundary rather
    than memorising the exact rule.

    This is honest about what the model is: a calibrated, smooth version of an
    expert-specified rule — not a discovery from real workforce data.
    """
    import numpy as np

    rng = np.random.default_rng(360)
    active = rng.integers(0, 16, n)
    overdue = np.minimum(active, rng.integers(0, 9, n))
    after_hours = rng.integers(0, 101, n)
    updates = rng.uniform(0, 6, n)
    negative = rng.integers(0, 101, n)

    X = np.column_stack([active, overdue, after_hours, negative, updates]).astype(float)

    scores = np.array(
        [
            _heuristic_score(
                {
                    "activeLoad": row[0],
                    "overdueCount": row[1],
                    "afterHoursPct": row[2],
                    "negSentimentPct": row[3],
                    "avgDailyUpdates": row[4],
                }
            )
            for row in X
        ]
    )
    y = (scores + rng.normal(0, 4, n) >= 62).astype(int)
    return X, y


def _get_model():
    global _model, _scaler, _load_failed
    if _model is not None or _load_failed:
        return _model

    try:
        from sklearn.linear_model import LogisticRegression
        from sklearn.preprocessing import StandardScaler

        X, y = _synthetic_dataset()
        _scaler = StandardScaler().fit(X)
        _model = LogisticRegression(max_iter=1000).fit(_scaler.transform(X), y)
        log.info("Burnout LogisticRegression trained on %d synthetic samples", len(y))
    except Exception as exc:  # noqa: BLE001
        _load_failed = True
        log.warning("Could not train burnout model (%s) — using weighted rules", exc)

    return _model


def score_users(users: list[BurnoutUserIn]) -> tuple[list[BurnoutItemOut], str, str]:
    if not users:
        return [], BURNOUT_RULES_VERSION, "heuristic"

    if not HEURISTIC_MODE:
        model = _get_model()
        if model is not None:
            try:
                import numpy as np

                X = np.array(
                    [
                        [
                            u.features.activeLoad,
                            u.features.overdueCount,
                            u.features.afterHoursPct,
                            u.features.negSentimentPct,
                            u.features.avgDailyUpdates,
                        ]
                        for u in users
                    ],
                    dtype=float,
                )
                probs = model.predict_proba(_scaler.transform(X))[:, 1]

                items = []
                for user, prob in zip(users, probs):
                    contributions = _contributions(user.features.model_dump())
                    score = int(round(float(prob) * 100))
                    items.append(
                        BurnoutItemOut(
                            userId=user.userId,
                            score=score,
                            riskLevel=risk_from_score(score),
                            topFactors=sorted(
                                contributions, key=lambda c: c.contribution, reverse=True
                            )[:2],
                        )
                    )
                return items, "sklearn-logreg-burnout-v1", "model"
            except Exception as exc:  # noqa: BLE001
                log.warning("Burnout inference failed (%s) — using rules", exc)

    items = []
    for user in users:
        features = user.features.model_dump()
        contributions = _contributions(features)
        score = int(round(min(100.0, sum(c.contribution for c in contributions))))
        items.append(
            BurnoutItemOut(
                userId=user.userId,
                score=score,
                riskLevel=risk_from_score(score),
                topFactors=sorted(contributions, key=lambda c: c.contribution, reverse=True)[:2],
            )
        )
    return items, BURNOUT_RULES_VERSION, "heuristic"


def model_card() -> dict:
    return {
        "task": "burnout",
        "features": [
            {"key": k, "label": label, "maxAt": cap, "weight": w} for k, label, cap, w in WEIGHTS
        ],
        "modelMode": {
            "name": "sklearn-logreg-burnout-v1",
            "algorithm": "LogisticRegression on standardised features",
            "trainedOn": "4000 synthetic vectors labelled by the documented weighting, with label noise",
            "output": "Calibrated probability of strain × 100",
            "honesty": (
                "No public corpus of government-office burnout labels exists. This "
                "model is a smooth, calibrated version of an expert-specified rule — "
                "not a finding discovered from real workforce data."
            ),
        },
        "heuristicMode": {
            "name": BURNOUT_RULES_VERSION,
            "algorithm": "Weighted, capped linear combination of the same five features",
        },
        "thresholds": {"LOW": "<40", "MODERATE": "40-61", "HIGH": "62-79", "CRITICAL": ">=80"},
    }
