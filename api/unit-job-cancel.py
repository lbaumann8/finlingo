import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from _lib.common import JsonHandler  # noqa: E402
from _lib.jobs import UnitJobManager  # noqa: E402

# Reached via rewrite: POST /api/unit-jobs/:id/cancel -> /api/unit-job-cancel?id=:id


class handler(JsonHandler):
    def do_POST(self):  # noqa: N802
        job_id = self.query_one("id", "").strip()
        if not job_id:
            return self.send_json({"error": "Missing job id"}, 400)
        try:
            manager = UnitJobManager()
            job = manager.cancel(job_id)
        except Exception:  # noqa: BLE001
            return self.send_json({"error": "Could not cancel the job.", "category": "store_unavailable"}, 503)
        if not job:
            return self.send_json({"error": "Unit job not found"}, 404)
        return self.send_json(manager.public(job))
