"""Second baseline for the stretch eval: the same model with ONE prompt and no tools (zero-shot). Needs NVIDIA_API_KEY + NEMOTRON_MODEL."""
import json
import os
import urllib.request

PROMPT = "Classify the message as scam or legit. Answer with exactly one word: scam or legit.\n\nMessage:\n{text}"


def parse(answer: str):
    a = (answer or "").strip().lower()
    if a.startswith("scam") or ("scam" in a and "legit" not in a):
        return True
    if a.startswith("legit") or ("legit" in a and "scam" not in a):
        return False
    return None  # unparseable -> counted wrong by the scorer


def predict(text: str, base=None, key=None, model=None, timeout=30):
    base = (base or os.environ.get("NVIDIA_BASE_URL", "https://integrate.api.nvidia.com/v1")).rstrip("/")
    key, model = key or os.environ.get("NVIDIA_API_KEY"), model or os.environ.get("NEMOTRON_MODEL")
    if not key or not model:
        raise RuntimeError("zero-shot baseline needs NVIDIA_API_KEY and NEMOTRON_MODEL")
    body = json.dumps({"model": model, "temperature": 0, "max_tokens": 8, "messages": [{"role": "user", "content": PROMPT.format(text=text)}]}).encode()
    req = urllib.request.Request(f"{base}/chat/completions", data=body, headers={"content-type": "application/json", "authorization": f"Bearer {key}"}, method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return parse(json.load(r)["choices"][0]["message"]["content"])
