"""Shared helpers for the Finlingo Vercel Python functions.

These run as stateless serverless functions, so anything that used to live in a
long-running process (rate-limit buckets, the SQLite job DB, a background
worker) is either kept per-instance/best-effort or moved to a durable store.
"""

import json
import os
import re
import sys
import threading
import time
from collections import defaultdict, deque
from http.server import BaseHTTPRequestHandler
from pathlib import Path

# ── Anthropic configuration (server-side only) ──────────────────────────
ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages"
ANTHROPIC_MODEL = "claude-sonnet-4-6"
ANTHROPIC_VERSION = "2023-06-01"

# Best-effort, per-instance rate limiting. On Fluid Compute an instance is
# reused across requests, so this still throttles abusive bursts; it is not a
# global guarantee (which would require a shared store) but matches the prior
# single-process behavior closely enough.
_RATE_LIMIT = 20
_RATE_WINDOW_SECONDS = 10 * 60
_RATE_BUCKETS = defaultdict(deque)
_RATE_LOCK = threading.Lock()

_ENV_LOADED = False


def load_local_env():
    """Load .env.local for local `vercel dev` / `python server.py` runs.

    On Vercel, real environment variables are already present and take
    precedence; this only fills in blanks from a local file.
    """
    global _ENV_LOADED
    if _ENV_LOADED:
        return
    _ENV_LOADED = True
    # Project root is two levels up from this file: api/_lib/common.py
    root = Path(__file__).resolve().parents[2]
    env_path = root / ".env.local"
    if not env_path.is_file():
        return
    try:
        lines = env_path.read_text(encoding="utf-8").splitlines()
    except OSError:
        return
    for raw_line in lines:
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip("\"'")
        if key and value and os.environ.get(key, "").strip() in {"", "paste_my_key_here", "your_key_here"}:
            os.environ[key] = value


def env(name, default=""):
    load_local_env()
    return os.environ.get(name, default)


def anthropic_api_key():
    key = env("ANTHROPIC_API_KEY", "").strip()
    if not key or key in {"paste_my_key_here", "your_key_here"}:
        return ""
    return key


def is_production():
    return env("FINLINGO_ENV", env("NODE_ENV", "development")).lower() == "production"


def rate_limited(client_ip):
    now = time.monotonic()
    with _RATE_LOCK:
        bucket = _RATE_BUCKETS[client_ip]
        while bucket and now - bucket[0] > _RATE_WINDOW_SECONDS:
            bucket.popleft()
        if len(bucket) >= _RATE_LIMIT:
            return True
        bucket.append(now)
        return False


def limit_answer_words(text, limit=160):
    words = (text or "").split()
    if len(words) <= limit:
        return (text or "").strip()
    return " ".join(words[:limit]).rstrip(" ,;:") + "…"


# Matches the end of a sentence: ., ! or ? optionally followed by a closing
# quote/bracket, and immediately followed by whitespace or end-of-text.
_SENTENCE_END_RE = re.compile(r"[.!?][\"'”’)\]]?(?=\s|$)")


def trim_to_last_sentence(text, max_words=220):
    """Trim a free-text answer to a soft word budget WITHOUT cutting a sentence
    in half, and without appending an ellipsis.

    Behaviour:
      * Returns the text unchanged when it is within budget AND already ends on
        a complete sentence (the common case once max_tokens is generous).
      * When over budget, trims back to the end of the last complete sentence
        that fits. If no sentence boundary fits, it extends to the first
        sentence end past the budget rather than presenting a fragment.
      * If the text ends mid-sentence (e.g. the model still hit a token limit),
        the trailing fragment is dropped back to the last complete sentence.
    Paragraph breaks are preserved because we slice the original string.
    """
    raw = (text or "").strip()
    if not raw:
        return ""

    result = raw
    words = raw.split()
    if len(words) > max_words:
        # Character offset just after the max_words-th word.
        count = 0
        cut = len(raw)
        for match in re.finditer(r"\S+", raw):
            count += 1
            if count == max_words:
                cut = match.end()
                break
        ends = list(_SENTENCE_END_RE.finditer(raw[:cut]))
        if ends:
            result = raw[: ends[-1].end()]
        else:
            after = _SENTENCE_END_RE.search(raw, cut)
            result = raw[: after.end()] if after else raw

    # Never end on an incomplete sentence (handles model output that stopped
    # mid-thought because it reached max_tokens).
    if not re.search(r"[.!?][\"'”’)\]]?\s*$", result):
        ends = list(_SENTENCE_END_RE.finditer(result))
        if ends:
            result = result[: ends[-1].end()]

    return result.strip()


def now_iso():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def ask_log(*args):
    print("[finlingo-api]", *args, file=sys.stderr, flush=True)


class JsonHandler(BaseHTTPRequestHandler):
    """BaseHTTPRequestHandler with JSON helpers + permissive CORS, matching the
    response shape the original `server.py` produced so the frontend behaves
    identically."""

    # Quieter default logging.
    def log_message(self, fmt, *args):  # noqa: A003 - stdlib signature
        pass

    def send_json(self, obj, status=200):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            ask_log("client disconnected before response could be sent")

    def do_OPTIONS(self):  # noqa: N802 - stdlib signature
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def client_ip(self):
        forwarded = self.headers.get("x-forwarded-for", "")
        if forwarded:
            return forwarded.split(",")[0].strip()
        return self.client_address[0] if self.client_address else "unknown"

    def query(self):
        from urllib.parse import urlparse, parse_qs
        return parse_qs(urlparse(self.path).query)

    def query_one(self, name, default=""):
        return (self.query().get(name) or [default])[0]

    def read_json_body(self, max_bytes=32_000):
        try:
            content_length = int(self.headers.get("Content-Length", "0"))
        except ValueError as exc:
            raise ValueError("Invalid Content-Length") from exc
        if content_length <= 0:
            raise ValueError("Request body is required")
        if content_length > max_bytes:
            raise OverflowError("Invalid request size")
        try:
            payload = json.loads(self.rfile.read(content_length).decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise ValueError("Request body must be valid JSON") from exc
        if not isinstance(payload, dict):
            raise ValueError("Request body must be a JSON object")
        return payload
