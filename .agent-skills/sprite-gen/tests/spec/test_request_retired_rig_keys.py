# SPDX-License-Identifier: Apache-2.0
"""layer-tracks 의 요청 키(`rig`, `layers`, `states.<state>.track`)는 v3.0.0 에서 은퇴했다.

`compose-layers` 와 그 선언 검사가 빠지면서 이 셋을 읽는 코드가 없어졌다. 옛 런 파일에는 남아
있을 수 있어서 은퇴한 fit 키와 같은 길을 탄다(`test_pixel_unfake_migration.py`): 읽기는 메모리
에서 떼고 한 번 알리며 파일은 그대로 두고, 스키마와 무관한 편집은 디스크의 키를 되돌려 쓰고,
파일에서 걷어 내는 것은 `sprite-gen migrate-request --apply` 하나다. 새 런의 `prepare` 는 셋을
싣지 않고 버림 알림에 이름을 댄다.
"""

from __future__ import annotations

import json
from pathlib import Path

from sprite_gen.spec.runio import REQUEST_FILENAME, load_request, write_request

RIG = {"profile": "humanoid_biped", "landmarks": {"walk": {"0": {"hand_r": [40, 50]}}}}
LAYERS = {"walk_with_can": {"stack": [{"state": "walk"}, {"state": "can"}]}}


def _write_old_rig_run(run_dir: Path) -> None:
    run_dir.mkdir(parents=True, exist_ok=True)
    (run_dir / REQUEST_FILENAME).write_text(json.dumps({
        "version": 1, "kind": "sprite-gen-request", "engine": "component-row",
        "character": {"id": "rigbot", "description": "", "base_image": None},
        "cell": {"shape": "square", "width": 96, "height": 96, "safe_margin_x": 8,
                 "safe_margin_y": 8, "size": 96, "safe_margin": 8},
        "chroma_key": {"name": "magenta", "hex": "#FF00FF", "rgb": [255, 0, 255],
                       "selection": "fallback"},
        "states": {"walk": {"frames": 2, "fps": 8, "loop": True, "action": "x", "track": "base"},
                   "can": {"frames": 2, "fps": 8, "loop": True, "action": "y",
                           "track": "action_overlay"}},
        "rig": RIG,
        "layers": LAYERS,
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _on_disk(run_dir: Path) -> dict:
    return json.loads((run_dir / REQUEST_FILENAME).read_text(encoding="utf-8"))


def test_an_old_rig_run_reads_without_its_rig_keys_and_says_so_once(tmp_path, capsys) -> None:
    run_dir = tmp_path / "run"
    _write_old_rig_run(run_dir)
    before = (run_dir / REQUEST_FILENAME).read_bytes()

    request = load_request(run_dir)
    assert "rig" not in request and "layers" not in request
    assert all("track" not in entry for entry in request["states"].values())
    assert request["states"]["walk"]["fps"] == 8
    err = capsys.readouterr().err
    for name in ("rig (not read)", "layers (not read)", "states.walk.track (not read)",
                 "states.can.track (not read)", f"migrate-request {run_dir} --apply"):
        assert name in err

    load_request(run_dir)
    assert capsys.readouterr().err == ""
    assert (run_dir / REQUEST_FILENAME).read_bytes() == before


def test_migrate_request_takes_the_rig_keys_out_of_the_file(tmp_path, capsys) -> None:
    from sprite_gen.cli import main

    run_dir = tmp_path / "run"
    _write_old_rig_run(run_dir)
    before = (run_dir / REQUEST_FILENAME).read_bytes()

    assert main(["migrate-request", str(run_dir)]) == 0
    out = capsys.readouterr().out
    assert "rig (not read)" in out and "states.can.track (not read)" in out and "dry-run" in out
    assert (run_dir / REQUEST_FILENAME).read_bytes() == before

    assert main(["migrate-request", str(run_dir), "--apply"]) == 0
    on_disk = _on_disk(run_dir)
    assert "rig" not in on_disk and "layers" not in on_disk
    assert on_disk["states"] == {
        "walk": {"frames": 2, "fps": 8, "loop": True, "action": "x"},
        "can": {"frames": 2, "fps": 8, "loop": True, "action": "y"}}
    assert on_disk["character"]["id"] == "rigbot"

    capsys.readouterr()
    assert main(["migrate-request", str(run_dir), "--apply"]) == 0
    assert "옮길 것이 없다" in capsys.readouterr().out
    load_request(run_dir)
    assert capsys.readouterr().err == ""


def test_an_unrelated_edit_writes_the_rig_keys_back_as_they_were(tmp_path) -> None:
    run_dir = tmp_path / "run"
    _write_old_rig_run(run_dir)

    request = load_request(run_dir)
    request["states"]["walk"]["fps"] = 12
    write_request(run_dir, request)

    on_disk = _on_disk(run_dir)
    assert on_disk["states"]["walk"] == {"frames": 2, "fps": 12, "loop": True, "action": "x",
                                         "track": "base"}
    assert on_disk["states"]["can"]["track"] == "action_overlay"
    assert on_disk["rig"] == RIG and on_disk["layers"] == LAYERS
    assert "rig" not in request and "track" not in request["states"]["walk"]


def test_prepare_drops_the_rig_keys_by_name() -> None:
    from sprite_gen.gen.prepare import dropped_key_notes

    notes = dropped_key_notes({
        "cell": {"size": 64}, "rig": RIG, "layers": LAYERS,
        "states": {"walk": {"frames": 2, "track": "base"}}})
    assert any("['layers', 'rig']" in note for note in notes)
    assert any("states.walk key(s) ['track']" in note for note in notes)
