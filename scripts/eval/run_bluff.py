#!/usr/bin/env python3
"""Run Bluff on the test ids via POST /api/investigate/message (source=eval, sync, no alerts) -> eval/bluff_a.json.
Concurrency 3, one retry on error; persistent errors are recorded and counted as wrong by score.py."""
import argparse
import concurrent.futures as cf
import json
import os
import sys
import time
import urllib.request

sys.path.insert(0, os.path.dirname(__file__))
from load_dataset import ROOT, load  # noqa: E402


def call(base, key, text):
    req = urllib.request.Request(f"{base}/api/investigate/message", data=json.dumps({"text": text, "source": "eval"}).encode(),
                                 headers={"content-type": "application/json", "x-eval-key": key}, method="POST")
    with urllib.request.urlopen(req, timeout=40) as r:
        return json.load(r)


def one(base, key, mid, text):
    for attempt in (1, 2):
        try:
            t0 = time.time()
            r = call(base, key, text)
            return mid, {"ok": True, "verdict": r["verdict"], "mode": r.get("mode"), "ms": int((time.time() - t0) * 1000)}
        except Exception as e:  # noqa: BLE001 - record and retry once
            err = str(e)
            time.sleep(1)
    return mid, {"ok": False, "error": err}


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default=os.environ.get("BLUFF_BASE", "http://localhost:3000"))
    ap.add_argument("--key", default=os.environ.get("EVAL_KEY", "eval"))
    ap.add_argument("--concurrency", type=int, default=int(os.environ.get("EVAL_CONCURRENCY", "3")), help="3 for mock; use 1 with the hosted model (it rate-limits overlapping calls)")
    a = ap.parse_args()
    split = json.load(open(os.path.join(ROOT, "eval", "split.json")))
    rows = {r["id"]: r for r in load()}
    out = {}
    with cf.ThreadPoolExecutor(max_workers=max(1, a.concurrency)) as ex:
        for mid, res in ex.map(lambda i: one(a.base, a.key, i, rows[i]["text"]), split["test"]):
            out[mid] = res
    json.dump(out, open(os.path.join(ROOT, "eval", "bluff_a.json"), "w"), indent=2)
    print(f"bluff results: {sum(1 for v in out.values() if v['ok'])}/{len(out)} ok")
