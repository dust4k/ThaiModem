#!/usr/bin/env python3
"""ThaiModem local PWA server + Grok API proxy (Python stdlib only).

Vercel deploys api/translate.py and api/ocr-thai.py instead of this file.
"""

from __future__ import annotations

import socket
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

from grok_backend import handle_ocr_thai, handle_translate, handle_word_context, read_json_body, send_json, send_options

ROOT = Path(__file__).resolve().parent
PUBLIC = ROOT / "public"
PORT = 8080


def lan_ip() -> str:
    sock = socket.socket(socket.AF_INET, socket.SOCK_DATAGRAM)
    try:
        sock.connect(("8.8.8.8", 80))
        return sock.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        sock.close()


class ThaiModemHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, directory=str(PUBLIC), **kwargs)

    def log_message(self, format: str, *args: Any) -> None:
        sys.stdout.write("%s - %s\n" % (self.address_string(), format % args))

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def guess_type(self, path: str) -> str:
        if path.endswith(".webmanifest"):
            return "application/manifest+json"
        if path.endswith(".js"):
            return "text/javascript; charset=utf-8"
        guessed = super().guess_type(path)
        return guessed or "application/octet-stream"

    def do_OPTIONS(self) -> None:  # noqa: N802
        send_options(self)

    def do_POST(self) -> None:  # noqa: N802
        route = self.path.split("?", 1)[0]
        if route not in {"/api/translate", "/api/ocr-thai", "/api/word-context"}:
            self.send_error(404, "Not found")
            return

        try:
            data = read_json_body(self)
        except ValueError as exc:
            send_json(self, 400, {"error": str(exc)})
            return

        api_key = (self.headers.get("X-Api-Key") or "").strip()
        if route == "/api/translate":
            status, payload = handle_translate(api_key, data)
        elif route == "/api/ocr-thai":
            status, payload = handle_ocr_thai(api_key, data)
        else:
            status, payload = handle_word_context(api_key, data)
        send_json(self, status, payload)


def main() -> None:
    if not PUBLIC.is_dir():
        raise SystemExit(f"Missing public directory: {PUBLIC}")

    httpd = ThreadingHTTPServer(("0.0.0.0", PORT), ThaiModemHandler)
    ip = lan_ip()
    print("ThaiModem is running")
    print(f"  This PC:    http://127.0.0.1:{PORT}")
    print(f"  iPhone LAN: http://{ip}:{PORT}")
    print("Add the LAN URL to your iPhone Home Screen from Safari.")
    print("Press Ctrl+C to stop.")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
        httpd.server_close()


if __name__ == "__main__":
    main()
