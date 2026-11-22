# SPDX-License-Identifier: Apache-2.0
"""Cross-process and shared-mode contracts for the publish reader/writer lock."""

from __future__ import annotations

import json
import subprocess
import sys
import threading
import time
from pathlib import Path

import pytest

from sprite_gen.spec import runio

_TIMEOUT = 30.0
_CHILD = """
import json, sys, time
from pathlib import Path
from sprite_gen.spec import runio
run, mode, hold = Path(sys.argv[1]), sys.argv[2], float(sys.argv[3])
guard = runio.read_guard if mode == "read" else runio.publish_guard
print(json.dumps({"phase": "start", "at": time.time()}), flush=True)
with guard(run):
    print(json.dumps({"phase": "acquired", "at": time.time()}), flush=True)
    time.sleep(hold)
print(json.dumps({"phase": "released", "at": time.time()}), flush=True)
"""


class ChildGuard:
    def __init__(self, run_dir: Path, mode: str, hold: float) -> None:
        self.events: list[dict] = []
        self.process = subprocess.Popen(
            [sys.executable, "-c", _CHILD, str(run_dir), mode, str(hold)],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            encoding="utf-8",
        )
        self.thread = threading.Thread(target=self._drain, daemon=True)
        self.thread.start()

    def _drain(self) -> None:
        assert self.process.stdout is not None
        for line in self.process.stdout:
            self.events.append(json.loads(line))

    def at(self, phase: str) -> float | None:
        return next((event["at"] for event in self.events if event["phase"] == phase), None)

    def wait_for(self, phase: str) -> float:
        deadline = time.monotonic() + _TIMEOUT
        while time.monotonic() < deadline:
            value = self.at(phase)
            if value is not None:
                return value
            if self.process.poll() is not None:
                self.thread.join(1)
                if self.at(phase) is None:
                    assert self.process.stderr is not None
                    raise AssertionError(
                        f"child exited {self.process.returncode} before {phase}:\n"
                        f"{self.process.stderr.read()}"
                    )
            time.sleep(0.01)
        raise AssertionError(f"child did not reach {phase} within {_TIMEOUT}s")

    def finish(self) -> None:
        try:
            self.process.wait(timeout=_TIMEOUT)
        finally:
            if self.process.poll() is None:  # pragma: no cover - hung regression
                self.process.kill()
            self.thread.join(2)


@pytest.fixture
def run_dir(tmp_path: Path) -> Path:
    path = tmp_path / "run"
    path.mkdir()
    return path


def test_reader_process_blocks_until_publish_releases(run_dir: Path) -> None:
    child = ChildGuard(run_dir, "read", 0)
    try:
        with runio.publish_guard(run_dir):
            child.wait_for("start")
            time.sleep(0.5)
            assert child.at("acquired") is None
            released = time.time()
        assert child.wait_for("acquired") >= released
    finally:
        child.finish()


@pytest.mark.slow
def test_two_process_readers_hold_shared_lock_concurrently(run_dir: Path) -> None:
    hold = 2.0
    child = ChildGuard(run_dir, "read", hold)
    try:
        child.wait_for("acquired")
        started = time.monotonic()
        with runio.read_guard(run_dir):
            waited = time.monotonic() - started
            assert child.at("released") is None
            assert waited < hold / 2
    finally:
        child.finish()
