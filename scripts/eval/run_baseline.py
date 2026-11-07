#!/usr/bin/env python3
"""Run the baseline on the test ids -> eval/baseline_a.json."""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import baseline  # noqa: E402
from load_dataset import ROOT, load  # noqa: E402

split = json.load(open(os.path.join(ROOT, "eval", "split.json")))
rows = {r["id"]: r for r in load()}
preds = {i: baseline.predict(rows[i]["text"]) for i in split["test"]}
json.dump({"baseline": baseline.NAME, "predictions": preds}, open(os.path.join(ROOT, "eval", "baseline_a.json"), "w"), indent=2)
print(f"baseline predictions for {len(preds)} test messages")
