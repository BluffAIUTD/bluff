#!/usr/bin/env python3
"""Fixed, seeded splits (ids only). COMMIT THE SPLIT BEFORE ANY TUNING; re-running reproduces it byte for byte.

Default (Bluff message set): stratified by category, 70/30, seed 42 -> eval/messages_split.json. Rules are tuned on
train only; every reported number is on test.
Old stand-in (EVAL_DATA=eval/standin/messages.jsonl): stratified by label, 80/20, seed 42 -> eval/split.json.
"""
import json
import os
import random
import sys

sys.path.insert(0, os.path.dirname(__file__))
from load_dataset import BLUFF_SET, data_path, dataset_name, load, split_path  # noqa: E402


def split(rows, seed=42, test_frac=0.2):
    """Stratified by label (the stand-in's split)."""
    rng = random.Random(seed)
    train, test = [], []
    for label in ("scam", "legit"):
        ids = sorted(r["id"] for r in rows if r["label"] == label)
        rng.shuffle(ids)
        k = max(1, round(len(ids) * test_frac))
        test += ids[:k]
        train += ids[k:]
    return sorted(train), sorted(test)


def split_by_category(rows, seed=42, test_frac=0.3):
    """Stratified by category (each category keeps ~test_frac of its items in test, at least one)."""
    rng = random.Random(seed)
    train, test = [], []
    for cat in sorted({r["category"] for r in rows}):
        ids = sorted(r["id"] for r in rows if r["category"] == cat)
        rng.shuffle(ids)
        k = max(1, round(len(ids) * test_frac))
        test += ids[:k]
        train += ids[k:]
    return sorted(train), sorted(test)


if __name__ == "__main__":
    rows = load()
    by_category = data_path() == BLUFF_SET
    frac = 0.3 if by_category else 0.2
    train, test = split_by_category(rows, 42, frac) if by_category else split(rows, 42, frac)
    out = split_path()
    data = {"seed": 42, "dataset": dataset_name(), "stratified_by": "category" if by_category else "label", "test_fraction": frac,
            "n_train": len(train), "n_test": len(test), "train": train, "test": test}
    with open(out, "w") as f:
        json.dump(data, f, indent=2)
        f.write("\n")
    print(f"wrote {out}: {len(train)} train / {len(test)} test")
