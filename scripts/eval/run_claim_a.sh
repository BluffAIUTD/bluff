#!/bin/bash
# Claim A end to end. The split is created once and committed BEFORE any prompt tuning; re-running reuses it.
set -e
cd "$(dirname "$0")/../.."
[ -f eval/split.json ] || python3 scripts/eval/prepare_split.py
python3 scripts/eval/run_baseline.py
python3 scripts/eval/run_bluff.py "$@"
python3 scripts/eval/score.py
