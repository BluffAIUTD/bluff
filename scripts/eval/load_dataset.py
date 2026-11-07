"""Dataset adapter. Swap in the real T-Mobile message set here once its format is known.

Stand-in (default): eval/standin/messages.jsonl with fields id,text,label(scam|legit),category.
Real data, CSV: set EVAL_DATA=path.csv EVAL_TEXT_COL=... EVAL_LABEL_COL=... EVAL_SCAM_LABELS="spam,smishing" [EVAL_CATEGORY_COL=...] [EVAL_ID_COL=...]
"""
import csv
import json
import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
STANDIN = os.path.join(ROOT, "eval", "standin", "messages.jsonl")


def dataset_name() -> str:
    return "synthetic stand-in, template-generated (NOT T-Mobile data)" if not os.environ.get("EVAL_DATA") else f"T-Mobile synthetic message set ({os.path.basename(os.environ['EVAL_DATA'])})"


def load():
    path = os.environ.get("EVAL_DATA")
    if not path:
        with open(STANDIN) as f:
            return [json.loads(line) for line in f if line.strip()]
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
