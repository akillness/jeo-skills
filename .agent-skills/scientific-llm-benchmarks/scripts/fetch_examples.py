#!/usr/bin/env python3
"""Fetch a few REAL sample rows for each benchmark that has a HuggingFace
dataset, using the HuggingFace datasets-server API. Writes data/examples.json
(keyed by benchmark name). No rows are fabricated — anything not fetchable
(gated, private, server error) is simply skipped.

Usage:
    python scripts/fetch_examples.py
Env:
    HF_TOKEN  optional; lets gated datasets return rows.
"""
from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Any

import requests
import yaml

ROOT = Path(__file__).resolve().parent.parent
DATA_FILE = ROOT / "data" / "benchmarks.yaml"
OUT_FILE = ROOT / "data" / "examples.json"
BASE = "https://datasets-server.huggingface.co"
N_ROWS = 2
MAX_STR = 700


def headers() -> dict[str, str]:
    tok = os.environ.get("HF_TOKEN") or os.environ.get("HUGGING_FACE_HUB_TOKEN")
    return {"Authorization": f"Bearer {tok}"} if tok else {}


def pick_split(dataset: str, h: dict[str, str]) -> tuple[str, str] | None:
    r = requests.get(
        f"{BASE}/splits", params={"dataset": dataset}, headers=h, timeout=25
    )
    if r.status_code != 200:
        return None
    splits = r.json().get("splits", [])
    if not splits:
        return None
    # Prefer a test/validation split, else the first available.
    for pref in ("test", "validation", "dev", "eval"):
        for s in splits:
            if pref in s["split"].lower():
                return s["config"], s["split"]
    return splits[0]["config"], splits[0]["split"]


def sanitize(value: Any) -> Any:
    """Shrink a row value so examples stay small and text-only-ish."""
    if isinstance(value, str):
        return value if len(value) <= MAX_STR else value[:MAX_STR] + " …"
    if isinstance(value, dict):
        if "bytes" in value or "src" in value or "path" in value:
            return "<image/binary>"
        return {k: sanitize(v) for k, v in list(value.items())[:12]}
    if isinstance(value, list):
        return [sanitize(v) for v in value[:8]]
    return value


def fetch_rows(
    dataset: str, config: str, split: str, h: dict[str, str]
) -> list[dict[str, Any]]:
    r = requests.get(
        f"{BASE}/first-rows",
        params={"dataset": dataset, "config": config, "split": split},
        headers=h,
        timeout=30,
    )
    if r.status_code != 200:
        return []
    rows = r.json().get("rows", [])
    out = []
    for item in rows[:N_ROWS]:
        row = item.get("row", {})
        out.append({k: sanitize(v) for k, v in row.items()})
    return out


def main() -> int:
    benchmarks = yaml.safe_load(DATA_FILE.read_text(encoding="utf-8"))
    targets = [(b["name"], b["hf_dataset"]) for b in benchmarks if b.get("hf_dataset")]
    h = headers()
    print(
        f"Fetching examples for {len(targets)} datasets"
        f"{' (with HF token)' if h else ' (no token — gated will be skipped)'}…"
    )

    examples: dict[str, list] = {}
    if OUT_FILE.exists():
        examples = json.loads(OUT_FILE.read_text(encoding="utf-8"))

    ok = 0
    for name, dataset in targets:
        try:
            picked = pick_split(dataset, h)
            if not picked:
                print(f"  - {name:24} {dataset}: no split", flush=True)
                continue
            config, split = picked
            rows = fetch_rows(dataset, config, split, h)
            if rows:
                examples[name] = rows
                ok += 1
                print(
                    f"  ✓ {name:24} {dataset} [{split}] -> {len(rows)} rows", flush=True
                )
            else:
                print(f"  - {name:24} {dataset}: no rows (gated?)", flush=True)
        except requests.RequestException as exc:
            print(f"  ! {name:24} {dataset}: {exc}", flush=True)
        time.sleep(0.6)

    OUT_FILE.write_text(
        json.dumps(examples, ensure_ascii=False, indent=1) + "\n", encoding="utf-8"
    )
    print(
        f"Wrote {OUT_FILE.relative_to(ROOT)} — examples for {len(examples)} benchmarks "
        f"({ok} fetched this run)."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
