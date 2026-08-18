"""Vercel function: POST /api/ocr-thai."""

from __future__ import annotations

import sys
from http.server import BaseHTTPRequestHandler
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from grok_backend import handle_ocr_thai, read_json_body, send_json, send_options


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self) -> None:  # noqa: N802
        send_options(self)

    def do_POST(self) -> None:  # noqa: N802
        try:
            data = read_json_body(self)
        except ValueError as exc:
            send_json(self, 400, {"error": str(exc)})
            return
        api_key = (self.headers.get("X-Api-Key") or "").strip()
        status, payload = handle_ocr_thai(api_key, data)
        send_json(self, status, payload)
