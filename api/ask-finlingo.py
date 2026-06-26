import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from _lib.common import JsonHandler, rate_limited  # noqa: E402
from _lib.anthropic_ask import handle_ask  # noqa: E402


class handler(JsonHandler):
    def do_POST(self):  # noqa: N802
        if rate_limited(self.client_ip()):
            return self.send_json(
                {"error": "Tutor request limit reached. Please wait a few minutes and try again."}, 429
            )
        try:
            payload = self.read_json_body()
        except OverflowError as exc:
            return self.send_json({"error": str(exc)}, 413)
        except ValueError as exc:
            return self.send_json({"error": str(exc)}, 400)

        response, status = handle_ask(payload)
        return self.send_json(response, status)
