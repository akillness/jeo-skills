# SPDX-License-Identifier: Apache-2.0
"""Run the batch wiring with a real canvas and an offline video runner."""
import json
from pathlib import Path

import pytest

from sprite_gen.video import batch

FIXTURE = Path(__file__).parents[1] / "fixtures" / "facing" / "left.png"


@pytest.fixture
def offline(monkeypatch):
    monkeypatch.setattr(batch.facing_mod.vision, "grok_inspect", lambda *a, **kw: ("left", {}))
    monkeypatch.setattr(batch.frames_mod, "run_frames", lambda clip, out, **kw: {
        "fps": 24, "frames": 10, "alpha_zero_pct_min": 50, "alpha_zero_pct_max": 60,
        "keyed_dir": str(out)})
    monkeypatch.setattr(batch.loop_mod, "run_loop", lambda *a, **kw: {
        "cycle": {"length": 10, "period_global": 10, "ratio": 0.2},
        "resampled_seam_ratio": 0.2, "held_fill": {"cells": 10, "poses": 10, "held_runs": [], "made": [], "before": {"cells": 10, "poses": 10, "held_runs": []}}, "n_out": 10, "gif": {"file": "loop.gif"},
        "webp": {"file": "loop.webp"}, "strip": {"path": "strip.png"}})
    monkeypatch.setattr(batch, "_staggered_start", lambda gap: None)


# The side canvas and prompt take the facing; front and back are always canvassed facing right.
@pytest.mark.parametrize("direction,facing,options", [
    ("side", "left", {}),
    ("side", "left", {"facing_fix": "mirror"}),
    ("side", "right", {}),
    ("side", "right", {"facing_fix": "mirror"}),
    ("front", "left", {}),
], ids=["side-left", "side-left-mirror", "side-right", "side-right-mirror", "front-left"])
def test_set_facing_reaches_both_real_canvas_and_prompt(tmp_path, offline, facing, direction, options):
    prompts = []
    source_bytes = FIXTURE.read_bytes()
    def video(image, prompt, out, report, **kw):
        prompts.append(prompt)
        out.write_bytes(b"test-video")
        report.write_text(json.dumps({"prompt": prompt}))
        return 0
    result = batch.run_set(bases={direction: FIXTURE}, states=["attack"], root=tmp_path,
                           character=None, duration=3, resolution="720p", key="green",
                           concurrency=1, force=False, gap=0, facing=facing, video_runner=video, **options)
    assert result["ok"] == 1 and result["facing"] == facing
    assert FIXTURE.read_bytes() == source_bytes
    canvas = json.loads((tmp_path / f"{direction}-attack" / "canvas.report.json").read_text())
    if direction == "side":
        assert f"facing {facing}" in prompts[0]
        assert result["items"][0]["facing"]["action"] == ("mirror" if facing == "right" and options else "none")
        if not options:
            assert (tmp_path / "side.facing.png").read_bytes() == source_bytes
            assert result["items"][0]["facing"]["final_direction_source"] == "observation"
        behind = round(canvas["canvas"][0] * canvas["trail"])
        assert canvas["facing"] == facing
        assert canvas["offset"][0] == (behind if facing == "right" else canvas["canvas"][0] - canvas["still"][0] - behind)
    else:
        assert "facing" not in result["items"][0]
        assert prompts[0] == batch.build_prompt(direction, "attack", None, facing="right")
        assert canvas["facing"] == "right"
        assert canvas["offset"][0] == round(canvas["canvas"][0] * canvas["trail"])


def test_changed_facing_cannot_reuse_an_opposite_prompt_clip(tmp_path, offline, monkeypatch):
    calls = []
    def video(image, prompt, out, report, **kw):
        calls.append(1)
        out.write_bytes(b"cached")
        report.write_text(json.dumps({"prompt": prompt}))
        return 0
    options = dict(item="side-attack", direction="side", state="attack", base=FIXTURE,
                   root=tmp_path, character=None, duration=3, resolution="720p", key="green",
                   force=False, gap=0, video_runner=video)
    result = batch.run_item(**options)
    assert result["ok"]
    item = tmp_path / "side-attack"
    previous_canvas = (item / "canvas.png").read_bytes()
    def no_vision(*a, **kw):
        pytest.fail("cached clip must not trigger another inspection")
    monkeypatch.setattr(batch.facing_mod.vision, "grok_inspect", no_vision)
    result = batch.run_item(**options, facing="left")
    assert not result["ok"] and "--force" in result["error"]
    assert (item / "canvas.png").read_bytes() == previous_canvas
    result = batch.run_item(**options)
    assert result["ok"] and result["clip"]["reused"] and len(calls) == 1
    result = batch.run_item(**options, facing_fix="mirror")
    assert not result["ok"] and "--force" in result["error"]


def test_cli_threads_facing_into_set(monkeypatch, tmp_path):
    seen = []
    def run_set(**kw):
        seen.append(kw)
        return {"failed": []}
    monkeypatch.setattr(batch, "run_set", run_set)
    assert batch.main(["--base", f"side={FIXTURE}", "--states", "attack", "--out-dir", str(tmp_path),
                       "--facing", "left"]) == 0
    assert seen[0]["facing"] == "left" and seen[0]["facing_fix"] == "none"


def test_parallel_states_share_one_inspection_of_the_side_still(tmp_path, offline, monkeypatch):
    calls = []
    def inspect(*a, **kw):
        calls.append(1)
        return "left", {}
    monkeypatch.setattr(batch.facing_mod.vision, "grok_inspect", inspect)
    def video(image, prompt, out, report, **kw):
        out.write_bytes(b"test-video")
        report.write_text(json.dumps({"prompt": prompt}))
        return 0
    source = FIXTURE.with_name("right.png")
    result = batch.run_set(bases={"side": source}, states=["idle", "attack", "walk"], root=tmp_path,
                           character=None, duration=3, resolution="720p", key="green",
                           concurrency=3, force=False, gap=0, video_runner=video)
    assert result["ok"] == 3 and len(calls) == 1
    assert len({item["facing"]["out"] for item in result["items"]}) == 1
    assert (tmp_path / "side.facing.png").read_bytes() == source.read_bytes()
    assert all(item["facing"]["action"] == "none" and item["facing"]["requested"] == "right"
               for item in result["items"])
    assert result["facing_fix"] == "none"


def test_tool_defaults_to_record_only(monkeypatch, tmp_path):
    seen = []
    def run_set(**kwargs):
        seen.append(kwargs)
        return {"failed": []}
    monkeypatch.setattr(batch, "run_set", run_set)
    assert batch.run(base=[f"side={FIXTURE}"], out_dir=tmp_path) == 0
    assert seen[0]["facing_fix"] == "none"
