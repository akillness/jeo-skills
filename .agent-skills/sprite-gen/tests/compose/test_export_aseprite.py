# SPDX-License-Identifier: Apache-2.0
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

from conftest import run_script
from sprite_gen import cli
from sprite_gen.compose import export_aseprite
from sprite_gen.compose.export_aseprite import aseprite_json, split_state_jsons

ROOT = Path(__file__).resolve().parents[2]
FRAME_KEYS = {"filename", "frame", "rotated", "trimmed", "spriteSourceSize", "sourceSize", "duration"}


def _manifest() -> dict:
    return {
        "game_input": "sprite-sheet-alpha.png",
        "animation": {"rows": {
            "idle": {"fps": 8, "durations_ms": [125, 125], "loop": True},
            "walk": {"fps": 11, "durations_ms": [90, 90, 90], "loop": True},
        }},
        "frame_layout": {
            "sheetWidth": 128,
            "sheetHeight": 128,
            "cellWidth": 64,
            "cellHeight": 64,
            "rows": {
                "idle": [{"x": 0, "y": 0, "w": 64, "h": 64}, {"x": 64, "y": 0, "w": 64, "h": 64}],
                "walk": [{"x": 0, "y": 64, "w": 64, "h": 64}, {"x": 64, "y": 64, "w": 64, "h": 64}, {"x": 0, "y": 64, "w": 64, "h": 64}],
            },
        },
    }


def test_aseprite_array_preserves_geometry_tags_and_timing() -> None:
    data = aseprite_json(_manifest())
    assert all(set(frame) == FRAME_KEYS for frame in data["frames"])
    assert [frame["filename"] for frame in data["frames"]] == ["0", "1", "2", "3", "4"]
    assert [frame["duration"] for frame in data["frames"]] == [125, 125, 90, 90, 90]
    assert data["frames"][2]["frame"] == data["frames"][4]["frame"]
    assert data["meta"]["frameTags"] == [
        {"name": "idle", "from": 0, "to": 1, "direction": "forward"},
        {"name": "walk", "from": 2, "to": 4, "direction": "forward"},
    ]


def test_flame_split_uses_hashes_and_local_indices() -> None:
    documents = split_state_jsons(_manifest(), fmt="json-hash")
    assert list(documents["walk"]["frames"]) == ["0", "1", "2"]
    assert documents["walk"]["frames"]["0"]["frame"] == documents["walk"]["frames"]["2"]["frame"]
    assert {doc["meta"]["image"] for doc in documents.values()} == {"sprite-sheet-alpha.png"}


def test_manifest_mismatch_fails_loud() -> None:
    manifest = _manifest()
    del manifest["animation"]["rows"]["walk"]
    try:
        aseprite_json(manifest)
    except ValueError as exc:
        assert "disagree" in str(exc)
    else:  # pragma: no cover
        raise AssertionError("mismatched manifest exported")


def test_cli_reuses_exporter_declaration() -> None:
    _description, add_arguments, run = cli.COMMANDS["export-aseprite"]
    assert add_arguments is export_aseprite.add_arguments
    assert run is export_aseprite.run


def test_real_composed_run_exports_phaser_and_flame_shapes(fixture_run_dir: Path) -> None:
    extract = run_script("extract_sprite_row_frames.py", "--run-dir", str(fixture_run_dir))
    assert extract.returncode == 0, extract.stdout + extract.stderr
    compose = run_script("compose_sprite_atlas.py", "--run-dir", str(fixture_run_dir))
    assert compose.returncode == 0, compose.stdout + compose.stderr

    command = [sys.executable, "-m", "sprite_gen.cli", "export-aseprite", "--run-dir", str(fixture_run_dir)]
    result = subprocess.run(command, cwd=ROOT, capture_output=True, encoding="utf-8")
    assert result.returncode == 0, result.stdout + result.stderr
    exported = json.loads((fixture_run_dir / "exports" / "aseprite.json").read_text(encoding="utf-8"))
    manifest = json.loads((fixture_run_dir / "manifest.json").read_text(encoding="utf-8"))
    assert exported["meta"]["size"] == {
        "w": manifest["frame_layout"]["sheetWidth"],
        "h": manifest["frame_layout"]["sheetHeight"],
    }
    assert (fixture_run_dir / exported["meta"]["image"]).is_file()

    result = subprocess.run(command + ["--format", "json-hash", "--split-states"], cwd=ROOT, capture_output=True, encoding="utf-8")
    assert result.returncode == 0, result.stdout + result.stderr
    for state, rects in manifest["frame_layout"]["rows"].items():
        document = json.loads((fixture_run_dir / "exports" / "aseprite" / f"{state}.json").read_text(encoding="utf-8"))
        assert list(document["frames"]) == [str(index) for index in range(len(rects))]


def test_output_must_stay_inside_run_dir(fixture_run_dir: Path) -> None:
    assert export_aseprite.run(fixture_run_dir, output="../escape.json") == 1
    assert not (fixture_run_dir.parent / "escape.json").exists()


def test_output_cannot_replace_canonical_run_files_or_exports_root(fixture_run_dir: Path) -> None:
    manifest = fixture_run_dir / "manifest.json"
    before = manifest.read_bytes() if manifest.exists() else None
    assert export_aseprite.run(fixture_run_dir, output="manifest.json") == 1
    assert (manifest.read_bytes() if manifest.exists() else None) == before
    assert export_aseprite.run(fixture_run_dir, output=".", split_states=True) == 1
    assert export_aseprite.run(fixture_run_dir, output="exports", split_states=True) == 1
