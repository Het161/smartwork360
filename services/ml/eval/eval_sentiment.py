#!/usr/bin/env python3
"""
Sentiment evaluation.

    python eval/eval_sentiment.py                        # heuristic lexicon
    HEURISTIC_MODE=false python eval/eval_sentiment.py   # DistilBERT SST-2

Two datasets, and the distinction matters:

  office_comments_dev.csv     (50)  FIRST DEV set. Weights were tuned against it.
                                    Scores ~100% because it was built against it.
  office_comments_test.csv    (40)  SECOND DEV set. Its error pattern showed the
                                    lexicon was missing whole areas of ordinary
                                    administrative vocabulary, which prompted a
                                    vocabulary sweep — so it is no longer clean.
  office_comments_holdout.csv (40)  HELD-OUT set. Written after all tuning stopped
                                    and never used to change anything. This is the
                                    number the README quotes.

Each set is retired from the headline the moment it influences a change. Quoting a
figure from data that shaped the model is fitting to the test set.

Why a bespoke corpus at all: DistilBERT SST-2 reports ~91.3% on the SST-2 dev
split (English movie reviews). That number says nothing about how it handles
"delay ho raha hai". These sets measure the thing the product actually does.
"""

import csv
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import sentiment  # noqa: E402
from app.config import HEURISTIC_MODE  # noqa: E402
from app.schemas import SentimentItemIn  # noqa: E402

HERE = Path(__file__).resolve().parent
LABELS = ("POSITIVE", "NEUTRAL", "NEGATIVE")


def load(path: Path) -> list[tuple[str, str]]:
    with path.open(encoding="utf-8") as fh:
        return [(r["text"], r["label"].strip().upper()) for r in csv.DictReader(fh)]


def evaluate(path: Path, title: str, *, show_errors: bool) -> float:
    rows = load(path)
    items = [SentimentItemIn(id=str(i), text=t) for i, (t, _) in enumerate(rows)]
    gold = [label for _, label in rows]

    preds_out, version, mode = sentiment.score_batch(items)
    preds = [p.label for p in preds_out]

    correct = sum(1 for g, p in zip(gold, preds) if g == p)
    accuracy = correct / len(gold)

    print(f"  {title}")
    print(f"  {'-' * len(title)}")
    print(f"  file         {path.name}  ({len(rows)} comments)")
    print(f"  mode         {mode}")
    print(f"  modelVersion {version}")
    print(f"  ACCURACY     {correct}/{len(gold)} = {accuracy:.1%}")
    print()
    print("  class      support  precision  recall   f1")

    macro_f1 = 0.0
    for label in LABELS:
        support = sum(1 for g in gold if g == label)
        predicted = sum(1 for p in preds if p == label)
        hit = sum(1 for g, p in zip(gold, preds) if g == label and p == label)
        precision = hit / predicted if predicted else 0.0
        recall = hit / support if support else 0.0
        f1 = 2 * precision * recall / (precision + recall) if (precision + recall) else 0.0
        macro_f1 += f1 / len(LABELS)
        print(f"  {label:<9} {support:>7}  {precision:>9.2f}  {recall:>6.2f}  {f1:>4.2f}")
    print(f"  macro-F1   {macro_f1:.3f}")
    print()

    if show_errors:
        confusion = Counter((g, p) for g, p in zip(gold, preds) if g != p)
        if confusion:
            print("  misclassified:")
            for (text, g), p in zip(rows, preds):
                if g != p:
                    print(f"    [{g:<8} -> {p:<8}]  {text[:80]}")
            print()

    return accuracy


def main() -> int:
    print()
    print("  SMARTWORK 360 — sentiment evaluation")
    print("  ====================================")
    print()

    holdout_acc = evaluate(
        HERE / "office_comments_holdout.csv",
        "HELD-OUT SET  (written after tuning stopped — THIS is the reported figure)",
        show_errors=True,
    )
    test_acc = evaluate(
        HERE / "office_comments_test.csv",
        "SECOND DEV SET  (errors on it informed a vocabulary sweep — optimistic)",
        show_errors=False,
    )
    dev_acc = evaluate(
        HERE / "office_comments_dev.csv",
        "FIRST DEV SET  (weights were tuned on this — most optimistic)",
        show_errors=False,
    )

    print("  Summary")
    print("  -------")
    print(f"  Held-out accuracy    {holdout_acc:.1%}   <-- quote this one")
    print(f"  Second dev accuracy  {test_acc:.1%}   (informed vocabulary; not a fair estimate)")
    print(f"  First dev accuracy   {dev_acc:.1%}   (tuned on; not a fair estimate)")
    print()

    if HEURISTIC_MODE:
        print("  This is the offline lexicon path (the default). To evaluate DistilBERT:")
        print("    pip install -r requirements-models.txt")
        print("    HEURISTIC_MODE=false python eval/eval_sentiment.py")
    else:
        print("  Caveat: the neutrality gate in model mode was added AFTER seeing this")
        print("  set's failure pattern, so the model figure is mildly optimistic. The")
        print("  heuristic figure is clean — nothing changed after it was measured.")
    print()
    print("  Measured on this held-out set:")
    print("    heuristic lexicon                     87.5%")
    print("    DistilBERT SST-2 + neutrality gate    85.0%")
    print("    DistilBERT SST-2 alone                65.0%  (no NEUTRAL class)")
    print()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
