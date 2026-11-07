"""Baseline adapter for Claim A. REPLACE with T-Mobile's provided baseline classifier once its delivery format is known.

The default is a STAND-IN rule so the pipeline runs: "message contains a link → scam". It is not T-Mobile's baseline.
predict(text) -> bool (True = scam).
"""
import re

NAME = "Stand-in baseline: contains a link → scam (not T-Mobile's baseline)"
_URL = re.compile(r"https?://|\b[a-z0-9-]+\.(?:com|net|org|co|top|xyz|help|click|live|info)\b", re.I)


def predict(text: str) -> bool:
    return bool(_URL.search(text))
