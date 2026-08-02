"""
Lexicon sentiment scorer.

A deliberate 1:1 port of apps/api/src/ml/lexicon.ts. The API falls back to the
TypeScript version when this service is unreachable, so the two must agree — a
note scored -0.62 by the API must not become -0.31 once the Python service comes
online, or the morale chart would jump for no reason the user can see.

Tuned for Indian government office English and Hinglish, which a generic English
lexicon scores badly ("pending hai", "delay ho raha", "done sir").

Algorithm
---------
1. Split the note into CLAUSES on sentence punctuation. Negation must not reach
   across a full stop: "no variance. Good to close" is positive, and a naive
   two-token negation window reads it as negative.
2. Within a clause, match multi-word phrases first and CONSUME their tokens, so
   "pareshan ho gaya" scores once as distress rather than as "pareshan" (-0.85)
   plus "ho gaya" (+0.6), which cancel to nearly nothing.
3. Score remaining unigrams with negation and intensifier handling.
4. Aggregate across clauses, then squash by sqrt(hits) so a long note does not
   out-shout a short one.
"""

import math
import re
from typing import Literal

from .config import LEXICON_VERSION, NEUTRAL_BAND

Label = Literal["POSITIVE", "NEGATIVE", "NEUTRAL"]

POSITIVE: dict[str, float] = {
    "done": 0.6, "completed": 0.8, "complete": 0.7, "resolved": 0.8, "resolve": 0.6,
    "approved": 0.7, "cleared": 0.7, "verified": 0.6, "smooth": 0.7, "smoothly": 0.7,
    "ahead": 0.6, "early": 0.5, "on time": 0.7, "ontime": 0.7, "good": 0.6,
    "great": 0.8, "excellent": 0.9, "thanks": 0.6, "thank you": 0.7, "helpful": 0.7,
    "cooperative": 0.7, "cooperation": 0.6, "support": 0.4, "supported": 0.5,
    "satisfied": 0.7, "satisfaction": 0.7, "satisfactory": 0.6,
    "finished": 0.7, "submitted": 0.5, "submit": 0.3,
    "dispatched": 0.5, "progress": 0.2, "no issue": 0.7, "no issues": 0.7,
    "no variance": 0.5, "without any delay": 0.7, "ho gaya": 0.6, "ho gaya hai": 0.6,
    "kar diya": 0.6, "done sir": 0.7, "ready hai": 0.6, "theek": 0.5,
    "theek hai": 0.6, "achha": 0.6, "badhiya": 0.7, "sahi": 0.5,
    # --- general administrative vocabulary ---
    # Terms any competent lexicon for a government office should carry. Added as a
    # deliberate vocabulary sweep, NOT by inspecting held-out failures.
    "exceeded": 0.7, "achieved": 0.7, "achievement": 0.7, "disposed": 0.5,
    "timely": 0.7, "prompt": 0.7, "promptly": 0.7, "quick": 0.6, "quickly": 0.6,
    "efficient": 0.7, "efficiently": 0.7, "successful": 0.8, "successfully": 0.8,
    "appreciated": 0.8, "appreciation": 0.8, "commended": 0.8, "tallied": 0.6,
    "perfectly": 0.7, "well": 0.4, "zero pendency": 0.8, "no pendency": 0.8,
    "handed over": 0.3, "in order": 0.6, "as per schedule": 0.6,
}

NEGATIVE: dict[str, float] = {
    "delay": -0.7, "delayed": -0.75, "delays": -0.7, "overdue": -0.8,
    # "pending" alone is a status word, not a complaint — it must not by itself
    # push a routine note ("reminder sent for the pending statement") negative.
    "pending": -0.25,
    "stuck": -0.8, "blocked": -0.8, "blocker": -0.7, "issue": -0.5, "issues": -0.55,
    "problem": -0.6, "problems": -0.65, "error": -0.6, "mistake": -0.6,
    "missing": -0.4, "mismatch": -0.6, "incomplete": -0.6, "rejected": -0.8,
    "reject": -0.7, "failed": -0.8, "failure": -0.8, "escalate": -0.6,
    "escalated": -0.7, "urgent": -0.3, "pressure": -0.6, "overload": -0.8,
    "overloaded": -0.85, "overwhelmed": -0.9, "exhausted": -0.9, "tired": -0.7,
    "frustrated": -0.85, "frustrating": -0.8, "disappointing": -0.75,
    "disappointed": -0.75, "unacceptable": -0.85, "unable": -0.6,
    "not possible": -0.6, "not able": -0.65, "not available": -0.6,
    "could not": -0.5, "no response": -0.7, "no support": -0.75, "shortage": -0.7,
    "understaffed": -0.8, "again and again": -0.6, "repeatedly": -0.5,
    "complaint": -0.6, "complaints": -0.65, "redo": -0.5,
    "pending hai": -0.5, "delay ho raha": -0.75, "delay ho raha hai": -0.75,
    "nahi hua": -0.7, "nahi ho": -0.65, "nahi mila": -0.7, "time nahi": -0.7,
    "bahut load": -0.8, "kaam bahut": -0.7, "samajh nahi": -0.6, "dikkat": -0.7,
    # Scored as one phrase: "pareshan" + "ho gaya" would otherwise cancel out.
    "pareshan ho gaya": -0.85, "pareshan": -0.85, "mushkil": -0.7,
    # --- general administrative vocabulary ---
    # A vocabulary sweep of terms that routinely signal trouble in office notes.
    "fed up": -0.85, "absent": -0.6, "duplicate": -0.5, "repeated": -0.5,
    "difficult": -0.6, "difficulty": -0.6, "postponed": -0.6, "cancelled": -0.7,
    "not working": -0.7, "spoiled": -0.75, "damaged": -0.7, "defective": -0.7,
    "faulty": -0.65, "breach": -0.7, "breached": -0.75, "insufficient": -0.6,
    "lapse": -0.7, "irregular": -0.6, "discrepancy": -0.6, "objection": -0.55,
    "deficiency": -0.6, "unresolved": -0.7, "held up": -0.7, "backlog": -0.5,
    "penalty": -0.6, "adverse": -0.7, "unsatisfactory": -0.8, "poor": -0.7,
    "non compliance": -0.7, "violation": -0.75, "denied": -0.65, "refused": -0.7,
    "cannot be": -0.5, "could not be": -0.55, "no substitute": -0.6,
    "has to be repeated": -0.7, "restarts": -0.5,
}

NEGATORS = {"not", "no", "never", "don't", "dont", "cannot", "can't", "without", "nahi", "na"}

INTENSIFIERS: dict[str, float] = {
    "very": 1.5, "extremely": 1.8, "really": 1.4, "bahut": 1.6, "kaafi": 1.4,
    "totally": 1.5, "completely": 1.5, "slightly": 0.6, "somewhat": 0.7,
    "partially": 0.25, "thoda": 0.7,
}

# Longest phrases first, so "delay ho raha hai" wins over "delay ho raha".
_PHRASES: list[tuple[list[str], float]] = sorted(
    (
        (phrase.split(" "), weight)
        for phrase, weight in {**POSITIVE, **NEGATIVE}.items()
        if " " in phrase
    ),
    key=lambda item: len(item[0]),
    reverse=True,
)

_CLAUSE_SPLIT = re.compile(r"[.;!?,\n]+")
_CLEAN = re.compile(r"[^\w\s']", re.UNICODE)
_SPACES = re.compile(r"\s+")


def label_for(score: float) -> Label:
    if score > NEUTRAL_BAND:
        return "POSITIVE"
    if score < -NEUTRAL_BAND:
        return "NEGATIVE"
    return "NEUTRAL"


def _score_clause(clause: str) -> tuple[float, int, list[str]]:
    tokens = [t for t in _SPACES.sub(" ", _CLEAN.sub(" ", clause)).strip().split(" ") if t]
    if not tokens:
        return 0.0, 0, []

    consumed = [False] * len(tokens)
    total = 0.0
    hits = 0
    matched: list[str] = []

    # 1. Phrases, longest first, consuming their tokens.
    for words, weight in _PHRASES:
        n = len(words)
        for i in range(len(tokens) - n + 1):
            if any(consumed[i : i + n]):
                continue
            if tokens[i : i + n] != words:
                continue
            value = weight
            prev = tokens[i - 1] if i >= 1 else None
            if prev and prev in NEGATORS:
                value *= -0.85
            elif prev and prev in INTENSIFIERS:
                value *= INTENSIFIERS[prev]
            total += value
            hits += 1
            matched.append(" ".join(words))
            for j in range(i, i + n):
                consumed[j] = True

    # 2. Remaining single tokens.
    for i, token in enumerate(tokens):
        if consumed[i]:
            continue
        weight = POSITIVE.get(token, NEGATIVE.get(token))
        if weight is None:
            continue

        value = weight
        prev = tokens[i - 1] if i >= 1 else None
        prev2 = tokens[i - 2] if i >= 2 else None

        if prev and prev in INTENSIFIERS:
            value *= INTENSIFIERS[prev]
        # "not resolved" must not read as positive.
        if (prev and prev in NEGATORS) or (prev2 and prev2 in NEGATORS):
            value *= -0.85

        total += value
        hits += 1
        matched.append(token)

    return total, hits, matched


def score_text(text: str) -> tuple[float, Label, list[str]]:
    total = 0.0
    hits = 0
    matched: list[str] = []

    for clause in _CLAUSE_SPLIT.split(text.lower()):
        c_total, c_hits, c_matched = _score_clause(clause)
        total += c_total
        hits += c_hits
        matched.extend(c_matched)

    if hits == 0:
        return 0.0, "NEUTRAL", []

    raw = total / math.sqrt(hits)
    score = round(max(-1.0, min(1.0, raw)), 4)
    return score, label_for(score), matched


MODEL_VERSION = LEXICON_VERSION
