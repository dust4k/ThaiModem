#!/usr/bin/env python3
"""ThaiModem local PWA server + Grok API proxy (Python stdlib only)."""

from __future__ import annotations

import json
import re
import socket
import ssl
import sys
import urllib.error
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent
PUBLIC = ROOT / "public"
PORT = 8080
GROK_URL = "https://api.x.ai/v1/chat/completions"
ALLOWED_MODELS = frozenset(
    {
        "grok-4",
        "grok-4-fast",
        "grok-4-fast-reasoning",
        "grok-4.1-fast",
        "grok-3",
        "grok-3-mini",
        "grok-3-fast",
    }
)
DEFAULT_MODEL = "grok-4"

TRANSLATION_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "translated_text": {
            "type": "string",
            "description": "Natural translation in the target language.",
        },
        "romanized_text": {
            "type": "string",
            "description": "Full-sentence RTGS romanization of all Thai text in the result.",
        },
        "word_breakdown": {
            "type": "array",
            "description": "Word or compound-phrase learning breakdown.",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "original_word": {"type": "string"},
                    "romanization": {"type": "string"},
                    "meaning": {"type": "string"},
                    "part_of_speech": {"type": "string"},
                },
                "required": [
                    "original_word",
                    "romanization",
                    "meaning",
                    "part_of_speech",
                ],
            },
        },
        "corrections": {
            "type": "array",
            "description": "Feedback for Thai input only; empty array for English input.",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "issue": {"type": "string"},
                    "suggestion": {"type": "string"},
                    "explanation": {"type": "string"},
                },
                "required": ["issue", "suggestion", "explanation"],
            },
        },
        "cultural_or_grammar_note": {
            "type": ["string", "null"],
            "description": "Optional cultural or grammar note for the learner.",
        },
    },
    "required": [
        "translated_text",
        "romanized_text",
        "word_breakdown",
        "corrections",
        "cultural_or_grammar_note",
    ],
}

SYSTEM_PROMPT = """You are an expert Thai–English linguist and language teacher.

Return only structured JSON that matches the provided schema.

Primary translation:
- Produce a natural, native-sounding translation in the target language.
- Preserve the speaker’s intent, register (formal/informal), and politeness.

Romanization:
- romanized_text is a full-sentence RTGS (Royal Thai General System) romanization of all Thai in the result.
- For English→Thai, romanize the Thai translation.
- For Thai→English, romanize the original Thai input (so the learner can pronounce what they wrote).
- In word_breakdown.romanization, use RTGS. You may add a brief Paiboon-style hint in parentheses when tones or vowels would otherwise be unclear.

Word breakdown:
- Segment by meaningful words or compound phrases, not raw characters.
- Include original_word, romanization, part_of_speech (noun, verb, adjective, adverb, particle, classifier, pronoun, preposition, conjunction, interjection, phrase), and a concise English meaning.

Corrections (Thai input only):
- When the source is Thai, analyze unnatural phrasing, awkward particles (ครับ/ค่ะ/นะ/สิ/เลย), word order, register, and grammar.
- Each correction: issue, a more native suggestion, and a short explanation.
- If the Thai is already natural, return an empty corrections array.
- When the source is English, always return an empty corrections array.

cultural_or_grammar_note:
- Optional extra teaching note. Use null when nothing useful to add.
"""


def lan_ip() -> str:
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sock.connect(("8.8.8.8", 80))
        return sock.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        sock.close()


def strip_json_fences(text: str) -> str:
    stripped = text.strip()
    if stripped.startswith("```"):
        lines = stripped.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        stripped = "\n".join(lines).strip()
    return stripped


def grok_error_message(status: int, body: str) -> str:
    if status == 401:
        return "Invalid API key"
    if status == 429:
        return "Rate limit reached. Try again in a moment."
    try:
        payload = json.loads(body)
        err = payload.get("error")
        if isinstance(err, dict) and err.get("message"):
            return str(err["message"])
        if isinstance(err, str) and err:
            return err
    except json.JSONDecodeError:
        pass
    if body.strip():
        return body.strip()[:400]
    return f"Grok API error ({status})"


THAI_SCRIPT = re.compile(r"[\u0E00-\u0E7F]")


def detect_direction(text: str) -> str:
    if THAI_SCRIPT.search(text):
        return "thaiToEnglish"
    return "englishToThai"


def call_grok(api_key: str, text: str, direction: str, model: str) -> dict[str, Any]:
    if direction == "thaiToEnglish":
        user_content = (
            "Direction: Thai → English.\n"
            "Source language: Thai.\n"
            "Target language: English.\n"
            "Provide corrections for the Thai input if needed.\n\n"
            f"Input:\n{text}"
        )
    else:
        user_content = (
            "Direction: English → Thai.\n"
            "Source language: English.\n"
            "Target language: Thai.\n"
            "Do not include corrections (empty array).\n\n"
            f"Input:\n{text}"
        )

    payload = {
        "model": model,
        "temperature": 0.3,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_content},
        ],
        "response_format": {
            "type": "json_schema",
            "json_schema": {
                "name": "translation_result",
                "strict": True,
                "schema": TRANSLATION_SCHEMA,
            },
        },
    }

    request = urllib.request.Request(
        GROK_URL,
        data=json.dumps(payload).encode("utf-8"),
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
            "Accept": "application/json",
        },
    )
    context = ssl.create_default_context()
    try:
        with urllib.request.urlopen(request, timeout=120, context=context) as response:
            raw = response.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        err_body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(grok_error_message(exc.code, err_body)) from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Network error talking to Grok: {exc.reason}") from exc
    except TimeoutError as exc:
        raise RuntimeError("Grok request timed out") from exc

    try:
        envelope = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise RuntimeError("Unexpected response format") from exc

    try:
        content = envelope["choices"][0]["message"]["content"]
        if not isinstance(content, str) or not content.strip():
            raise KeyError("empty content")
        result = json.loads(strip_json_fences(content))
    except (KeyError, IndexError, TypeError, json.JSONDecodeError) as exc:
        raise RuntimeError("Unexpected response format") from exc

    if not isinstance(result, dict):
        raise RuntimeError("Unexpected response format")
    return result


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

    def _send_json(self, status: int, payload: dict[str, Any]) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_json_body(self) -> dict[str, Any]:
        length = int(self.headers.get("Content-Length", "0") or "0")
        if length <= 0:
            return {}
        raw = self.rfile.read(length)
        try:
            data = json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError as exc:
            raise ValueError("Request body must be JSON") from exc
        if not isinstance(data, dict):
            raise ValueError("Request body must be a JSON object")
        return data

    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Api-Key")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.end_headers()

    def do_POST(self) -> None:  # noqa: N802
        if self.path.split("?", 1)[0] != "/api/translate":
            self.send_error(404, "Not found")
            return

        api_key = (self.headers.get("X-Api-Key") or "").strip()
        if not api_key:
            self._send_json(400, {"error": "Missing API key"})
            return

        try:
            data = self._read_json_body()
        except ValueError as exc:
            self._send_json(400, {"error": str(exc)})
            return

        text = str(data.get("text") or "").strip()
        if not text:
            self._send_json(400, {"error": "Enter text to translate"})
            return

        direction = str(data.get("direction") or "").strip()
        if not direction or direction == "auto":
            direction = detect_direction(text)
        elif direction not in {"englishToThai", "thaiToEnglish"}:
            self._send_json(400, {"error": "Invalid translation direction"})
            return

        model = str(data.get("model") or DEFAULT_MODEL).strip() or DEFAULT_MODEL
        if model not in ALLOWED_MODELS:
            self._send_json(400, {"error": "Unsupported model"})
            return

        try:
            result = call_grok(api_key, text, direction, model)
        except RuntimeError as exc:
            message = str(exc)
            if "Invalid API key" in message:
                status = 401
            elif "Rate limit" in message:
                status = 429
            else:
                status = 502
            self._send_json(status, {"error": message})
            return

        self._send_json(200, result)


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
