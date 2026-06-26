import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from _lib.common import JsonHandler  # noqa: E402
from _lib.market import handle_history  # noqa: E402


class handler(JsonHandler):
    def do_GET(self):  # noqa: N802
        symbol = self.query_one("symbol", "")
        rng = self.query_one("range", "1D")
        payload, status = handle_history(symbol, rng)
        self.send_json(payload, status)
