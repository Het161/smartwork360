"""Runtime configuration for the SMARTWORK 360 ML service."""

import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")


def _flag(name: str, default: str) -> bool:
    return os.getenv(name, default).strip().lower() not in {"false", "0", "no"}


# HEURISTIC_MODE defaults to TRUE. The ground rule for this project is that the
# demo can never break offline, and the model path needs a ~250MB download on
# first run. Heuristic mode is a first-class path, not a degraded one: it uses the
# same API contract and reports `mode: "heuristic"` honestly in every response.
HEURISTIC_MODE = _flag("HEURISTIC_MODE", "true")

MODEL_CACHE_DIR = os.getenv("MODEL_CACHE_DIR", "./models")
PORT = int(os.getenv("PORT", "8000"))
LOG_LEVEL = os.getenv("LOG_LEVEL", "info")

SENTIMENT_MODEL = "distilbert-base-uncased-finetuned-sst-2-english"

# Scores inside ±NEUTRAL_BAND are reported NEUTRAL. Mirrors the TypeScript
# constant in packages/shared so both implementations agree on the label.
NEUTRAL_BAND = 0.25

LEXICON_VERSION = "heuristic-lexicon-v1.2-hinglish"
BURNOUT_RULES_VERSION = "heuristic-burnout-rules-v1"
ANOMALY_RULES_VERSION = "heuristic-zscore-v1"
CHAT_VERSION = "intent-router-v1"
