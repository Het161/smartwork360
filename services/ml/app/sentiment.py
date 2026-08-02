"""
Sentiment scoring.

model mode      DistilBERT fine-tuned on SST-2 (distilbert-base-uncased-finetuned-
                sst-2-english). Published SST-2 dev accuracy ~91%; measured on our
                own 50-sample office-comment set by eval/eval_sentiment.py.
heuristic mode  Hinglish-aware lexicon (see lexicon.py). No download, no network.

Both return the identical contract, differing only in `mode` and `modelVersion`.
"""

import logging

from .config import HEURISTIC_MODE, MODEL_CACHE_DIR, SENTIMENT_MODEL, NEUTRAL_BAND
from . import lexicon
from .schemas import SentimentItemIn, SentimentItemOut

log = logging.getLogger("smartwork360.ml.sentiment")

_pipeline = None
_load_failed = False


def _get_pipeline():
    """
    Lazily builds the transformers pipeline.

    Loading is deferred until the first request so the service starts instantly,
    and any failure (no torch, no network, no disk) is caught once and degrades to
    the lexicon rather than turning every later request into an exception.
    """
    global _pipeline, _load_failed

    if _pipeline is not None or _load_failed:
        return _pipeline

    try:
        from transformers import pipeline  # imported lazily — heavy dependency

        log.info("Loading %s (first run downloads ~250MB)…", SENTIMENT_MODEL)
        _pipeline = pipeline(
            "sentiment-analysis",
            model=SENTIMENT_MODEL,
            tokenizer=SENTIMENT_MODEL,
            model_kwargs={"cache_dir": MODEL_CACHE_DIR},
            truncation=True,
            max_length=256,
        )
        log.info("Sentiment model ready")
    except Exception as exc:  # noqa: BLE001 — any failure must fall back cleanly
        _load_failed = True
        log.warning("Could not load %s (%s) — using lexicon", SENTIMENT_MODEL, exc)

    return _pipeline


def _to_signed_score(label: str, confidence: float) -> float:
    """
    SST-2 emits POSITIVE/NEGATIVE with a confidence in [0.5, 1.0]. Map that onto the
    signed −1…+1 range the rest of the system uses: a 0.5-confidence prediction is
    genuinely uncertain and should land at 0, not at ±0.5.
    """
    signed = (confidence - 0.5) * 2.0
    return round(signed if label.upper() == "POSITIVE" else -signed, 4)


def score_batch(items: list[SentimentItemIn]) -> tuple[list[SentimentItemOut], str, str]:
    if not items:
        return [], lexicon.MODEL_VERSION, "heuristic"

    if not HEURISTIC_MODE:
        pipe = _get_pipeline()
        if pipe is not None:
            try:
                texts = [i.text for i in items]
                results = pipe(texts)
                out = []
                for item, res in zip(items, results):
                    # NEUTRALITY GATE.
                    #
                    # SST-2 is a BINARY classifier — it has no NEUTRAL class and is
                    # confidently wrong on routine administrative text ("Placed the
                    # muster roll before the accounts branch" scores NEGATIVE at
                    # >0.9). Most notes in a government file are neither praise nor
                    # complaint, so the classifier alone is unusable here.
                    #
                    # The lexicon answers a different question — "does this text
                    # contain any affect-bearing vocabulary at all?" — and that is
                    # exactly the question SST-2 cannot answer. If nothing matches,
                    # the note is administrative and stays NEUTRAL regardless of how
                    # confident the classifier is.
                    _, _, matched = lexicon.score_text(item.text)
                    if not matched:
                        out.append(SentimentItemOut(id=item.id, score=0.0, label="NEUTRAL"))
                        continue

                    score = _to_signed_score(res["label"], float(res["score"]))
                    out.append(
                        SentimentItemOut(id=item.id, score=score, label=lexicon.label_for(score))
                    )
                return out, f"{SENTIMENT_MODEL}@sst-2+neutrality-gate", "model"
            except Exception as exc:  # noqa: BLE001
                log.warning("Inference failed (%s) — using lexicon for this batch", exc)

    out = []
    for item in items:
        score, label, _ = lexicon.score_text(item.text)
        out.append(SentimentItemOut(id=item.id, score=score, label=label))
    return out, lexicon.MODEL_VERSION, "heuristic"


def model_card() -> dict:
    return {
        "task": "sentiment",
        "modelMode": {
            "name": SENTIMENT_MODEL,
            "base": "DistilBERT (66M parameters)",
            "finetunedOn": "SST-2 (Stanford Sentiment Treebank v2)",
            "publishedAccuracy": "~91.3% on SST-2 dev",
            "limitations": (
                "Trained on English movie reviews. Hindi and Hinglish inputs are "
                "out of distribution, which is why the heuristic lexicon is tuned "
                "for them and used as the offline path."
            ),
        },
        "heuristicMode": {
            "name": lexicon.MODEL_VERSION,
            "method": "Weighted lexicon with negation and intensifier handling",
            "vocabulary": f"{len(lexicon.POSITIVE)} positive, {len(lexicon.NEGATIVE)} negative terms",
            "coverage": "Indian government office English plus common Hinglish forms",
        },
        "neutralBand": NEUTRAL_BAND,
        "outputRange": "-1.0 to +1.0",
    }
