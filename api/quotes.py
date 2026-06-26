import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from _lib.common import JsonHandler  # noqa: E402
from _lib.market import handle_quotes  # noqa: E402


class handler(JsonHandler):
    def do_GET(self):  # noqa: N802
        symbols = self.query_one("symbols", "")
        payload, status = handle_quotes(symbols)
        self.send_json(payload, status)
