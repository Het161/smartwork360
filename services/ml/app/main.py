"""
SMARTWORK 360 — ML microservice.

Four endpoints, all batch-capable, all returning `modelVersion` and
`mode: "model" | "heuristic"` so the UI can state honestly which path produced a
number.

The service is stateless: the API extracts features and this scores them.
"""

import logging

from fastapi import FastAPI

from . import anomaly, burnout, chat, sentiment
from .config import HEURISTIC_MODE, LOG_LEVEL, SENTIMENT_MODEL
from .schemas import (
    AnomalyRequest,
    AnomalyResponse,
    BurnoutRequest,
    BurnoutResponse,
    ChatRequest,
    ChatResponse,
    SentimentRequest,
    SentimentResponse,
)

logging.basicConfig(
    level=getattr(logging, LOG_LEVEL.upper(), logging.INFO),
    format="%(asctime)s  %(levelname)-7s %(name)s  %(message)s",
)
log = logging.getLogger("smartwork360.ml")

app = FastAPI(
    title="SMARTWORK 360 ML Service",
    version="1.0.0",
    description=(
        "Sentiment, burnout, anomaly detection and chat intent routing for "
        "SMARTWORK 360.\n\n"
        "**Every endpoint reports `mode`.** `heuristic` is a first-class path, not a "
        "degraded one — it uses the same contract and is the default so the demo "
        "cannot break on a machine with no internet."
    ),
)


@app.on_event("startup")
def _startup() -> None:
    log.info(
        "SMARTWORK 360 ML service starting — mode=%s",
        "heuristic" if HEURISTIC_MODE else f"model ({SENTIMENT_MODEL})",
    )
    if HEURISTIC_MODE:
        log.info("Set HEURISTIC_MODE=false and install requirements-models.txt for model-backed inference")


@app.get("/health", tags=["Meta"])
def health() -> dict:
    return {
        "status": "ok",
        "service": "smartwork360-ml",
        "mode": "heuristic" if HEURISTIC_MODE else "model",
        "endpoints": ["/sentiment", "/burnout", "/anomaly/scan", "/chat"],
    }


@app.get("/model-cards", tags=["Meta"])
def model_cards() -> dict:
    """Documents what each model is, what it was trained on, and its limitations."""
    return {
        "mode": "heuristic" if HEURISTIC_MODE else "model",
        "cards": [
            sentiment.model_card(),
            burnout.model_card(),
            anomaly.model_card(),
            chat.model_card(),
        ],
    }


@app.post("/sentiment", response_model=SentimentResponse, tags=["Sentiment"])
def score_sentiment(req: SentimentRequest) -> SentimentResponse:
    items, version, mode = sentiment.score_batch(req.items)
    return SentimentResponse(items=items, modelVersion=version, mode=mode)


@app.post("/burnout", response_model=BurnoutResponse, tags=["Burnout"])
def score_burnout(req: BurnoutRequest) -> BurnoutResponse:
    items, version, mode = burnout.score_users(req.users)
    return BurnoutResponse(items=items, modelVersion=version, mode=mode)


@app.post("/anomaly/scan", response_model=AnomalyResponse, tags=["Anomaly"])
def scan_anomalies(req: AnomalyRequest) -> AnomalyResponse:
    items, version, mode = anomaly.scan(req.events)
    return AnomalyResponse(items=items, modelVersion=version, mode=mode)


@app.post("/chat", response_model=ChatResponse, tags=["Chat"])
def chat_query(req: ChatRequest) -> ChatResponse:
    return chat.answer(req.message, req.context)
