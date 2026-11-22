# SPDX-License-Identifier: Apache-2.0
"""Codex state-root and rollout selection contracts."""

from __future__ import annotations

import base64
import json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pytest
from PIL import Image

from sprite_gen.gen import codex_provider
from sprite_gen.gen.base import GenRequest, verify_png


def _png_base64() -> str:
    import io

    buffer = io.BytesIO()
    Image.new("RGBA", (4, 4), (255, 0, 255, 255)).save(buffer, format="PNG")
    return base64.b64encode(buffer.getvalue()).decode("ascii")


def _write_rollout(codex_home: Path, session_id: str, *, branch: str = "03") -> Path:
    rollout = (
        codex_home
        / "sessions"
        / "2026"
        / "08"
        / branch
        / f"rollout-2026-08-{branch}T02-40-51-{session_id}.jsonl"
    )
    rollout.parent.mkdir(parents=True, exist_ok=True)
    rollout.write_text(
        json.dumps(
            {
                "payload": {
                    "type": "image_generation_end",
                    "status": "completed",
                    "result": _png_base64(),
                }
            }
        )
        + "\n",
        encoding="utf-8",
    )
    return rollout


def test_codex_home_set_empty_fails_instead_of_falling_back(monkeypatch) -> None:
    monkeypatch.setenv("CODEX_HOME", "   ")

    with pytest.raises(SystemExit, match="CODEX_HOME is set but empty"):
        codex_provider._resolve_codex_home()


def test_resolve_rollout_missing_and_duplicate_fail_loud(tmp_path: Path) -> None:
    sessions = tmp_path / "sessions"
    session_id = "018f0000-0000-7000-8000-000000000002"

    with pytest.raises(SystemExit, match="no rollout jsonl"):
        codex_provider._resolve_rollout(session_id, sessions)

    first = _write_rollout(tmp_path, session_id, branch="03")
    second = _write_rollout(tmp_path, session_id, branch="04")
    with pytest.raises(SystemExit, match="multiple rollout jsonl files") as error:
        codex_provider._resolve_rollout(session_id, sessions)
    assert str(first) in str(error.value)
    assert str(second) in str(error.value)


def test_resolve_rollout_rejects_preexisting_stale_session(tmp_path: Path) -> None:
    session_id = "018f0000-0000-7000-8000-000000000002"
    stale = _write_rollout(tmp_path, session_id)
    sessions = tmp_path / "sessions"

    with pytest.raises(SystemExit, match="pre-existing stale rollout"):
        codex_provider._resolve_rollout(session_id, sessions, preexisting={stale.resolve()})


def test_parallel_sessions_resolve_by_exact_session_id(tmp_path: Path) -> None:
    session_ids = [
        "018f0000-0000-7000-8000-000000000002",
        "018f0000-0000-7000-8000-000000000003",
        "018f0000-0000-7000-8000-000000000004",
        "018f0000-0000-7000-8000-000000000005",
    ]
    expected = {
        session_id: _write_rollout(tmp_path, session_id, branch=f"{index + 3:02d}")
        for index, session_id in enumerate(session_ids)
    }
    unrelated_stale = _write_rollout(
        tmp_path, "018f0000-0000-7000-8000-000000000006", branch="02"
    )
    sessions = tmp_path / "sessions"

    with ThreadPoolExecutor(max_workers=4) as executor:
        resolved = dict(
            zip(
                session_ids,
                executor.map(lambda session_id: codex_provider._resolve_rollout(session_id, sessions), session_ids),
                strict=True,
            )
        )

    assert resolved == expected
    assert unrelated_stale not in resolved.values()


def test_generate_reads_rollout_from_nondefault_codex_home(tmp_path: Path, monkeypatch) -> None:
    codex_home = tmp_path / "engine-account" / "codex"
    codex_home.mkdir(parents=True)
    monkeypatch.setenv("CODEX_HOME", str(codex_home))
    session_id = "018f0000-0000-7000-8000-000000000002"
    seen: dict[str, object] = {}

    class _Completed:
        returncode = 0
        stdout = json.dumps({"type": "thread.started", "thread_id": session_id}) + "\n"
        stderr = ""

    def _fake_run(cmd, **kwargs):
        seen["cmd"] = cmd
        seen["env"] = kwargs["env"]
        _write_rollout(codex_home, session_id)
        return _Completed()

    monkeypatch.setattr(codex_provider.subprocess, "run", _fake_run)
    monkeypatch.setattr(codex_provider, "codex_login", lambda: codex_provider.CodexLogin(codex_provider.AUTH_SOURCE_LOGIN))
    workdir = tmp_path / "work"
    workdir.mkdir()
    raw = workdir / "raw.png"

    result = codex_provider.CodexProvider(keep_session=True).generate(
        GenRequest(prompt="a mushroom", raw=raw), workdir
    )

    assert result.session_id == session_id
    assert verify_png(raw) > 0
    cmd = seen["cmd"]
    assert isinstance(cmd, list)
    add_dir = cmd[cmd.index("--add-dir") + 1]
    assert add_dir == str(codex_home / "generated_images")
    assert (codex_home / "generated_images").is_dir()
    assert seen["env"]["CODEX_HOME"] == str(codex_home.resolve())


def test_generate_reads_rollout_from_default_codex_home(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.delenv("CODEX_HOME", raising=False)
    monkeypatch.setattr(codex_provider.Path, "home", classmethod(lambda cls: tmp_path / "user"))
    codex_home = tmp_path / "user" / ".codex"
    codex_home.mkdir(parents=True)
    session_id = "018f0000-0000-7000-8000-000000000003"
    seen: dict[str, object] = {}

    class _Completed:
        returncode = 0
        stdout = json.dumps({"type": "thread.started", "thread_id": session_id}) + "\n"
        stderr = ""

    def _fake_run(cmd, **kwargs):
        seen["cmd"] = cmd
        seen["env"] = kwargs["env"]
        _write_rollout(codex_home, session_id)
        return _Completed()

    monkeypatch.setattr(codex_provider.subprocess, "run", _fake_run)
    monkeypatch.setattr(codex_provider, "codex_login", lambda: codex_provider.CodexLogin(codex_provider.AUTH_SOURCE_LOGIN))
    workdir = tmp_path / "work"
    workdir.mkdir()
    raw = workdir / "raw.png"

    result = codex_provider.CodexProvider(keep_session=True).generate(
        GenRequest(prompt="a mushroom", raw=raw), workdir
    )

    assert result.session_id == session_id
    assert verify_png(raw) > 0
    cmd = seen["cmd"]
    assert isinstance(cmd, list)
    assert cmd[cmd.index("--add-dir") + 1] == str(codex_home / "generated_images")
    assert "CODEX_HOME" not in seen["env"]
