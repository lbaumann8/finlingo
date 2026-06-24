#!/usr/bin/env python3
"""Durable asynchronous unit-generation jobs for the local FinLingo server."""

from __future__ import annotations

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


ACTIVE_STATUSES = {
    "queued",
    "generating_outline",
    "generating_lessons",
    "generating_quizzes",
    "validating",
}
TERMINAL_STATUSES = {"completed", "failed", "cancelled"}
PUBLIC_STATUSES = ACTIVE_STATUSES | TERMINAL_STATUSES

OUTLINE_TIMEOUT_SECONDS = 60
LESSON_TIMEOUT_SECONDS = 75
QUIZ_TIMEOUT_SECONDS = 60


class UnitJobError(RuntimeError):
    def __init__(self, message, category="generation_failed", retryable=False):
        super().__init__(message)
        self.category = category
        self.retryable = retryable


class UnitJobCancelled(RuntimeError):
    pass


def _now_iso():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def _clean_text(value, max_words=80):
    words = str(value or "").strip().split()
    return " ".join(words[:max_words])


def _slug(value):
    clean = re.sub(r"[^a-z0-9]+", "-", str(value or "").lower()).strip("-")[:44]
    return clean or "custom-unit"


def _json(value):
    return json.dumps(value, ensure_ascii=True, separators=(",", ":"))


def _from_json(value, fallback):
    if not value:
        return fallback
    try:
        parsed = json.loads(value)
        return parsed
    except (TypeError, json.JSONDecodeError):
        return fallback


class UnitJobStore:
    JSON_COLUMNS = {"partial_outline", "completed_lessons", "recap_quiz", "final_unit"}

    def __init__(self, path):
        self.path = str(path)
        Path(self.path).parent.mkdir(parents=True, exist_ok=True)
        self._initialize()

    def _connect(self):
        connection = sqlite3.connect(self.path, timeout=30)
        connection.row_factory = sqlite3.Row
        return connection

    @contextmanager
    def _db(self):
        connection = self._connect()
        try:
            with connection:
                yield connection
        finally:
            connection.close()

    def _initialize(self):
        with self._db() as db:
            db.execute("PRAGMA journal_mode=WAL")
            db.execute(
                """
                CREATE TABLE IF NOT EXISTS unit_jobs (
                    job_id TEXT PRIMARY KEY,
                    client_request_id TEXT NOT NULL UNIQUE,
                    original_topic TEXT NOT NULL,
                    canonical_topic TEXT NOT NULL,
                    selected_depth TEXT NOT NULL,
                    min_lessons INTEGER NOT NULL,
                    max_lessons INTEGER NOT NULL,
                    target_lesson_count INTEGER NOT NULL,
                    source_chat_id TEXT,
                    source_message_id TEXT,
                    status TEXT NOT NULL,
                    stage TEXT NOT NULL,
                    partial_outline TEXT,
                    completed_lessons TEXT NOT NULL DEFAULT '[]',
                    recap_quiz TEXT,
                    retry_count INTEGER NOT NULL DEFAULT 0,
                    final_unit TEXT,
                    failure_category TEXT,
                    failed_component TEXT,
                    course_outline_requested INTEGER NOT NULL DEFAULT 0,
                    scope_reason TEXT,
                    approved_lesson_concepts TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    started_at TEXT,
                    completed_at TEXT,
                    cancelled_at TEXT
                )
                """
            )
            db.execute("CREATE INDEX IF NOT EXISTS idx_unit_jobs_chat ON unit_jobs(source_chat_id, updated_at)")
            db.execute("CREATE INDEX IF NOT EXISTS idx_unit_jobs_status ON unit_jobs(status, updated_at)")

    def create(self, data):
        now = _now_iso()
        job_id = "uj_" + uuid.uuid4().hex[:16]
        values = {
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
            "course_outline_requested": 1 if data.get("course_outline_requested") else 0,
            "scope_reason": data.get("scope_reason", ""),
            "approved_lesson_concepts": _json(data.get("approved_lesson_concepts", [])),
            "created_at": now,
            "updated_at": now,
        }
        columns = ", ".join(values)
        placeholders = ", ".join("?" for _ in values)
        try:
            with self._db() as db:
                db.execute(
                    f"INSERT INTO unit_jobs ({columns}) VALUES ({placeholders})",
                    tuple(values.values()),
                )
        except sqlite3.IntegrityError:
            existing = self.get_by_client_request_id(data["client_request_id"])
            if existing:
                return existing, False
            raise
        return self.get(job_id), True

    def get(self, job_id):
        with self._db() as db:
            row = db.execute("SELECT * FROM unit_jobs WHERE job_id = ?", (job_id,)).fetchone()
        return self._decode(row) if row else None

    def get_by_client_request_id(self, client_request_id):
        with self._db() as db:
            row = db.execute(
                "SELECT * FROM unit_jobs WHERE client_request_id = ?",
                (client_request_id,),
            ).fetchone()
        return self._decode(row) if row else None

    def list_for_chat(self, chat_id="", active_only=False):
        clauses = []
        values = []
        if chat_id:
            clauses.append("source_chat_id = ?")
            values.append(chat_id)
        if active_only:
            marks = ", ".join("?" for _ in ACTIVE_STATUSES)
            clauses.append(f"status IN ({marks})")
            values.extend(sorted(ACTIVE_STATUSES))
        where = (" WHERE " + " AND ".join(clauses)) if clauses else ""
        with self._db() as db:
            rows = db.execute(
                f"SELECT * FROM unit_jobs{where} ORDER BY created_at DESC LIMIT 50",
                tuple(values),
            ).fetchall()
        return [self._decode(row) for row in rows]

    def update(self, job_id, **fields):
        if not fields:
            return self.get(job_id)
        values = {}
        for key, value in fields.items():
            values[key] = _json(value) if key in self.JSON_COLUMNS else value
        values["updated_at"] = _now_iso()
        assignments = ", ".join(f"{key} = ?" for key in values)
        with self._db() as db:
            db.execute(
                f"UPDATE unit_jobs SET {assignments} WHERE job_id = ?",
                tuple(values.values()) + (job_id,),
            )
        return self.get(job_id)

    def increment_retry(self, job_id):
        with self._db() as db:
            db.execute(
                "UPDATE unit_jobs SET retry_count = retry_count + 1, updated_at = ? WHERE job_id = ?",
                (_now_iso(), job_id),
            )

    def recover_interrupted(self):
        marks = ", ".join("?" for _ in ACTIVE_STATUSES)
        with self._db() as db:
            rows = db.execute(
                f"SELECT job_id FROM unit_jobs WHERE status IN ({marks})",
                tuple(sorted(ACTIVE_STATUSES)),
            ).fetchall()
            db.execute(
                f"UPDATE unit_jobs SET status = 'queued', stage = 'queued', updated_at = ? "
                f"WHERE status IN ({marks})",
                (_now_iso(), *sorted(ACTIVE_STATUSES)),
            )
        return [row["job_id"] for row in rows]

    def _decode(self, row):
        data = dict(row)
        data["partial_outline"] = _from_json(data.get("partial_outline"), None)
        data["completed_lessons"] = _from_json(data.get("completed_lessons"), [])
        data["recap_quiz"] = _from_json(data.get("recap_quiz"), None)
        data["final_unit"] = _from_json(data.get("final_unit"), None)
        data["approved_lesson_concepts"] = _from_json(data.get("approved_lesson_concepts"), [])
        data["course_outline_requested"] = bool(data.get("course_outline_requested"))
        return data


class AnthropicUnitGenerator:
    def __init__(self, api_url, model, version):
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
        concept_note = (
            " Prefer these concepts in order: " + "; ".join(concepts[:count]) + "."
            if concepts else ""
        )
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
                        "properties": {
                            "title": {"type": "string"},
                            "objective": {"type": "string"},
                        },
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
                "keyDetails": {
                    "type": "array",
                    "minItems": 2,
                    "maxItems": 4,
                    "items": {"type": "string"},
                },
                "quickCheck": {
                    "type": "object",
                    "properties": {
                        "prompt": {"type": "string"},
                        "choices": {
                            "type": "array",
                            "minItems": 4,
                            "maxItems": 4,
                            "items": {"type": "string"},
                        },
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
                            "choices": {
                                "type": "array",
                                "minItems": 4,
                                "maxItems": 4,
                                "items": {"type": "string"},
                            },
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
        api_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
        if not api_key or api_key in {"paste_my_key_here", "your_key_here"}:
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


class FakeUnitGenerator:
    """Deterministic development generator enabled only by environment flags."""

    def __init__(self):
        self.failed_once = set()

    def _delay(self):
        delay = max(0.0, float(os.environ.get("FINLINGO_UNIT_JOB_FAKE_DELAY", "0") or 0))
        if delay:
            time.sleep(delay)

    def outline(self, job, timeout):
        self._delay()
        if job.get("course_outline_requested"):
            return {
                "courseTitle": f"{job['original_topic']} Course",
                "description": "A sequence of focused beginner units.",
                "units": [
                    {
                        "title": f"{job['original_topic']} Part {i + 1}",
                        "description": f"Focused concepts for part {i + 1}.",
                        "minimumLessons": 3,
                        "maximumLessons": 5,
                    }
                    for i in range(3)
                ],
                "recommendedFirstUnitIndex": 0,
            }
        concepts = job.get("approved_lesson_concepts") or []
        return {
            "unitTitle": f"{job['original_topic']} Essentials",
            "unitDescription": f"A practical introduction to {job['original_topic']}.",
            "lessons": [
                {
                    "title": concepts[i] if i < len(concepts) else f"Lesson {i + 1}",
                    "objective": f"Understand lesson {i + 1}.",
                }
                for i in range(job["target_lesson_count"])
            ],
        }

    def lesson(self, job, outline, lesson_index, timeout):
        self._delay()
        forced = int(os.environ.get("FINLINGO_UNIT_JOB_FAKE_FAIL_LESSON_ONCE", "0") or 0)
        marker = (job["job_id"], lesson_index)
        if forced == lesson_index + 1 and marker not in self.failed_once:
            self.failed_once.add(marker)
            raise UnitJobError("Forced lesson failure", "temporary_upstream", True)
        title = outline["lessons"][lesson_index]["title"]
        return {
            "title": title,
            "coreIdea": f"The core idea behind {title}.",
            "example": f"A simple example showing {title}.",
            "keyDetails": [f"{title} detail one", f"{title} detail two"],
            "quickCheck": {
                "prompt": f"What best describes {title}?",
                "choices": ["The correct idea", "A different idea", "An unrelated idea", "None of these"],
                "correctAnswerIndex": 0,
                "explanation": "The first choice matches the lesson's core idea.",
            },
        }

    def quiz(self, job, outline, lessons, timeout):
        self._delay()
        return {
            "questions": [
                {
                    "prompt": f"Recap question {i + 1} for {outline['unitTitle']}?",
                    "choices": ["Correct", "Incorrect A", "Incorrect B", "Incorrect C"],
                    "correctAnswerIndex": 0,
                    "explanation": "This answer reflects the unit's main ideas.",
                }
                for i in range(3)
            ]
        }


class UnitJobManager:
    def __init__(self, store, generator, development=True, max_concurrent_jobs=2):
        self.store = store
        self.generator = generator
        self.development = development
        self._semaphore = threading.BoundedSemaphore(max(1, max_concurrent_jobs))
        self._threads = {}
        self._lock = threading.Lock()

    def recover(self):
        for job_id in self.store.recover_interrupted():
            self.start(job_id)

    def create(self, data):
        job, created = self.store.create(data)
        if created:
            self._log(job["job_id"], "created", selectedDepth=job["selected_depth"],
                      requestedLessonCount=job["target_lesson_count"])
            self.start(job["job_id"])
        elif job["status"] in ACTIVE_STATUSES:
            self.start(job["job_id"])
        return job, created

    def start(self, job_id):
        with self._lock:
            current = self._threads.get(job_id)
            if current and current.is_alive():
                return
            thread = threading.Thread(target=self._run_guarded, args=(job_id,), daemon=True)
            self._threads[job_id] = thread
            thread.start()

    def cancel(self, job_id):
        job = self.store.get(job_id)
        if not job:
            return None
        if job["status"] in TERMINAL_STATUSES:
            return job
        return self.store.update(
            job_id,
            status="cancelled",
            stage="cancelled",
            cancelled_at=_now_iso(),
            failure_category=None,
        )

    def retry(self, job_id):
        job = self.store.get(job_id)
        if not job:
            return None
        if job["status"] != "failed":
            return job
        job = self.store.update(
            job_id,
            status="queued",
            stage="queued",
            failure_category=None,
        )
        self.start(job_id)
        return job

    def public(self, job):
        if not job:
            return None
        lessons = job.get("completed_lessons") or []
        total = int(job.get("target_lesson_count") or 0)
        return {
            "jobId": job["job_id"],
            "clientRequestId": job["client_request_id"],
            "status": job["status"] if job["status"] in PUBLIC_STATUSES else "failed",
            "stage": job["stage"],
            "completedLessonCount": len(lessons),
            "totalLessonCount": total,
            "retryCount": int(job.get("retry_count") or 0),
            "errorCategory": job.get("failure_category"),
            "failedComponent": job.get("failed_component"),
            "unit": job.get("final_unit") if job["status"] == "completed" else None,
            "sourceChatId": job.get("source_chat_id") or "",
            "sourceMessageId": job.get("source_message_id") or "",
            "selectedDepth": job.get("selected_depth"),
            "createdAt": job.get("created_at"),
            "updatedAt": job.get("updated_at"),
        }

    def _run_guarded(self, job_id):
        with self._semaphore:
            try:
                self._run(job_id)
            except UnitJobCancelled:
                self.store.update(job_id, status="cancelled", stage="cancelled", cancelled_at=_now_iso())
                self._log(job_id, "cancelled")
            except UnitJobError as exc:
                job = self.store.get(job_id)
                if job and job["status"] != "cancelled":
                    self.store.update(
                        job_id,
                        status="failed",
                        stage="failed",
                        failure_category=exc.category,
                    )
                    self._log(job_id, "failed", category=exc.category)
            except Exception:
                job = self.store.get(job_id)
                if job and job["status"] != "cancelled":
                    self.store.update(
                        job_id,
                        status="failed",
                        stage="failed",
                        failure_category="unknown_server_error",
                    )
                    self._log(job_id, "failed", category="unknown_server_error")
            finally:
                with self._lock:
                    self._threads.pop(job_id, None)

    def _run(self, job_id):
        job = self._require_active(job_id)
        total_started = time.monotonic()
        if not job.get("started_at"):
            self.store.update(job_id, started_at=_now_iso())

        outline = job.get("partial_outline")
        if not outline:
            self.store.update(job_id, status="generating_outline", stage="generating_outline", failed_component="outline")
            started = time.monotonic()
            outline = self._component(
                job_id,
                "outline",
                2,
                lambda current: self._validate_outline(
                    current,
                    self.generator.outline(current, OUTLINE_TIMEOUT_SECONDS),
                ),
            )
            self.store.update(job_id, partial_outline=outline, failed_component=None)
            self._log(job_id, "outline completed", duration=round(time.monotonic() - started, 1))

        job = self._require_active(job_id)
        if job.get("course_outline_requested"):
            final = self._course_outline_result(job, outline)
            self.store.update(
                job_id,
                status="completed",
                stage="completed",
                final_unit=final,
                completed_at=_now_iso(),
                failed_component=None,
            )
            self._log(job_id, "total duration", duration=round(time.monotonic() - total_started, 1), status="completed")
            return

        lessons = list(job.get("completed_lessons") or [])
        self.store.update(job_id, status="generating_lessons", stage="generating_lessons")
        for index in range(len(lessons), job["target_lesson_count"]):
            self._require_active(job_id)
            self.store.update(job_id, failed_component=f"lesson:{index}")
            started = time.monotonic()
            raw = self._component(
                job_id,
                f"lesson:{index}",
                3,
                lambda current, i=index: self._validate_lesson(
                    self.generator.lesson(current, outline, i, LESSON_TIMEOUT_SECONDS),
                    i,
                    lessons,
                ),
            )
            lessons.append(raw)
            self.store.update(job_id, completed_lessons=lessons, failed_component=None)
            self._log(
                job_id,
                f"lesson {index + 1}/{job['target_lesson_count']} completed",
                duration=round(time.monotonic() - started, 1),
            )

        job = self._require_active(job_id)
        recap = job.get("recap_quiz")
        if not recap:
            self.store.update(job_id, status="generating_quizzes", stage="generating_quizzes", failed_component="quiz")
            started = time.monotonic()
            raw_quiz = self._component(
                job_id,
                "quiz",
                2,
                lambda current: self._validate_quiz(
                    self.generator.quiz(current, outline, lessons, QUIZ_TIMEOUT_SECONDS),
                    lessons,
                ),
            )
            recap = raw_quiz
            self.store.update(job_id, recap_quiz=recap, failed_component=None)
            self._log(job_id, "quiz completed", duration=round(time.monotonic() - started, 1))

        self._require_active(job_id)
        self.store.update(job_id, status="validating", stage="validating", failed_component="validation")
        started = time.monotonic()
        final = self._finalize(self.store.get(job_id), outline, lessons, recap)
        self._log(job_id, "validation completed", duration=round(time.monotonic() - started, 1))
        self.store.update(
            job_id,
            status="completed",
            stage="completed",
            final_unit=final,
            completed_at=_now_iso(),
            failed_component=None,
            failure_category=None,
        )
        self._log(job_id, "total duration", duration=round(time.monotonic() - total_started, 1), status="completed")

    def _component(self, job_id, component, max_attempts, callback):
        last_error = None
        for attempt in range(max_attempts):
            current = self._require_active(job_id)
            try:
                return callback(current)
            except UnitJobError as exc:
                last_error = exc
                if not exc.retryable or attempt + 1 >= max_attempts:
                    self.store.update(job_id, failed_component=component)
                    raise
                self.store.increment_retry(job_id)
                delay = min(8, 2 ** attempt)
                self._log(job_id, f"{component} retry", retry=attempt + 1, category=exc.category, backoff=delay)
                self._sleep_with_cancel(job_id, delay)
            except (ValueError, TypeError) as exc:
                last_error = UnitJobError(str(exc), "invalid_structured_response", True)
                if attempt + 1 >= max_attempts:
                    self.store.update(job_id, failed_component=component)
                    raise last_error
                self.store.increment_retry(job_id)
                self._log(job_id, f"{component} retry", retry=attempt + 1, category="invalid_structured_response")
        raise last_error or UnitJobError("Component failed", "generation_failed", False)

    def _require_active(self, job_id):
        job = self.store.get(job_id)
        if not job:
            raise UnitJobError("Job no longer exists", "job_not_found", False)
        if job["status"] == "cancelled":
            raise UnitJobCancelled()
        return job

    def _sleep_with_cancel(self, job_id, seconds):
        deadline = time.monotonic() + seconds
        while time.monotonic() < deadline:
            self._require_active(job_id)
            time.sleep(min(0.25, max(0, deadline - time.monotonic())))

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
                    units.append({
                        "title": title,
                        "description": description,
                        "lessonRange": {"min": minimum, "max": maximum},
                    })
            if len(units) < 3:
                raise UnitJobError("Course outline was incomplete", "invalid_outline", True)
            return {
                "courseTitle": _clean_text(raw.get("courseTitle") or job["original_topic"], 12),
                "description": _clean_text(raw.get("description"), 40),
                "units": units,
                "recommendedFirstUnitIndex": max(0, min(len(units) - 1, int(raw.get("recommendedFirstUnitIndex") or 0))),
            }

        planned = []
        seen = set()
        for item in list(raw.get("lessons") or []):
            if not isinstance(item, dict):
                continue
            title = _clean_text(item.get("title"), 10)
            objective = _clean_text(item.get("objective"), 28)
            key = re.sub(r"[^a-z0-9]+", " ", title.lower()).strip()
            if title and objective and key and key not in seen:
                seen.add(key)
                planned.append({"title": title, "objective": objective})
        if len(planned) != job["target_lesson_count"]:
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
        return {
            "prompt": prompt,
            "choices": choices,
            "correctAnswerIndex": correct,
            "explanation": explanation,
        }

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

    def _log(self, job_id, event, **fields):
        if not self.development:
            return
        details = " ".join(f"{key}={value}" for key, value in fields.items() if value is not None)
        suffix = f" {details}" if details else ""
        print(f"[unit-job {job_id}] {event}{suffix}", flush=True)


def create_unit_job_manager(base_dir, api_url, model, version):
    db_path = os.environ.get("FINLINGO_UNIT_JOBS_DB") or str(Path(base_dir) / "finlingo_unit_jobs.sqlite3")
    store = UnitJobStore(db_path)
    generator = (
        FakeUnitGenerator()
        if os.environ.get("FINLINGO_UNIT_JOB_FAKE", "").strip() == "1"
        else AnthropicUnitGenerator(api_url, model, version)
    )
    development = os.environ.get("FINLINGO_ENV", os.environ.get("NODE_ENV", "development")).lower() != "production"
    manager = UnitJobManager(store, generator, development=development, max_concurrent_jobs=2)
    manager.recover()
    return manager
