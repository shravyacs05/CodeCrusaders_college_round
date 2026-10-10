"""Provider-agnostic LLM wrapper (Google Gemini, Anthropic, or OpenAI-compatible) using plain HTTP.

Env:
  LLM_PROVIDER = gemini | anthropic | openai | none
  LLM_MODEL    = gemini-flash-latest | claude-3-5-sonnet-20241022 | gpt-4o
  LLM_API_KEY  or GEMINI_API_KEY
  LLM_BASE_URL (optional)

Returns parsed JSON; one retry on invalid JSON. Raises LLMError on failure so callers
can fall back to deterministic extraction.
"""
import json
import os
import re
from typing import Any

import httpx

from ..config import LLM_API_KEY, LLM_MODEL, LLM_PROVIDER


class LLMError(RuntimeError):
    pass


def enabled() -> bool:
    return LLM_PROVIDER in ("gemini", "google", "anthropic", "openai") and bool(LLM_API_KEY and LLM_MODEL)


def _call(system: str, user: str) -> str:
    if LLM_PROVIDER in ("gemini", "google"):
        model = LLM_MODEL or "gemini-flash-latest"
        if model.startswith("models/"):
            model = model.replace("models/", "")
        base_url = os.getenv("LLM_BASE_URL", "https://generativelanguage.googleapis.com/v1beta")
        url = f"{base_url}/models/{model}:generateContent?key={LLM_API_KEY}"
        body = {
            "system_instruction": {"parts": [{"text": system}]},
            "contents": [{"parts": [{"text": user}]}],
            "generationConfig": {"response_mime_type": "application/json"},
        }
        r = httpx.post(url, json=body, timeout=120)
        r.raise_for_status()
        data = r.json()
        candidates = data.get("candidates", [])
        if not candidates:
            raise LLMError(f"Gemini returned no candidates: {data}")
        parts = candidates[0].get("content", {}).get("parts", [])
        if not parts:
            raise LLMError(f"Gemini returned no content parts: {data}")
        return parts[0].get("text", "")

    if LLM_PROVIDER == "anthropic":
        r = httpx.post(
            os.getenv("LLM_BASE_URL", "https://api.anthropic.com") + "/v1/messages",
            headers={"x-api-key": LLM_API_KEY, "anthropic-version": "2023-06-01"},
            json={"model": LLM_MODEL, "max_tokens": 2000, "system": system,
                  "messages": [{"role": "user", "content": user}]}, timeout=120)
        r.raise_for_status()
        return r.json()["content"][0]["text"]

    # Default to OpenAI-compatible
    r = httpx.post(
        os.getenv("LLM_BASE_URL", "https://api.openai.com/v1") + "/chat/completions",
        headers={"Authorization": f"Bearer {LLM_API_KEY}"},
        json={"model": LLM_MODEL, "response_format": {"type": "json_object"},
              "messages": [{"role": "system", "content": system},
                           {"role": "user", "content": user}]}, timeout=120)
    r.raise_for_status()
    return r.json()["choices"][0]["message"]["content"]


def _parse_json(text: str) -> dict[str, Any]:
    m = re.search(r"\{.*\}", text, re.DOTALL)
    if not m:
        raise ValueError("no JSON object found")
    return json.loads(m.group(0))


import time

def complete_json(system: str, user: str) -> dict[str, Any]:
    """Call the LLM expecting a JSON object; retry with backoff if server errors or invalid JSON occur."""
    if not enabled():
        raise LLMError("LLM not configured")
    last: Exception | None = None
    for attempt in range(3):
        try:
            prompt = user if attempt == 0 else user + "\n\nReturn ONLY a valid JSON object."
            return _parse_json(_call(system, prompt))
        except Exception as e:
            last = e
            if attempt < 2:
                time.sleep(2.0 * (attempt + 1))
    raise LLMError(f"LLM call failed: {last}")
