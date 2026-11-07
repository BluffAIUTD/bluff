#!/usr/bin/env python3
"""Claim B: Bluff's exposure-to-charge linker vs a naive substring match, on seeded charges with ground truth.

Usage: python3 scripts/eval/run_linker.py [--base http://localhost:3000] [--key eval]
Reads eval/claimB_cases.json (npm run eval:export), calls POST /api/eval/link per charge, writes the claimB section of
eval/results.json. Reports the held-out TEST split; the DEV split is used only to sanity-check the production threshold.
"""
import argparse
import datetime
import json
import os
import re
import sys
import urllib.request

sys.path.insert(0, os.path.dirname(__file__))
from metrics import link_counts, merge_results, prf  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
THRESHOLD = 0.55


def call_link(base, key, txn_id):
    req = urllib.request.Request(
        f"{base}/api/eval/link", data=json.dumps({"txnId": txn_id}).encode(),
        headers={"content-type": "application/json", "x-eval-key": key}, method="POST")
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.load(r)


def naive_predict(descriptor, exposures):
    """Baseline: any exposure-label token of length >= 4 contained in the lowercased descriptor (longest token wins)."""
    d = descriptor.lower()
    best, best_len = None, 0
    for e in exposures:
        for tok in re.split(r"[^a-z0-9]+", e["label"].lower()):
            if len(tok) >= 4 and tok in d and len(tok) > best_len:
                best, best_len = e["id"], len(tok)
    return best


def evaluate(charges, preds):
    return link_counts([(preds[c["key"]], c["true_exposure_id"]) for c in charges])


def failures(charges, preds, labels, limit=5):
    out = []
    for c in charges:
        p, t = preds[c["key"]], c["true_exposure_id"]
        if p == t:
            continue
        kind = "missed the true exposure" if p is None else ("linked a charge that has no exposure" if t is None else "linked the wrong exposure")
        out.append({"id": c["key"], "text": c["descriptor"], "expected": labels.get(t, "no exposure"), "predicted": labels.get(p, "no link"),
                    "note": f"{kind}" + (f" ({c['note']})" if c.get("note") else "")})
    return out[:limit]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default=os.environ.get("BLUFF_BASE", "http://localhost:3000"))
    ap.add_argument("--key", default=os.environ.get("EVAL_KEY", "eval"))
    ap.add_argument("--cases", default=os.path.join(ROOT, "eval", "claimB_cases.json"))
    ap.add_argument("--out", default=os.path.join(ROOT, "eval", "results.json"))
    a = ap.parse_args()

    cases = json.load(open(a.cases))
    charges, exposures = cases["charges"], cases["exposures"]
    labels = {e["id"]: e["label"] for e in exposures}

    api = {}
    for c in charges:
        api[c["key"]] = call_link(a.base, a.key, c["txn_id"])
    bluff = {k: v["predictedExposureId"] for k, v in api.items()}
    naive = {c["key"]: naive_predict(c["descriptor"], exposures) for c in charges}

    dev = [c for c in charges if c["split"] == "dev"]
    test = [c for c in charges if c["split"] == "test"]

    # Threshold sanity check on DEV only (never on test): best-F1 threshold vs the production 0.55.
    sweep = {}
    for th in [x / 100 for x in range(30, 96, 5)]:
        pairs = [((api[c["key"]]["candidateExposureId"] if api[c["key"]]["score"] >= th else None), c["true_exposure_id"]) for c in dev]
        sweep[th] = prf(*link_counts(pairs))["f1"]
    best_th = max(sweep, key=lambda t: (sweep[t], -abs(t - THRESHOLD)))

    value = {
        "n": len(test),
        "split": f"held-out test split ({len(test)} charges: {sum(1 for c in test if c['true_exposure_id'])} with a true exposure, {sum(1 for c in test if not c['true_exposure_id'])} with none, {sum(1 for c in test if c['hard'])} hard). Dev split ({len(dev)}) used only to check the threshold.",
        "dataset": "synthetic charges authored for this project (not real customer data)",
        "method": "SQL linker: normalized descriptor + trigram/abbreviation/token name score + time window (agent confirmation not applied in this eval)",
        "bluff": prf(*evaluate(test, bluff)),
        "baseline": prf(*evaluate(test, naive)),
        "threshold": THRESHOLD,
        "dev": {"bluff": prf(*evaluate(dev, bluff)), "baseline": prf(*evaluate(dev, naive)), "best_threshold_on_dev": best_th, "f1_by_threshold": {str(k): v for k, v in sweep.items()}},
        "caveat": "Optimistic by construction: these synthetic charges were written by the same team as the linker and every positive was checked to be solvable by it (data integrity test). Treat F1 near 1.0 as \"the pipeline works\", not as expected real-world accuracy. The naive baseline mainly loses on abbreviated descriptors.",
        "failures": failures(test, bluff, labels),
        "baseline_failures": failures(test, naive, labels, limit=3),
    }
    now = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    merge_results(a.out, "claimB", value, now)
    print(json.dumps({k: value[k] for k in ("n", "bluff", "baseline", "threshold")}, indent=2))
    print("dev best threshold:", best_th, "| failures:", len(value["failures"]))


if __name__ == "__main__":
    main()
