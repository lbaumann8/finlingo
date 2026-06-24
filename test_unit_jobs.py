import tempfile
import threading
import time
import unittest
from pathlib import Path

from unit_jobs import FakeUnitGenerator, UnitJobError, UnitJobManager, UnitJobStore


def job_data(client_request_id="request_1", lessons=4):
    return {
        "client_request_id": client_request_id,
        "original_topic": "Index funds",
        "canonical_topic": "index funds",
        "selected_depth": "standard",
        "min_lessons": lessons,
        "max_lessons": lessons,
        "target_lesson_count": lessons,
        "source_chat_id": "chat_1",
        "source_message_id": "message_1",
        "course_outline_requested": False,
        "approved_lesson_concepts": [f"Concept {i + 1}" for i in range(lessons)],
    }


def wait_for(store, job_id, statuses, timeout=8):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        job = store.get(job_id)
        if job and job["status"] in statuses:
            return job
        time.sleep(0.02)
    raise AssertionError(f"job {job_id} did not reach {statuses}")


class CountingGenerator(FakeUnitGenerator):
    def __init__(self, delay=0, fail_lesson_once=None, fail_lesson_always=None):
        super().__init__()
        self.delay = delay
        self.fail_lesson_once = fail_lesson_once
        self.fail_lesson_always = fail_lesson_always
        self.calls = {"outline": 0, "quiz": 0, "lessons": {}}

    def _pause(self):
        if self.delay:
            time.sleep(self.delay)

    def outline(self, job, timeout):
        self.calls["outline"] += 1
        self._pause()
        return super().outline(job, timeout)

    def lesson(self, job, outline, lesson_index, timeout):
        calls = self.calls["lessons"]
        calls[lesson_index] = calls.get(lesson_index, 0) + 1
        self._pause()
        marker = (job["job_id"], lesson_index)
        if self.fail_lesson_always == lesson_index:
            raise UnitJobError("forced permanent failure", "temporary_upstream", True)
        if self.fail_lesson_once == lesson_index and marker not in self.failed_once:
            self.failed_once.add(marker)
            raise UnitJobError("forced one-time failure", "temporary_upstream", True)
        return super().lesson(job, outline, lesson_index, timeout)

    def quiz(self, job, outline, lessons, timeout):
        self.calls["quiz"] += 1
        self._pause()
        return super().quiz(job, outline, lessons, timeout)


class BlockingGenerator(CountingGenerator):
    def __init__(self):
        super().__init__()
        self.lesson_started = threading.Event()
        self.release = threading.Event()

    def lesson(self, job, outline, lesson_index, timeout):
        self.calls["lessons"][lesson_index] = self.calls["lessons"].get(lesson_index, 0) + 1
        self.lesson_started.set()
        self.release.wait(3)
        return FakeUnitGenerator.lesson(self, job, outline, lesson_index, timeout)


class UnitJobTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.db = str(Path(self.temp.name) / "jobs.sqlite3")

    def tearDown(self):
        self.temp.cleanup()

    def manager(self, generator):
        store = UnitJobStore(self.db)
        return UnitJobManager(store, generator, development=False), store

    def test_start_returns_immediately_and_job_completes_later(self):
        manager, store = self.manager(CountingGenerator(delay=0.08))
        started = time.monotonic()
        job, created = manager.create(job_data(lessons=3))
        start_duration = time.monotonic() - started
        self.assertTrue(created)
        self.assertLess(start_duration, 0.2)
        completed = wait_for(store, job["job_id"], {"completed"})
        self.assertEqual(len(completed["completed_lessons"]), 3)
        self.assertGreater(time.monotonic() - started, start_duration)

    def test_client_request_id_is_idempotent(self):
        generator = CountingGenerator(delay=0.03)
        manager, store = self.manager(generator)
        first, first_created = manager.create(job_data("same_request", lessons=3))
        second, second_created = manager.create(job_data("same_request", lessons=3))
        self.assertTrue(first_created)
        self.assertFalse(second_created)
        self.assertEqual(first["job_id"], second["job_id"])
        wait_for(store, first["job_id"], {"completed"})
        self.assertEqual(generator.calls["outline"], 1)

    def test_one_lesson_retries_without_regenerating_previous_lessons(self):
        generator = CountingGenerator(fail_lesson_once=2)
        manager, store = self.manager(generator)
        job, _ = manager.create(job_data(lessons=4))
        completed = wait_for(store, job["job_id"], {"completed"})
        self.assertEqual(len(completed["completed_lessons"]), 4)
        self.assertEqual(generator.calls["lessons"][0], 1)
        self.assertEqual(generator.calls["lessons"][1], 1)
        self.assertEqual(generator.calls["lessons"][2], 2)
        self.assertEqual(generator.calls["lessons"][3], 1)
        self.assertEqual(completed["retry_count"], 1)

    def test_retry_failed_step_resumes_from_saved_lessons(self):
        generator = CountingGenerator(fail_lesson_always=2)
        manager, store = self.manager(generator)
        job, _ = manager.create(job_data(lessons=4))
        failed = wait_for(store, job["job_id"], {"failed"}, timeout=12)
        self.assertEqual(len(failed["completed_lessons"]), 2)
        self.assertEqual(failed["failed_component"], "lesson:2")
        generator.fail_lesson_always = None
        manager.retry(job["job_id"])
        completed = wait_for(store, job["job_id"], {"completed"}, timeout=8)
        self.assertEqual(len(completed["completed_lessons"]), 4)
        self.assertEqual(generator.calls["lessons"][0], 1)
        self.assertEqual(generator.calls["lessons"][1], 1)
        self.assertEqual(generator.calls["lessons"][2], 4)

    def test_recover_resumes_persisted_partial_job(self):
        generator = CountingGenerator()
        store = UnitJobStore(self.db)
        job, _ = store.create(job_data(lessons=3))
        outline = generator.outline(job, 60)
        first_lesson = generator.lesson(job, outline, 0, 75)
        first_lesson = UnitJobManager(store, generator, development=False)._validate_lesson(first_lesson, 0, [])
        store.update(
            job["job_id"],
            status="generating_lessons",
            stage="generating_lessons",
            partial_outline=outline,
            completed_lessons=[first_lesson],
        )
        resumed = UnitJobManager(store, generator, development=False)
        resumed.recover()
        completed = wait_for(store, job["job_id"], {"completed"})
        self.assertEqual(len(completed["completed_lessons"]), 3)
        self.assertEqual(generator.calls["lessons"].get(0), 1)
        self.assertEqual(generator.calls["lessons"].get(1), 1)

    def test_cancellation_stops_new_components(self):
        generator = BlockingGenerator()
        manager, store = self.manager(generator)
        job, _ = manager.create(job_data(lessons=3))
        self.assertTrue(generator.lesson_started.wait(3))
        manager.cancel(job["job_id"])
        generator.release.set()
        cancelled = wait_for(store, job["job_id"], {"cancelled"})
        time.sleep(0.1)
        self.assertEqual(cancelled["status"], "cancelled")
        self.assertNotIn(1, generator.calls["lessons"])
        self.assertEqual(generator.calls["quiz"], 0)


if __name__ == "__main__":
    unittest.main()
