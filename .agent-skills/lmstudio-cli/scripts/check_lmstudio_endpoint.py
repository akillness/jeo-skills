#!/usr/bin/env python3
"""Lightweight LM Studio endpoint checker.

Uses stdlib only. Verifies a base URL that points at LM Studio's OpenAI-compatible
surface (usually http://HOST:PORT/v1), lists model IDs, and optionally runs a
small chat/completions smoke test.
"""

from __future__ import annotations

import argparse
import json
import ssl
import sys
import urllib.error
import urllib.parse
import urllib.request
from typing import Any


DEFAULT_HEADERS = {
    "User-Agent": "Mozilla/5.0",
    "Accept": "application/json",
}


class CheckError(RuntimeError):
    pass


ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE


def request_json(url: str, method: str = "GET", payload: dict[str, Any] | None = None) -> Any:
    data = None
    headers = dict(DEFAULT_HEADERS)
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=20, context=ctx) as resp:
            return json.loads(resp.read().decode("utf-8", "ignore"))
    except urllib.error.HTTPError as exc:  # pragma: no cover - simple CLI helper
        body = exc.read().decode("utf-8", "ignore")
        raise CheckError(f"HTTP {exc.code} for {url}: {body[:300]}") from exc
    except urllib.error.URLError as exc:  # pragma: no cover - simple CLI helper
        raise CheckError(f"Connection error for {url}: {exc}") from exc
    except json.JSONDecodeError as exc:  # pragma: no cover - simple CLI helper
        raise CheckError(f"Non-JSON response from {url}: {exc}") from exc


def normalize_base_url(raw: str) -> str:
    raw = raw.rstrip("/")
    if raw.endswith("/v1"):
        return raw
    return raw + "/v1"


def pick_model_id(models_payload: Any) -> str | None:
    if not isinstance(models_payload, dict):
        return None
    data = models_payload.get("data")
    if not isinstance(data, list):
        return None
    for item in data:
        if isinstance(item, dict) and isinstance(item.get("id"), str):
            return item["id"]
    return None


def main() -> int:
    parser = argparse.ArgumentParser(description="Check an LM Studio OpenAI-compatible endpoint")
    parser.add_argument("--base-url", required=True, help="Base URL, usually http://HOST:PORT/v1 or http://HOST:PORT")
    parser.add_argument("--smoke-test", action="store_true", help="Also send a tiny chat completion using the first discovered model")
    args = parser.parse_args()

    base_url = normalize_base_url(args.base_url)
    models_url = base_url + "/models"
    models_payload = request_json(models_url)
    model_id = pick_model_id(models_payload)

    result: dict[str, Any] = {
        "base_url": base_url,
        "models_url": models_url,
        "model_count": len(models_payload.get("data", [])) if isinstance(models_payload, dict) else None,
        "model_ids": [item.get("id") for item in models_payload.get("data", []) if isinstance(item, dict)] if isinstance(models_payload, dict) else [],
    }

    if args.smoke_test:
        if not model_id:
            raise CheckError("No model IDs returned from /v1/models; cannot run smoke test")
        payload = {
            "model": model_id,
            "messages": [{"role": "user", "content": "reply with exactly OK"}],
            "temperature": 0,
            "max_tokens": 8,
        }
        chat_payload = request_json(base_url + "/chat/completions", method="POST", payload=payload)
        result["smoke_test_model"] = model_id
        result["smoke_test_response"] = chat_payload

    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except CheckError as exc:
        print(json.dumps({"error": str(exc)}), file=sys.stderr)
        raise SystemExit(1)
