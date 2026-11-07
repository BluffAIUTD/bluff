"""Shared metric helpers (stdlib only)."""
import json
import os
import tempfile


def prf(tp: int, fp: int, fn: int) -> dict:
    p = tp / (tp + fp) if (tp + fp) else 0.0
    r = tp / (tp + fn) if (tp + fn) else 0.0
    f1 = 2 * p * r / (p + r) if (p + r) else 0.0
    return {"p": round(p, 4), "r": round(r, 4), "f1": round(f1, 4)}


def link_counts(pairs):
    """pairs: iterable of (predicted_id | None, true_id | None).
    TP: predicted == true (non-null). FP: predicted non-null and != true (wrong link, or a link where none exists).
    FN: true non-null and predicted != true (missed, or linked to the wrong exposure)."""
    tp = fp = fn = 0
    for pred, true in pairs:
        if pred is not None and pred == true:
            tp += 1
        else:
            if pred is not None:
                fp += 1
            if true is not None:
                fn += 1
    return tp, fp, fn


def binary_counts(pairs):
    """pairs: (predicted_scam: bool, true_scam: bool); positive class = scam."""
    tp = fp = fn = tn = 0
    for pred, true in pairs:
        if pred and true:
            tp += 1
        elif pred and not true:
            fp += 1
        elif not pred and true:
            fn += 1
        else:
            tn += 1
    return tp, fp, fn, tn


def merge_results(path: str, key: str, value: dict, generated_at: str) -> dict:
    """Update one claim in eval/results.json atomically, preserving the others."""
    data = {}
    if os.path.exists(path):
        with open(path) as f:
            data = json.load(f)
    data[key] = value
    data["generated_at"] = generated_at
    d = os.path.dirname(path) or "."
    fd, tmp = tempfile.mkstemp(dir=d, suffix=".json")
    with os.fdopen(fd, "w") as f:
        json.dump(data, f, indent=2)
        f.write("\n")
    os.replace(tmp, path)
    return data
