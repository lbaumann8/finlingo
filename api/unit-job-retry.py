import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from _lib.common import JsonHandler  # noqa: E402
from _lib.jobs import UnitJobManager, ACTIVE_STATUSES  # noqa: E402

# Reached via rewrite: POST /api/unit-jobs/:id/retry -> /api/unit-job-retry?id=:id


class handler(JsonHandler):
    def do_POST(self):  # noqa: N802
        job_id = self.query_one("id", "").strip()
        if not job_id:
            return self.send_json({"error": "Missing job id"}, 400)
        try:
            manager = UnitJobManager()
            job = manager.retry(job_id)
        except Exception:  # noqa: BLE001
            return self.send_json({"error": "Could not retry the job.", "category": "store_unavailable"}, 503)
        if not job:
            return self.send_json({"error": "Unit job not found"}, 404)
        http_status = 202 if job["status"] in ACTIVE_STATUSES else 200
        return self.send_json(manager.public(job), http_status)
