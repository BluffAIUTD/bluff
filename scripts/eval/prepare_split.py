#!/usr/bin/env python3
"""Stratified 80/20 split with seed 42. Writes eval/split.json (ids only). COMMIT THIS BEFORE ANY PROMPT TUNING."""
import json
import os
import random
import sys

sys.path.insert(0, os.path.dirname(__file__))
from load_dataset import ROOT, dataset_name, load  # noqa: E402


def split(rows, seed=42, test_frac=0.2):
    rng = random.Random(seed)
    train, test = [], []
    for label in ("scam", "legit"):
        ids = sorted(r["id"] for r in rows if r["label"] == label)
        rng.shuffle(ids)
        k = max(1, round(len(ids) * test_frac))
        test += ids[:k]
        train += ids[k:]
    return sorted(train), sorted(test)


if __name__ == "__main__":
    rows = load()
    train, test = split(rows)
    out = os.path.join(ROOT, "eval", "split.json")
    json.dump({"seed": 42, "dataset": dataset_name(), "test_fraction": 0.2, "n_train": len(train), "n_test": len(test), "train": train, "test": test}, open(out, "w"), indent=2)
    print(f"wrote {out}: {len(train)} train / {len(test)} test")
