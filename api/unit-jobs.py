import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from _lib.common import JsonHandler, rate_limited, limit_answer_words  # noqa: E402
from _lib.jobs import UnitJobManager, ACTIVE_STATUSES  # noqa: E402


def _build_create_data(payload):
    """Validate the create payload. Returns (data, error_message, status)."""
    original_topic = limit_answer_words(str(payload.get("originalTopic") or payload.get("topic") or ""), 28)
    canonical_topic = limit_answer_words(str(payload.get("canonicalTopic") or original_topic).lower(), 28)
    selected_depth = str(payload.get("selectedDepth") or "").strip().lower().replace("-", "_")
    client_request_id = str(payload.get("clientRequestId") or "").strip()[:120]
    source_chat_id = str(payload.get("sourceChatId") or "").strip()[:120]
    source_message_id = str(payload.get("sourceMessageId") or "").strip()[:120]

    try:
        min_lessons = int(payload.get("minimumLessonCount"))
        max_lessons = int(payload.get("maximumLessonCount"))
        target_lesson_count = int(payload.get("targetLessonCount", max_lessons))
    except (TypeError, ValueError):
        return None, "Lesson counts must be integers", 400

    course_outline_requested = bool(payload.get("courseOutlineRequested"))
    if course_outline_requested:
        target_lesson_count = 0
    if not original_topic or not canonical_topic or not client_request_id:
        return None, "Topic and clientRequestId are required", 400
    if selected_depth not in {"quick", "complete", "standard", "deep"}:
        return None, "Invalid selectedDepth", 400
    if min_lessons < 2 or max_lessons > 13 or min_lessons > max_lessons:
        return None, "Invalid lesson range", 400
    if not course_outline_requested and not (min_lessons <= target_lesson_count <= max_lessons):
        return None, "Invalid targetLessonCount", 400

    concepts = payload.get("approvedLessonConcepts") or []
    if not isinstance(concepts, list):
        concepts = []
    data = {
        "client_request_id": client_request_id,
        "original_topic": original_topic,
        "canonical_topic": canonical_topic,
        "selected_depth": selected_depth,
        "min_lessons": min_lessons,
        "max_lessons": max_lessons,
        "target_lesson_count": target_lesson_count,
        "source_chat_id": source_chat_id,
        "source_message_id": source_message_id,
        "course_outline_requested": course_outline_requested,
        "scope_reason": limit_answer_words(str(payload.get("scopeReason") or ""), 42),
        "approved_lesson_concepts": [
            limit_answer_words(str(item or ""), 12)
            for item in concepts[:13]
            if str(item or "").strip()
        ],
    }
    return data, None, 201


class handler(JsonHandler):
    def do_GET(self):  # noqa: N802 - list jobs for a chat
        try:
            manager = UnitJobManager()
            chat_id = self.query_one("sourceChatId", "")[:120]
            active_only = self.query_one("active", "").lower() in {"1", "true", "yes"}
            jobs = manager.store.list_for_chat(chat_id, active_only=active_only)
            self.send_json({"jobs": [manager.public(job) for job in jobs]})
        except Exception:  # noqa: BLE001
            self.send_json({"jobs": []})

    def do_POST(self):  # noqa: N802 - create a job
        if rate_limited(self.client_ip()):
            return self.send_json({"error": "Tutor request limit reached. Please wait and try again."}, 429)
        try:
            payload = self.read_json_body()
        except OverflowError as exc:
            return self.send_json({"error": str(exc)}, 413)
        except ValueError as exc:
            return self.send_json({"error": str(exc)}, 400)

        data, error, status = _build_create_data(payload)
        if error:
            return self.send_json({"error": error}, status)

        try:
            manager = UnitJobManager()
        except Exception:  # noqa: BLE001
            return self.send_json(
                {"error": "Unit generation is not configured on the server.", "category": "store_unavailable"}, 500
            )

        try:
            job, created = manager.create(data)
        except Exception:  # noqa: BLE001
            return self.send_json(
                {"error": "Could not start unit generation. Please try again.", "category": "store_unavailable"}, 502
            )

        response = manager.public(job)
        response["created"] = created
        http_status = 202 if job["status"] in ACTIVE_STATUSES else 200
        return self.send_json(response, http_status)
