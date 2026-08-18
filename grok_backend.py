#!/usr/bin/env python3
"""Shared Grok proxy used by the local server and Vercel functions."""

from __future__ import annotations

import base64
import binascii
import json
import re
import ssl
import urllib.error
import urllib.request
from typing import Any

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
MAX_IMAGE_BYTES = 4 * 1024 * 1024
ALLOWED_IMAGE_MIME = frozenset({"image/jpeg", "image/png", "image/webp"})

OCR_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "text": {
            "type": "string",
            "description": "Extracted Thai text only, or empty string if none found.",
        },
    },
    "required": ["text"],
}

OCR_SYSTEM_PROMPT = """You extract Thai text from images for a language-learning translator.

Return only structured JSON that matches the provided schema."""

OCR_USER_PROMPT = """Extract the Thai text from this image for translation.

Return ONLY the Thai passage(s) a learner would type into a translator.
Do not include any superfluous text: no English, no UI labels, no timestamps,
no URLs, no watermarks, no commentary, and no text you are not confident is in the image.
Preserve line breaks within the Thai content.
If there is no Thai text, return an empty string."""

CONTEXT_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "sentence_thai": {
            "type": "string",
            "description": "A simple example sentence in Thai using the target word.",
        },
        "romanization": {
            "type": "string",
            "description": "RTGS romanization of the Thai sentence.",
        },
        "meaning": {
            "type": "string",
            "description": "English translation of the sentence.",
        },
    },
    "required": ["sentence_thai", "romanization", "meaning"],
}

CONTEXT_SYSTEM_PROMPT = """You are an expert Thai language teacher helping learners see words in context.

Return only structured JSON that matches the provided schema."""

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

THAI_SCRIPT = re.compile(r"[\u0E00-\u0E7F]")


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


def detect_direction(text: str) -> str:
    if THAI_SCRIPT.search(text):
        return "thaiToEnglish"
    return "englishToThai"


def grok_error_status(message: str) -> int:
    if "Invalid API key" in message:
        return 401
    if "Rate limit" in message:
        return 429
    return 502


def clean_ocr_text(text: str) -> str:
    lines = [line.strip() for line in text.splitlines()]
    thai_lines = [line for line in lines if line and THAI_SCRIPT.search(line)]
    return "\n".join(thai_lines).strip()


def post_grok_json(api_key: str, payload: dict[str, Any]) -> dict[str, Any]:
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


def call_grok_ocr(api_key: str, image_b64: str, mime_type: str, model: str) -> str:
    payload = {
        "model": model,
        "temperature": 0.1,
        "messages": [
            {"role": "system", "content": OCR_SYSTEM_PROMPT},
            {
                "role": "user",
                "content": [
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:{mime_type};base64,{image_b64}",
                            "detail": "high",
                        },
                    },
                    {"type": "text", "text": OCR_USER_PROMPT},
                ],
            },
        ],
        "response_format": {
            "type": "json_schema",
            "json_schema": {
                "name": "ocr_result",
                "strict": True,
                "schema": OCR_SCHEMA,
            },
        },
    }
    result = post_grok_json(api_key, payload)
    text = str(result.get("text") or "")
    return clean_ocr_text(text)


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
    return post_grok_json(api_key, payload)


def handle_translate(api_key: str, data: dict[str, Any]) -> tuple[int, dict[str, Any]]:
    if not api_key:
        return 400, {"error": "Missing API key"}

    text = str(data.get("text") or "").strip()
    if not text:
        return 400, {"error": "Enter text to translate"}

    direction = str(data.get("direction") or "").strip()
    if not direction or direction == "auto":
        direction = detect_direction(text)
    elif direction not in {"englishToThai", "thaiToEnglish"}:
        return 400, {"error": "Invalid translation direction"}

    model = str(data.get("model") or DEFAULT_MODEL).strip() or DEFAULT_MODEL
    if model not in ALLOWED_MODELS:
        return 400, {"error": "Unsupported model"}

    try:
        result = call_grok(api_key, text, direction, model)
    except RuntimeError as exc:
        return grok_error_status(str(exc)), {"error": str(exc)}

    return 200, result


def handle_ocr_thai(api_key: str, data: dict[str, Any]) -> tuple[int, dict[str, Any]]:
    if not api_key:
        return 400, {"error": "Missing API key"}

    image_b64 = str(data.get("image") or "").strip()
    if not image_b64:
        return 400, {"error": "Missing image data"}

    mime_type = str(data.get("mime_type") or "image/jpeg").strip().lower()
    if mime_type not in ALLOWED_IMAGE_MIME:
        return 400, {"error": "Unsupported image type"}

    try:
        image_bytes = base64.b64decode(image_b64, validate=True)
    except (binascii.Error, ValueError):
        return 400, {"error": "Invalid image data"}

    if len(image_bytes) > MAX_IMAGE_BYTES:
        return 400, {"error": "Image is too large"}

    model = str(data.get("model") or DEFAULT_MODEL).strip() or DEFAULT_MODEL
    if model not in ALLOWED_MODELS:
        return 400, {"error": "Unsupported model"}

    try:
        text = call_grok_ocr(api_key, image_b64, mime_type, model)
    except RuntimeError as exc:
        return grok_error_status(str(exc)), {"error": str(exc)}

    if not text or not THAI_SCRIPT.search(text):
        return 400, {"error": "No Thai text found in image"}

    return 200, {"text": text}


def call_grok_context(
    api_key: str,
    word: str,
    meaning: str,
    part_of_speech: str,
    romanization: str,
    model: str,
) -> dict[str, Any]:
    user_content = (
        "Write one simple, natural Thai example sentence that uses the target word.\n"
        "Keep it short (roughly 5–12 words) and suitable for a beginner–intermediate learner.\n"
        "Use the word in a typical, everyday way.\n\n"
        f"Target word: {word}\n"
        f"Romanization: {romanization}\n"
        f"Part of speech: {part_of_speech}\n"
        f"English meaning: {meaning}"
    )
    payload = {
        "model": model,
        "temperature": 0.4,
        "messages": [
            {"role": "system", "content": CONTEXT_SYSTEM_PROMPT},
            {"role": "user", "content": user_content},
        ],
        "response_format": {
            "type": "json_schema",
            "json_schema": {
                "name": "word_context",
                "strict": True,
                "schema": CONTEXT_SCHEMA,
            },
        },
    }
    return post_grok_json(api_key, payload)


def handle_word_context(api_key: str, data: dict[str, Any]) -> tuple[int, dict[str, Any]]:
    if not api_key:
        return 400, {"error": "Missing API key"}

    word = str(data.get("word") or "").strip()
    if not word:
        return 400, {"error": "Missing word"}

    meaning = str(data.get("meaning") or "").strip()
    part_of_speech = str(data.get("part_of_speech") or "").strip()
    romanization = str(data.get("romanization") or "").strip()

    model = str(data.get("model") or DEFAULT_MODEL).strip() or DEFAULT_MODEL
    if model not in ALLOWED_MODELS:
        return 400, {"error": "Unsupported model"}

    try:
        result = call_grok_context(
            api_key, word, meaning, part_of_speech, romanization, model
        )
    except RuntimeError as exc:
        return grok_error_status(str(exc)), {"error": str(exc)}

    sentence = str(result.get("sentence_thai") or "").strip()
    if not sentence:
        return 502, {"error": "Could not generate context sentence"}

    return 200, {
        "sentence_thai": sentence,
        "romanization": str(result.get("romanization") or "").strip(),
        "meaning": str(result.get("meaning") or "").strip(),
    }


def send_json(httpd: Any, status: int, payload: dict[str, Any]) -> None:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    httpd.send_response(status)
    httpd.send_header("Content-Type", "application/json; charset=utf-8")
    httpd.send_header("Content-Length", str(len(body)))
    httpd.end_headers()
    httpd.wfile.write(body)


def send_options(httpd: Any) -> None:
    httpd.send_response(204)
    httpd.send_header("Access-Control-Allow-Origin", "*")
    httpd.send_header("Access-Control-Allow-Headers", "Content-Type, X-Api-Key")
    httpd.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    httpd.end_headers()


def read_json_body(httpd: Any) -> dict[str, Any]:
    length = int(httpd.headers.get("Content-Length", "0") or "0")
    if length <= 0:
        return {}
    raw = httpd.rfile.read(length)
    try:
        data = json.loads(raw.decode("utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError("Request body must be JSON") from exc
    if not isinstance(data, dict):
        raise ValueError("Request body must be a JSON object")
    return data
