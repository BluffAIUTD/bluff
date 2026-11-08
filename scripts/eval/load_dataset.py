"""Dataset adapter for Claim A.

Default: Bluff's own synthetic message set, data/messages/bluff-messages.jsonl (306 messages, generated with Nemotron,
NOT T-Mobile data; see data/messages/README.md). Its committed split is eval/messages_split.json.
Old stand-in: EVAL_DATA=eval/standin/messages.jsonl (104 template messages; split eval/split.json).
Any JSONL with fields id,text,label(scam|legit)[,category]: set EVAL_DATA=path.jsonl.
CSV: set EVAL_DATA=path.csv EVAL_TEXT_COL=... EVAL_LABEL_COL=... EVAL_SCAM_LABELS="spam,smishing" [EVAL_CATEGORY_COL=...] [EVAL_ID_COL=...]
"""
import csv
import json
import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
BLUFF_SET = os.path.join(ROOT, "data", "messages", "bluff-messages.jsonl")
STANDIN = os.path.join(ROOT, "eval", "standin", "messages.jsonl")


def data_path() -> str:
    p = os.environ.get("EVAL_DATA")
    return os.path.abspath(p) if p else BLUFF_SET


def dataset_name() -> str:
    p = data_path()
    if p == BLUFF_SET:
        return "Bluff's own synthetic message set (bluff-synthetic-v1, generated with Nemotron; NOT T-Mobile data)"
    if p == os.path.abspath(STANDIN):
        return "synthetic stand-in, template-generated (NOT T-Mobile data)"
    return f"external message set ({os.path.basename(p)})"


def split_path() -> str:
    """The committed split that belongs to the dataset (ids only)."""
    if data_path() == BLUFF_SET:
        return os.path.join(ROOT, "eval", "messages_split.json")
    return os.path.join(ROOT, "eval", "split.json")


def load_jsonl(path: str):
    rows = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            if not line.strip():
                continue
            r = json.loads(line)
            label = str(r["label"]).strip().lower()
            if label not in ("scam", "legit"):
                raise ValueError(f"{r.get('id')}: label must be scam or legit, got {label!r}")
            rows.append({"id": str(r["id"]), "text": r["text"], "label": label, "category": r.get("category") or "",
                         **({"difficulty": r["difficulty"]} if r.get("difficulty") else {})})
    return rows


def load():
    path = data_path()
    if path.endswith(".jsonl"):
        return load_jsonl(path)
    text_col, label_col = os.environ["EVAL_TEXT_COL"], os.environ["EVAL_LABEL_COL"]
    scam_labels = {x.strip().lower() for x in os.environ["EVAL_SCAM_LABELS"].split(",")}
    cat_col, id_col = os.environ.get("EVAL_CATEGORY_COL"), os.environ.get("EVAL_ID_COL")
    rows = []
    with open(path, newline="", encoding="utf-8") as f:
        for i, r in enumerate(csv.DictReader(f)):
            rows.append({"id": r[id_col] if id_col else f"m{i:05d}", "text": r[text_col],
                         "label": "scam" if r[label_col].strip().lower() in scam_labels else "legit",
                         "category": r.get(cat_col, "") if cat_col else ""})
    return rows
