# SPDX-License-Identifier: Apache-2.0
"""A command prints UTF-8 on a stream opened in a legacy code page: a Windows console or pipe on cp949
could not encode the em dash, Korean or a path a command prints, and the command died at the print."""

import ast
import io
import os
from pathlib import Path
import subprocess
import sys

import pytest
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]


@pytest.mark.parametrize("entry", [["-m", "sprite_gen.background.tile"], ["-m", "sprite_gen.cli", "background-tile"]],
                         ids=["module", "sprite-gen"])
def test_a_command_on_a_cp949_stream_prints_its_em_dash_as_utf8(tmp_path, entry):
    source = tmp_path / "external.png"
    Image.new("RGBA", (24, 13), (32, 71, 117, 97)).save(source)
    proc = subprocess.run(
        [sys.executable, *entry, "--source", str(source), "--out", str(tmp_path / "tile.png"),
         "--period", "8", "--overlap", "3"],
        capture_output=True, timeout=20, env={**os.environ, "PYTHONIOENCODING": "cp949"},
    )
    assert proc.returncode == 0, proc.stderr.decode("utf-8", "replace")
    assert "background-tile: pass —" in proc.stdout.decode("utf-8")


def test_only_a_stream_that_is_not_utf8_is_reopened(monkeypatch):
    from sprite_gen.util import console

    legacy = io.TextIOWrapper(io.BytesIO(), encoding="cp949")
    already = io.TextIOWrapper(io.BytesIO(), encoding="UTF8", errors="surrogateescape")
    monkeypatch.setattr(sys, "stdout", legacy)
    monkeypatch.setattr(sys, "stderr", already)
    console.utf8_streams()
    assert (legacy.encoding, legacy.errors) == ("utf-8", "strict")
    assert (already.encoding, already.errors) == ("UTF8", "surrogateescape")
    plain = io.StringIO()  # no reconfigure: left as it is
    monkeypatch.setattr(sys, "stdout", plain)
    console.utf8_streams()
    assert sys.stdout is plain


def test_every_entry_reopens_its_streams_first():
    """Every `main()` of the package, the `sprite-gen` one among them, calls `utf8_streams()` first."""
    missing = []
    for path in sorted((ROOT / "sprite_gen").rglob("*.py")):
        for node in ast.parse(path.read_text(encoding="utf-8")).body:
            if not (isinstance(node, ast.FunctionDef) and node.name == "main"):
                continue
            body = node.body[1:] if ast.get_docstring(node) is not None else node.body
            call = body[0].value if body and isinstance(body[0], ast.Expr) else None
            if not (isinstance(call, ast.Call) and getattr(call.func, "id", None) == "utf8_streams"):
                missing.append(str(path.relative_to(ROOT)))
    assert not missing
