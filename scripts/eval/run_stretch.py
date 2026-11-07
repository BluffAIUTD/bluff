#!/usr/bin/env python3
"""Stretch eval on eval/stretch.jsonl: Bluff vs a zero-shot no-tools baseline (if a key is configured), with a failure table.
Merges `stretch` into eval/results.json. Usage: python3 scripts/eval/run_stretch.py --base http://localhost:3000"""
import argparse
import datetime
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from metrics import binary_counts, merge_results, prf  # noqa: E402
from run_bluff import one  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))


def run(rows, bluff_of, zeroshot_of=None):
    res, zs = {}, {}
    for r in rows:
        res[r["id"]] = bluff_of(r)
        if zeroshot_of:
            try:
                zs[r["id"]] = zeroshot_of(r["text"])
            except Exception:  # noqa: BLE001 - error counted as wrong
                zs[r["id"]] = None
    return res, zs


def summarize(rows, bluff, zs):
    def pairs(pred_of):
        out = []
        for r in rows:
            truth = r["label"] == "scam"
            p = pred_of(r["id"])
            out.append((p if p is not None else (not truth), truth))
        return out
    def b(i):
        x = bluff[i]
        return None if not x.get("ok") else x["verdict"]["verdict"] in ("likely_scam", "unsure")
    out = {"n": len(rows), "dataset": "hand-labeled cases (eval/stretch.jsonl)", "bluff": prf(*binary_counts(pairs(b))[:3])}
    if zs:
        out["zero_shot_no_tools"] = prf(*binary_counts(pairs(lambda i: zs.get(i)))[:3])
    fails = []
    for r in rows:
        p = b(r["id"])
        if p is None or p != (r["label"] == "scam"):
            v = bluff[r["id"]].get("verdict", {})
            fails.append({"id": r["id"], "kind": r["kind"], "text": r["text"][:200], "expected": r["label"], "predicted": "error" if p is None else ("scam" if p else "legit"),
                          "note": f"{v.get('verdict')} {v.get('score')}/100; " + "; ".join(v.get("evidence", [])[:2])})
    out["failures"] = fails
    return out


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default=os.environ.get("BLUFF_BASE", "http://localhost:3000"))
    ap.add_argument("--key", default=os.environ.get("EVAL_KEY", "eval"))
    a = ap.parse_args()
    rows = [json.loads(l) for l in open(os.path.join(ROOT, "eval", "stretch.jsonl")) if l.strip()]
    have_zs = bool(os.environ.get("NVIDIA_API_KEY") and os.environ.get("NEMOTRON_MODEL"))
    zs_fn = None
    if have_zs:
        import zeroshot
        zs_fn = zeroshot.predict
    else:
        print("note: NVIDIA_API_KEY/NEMOTRON_MODEL not set, skipping the zero-shot baseline")
    bluff, zs = run(rows, lambda r: one(a.base, a.key, r["id"], r["text"])[1], zs_fn)
    value = summarize(rows, bluff, zs)
    value["note"] = "Stretch set is small and hand-written by the team; extend to 40-50 cases for a meaningful comparison."
    merge_results(os.path.join(ROOT, "eval", "results.json"), "stretch", value, datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"))
    print(json.dumps({k: value[k] for k in value if k in ("n", "bluff", "zero_shot_no_tools")}, indent=2), "| failures:", len(value["failures"]))
