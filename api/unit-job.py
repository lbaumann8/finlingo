import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from _lib.common import JsonHandler  # noqa: E402
from _lib.jobs import UnitJobManager  # noqa: E402

# Reached via the vercel.json rewrite:
#   GET /api/unit-jobs/:id  ->  /api/unit-job?id=:id
# Each poll advances the durable job by exactly one generation step.


class handler(JsonHandler):
    def do_GET(self):  # noqa: N802
        job_id = self.query_one("id", "").strip()
        if not job_id:
            return self.send_json({"error": "Missing job id"}, 400)
        try:
            manager = UnitJobManager()
            status = manager.advance(job_id)
        except Exception:  # noqa: BLE001
            # Never strand the UI on a hard 500 — report a soft, retryable state.
            return self.send_json(
                {"error": "Progress is temporarily unavailable.", "category": "store_unavailable", "retryable": True},
                503,
            )
        if status is None:
            return self.send_json({"error": "Unit job not found"}, 404)
        return self.send_json(status)
