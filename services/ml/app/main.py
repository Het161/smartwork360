"""
SMARTWORK 360 — ML microservice (FastAPI).

Phase 0 scaffold: health + mode reporting only. The sentiment / burnout /
anomaly / chat endpoints are implemented in Phase 5.
"""

import os

from fastapi import FastAPI

HEURISTIC_MODE = os.getenv("HEURISTIC_MODE", "true").lower() != "false"

app = FastAPI(
    title="SMARTWORK 360 ML Service",
    description="Sentiment, burnout, anomaly detection and chat intent routing.",
    version="1.0.0",
)


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "service": "smartwork360-ml",
        "mode": "heuristic" if HEURISTIC_MODE else "model",
    }
