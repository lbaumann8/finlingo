"""Durable, serverless-friendly unit-generation jobs.

The original design used a background worker thread + local SQLite. Neither
survives on stateless serverless functions, so this reimplements the same
behavior with an **advance-on-poll** model:

  * POST /api/unit-jobs creates a durable job row (status "queued").
  * Each GET poll claims a short lease and performs exactly ONE generation step
    (outline, then one lesson at a time, then the recap quiz, then validation),
    persists progress, and returns. The next poll continues.

This preserves the exact public contract the frontend already polls — including
incremental "X of N lessons ready", cancel, retry, and resume-after-reload —
without any long-lived process or in-memory state.

Storage is pluggable:
  * SupabaseJobStore (production) — durable Postgres via PostgREST + service key.
  * LocalJobStore (local dev fallback) — SQLite, used when Supabase env vars are
    absent so `vercel dev` / `python server.py` still works offline.
"""

import json
import os
import re
import socket
import sqlite3
import threading
import time
import urllib.error
import urllib.request
import uuid
from contextlib import contextmanager
from pathlib import Path

from _lib.common import (
    ANTHROPIC_MESSAGES_URL,
    ANTHROPIC_MODEL,
    ANTHROPIC_VERSION,
    anthropic_api_key,
    now_iso,
)
from _lib import supabase_rest

ACTIVE_STATUSES = {
    "queued",
    "generating_outline",
    "generating_lessons",
    "generating_quizzes",
    "validating",
}
TERMINAL_STATUSES = {"completed", "failed", "cancelled"}
PUBLIC_STATUSES = ACTIVE_STATUSES | TERMINAL_STATUSES

# Per Anthropic-component timeout — kept comfortably under the client's per-poll
# network timeout so one step finishes inside a single poll.
STEP_TIMEOUT_SECONDS = 18
LEASE_TTL_SECONDS = 40
MAX_TOTAL_RETRIES = 8
JOB_TTL_SECONDS = 2 * 24 * 60 * 60  # rows older than this are cleaned up


class UnitJobError(RuntimeError):
    def __init__(self, message, category="generation_failed", retryable=False):
        super().__init__(message)
        self.category = category
        self.retryable = retryable


class UnitJobCancelled(RuntimeError):
    pass


def _clean_text(value, max_words=80):
    words = str(value or "").strip().split()
    return " ".join(words[:max_words])


def _slug(value):
    clean = re.sub(r"[^a-z0-9]+", "-", str(value or "").lower()).strip("-")[:44]
    return clean or "custom-unit"


def _json(value):
    return json.dumps(value, ensure_ascii=True, separators=(",", ":"))


def _from_json(value, fallback):
    if value is None or value == "":
        return fallback
    if isinstance(value, (list, dict)):
        return value
    try:
        return json.loads(value)
    except (TypeError, json.JSONDecodeError):
        return fallback


def _epoch(iso):
    if not iso:
        return 0.0
    try:
        return time.mktime(time.strptime(str(iso)[:19], "%Y-%m-%dT%H:%M:%S"))
    except (ValueError, TypeError):
        return 0.0


# ── Anthropic component generator (ported from unit_jobs.py) ─────────────
class AnthropicUnitGenerator:
    def __init__(self, api_url=ANTHROPIC_MESSAGES_URL, model=ANTHROPIC_MODEL, version=ANTHROPIC_VERSION):
        self.api_url = api_url
        self.model = model
        self.version = version

    def outline(self, job, timeout):
        if job.get("course_outline_requested"):
            schema = {
                "type": "object",
                "properties": {
                    "courseTitle": {"type": "string"},
                    "description": {"type": "string"},
                    "units": {
                        "type": "array",
                        "minItems": 3,
                        "maxItems": 6,
                        "items": {
                            "type": "object",
                            "properties": {
                                "title": {"type": "string"},
                                "description": {"type": "string"},
                                "minimumLessons": {"type": "integer", "minimum": 2, "maximum": 13},
                                "maximumLessons": {"type": "integer", "minimum": 2, "maximum": 13},
                            },
                            "required": ["title", "description", "minimumLessons", "maximumLessons"],
                        },
                    },
                    "recommendedFirstUnitIndex": {"type": "integer", "minimum": 0, "maximum": 5},
                },
                "required": ["courseTitle", "description", "units", "recommendedFirstUnitIndex"],
            }
            prompt = (
                f"Create a beginner finance course outline for {job['original_topic']}. "
                "Split it into 3 to 6 focused units. Return curriculum design only."
            )
            return self._call("create_course_outline", schema, prompt, timeout, 2200)

        count = job["target_lesson_count"]
        concepts = job.get("approved_lesson_concepts") or []
        concept_note = (" Prefer these concepts in order: " + "; ".join(concepts[:count]) + ".") if concepts else ""
        schema = {
            "type": "object",
            "properties": {
                "unitTitle": {"type": "string"},
                "unitDescription": {"type": "string"},
                "lessons": {
                    "type": "array",
                    "minItems": count,
                    "maxItems": count,
                    "items": {
                        "type": "object",
                        "properties": {"title": {"type": "string"}, "objective": {"type": "string"}},
                        "required": ["title", "objective"],
                    },
                },
            },
            "required": ["unitTitle", "unitDescription", "lessons"],
        }
        prompt = (
            f"Plan a beginner finance unit about {job['original_topic']}. "
            f"Return exactly {count} distinct lessons in a logical order. "
            "Return only the title, one-sentence description, lesson titles, and lesson objectives."
            f"{concept_note}"
        )
        return self._call("create_unit_outline", schema, prompt, timeout, 1800)

    def lesson(self, job, outline, lesson_index, timeout):
        plan = outline["lessons"][lesson_index]
        other_titles = [item["title"] for item in outline["lessons"]]
        schema = {
            "type": "object",
            "properties": {
                "title": {"type": "string"},
                "coreIdea": {"type": "string"},
                "example": {"type": "string"},
                "keyDetails": {"type": "array", "minItems": 2, "maxItems": 4, "items": {"type": "string"}},
                "quickCheck": {
                    "type": "object",
                    "properties": {
                        "prompt": {"type": "string"},
                        "choices": {"type": "array", "minItems": 4, "maxItems": 4, "items": {"type": "string"}},
                        "correctAnswerIndex": {"type": "integer", "minimum": 0, "maximum": 3},
                        "explanation": {"type": "string"},
                    },
                    "required": ["prompt", "choices", "correctAnswerIndex", "explanation"],
                },
            },
            "required": ["title", "coreIdea", "example", "keyDetails", "quickCheck"],
        }
        prompt = (
            f"Write lesson {lesson_index + 1} of {len(outline['lessons'])} for the unit "
            f"'{outline['unitTitle']}'. Planned title: {plan['title']}. "
            f"Objective: {plan['objective']}. Other lesson titles: {json.dumps(other_titles)}. "
            "Teach only this lesson's idea. Use concise beginner language, one concrete example, "
            "2 to 4 key-detail bullets, and one quick check with exactly four choices."
        )
        return self._call("create_unit_lesson", schema, prompt, timeout, 2200)

    def quiz(self, job, outline, lessons, timeout):
        schema = {
            "type": "object",
            "properties": {
                "questions": {
                    "type": "array",
                    "minItems": 3,
                    "maxItems": 3,
                    "items": {
                        "type": "object",
                        "properties": {
                            "prompt": {"type": "string"},
                            "choices": {"type": "array", "minItems": 4, "maxItems": 4, "items": {"type": "string"}},
                            "correctAnswerIndex": {"type": "integer", "minimum": 0, "maximum": 3},
                            "explanation": {"type": "string"},
                        },
                        "required": ["prompt", "choices", "correctAnswerIndex", "explanation"],
                    },
                }
            },
            "required": ["questions"],
        }
        quick_checks = [lesson["question"]["prompt"] for lesson in lessons]
        prompt = (
            f"Create a three-question recap quiz for '{outline['unitTitle']}'. "
            f"Cover the full unit: {', '.join(item['title'] for item in lessons)}. "
            f"Do not duplicate these lesson quick checks word-for-word: {json.dumps(quick_checks)}. "
            "Each question must have exactly four choices and a short explanation."
        )
        return self._call("create_unit_recap", schema, prompt, timeout, 1900)

    def _call(self, tool_name, schema, prompt, timeout, max_tokens):
        api_key = anthropic_api_key()
        if not api_key:
            raise UnitJobError("Anthropic API key is unavailable", "invalid_api_key", False)
        payload = {
            "model": self.model,
            "max_tokens": max_tokens,
            "system": (
                "You create concise beginner finance curriculum for FinLingo. "
                "Do not provide personalized investment advice. Return the requested tool only."
            ),
            "messages": [{"role": "user", "content": prompt}],
            "tools": [{"name": tool_name, "description": "Return structured curriculum.", "input_schema": schema}],
            "tool_choice": {"type": "tool", "name": tool_name},
        }
        request = urllib.request.Request(
            self.api_url,
            data=json.dumps(payload).encode("utf-8"),
            method="POST",
            headers={
                "x-api-key": api_key,
                "anthropic-version": self.version,
                "content-type": "application/json",
                "accept": "application/json",
                "user-agent": "FinLingo/1.0",
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                body = json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            raw = exc.read().decode("utf-8", errors="replace")
            if exc.code in {401, 403}:
                raise UnitJobError("Anthropic credentials were rejected", "invalid_api_key", False) from exc
            category = "rate_limit" if exc.code == 429 else (
                "temporary_upstream" if exc.code in {502, 503, 504} else "anthropic_http_error"
            )
            raise UnitJobError(raw[:300], category, exc.code in {429, 502, 503, 504}) from exc
        except (TimeoutError, socket.timeout) as exc:
            raise UnitJobError("Anthropic component timed out", "anthropic_timeout", True) from exc
        except OSError as exc:
            raise UnitJobError("Anthropic network request failed", "network_failure", True) from exc
        for block in body.get("content", []):
            if block.get("type") == "tool_use" and block.get("name") == tool_name:
                value = block.get("input")
                if isinstance(value, dict):
                    return value
        raise UnitJobError("Anthropic returned no structured component", "invalid_structured_response", True)


# ── Job stores ──────────────────────────────────────────────────────────
_JSON_FIELDS = ("partial_outline", "completed_lessons", "recap_quiz", "final_unit", "approved_lesson_concepts")


def _decode_job(row):
    if not row:
        return None
    data = dict(row)
    data["partial_outline"] = _from_json(data.get("partial_outline"), None)
    data["completed_lessons"] = _from_json(data.get("completed_lessons"), [])
    data["recap_quiz"] = _from_json(data.get("recap_quiz"), None)
    data["final_unit"] = _from_json(data.get("final_unit"), None)
    data["approved_lesson_concepts"] = _from_json(data.get("approved_lesson_concepts"), [])
    data["course_outline_requested"] = bool(data.get("course_outline_requested"))
    return data


class SupabaseJobStore:
    """Durable PostgREST-backed store (server-side service key only)."""

    table = "unit_jobs"

    def get(self, job_id):
        rows = supabase_rest.select(self.table, {"job_id": f"eq.{job_id}", "limit": 1})
        return _decode_job(rows[0]) if rows else None

    def get_by_client_request_id(self, client_request_id):
        rows = supabase_rest.select(self.table, {"client_request_id": f"eq.{client_request_id}", "limit": 1})
        return _decode_job(rows[0]) if rows else None

    def insert(self, row):
        encoded = dict(row)
        for field in _JSON_FIELDS:
            if field in encoded and not isinstance(encoded[field], str):
                encoded[field] = encoded[field]  # jsonb columns accept native JSON
        created = supabase_rest.insert(self.table, encoded)
        return _decode_job(created)

    def update(self, job_id, **fields):
        if not fields:
            return self.get(job_id)
        fields["updated_at"] = now_iso()
        rows = supabase_rest.update(self.table, {"job_id": f"eq.{job_id}"}, fields)
        return _decode_job(rows[0]) if rows else self.get(job_id)

    def claim_lease(self, job_id, ttl_seconds):
        now = now_iso()
        until = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() + ttl_seconds))
        query = {
            "job_id": f"eq.{job_id}",
            "or": f"(lease_until.is.null,lease_until.lt.{now})",
        }
        rows = supabase_rest.update(self.table, query, {"lease_until": until, "updated_at": now})
        return _decode_job(rows[0]) if rows else None

    def release_lease(self, job_id):
        try:
            supabase_rest.update(self.table, {"job_id": f"eq.{job_id}"}, {"lease_until": None})
        except supabase_rest.SupabaseError:
            pass

    def list_for_chat(self, chat_id="", active_only=False):
        query = {"order": "created_at.desc", "limit": 50}
        if chat_id:
            query["source_chat_id"] = f"eq.{chat_id}"
        if active_only:
            query["status"] = "in.(" + ",".join(sorted(ACTIVE_STATUSES)) + ")"
        rows = supabase_rest.select(self.table, query)
        return [_decode_job(row) for row in rows]

    def cleanup_expired(self):
        cutoff = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() - JOB_TTL_SECONDS))
        try:
            supabase_rest.delete(self.table, {"updated_at": f"lt.{cutoff}"})
        except supabase_rest.SupabaseError:
            pass


class LocalJobStore:
    """SQLite fallback for offline local development (no Supabase configured)."""

    _lock = threading.Lock()

    def __init__(self, path=None):
        self.path = str(path or os.environ.get("FINLINGO_UNIT_JOBS_DB") or (Path("/tmp") / "finlingo_unit_jobs.sqlite3"))
        Path(self.path).parent.mkdir(parents=True, exist_ok=True)
        self._initialize()

    @contextmanager
    def _db(self):
        connection = sqlite3.connect(self.path, timeout=30)
        connection.row_factory = sqlite3.Row
        try:
            with connection:
                yield connection
        finally:
            connection.close()

    def _initialize(self):
        with self._db() as db:
            db.execute(
                """
                CREATE TABLE IF NOT EXISTS unit_jobs (
                    job_id TEXT PRIMARY KEY,
                    client_request_id TEXT NOT NULL UNIQUE,
                    original_topic TEXT, canonical_topic TEXT, selected_depth TEXT,
                    min_lessons INTEGER, max_lessons INTEGER, target_lesson_count INTEGER,
                    source_chat_id TEXT, source_message_id TEXT,
                    status TEXT, stage TEXT,
                    partial_outline TEXT, completed_lessons TEXT DEFAULT '[]', recap_quiz TEXT,
                    retry_count INTEGER DEFAULT 0, final_unit TEXT,
                    failure_category TEXT, failed_component TEXT,
                    course_outline_requested INTEGER DEFAULT 0,
                    scope_reason TEXT, approved_lesson_concepts TEXT,
                    lease_until TEXT,
                    created_at TEXT, updated_at TEXT, started_at TEXT,
                    completed_at TEXT, cancelled_at TEXT
                )
                """
            )

    def _encode(self, row):
        out = dict(row)
        for field in _JSON_FIELDS:
            if field in out and not isinstance(out[field], str):
                out[field] = _json(out[field])
        if "course_outline_requested" in out:
            out["course_outline_requested"] = 1 if out["course_outline_requested"] else 0
        return out

    def get(self, job_id):
        with self._db() as db:
            row = db.execute("SELECT * FROM unit_jobs WHERE job_id = ?", (job_id,)).fetchone()
        return _decode_job(row)

    def get_by_client_request_id(self, client_request_id):
        with self._db() as db:
            row = db.execute("SELECT * FROM unit_jobs WHERE client_request_id = ?", (client_request_id,)).fetchone()
        return _decode_job(row)

    def insert(self, row):
        encoded = self._encode(row)
        columns = ", ".join(encoded)
        placeholders = ", ".join("?" for _ in encoded)
        with self._db() as db:
            db.execute(f"INSERT INTO unit_jobs ({columns}) VALUES ({placeholders})", tuple(encoded.values()))
        return self.get(row["job_id"])

    def update(self, job_id, **fields):
        if not fields:
            return self.get(job_id)
        fields["updated_at"] = now_iso()
        encoded = self._encode(fields)
        assignments = ", ".join(f"{key} = ?" for key in encoded)
        with self._db() as db:
            db.execute(f"UPDATE unit_jobs SET {assignments} WHERE job_id = ?", tuple(encoded.values()) + (job_id,))
        return self.get(job_id)

    def claim_lease(self, job_id, ttl_seconds):
        now = now_iso()
        until = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() + ttl_seconds))
        with self._lock, self._db() as db:
            row = db.execute("SELECT lease_until FROM unit_jobs WHERE job_id = ?", (job_id,)).fetchone()
            if not row:
                return None
            lease_until = row["lease_until"]
            if lease_until and lease_until >= now:
                return None
            db.execute("UPDATE unit_jobs SET lease_until = ?, updated_at = ? WHERE job_id = ?", (until, now, job_id))
        return self.get(job_id)

    def release_lease(self, job_id):
        with self._db() as db:
            db.execute("UPDATE unit_jobs SET lease_until = NULL WHERE job_id = ?", (job_id,))

    def list_for_chat(self, chat_id="", active_only=False):
        clauses, values = [], []
        if chat_id:
            clauses.append("source_chat_id = ?")
            values.append(chat_id)
        if active_only:
            marks = ", ".join("?" for _ in ACTIVE_STATUSES)
            clauses.append(f"status IN ({marks})")
            values.extend(sorted(ACTIVE_STATUSES))
        where = (" WHERE " + " AND ".join(clauses)) if clauses else ""
        with self._db() as db:
            rows = db.execute(f"SELECT * FROM unit_jobs{where} ORDER BY created_at DESC LIMIT 50", tuple(values)).fetchall()
        return [_decode_job(row) for row in rows]

    def cleanup_expired(self):
        cutoff = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() - JOB_TTL_SECONDS))
        with self._db() as db:
            db.execute("DELETE FROM unit_jobs WHERE updated_at < ?", (cutoff,))


def get_store():
    if supabase_rest.configured():
        return SupabaseJobStore()
    return LocalJobStore()


# ── Advance-on-poll manager ─────────────────────────────────────────────
class UnitJobManager:
    def __init__(self, store=None, generator=None):
        self.store = store or get_store()
        self.generator = generator or AnthropicUnitGenerator()

    # -- creation --
    def create(self, data):
        existing = self.store.get_by_client_request_id(data["client_request_id"])
        if existing:
            return existing, False
        job_id = "uj_" + uuid.uuid4().hex[:16]
        now = now_iso()
        row = {
            "job_id": job_id,
            "client_request_id": data["client_request_id"],
            "original_topic": data["original_topic"],
            "canonical_topic": data["canonical_topic"],
            "selected_depth": data["selected_depth"],
            "min_lessons": data["min_lessons"],
            "max_lessons": data["max_lessons"],
            "target_lesson_count": data["target_lesson_count"],
            "source_chat_id": data.get("source_chat_id", ""),
            "source_message_id": data.get("source_message_id", ""),
            "status": "queued",
            "stage": "queued",
            "completed_lessons": [],
            "retry_count": 0,
            "course_outline_requested": bool(data.get("course_outline_requested")),
            "scope_reason": data.get("scope_reason", ""),
            "approved_lesson_concepts": data.get("approved_lesson_concepts", []),
            "created_at": now,
            "updated_at": now,
        }
        try:
            job = self.store.insert(row)
        except Exception:  # noqa: BLE001 - a racing duplicate create can violate the unique key
            existing = self.store.get_by_client_request_id(data["client_request_id"])
            if existing:
                return existing, False
            raise
        # Best-effort housekeeping so the table never grows without bound.
        try:
            self.store.cleanup_expired()
        except Exception:  # noqa: BLE001
            pass
        return job, True

    def cancel(self, job_id):
        job = self.store.get(job_id)
        if not job:
            return None
        if job["status"] in TERMINAL_STATUSES:
            return job
        return self.store.update(
            job_id, status="cancelled", stage="cancelled",
            cancelled_at=now_iso(), failure_category=None, lease_until=None,
        )

    def retry(self, job_id):
        job = self.store.get(job_id)
        if not job:
            return None
        if job["status"] != "failed":
            return job
        return self.store.update(
            job_id, status="queued", stage="queued",
            failure_category=None, lease_until=None,
        )

    # -- the one-step-per-poll engine --
    def advance(self, job_id):
        job = self.store.get(job_id)
        if not job:
            return None
        if job["status"] in TERMINAL_STATUSES:
            return self.public(job)

        leased = self.store.claim_lease(job_id, LEASE_TTL_SECONDS)
        if not leased:
            # Another invocation holds the lease; return the current snapshot.
            return self.public(job)
        job = leased
        try:
            if job["status"] == "cancelled":
                return self.public(job)
            self._do_one_step(job)
        except UnitJobCancelled:
            self.store.update(job_id, status="cancelled", stage="cancelled", cancelled_at=now_iso())
        except UnitJobError as exc:
            self._handle_step_error(job_id, exc)
        except Exception as exc:  # noqa: BLE001 - never leak a stack to the client
            self._handle_step_error(job_id, UnitJobError(str(exc), "unknown_server_error", False))
        finally:
            self.store.release_lease(job_id)
        return self.public(self.store.get(job_id))

    def _check_active(self, job_id):
        job = self.store.get(job_id)
        if not job:
            raise UnitJobError("Job no longer exists", "job_not_found", False)
        if job["status"] == "cancelled":
            raise UnitJobCancelled()
        return job

    def _handle_step_error(self, job_id, exc):
        job = self.store.get(job_id)
        if not job or job["status"] == "cancelled":
            return
        retry_count = int(job.get("retry_count") or 0)
        if exc.retryable and retry_count < MAX_TOTAL_RETRIES:
            # Leave the job active so the next poll retries this same step.
            self.store.update(job_id, retry_count=retry_count + 1, failure_category=exc.category)
            return
        self.store.update(job_id, status="failed", stage="failed", failure_category=exc.category)

    def _do_one_step(self, job):
        job_id = job["job_id"]
        if not job.get("started_at"):
            self.store.update(job_id, started_at=now_iso())

        # 1) Outline.
        if not job.get("partial_outline"):
            self.store.update(job_id, status="generating_outline", stage="generating_outline", failed_component="outline")
            raw = self.generator.outline(job, STEP_TIMEOUT_SECONDS)
            outline = self._validate_outline(job, raw)
            if job.get("course_outline_requested"):
                final = self._course_outline_result(job, outline)
                self.store.update(
                    job_id, partial_outline=outline, final_unit=final,
                    status="completed", stage="completed", completed_at=now_iso(),
                    failed_component=None, failure_category=None,
                )
                return
            self.store.update(
                job_id, partial_outline=outline, status="generating_lessons",
                stage="generating_lessons", failed_component=None,
            )
            return

        outline = job["partial_outline"]
        lessons = list(job.get("completed_lessons") or [])

        # 2) Lessons, one per poll.
        if len(lessons) < int(job["target_lesson_count"]):
            index = len(lessons)
            self.store.update(job_id, status="generating_lessons", stage="generating_lessons", failed_component=f"lesson:{index}")
            raw = self.generator.lesson(job, outline, index, STEP_TIMEOUT_SECONDS)
            lesson = self._validate_lesson(raw, index, lessons)
            lessons.append(lesson)
            self.store.update(job_id, completed_lessons=lessons, failed_component=None)
            return

        # 3) Recap quiz.
        if not job.get("recap_quiz"):
            self.store.update(job_id, status="generating_quizzes", stage="generating_quizzes", failed_component="quiz")
            raw = self.generator.quiz(job, outline, lessons, STEP_TIMEOUT_SECONDS)
            recap = self._validate_quiz(raw, lessons)
            self.store.update(job_id, recap_quiz=recap, failed_component=None)
            return

        # 4) Final validation + assembly.
        self.store.update(job_id, status="validating", stage="validating", failed_component="validation")
        final = self._finalize(job, outline, lessons, job["recap_quiz"])
        self.store.update(
            job_id, status="completed", stage="completed", final_unit=final,
            completed_at=now_iso(), failed_component=None, failure_category=None,
        )

    # -- validators (ported from unit_jobs.py) --
    def _validate_outline(self, job, raw):
        if job.get("course_outline_requested"):
            units = []
            for item in list(raw.get("units") or [])[:6]:
                if not isinstance(item, dict):
                    continue
                title = _clean_text(item.get("title"), 10)
                description = _clean_text(item.get("description"), 32)
                try:
                    minimum = max(2, min(13, int(item.get("minimumLessons") or 3)))
                    maximum = max(minimum, min(13, int(item.get("maximumLessons") or 5)))
                except (TypeError, ValueError):
                    continue
                if title and description:
                    units.append({"title": title, "description": description, "lessonRange": {"min": minimum, "max": maximum}})
            if len(units) < 3:
                raise UnitJobError("Course outline was incomplete", "invalid_outline", True)
            return {
                "courseTitle": _clean_text(raw.get("courseTitle") or job["original_topic"], 12),
                "description": _clean_text(raw.get("description"), 40),
                "units": units,
                "recommendedFirstUnitIndex": max(0, min(len(units) - 1, int(raw.get("recommendedFirstUnitIndex") or 0))),
            }

        planned, seen = [], set()
        for item in list(raw.get("lessons") or []):
            if not isinstance(item, dict):
                continue
            title = _clean_text(item.get("title"), 10)
            objective = _clean_text(item.get("objective"), 28)
            key = re.sub(r"[^a-z0-9]+", " ", title.lower()).strip()
            if title and objective and key and key not in seen:
                seen.add(key)
                planned.append({"title": title, "objective": objective})
        if len(planned) != int(job["target_lesson_count"]):
            raise UnitJobError("Outline lesson count was invalid", "invalid_outline", True)
        return {
            "unitTitle": _clean_text(raw.get("unitTitle") or job["original_topic"], 12),
            "unitDescription": _clean_text(raw.get("unitDescription"), 40),
            "lessons": planned,
        }

    def _validate_lesson(self, raw, index, existing):
        title = _clean_text(raw.get("title"), 10)
        core = _clean_text(raw.get("coreIdea"), 75)
        example = _clean_text(raw.get("example"), 65)
        details = [_clean_text(item, 24) for item in list(raw.get("keyDetails") or [])[:4]]
        details = [item for item in details if item]
        question = self._question(raw.get("quickCheck"))
        existing_titles = {str(item.get("title") or "").lower() for item in existing}
        if not title or title.lower() in existing_titles or not core or not example or len(details) < 2 or not question:
            raise UnitJobError("Lesson component was incomplete", "invalid_lesson", True)
        bullet_body = "\n".join(f"• {item}" for item in details)
        return {
            "id": f"lesson_{index + 1}_{_slug(title)}",
            "title": title,
            "slides": [
                {"id": "slide_1", "type": "concept", "heading": "The basic idea", "body": core},
                {"id": "slide_2", "type": "example", "heading": "See it in action", "body": example},
                {"id": "slide_3", "type": "takeaway", "heading": "Key details", "body": bullet_body, "bullets": details},
            ],
            "question": question,
        }

    def _validate_quiz(self, raw, lessons):
        questions = [self._question(item) for item in list(raw.get("questions") or [])[:3]]
        questions = [item for item in questions if item]
        quick_prompts = {lesson["question"]["prompt"].strip().lower() for lesson in lessons}
        if len(questions) != 3 or any(item["prompt"].strip().lower() in quick_prompts for item in questions):
            raise UnitJobError("Recap quiz was incomplete", "invalid_quiz", True)
        return questions

    def _question(self, raw):
        if not isinstance(raw, dict):
            return None
        prompt = _clean_text(raw.get("prompt") or raw.get("question"), 34)
        choices = [_clean_text(item, 18) for item in list(raw.get("choices") or [])[:4]]
        explanation = _clean_text(raw.get("explanation"), 45)
        try:
            correct = int(raw.get("correctAnswerIndex"))
        except (TypeError, ValueError):
            return None
        if not prompt or len(choices) != 4 or any(not item for item in choices) or correct not in range(4) or not explanation:
            return None
        return {"prompt": prompt, "choices": choices, "correctAnswerIndex": correct, "explanation": explanation}

    def _finalize(self, job, outline, lessons, recap):
        count = len(lessons)
        if count < job["min_lessons"] or count > job["max_lessons"] or count != job["target_lesson_count"]:
            raise UnitJobError("Final lesson count was invalid", "validation_failure", False)
        titles = [lesson["title"].strip().lower() for lesson in lessons]
        if len(set(titles)) != count:
            raise UnitJobError("Final lesson titles were not distinct", "validation_failure", False)
        for lesson in lessons:
            slides = lesson.get("slides") or []
            if len(slides) != 3 or any(not slide.get("body") for slide in slides):
                raise UnitJobError("A lesson had invalid slides", "validation_failure", False)
            details = slides[2].get("bullets") or []
            if len(details) < 2 or len(details) > 4:
                raise UnitJobError("A lesson had invalid key details", "validation_failure", False)
            if not self._question(lesson.get("question")):
                raise UnitJobError("A lesson had an invalid quick check", "validation_failure", False)
        if len(recap or []) != 3 or any(not self._question(item) for item in recap):
            raise UnitJobError("The recap quiz was invalid", "validation_failure", False)
        return {
            "type": "unit",
            "id": f"cu_job_{job['job_id']}",
            "unitTitle": outline["unitTitle"],
            "unitDescription": outline["unitDescription"],
            "lessons": lessons,
            "recapQuiz": recap,
            "quizTopic": outline["unitTitle"],
            "unit_title": outline["unitTitle"],
            "description": outline["unitDescription"],
            "recap_quiz": recap,
            "quiz_topic": outline["unitTitle"],
            "selectedDepth": job["selected_depth"],
            "topicScope": "",
            "requestedLessonRange": {"min": job["min_lessons"], "max": job["max_lessons"]},
            "actualLessonCount": count,
            "jobId": job["job_id"],
        }

    def _course_outline_result(self, job, outline):
        return {
            "type": "course_outline",
            **outline,
            "selectedDepth": job["selected_depth"],
            "requestedLessonRange": {"min": job["min_lessons"], "max": job["max_lessons"]},
            "actualLessonCount": 0,
            "jobId": job["job_id"],
        }

    # -- public projection (exact frontend contract) --
    def public(self, job):
        if not job:
            return None
        lessons = job.get("completed_lessons") or []
        total = int(job.get("target_lesson_count") or 0)
        status = job["status"] if job["status"] in PUBLIC_STATUSES else "failed"
        return {
            "jobId": job["job_id"],
            "clientRequestId": job["client_request_id"],
            "status": status,
            "stage": job.get("stage"),
            "completedLessonCount": len(lessons),
            "totalLessonCount": total,
            "retryCount": int(job.get("retry_count") or 0),
            "errorCategory": job.get("failure_category"),
            "failedComponent": job.get("failed_component"),
            "unit": job.get("final_unit") if status == "completed" else None,
            "sourceChatId": job.get("source_chat_id") or "",
            "sourceMessageId": job.get("source_message_id") or "",
            "selectedDepth": job.get("selected_depth"),
            "createdAt": job.get("created_at"),
            "updatedAt": job.get("updated_at"),
        }
